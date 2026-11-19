//! 感光點：身體前端左右兩邊各一小群，小小的、淡淡的光斑。
//!
//! 設定：牠住在昏暗的廢墟（之後還要到黑暗的地底繁殖），不是真正的眼睛，
//! 而是用來感覺光從哪個方向來的感光斑。
//!
//! 每顆感光點是一片貼在身體表面的小圓片。每個頂點記錄：
//!   uv.x = 離圓心多遠（0 圓心 → 1 邊緣），檢視器用它畫出「深色的中心 + 一圈微光」
//!   uv.y = 第幾顆

use crate::creature::{BodyShape, CreatureConfig};
use crate::math::Vec3;
use crate::mesh::Mesh;
use std::f32::consts::PI;

pub fn build(cfg: &CreatureConfig, shape: &BodyShape) -> Mesh {
    const SEGS: usize = 16;
    let mut m = Mesh::new();
    let mut index = 0.0;

    for side in [1.0f32, -1.0] {
        for &(z, phi_deg, size) in &cfg.eye_spots {
            // 右邊用設定的角度；左邊鏡射（角度從 +x 量起，90° 是正上方）
            let phi = if side > 0.0 { phi_deg.to_radians() } else { PI - phi_deg.to_radians() };
            let p = shape.surface(z, phi);
            // 用附近兩點算出表面的方向（法線）
            let dz = shape.surface(z + 0.01, phi) - shape.surface(z - 0.01, phi);
            let dphi = shape.surface(z, phi + 0.01) - shape.surface(z, phi - 0.01);
            let mut n = dz.cross(dphi).normalize_or(Vec3::new(0.0, 1.0, 0.0));
            if n.dot(p - Vec3::new(0.0, shape.axis_y(z), z)) < 0.0 {
                n = -n; // 確保朝外
            }
            let tu = dz.normalize_or(Vec3::new(0.0, 0.0, 1.0));
            let tv = n.cross(tu);
            let c = p + n * 0.004; // 稍微浮在表面上

            let center = m.add_vertex(c, [0.0, index], 0.0);
            for j in 0..SEGS {
                let a = 2.0 * PI * j as f32 / SEGS as f32;
                // 貼著弧面：越往外圍越往身體裡收一點
                let q = c + tu * (a.cos() * size) + tv * (a.sin() * size) - n * (size * size * 2.0);
                m.add_vertex(q, [1.0, index], 0.0);
            }
            for j in 0..SEGS as u32 {
                m.add_tri(center, center + 1 + j, center + 1 + (j + 1) % SEGS as u32);
            }
            // 法線都用表面的方向（一片小圓片，要看起來平滑）
            let start = m.normals.len() - (SEGS + 1);
            for nn in &mut m.normals[start..] {
                *nn = n;
            }
            index += 1.0;
        }
    }
    m
}
