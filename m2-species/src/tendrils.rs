//! 尾巴的孢子觸手：從尾端長出幾條細長、像水母觸手一樣的發光絲，末端有一顆小小的孢子囊。
//!
//! 設定：牠幫真菌散播孢子，尾巴慢慢進化成專門撒孢子的器官。
//! 飛行時觸手拖在身後飄動，孢子從末端的孢子囊灑出來（灑孢子在 viewer.js 的 updateSpores）。
//!
//! 每個頂點記錄：
//!   uv.x = 沿著菌絲和觸手到核心的距離（讓核心的脈動一路流到觸手末端）
//!   uv.y = 觸手編號 + 在觸手上的位置 t（0 根部 → 1 末端），檢視器用它讓每條觸手各自飄動
//!   weight = t

use crate::creature::{BodyShape, CreatureConfig};
use crate::hyphae::Rng;
use crate::math::Vec3;
use crate::mesh::Mesh;
use std::f32::consts::PI;

/// 孢子囊中心在觸手上的位置（t），檢視器從這裡灑孢子
pub const BULB_T: f32 = 0.93;

pub struct Tendrils {
    pub mesh: Mesh,
    /// 每條觸手末端孢子囊的中心（還沒套動畫前的位置）
    pub tips: Vec<Vec3>,
}

pub fn build(cfg: &CreatureConfig, shape: &BodyShape) -> Tendrils {
    const SEGS: usize = 40; // 每條觸手分幾段
    const SIDES: usize = 6; // 管子的截面是幾邊形
    let mut rng = Rng(cfg.tendril_seed.max(1));
    let mut mesh = Mesh::new();
    let mut tips = Vec::new();
    let n = cfg.tendril_count.max(1);

    for k in 0..n {
        // 根部：平均分布在尾端附近的一小圈上（稍微埋進身體裡，看起來是從身體長出來的）
        let a = 2.0 * PI * (k as f32 + rng.range(-0.2, 0.2)) / n as f32 + 0.4;
        let z0 = -shape.half * 0.9;
        let ring = shape.surface(z0, a);
        let center = Vec3::new(0.0, shape.axis_y(z0), z0);
        let start = center + (ring - center) * 0.55;

        // 方向：主要往後，稍微往外張開
        let out = (ring - center).normalize_or(Vec3::new(0.0, 1.0, 0.0));
        let len = cfg.tendril_length * rng.range(0.75, 1.0);
        let spread = cfg.tendril_spread * rng.range(0.7, 1.2);
        // 每條觸手的彎曲各不相同
        let (w1, w2) = (rng.range(-1.0, 1.0), rng.range(-1.0, 1.0));
        let side = Vec3::new(-out.y, out.x, 0.0);

        let core_to_start = (start - cfg.core_position).length();
        let point = |t: f32| -> Vec3 {
            let back = Vec3::new(0.0, 0.0, -len * t);
            let open = out * (spread * len * (t * 1.2).min(1.0).sqrt() * t);
            let wiggle = side * (0.06 * len * w1 * (PI * t).sin()) + out * (0.04 * len * w2 * (2.0 * PI * t).sin());
            start + back + open + wiggle
        };

        let base = mesh.positions.len() as u32;
        let mut normal = Vec3::new(0.0, 1.0, 0.0);
        let mut dist = core_to_start;
        let mut prev_p = point(0.0);
        for i in 0..=SEGS {
            let t = i as f32 / SEGS as f32;
            let p = point(t);
            dist += (p - prev_p).length();
            prev_p = p;
            let tan = (point((t + 0.01).min(1.0)) - point((t - 0.01).max(0.0))).normalize_or(Vec3::new(0.0, 0.0, -1.0));
            normal = (normal - tan * normal.dot(tan)).normalize_or(Vec3::new(1.0, 0.0, 0.0));
            let binormal = tan.cross(normal);

            // 粗細：根部最粗、往末端變細，最後鼓成一顆圓圓的孢子囊
            let stalk = cfg.tendril_radius + (cfg.tendril_radius * 0.3 - cfg.tendril_radius) * t;
            let u = ((t - 0.86) / 0.14).clamp(0.0, 1.0);
            let bulb = cfg.tendril_bulb * (PI * u).sin().max(0.0).sqrt();
            let r = if i == SEGS { 0.0 } else { stalk.max(bulb) };

            for j in 0..SIDES {
                let ang = 2.0 * PI * j as f32 / SIDES as f32;
                let off = normal * (ang.cos() * r) + binormal * (ang.sin() * r);
                mesh.add_vertex(p + off, [dist, k as f32 + t * 0.999], t);
            }
        }
        for i in 0..SEGS {
            for j in 0..SIDES {
                let a = base + (i * SIDES + j) as u32;
                let b = base + (i * SIDES + (j + 1) % SIDES) as u32;
                let c = b + SIDES as u32;
                let d = a + SIDES as u32;
                mesh.add_tri(a, b, c);
                mesh.add_tri(a, c, d);
            }
        }
        tips.push(point(BULB_T));
    }

    mesh.compute_normals();
    Tendrils { mesh, tips }
}
