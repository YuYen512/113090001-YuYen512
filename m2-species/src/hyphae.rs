//! 共生菌絲：從發光核心往外生長、會分岔的細絲，全部長在身體裡面。
//!
//! 每個頂點記錄「沿著菌絲離核心多遠」（存在 uv.x），
//! 檢視器用這個距離讓脈動從核心沿著菌絲一路擴散出去。

use crate::creature::{BodyShape, CreatureConfig};
use crate::math::Vec3;
use crate::mesh::Mesh;
use std::f32::consts::PI;

/// 簡單的偽亂數（xorshift），固定種子 → 每次產生的菌絲都一樣。
pub struct Rng(pub u64);

impl Rng {
    pub fn next_f32(&mut self) -> f32 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        (x >> 40) as f32 / (1u64 << 24) as f32
    }

    pub fn range(&mut self, a: f32, b: f32) -> f32 {
        a + (b - a) * self.next_f32()
    }

    /// 單位球內均勻的隨機向量
    fn in_sphere(&mut self) -> Vec3 {
        loop {
            let v = Vec3::new(self.range(-1.0, 1.0), self.range(-1.0, 1.0), self.range(-1.0, 1.0));
            if v.length() <= 1.0 {
                return v;
            }
        }
    }
}

/// 一條菌絲（一段折線）
struct Strand {
    points: Vec<Vec3>,
    /// 每個點沿著菌絲到核心的距離
    dists: Vec<f32>,
    /// 根部粗細（分枝會比主幹細）
    radius: f32,
}

struct Grower<'a> {
    cfg: &'a CreatureConfig,
    shape: &'a BodyShape,
    rng: Rng,
    strands: Vec<Strand>,
}

impl<'a> Grower<'a> {
    fn grow(&mut self, start: Vec3, mut dir: Vec3, start_dist: f32, steps: usize, radius: f32, depth: u32) {
        let step = self.cfg.hypha_step;
        let mut p = start;
        let mut dist = start_dist;
        let mut points = vec![p];
        let mut dists = vec![dist];

        for i in 0..steps {
            // 隨機彎曲，讓菌絲看起來是自然長出來的
            dir = (dir + self.rng.in_sphere() * 0.5).normalize_or(dir);
            let mut next = p + dir * step;

            // 快碰到身體表面時轉向身體中心
            if self.shape.fill_ratio(next) > 0.78 {
                let inward = (Vec3::new(0.0, 0.0, p.z) - p).normalize_or(-dir);
                dir = (dir + inward * 1.2).normalize_or(inward);
                next = p + dir * step;
                if self.shape.fill_ratio(next) > 0.86 {
                    break;
                }
            }

            p = next;
            dist += step;
            points.push(p);
            dists.push(dist);

            // 分岔
            if depth < self.cfg.hypha_max_depth && i > 1 && self.rng.next_f32() < self.cfg.hypha_branch_chance {
                let side = (dir + self.rng.in_sphere() * 1.3).normalize_or(dir);
                let rest = ((steps - i) as f32 * 0.6) as usize;
                if rest > 2 {
                    self.grow(p, side, dist, rest, radius * 0.65, depth + 1);
                }
            }
        }

        if points.len() >= 2 {
            self.strands.push(Strand { points, dists, radius });
        }
    }
}

pub fn build(cfg: &CreatureConfig, shape: &BodyShape) -> Mesh {
    let mut g = Grower { cfg, shape, rng: Rng(cfg.hypha_seed.max(1)), strands: Vec::new() };

    for k in 0..cfg.hypha_count {
        // 主菌絲平均分散在核心周圍，稍微偏向後方（尾巴那一側比較長）
        let a = 2.0 * PI * (k as f32 + g.rng.range(-0.3, 0.3)) / cfg.hypha_count as f32;
        let around = Vec3::new(a.cos(), a.sin() * 0.8, 0.0);
        let dir = (around + Vec3::new(0.0, 0.0, g.rng.range(-1.1, 0.3))).normalize_or(around);
        let start = cfg.core_position + dir * (cfg.core_radius * 0.85);
        let steps = (cfg.hypha_max_steps as f32 * g.rng.range(0.7, 1.0)) as usize;
        g.grow(start, dir, 0.0, steps, cfg.hypha_radius, 0);
    }

    tube_mesh(&g.strands, cfg.hypha_tip_radius, shape)
}

/// 把每條折線包成細細的管子。
fn tube_mesh(strands: &[Strand], tip_radius: f32, shape: &BodyShape) -> Mesh {
    const SIDES: usize = 5;
    let mut m = Mesh::new();

    for s in strands {
        let n = s.points.len();
        let base = m.positions.len() as u32;

        // 沿著管子平行移動的參考方向，避免管子扭來扭去
        let first_t = (s.points[1] - s.points[0]).normalize_or(Vec3::new(0.0, 0.0, 1.0));
        let mut normal = first_t.cross(Vec3::new(0.0, 1.0, 0.0)).normalize_or(Vec3::new(1.0, 0.0, 0.0));

        for k in 0..n {
            let prev = s.points[k.saturating_sub(1)];
            let next = s.points[(k + 1).min(n - 1)];
            let t = (next - prev).normalize_or(first_t);
            normal = (normal - t * normal.dot(t)).normalize_or(normal);
            let binormal = t.cross(normal);

            let f = k as f32 / (n - 1) as f32;
            let r = s.radius + (tip_radius - s.radius) * f;
            let p = s.points[k];
            let w = shape.tail_weight(p.z);

            for j in 0..SIDES {
                let a = 2.0 * PI * j as f32 / SIDES as f32;
                let offset = normal * (a.cos() * r) + binormal * (a.sin() * r);
                m.add_vertex(p + offset, [s.dists[k], j as f32 / SIDES as f32], w);
            }
        }

        for k in 0..n - 1 {
            for j in 0..SIDES {
                let a = base + (k * SIDES + j) as u32;
                let b = base + (k * SIDES + (j + 1) % SIDES) as u32;
                let c = b + SIDES as u32;
                let d = a + SIDES as u32;
                m.add_tri(a, b, c);
                m.add_tri(a, c, d);
            }
        }
    }

    m.compute_normals();
    m
}
