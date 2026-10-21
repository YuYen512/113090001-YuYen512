//! 環境：荒廢核電廠周邊的廢墟。
//!
//!   - 荒蕪的地面，有些地方長著一叢叢乾草，有些地方完全光禿
//!   - 半崩塌的建築：殘牆、窗洞、塌落的樓板、瓦礫，牆上長苔蘚、牆頂垂下爬藤
//!   - 廢棄工廠：鏽蝕廠房、塌了一半的鋸齒屋頂、斷頂的煙囪
//!   - 遠方兩座冷卻塔的剪影
//!   - 歪斜破損的鐵絲網、刺鐵絲，網上掛著輻射警告牌
//!
//! 座標：y 朝上，地面大約在 y = -3。生物從原點附近出發。
//! 位置、大小都集中在 EnvironmentConfig，想調整場景佈置改那裡就好。
//!
//! 給檢視器的資料（材質 "env"）：
//!   顏色 = 底色；uv.x = 長苔蘚的程度（0~1）；uv.y = 表面種類；權重 = 被風吹動的程度
//!   表面種類：0 地面、1 混凝土、2 鏽鐵、3 植物、4 冷卻塔混凝土（有雨水痕）

use crate::hyphae::Rng;
use crate::math::Vec3;
use crate::mesh::Mesh;
use std::f32::consts::PI;

const KIND_GROUND: f32 = 0.0;
const KIND_CONCRETE: f32 = 1.0;
const KIND_METAL: f32 = 2.0;
const KIND_PLANT: f32 = 3.0;
const KIND_TOWER: f32 = 4.0;

/// 一棟半崩塌的建築
pub struct Ruin {
    pub x: f32,
    pub z: f32,
    pub width: f32,
    pub depth: f32,
    pub floors: usize,
    /// 朝向（度）
    pub yaw_deg: f32,
    /// 塌得比較嚴重的那一側：-1 左、1 右
    pub collapse_side: f32,
}

/// 一段鐵絲網（從 a 到 b）
pub struct FenceLine {
    pub a: (f32, f32),
    pub b: (f32, f32),
}

pub struct EnvironmentConfig {
    pub seed: u64,
    pub ground_y: f32,
    /// 原點附近保持平坦的半徑（生物起飛的地方）
    pub flat_radius: f32,
    pub ground_size: f32,
    pub ruins: Vec<Ruin>,
    /// 工廠位置與朝向
    pub factory: (f32, f32, f32),
    /// 冷卻塔位置
    pub towers: Vec<(f32, f32)>,
    pub fences: Vec<FenceLine>,
    /// 草叢的多寡（0~1）
    pub grass_density: f32,
    pub max_grass_blades: usize,
    /// 地上零散瓦礫的數量
    pub rubble_count: usize,
}

impl Default for EnvironmentConfig {
    fn default() -> Self {
        EnvironmentConfig {
            seed: 1986,
            ground_y: -3.0,
            flat_radius: 14.0,
            ground_size: 420.0,
            ruins: vec![
                Ruin { x: -22.0, z: -24.0, width: 26.0, depth: 16.0, floors: 3, yaw_deg: 12.0, collapse_side: 1.0 },
                Ruin { x: 20.0, z: -34.0, width: 18.0, depth: 14.0, floors: 2, yaw_deg: -20.0, collapse_side: -1.0 },
                Ruin { x: -40.0, z: 14.0, width: 20.0, depth: 18.0, floors: 2, yaw_deg: 75.0, collapse_side: 1.0 },
                Ruin { x: 34.0, z: 18.0, width: 22.0, depth: 14.0, floors: 3, yaw_deg: -60.0, collapse_side: -1.0 },
            ],
            factory: (-6.0, -66.0, 6.0),
            towers: vec![(-75.0, -125.0), (-22.0, -140.0)],
            fences: vec![
                FenceLine { a: (-48.0, -11.0), b: (-6.0, -13.0) },
                FenceLine { a: (5.0, -13.5), b: (46.0, -9.0) },
                FenceLine { a: (46.0, -9.0), b: (52.0, 30.0) },
                FenceLine { a: (-14.0, 26.0), b: (20.0, 34.0) },
            ],
            grass_density: 0.75,
            max_grass_blades: 7000,
            rubble_count: 160,
        }
    }
}

/// 碰撞用的方塊（任意方向）
pub struct BoxCollider {
    pub center: Vec3,
    pub axes: [Vec3; 3],
    pub half: [f32; 3],
}

/// 碰撞用的圓柱（煙囪是實心的；冷卻塔是中空的殼，可以從頂端飛進去）
pub struct CylCollider {
    pub base: Vec3,
    pub height: f32,
    /// 從底到頂平均取樣的半徑
    pub radii: Vec<f32>,
    pub shell: bool,
}

/// 會擋住生物的東西：畫出來的網格 + 簡化的碰撞形狀
pub struct Solid {
    pub mesh: Mesh,
    pub boxes: Vec<BoxCollider>,
    pub cyls: Vec<CylCollider>,
}

/// 畫一個方塊，並把它記成碰撞形狀
fn solid_box(solid: &mut Solid, center: Vec3, axes: [Vec3; 3], half: [f32; 3], s: &Surface) {
    add_obox(&mut solid.mesh, center, axes, half, s);
    solid.boxes.push(BoxCollider { center, axes, half });
}

/// 畫一根柱子，並把它記成碰撞形狀
fn solid_beam(solid: &mut Solid, a: Vec3, b: Vec3, thickness: f32, s: &Surface) {
    add_beam(&mut solid.mesh, a, b, thickness, s);
    let d = b - a;
    let len = d.length();
    if len < 1e-4 {
        return;
    }
    let ax = d * (1.0 / len);
    let helper = if ax.y.abs() < 0.9 { Vec3::new(0.0, 1.0, 0.0) } else { Vec3::new(1.0, 0.0, 0.0) };
    let ay = ax.cross(helper).normalize_or(Vec3::new(0.0, 0.0, 1.0));
    let az = ax.cross(ay);
    solid.boxes.push(BoxCollider { center: (a + b) * 0.5, axes: [ax, ay, az], half: [len * 0.5, thickness * 0.5, thickness * 0.5] });
}

pub const GROUND_GRID: usize = 110;

pub struct Environment {
    /// 地面
    pub ground: Mesh,
    /// 建築、瓦礫、柱子、刺鐵絲、煙囪、冷卻塔（含碰撞形狀）
    pub structures: Solid,
    /// 草和爬藤
    pub plants: Mesh,
    /// 鐵絲網的網面
    pub fence: Mesh,
    /// 警告牌
    pub signs: Mesh,
}

// ---------------------------------------------------------------------
//  雜訊
// ---------------------------------------------------------------------

fn hash2(x: i32, z: i32, seed: u32) -> f32 {
    let mut h = (x as u32).wrapping_mul(374761393) ^ (z as u32).wrapping_mul(668265263) ^ seed.wrapping_mul(2246822519);
    h = (h ^ (h >> 13)).wrapping_mul(1274126177);
    h ^= h >> 16;
    (h & 0xffffff) as f32 / 0xffffff as f32
}

fn value_noise(x: f32, z: f32, seed: u32) -> f32 {
    let (xi, zi) = (x.floor() as i32, z.floor() as i32);
    let (fx, fz) = (x - x.floor(), z - z.floor());
    let s = |t: f32| t * t * (3.0 - 2.0 * t);
    let (u, v) = (s(fx), s(fz));
    let a = hash2(xi, zi, seed);
    let b = hash2(xi + 1, zi, seed);
    let c = hash2(xi, zi + 1, seed);
    let d = hash2(xi + 1, zi + 1, seed);
    a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

/// 分形雜訊（0~1）
fn fbm(x: f32, z: f32, seed: u32) -> f32 {
    let (mut sum, mut amp, mut freq, mut norm) = (0.0, 0.5, 1.0, 0.0);
    for o in 0..4 {
        sum += value_noise(x * freq, z * freq, seed + o) * amp;
        norm += amp;
        amp *= 0.5;
        freq *= 2.03;
    }
    sum / norm
}

fn smoothstep(a: f32, b: f32, x: f32) -> f32 {
    let t = ((x - a) / (b - a)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

fn mix3(a: [f32; 3], b: [f32; 3], t: f32) -> [f32; 3] {
    [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

fn scale3(c: [f32; 3], k: f32) -> [f32; 3] {
    [c[0] * k, c[1] * k, c[2] * k]
}

/// 地面高度：原點附近平坦，往外慢慢起伏
pub fn ground_height(cfg: &EnvironmentConfig, x: f32, z: f32) -> f32 {
    let seed = cfg.seed as u32;
    let r = (x * x + z * z).sqrt();
    let rough = smoothstep(cfg.flat_radius, cfg.flat_radius * 2.2, r);
    let hills = (fbm(x * 0.025, z * 0.025, seed) - 0.45) * 3.2;
    let bumps = (fbm(x * 0.15, z * 0.15, seed + 7) - 0.5) * 0.35;
    cfg.ground_y + rough * (hills + bumps)
}

// ---------------------------------------------------------------------
//  基本形狀
// ---------------------------------------------------------------------

struct Surface {
    color: [f32; 3],
    moss: f32,
    kind: f32,
}

/// 一個方向可以任意的方塊。axes = 三個互相垂直的單位向量，half = 三個方向的半長。
fn add_obox(m: &mut Mesh, center: Vec3, axes: [Vec3; 3], half: [f32; 3], s: &Surface) {
    for i in 0..3 {
        let (j, k) = ((i + 1) % 3, (i + 2) % 3);
        for sign in [-1.0f32, 1.0] {
            let n = axes[i] * sign;
            let c = center + n * half[i];
            let (aj, ak) = (axes[j] * half[j], axes[k] * half[k]);
            let corners = [c - aj - ak, c + aj - ak, c + aj + ak, c - aj + ak];
            let base = m.positions.len() as u32;
            for p in corners {
                m.add_vertex_full(p, n, [s.moss, s.kind], 0.0, s.color);
            }
            m.add_tri(base, base + 1, base + 2);
            m.add_tri(base, base + 2, base + 3);
        }
    }
}

/// 繞 y 軸旋轉後再稍微傾斜的方塊座標軸
fn axes_yaw_tilt(yaw: f32, tilt_x: f32, tilt_z: f32) -> [Vec3; 3] {
    let rot = |v: Vec3| -> Vec3 {
        // 先繞 x 傾斜、再繞 z 傾斜、最後繞 y 轉向
        let (cx, sx) = (tilt_x.cos(), tilt_x.sin());
        let v = Vec3::new(v.x, v.y * cx - v.z * sx, v.y * sx + v.z * cx);
        let (cz, sz) = (tilt_z.cos(), tilt_z.sin());
        let v = Vec3::new(v.x * cz - v.y * sz, v.x * sz + v.y * cz, v.z);
        let (cy, sy) = (yaw.cos(), yaw.sin());
        Vec3::new(v.x * cy + v.z * sy, v.y, -v.x * sy + v.z * cy)
    };
    [rot(Vec3::new(1.0, 0.0, 0.0)), rot(Vec3::new(0.0, 1.0, 0.0)), rot(Vec3::new(0.0, 0.0, 1.0))]
}

/// 兩點之間的細長方塊（柱子、鐵絲、管子）
fn add_beam(m: &mut Mesh, a: Vec3, b: Vec3, thickness: f32, s: &Surface) {
    let d = b - a;
    let len = d.length();
    if len < 1e-4 {
        return;
    }
    let ax = d * (1.0 / len);
    let helper = if ax.y.abs() < 0.9 { Vec3::new(0.0, 1.0, 0.0) } else { Vec3::new(1.0, 0.0, 0.0) };
    let ay = ax.cross(helper).normalize_or(Vec3::new(0.0, 0.0, 1.0));
    let az = ax.cross(ay);
    add_obox(m, (a + b) * 0.5, [ax, ay, az], [len * 0.5, thickness * 0.5, thickness * 0.5], s);
}

/// 一個四邊形（兩面都看得到，由檢視器處理）
fn add_quad(m: &mut Mesh, p: [Vec3; 4], n: Vec3, uv: [[f32; 2]; 4], w: [f32; 4], c: [f32; 3]) {
    let base = m.positions.len() as u32;
    for i in 0..4 {
        m.add_vertex_full(p[i], n, uv[i], w[i], c);
    }
    m.add_tri(base, base + 1, base + 2);
    m.add_tri(base, base + 2, base + 3);
}

/// 旋轉體（煙囪、冷卻塔）。radius(t, angle) 回傳半徑，top(angle) 回傳頂端高度比例（0~1），做出斷裂的頂。
fn add_lathe(
    m: &mut Mesh,
    base: Vec3,
    height: f32,
    rings: usize,
    segs: usize,
    radius: impl Fn(f32) -> f32,
    top: impl Fn(f32) -> f32,
    s: &Surface,
) {
    let start = m.positions.len() as u32;
    for i in 0..=rings {
        let t0 = i as f32 / rings as f32;
        for j in 0..=segs {
            let a = 2.0 * PI * j as f32 / segs as f32;
            let t = t0 * top(a);
            let r = radius(t);
            let dr = (radius((t + 0.01).min(1.0)) - radius((t - 0.01).max(0.0))) / (0.02 * height);
            let n = Vec3::new(a.cos(), -dr, a.sin()).normalize_or(Vec3::new(a.cos(), 0.0, a.sin()));
            let p = base + Vec3::new(a.cos() * r, t * height, a.sin() * r);
            m.add_vertex_full(p, n, [s.moss, s.kind], 0.0, s.color);
        }
    }
    let row = (segs + 1) as u32;
    for i in 0..rings as u32 {
        for j in 0..segs as u32 {
            let a = start + i * row + j;
            let b = a + 1;
            let c = a + row + 1;
            let d = a + row;
            m.add_tri(a, b, c);
            m.add_tri(a, c, d);
        }
    }
}

// ---------------------------------------------------------------------
//  地面
// ---------------------------------------------------------------------

fn build_ground(cfg: &EnvironmentConfig) -> Mesh {
    let mut m = Mesh::new();
    let seed = cfg.seed as u32;
    let n = GROUND_GRID;
    let size = cfg.ground_size;
    let step = size / n as f32;
    let h = |x: f32, z: f32| ground_height(cfg, x, z);

    let dirt = [0.21, 0.185, 0.15];
    let gravel = [0.26, 0.255, 0.24];
    let dark = [0.12, 0.11, 0.095];
    let dry_green = [0.21, 0.22, 0.13];

    for i in 0..=n {
        for j in 0..=n {
            let x = -size * 0.5 + i as f32 * step;
            let z = -size * 0.5 + j as f32 * step;
            let y = h(x, z);
            let e = 0.5;
            let nx = h(x - e, z) - h(x + e, z);
            let nz = h(x, z - e) - h(x, z + e);
            let normal = Vec3::new(nx, 2.0 * e, nz).normalize_or(Vec3::new(0.0, 1.0, 0.0));

            let a = fbm(x * 0.05, z * 0.05, seed + 11);
            let b = fbm(x * 0.2, z * 0.2, seed + 12);
            let grass = fbm(x * 0.08 + 5.0, z * 0.08, seed + 13);
            let mut c = mix3(dirt, gravel, smoothstep(0.4, 0.7, a));
            c = mix3(c, dark, smoothstep(0.55, 0.8, b) * 0.7);
            c = mix3(c, dry_green, smoothstep(0.5, 0.75, grass) * 0.6);
            m.add_vertex_full(Vec3::new(x, y, z), normal, [0.0, KIND_GROUND], 0.0, c);
        }
    }
    let row = (n + 1) as u32;
    for i in 0..n as u32 {
        for j in 0..n as u32 {
            let a = i * row + j;
            m.add_tri(a, a + row, a + row + 1);
            m.add_tri(a, a + row + 1, a + 1);
        }
    }
    m
}

// ---------------------------------------------------------------------
//  草叢：有的地方一叢叢，有的地方完全光禿
// ---------------------------------------------------------------------

fn build_grass(cfg: &EnvironmentConfig, rng: &mut Rng, m: &mut Mesh) {
    let seed = cfg.seed as u32;
    let mut blades = 0;
    let spacing = 1.1;
    let reach = 85.0;
    let cells = (reach * 2.0 / spacing) as i32;
    let up = Vec3::new(0.0, 1.0, 0.0);

    for ix in 0..cells {
        for iz in 0..cells {
            let x = -reach + ix as f32 * spacing + rng.range(-0.5, 0.5);
            let z = -reach + iz as f32 * spacing + rng.range(-0.5, 0.5);
            let patch = fbm(x * 0.08 + 5.0, z * 0.08, seed + 13);
            let roll = rng.next_f32();
            if patch < 0.56 || roll > cfg.grass_density * smoothstep(0.56, 0.7, patch) {
                continue;
            }
            let tuft = 3 + (rng.next_f32() * 5.0) as usize;
            let tall = 0.5 + 1.2 * smoothstep(0.56, 0.8, patch);
            for _ in 0..tuft {
                if blades >= cfg.max_grass_blades {
                    return;
                }
                blades += 1;
                let bx = x + rng.range(-0.35, 0.35);
                let bz = z + rng.range(-0.35, 0.35);
                let by = ground_height(cfg, bx, bz) - 0.05;
                let yaw = rng.range(0.0, 2.0 * PI);
                let width = rng.range(0.07, 0.13);
                let height = tall * rng.range(0.55, 1.25);
                let lean = rng.range(0.05, 0.45) * height;
                let lean_dir = rng.range(0.0, 2.0 * PI);
                let side = Vec3::new(yaw.cos(), 0.0, yaw.sin()) * (width * 0.5);
                let base = Vec3::new(bx, by, bz);
                let tip = base + Vec3::new(lean_dir.cos() * lean, height, lean_dir.sin() * lean);
                let face = side.cross(tip - base).normalize_or(up);
                let n = (face * 0.35 + up * 0.65).normalize_or(up);
                let tone = rng.range(0.7, 1.15);
                let base_c = scale3(mix3([0.2, 0.22, 0.09], [0.3, 0.27, 0.12], rng.next_f32()), tone);
                let tip_c = scale3(mix3([0.36, 0.34, 0.16], [0.42, 0.37, 0.2], rng.next_f32()), tone);
                let i0 = m.add_vertex_full(base - side, n, [0.0, KIND_PLANT], 0.0, base_c);
                let i1 = m.add_vertex_full(base + side, n, [0.0, KIND_PLANT], 0.0, base_c);
                let i2 = m.add_vertex_full(tip, n, [0.0, KIND_PLANT], height * 0.18, tip_c);
                m.add_tri(i0, i1, i2);
            }
        }
    }
}

// ---------------------------------------------------------------------
//  爬藤：從牆頂垂下，帶著葉子
// ---------------------------------------------------------------------

fn add_vine(m: &mut Mesh, rng: &mut Rng, top: Vec3, outward: Vec3, along: Vec3, length: f32) {
    let seg = 0.55;
    let steps = (length / seg).ceil() as usize;
    let mut p = top;
    let wiggle_phase = rng.range(0.0, 6.28);
    let stem_c = [0.17, 0.21, 0.1];
    for i in 0..steps {
        let t = i as f32 / steps as f32;
        let sway = 0.05 + 0.25 * t;
        let next = top
            + Vec3::new(0.0, -seg * (i + 1) as f32, 0.0)
            + along * ((wiggle_phase + i as f32 * 0.7).sin() * 0.18)
            + outward * (0.04 + 0.05 * t);
        // 莖：朝外的細帶子
        let w = 0.05;
        let side = along * w;
        add_quad(
            m,
            [p - side, p + side, next + side, next - side],
            outward,
            [[0.0, KIND_PLANT]; 4],
            [sway, sway, sway + 0.03, sway + 0.03],
            stem_c,
        );
        // 葉子：菱形小片，往外斜
        let leaves = 1 + (rng.next_f32() * 2.5) as usize;
        for _ in 0..leaves {
            let at = p + (next - p) * rng.next_f32();
            let dir = (along * rng.range(-1.0, 1.0) + outward * rng.range(0.4, 1.0) + Vec3::new(0.0, rng.range(-0.6, 0.2), 0.0))
                .normalize_or(outward);
            let size = rng.range(0.18, 0.34);
            let perp = dir.cross(Vec3::new(0.0, 1.0, 0.0)).normalize_or(along) * (size * 0.4);
            let tip = at + dir * size;
            let mid = at + dir * (size * 0.45);
            let n = (outward + Vec3::new(0.0, 0.4, 0.0)).normalize_or(outward);
            let c = scale3(mix3([0.14, 0.24, 0.08], [0.24, 0.32, 0.12], rng.next_f32()), rng.range(0.75, 1.2));
            add_quad(m, [at, mid - perp, tip, mid + perp], n, [[0.0, KIND_PLANT]; 4], [sway; 4], c);
        }
        p = next;
    }
}

// ---------------------------------------------------------------------
//  半崩塌的建築
// ---------------------------------------------------------------------

fn build_ruin(cfg: &EnvironmentConfig, r: &Ruin, rng: &mut Rng, solid: &mut Solid, plants: &mut Mesh) {
    let seed = cfg.seed as u32;
    let cell = 2.4;
    let rows_per_floor = 3;
    let rows = r.floors * rows_per_floor;
    let thick = 0.7;
    let yaw = r.yaw_deg.to_radians();
    let ax = axes_yaw_tilt(yaw, 0.0, 0.0);
    let center = Vec3::new(r.x, ground_height(cfg, r.x, r.z) - 0.3, r.z);
    let local = |x: f32, y: f32, z: f32| center + ax[0] * x + ax[1] * y + ax[2] * z;

    // 四面牆：(牆中心的局部座標, 沿牆方向, 朝外方向, 長度)
    let hw = r.width * 0.5;
    let hd = r.depth * 0.5;
    let walls: [(f32, f32, usize, f32, f32); 4] = [
        // (起點 x, 起點 z, 沿哪個軸 0=x 2=z, 朝外符號, 長度)
        (-hw, hd, 0, 1.0, r.width),
        (-hw, -hd, 0, -1.0, r.width),
        (hw, -hd, 2, 1.0, r.depth),
        (-hw, -hd, 2, -1.0, r.depth),
    ];

    for (wi, &(sx, sz, axis, out_sign, len)) in walls.iter().enumerate() {
        let cols = (len / cell).round().max(2.0) as usize;
        let cw = len / cols as f32;
        let along = ax[axis];
        let outward = if axis == 0 { ax[2] * out_sign } else { ax[0] * out_sign };
        let wall_start = local(sx, 0.0, sz);

        // 每一欄還剩多高（塌的那一側比較矮，再加上隨機的斷裂）
        let tops: Vec<usize> = (0..cols)
            .map(|c| {
                let u = (c as f32 + 0.5) / cols as f32;
                // 牆的位置對應到建築的哪一側
                let side_pos = if axis == 0 { -1.0 + 2.0 * u } else { out_sign };
                let collapse = smoothstep(-0.2, 1.0, side_pos * r.collapse_side);
                let noise = value_noise(c as f32 * 0.7, wi as f32 * 3.1, seed + 21);
                let h = rows as f32 * (1.0 - 0.75 * collapse) * (0.7 + 0.45 * noise);
                (h.round() as usize).clamp(1, rows)
            })
            .collect();

        for row in 0..rows {
            // 這一列哪些格子還在
            let present: Vec<bool> = (0..cols)
                .map(|c| {
                    // 每一欄最上面那一格另外處理（做成參差不齊的斷口）
                    if row + 1 >= tops[c] {
                        return false;
                    }
                    let in_floor = row % rows_per_floor;
                    let window = in_floor == 1 && c % 3 == 1 && c > 0 && c + 1 < cols;
                    let hole = rng.next_f32() < 0.05 + 0.08 * (row as f32 / rows as f32);
                    !(window || hole)
                })
                .collect();

            // 連續的格子合併成一塊，減少方塊數量
            let mut c = 0;
            while c < cols {
                if !present[c] {
                    c += 1;
                    continue;
                }
                let start = c;
                while c < cols && present[c] {
                    c += 1;
                }
                let run = (c - start) as f32;
                let mid_along = (start as f32 + run * 0.5) * cw;
                let y = (row as f32 + 0.5) * cell;
                let pos = wall_start + along * mid_along + ax[1] * y;
                let tone = rng.range(0.82, 1.1);
                let surf = Surface {
                    color: scale3([0.36, 0.35, 0.32], tone),
                    moss: 0.3 + 0.55 * (1.0 - row as f32 / rows as f32),
                    kind: KIND_CONCRETE,
                };
                let axes = if axis == 0 { [ax[0], ax[1], ax[2]] } else { [ax[2], ax[1], ax[0]] };
                solid_box(solid, pos, axes, [run * cw * 0.5, cell * 0.5, thick * 0.5], &surf);
            }
        }

        // 斷口：每一欄最上面那一格高度不一、微微歪斜，有的還露出鋼筋
        let axes_w = if axis == 0 { [ax[0], ax[1], ax[2]] } else { [ax[2], ax[1], ax[0]] };
        for c in 0..cols {
            let row = tops[c] - 1;
            let frac = rng.range(0.25, 1.0);
            let y0 = row as f32 * cell;
            let hgt = cell * frac;
            let width = cw * rng.range(0.55, 1.0);
            let pos = wall_start + along * ((c as f32 + 0.5) * cw + rng.range(-0.2, 0.2)) + ax[1] * (y0 + hgt * 0.5);
            let tilt = rng.range(-0.12, 0.12);
            let tilted = [axes_w[0] * tilt.cos() + axes_w[1] * tilt.sin(), axes_w[1] * tilt.cos() - axes_w[0] * tilt.sin(), axes_w[2]];
            let surf = Surface { color: scale3([0.36, 0.35, 0.32], rng.range(0.82, 1.1)), moss: 0.55, kind: KIND_CONCRETE };
            solid_box(solid, pos, tilted, [width * 0.5, hgt * 0.5, thick * 0.5], &surf);
            if rng.next_f32() < 0.35 {
                let bars = 1 + (rng.next_f32() * 3.0) as usize;
                for _ in 0..bars {
                    let start = pos + along * rng.range(-width * 0.4, width * 0.4) + ax[1] * (hgt * 0.4);
                    let tip = start
                        + ax[1] * rng.range(0.8, 2.2)
                        + along * rng.range(-0.6, 0.6)
                        + outward * rng.range(-0.5, 0.8);
                    add_beam(&mut solid.mesh, start, tip, 0.07, &Surface { color: [0.22, 0.12, 0.07], moss: 0.0, kind: KIND_METAL });
                }
            }
        }

        // 爬藤：從還站著的牆頂垂下來
        for c in 0..cols {
            if tops[c] < 2 || rng.next_f32() > 0.4 {
                continue;
            }
            let top_y = tops[c] as f32 * cell;
            let top = wall_start + along * ((c as f32 + rng.range(0.2, 0.8)) * cw) + ax[1] * top_y + outward * (thick * 0.5 + 0.03);
            let length = top_y * rng.range(0.35, 0.95);
            add_vine(plants, rng, top, outward, along, length);
        }
    }

    // 塌落的樓板：只剩一部分，有的斜斜地垮下來
    for f in 1..r.floors {
        let y = (f * rows_per_floor) as f32 * cell;
        let gx = (r.width / 4.0) as i32;
        let gz = (r.depth / 4.0) as i32;
        for i in 0..gx {
            for j in 0..gz {
                if rng.next_f32() > 0.45 {
                    continue;
                }
                let lx = -hw + (i as f32 + 0.5) * r.width / gx as f32;
                let lz = -hd + (j as f32 + 0.5) * r.depth / gz as f32;
                let fallen = rng.next_f32() < 0.3;
                let (py, tilt) = if fallen { (y * rng.range(0.2, 0.6), rng.range(-0.6, 0.6)) } else { (y, 0.0) };
                let surf = Surface { color: scale3([0.3, 0.29, 0.27], rng.range(0.85, 1.1)), moss: 0.7, kind: KIND_CONCRETE };
                let axes = axes_yaw_tilt(yaw, tilt, rng.range(-0.15, 0.15) * tilt.signum());
                solid_box(solid, local(lx, py, lz), axes, [r.width / gx as f32 * 0.5, 0.25, r.depth / gz as f32 * 0.5], &surf);
            }
        }
    }

    // 瓦礫：堆在牆腳和塌的那一側
    let pieces = 40 + r.floors * 15;
    for _ in 0..pieces {
        let lx = rng.range(-hw * 1.3, hw * 1.3) + r.collapse_side * rng.range(0.0, hw * 0.6);
        let lz = rng.range(-hd * 1.3, hd * 1.3);
        let size = rng.range(0.3, 1.6);
        let p = local(lx, 0.0, lz);
        let gy = ground_height(cfg, p.x, p.z);
        let surf = Surface { color: scale3([0.34, 0.33, 0.3], rng.range(0.75, 1.1)), moss: 0.6, kind: KIND_CONCRETE };
        let axes = axes_yaw_tilt(rng.range(0.0, 6.28), rng.range(-0.5, 0.5), rng.range(-0.5, 0.5));
        let half = [size * rng.range(0.5, 1.0), size * rng.range(0.3, 0.6), size * rng.range(0.5, 1.0)];
        let c = Vec3::new(p.x, gy + size * 0.25, p.z);
        if size > 1.0 { solid_box(solid, c, axes, half, &surf); } else { add_obox(&mut solid.mesh, c, axes, half, &surf); }
    }
}

// ---------------------------------------------------------------------
//  廢棄工廠：鏽蝕廠房、塌了一半的鋸齒屋頂、斷頂煙囪、管線
// ---------------------------------------------------------------------

fn build_factory(cfg: &EnvironmentConfig, rng: &mut Rng, solid: &mut Solid, plants: &mut Mesh) {
    let (fx, fz, yaw_deg) = cfg.factory;
    let yaw = yaw_deg.to_radians();
    let ax = axes_yaw_tilt(yaw, 0.0, 0.0);
    let base = Vec3::new(fx, ground_height(cfg, fx, fz) - 0.3, fz);
    let local = |x: f32, y: f32, z: f32| base + ax[0] * x + ax[1] * y + ax[2] * z;
    let (len, wid, h) = (52.0f32, 26.0f32, 13.0f32);
    let metal = |rng: &mut Rng| Surface { color: scale3([0.3, 0.22, 0.16], rng.range(0.75, 1.15)), moss: 0.15, kind: KIND_METAL };

    // 牆：一片片鐵皮板，有的掉了
    let panel = 3.0;
    for (axis, ext, other) in [(0usize, len, wid), (2usize, wid, len)] {
        for sgn in [-1.0f32, 1.0] {
            let n = (ext / panel) as usize;
            for i in 0..n {
                let rows = 2;
                for row in 0..rows {
                    if rng.next_f32() < 0.18 + 0.12 * row as f32 {
                        continue;
                    }
                    let a = -ext * 0.5 + (i as f32 + 0.5) * panel;
                    let y = (row as f32 + 0.5) * h / rows as f32;
                    let (lx, lz) = if axis == 0 { (a, sgn * other * 0.5) } else { (sgn * other * 0.5, a) };
                    let lean = rng.range(-0.04, 0.04);
                    let axes = if axis == 0 { axes_yaw_tilt(yaw, lean, 0.0) } else { axes_yaw_tilt(yaw + PI * 0.5, lean, 0.0) };
                    solid_box(solid, local(lx, y, lz), axes, [panel * 0.49, h / rows as f32 * 0.49, 0.12], &metal(rng));
                }
            }
        }
    }
    // 鋼柱
    for i in 0..=8 {
        for sgn in [-1.0f32, 1.0] {
            let x = -len * 0.5 + i as f32 * len / 8.0;
            let a = local(x, 0.0, sgn * wid * 0.5);
            let b = local(x, h + 0.5, sgn * wid * 0.5);
            solid_beam(solid, a, b, 0.5, &Surface { color: [0.18, 0.14, 0.11], moss: 0.1, kind: KIND_METAL });
        }
    }
    // 鋸齒屋頂：每一排是一片斜屋頂，大約三分之一已經塌掉
    let teeth = 7;
    let tw = len / teeth as f32;
    for i in 0..teeth {
        let x0 = -len * 0.5 + i as f32 * tw;
        if rng.next_f32() < 0.35 {
            // 塌下來的屋頂斜插在廠房裡
            let axes = axes_yaw_tilt(yaw, rng.range(-0.3, 0.3), rng.range(0.4, 0.9));
            solid_box(solid, local(x0 + tw * 0.5, h * 0.35, rng.range(-wid * 0.3, wid * 0.3)), axes, [tw * 0.5, 0.15, wid * 0.3], &metal(rng));
            continue;
        }
        let rise = 4.0;
        let slope = (rise / tw).atan();
        let axes = axes_yaw_tilt(yaw, 0.0, slope);
        let hyp = (tw * tw + rise * rise).sqrt();
        solid_box(solid, local(x0 + tw * 0.5, h + rise * 0.5, 0.0), axes, [hyp * 0.5, 0.15, wid * 0.5], &metal(rng));
    }
    // 斷頂的煙囪
    let chimney_base = local(len * 0.5 + 6.0, 0.0, -wid * 0.3);
    let cseed = cfg.seed as u32;
    add_lathe(
        &mut solid.mesh,
        chimney_base,
        50.0,
        24,
        20,
        |t| 3.0 - 1.1 * t,
        |a| 1.0 - 0.12 * value_noise(a * 2.5, 3.0, cseed + 31),
        &Surface { color: [0.32, 0.27, 0.24], moss: 0.25, kind: KIND_CONCRETE },
    );
    solid.cyls.push(CylCollider {
        base: chimney_base,
        height: 50.0 * 0.9,
        radii: (0..=8).map(|i| 3.0 - 1.1 * (i as f32 / 8.0)).collect(),
        shell: false,
    });
    // 煙囪上的環帶
    for k in 1..4 {
        let y = k as f32 * 12.0;
        let r = 3.0 - 1.1 * (y / 50.0) + 0.15;
        add_lathe(&mut solid.mesh, chimney_base + Vec3::new(0.0, y, 0.0), 0.6, 1, 20, |_| r, |_| 1.0, &Surface { color: [0.15, 0.12, 0.1], moss: 0.0, kind: KIND_METAL });
    }
    // 從廠房接到煙囪的管線，中間有支架
    let p0 = local(len * 0.5 - 2.0, h * 0.7, -wid * 0.3);
    let p1 = chimney_base + Vec3::new(-2.5, h * 0.7, 0.0);
    solid_beam(solid, p0, p1, 1.2, &Surface { color: [0.26, 0.18, 0.12], moss: 0.1, kind: KIND_METAL });
    // 牆上垂下來的藤
    for _ in 0..14 {
        let x = rng.range(-len * 0.5, len * 0.5);
        let sgn = if rng.next_f32() < 0.5 { -1.0 } else { 1.0 };
        let outward = ax[2] * sgn;
        let top = local(x, h * rng.range(0.6, 1.0), sgn * (wid * 0.5 + 0.2));
        let length = h * rng.range(0.3, 0.8);
        add_vine(plants, rng, top, outward, ax[0], length);
    }
}

// ---------------------------------------------------------------------
//  冷卻塔
// ---------------------------------------------------------------------

fn build_tower(cfg: &EnvironmentConfig, x: f32, z: f32, k: usize, solid: &mut Solid) {
    let base = Vec3::new(x, ground_height(cfg, x, z) - 1.0, z);
    let seed = cfg.seed as u32 + 40 + k as u32;
    let (h, r_base, r_waist, r_top, t_waist) = (95.0f32, 34.0f32, 21.0f32, 24.0f32, 0.72f32);
    let profile = move |t: f32| {
        if t < t_waist {
            let u = (t_waist - t) / t_waist;
            r_waist + (r_base - r_waist) * u * u
        } else {
            let u = (t - t_waist) / (1.0 - t_waist);
            r_waist + (r_top - r_waist) * u * u
        }
    };
    solid.cyls.push(CylCollider { base, height: h * 0.88, radii: (0..=16).map(|i| profile(i as f32 / 16.0 * 0.88)).collect(), shell: true });
    add_lathe(
        &mut solid.mesh,
        base,
        h,
        32,
        56,
        profile,
        // 頂端有一塊崩掉
        move |a| 1.0 - 0.14 * smoothstep(0.55, 0.85, value_noise(a * 1.6, 1.0, seed)),
        &Surface { color: [0.44, 0.43, 0.41], moss: 0.0, kind: KIND_TOWER },
    );
}

// ---------------------------------------------------------------------
//  鐵絲網、刺鐵絲、輻射警告牌
// ---------------------------------------------------------------------

fn build_fence(cfg: &EnvironmentConfig, line: &FenceLine, rng: &mut Rng, solid: &mut Solid, fence: &mut Mesh, signs: &mut Mesh) {
    let (ax, az) = line.a;
    let (bx, bz) = line.b;
    let dx = bx - ax;
    let dz = bz - az;
    let len = (dx * dx + dz * dz).sqrt();
    let dir = Vec3::new(dx / len, 0.0, dz / len);
    let mut normal = Vec3::new(-dir.z, 0.0, dir.x);
    // 警告牌朝向原點（生物出發的地方）那一側
    let mid = Vec3::new((ax + bx) * 0.5, 0.0, (az + bz) * 0.5);
    if normal.x * -mid.x + normal.z * -mid.z < 0.0 {
        normal = -normal;
    }

    let spacing = 6.0;
    let posts = (len / spacing).ceil() as usize;
    let height = 7.0;
    let rust = |rng: &mut Rng| Surface { color: scale3([0.24, 0.19, 0.15], rng.range(0.8, 1.15)), moss: 0.1, kind: KIND_METAL };
    let wire_s = Surface { color: [0.16, 0.14, 0.12], moss: 0.0, kind: KIND_METAL };

    // 柱子：有的歪了
    let mut tops: Vec<Vec3> = Vec::new();
    let mut bottoms: Vec<Vec3> = Vec::new();
    for i in 0..=posts {
        let t = (i as f32 * spacing).min(len);
        let x = ax + dir.x * t;
        let z = az + dir.z * t;
        let gy = ground_height(cfg, x, z);
        let lean_amt = if rng.next_f32() < 0.25 { rng.range(0.15, 0.4) } else { rng.range(0.0, 0.05) };
        let lean = (normal * rng.range(-1.0, 1.0) + dir * rng.range(-0.5, 0.5)).normalize_or(normal) * lean_amt;
        let bottom = Vec3::new(x, gy - 0.4, z);
        let top = bottom + (Vec3::new(0.0, 1.0, 0.0) + lean).normalize_or(Vec3::new(0.0, 1.0, 0.0)) * (height + 0.4);
        solid_beam(solid, bottom, top, 0.22, &rust(rng));
        // 頂端往外斜的支架
        let arm = top + (Vec3::new(0.0, 0.7, 0.0) + normal * -0.7);
        add_beam(&mut solid.mesh, top, arm, 0.1, &rust(rng));
        tops.push(arm);
        bottoms.push(bottom);
    }

    for i in 0..posts {
        let (b0, b1) = (bottoms[i], bottoms[i + 1]);
        let t0 = b0 + (tops[i] - b0) * (height / (height + 1.6));
        let t1 = b1 + (tops[i + 1] - b1) * (height / (height + 1.6));
        let seg_len = (b1 - b0).length();
        let u0 = i as f32 * spacing;

        // 網面：少數完全不見，有的往下垂
        if rng.next_f32() > 0.1 {
            let sag = if rng.next_f32() < 0.3 { rng.range(0.4, 1.6) } else { rng.range(0.0, 0.2) };
            let bulge = rng.range(-0.3, 0.3);
            let cols = 6;
            let base_i = fence.positions.len() as u32;
            for c in 0..=cols {
                let f = c as f32 / cols as f32;
                let arch = (f * PI).sin();
                let bot = b0 + (b1 - b0) * f + Vec3::new(0.0, 0.5 + 0.3 * arch * (sag * 0.5), 0.0);
                let top = t0 + (t1 - t0) * f - Vec3::new(0.0, sag * arch, 0.0) + normal * (bulge * arch);
                let h_top = (top - bot).length();
                let u = u0 + f * seg_len;
                fence.add_vertex_full(bot, normal, [u, 0.0], 0.0, [0.26, 0.24, 0.21]);
                fence.add_vertex_full(top, normal, [u, h_top], 0.0, [0.26, 0.24, 0.21]);
            }
            for c in 0..cols as u32 {
                let a = base_i + c * 2;
                fence.add_tri(a, a + 2, a + 3);
                fence.add_tri(a, a + 3, a + 1);
            }
            // 網面的碰撞：一片薄板（缺掉的那幾片就是可以飛過去的缺口）
            let center = (b0 + b1 + t0 + t1) * 0.25;
            let up = ((t0 + t1) * 0.5 - (b0 + b1) * 0.5).normalize_or(Vec3::new(0.0, 1.0, 0.0));
            let along = (b1 - b0).normalize_or(dir);
            let thin = along.cross(up).normalize_or(normal);
            let up2 = thin.cross(along);
            solid.boxes.push(BoxCollider {
                center,
                axes: [along, up2, thin],
                half: [seg_len * 0.5, ((t0 + t1) * 0.5 - (b0 + b1) * 0.5).length() * 0.5 + 0.4, 0.08],
            });
            // 頂端的橫桿
            add_beam(&mut solid.mesh, t0, t1 - Vec3::new(0.0, sag * 0.3, 0.0), 0.1, &rust(rng));
        }

        // 三條刺鐵絲，加上一根根小刺
        for k in 0..3 {
            let f = 0.35 + k as f32 * 0.3;
            let p0 = t0 + (tops[i] - t0) * f;
            let p1 = t1 + (tops[i + 1] - t1) * f;
            let droop = Vec3::new(0.0, -rng.range(0.05, 0.25), 0.0);
            let m0 = (p0 + p1) * 0.5 + droop;
            add_beam(&mut solid.mesh, p0, m0, 0.045, &wire_s);
            add_beam(&mut solid.mesh, m0, p1, 0.045, &wire_s);
            let barbs = (seg_len / 1.1) as usize;
            for bi in 0..barbs {
                let f2 = (bi as f32 + 0.5) / barbs as f32;
                let p = if f2 < 0.5 { p0 + (m0 - p0) * (f2 * 2.0) } else { m0 + (p1 - m0) * ((f2 - 0.5) * 2.0) };
                // 小刺：兩片交叉的細條（比方塊省很多頂點）
                let a1 = Vec3::new(rng.range(-1.0, 1.0), rng.range(-0.3, 0.3), rng.range(-1.0, 1.0)).normalize_or(normal) * 0.15;
                let w1 = Vec3::new(0.0, 0.025, 0.0);
                let w2 = a1.cross(w1).normalize_or(normal) * 0.025;
                for w in [w1, w2] {
                    add_quad(&mut solid.mesh, [p - a1 - w, p + a1 - w, p + a1 + w, p - a1 + w], normal, [[0.0, KIND_METAL]; 4], [0.0; 4], wire_s.color);
                }
            }
        }

        // 輻射警告牌
        if i % 2 == 0 && rng.next_f32() < 0.75 {
            let f = rng.range(0.3, 0.7);
            let bot = b0 + (b1 - b0) * f;
            let up_dir = ((t0 + (t1 - t0) * f) - bot).normalize_or(Vec3::new(0.0, 1.0, 0.0));
            let center = bot + up_dir * rng.range(3.0, 4.2) + normal * 0.08;
            let tilt = rng.range(-0.18, 0.18);
            let side = (dir * tilt.cos() + up_dir * tilt.sin()) * 0.95;
            let up = (up_dir * tilt.cos() - dir * tilt.sin()) * 0.95;
            let weathered = rng.range(0.0, 1.0);
            add_quad(
                signs,
                [center - side - up, center + side - up, center + side + up, center - side + up],
                normal,
                [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]],
                [weathered; 4],
                [1.0, 1.0, 1.0],
            );
        }
    }
}

// ---------------------------------------------------------------------
//  地上零散的瓦礫和混凝土碎塊
// ---------------------------------------------------------------------

fn build_debris(cfg: &EnvironmentConfig, rng: &mut Rng, solid: &mut Solid) {
    for _ in 0..cfg.rubble_count {
        let r = rng.range(cfg.flat_radius * 0.8, 90.0);
        let a = rng.range(0.0, 2.0 * PI);
        let (x, z) = (a.cos() * r, a.sin() * r);
        let gy = ground_height(cfg, x, z);
        let slab = rng.next_f32() < 0.3;
        let size = if slab { rng.range(1.0, 2.6) } else { rng.range(0.25, 1.1) };
        let half = if slab { [size, 0.2, size * rng.range(0.4, 0.8)] } else { [size * rng.range(0.5, 1.0), size * rng.range(0.3, 0.7), size * rng.range(0.5, 1.0)] };
        let axes = axes_yaw_tilt(rng.range(0.0, 6.28), rng.range(-0.35, 0.35), rng.range(-0.35, 0.35));
        let moss = if slab { 0.25 } else { 0.5 };
        let surf = Surface { color: scale3([0.28, 0.27, 0.25], rng.range(0.7, 1.05)), moss, kind: KIND_CONCRETE };
        add_obox(&mut solid.mesh, Vec3::new(x, gy + half[1] * if slab { -0.2 } else { 0.4 }, z), axes, half, &surf);
    }
}

pub fn build(cfg: &EnvironmentConfig) -> Environment {
    let mut rng = Rng(cfg.seed.max(1));
    let ground = build_ground(cfg);
    let mut structures = Solid { mesh: Mesh::new(), boxes: Vec::new(), cyls: Vec::new() };
    let mut plants = Mesh::new();
    let mut fence = Mesh::new();
    let mut signs = Mesh::new();

    build_grass(cfg, &mut rng, &mut plants);
    for r in &cfg.ruins {
        build_ruin(cfg, r, &mut rng, &mut structures, &mut plants);
    }
    build_factory(cfg, &mut rng, &mut structures, &mut plants);
    for (k, &(x, z)) in cfg.towers.iter().enumerate() {
        build_tower(cfg, x, z, k, &mut structures);
    }
    for line in &cfg.fences {
        build_fence(cfg, line, &mut rng, &mut structures, &mut fence, &mut signs);
    }
    build_debris(cfg, &mut rng, &mut structures);

    Environment { ground, structures, plants, fence, signs }
}

impl Environment {
    pub fn parts(&self) -> [(&'static str, &'static str, &Mesh); 5] {
        [
            ("ground", "env", &self.ground),
            ("structures", "env", &self.structures.mesh),
            ("plants", "env", &self.plants),
            ("fence", "fence", &self.fence),
            ("signs", "sign", &self.signs),
        ]
    }

    pub fn to_json(&self, cfg: &EnvironmentConfig) -> String {
        let parts: Vec<String> = self
            .parts()
            .iter()
            .map(|(name, mat, mesh)| format!("{{\"name\":\"{}\",\"material\":\"{}\",\"mesh\":{}}}", name, mat, mesh.to_json_with(2)))
            .collect();
        let f = |x: f32| crate::mesh::fmt_dec(x, 3);
        let v = |p: Vec3| format!("{},{},{}", f(p.x), f(p.y), f(p.z));
        let boxes: Vec<String> = self
            .structures
            .boxes
            .iter()
            .map(|b| format!("[{},{},{},{},{},{},{}]", v(b.center), v(b.axes[0]), v(b.axes[1]), v(b.axes[2]), f(b.half[0]), f(b.half[1]), f(b.half[2])))
            .collect();
        let cyls: Vec<String> = self
            .structures
            .cyls
            .iter()
            .map(|c| {
                let r: Vec<String> = c.radii.iter().map(|x| f(*x)).collect();
                format!("{{\"base\":[{}],\"height\":{},\"radii\":[{}],\"shell\":{}}}", v(c.base), f(c.height), r.join(","), c.shell)
            })
            .collect();
        format!(
            "{{\"params\":{{\"ground_y\":{},\"flat_radius\":{},\"ground_size\":{},\"ground_grid\":{}}},\
             \"colliders\":{{\"boxes\":[{}],\"cylinders\":[{}]}},\"parts\":[{}]}}",
            crate::mesh::fmt_f(cfg.ground_y),
            crate::mesh::fmt_f(cfg.flat_radius),
            crate::mesh::fmt_f(cfg.ground_size),
            GROUND_GRID,
            boxes.join(","),
            cyls.join(","),
            parts.join(",")
        )
    }
}
