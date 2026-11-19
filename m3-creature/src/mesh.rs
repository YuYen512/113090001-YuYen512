//! 三角網格：頂點位置、法線、UV、權重（給檢視器做彎曲動畫用）與索引。

use crate::math::Vec3;

#[derive(Clone, Default)]
pub struct Mesh {
    pub positions: Vec<Vec3>,
    pub normals: Vec<Vec3>,
    pub uvs: Vec<[f32; 2]>,
    /// 每個頂點的動畫權重：身體 = 越靠尾巴越大；翅膀 = 越靠翅尖越大。
    pub weights: Vec<f32>,
    /// 頂點顏色（只有環境用；生物的網格沒有顏色，這個陣列是空的）
    pub colors: Vec<[f32; 3]>,
    pub indices: Vec<u32>,
}

impl Mesh {
    pub fn new() -> Self {
        Mesh::default()
    }

    pub fn add_vertex(&mut self, p: Vec3, uv: [f32; 2], weight: f32) -> u32 {
        self.positions.push(p);
        self.normals.push(Vec3::new(0.0, 1.0, 0.0));
        self.uvs.push(uv);
        self.weights.push(weight);
        (self.positions.len() - 1) as u32
    }

    /// 加入一個帶法線與顏色的頂點（環境用）。
    pub fn add_vertex_full(&mut self, p: Vec3, n: Vec3, uv: [f32; 2], weight: f32, color: [f32; 3]) -> u32 {
        self.positions.push(p);
        self.normals.push(n);
        self.uvs.push(uv);
        self.weights.push(weight);
        self.colors.push(color);
        (self.positions.len() - 1) as u32
    }

    /// 逆時針（從外面看）為正面。
    pub fn add_tri(&mut self, a: u32, b: u32, c: u32) {
        self.indices.extend_from_slice(&[a, b, c]);
    }

    /// 依三角形面積加權平均，算出平滑法線。
    pub fn compute_normals(&mut self) {
        let mut acc = vec![Vec3::default(); self.positions.len()];
        for t in self.indices.chunks(3) {
            let (a, b, c) = (t[0] as usize, t[1] as usize, t[2] as usize);
            let n = (self.positions[b] - self.positions[a]).cross(self.positions[c] - self.positions[a]);
            acc[a] = acc[a] + n;
            acc[b] = acc[b] + n;
            acc[c] = acc[c] + n;
        }
        self.normals = acc
            .into_iter()
            .map(|n| n.normalize_or(Vec3::new(0.0, 1.0, 0.0)))
            .collect();
    }

    /// 左右鏡射（x 取負），並翻轉三角形方向讓正面仍朝外。
    pub fn mirror_x(&self) -> Mesh {
        let mut m = self.clone();
        for p in &mut m.positions {
            p.x = -p.x;
        }
        for t in m.indices.chunks_mut(3) {
            t.swap(1, 2);
        }
        m.compute_normals();
        m
    }

    pub fn to_json(&self) -> String {
        self.to_json_with(4)
    }

    /// decimals = 位置、UV、權重要留幾位小數（環境很大，用 2 位就夠了，檔案小很多）
    pub fn to_json_with(&self, decimals: usize) -> String {
        let f = |x: f32| fmt_dec(x, decimals);
        let pos: Vec<String> = self
            .positions
            .iter()
            .flat_map(|p| [p.x, p.y, p.z])
            .map(f)
            .collect();
        let nrm: Vec<String> = self
            .normals
            .iter()
            .flat_map(|n| [n.x, n.y, n.z])
            .map(|x| fmt_dec(x, decimals))
            .collect();
        let uv: Vec<String> = self.uvs.iter().flat_map(|u| *u).map(f).collect();
        let w: Vec<String> = self.weights.iter().copied().map(f).collect();
        let idx: Vec<String> = self.indices.iter().map(|i| i.to_string()).collect();
        let colors = if !self.colors.is_empty() && self.colors.len() == self.positions.len() {
            let c: Vec<String> = self.colors.iter().flat_map(|c| *c).map(|x| fmt_dec(x, decimals.min(3))).collect();
            format!(",\"colors\":[{}]", c.join(","))
        } else {
            String::new()
        };
        format!(
            "{{\"positions\":[{}],\"normals\":[{}],\"uvs\":[{}],\"weights\":[{}],\"indices\":[{}]{}}}",
            pos.join(","),
            nrm.join(","),
            uv.join(","),
            w.join(","),
            idx.join(","),
            colors
        )
    }
}

/// 數字輸出到小數第 4 位並去掉多餘的 0，讓資料檔小一點。
pub fn fmt_f(x: f32) -> String {
    fmt_dec(x, 4)
}

pub fn fmt_dec(x: f32, decimals: usize) -> String {
    let mut s = format!("{:.*}", decimals, x);
    if s.contains('.') {
        while s.ends_with('0') {
            s.pop();
        }
        if s.ends_with('.') {
            s.pop();
        }
    }
    if s == "-0" {
        s = "0".to_string();
    }
    s
}

pub fn fmt_vec3(v: Vec3) -> String {
    format!("[{},{},{}]", fmt_f(v.x), fmt_f(v.y), fmt_f(v.z))
}

pub fn fmt_rgb(c: [f32; 3]) -> String {
    format!("[{},{},{}]", fmt_f(c[0]), fmt_f(c[1]), fmt_f(c[2]))
}
