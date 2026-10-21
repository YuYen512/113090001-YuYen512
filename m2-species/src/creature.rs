//! 生物的造型定義：所有尺寸、顏色都集中在 CreatureConfig，改這裡就能改外觀。
//!
//! 座標系：y 朝上，z 朝前（頭在 +z，尾巴在 -z），x 朝生物的右側。

use crate::hyphae;
use crate::wing_glow;
use crate::math::Vec3;
use crate::mesh::{fmt_f, fmt_rgb, fmt_vec3, Mesh};
use std::f32::consts::PI;

/// 翅膀外輪廓的樣式（翅膀內部都沒有紋理，只差在外形）
#[derive(Clone, Copy, PartialEq)]
#[allow(dead_code)] // 沒用到的那一種樣式也保留著，方便切換
pub enum WingStyle {
    /// 原本的昆蟲薄翼：橢圓、圓弧翅尖
    Insect,
    /// 鳥／天使翅膀：前緣有腕部隆起、翅尖往後掠，後緣是一根根羽毛末端的弧形
    Bird,
}

pub struct CreatureConfig {
    pub name: &'static str,

    // ── 水滴形身體 ──
    /// 頭到尾的總長度
    pub body_length: f32,
    /// 最粗處的半徑
    pub body_radius: f32,
    /// 尾巴收尖的程度（越大尾巴越細長）
    pub body_taper: f32,
    /// 上下壓扁比例（1 = 正圓截面）
    pub body_flatten: f32,
    /// 尾尖往上翹的高度
    pub tail_lift: f32,
    pub body_rings: usize,
    pub body_segments: usize,
    /// 內層殼相對外殼的大小（做出果凍般的層次感）
    pub inner_scale: f32,

    // ── 發光核心 ──
    pub core_radius: f32,
    pub core_position: Vec3,

    // ── 共生菌絲（從核心往外長，脈動沿著它擴散）──
    /// 從核心長出的主菌絲數量
    pub hypha_count: usize,
    /// 亂數種子：換一個數字就會長出不同的菌絲形狀
    pub hypha_seed: u64,
    /// 每一步生長的長度
    pub hypha_step: f32,
    /// 主菌絲最多長幾步
    pub hypha_max_steps: usize,
    /// 每一步長出分枝的機率（0~1）
    pub hypha_branch_chance: f32,
    /// 最多分岔幾層（分枝上再長分枝）
    pub hypha_max_depth: u32,
    /// 菌絲根部 / 末端的粗細（半徑）
    pub hypha_radius: f32,
    pub hypha_tip_radius: f32,

    // ── 薄翼（以右翼為準，左翼自動鏡射）──
    /// 翅膀外形：WingStyle::Bird（鳥／天使）或 WingStyle::Insect（原本的薄翼）
    pub wing_style: WingStyle,
    /// 鳥翅後緣的羽毛數量
    pub wing_feathers: usize,
    /// 每根羽毛弧形往外側歪的程度（1 = 最高點在正中間，越大最高點越偏外側）
    pub wing_feather_lean: f32,
    pub wing_span: f32,
    pub wing_chord: f32,
    /// 翅尖往後掠的量
    pub wing_sweep: f32,
    /// 翅根接在身體上的位置（右側）
    pub wing_root: Vec3,
    /// 靜止時翅膀往上抬的角度
    pub wing_rest_angle_deg: f32,

    // ── 翅膀上的光點與從光點長出的小菌絲 ──
    /// 光點之間的大概間距（越小光點越多）
    pub wing_spot_cell: f32,
    /// 每一格有光點的機率（0~1）
    pub wing_spot_chance: f32,
    /// 光點半徑
    pub wing_spot_size: f32,
    /// 每顆光點長出幾根小菌絲（最少, 最多）
    pub wing_spot_strands: (usize, usize),
    /// 小菌絲的長度
    pub wing_spot_strand_length: f32,
    /// 小菌絲分叉的機率（0~1）
    pub wing_spot_fork_chance: f32,
    pub wing_spot_seed: u64,

    // ── 顏色（0~1 的 RGB）──
    pub body_color: [f32; 3],
    pub core_color: [f32; 3],
    pub wing_color: [f32; 3],
}

impl Default for CreatureConfig {
    fn default() -> Self {
        CreatureConfig {
            name: "想像生物",
            body_length: 2.0,
            body_radius: 0.62,
            body_taper: 1.6,
            body_flatten: 0.9,
            tail_lift: 0.08,
            body_rings: 44,
            body_segments: 40,
            inner_scale: 0.78,

            core_radius: 0.17,
            core_position: Vec3::new(0.0, 0.02, 0.4),

            hypha_count: 12,
            hypha_seed: 20261022,
            hypha_step: 0.04,
            hypha_max_steps: 30,
            hypha_branch_chance: 0.22,
            hypha_max_depth: 3,
            hypha_radius: 0.0075,
            hypha_tip_radius: 0.0022,

            wing_style: WingStyle::Bird,
            wing_feathers: 8,
            wing_feather_lean: 1.7,
            wing_span: 2.6,
            wing_chord: 0.78,
            wing_sweep: 0.3,
            // 翅根埋在身體裡面，拍動時翅根也不會露出身體外
            wing_root: Vec3::new(0.12, 0.3, 0.36),
            wing_rest_angle_deg: 12.0,

            wing_spot_cell: 0.18,
            wing_spot_chance: 0.4,
            wing_spot_size: 0.012,
            wing_spot_strands: (3, 6),
            wing_spot_strand_length: 0.17,
            wing_spot_fork_chance: 0.8,
            wing_spot_seed: 512,

            body_color: [0.62, 0.82, 0.95],
            core_color: [0.55, 1.0, 0.9],
            wing_color: [0.75, 0.88, 1.0],
        }
    }
}

pub struct Bone {
    pub name: &'static str,
    /// 父骨骼的索引，-1 代表沒有父骨骼（根）
    pub parent: i32,
    /// 相對父骨骼的位置（也是旋轉的支點）
    pub pivot: Vec3,
}

pub struct Part {
    pub name: &'static str,
    pub bone: &'static str,
    /// 檢視器用哪一種材質畫它："body" / "wing" / "core" / "hypha" / "wing_glow"
    pub material: &'static str,
    pub alpha: f32,
    pub mesh: Mesh,
}

pub struct Creature {
    pub bones: Vec<Bone>,
    pub parts: Vec<Part>,
}

pub fn build(cfg: &CreatureConfig) -> Creature {
    let wr = cfg.wing_root;
    let bones = vec![
        Bone { name: "root", parent: -1, pivot: Vec3::new(0.0, 0.0, 0.0) },
        Bone { name: "core", parent: 0, pivot: cfg.core_position },
        Bone { name: "wing_r", parent: 0, pivot: wr },
        Bone { name: "wing_l", parent: 0, pivot: Vec3::new(-wr.x, wr.y, wr.z) },
    ];

    let wing_r = wing_mesh(cfg);
    let wing_l = wing_r.mirror_x();
    let glow_r = wing_glow::build(cfg);
    let glow_l = glow_r.mirror_x();

    let parts = vec![
        Part { name: "core", bone: "core", material: "core", alpha: 1.0, mesh: sphere_mesh(cfg.core_radius, 18, 24) },
        Part { name: "inner_body", bone: "root", material: "body", alpha: 0.45, mesh: body_mesh(cfg, cfg.inner_scale) },
        Part { name: "hyphae", bone: "root", material: "hypha", alpha: 1.0, mesh: hyphae::build(cfg, &BodyShape::new(cfg)) },
        Part { name: "body", bone: "root", material: "body", alpha: 1.0, mesh: body_mesh(cfg, 1.0) },
        Part { name: "wing_r", bone: "wing_r", material: "wing", alpha: 1.0, mesh: wing_r },
        Part { name: "wing_l", bone: "wing_l", material: "wing", alpha: 1.0, mesh: wing_l },
        Part { name: "wing_glow_r", bone: "wing_r", material: "wing_glow", alpha: 1.0, mesh: glow_r },
        Part { name: "wing_glow_l", bone: "wing_l", material: "wing_glow", alpha: 1.0, mesh: glow_l },
    ];

    Creature { bones, parts }
}

/// 旋轉體：沿 z 軸一圈一圈產生頂點。
/// `place(theta, phi)` 回傳 (位置, 權重)；theta 從 0（-z 端）到 PI（+z 端）。
fn lathe(rings: usize, segs: usize, place: impl Fn(f32, f32) -> (Vec3, f32)) -> Mesh {
    let mut m = Mesh::new();

    let (p, w) = place(0.0, 0.0);
    let back_pole = m.add_vertex(p, [0.5, 0.0], w);

    for i in 1..rings {
        let theta = PI * i as f32 / rings as f32;
        for j in 0..segs {
            let phi = 2.0 * PI * j as f32 / segs as f32;
            let (p, w) = place(theta, phi);
            m.add_vertex(p, [j as f32 / segs as f32, i as f32 / rings as f32], w);
        }
    }

    let (p, w) = place(PI, 0.0);
    let front_pole = m.add_vertex(p, [0.5, 1.0], w);

    let ring = |i: usize| 1 + ((i - 1) * segs) as u32;
    let s = segs as u32;

    for j in 0..s {
        let (a, b) = (ring(1) + j, ring(1) + (j + 1) % s);
        m.add_tri(back_pole, b, a);
    }
    for i in 1..rings - 1 {
        for j in 0..s {
            let a = ring(i) + j;
            let b = ring(i) + (j + 1) % s;
            let c = ring(i + 1) + (j + 1) % s;
            let d = ring(i + 1) + j;
            m.add_tri(a, b, c);
            m.add_tri(a, c, d);
        }
    }
    let last = ring(rings - 1);
    for j in 0..s {
        let (a, b) = (last + j, last + (j + 1) % s);
        m.add_tri(a, b, front_pole);
    }

    m.compute_normals();
    m
}

/// 水滴形身體的輪廓。頭部圓潤（+z），尾巴收尖（-z）。
/// 輪廓公式 r(θ) = sin θ · sin(θ/2)^taper，是經典的水滴曲線。
/// 身體網格和菌絲（判斷有沒有長出身體外）都用它。
pub struct BodyShape {
    pub half: f32,
    radius: f32,
    taper: f32,
    max_raw: f32,
    flatten: f32,
    tail_lift: f32,
}

impl BodyShape {
    pub fn new(cfg: &CreatureConfig) -> Self {
        let raw = |th: f32| th.sin() * (th * 0.5).sin().powf(cfg.body_taper);
        let max_raw = (0..=1000).map(|i| raw(PI * i as f32 / 1000.0)).fold(0.0f32, f32::max);
        BodyShape {
            half: cfg.body_length * 0.5,
            radius: cfg.body_radius,
            taper: cfg.body_taper,
            max_raw,
            flatten: cfg.body_flatten,
            tail_lift: cfg.tail_lift,
        }
    }

    fn radius_at_theta(&self, theta: f32) -> f32 {
        theta.sin() * (theta * 0.5).sin().powf(self.taper) / self.max_raw * self.radius
    }

    /// 擺尾動畫的權重：身體中段 = 0，尾尖 = 1（取平方讓擺動集中在後段）。
    pub fn tail_weight(&self, z: f32) -> f32 {
        let t = (-z / self.half).clamp(0.0, 1.0);
        t * t
    }

    /// 點 p 在身體裡的「深度比例」：0 = 中心軸，1 = 剛好在表面，大於 1 = 在身體外。
    pub fn fill_ratio(&self, p: Vec3) -> f32 {
        if p.z.abs() >= self.half {
            return f32::INFINITY;
        }
        let theta = (-p.z / self.half).acos();
        let r = self.radius_at_theta(theta).max(1e-4);
        let y = (p.y - self.tail_lift * self.tail_weight(p.z)) / self.flatten;
        (p.x * p.x + y * y).sqrt() / r
    }
}

fn body_mesh(cfg: &CreatureConfig, scale: f32) -> Mesh {
    let shape = BodyShape::new(cfg);
    let half = shape.half * scale;

    lathe(cfg.body_rings, cfg.body_segments, |theta, phi| {
        let z = -theta.cos() * half;
        let r = shape.radius_at_theta(theta) * scale;
        let w = shape.tail_weight(z / scale);
        let x = r * phi.cos();
        let y = r * phi.sin() * cfg.body_flatten + cfg.tail_lift * scale * w;
        (Vec3::new(x, y, z), w)
    })
}

fn sphere_mesh(radius: f32, rings: usize, segs: usize) -> Mesh {
    lathe(rings, segs, |theta, phi| {
        let r = theta.sin() * radius;
        (Vec3::new(r * phi.cos(), r * phi.sin(), -theta.cos() * radius), 0.0)
    })
}

/// 某個展向位置 s（0 翅根 → 1 翅尖）的翅膀外形，回傳 z 座標：
/// (前緣, 後緣（含羽毛缺口）, 平滑後緣（不含缺口，用來算翅面弧度）)
pub fn wing_outline(cfg: &CreatureConfig, s: f32) -> (f32, f32, f32) {
    let w = cfg.wing_chord;
    match cfg.wing_style {
        WingStyle::Insect => {
            // 翅根窄 → 中段最寬 → 翅尖圓弧收起
            let grow = (PI * 0.5 * (s / 0.5).min(1.0)).sin();
            let shape = (0.32 + 0.68 * grow) * (1.0 - s.powi(6)).max(0.0).sqrt();
            let chord = w * shape;
            let mid = -0.1 * w - cfg.wing_sweep * s * s;
            let trail = mid - 0.58 * chord;
            (mid + 0.42 * chord, trail, trail)
        }
        WingStyle::Bird => {
            // 前緣：從翅根往前升到「腕部」，之後大幅往後掠，收到後方尖尖的翅尖
            let wrist = 0.4;
            let lead = if s < wrist {
                w * (0.05 + 0.3 * (PI * 0.5 * s / wrist).sin())
            } else {
                let u = (s - wrist) / (1.0 - wrist);
                w * 0.35 - w * (1.2 + cfg.wing_sweep) * u.powf(1.5)
            };

            // 後緣：內側（次級飛羽）較短，往外側（初級飛羽）越來越往後延伸，在翅尖和前緣會合
            let tip = w * 0.35 - w * (1.2 + cfg.wing_sweep);
            // 外側再往後鼓出一片（初級飛羽的扇形），在翅尖收回
            let fan = w * 0.5 * 6.75 * s * s * (1.0 - s);
            let trail_base = -w * 0.7 + (tip + w * 0.7) * s.powf(1.3) - fan;
            let chord = (lead - trail_base).max(0.0);

            // 每根羽毛末端是一段拋物線，羽毛之間是小缺口。
            // 用 s^0.6 分配羽毛：越往外側羽毛越寬，弧形由外到內、由大到小。
            let n = cfg.wing_feathers.max(1) as f32;
            let f = (s.powf(0.6) * n).fract();
            // 最高點偏向外側（像被風吹歪的浪）：
            //   內側：一段圓弧，飽滿地升到最高點
            //   頂端：圓圓的弧頂（不是尖角）
            //   外側：先圓滑地彎下來，越接近缺口落得越陡
            let peak = 0.5f32.powf(1.0 / cfg.wing_feather_lean.max(1.0));
            let feather_tip = if f < peak {
                let x = (peak - f) / peak;
                (1.0 - x * x).max(0.0).powf(0.6)
            } else {
                let x = (f - peak) / (1.0 - peak);
                (1.0 - x.powf(2.6)).max(0.0).powf(0.8)
            };
            // 這個位置一根羽毛有多寬（世界單位），缺口深度跟著羽毛寬度變化
            let feather_width = cfg.wing_span * s.max(1e-3).powf(0.4) / (0.6 * n);
            let depth = (0.35 * feather_width).min(chord * 0.45) * smoothstep(0.0, 0.08, s);
            let trail = trail_base + depth * (1.0 - feather_tip);

            (lead, trail.min(lead - 0.002), trail_base)
        }
    }
}

fn smoothstep(a: f32, b: f32, x: f32) -> f32 {
    let t = ((x - a) / (b - a)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

/// 翅面在 (展向 s, z) 的高度。翅面弧度只看平滑的外形，所以羽毛缺口不會在翅面上造成摺痕。
pub fn wing_surface_y(cfg: &CreatureConfig, s: f32, z: f32) -> f32 {
    let (lead, _, trail_base) = wing_outline(cfg, s);
    let smooth_chord = (lead - trail_base).max(1e-4);
    let vb = ((z - trail_base) / smooth_chord).clamp(0.0, 1.0);
    0.08 * cfg.wing_span * s * s + 0.06 * smooth_chord * (PI * vb).sin()
}

/// 右側翅膀。翅根在原點，往 +x 延伸；u = 展向（0 翅根→1 翅尖），v = 弦向（0 後緣→1 前緣）。
fn wing_mesh(cfg: &CreatureConfig) -> Mesh {
    // 鳥翅的羽毛缺口需要比較細的網格才畫得出來
    let ns = if cfg.wing_style == WingStyle::Bird { 200 } else { 32 };
    let nc = 10;
    let mut m = Mesh::new();

    for i in 0..=ns {
        let s = i as f32 / ns as f32;
        let (lead, trail, _) = wing_outline(cfg, s);
        let x = cfg.wing_span * s;

        for j in 0..=nc {
            let v = j as f32 / nc as f32;
            let z = trail + (lead - trail) * v;
            m.add_vertex(Vec3::new(x, wing_surface_y(cfg, s, z), z), [s, v], s);
        }
    }

    let idx = |i: usize, j: usize| (i * (nc + 1) + j) as u32;
    for i in 0..ns {
        for j in 0..nc {
            let (a, b, c, d) = (idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1));
            m.add_tri(a, c, b);
            m.add_tri(a, d, c);
        }
    }

    m.compute_normals();
    m
}

impl Creature {
    pub fn to_json(&self, cfg: &CreatureConfig) -> String {
        let bones: Vec<String> = self
            .bones
            .iter()
            .map(|b| format!("{{\"name\":\"{}\",\"parent\":{},\"pivot\":{}}}", b.name, b.parent, fmt_vec3(b.pivot)))
            .collect();
        let parts: Vec<String> = self
            .parts
            .iter()
            .map(|p| {
                format!(
                    "{{\"name\":\"{}\",\"bone\":\"{}\",\"material\":\"{}\",\"alpha\":{},\"mesh\":{}}}",
                    p.name,
                    p.bone,
                    p.material,
                    fmt_f(p.alpha),
                    p.mesh.to_json()
                )
            })
            .collect();

        format!(
            "{{\"name\":\"{}\",\"colors\":{{\"body\":{},\"core\":{},\"wing\":{}}},\
             \"params\":{{\"wing_rest_angle_deg\":{},\"wing_span\":{},\"core_radius\":{},\
             \"body_length\":{},\"body_radius\":{},\"body_taper\":{},\"body_flatten\":{},\"tail_lift\":{}}},\
             \"bones\":[{}],\"parts\":[{}]}}",
            cfg.name,
            fmt_rgb(cfg.body_color),
            fmt_rgb(cfg.core_color),
            fmt_rgb(cfg.wing_color),
            fmt_f(cfg.wing_rest_angle_deg),
            fmt_f(cfg.wing_span),
            fmt_f(cfg.core_radius),
            fmt_f(cfg.body_length),
            fmt_f(cfg.body_radius),
            fmt_f(cfg.body_taper),
            fmt_f(cfg.body_flatten),
            fmt_f(cfg.tail_lift),
            bones.join(","),
            parts.join(",")
        )
    }
}
