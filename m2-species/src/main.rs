//! 產生生物與環境的 3D 資料，寫進 web/creature_data.js 和 web/environment_data.js 給瀏覽器的檢視器讀取。
//!
//! 執行：cargo run
//! 然後用瀏覽器打開 web/index.html。

mod creature;
mod environment;
mod hyphae;
mod math;
mod mesh;
mod wing_glow;

use std::fs;
use std::path::{Path, PathBuf};

/// 資料檔要寫到哪裡：有 web/ 資料夾就寫進去；沒有的話（例如放在作品集的 m2-species/），
/// 就寫在和 Cargo.toml 同一層，跟 index.html 放在一起。
fn output_dir() -> PathBuf {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let web = root.join("web");
    if web.is_dir() { web } else { root.to_path_buf() }
}

fn main() {
    let cfg = creature::CreatureConfig::default();
    let creature = creature::build(&cfg);

    let json = creature.to_json(&cfg);
    let js = format!(
        "// 這個檔案由 `cargo run` 自動產生，請不要手動修改。\nwindow.CREATURE_DATA = {};\n",
        json
    );

    let out = output_dir().join("creature_data.js");
    fs::write(&out, js).expect("無法寫入 web/creature_data.js");

    println!("已產生「{}」的 3D 資料：", cfg.name);
    for p in &creature.parts {
        println!(
            "  {:<11} 頂點 {:>5}  三角形 {:>5}",
            p.name,
            p.mesh.positions.len(),
            p.mesh.indices.len() / 3
        );
    }
    println!("輸出到 {}", out.display());

    // 環境
    let env_cfg = environment::EnvironmentConfig::default();
    let env = environment::build(&env_cfg);
    let env_js = format!(
        "// 這個檔案由 `cargo run` 自動產生，請不要手動修改。\nwindow.ENVIRONMENT_DATA = {};\n",
        env.to_json(&env_cfg)
    );
    let env_out = output_dir().join("environment_data.js");
    fs::write(&env_out, env_js).expect("無法寫入 web/environment_data.js");
    println!("已產生環境：");
    for (name, _, mesh) in env.parts() {
        println!("  {:<11} 頂點 {:>6}  三角形 {:>6}", name, mesh.positions.len(), mesh.indices.len() / 3);
    }
    println!("  碰撞形狀：方塊 {} 個、圓柱 {} 個", env.structures.boxes.len(), env.structures.cyls.len());
    println!("輸出到 {}", env_out.display());
    println!("用瀏覽器打開 index.html 就能看到。");
}
