//! 翅膀上的光點，以及從每顆光點長出的淡淡小菌絲（會分叉）。
//! 光點和菌絲都貼在翅膀表面上，跟著翅膀一起拍動。
//!
//! 給檢視器的資料：
//!   uv.x  = 能量從翅根走到這裡的距離（翅根 → 光點 + 沿著小菌絲）
//!   uv.y ≥ 0：光點圓盤，值是離中心的比例（0 中心 → 1 光暈外緣）
//!   uv.y < 0：小菌絲，值是 -(1 + t)，t 是從光點往外的進度（0 → 1）
//!   權重  = 展向位置（翅根 0 → 翅尖 1），和翅膀一樣用來做翅尖彎曲

use crate::creature::{wing_outline, wing_surface_y, CreatureConfig};
use crate::hyphae::Rng;
use crate::math::Vec3;
use crate::mesh::Mesh;
use std::f32::consts::PI;

/// 浮在翅面上一點點，避免和翅膀重疊時閃爍
const LIFT: f32 = 0.003;
/// 光暈半徑 = 光點半徑 × HALO
const HALO: f32 = 3.0;
/// 翅根埋在身體裡的那一段不放光點
const MIN_S: f32 = 0.17;

fn inside(cfg: &CreatureConfig, x: f32, z: f32, margin: f32) -> bool {
    let s = x / cfg.wing_span;
    if !(MIN_S..=0.97).contains(&s) {
        return false;
    }
    let (lead, trail, _) = wing_outline(cfg, s);
    z < lead - margin && z > trail + margin
}

fn on_surface(cfg: &CreatureConfig, x: f32, z: f32) -> Vec3 {
    Vec3::new(x, wing_surface_y(cfg, x / cfg.wing_span, z) + LIFT, z)
}

pub fn build(cfg: &CreatureConfig) -> Mesh {
    let mut rng = Rng(cfg.wing_spot_seed.max(1));
    let mut m = Mesh::new();

    // 把翅膀切成格子，部分格子裡隨機放一顆光點
    let c = cfg.wing_spot_cell;
    let z_min = -2.0 * cfg.wing_chord;
    let z_max = 0.5 * cfg.wing_chord;
    let nx = (cfg.wing_span / c).ceil() as i32;
    let nz = ((z_max - z_min) / c).ceil() as i32;

    for ix in 0..nx {
        for iz in 0..nz {
            // 每一格固定抽同樣多的亂數，改一格不會影響其他格
            let roll = rng.next_f32();
            let (jx, jz) = (rng.range(0.2, 0.8), rng.range(0.2, 0.8));
            let size_k = rng.range(0.55, 1.45);
            if roll > cfg.wing_spot_chance {
                continue;
            }
            let x = (ix as f32 + jx) * c;
            let z = z_min + (iz as f32 + jz) * c;
            let r = cfg.wing_spot_size * size_k;
            if !inside(cfg, x, z, r * HALO + 0.02) {
                continue;
            }
            add_spot(&mut m, cfg, x, z, r);
            add_strands(&mut m, cfg, &mut rng, x, z, r);
        }
    }

    m.compute_normals();
    m
}

/// 光點：一個貼在翅面上的小圓盤（含光暈範圍）
fn add_spot(m: &mut Mesh, cfg: &CreatureConfig, x: f32, z: f32, r: f32) {
    const SEG: usize = 16;
    let s = x / cfg.wing_span;
    let center = m.add_vertex(on_surface(cfg, x, z), [x, 0.0], s);
    let first = m.positions.len() as u32;
    for k in 0..SEG {
        let a = 2.0 * PI * k as f32 / SEG as f32;
        let (px, pz) = (x + a.cos() * r * HALO, z + a.sin() * r * HALO);
        m.add_vertex(on_surface(cfg, px, pz), [x, 1.0], s);
    }
    for k in 0..SEG as u32 {
        m.add_tri(center, first + k, first + (k + 1) % SEG as u32);
    }
}

/// 從光點往四周長出小菌絲。每顆光點都不一樣：
/// 根數、整體長短、每根的長度和方向、分叉多寡都隨機。
fn add_strands(m: &mut Mesh, cfg: &CreatureConfig, rng: &mut Rng, x: f32, z: f32, r: f32) {
    let (lo, hi) = cfg.wing_spot_strands;
    let n = (rng.range(lo as f32, hi as f32 + 1.0) as usize).clamp(lo, hi.max(lo));
    let base = rng.range(0.0, 2.0 * PI);
    // 這顆光點的菌絲整體偏長還是偏短
    let spot_scale = rng.range(0.5, 1.4);
    // 這顆光點的菌絲愛不愛分叉
    let fork_chance = cfg.wing_spot_fork_chance * rng.range(0.4, 1.3);
    let max_len = cfg.wing_spot_strand_length * spot_scale * 1.3;

    for k in 0..n {
        // 方向不平均分配，有的擠在一起、有的分得開
        let a = base + 2.0 * PI * k as f32 / n as f32 + rng.range(-0.6, 0.6);
        let len = cfg.wing_spot_strand_length * spot_scale * rng.range(0.45, 1.3);
        let start = (x + a.cos() * r * 0.8, z + a.sin() * r * 0.8);
        let width = r * rng.range(0.4, 0.6);
        let strand = Strand { start, angle: a, length: len, width, dist0: x + r, t0: 0.0, max_len, fork_chance, depth: 0 };
        grow(m, cfg, rng, strand);
    }
}

struct Strand {
    start: (f32, f32),
    angle: f32,
    length: f32,
    /// 起點的寬度（會一路變細）
    width: f32,
    /// 起點的能量距離
    dist0: f32,
    /// 起點離光點已經走了多遠（給淡出用）
    t0: f32,
    max_len: f32,
    /// 每一步分叉的機會（每顆光點不同）
    fork_chance: f32,
    depth: u32,
}

fn grow(m: &mut Mesh, cfg: &CreatureConfig, rng: &mut Rng, st: Strand) {
    // 越長的菌絲分越多段，彎曲才自然
    let steps = ((st.length / 0.014).ceil() as usize).clamp(3, 18);
    let step = st.length / steps as f32;
    let mut pts = vec![st.start];
    let mut along = vec![0.0f32];
    let (mut px, mut pz) = st.start;
    let mut a = st.angle;
    let mut forks: Vec<Strand> = Vec::new();

    let mut forks_made = 0;
    for i in 0..steps {
        a += rng.range(-0.3, 0.3); // 微微彎曲
        let (nx, nz) = (px + a.cos() * step, pz + a.sin() * step);
        if !inside(cfg, nx, nz, 0.006) {
            break;
        }
        px = nx;
        pz = nz;
        pts.push((px, pz));
        along.push(step * (i + 1) as f32);

        // 在中段隨機分叉（主幹最多分兩次，分枝最多再分一次）
        let mid = i >= 1 && i + 2 < steps;
        let max_forks = if st.depth == 0 { 2 } else { 1 };
        let per_step = st.fork_chance * 2.2 / steps as f32;
        if st.depth < 2 && mid && forks_made < max_forks && rng.next_f32() < per_step {
            forks_made += 1;
            let side = if rng.next_f32() < 0.5 { -1.0 } else { 1.0 };
            let done = step * (i + 1) as f32;
            let frac = 1.0 - (i + 1) as f32 / steps as f32;
            forks.push(Strand {
                start: (px, pz),
                angle: a + side * rng.range(0.45, 0.85),
                length: (st.length - done) * rng.range(0.5, 0.9),
                width: st.width * (0.25 + 0.75 * frac) * 0.75,
                dist0: st.dist0 + done,
                t0: st.t0 + done,
                max_len: st.max_len,
                fork_chance: st.fork_chance,
                depth: st.depth + 1,
            });
        }
    }

    if pts.len() >= 2 {
        ribbon(m, cfg, &pts, &along, &st);
    }
    for f in forks {
        grow(m, cfg, rng, f);
    }
}

/// 把折線做成貼在翅面上的細帶子，越往末端越細
fn ribbon(m: &mut Mesh, cfg: &CreatureConfig, pts: &[(f32, f32)], along: &[f32], st: &Strand) {
    let n = pts.len();
    let base = m.positions.len() as u32;
    for k in 0..n {
        let (x0, z0) = pts[k.saturating_sub(1)];
        let (x1, z1) = pts[(k + 1).min(n - 1)];
        let (dx, dz) = (x1 - x0, z1 - z0);
        let len = (dx * dx + dz * dz).sqrt().max(1e-6);
        let (perp_x, perp_z) = (-dz / len, dx / len);

        let f = k as f32 / (n - 1) as f32;
        let w = st.width * (1.0 - 0.75 * f) * 0.5;
        let (x, z) = pts[k];
        let dist = st.dist0 + along[k];
        let t = ((st.t0 + along[k]) / st.max_len).min(1.0);
        let s = x / cfg.wing_span;
        m.add_vertex(on_surface(cfg, x + perp_x * w, z + perp_z * w), [dist, -(1.0 + t)], s);
        m.add_vertex(on_surface(cfg, x - perp_x * w, z - perp_z * w), [dist, -(1.0 + t)], s);
    }
    for k in 0..(n - 1) as u32 {
        let (a, b, c, d) = (base + 2 * k, base + 2 * k + 1, base + 2 * k + 2, base + 2 * k + 3);
        m.add_tri(a, b, c);
        m.add_tri(b, d, c);
    }
}
