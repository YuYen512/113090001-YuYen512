//! 自然把人造物吞掉：從廢墟裡長出來的樹、纏住鐵絲網的藤蔓、半埋在土裡長滿苔蘚的生鏽汽車。
//!
//! 這些都是「人類消失很久之後」才會出現的景象：
//!   - 樹從沒有屋頂的建築裡長出來，樹冠比殘牆還高 → 至少過了幾十年
//!   - 藤蔓越長越重，把鐵絲網整段拉倒
//!   - 汽車沉進土裡、鏽穿、長滿苔蘚，草從車子旁邊冒出來

use super::{add_obox, add_quad, add_vine, axes_yaw_tilt, ground_height, mix3, scale3, value_noise};
use super::{BoxCollider, EnvironmentConfig, Landmark, Shelter, Solid, Surface, KIND_CONCRETE, KIND_METAL, KIND_PLANT};
use crate::hyphae::Rng;
use crate::math::Vec3;
use crate::mesh::Mesh;
use std::f32::consts::{PI, TAU};

const UP: Vec3 = Vec3 { x: 0.0, y: 1.0, z: 0.0 };

// ---------------------------------------------------------------------
//  基本形狀
// ---------------------------------------------------------------------

/// 沿著一串點的管子（樹幹、樹枝、輪胎、管線）。radii 和 points 一樣多。
pub(super) fn add_tube(m: &mut Mesh, points: &[Vec3], radii: &[f32], sides: usize, s: &Surface) {
    let start = m.positions.len() as u32;
    let mut normal = Vec3::new(1.0, 0.0, 0.0);
    for i in 0..points.len() {
        let a = points[i.saturating_sub(1)];
        let b = points[(i + 1).min(points.len() - 1)];
        let tan = (b - a).normalize_or(UP);
        normal = (normal - tan * normal.dot(tan)).normalize_or(if tan.y.abs() < 0.9 { UP } else { Vec3::new(1.0, 0.0, 0.0) });
        let binormal = tan.cross(normal);
        for j in 0..=sides {
            let ang = TAU * j as f32 / sides as f32;
            let n = normal * ang.cos() + binormal * ang.sin();
            m.add_vertex_full(points[i] + n * radii[i], n, [s.moss, s.kind], 0.0, s.color);
        }
    }
    let row = (sides + 1) as u32;
    for i in 0..(points.len() - 1) as u32 {
        for j in 0..sides as u32 {
            let a = start + i * row + j;
            m.add_tri(a, a + 1, a + row + 1);
            m.add_tri(a, a + row + 1, a + row);
        }
    }
}

/// 一團凹凸不平的樹冠（變形過的球）。sway = 被風吹動的程度
fn add_blob(m: &mut Mesh, rng: &mut Rng, center: Vec3, radius: f32, sway: f32, color: [f32; 3]) {
    let (rings, segs) = (7usize, 11usize);
    let start = m.positions.len() as u32;
    let seed = rng.next_f32() * 100.0;
    for i in 0..=rings {
        let th = PI * i as f32 / rings as f32;
        for j in 0..=segs {
            let ph = TAU * j as f32 / segs as f32;
            let dir = Vec3::new(th.sin() * ph.cos(), th.cos(), th.sin() * ph.sin());
            // 用雜訊讓表面凹凸，底部稍微壓扁
            let bump = 0.75 + 0.5 * value_noise(dir.x * 2.2 + seed, dir.z * 2.2 + dir.y * 1.7, 77);
            let flat = if dir.y < 0.0 { 0.7 } else { 1.0 };
            let p = center + Vec3::new(dir.x * radius * bump, dir.y * radius * bump * flat, dir.z * radius * bump);
            let shade = 0.8 + 0.35 * value_noise(dir.x * 4.0 + seed, dir.z * 4.0, 78);
            m.add_vertex_full(p, dir, [0.0, KIND_PLANT], sway, scale3(color, shade));
        }
    }
    let row = (segs + 1) as u32;
    for i in 0..rings as u32 {
        for j in 0..segs as u32 {
            let a = start + i * row + j;
            m.add_tri(a, a + row + 1, a + 1);
            m.add_tri(a, a + row, a + row + 1);
        }
    }
}

/// 一片小葉子（菱形）
fn add_leaf(m: &mut Mesh, rng: &mut Rng, at: Vec3, dir: Vec3, normal: Vec3, size: f32, sway: f32) {
    let perp = dir.cross(normal).normalize_or(Vec3::new(1.0, 0.0, 0.0)) * (size * 0.4);
    let tip = at + dir * size;
    let mid = at + dir * (size * 0.45);
    let c = scale3(mix3([0.13, 0.23, 0.07], [0.23, 0.31, 0.11], rng.next_f32()), rng.range(0.75, 1.2));
    add_quad(m, [at, mid - perp, tip, mid + perp], normal, [[0.0, KIND_PLANT]; 4], [sway; 4], c);
}

/// 纏繞的藤蔓：從 a 繞著 a→b 這條線螺旋往上爬（radius = 繞多寬），沿途長葉子
pub(super) fn add_climber(m: &mut Mesh, rng: &mut Rng, a: Vec3, b: Vec3, radius: f32) {
    let d = b - a;
    let len = d.length();
    if len < 0.3 {
        return;
    }
    let axis = d * (1.0 / len);
    let u = axis.cross(if axis.y.abs() < 0.9 { UP } else { Vec3::new(1.0, 0.0, 0.0) }).normalize_or(Vec3::new(1.0, 0.0, 0.0));
    let v = axis.cross(u);
    let turns_per_m = rng.range(0.5, 0.9);
    let phase0 = rng.range(0.0, TAU);
    let steps = (len / 0.3).ceil() as usize;
    let reach = rng.range(0.6, 1.0); // 爬到多高
    let stem_c = [0.16, 0.2, 0.09];
    let point = |t: f32| {
        let ang = phase0 + TAU * turns_per_m * len * t;
        a + d * t + (u * ang.cos() + v * ang.sin()) * radius
    };
    for i in 0..steps {
        let t0 = i as f32 / steps as f32 * reach;
        let t1 = (i + 1) as f32 / steps as f32 * reach;
        let (p, q) = (point(t0), point(t1));
        let out = (p - (a + d * t0)).normalize_or(u);
        let side = (q - p).cross(out).normalize_or(v) * 0.04;
        add_quad(m, [p - side, p + side, q + side, q - side], out, [[0.0, KIND_PLANT]; 4], [0.02; 4], stem_c);
        for _ in 0..(1 + (rng.next_f32() * 2.2) as usize) {
            let at = p + (q - p) * rng.next_f32();
            let dir = (out * rng.range(0.5, 1.0) + axis * rng.range(-0.6, 0.6)).normalize_or(out);
            let size = rng.range(0.16, 0.3);
            add_leaf(m, rng, at, dir, out, size, 0.03);
        }
    }
}

/// 一小叢草（從車子旁邊、裂縫裡冒出來）
fn add_tuft(m: &mut Mesh, rng: &mut Rng, cfg: &EnvironmentConfig, x: f32, z: f32, blades: usize, tall: f32) {
    for _ in 0..blades {
        let bx = x + rng.range(-0.4, 0.4);
        let bz = z + rng.range(-0.4, 0.4);
        let base = Vec3::new(bx, ground_height(cfg, bx, bz) - 0.05, bz);
        let yaw = rng.range(0.0, TAU);
        let side = Vec3::new(yaw.cos(), 0.0, yaw.sin()) * rng.range(0.035, 0.06);
        let h = tall * rng.range(0.6, 1.3);
        let lean = rng.range(0.0, TAU);
        let tip = base + Vec3::new(lean.cos() * h * 0.25, h, lean.sin() * h * 0.25);
        let n = (side.cross(tip - base).normalize_or(UP) * 0.35 + UP * 0.65).normalize_or(UP);
        let c = scale3(mix3([0.2, 0.25, 0.09], [0.3, 0.33, 0.13], rng.next_f32()), rng.range(0.8, 1.15));
        let i0 = m.add_vertex_full(base - side, n, [0.0, KIND_PLANT], 0.0, c);
        let i1 = m.add_vertex_full(base + side, n, [0.0, KIND_PLANT], 0.0, c);
        let i2 = m.add_vertex_full(tip, n, [0.0, KIND_PLANT], h * 0.18, scale3(c, 1.25));
        m.add_tri(i0, i1, i2);
    }
}

// ---------------------------------------------------------------------
//  樹：從廢墟（沒有屋頂的建築、塌掉的廠房屋頂）裡長出來
// ---------------------------------------------------------------------

/// 在 (x, z) 長一棵高 height 的樹。樹幹會擋住生物（碰撞），樹冠不會。
pub(super) fn build_tree(cfg: &EnvironmentConfig, rng: &mut Rng, solid: &mut Solid, plants: &mut Mesh, x: f32, z: f32, height: f32) {
    let g = ground_height(cfg, x, z);
    let bark = Surface { color: scale3([0.24, 0.2, 0.16], rng.range(0.85, 1.1)), moss: 0.45, kind: KIND_CONCRETE };

    // 樹幹：往上長，微微彎曲，越往上越細
    let segs = 10;
    let lean = Vec3::new(rng.range(-1.0, 1.0), 0.0, rng.range(-1.0, 1.0)) * (0.08 * height);
    let wob = rng.range(0.0, TAU);
    let base_r = 0.35 + height * 0.018;
    let trunk_pt = |t: f32| {
        Vec3::new(x, g - 0.6, z)
            + UP * ((height + 0.6) * t)
            + lean * (t * t)
            + Vec3::new((wob + t * 5.0).sin(), 0.0, (wob + t * 4.0).cos()) * (0.25 * t)
    };
    let pts: Vec<Vec3> = (0..=segs).map(|i| trunk_pt(i as f32 / segs as f32)).collect();
    // 根部比較粗，像抓著地面
    let radii: Vec<f32> = (0..=segs)
        .map(|i| {
            let t = i as f32 / segs as f32;
            base_r * (1.0 - 0.65 * t) * (1.0 + 0.6 * (1.0 - (t * 8.0).min(1.0)))
        })
        .collect();
    add_tube(&mut solid.mesh, &pts, &radii, 8, &bark);
    // 碰撞：三段方塊
    for k in 0..3 {
        let (a, b) = (trunk_pt(k as f32 / 3.0), trunk_pt((k + 1) as f32 / 3.0));
        let ax = (b - a).normalize_or(UP);
        let ay = ax.cross(Vec3::new(1.0, 0.0, 0.0)).normalize_or(Vec3::new(0.0, 0.0, 1.0));
        let az = ax.cross(ay);
        let r = radii[k * segs / 3];
        solid.boxes.push(BoxCollider { center: (a + b) * 0.5, axes: [ax, ay, az], half: [(b - a).length() * 0.5, r, r] });
    }

    // 樹枝和樹冠：從樹幹上半部往外伸，末端是一團團葉子
    let leaf_c = mix3([0.1, 0.17, 0.07], [0.16, 0.23, 0.09], rng.next_f32());
    let crown_r = 2.0 + height * 0.08;
    let branches = 6 + (rng.next_f32() * 3.0) as usize;
    for k in 0..branches {
        let t = rng.range(0.5, 0.92);
        let from = trunk_pt(t);
        let ang = TAU * (k as f32 + rng.range(-0.3, 0.3)) / branches as f32;
        let dir = (Vec3::new(ang.cos(), rng.range(0.35, 0.9), ang.sin())).normalize_or(UP);
        let len = crown_r * rng.range(0.7, 1.3) * (1.15 - t * 0.5);
        let mid = from + dir * (len * 0.5) + UP * (len * 0.12);
        let end = from + dir * len + UP * (len * 0.2);
        let r0 = (base_r * (1.0 - 0.65 * t) * 0.5).max(0.06);
        add_tube(&mut solid.mesh, &[from, mid, end], &[r0, r0 * 0.6, r0 * 0.3], 5, &bark);
        let r_end = crown_r * rng.range(0.45, 0.7);
        add_blob(plants, rng, end, r_end, 0.12, leaf_c);
        // 躲藏點：葉子團的正下方，被樹冠遮住（天亮時生物會飛來這裡倒掛著睡）
        let hide = end - UP * (r_end * 0.75 + 1.3);
        if hide.y > ground_height(cfg, hide.x, hide.z) + 2.5 {
            solid.shelters.push(Shelter { at: hide, kind: 0 });
        }
        if rng.next_f32() < 0.6 {
            let r_mid = crown_r * rng.range(0.3, 0.45);
            add_blob(plants, rng, mid + UP * 0.5, r_mid, 0.1, leaf_c);
        }
    }
    // 樹頂
    add_blob(plants, rng, trunk_pt(1.0) + UP * 0.3, crown_r * 0.75, 0.14, leaf_c);
    // 爬上樹幹的藤
    add_climber(plants, rng, trunk_pt(0.0), trunk_pt(0.45), base_r * 1.05);
    // 探索點：樹冠旁邊（生物自己探索時會飛來繞一繞）
    let mid = trunk_pt(0.7);
    let side = Vec3::new(lean.x, 0.0, lean.z).normalize_or(Vec3::new(1.0, 0.0, 0.0));
    solid.marks.push(Landmark { at: mid + side * (crown_r * 1.6 + 1.5), look: mid, kind: 0 });
}

// ---------------------------------------------------------------------
//  生鏽的汽車：沉進土裡、傾斜、長滿苔蘚，窗戶只剩框
// ---------------------------------------------------------------------

pub(super) fn build_car(cfg: &EnvironmentConfig, rng: &mut Rng, solid: &mut Solid, plants: &mut Mesh, x: f32, z: f32, yaw_deg: f32) {
    let g = ground_height(cfg, x, z);
    let sink = rng.range(0.25, 0.45); // 沉進土裡多深
    // 一邊陷得比較深，車子歪歪的
    let ax = axes_yaw_tilt(yaw_deg.to_radians(), rng.range(-0.18, 0.18), rng.range(-0.12, 0.12));
    let center = Vec3::new(x, g + 0.5 - sink, z);
    let local = |lx: f32, ly: f32, lz: f32| center + ax[0] * lx + ax[1] * ly + ax[2] * lz;
    // 褪色的烤漆（著色器會再加上鏽斑），苔蘚很多
    let paints = [[0.25, 0.3, 0.33], [0.33, 0.27, 0.22], [0.3, 0.3, 0.28], [0.32, 0.2, 0.17]];
    let paint = paints[(rng.next_f32() * paints.len() as f32) as usize % paints.len()];
    let body = Surface { color: scale3(paint, rng.range(0.85, 1.1)), moss: 0.8, kind: KIND_METAL };
    let frame = Surface { color: scale3(paint, 0.85), moss: 0.5, kind: KIND_METAL };

    // 車身：中間的車門段 + 前面的引擎蓋（比較低）+ 後面的後車廂
    let belt = 0.42; // 車窗下緣的高度
    add_obox(&mut solid.mesh, local(-0.25, 0.0, 0.0), ax, [1.15, belt, 0.9], &body);
    add_obox(&mut solid.mesh, local(1.45, -0.08, 0.0), ax, [0.75, belt - 0.08, 0.88], &body);
    add_obox(&mut solid.mesh, local(-1.85, -0.04, 0.0), ax, [0.45, belt - 0.04, 0.88], &body);
    // 擋風玻璃的框往前斜、後窗往後斜，車頂往下凹一點
    let roof_y = 1.2;
    add_obox(&mut solid.mesh, local(-0.3, roof_y, 0.0), ax, [0.85, 0.05, 0.8], &body);
    let pillars = [((0.9f32, belt), (0.55f32, roof_y)), ((-1.4, belt), (-1.15, roof_y))];
    for &((fx, fy), (rx, ry)) in &pillars {
        for sz in [-0.84f32, 0.84] {
            super::add_beam(&mut solid.mesh, local(fx, fy, sz), local(rx, ry - 0.03, sz * 0.95), 0.12, &frame);
        }
        // 車窗上下的橫框
        super::add_beam(&mut solid.mesh, local(fx, fy, -0.84), local(fx, fy, 0.84), 0.1, &frame);
    }
    // 中柱（B 柱）
    for sz in [-0.86f32, 0.86] {
        super::add_beam(&mut solid.mesh, local(-0.3, belt, sz), local(-0.3, roof_y - 0.03, sz * 0.95), 0.1, &frame);
    }
    // 輪子：一半埋在土裡（另一半露出來，看得出是車）
    let tire = Surface { color: [0.06, 0.06, 0.06], moss: 0.35, kind: KIND_CONCRETE };
    for wx in [-1.35f32, 1.35] {
        for wz in [-0.86f32, 0.86] {
            let c = local(wx, -belt + 0.05, wz);
            add_tube(&mut solid.mesh, &[c - ax[2] * 0.12, c + ax[2] * 0.12], &[0.36, 0.36], 12, &tire);
        }
    }
    // 探索點：停在車頂上
    solid.marks.push(Landmark { at: local(-0.3, roof_y + 1.05, 0.0), look: local(1.5, 0.0, 0.0), kind: 1 });
    // 碰撞：車身 + 車廂
    solid.boxes.push(BoxCollider { center: local(0.0, 0.0, 0.0), axes: ax, half: [2.3, belt, 0.9] });
    solid.boxes.push(BoxCollider { center: local(-0.3, (belt + roof_y) * 0.5, 0.0), axes: ax, half: [1.15, (roof_y - belt) * 0.5 + 0.05, 0.86] });

    // 草從車子周圍冒出來，藤從車頂垂下來
    for _ in 0..7 {
        let a = rng.range(0.0, TAU);
        let p = local(a.cos() * rng.range(1.9, 2.8), 0.0, a.sin() * rng.range(0.9, 1.5));
        let tall = rng.range(0.5, 1.0);
        add_tuft(plants, rng, cfg, p.x, p.z, 6, tall);
    }
    for _ in 0..3 {
        let sz = if rng.next_f32() < 0.5 { -1.0 } else { 1.0 };
        let top = local(rng.range(-1.0, 0.4), roof_y + 0.05, sz * 0.82);
        let length = rng.range(0.6, 1.2);
        add_vine(plants, rng, top, ax[2] * sz, ax[0], length);
    }
    // 引擎蓋上長出的一小叢草
    let hood = local(1.45, belt - 0.16 + 0.02, rng.range(-0.3, 0.3));
    for _ in 0..6 {
        let side = Vec3::new(rng.range(-1.0, 1.0), 0.0, rng.range(-1.0, 1.0)).normalize_or(Vec3::new(1.0, 0.0, 0.0)) * 0.05;
        let h = rng.range(0.25, 0.55);
        let base = hood + Vec3::new(rng.range(-0.25, 0.25), 0.0, rng.range(-0.25, 0.25));
        let c = [0.22, 0.26, 0.1];
        let i0 = plants.add_vertex_full(base - side, UP, [0.0, KIND_PLANT], 0.0, c);
        let i1 = plants.add_vertex_full(base + side, UP, [0.0, KIND_PLANT], 0.0, c);
        let i2 = plants.add_vertex_full(base + UP * h, UP, [0.0, KIND_PLANT], h * 0.18, c);
        plants.add_tri(i0, i1, i2);
    }
}
