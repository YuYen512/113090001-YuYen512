//! 地底的廢棄冷卻池：地面塌陷出一個破洞，往下飛就進到地底一間廢棄的大房間，
//! 中間是當年核電廠存放用過的燃料、讓它降溫的冷卻池。
//!
//! 人類離開很久了，池水還留著一點餘溫（池水發出淡淡的藍光，檢視器畫），
//! 這裡溫暖、黑暗、安全，是牠繁殖的地方：牠在池邊分裂，把卵黏在池壁上。
//!
//! 整個場景都對齊地面的網格：地面的網格在洞口的那幾格直接不畫（看得到洞），
//! 洞口四周是天花板的斷面（以前是地底建築的屋頂，地面塌下來才破的）。

use super::{add_beam, add_obox, add_vine, axes_yaw_tilt, scale3, solid_box};
use super::{EnvironmentConfig, Landmark, Shelter, Solid, Surface, GROUND_GRID, KIND_CONCRETE, KIND_METAL};
use super::overgrowth::add_tube;
use crate::hyphae::Rng;
use crate::math::Vec3;
use crate::mesh::Mesh;

/// 冷卻池整個場景的位置和尺寸（都由設定和地面網格算出來，Rust 和檢視器用同一份）
pub struct PoolLayout {
    /// 洞口：[x0, x1, z0, z1]，剛好是地面網格的 2×2 格
    pub hole: [f32; 4],
    /// 地底房間的內部：[x0, x1, z0, z1]
    pub room: [f32; 4],
    /// 冷卻池（池壁內側）：[x0, x1, z0, z1]
    pub pool: [f32; 4],
    /// 洞口那幾格在地面網格裡的編號（第 i 格、第 j 格開始，各 2 格）
    pub cell: (usize, usize),
    pub surface_y: f32,
    /// 天花板的底面
    pub ceiling_y: f32,
    pub floor_y: f32,
    pub rim_y: f32,
    pub water_y: f32,
    pub basin_y: f32,
}

pub fn layout(cfg: &EnvironmentConfig) -> PoolLayout {
    let n = GROUND_GRID as f32;
    let step = cfg.ground_size / n;
    let (sx, sz) = cfg.pool_site;
    // 對齊網格：洞口是包含 (sx, sz) 的那一格往左下各退一格，共 2×2 格
    let i0 = ((sx + cfg.ground_size * 0.5) / step).floor() as usize - 1;
    let j0 = ((sz + cfg.ground_size * 0.5) / step).floor() as usize - 1;
    let gx = |i: usize| -cfg.ground_size * 0.5 + i as f32 * step;
    let hole = [gx(i0), gx(i0 + 2), gx(j0), gx(j0 + 2)];
    let hcz = (hole[2] + hole[3]) * 0.5;
    // 房間：洞口在西側的走道上方，東側是冷卻池
    let room = [hole[0] - 2.5, hole[0] - 2.5 + 27.0, hcz - 9.5, hcz + 9.5];
    let pool = [room[0] + 12.5, room[1] - 2.5, room[2] + 3.0, room[3] - 3.0];
    let surface_y = cfg.ground_y;
    let floor_y = surface_y - 12.0;
    PoolLayout {
        hole, room, pool,
        cell: (i0, j0),
        surface_y,
        ceiling_y: surface_y - 2.5,
        floor_y,
        rim_y: floor_y + 1.6,
        water_y: floor_y + 0.4,
        basin_y: floor_y - 3.0,
    }
}

impl PoolLayout {
    /// (x, z) 離房間外框多遠（在裡面 = 0）。地形在房間附近要整平
    pub fn dist_to_room(&self, x: f32, z: f32) -> f32 {
        let dx = (self.room[0] - x).max(x - self.room[1]).max(0.0);
        let dz = (self.room[2] - z).max(z - self.room[3]).max(0.0);
        (dx * dx + dz * dz).sqrt()
    }
    pub fn in_hole(&self, x: f32, z: f32, margin: f32) -> bool {
        x > self.hole[0] - margin && x < self.hole[1] + margin && z > self.hole[2] - margin && z < self.hole[3] + margin
    }
    pub fn to_json(&self) -> String {
        let a = |v: [f32; 4]| format!("[{},{},{},{}]", v[0], v[1], v[2], v[3]);
        format!(
            "{{\"hole\":{},\"room\":{},\"pool\":{},\"surface_y\":{},\"ceiling_y\":{},\"floor_y\":{},\"rim_y\":{},\"water_y\":{},\"basin_y\":{}}}",
            a(self.hole), a(self.room), a(self.pool), self.surface_y, self.ceiling_y, self.floor_y, self.rim_y, self.water_y, self.basin_y
        )
    }
}

/// 把洞口範圍裡、地面附近的三角形拿掉（草、碎石原本會蓋在洞口上，飄在半空中）
pub fn carve(m: &mut Mesh, l: &PoolLayout) {
    let mut kept = Vec::with_capacity(m.indices.len());
    for t in m.indices.chunks(3) {
        let c = (m.positions[t[0] as usize] + m.positions[t[1] as usize] + m.positions[t[2] as usize]) * (1.0 / 3.0);
        if l.in_hole(c.x, c.z, 0.3) && c.y > l.ceiling_y - 0.1 && c.y < l.surface_y + 4.0 {
            continue;
        }
        kept.extend_from_slice(t);
    }
    m.indices = kept;
}

const X: Vec3 = Vec3 { x: 1.0, y: 0.0, z: 0.0 };
const Y: Vec3 = Vec3 { x: 0.0, y: 1.0, z: 0.0 };
const Z: Vec3 = Vec3 { x: 0.0, y: 0.0, z: 1.0 };
const AXES: [Vec3; 3] = [X, Y, Z];

/// 一個對齊座標軸的方塊（有碰撞）：用 x、y、z 的範圍指定
fn block(solid: &mut Solid, x: (f32, f32), y: (f32, f32), z: (f32, f32), s: &Surface) {
    let c = Vec3::new((x.0 + x.1) * 0.5, (y.0 + y.1) * 0.5, (z.0 + z.1) * 0.5);
    solid_box(solid, c, AXES, [(x.1 - x.0) * 0.5, (y.1 - y.0) * 0.5, (z.1 - z.0) * 0.5], s);
}

pub fn build(cfg: &EnvironmentConfig, rng: &mut Rng, solid: &mut Solid, plants: &mut Mesh) {
    let l = layout(cfg);
    let concrete = Surface { color: [0.27, 0.265, 0.25], moss: 0.35, kind: KIND_CONCRETE };
    let old_concrete = Surface { color: [0.22, 0.215, 0.2], moss: 0.55, kind: KIND_CONCRETE };
    let [hx0, hx1, hz0, hz1] = l.hole;
    let [rx0, rx1, rz0, rz1] = l.room;
    let [px0, px1, pz0, pz1] = l.pool;
    let wall = 0.8;

    // 1. 天花板（以前地底建築的屋頂，上面蓋著泥土；中間塌出一個洞）
    let top = l.surface_y - 0.05;
    let (sx0, sx1, sz0, sz1) = (rx0 - wall, rx1 + wall, rz0 - wall, rz1 + wall);
    block(solid, (sx0, hx0), (l.ceiling_y, top), (sz0, sz1), &concrete);
    block(solid, (hx1, sx1), (l.ceiling_y, top), (sz0, sz1), &concrete);
    block(solid, (hx0, hx1), (l.ceiling_y, top), (sz0, hz0), &concrete);
    block(solid, (hx0, hx1), (l.ceiling_y, top), (hz1, sz1), &concrete);

    // 2. 四面牆
    block(solid, (sx0, rx0), (l.floor_y, l.ceiling_y), (sz0, sz1), &old_concrete);
    block(solid, (rx1, sx1), (l.floor_y, l.ceiling_y), (sz0, sz1), &old_concrete);
    block(solid, (rx0, rx1), (l.floor_y, l.ceiling_y), (sz0, rz0), &old_concrete);
    block(solid, (rx0, rx1), (l.floor_y, l.ceiling_y), (rz1, sz1), &old_concrete);

    // 3. 地板（冷卻池那一塊挖下去）＋ 池底
    let rim = 0.5;
    let (bx0, bx1, bz0, bz1) = (px0 - rim, px1 + rim, pz0 - rim, pz1 + rim);
    let fl = (l.floor_y - 1.0, l.floor_y);
    block(solid, (sx0, bx0), fl, (sz0, sz1), &concrete);
    block(solid, (bx1, sx1), fl, (sz0, sz1), &concrete);
    block(solid, (bx0, bx1), fl, (sz0, bz0), &concrete);
    block(solid, (bx0, bx1), fl, (bz1, sz1), &concrete);
    block(solid, (px0, px1), (l.basin_y - 1.0, l.basin_y), (pz0, pz1), &old_concrete);

    // 4. 池壁（比地板高出一截；卵就黏在池壁內側、水面上方）
    let pool_wall = Surface { color: [0.3, 0.31, 0.3], moss: 0.25, kind: KIND_CONCRETE };
    block(solid, (bx0, px0), (l.basin_y, l.rim_y), (bz0, bz1), &pool_wall);
    block(solid, (px1, bx1), (l.basin_y, l.rim_y), (bz0, bz1), &pool_wall);
    block(solid, (px0, px1), (l.basin_y, l.rim_y), (bz0, pz0), &pool_wall);
    block(solid, (px0, px1), (l.basin_y, l.rim_y), (pz1, bz1), &pool_wall);

    // 5. 池邊的欄杆（鏽了，有幾段斷掉）
    let rail = Surface { color: [0.3, 0.2, 0.13], moss: 0.2, kind: KIND_METAL };
    let corners = [(bx0, bz0), (bx1, bz0), (bx1, bz1), (bx0, bz1)];
    for k in 0..4 {
        let (a, b) = (corners[k], corners[(k + 1) % 4]);
        let len = ((b.0 - a.0).powi(2) + (b.1 - a.1).powi(2)).sqrt();
        let posts = (len / 2.2).ceil() as usize;
        for p in 0..=posts {
            let t = p as f32 / posts as f32;
            let (x, z) = (a.0 + (b.0 - a.0) * t, a.1 + (b.1 - a.1) * t);
            let lean = Vec3::new(rng.range(-0.15, 0.15), 1.0, rng.range(-0.15, 0.15)).normalize_or(Y);
            let base = Vec3::new(x, l.rim_y, z);
            add_beam(&mut solid.mesh, base, base + lean * 1.1, 0.06, &rail);
            if p < posts && rng.next_f32() > 0.3 {
                let t2 = (p + 1) as f32 / posts as f32;
                let next = Vec3::new(a.0 + (b.0 - a.0) * t2, l.rim_y + 1.05, a.1 + (b.1 - a.1) * t2);
                add_beam(&mut solid.mesh, base + lean * 1.05, next, 0.05, &rail);
            }
        }
    }

    // 6. 沿著牆的大管線（以前把池水送去降溫）
    let pipe = Surface { color: [0.26, 0.22, 0.18], moss: 0.3, kind: KIND_METAL };
    for (k, &z) in [rz1 - 0.9, rz1 - 2.1].iter().enumerate() {
        let y = l.floor_y + 4.5 + k as f32 * 1.6;
        let r = 0.45 - k as f32 * 0.12;
        add_tube(&mut solid.mesh, &[Vec3::new(rx0 + 0.5, y, z), Vec3::new(rx1 - 0.5, y, z)], &[r, r], 10, &pipe);
    }
    for &x in &[px0 + 2.0, px1 - 2.0] {
        let top = Vec3::new(x, l.ceiling_y, rz1 - 0.9);
        let down = Vec3::new(x, l.rim_y + 0.3, pz1 + 1.2);
        add_tube(&mut solid.mesh, &[top, Vec3::new(x, l.floor_y + 4.5, rz1 - 0.9), down], &[0.3, 0.3, 0.3], 8, &pipe);
    }

    // 7. 塌下來的東西：洞口正下方的一堆碎石和泥土
    let hcx = (hx0 + hx1) * 0.5;
    let hcz = (hz0 + hz1) * 0.5;
    for _ in 0..26 {
        let r = rng.range(0.0, 3.6);
        let a = rng.range(0.0, std::f32::consts::TAU);
        let (x, z) = (hcx + a.cos() * r, hcz + a.sin() * r);
        let size = rng.range(0.3, 1.2) * (1.2 - r / 4.5);
        let ax = axes_yaw_tilt(rng.range(0.0, std::f32::consts::TAU), rng.range(-0.6, 0.6), rng.range(-0.6, 0.6));
        let dirt = rng.next_f32() < 0.4;
        let s = if dirt {
            Surface { color: scale3([0.2, 0.17, 0.13], rng.range(0.8, 1.1)), moss: 0.2, kind: KIND_CONCRETE }
        } else {
            Surface { color: scale3([0.27, 0.26, 0.24], rng.range(0.8, 1.1)), moss: 0.3, kind: KIND_CONCRETE }
        };
        let half = [size, size * rng.range(0.35, 0.7), size * rng.range(0.6, 1.0)];
        add_obox(&mut solid.mesh, Vec3::new(x, l.floor_y + half[1] * 0.5, z), ax, half, &s);
    }
    // 洞口邊緣斷掉、往下垂的天花板碎塊
    for k in 0..6 {
        let side = k % 4;
        let t = rng.range(0.15, 0.85);
        let (x, z, out) = match side {
            0 => (hx0 + (hx1 - hx0) * t, hz0, -Z),
            1 => (hx1, hz0 + (hz1 - hz0) * t, X),
            2 => (hx0 + (hx1 - hx0) * t, hz1, Z),
            _ => (hx0, hz0 + (hz1 - hz0) * t, -X),
        };
        let ax = axes_yaw_tilt(rng.range(-0.4, 0.4), rng.range(-0.5, 0.5), rng.range(-0.5, 0.5));
        add_obox(&mut solid.mesh, Vec3::new(x, l.ceiling_y - 0.2, z) - out * 0.3, ax, [rng.range(0.4, 0.9), 0.25, rng.range(0.3, 0.6)], &concrete);
    }

    // 8. 從洞口垂進來的根和藤
    for k in 0..16 {
        let side = k % 4;
        let t = rng.range(0.05, 0.95);
        let (x, z, inward, along) = match side {
            0 => (hx0 + (hx1 - hx0) * t, hz0, Z, X),
            1 => (hx1, hz0 + (hz1 - hz0) * t, -X, Z),
            2 => (hx0 + (hx1 - hx0) * t, hz1, -Z, X),
            _ => (hx0, hz0 + (hz1 - hz0) * t, X, Z),
        };
        let y = if k < 8 { l.surface_y } else { l.ceiling_y };
        let length = if k < 8 { rng.range(1.5, 2.6) } else { rng.range(2.5, 6.5) };
        add_vine(plants, rng, Vec3::new(x, y, z) + inward * 0.06, inward, along, length);
    }

    // 9. 探索點：冷卻池邊（牠會自己來這裡繁殖）；躲藏點：地底的走道（白天也可以躲到這裡）
    let pz = (pz0 + pz1) * 0.5;
    solid.marks.push(Landmark {
        at: Vec3::new(px0 + 1.7, l.rim_y + 0.6, pz),
        look: Vec3::new(px0, l.water_y + 0.6, pz),
        kind: 5,
    });
    for &(fx, fz) in &[(0.3f32, 0.2f32), (0.3, 0.8), (0.75, 0.5)] {
        let x = rx0 + (px0 - rim - rx0) * fx;
        let z = rz0 + (rz1 - rz0) * fz;
        solid.shelters.push(Shelter { at: Vec3::new(x, l.floor_y + 4.0, z), kind: 2 });
    }
}
