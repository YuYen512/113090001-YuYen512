'use strict';
// =====================================================================
//  想像生物 · WebGL 檢視器（第一階段）
//  造型資料來自 Rust 產生的 creature_data.js；這裡只負責「畫出來」和「動起來」。
//  想調整動作，改下面的 CONFIG 就好。
// =====================================================================

const CONFIG = {
  startMode: 'fly',            // 'fly' 飛行 或 'hover' 漂浮
  modeBlendSpeed: 1.2,         // 兩種模式之間切換的速度

  // 漂浮：翅膀緩慢呼吸，核心光慢慢明滅
  hover: { flapFreq: 0.22, flapAmp: 9,  pulseBase: 0.55, pulseAmp: 0.30, bob: 0.04, pitchDeg: 2 },
  // 飛行：拍翅，每一次下拍核心就亮一次（flapFreq = 每秒拍幾下，脈動速度也跟著它）
  fly:   { flapFreq: 1.1,  flapAmp: 44, pulseBase: 0.35, pulseAmp: 1.25, bob: 0.11, pitchDeg: -7 },
  breatheSpeed: 0.7,           // 漂浮時核心呼吸的速度
  // 睡覺：像蝙蝠一樣倒過來飄在空中，翅膀收起來包住身體，脈動變慢變暗、不掉孢子
  sleep: {
    flapFreq: 0.1, flapAmp: 0, pulseBase: 0.12, pulseAmp: 0.22, bob: 0.015, pitchDeg: 0,
    breatheSpeed: 0.3,         // 睡著時呼吸／脈動的速度（越小越慢）
    glow: 0.35,                // 睡著時翅膀光點的亮度比例
    blendSpeed: 0.45,          // 入睡／醒來的過渡速度
    wrapFrom: -0.6,            // 收起的翅膀從身體哪裡開始包（z：尾巴 -1 → 頭 +1）
    wrapTo: 0.85,              // 包到哪裡（倒掛時翅膀像披風一樣往下垂，蓋到頭附近）
    wrapGap: 0.09,             // 翅膀和身體之間的空隙
    wrapAngle: 2.55,           // 翅膀從背脊往肚子包多深（弧度，越大包得越緊密）
    foldedOpacity: 1.8,        // 收起來的翅膀疊在一起，看起來比較不透明
  },
  flapsPerPulse: 3,            // 飛行時拍幾下翅膀才脈動一次（越大脈動越慢）
  pulseSharpness: 6,           // 能量波的集中程度（越大越像一道往外跑的光，越小越像整片亮起）

  // 菌絲上的能量傳遞
  energy: {
    flySpeed: 1.3,             // 飛行時脈動擴散的速度（單位/秒），從核心傳到翅尖約 2.5 秒
    hoverSpeed: 0.6,           // 漂浮時的擴散速度
    fade: 0.55,                // 離核心越遠光越弱的程度
  },

  tailSway: 0.07,
  wingBend: 0.00045,           // 翅尖因慣性落後的彎曲量
  featherDeg: 9,               // 拍翅時翅膀的扭轉角度
  // 翅膀碰到牆時自動往後收（像鳥在窄的地方收翅）
  wingFold: {
    maxDeg: 90,                // 最多往後收幾度（90° = 翅膀完全貼著身體往後）
    stepDeg: 10,               // 一次試幾度
    margin: 0.15,              // 翅膀和牆之間至少再多留多少空間（射線本身已經留 0.3）
    foldSpeed: 18,             // 收起來的速度（要快，才不會插進牆裡）
    openSpeed: 2.5,            // 張開的速度（慢一點比較自然）
    flapReduce: 0.6,           // 完全收起時，拍動幅度減少多少
  },
  // 翅膀上的光點與小菌絲（位置和形狀由 Rust 產生，這裡只管亮度）
  wingSpots: {
    rootDistance: 0.55,        // 翅根離核心多遠：決定脈動多晚傳到翅膀
    strandBrightness: 0.8,     // 小菌絲的亮度（越小越淡）
  },
  wingRootBlend: 0.42,         // 翅根埋在身體裡的這一段慢慢變透明，和身體自然接在一起

  // CHECK(D09): 觸手沒有碰撞，倒退貼牆時末端可能伸進牆裡（待決定要不要處理）
  // 尾巴的孢子觸手（形狀由 Rust 產生，這裡管飄動和亮度）
  tendrils: {
    waveSpeed: 1.6,            // 觸手波動的速度
    waveAmp: 0.12,             // 波動幅度（越往末端越大）
    droop: 0.2,                // 漂浮時往下垂的量（飛行時被氣流拉直，垂得比較少）
    turnLag: 0.2,              // 轉彎時觸手往外甩的量
    brightness: 0.6,           // 亮度
    sporeShare: 0.6,           // 孢子有多少比例是從觸手末端的孢子囊灑出來的（其餘從身體裡的菌絲）
  },
  // 感光點
  eyeSpots: {
    glow: 1.0,                 // 光點的亮度
    sleepGlow: 0.15,           // 睡著時剩多少（像閉上眼睛）
  },

  // 環境（夜晚的廢墟）：月光、環境光、霧
  environment: {
    moonDir: [-0.5, 0.7, 0.45],     // 月光從哪個方向照過來
    moonColor: [0.45, 0.52, 0.66],
    skyAmbient: [0.11, 0.14, 0.18],  // 朝上的面受到的環境光
    groundAmbient: [0.04, 0.04, 0.045],
    fogColor: [0.03, 0.058, 0.082],
    fogDensity: 0.0085,              // 霧的濃度（越大遠方越看不清）
    coreLight: 3.0,                  // 生物核心照亮周圍環境的強度
    wind: 0.6,                       // 草和藤被風吹動的幅度
  },

  camera: { distance: 6.4, yaw: 0.85, pitch: 0.22, fov: 42, min: 2.6, max: 16 },
  lightDir: [0.45, 0.9, 0.55],
  moteCount: 320,

  // 鍵盤飛行
  flight: {
    maxSpeed: 3.2,             // 最快前進速度（單位/秒）
    accel: 1.6,                // 加速的快慢
    turnRate: 1.5,             // 轉向速度（弧度/秒）
    climbSpeed: 1.3,           // 上升 / 下降速度
    bankDeg: 24,               // 轉彎時身體傾斜的角度
    floorY: -3.0,              // 地面高度（有環境時會用環境的地面高度）
    // FIXED(D08): 已處理：決定維持飛行高度上限 30（冷卻塔有 80 高，暫時飛不到塔頂）
    ceilingY: 30.0,            // 最高可以飛多高（夠飛過廢墟）
    collisionRadius: 0.95,     // 碰撞時把生物當成多大的一顆球
    groundClearance: 1.2,      // 離地面至少多高
  },

  // 孢子：生物飛行時幫真菌散播
  spores: {
    max: 500,
    hoverRate: 0.5,            // 漂浮時每秒平均掉幾顆
    flyRate: 4.0,              // 飛行時每秒平均掉幾顆（脈動時更多）
    life: [8, 14],             // 存在幾秒
    gravity: 0.12,
    drag: 0.7,                 // 空氣阻力：越大掉得越慢
    size: 0.045,
  },
};

// ---------------------------------------------------------------------
//  小型矩陣工具（4x4，column-major，與 WebGL 相同）
// ---------------------------------------------------------------------
const Mat = {
  ident() { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); },
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++)
      for (let r = 0; r < 4; r++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
      }
    return o;
  },
  chain(...ms) { return ms.reduce((acc, m) => Mat.mul(acc, m)); },
  translate(x, y, z) { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]); },
  scale(s) { return new Float32Array([s,0,0,0, 0,s,0,0, 0,0,s,0, 0,0,0,1]); },
  rotX(r) { const c = Math.cos(r), s = Math.sin(r); return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]); },
  rotY(r) { const c = Math.cos(r), s = Math.sin(r); return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]); },
  rotZ(r) { const c = Math.cos(r), s = Math.sin(r); return new Float32Array([c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]); },
  perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]);
  },
  lookAt(eye, target, up) {
    const z = norm(sub(eye, target)), x = norm(cross(up, z)), y = cross(z, x);
    return new Float32Array([
      x[0], y[0], z[0], 0,  x[1], y[1], z[1], 0,  x[2], y[2], z[2], 0,
      -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
    ]);
  },
  apply(m, p) {
    return [
      m[0]*p[0] + m[4]*p[1] + m[8]*p[2] + m[12],
      m[1]*p[0] + m[5]*p[1] + m[9]*p[2] + m[13],
      m[2]*p[0] + m[6]*p[1] + m[10]*p[2] + m[14],
    ];
  },
};
const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0]/l, a[1]/l, a[2]/l]; };
const lerp = (a, b, t) => a + (b - a) * t;
const deg = (d) => d * Math.PI / 180;
const smooth = (t) => t * t * (3 - 2 * t);

// ---------------------------------------------------------------------
//  著色器
// ---------------------------------------------------------------------
const MAIN_VS = `#version 300 es
layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_nrm;
layout(location=2) in vec2 a_uv;
layout(location=3) in float a_w;
uniform mat4 u_model, u_view, u_proj;
uniform int u_mat;
uniform float u_sway, u_lift, u_breath, u_bend;
// 睡覺時翅膀包住身體
uniform mat4 u_rootModel;
uniform float u_fold, u_side;
uniform vec4 u_body;                 // (半長, 最粗半徑, 尾巴收尖, 正規化係數)
uniform float u_bodyFlat, u_tailLift, u_wrapFrom, u_wrapTo, u_wingSpan, u_wrapGap, u_wrapAngle;
// 尾巴觸手的飄動：(波動相位, 波動幅度, 轉彎甩動, 下垂量)
uniform vec4 u_tendril;
out vec3 v_wpos; out vec3 v_nrm; out vec2 v_uv; out vec3 v_lpos;

// 觸手上一點的飄動（JS 的 tendrilWorld 用同一個公式算孢子囊的位置）
//   t = 在觸手上的位置（0 根部 → 1 末端），idx = 第幾條
vec3 tendrilWave(float t, float idx) {
  float ph = u_tendril.x - t * 3.0 + idx * 1.7;
  float amp = u_tendril.y * t * t;
  return vec3(sin(ph) * amp + u_tendril.z * t * t, cos(ph * 0.8 + idx) * amp * 0.6, 0.0);
}

// 身體在 z 處的半徑（和 Rust 的水滴輪廓同一個公式）
float bodyRadiusAt(float z) {
  float th = acos(clamp(-z / u_body.x, -1.0, 1.0));
  return sin(th) * pow(sin(th * 0.5), u_body.z) / u_body.w * u_body.y;
}

// 把翅膀上的一點「貼」到身體外面：展向 → 沿著身體從尾端往頭（倒掛時往下垂），弦向 → 從背脊繞過側面到肚子
void wrapWing(vec3 lp, out vec3 pos, out vec3 nrm) {
  float span = abs(lp.x);
  float z = mix(u_wrapFrom, u_wrapTo, clamp(span / u_wingSpan, 0.0, 1.0));
  float R = bodyRadiusAt(z) + u_wrapGap + 0.25 * max(lp.y, 0.0);
  float arc = 0.32 - lp.z;                       // 從翅膀前緣量起的距離
  float th = min(0.2 + 0.85 * arc / max(R, 0.12), u_wrapAngle); // 從背脊往肚子繞的角度
  float t = clamp(-z / u_body.x, 0.0, 1.0);
  pos = vec3(u_side * R * sin(th), R * cos(th) * u_bodyFlat + u_tailLift * t * t, z);
  nrm = vec3(u_side * sin(th), cos(th), 0.0);
}

void main() {
  vec3 p = a_pos;
  v_lpos = a_pos;
  if (u_mat == 0 || u_mat == 3 || u_mat == 6) {   // 身體、菌絲、感光點：呼吸般的膨脹 + 擺尾
    p.xy *= 1.0 + u_breath * (1.0 - a_w);
    p.x += u_sway * a_w;
    p.y += u_lift * a_w;
  } else if (u_mat == 5) {          // 尾巴觸手：根部跟著尾巴擺，越往末端飄得越多
    float t = fract(a_uv.y);
    p += vec3(u_sway, u_lift, 0.0) + tendrilWave(t, floor(a_uv.y));
  } else if (u_mat == 1 || u_mat == 4) {   // 翅膀與翅膀上的光點：翅尖因慣性彎曲
    p.y += u_bend * a_w * a_w;
  }
  vec4 w = u_model * vec4(p, 1.0);
  if (u_mat == 5) w.y -= u_tendril.w * pow(fract(a_uv.y), 2.0);   // 觸手受重力往下垂（世界的「下」）
  vec3 n = mat3(u_model) * a_nrm;
  if ((u_mat == 1 || u_mat == 4) && u_fold > 0.0) {
    vec3 fp, fn;
    wrapWing(a_pos, fp, fn);
    w = mix(w, u_rootModel * vec4(fp, 1.0), u_fold);
    n = normalize(mix(n, mat3(u_rootModel) * fn, u_fold));
  }
  v_wpos = w.xyz;
  v_nrm = n;
  v_uv = a_uv;
  gl_Position = u_proj * u_view * w;
}`;

const MAIN_FS = `#version 300 es
precision highp float;
precision highp int;
in vec3 v_wpos; in vec3 v_nrm; in vec2 v_uv; in vec3 v_lpos;
uniform int u_mat;
uniform float u_spotRoot, u_rootBlend, u_strandBright, u_foldOpacity, u_tendrilBright, u_eyeGlow;
uniform vec3 u_camPos, u_corePos, u_lightDir;
uniform vec3 u_bodyColor, u_coreColor, u_wingColor;
uniform float u_coreI, u_alpha;
uniform float u_phase, u_time, u_fly, u_pulseBase, u_pulseAmp, u_breatheSpeed, u_breathePhase, u_glowScale;
uniform float u_flySpeed, u_hoverSpeed, u_pulseFreq, u_pulsePhase, u_pulseSharp, u_fade;
out vec4 o;

// 某個位置的能量強度：核心在 dist = 0，越遠的地方脈動越晚抵達。
// 公式與 JS 裡核心的亮度完全相同，所以光是從核心「流出去」的。
float energyAt(float dist) {
  float lagPhase = dist / u_flySpeed * 6.2832 * u_pulseFreq;
  float flyW = pow(0.5 - 0.5 * sin(u_pulsePhase - lagPhase), u_pulseSharp);
  float hovW = 0.5 + 0.5 * sin(u_breathePhase - dist / u_hoverSpeed * u_breatheSpeed);
  return mix(hovW, flyW, u_fly);
}

// 薄膜干涉的彩虹色（肥皂泡、昆蟲翅膀那種）
vec3 film(float x) { return 0.5 + 0.5 * cos(6.2832 * (x + vec3(0.0, 0.33, 0.67))); }

void main() {
  vec3 N = normalize(v_nrm);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(u_camPos - v_wpos);
  vec3 L = normalize(u_lightDir);
  vec3 H = normalize(L + V);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 2.2);
  float diff = max(dot(N, L), 0.0);
  float spec = pow(max(dot(N, H), 0.0), 90.0);
  float d = length(u_corePos - v_wpos);
  float coreLight = u_coreI / (1.0 + 7.0 * d * d);

  if (u_mat == 2) {                    // 核心：自己發光
    vec3 c = u_coreColor * (0.45 + 0.45 * u_coreI) + vec3(1.0) * pow(ndv, 3.0) * 0.3 * u_coreI;
    o = vec4(c, 1.0);
    return;
  }

  if (u_mat == 4) {                    // 翅膀上的光點與小菌絲
    float span = abs(v_lpos.x);
    float rootFade = smoothstep(u_rootBlend * 0.35, u_rootBlend, span);
    float dist = u_spotRoot + v_uv.x;    // 能量：核心 → 翅根 → 光點 → 沿小菌絲往外
    // 平常只留一點微光，能量波經過的時候才亮起來
    float I = energyAt(dist) * exp(-span * 0.22) * u_glowScale;
    vec3 col; float a;
    if (v_uv.y >= 0.0) {                 // 光點：小亮點 + 柔和光暈
      float r = v_uv.y;
      float aa = fwidth(r) + 1e-4;
      float dotC = 1.0 - smoothstep(0.33 - aa, 0.33 + aa, r);
      float halo = exp(-r * r * 9.0) * (1.0 - r);
      col = u_coreColor * (0.25 + 1.6 * I) * dotC + vec3(1.0) * 0.3 * I * dotC + u_coreColor * halo * I * 0.8;
      a = dotC * (0.1 + 0.85 * I) + halo * I * 0.35;
    } else {                             // 小菌絲：淡淡的，越往末端越淡
      float t = -v_uv.y - 1.0;
      float fade = 1.0 - smoothstep(0.2, 1.0, t);
      col = u_coreColor * (0.3 + 1.4 * I);
      a = u_strandBright * (0.05 + 0.85 * I) * fade;
    }
    o = vec4(col, clamp(a * rootFade, 0.0, 1.0));
    return;
  }

  if (u_mat == 5) {                    // 尾巴觸手：半透明的細絲，能量從菌絲一路流到末端的孢子囊
    float t = fract(v_uv.y);
    float dist = v_uv.x;
    float I = (u_pulseBase * 0.5 + u_pulseAmp * energyAt(dist)) * exp(-(dist - 1.2) * u_fade * 0.5);
    float bulb = smoothstep(0.84, 0.9, t);                     // 末端的孢子囊比較亮
    vec3 col = u_bodyColor * (0.06 + 0.25 * fres) + u_coreColor * (0.12 + 0.9 * I) * (0.55 + 0.9 * bulb);
    float a = (0.16 + 0.5 * I) * (1.0 - 0.35 * t) + 0.25 * fres + bulb * (0.3 + 0.5 * I);
    o = vec4(col * u_tendrilBright, clamp(a, 0.0, 1.0));
    return;
  }

  if (u_mat == 6) {                    // 感光點：單色藍綠色的小小光點，中間亮、往外柔和地淡出
    float r = v_uv.x;
    float I = u_eyeGlow * (0.6 + 0.4 * energyAt(0.1));
    float dotA = 1.0 - smoothstep(0.35, 1.0, r);
    o = vec4(u_coreColor * (0.4 + 0.8 * I), clamp(dotA * (0.25 + 0.6 * I), 0.0, 1.0));
    return;
  }

  if (u_mat == 3) {                    // 菌絲：能量沿著它從核心往外流
    float dist = v_uv.x;
    float wave = energyAt(dist);
    float I = (u_pulseBase * 0.5 + u_pulseAmp * wave) * exp(-dist * u_fade);
    vec3 col = u_coreColor * (0.18 + 1.1 * I) + vec3(1.0) * 0.12 * I * I;
    float a = 0.22 + 0.75 * I;
    o = vec4(col, clamp(a, 0.0, 1.0));
    return;
  }

  if (u_mat == 0) {                    // 身體：像玻璃 / 水母，邊緣較實、中間通透
    vec3 base = u_bodyColor * (0.18 + 0.55 * diff);
    vec3 irid = film(fres * 1.2 + 0.15) * 0.22 * fres;
    vec3 col = base * (0.35 + 1.3 * fres) + irid + u_coreColor * coreLight * 1.3 + vec3(1.0) * spec * 0.7 * u_alpha;
    float a = 0.05 + 0.55 * fres + 0.35 * coreLight + spec * 0.5 * u_alpha;
    o = vec4(col, clamp(a * u_alpha, 0.0, 1.0));
    return;
  }

  // 翅膀：乾淨的薄膜（光點和小菌絲另外畫在上面）
  float s = v_uv.x, v = v_uv.y;
  float edge = smoothstep(0.93, 1.0, v) * 0.6 + smoothstep(0.04, 0.0, v) * 0.3 + smoothstep(0.97, 1.0, s) * 0.4;

  // 能量從核心經過翅根，再沿著翅膀往翅尖傳
  float span = abs(v_lpos.x);
  float rootFade = smoothstep(u_rootBlend * 0.35, u_rootBlend, span);   // 翅根融進身體

  vec3 membrane = u_wingColor * (0.25 + 0.45 * diff) + film(fres * 1.6 + s * 0.7) * 0.32;
  vec3 col = membrane + u_coreColor * coreLight * 0.8 + vec3(1.0) * spec * 0.3;
  float a = 0.06 + 0.2 * fres + edge * 0.35 + spec * 0.12 + coreLight * 0.15;
  o = vec4(col, clamp(a * u_alpha * rootFade * u_foldOpacity, 0.0, 0.92));
}`;

const GLOW_VS = `#version 300 es
layout(location=0) in vec2 a_corner;
uniform vec3 u_center; uniform float u_size; uniform mat4 u_view, u_proj;
out vec2 v_c;
void main() {
  v_c = a_corner;
  vec4 c = u_view * vec4(u_center, 1.0);
  c.xy += a_corner * u_size;
  c.z += u_size * 0.3;                 // 往鏡頭拉近一點，不會被身體擋住，但會被前面的牆擋住
  gl_Position = u_proj * c;
}`;
const GLOW_FS = `#version 300 es
precision highp float;
in vec2 v_c; uniform vec3 u_color; uniform float u_int; out vec4 o;
void main() {
  float r2 = dot(v_c, v_c);
  float g = (exp(-r2 * 14.0) * 0.6 + exp(-r2 * 3.2) * 0.2) * u_int * clamp(1.0 - r2, 0.0, 1.0);
  o = vec4(u_color * g, 1.0);
}`;

const BG_VS = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
const BG_FS = `#version 300 es
precision highp float;
in vec2 v_uv; uniform float u_aspect; out vec4 o;
void main() {
  vec3 top = vec3(0.035, 0.075, 0.12), bottom = vec3(0.008, 0.02, 0.035);
  vec3 c = mix(bottom, top, smoothstep(0.0, 1.0, v_uv.y));
  vec2 q = (v_uv - vec2(0.5, 0.55)) * vec2(u_aspect, 1.0);
  c += vec3(0.03, 0.08, 0.09) * exp(-dot(q, q) * 3.0);
  o = vec4(c, 1.0);
}`;

// 背景微光粒子：在鏡頭周圍的一個箱子裡循環，飛多遠都看得到
const MOTE_VS = `#version 300 es
layout(location=0) in vec4 a_mote;   // xyz + 隨機種子
uniform mat4 u_view, u_proj; uniform float u_time, u_scale; uniform vec3 u_center;
out float v_a;
void main() {
  float sd = a_mote.w;
  vec3 p = a_mote.xyz + vec3(sin(u_time * 0.13 + sd * 6.0), sin(u_time * 0.09 + sd * 11.0), cos(u_time * 0.11 + sd * 4.0)) * 0.35;
  vec3 box = vec3(26.0, 14.0, 26.0);
  p = u_center + mod(p - u_center + box * 0.5, box) - box * 0.5;
  vec3 q = abs(p - u_center) / (box * 0.5);
  float edge = 1.0 - smoothstep(0.7, 1.0, max(q.x, max(q.y, q.z)));
  vec4 vp = u_view * vec4(p, 1.0);
  gl_Position = u_proj * vp;
  gl_PointSize = u_scale * (0.6 + sd) / max(-vp.z, 0.5);
  v_a = edge * (0.35 + 0.65 * fract(sd * 7.3)) * (0.6 + 0.4 * sin(u_time * (0.5 + sd) + sd * 20.0));
}`;
const MOTE_FS = `#version 300 es
precision highp float;
in float v_a; out vec4 o;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float g = exp(-dot(c, c) * 3.5) * v_a * 0.3;
  o = vec4(vec3(0.5, 0.9, 0.85) * g, 1.0);
}`;

// 環境：地面、廢墟、工廠、冷卻塔、草、藤、鐵絲網、警告牌
const ENV_VS = `#version 300 es
layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_nrm;
layout(location=2) in vec2 a_uv;
layout(location=3) in float a_w;
layout(location=4) in vec3 a_col;
uniform mat4 u_view, u_proj; uniform float u_time, u_wind;
out vec3 v_wpos; out vec3 v_nrm; out vec2 v_uv; out vec3 v_col; out float v_w;
void main() {
  vec3 p = a_pos;
  if (a_w > 0.0) {                      // 草和藤被風吹動
    float ph = u_time * 1.3 + p.x * 0.35 + p.z * 0.27;
    p.x += sin(ph) * a_w * u_wind;
    p.z += cos(ph * 0.8) * a_w * u_wind * 0.7;
  }
  v_wpos = p; v_nrm = a_nrm; v_uv = a_uv; v_col = a_col; v_w = a_w;
  gl_Position = u_proj * u_view * vec4(p, 1.0);
}`;
const ENV_FS = `#version 300 es
precision highp float;
precision highp int;
in vec3 v_wpos; in vec3 v_nrm; in vec2 v_uv; in vec3 v_col; in float v_w;
uniform int u_mat;                        // 0 一般、1 鐵絲網、2 警告牌
uniform vec3 u_camPos, u_moonDir, u_moonColor, u_skyAmb, u_groundAmb, u_fogColor, u_corePos, u_coreColor;
uniform float u_coreI, u_coreLight, u_fogDensity;
out vec4 o;

float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise3(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
}

// 月光 + 環境光 + 生物核心的光
vec3 lit(vec3 N, vec3 base) {
  float moon = max(dot(N, u_moonDir), 0.0);
  vec3 amb = mix(u_groundAmb, u_skyAmb, N.y * 0.5 + 0.5);
  vec3 L = u_corePos - v_wpos;
  float d2 = dot(L, L);
  float facing = max(dot(N, L * inversesqrt(max(d2, 1e-4))), 0.0) * 0.75 + 0.25;
  vec3 core = u_coreColor * u_coreI * u_coreLight * facing / (1.0 + d2 * 0.12);
  return base * (amb + u_moonColor * moon + core);
}
vec3 fogged(vec3 c) {
  float d = length(v_wpos - u_camPos);
  return mix(c, u_fogColor, 1.0 - exp(-d * u_fogDensity));
}

void main() {
  vec3 N = normalize(v_nrm);
  if (!gl_FrontFacing) N = -N;

  if (u_mat == 1) {                       // 鐵絲網：菱形網格，遠處變成半透明的一片
    vec2 uv = v_uv;
    float cell = 0.32;
    float a = (uv.x + uv.y) / cell, b = (uv.x - uv.y) / cell;
    float fa = fwidth(a), fb = fwidth(b);
    float wa = abs(fract(a + 0.5) - 0.5), wb = abs(fract(b + 0.5) - 0.5);
    float wire = 0.07;
    float m = max(1.0 - smoothstep(wire - fa, wire + fa, wa), 1.0 - smoothstep(wire - fb, wire + fb, wb));
    m = mix(m, 0.25, smoothstep(0.15, 0.5, max(fa, fb)));
    float tear = noise3(vec3(uv * 0.55, 3.0));
    m *= 1.0 - smoothstep(0.66, 0.72, tear);            // 鏽蝕破掉的洞
    vec3 base = vec3(0.3, 0.27, 0.24) * (0.7 + 0.6 * noise3(vec3(uv * 2.0, 1.0)));
    base = mix(base, vec3(0.32, 0.16, 0.07), smoothstep(0.5, 0.8, noise3(vec3(uv * 1.3, 7.0))) * 0.7);
    o = vec4(fogged(lit(N, base)), m);
    return;
  }

  if (u_mat == 2) {                       // 輻射警告牌
    if (!gl_FrontFacing) { o = vec4(fogged(lit(N, vec3(0.2, 0.18, 0.16))), 1.0); return; }
    vec2 q = v_uv * 2.0 - 1.0;
    vec3 yellow = vec3(0.78, 0.58, 0.07), black = vec3(0.03);
    float border = step(0.84, max(abs(q.x), abs(q.y)));
    vec2 t = q / 0.66;
    float r = length(t);
    float ang = atan(t.y, t.x) + 12.566;
    float blade = step(mod(ang, 2.0944), 1.0472) * step(0.3, r) * step(r, 1.0);  // 三片扇葉（朝左上、右上、下）
    float trefoil = max(blade, step(r, 0.2));
    vec3 c = mix(yellow, black, max(trefoil, border));
    // 風化：褪色、鏽斑、從螺絲往下流的鏽水痕
    float w = v_w;
    c *= 0.72 + 0.35 * noise3(vec3(v_uv * 18.0, 2.0));
    float rust = smoothstep(0.6, 0.9, noise3(vec3(v_uv * 5.0, w * 9.0)) + w * 0.2);
    c = mix(c, vec3(0.24, 0.11, 0.04), rust * 0.85);
    float streak = smoothstep(0.65, 1.0, noise3(vec3(v_uv.x * 28.0, v_uv.y * 1.5, w * 4.0))) * smoothstep(0.1, 0.9, v_uv.y);
    c = mix(c, vec3(0.18, 0.09, 0.04), streak * 0.6);
    o = vec4(fogged(lit(N, c * 1.6)), 1.0);
    return;
  }

  vec3 base = v_col;
  float kind = v_uv.y, mossAmt = v_uv.x;
  float n = noise3(v_wpos * 0.45) * 0.6 + noise3(v_wpos * 1.9) * 0.4;
  if (kind < 0.5) {                       // 地面：細碎的砂石
    base *= 0.8 + 0.4 * noise3(v_wpos * 3.0);
  } else if (kind < 1.5) {                // 混凝土：斑駁、往下流的污痕
    base *= 0.78 + 0.4 * n;
    base *= 0.8 + 0.25 * noise3(vec3(v_wpos.x * 1.5, v_wpos.y * 0.15, v_wpos.z * 1.5));
  } else if (kind < 2.5) {                // 鏽鐵
    base = mix(base, vec3(0.34, 0.16, 0.07), smoothstep(0.45, 0.75, noise3(v_wpos * 0.9)) * 0.7);
    base *= 0.75 + 0.4 * noise3(v_wpos * 4.0);
  } else if (kind > 3.5) {                // 冷卻塔：垂直的雨水痕
    base *= 0.7 + 0.45 * noise3(vec3(v_wpos.x * 0.6, v_wpos.y * 0.03, v_wpos.z * 0.6));
  }
  if (mossAmt > 0.0) {                    // 苔蘚：朝上的面和牆腳長得比較多
    float mn = noise3(v_wpos * 0.7) * 0.7 + noise3(v_wpos * 3.1) * 0.3;
    float m = smoothstep(0.55, 0.8, mn + mossAmt * 0.45 + max(N.y, 0.0) * 0.3 - 0.25);
    vec3 moss = mix(vec3(0.08, 0.13, 0.05), vec3(0.15, 0.2, 0.07), noise3(v_wpos * 5.0));
    base = mix(base, moss, m * 0.9);
  }
  o = vec4(fogged(lit(N, base)), 1.0);
}`;

// 地面：淡淡的點陣，讓飛行時有空間感；核心的光也會映在地上（沒有環境資料時才用）
const FLOOR_VS = `#version 300 es
layout(location=0) in vec2 a_corner;
uniform mat4 u_view, u_proj; uniform vec3 u_center; uniform float u_floorY;
out vec3 v_w;
void main() {
  v_w = vec3(u_center.x + a_corner.x * 60.0, u_floorY, u_center.z + a_corner.y * 60.0);
  gl_Position = u_proj * u_view * vec4(v_w, 1.0);
}`;
const FLOOR_FS = `#version 300 es
precision highp float;
in vec3 v_w;
uniform vec3 u_center, u_corePos, u_coreColor; uniform float u_coreI;
out vec4 o;
void main() {
  vec2 cell = fract(v_w.xz * 0.8) - 0.5;
  float aa = fwidth(v_w.x * 0.8) + fwidth(v_w.z * 0.8);
  float dotv = 1.0 - smoothstep(0.022, 0.022 + aa, length(cell));
  float fade = exp(-length(v_w.xz - u_center.xz) * 0.11);
  vec3 col = vec3(0.3, 0.6, 0.65) * dotv * 0.16 * fade;
  float d = length(v_w - u_corePos);
  col += u_coreColor * u_coreI * 0.16 / (1.0 + d * d * 0.7);
  o = vec4(col, 1.0);
}`;

// 孢子
const SPORE_VS = `#version 300 es
layout(location=0) in vec4 a_s;      // xyz + 生命進度（0 → 1）
layout(location=1) in float a_seed;
uniform mat4 u_view, u_proj; uniform float u_time, u_pxScale, u_size;
out float v_a; out float v_seed;
void main() {
  vec4 vp = u_view * vec4(a_s.xyz, 1.0);
  gl_Position = u_proj * vp;
  float size = u_size * (0.6 + 0.8 * fract(a_seed * 13.1));
  gl_PointSize = max(size * 3.0 * u_pxScale / max(-vp.z, 0.1), 1.5);
  float life = a_s.w;
  float fade = smoothstep(0.0, 0.04, life) * (1.0 - smoothstep(0.6, 1.0, life));
  float twinkle = 0.65 + 0.35 * sin(u_time * (2.0 + 3.0 * a_seed) + a_seed * 40.0);
  v_a = fade * twinkle;
  v_seed = a_seed;
}`;
const SPORE_FS = `#version 300 es
precision highp float;
in float v_a; in float v_seed; uniform vec3 u_color; out vec4 o;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  float g = (exp(-r2 * 22.0) * 1.0 + exp(-r2 * 4.0) * 0.25) * clamp(1.0 - r2, 0.0, 1.0);
  vec3 col = u_color * g + vec3(1.0) * exp(-r2 * 60.0) * 0.4;
  o = vec4(col * v_a, 1.0);
}`;

// ---------------------------------------------------------------------
//  初始化
// ---------------------------------------------------------------------
const canvas = document.getElementById('view');
const errBox = document.getElementById('err');
function fail(msg) { errBox.innerHTML = msg; errBox.style.display = 'grid'; throw new Error(msg); }

const DATA = window.CREATURE_DATA;
if (!DATA) fail('找不到 creature_data.js。<br>請先在專案資料夾執行 <b>cargo run</b> 產生生物資料，再重新整理這個頁面。');

const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
if (!gl) fail('這個瀏覽器不支援 WebGL2，請改用最新版的 Chrome、Edge、Firefox 或 Safari。');


function compile(vsSrc, fsSrc) {
  const make = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) fail('著色器編譯失敗：<pre>' + gl.getShaderInfoLog(s) + '</pre>');
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, make(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, make(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) fail('著色器連結失敗：<pre>' + gl.getProgramInfoLog(p) + '</pre>');
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  const u = {};
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(p, i).name;
    u[name] = gl.getUniformLocation(p, name);
  }
  return { program: p, u };
}

const progMain = compile(MAIN_VS, MAIN_FS);
const progGlow = compile(GLOW_VS, GLOW_FS);
const progBg = compile(BG_VS, BG_FS);
const progMote = compile(MOTE_VS, MOTE_FS);
const progFloor = compile(FLOOR_VS, FLOOR_FS);
const progEnv = compile(ENV_VS, ENV_FS);
const progSpore = compile(SPORE_VS, SPORE_FS);

function uploadMesh(mesh) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const attr = (loc, arr, size) => {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  };
  attr(0, mesh.positions, 3);
  attr(1, mesh.normals, 3);
  attr(2, mesh.uvs, 2);
  attr(3, mesh.weights, 1);
  if (mesh.colors) attr(4, mesh.colors, 3);
  else gl.vertexAttrib3f(4, 1, 1, 1);
  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(mesh.indices), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, count: mesh.indices.length };
}

const MAT_ID = { body: 0, wing: 1, core: 2, hypha: 3, wing_glow: 4, tendril: 5, eye_spot: 6 };
const boneIndex = Object.fromEntries(DATA.bones.map((b, i) => [b.name, i]));
const parts = Object.fromEntries(DATA.parts.map((p) => [p.name, {
  ...uploadMesh(p.mesh), bone: boneIndex[p.bone], mat: MAT_ID[p.material], alpha: p.alpha,
}]));

// 環境（由 Rust 產生，在 environment_data.js；沒有的話就只顯示原本的點陣地面）
const ENV = window.ENVIRONMENT_DATA || null;
const ENV_MAT = { env: 0, fence: 1, sign: 2 };
const envParts = ENV ? ENV.parts.map((p) => ({ name: p.name, mat: ENV_MAT[p.material], ...uploadMesh(p.mesh) })) : [];
if (ENV) CONFIG.flight.floorY = ENV.params.ground_y;

// 光暈與地面共用的四邊形
const quadVao = gl.createVertexArray();
gl.bindVertexArray(quadVao);
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, 1,1, -1,-1, 1,1, -1,1]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

// 背景微光粒子
const moteVao = gl.createVertexArray();
gl.bindVertexArray(moteVao);
{
  const arr = [];
  for (let i = 0; i < CONFIG.moteCount; i++) {
    arr.push((Math.random() - 0.5) * 26, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 26, Math.random());
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
}

// 孢子（每一幀更新內容）
const SP = CONFIG.spores;
const sporeVao = gl.createVertexArray();
const sporeBuf = gl.createBuffer();
const sporeCpu = new Float32Array(SP.max * 5);
gl.bindVertexArray(sporeVao);
gl.bindBuffer(gl.ARRAY_BUFFER, sporeBuf);
gl.bufferData(gl.ARRAY_BUFFER, sporeCpu.byteLength, gl.DYNAMIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 20, 0);
gl.enableVertexAttribArray(1);
gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 20, 16);

const emptyVao = gl.createVertexArray();
gl.bindVertexArray(null);

// ---------------------------------------------------------------------
//  操作：滑鼠視角、模式切換、鍵盤飛行
// ---------------------------------------------------------------------
// 鏡頭角度只在拖曳滑鼠時改變；生物移動時鏡頭只平移跟著牠，角度保持不變
const cam = { ...CONFIG.camera, target: [0, 0, 0], actual: CONFIG.camera.distance };   // actual = 鏡頭實際的距離（被牆擋住時會比 distance 近）
let dragging = null;

canvas.addEventListener('pointerdown', (e) => { dragging = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  cam.yaw -= (e.clientX - dragging.x) * 0.006;
  cam.pitch = Math.max(-0.5, Math.min(1.3, cam.pitch + (e.clientY - dragging.y) * 0.005));
  dragging = { x: e.clientX, y: e.clientY };
});
const endDrag = () => { dragging = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  cam.distance = Math.max(cam.min, Math.min(cam.max, cam.distance * Math.exp(e.deltaY * 0.001)));
}, { passive: false });

let mode = CONFIG.startMode;
let flyBlend = mode === 'fly' ? 1 : 0;
let sleepBlend = 0;
const statusEl = document.getElementById('status');
const modeButtons = document.querySelectorAll('.seg button[data-mode]');
function setMode(m) {
  mode = m;
  modeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
}
setMode(mode);
modeButtons.forEach((b) => b.addEventListener('click', () => { setMode(b.dataset.mode); b.blur(); }));

// 面板與「操作」資料夾可以收合
function makeCollapsible(container, toggle) {
  toggle.addEventListener('click', () => {
    const closed = container.classList.toggle('closed');
    toggle.setAttribute('aria-expanded', String(!closed));
    toggle.blur();
  });
}
makeCollapsible(document.getElementById('pane'), document.getElementById('paneToggle'));
const keysFolder = document.getElementById('keysFolder');
makeCollapsible(keysFolder, keysFolder.querySelector('.folder-title'));


// 按著的按鍵
const keys = new Set();
const CONTROL_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight'];
window.addEventListener('keydown', (e) => {
  // FIXED(D03): 長按 M 時，按鍵自動重複（e.repeat）不再切換飛行／漂浮
  if (e.code === 'KeyM') { if (!e.repeat) setMode(mode === 'fly' ? 'hover' : 'fly'); return; }
  // FIXED(D02): 長按 Z 時，按鍵自動重複（e.repeat）不再切換睡覺／醒來
  if (e.code === 'KeyZ') { if (!e.repeat) setMode(mode === 'sleep' ? 'hover' : 'sleep'); return; }
  if (CONTROL_KEYS.includes(e.code)) {
    e.preventDefault();
    keys.add(e.code);
    if (mode === 'sleep') setMode('hover');      // 睡著時按方向鍵會叫醒牠
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
const held = (...codes) => codes.some((c) => keys.has(c));

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}

// ---------------------------------------------------------------------
//  碰撞：把生物當成一顆球，對牆、柱子、鐵絲網（方塊）、煙囪（圓柱）、冷卻塔（中空的殼）和地形做推出
// ---------------------------------------------------------------------
const COL = ENV && ENV.colliders ? {
  boxes: ENV.colliders.boxes.map((b) => ({
    c: [b[0], b[1], b[2]],
    ax: [[b[3], b[4], b[5]], [b[6], b[7], b[8]], [b[9], b[10], b[11]]],
    h: [b[12], b[13], b[14]],
    r: Math.hypot(b[12], b[13], b[14]),
  })),
  cyls: ENV.colliders.cylinders,
} : null;

const GROUND = ENV ? {
  pos: ENV.parts.find((p) => p.name === 'ground').mesh.positions,
  n: ENV.params.ground_grid,
  size: ENV.params.ground_size,
} : null;

// 地形高度（從地面網格雙線性內插）
function groundHeightAt(x, z) {
  if (!GROUND) return CONFIG.flight.floorY;
  const { pos, n, size } = GROUND;
  const step = size / n;
  const fx = (x + size / 2) / step, fz = (z + size / 2) / step;
  const i = Math.max(0, Math.min(n - 1, Math.floor(fx)));
  const j = Math.max(0, Math.min(n - 1, Math.floor(fz)));
  const u = Math.max(0, Math.min(1, fx - i)), v = Math.max(0, Math.min(1, fz - j));
  const h = (a, b) => pos[(a * (n + 1) + b) * 3 + 1];
  return lerp(lerp(h(i, j), h(i, j + 1), v), lerp(h(i + 1, j), h(i + 1, j + 1), v), u);
}

const SHELL_HALF = 0.6;   // 冷卻塔殼的半厚度

// FIXED(D05): 身體會被牆、柱子、鐵絲網、煙囪、冷卻塔擋住，不會穿過去
function resolveCollisions(p, radius) {
  const normals = [];
  if (COL) {
    for (let iter = 0; iter < 2; iter++) {
      for (const b of COL.boxes) {
        const dx = p[0] - b.c[0], dy = p[1] - b.c[1], dz = p[2] - b.c[2];
        const lim = b.r + radius;
        if (dx * dx + dy * dy + dz * dz > lim * lim) continue;
        // 方塊上離球心最近的點
        let cx = b.c[0], cy = b.c[1], cz = b.c[2];
        const local = [0, 0, 0];
        for (let k = 0; k < 3; k++) {
          const a = b.ax[k];
          const d = dx * a[0] + dy * a[1] + dz * a[2];
          local[k] = d;
          const cl = Math.max(-b.h[k], Math.min(b.h[k], d));
          cx += a[0] * cl; cy += a[1] * cl; cz += a[2] * cl;
        }
        let nx = p[0] - cx, ny = p[1] - cy, nz = p[2] - cz;
        const dist = Math.hypot(nx, ny, nz);
        if (dist >= radius) continue;
        let push;
        if (dist < 1e-5) {
          // 球心已經在方塊裡：從最淺的那一面推出去
          let best = 0, bestPen = Infinity;
          for (let k = 0; k < 3; k++) {
            const pen = b.h[k] - Math.abs(local[k]);
            if (pen < bestPen) { bestPen = pen; best = k; }
          }
          const sgn = Math.sign(local[best]) || 1;
          [nx, ny, nz] = b.ax[best].map((x) => x * sgn);
          push = bestPen + radius;
        } else {
          nx /= dist; ny /= dist; nz /= dist;
          push = radius - dist;
        }
        p[0] += nx * push; p[1] += ny * push; p[2] += nz * push;
        normals.push([nx, ny, nz]);
      }
      for (const c of COL.cyls) {
        const dx = p[0] - c.base[0], dz = p[2] - c.base[2];
        const y = p[1] - c.base[1];
        if (y < -radius || y > c.height + radius) continue;
        const t = Math.max(0, Math.min(1, y / c.height)) * (c.radii.length - 1);
        const i0 = Math.min(Math.floor(t), c.radii.length - 2);
        const R = lerp(c.radii[i0], c.radii[i0 + 1], t - i0);
        const rho = Math.hypot(dx, dz) || 1e-5;
        const ux = dx / rho, uz = dz / rho;
        if (c.shell) {
          const gap = rho - R;
          if (Math.abs(gap) >= radius + SHELL_HALF) continue;
          const side = gap >= 0 ? 1 : -1;               // 在塔外就推到外面，在塔裡就推回裡面
          const push = R + side * (radius + SHELL_HALF) - rho;
          p[0] += ux * push; p[2] += uz * push;
          normals.push([ux * side, 0, uz * side]);
        } else {
          if (rho >= R + radius) continue;
          const push = R + radius - rho;
          p[0] += ux * push; p[2] += uz * push;
          normals.push([ux, 0, uz]);
        }
      }
    }
  }
  const floor = groundHeightAt(p[0], p[2]) + CONFIG.flight.groundClearance;
  if (p[1] < floor) { p[1] = floor; normals.push([0, 1, 0]); }
  return normals;
}

// ---------------------------------------------------------------------
//  飛行：鍵盤輸入 → 位置、方向、速度
// ---------------------------------------------------------------------
const FL = CONFIG.flight;
const flight = { pos: [0, 0, 0], heading: 0, speed: 0, vy: 0, turn: 0, vel: [0, 0, 0], moving: false };
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);

function updateFlight(t, dt) {
  const awake = sleepBlend < 0.05;              // 睡著（或正在入睡／醒來）時不能移動
  const fwdRaw = (held('KeyW', 'ArrowUp') ? 1 : 0) - (held('KeyS', 'ArrowDown') ? 1 : 0);
  const fwd = awake ? fwdRaw : 0;
  const turnIn = awake ? (held('KeyA', 'ArrowLeft') ? 1 : 0) - (held('KeyD', 'ArrowRight') ? 1 : 0) : 0;
  const climb = awake ? (held('Space', 'KeyE') ? 1 : 0) - (held('ShiftLeft', 'ShiftRight', 'KeyQ') ? 1 : 0) : 0;

  const targetSpeed = fwd > 0 ? FL.maxSpeed : fwd < 0 ? -0.35 * FL.maxSpeed : 0;
  flight.speed += (targetSpeed - flight.speed) * ease(fwd ? FL.accel : FL.accel * 1.6, dt);
  flight.turn += (turnIn * FL.turnRate - flight.turn) * ease(4, dt);
  flight.heading += flight.turn * dt;
  flight.vy += (climb * FL.climbSpeed - flight.vy) * ease(3, dt);

  const forward = [Math.sin(flight.heading), 0, Math.cos(flight.heading)];
  flight.vel = [forward[0] * flight.speed, flight.vy, forward[2] * flight.speed];
  flight.pos[0] += flight.vel[0] * dt;
  flight.pos[2] += flight.vel[2] * dt;
  flight.pos[1] = Math.min(FL.ceilingY, flight.pos[1] + flight.vy * dt);
  // 撞到牆就被推回來；因為只推掉「往牆裡」的那一段，剩下的移動會讓牠沿著牆滑過去
  const hits = resolveCollisions(flight.pos, FL.collisionRadius);
  for (const n of hits) {
    if (n[1] > 0.7 && flight.vy < 0) flight.vy = 0;                 // 碰到地面或平台頂就不再往下
    const into = forward[0] * n[0] + forward[2] * n[2];
    if (into < -0.2) flight.speed *= 1 - 0.08 * Math.min(1, -into); // 正面撞上時稍微減速
  }
  flight.moving = Math.abs(flight.speed) > 0.15 || Math.abs(flight.vy) > 0.15 || Math.abs(flight.turn) > 0.15;
}

// ---------------------------------------------------------------------
//  動畫：算出每根骨骼這一幀的姿勢
// ---------------------------------------------------------------------
let phase = 0;
let breathePhase = 0;
let tendrilPhase = 0;
const wingFold = { r: 0, l: 0 };   // 兩邊翅膀現在往後收了幾度（弧度）

// 翅膀收到 angle（弧度）時，翅膀會不會碰到東西：從翅根往翅尖、前緣中段、後緣中段各射一條線
// （座標是翅膀自己的座標，數值來自 Rust 產生的鳥翅外形：翅尖大約在 x = 展長、z = -0.9）
function wingIsClear(root, side, angle) {
  const span = DATA.params.wing_span, pv = DATA.bones[boneIndex.wing_r].pivot;
  const M = Mat.chain(root, Mat.translate(side * pv[0], pv[1], pv[2]), Mat.rotY(side * angle));
  const o = Mat.apply(M, [side * 0.4, 0, -0.3]);
  for (const local of [[side * span, 0, -0.9], [side * span * 0.7, 0, -0.05], [side * span * 0.7, 0, -1.1]]) {
    const q = Mat.apply(M, local);
    const d = sub(q, o), len = Math.hypot(d[0], d[1], d[2]);
    const want = len + CONFIG.wingFold.margin;
    if (rayClearance(o, [d[0] / len, d[1] / len, d[2] / len], want) < want - 1e-3) return false;
  }
  return true;
}

function animate(t, dt) {
  // 在空中移動時一定是飛行姿態；停下來後回到選擇的模式
  const SL = CONFIG.sleep;
  const target = mode !== 'sleep' && (mode === 'fly' || flight.moving) ? 1 : 0;
  flyBlend += Math.sign(target - flyBlend) * Math.min(Math.abs(target - flyBlend), dt * CONFIG.modeBlendSpeed);
  const k = smooth(flyBlend);
  const sTarget = mode === 'sleep' ? 1 : 0;
  sleepBlend += Math.sign(sTarget - sleepBlend) * Math.min(Math.abs(sTarget - sleepBlend), dt * SL.blendSpeed);
  const sk = smooth(sleepBlend);
  const H = CONFIG.hover, F = CONFIG.fly;
  const p = {};
  for (const key of Object.keys(H)) p[key] = lerp(lerp(H[key], F[key], k), SL[key], sk);
  const speedFrac = Math.max(0, flight.speed) / FL.maxSpeed;
  p.flapFreq *= 1 + 0.25 * speedFrac;          // 飛快一點時拍得稍微快一些

  // 用累加相位，切換頻率時翅膀才不會突然跳動
  phase += 2 * Math.PI * p.flapFreq * dt;
  const s = Math.sin(phase), c = Math.cos(phase);

  const flapDeg = DATA.params.wing_rest_angle_deg + p.flapAmp * s;
  const flapVel = p.flapAmp * c * p.flapFreq * 2 * Math.PI;   // 度/秒

  // 核心亮度：飛行時在每次下拍到底（sin = -1）時最亮；漂浮時緩慢呼吸
  // 脈動相位：每 flapsPerPulse 次拍翅一次，並對齊在某一次下拍到底（sin = -1）
  const N = CONFIG.flapsPerPulse;
  const pulsePhase = (phase - 1.5 * Math.PI) / N + 1.5 * Math.PI;
  const flapPulse = Math.pow(0.5 - 0.5 * Math.sin(pulsePhase), CONFIG.pulseSharpness);
  const breatheSpeed = lerp(CONFIG.breatheSpeed, SL.breatheSpeed, sk);
  breathePhase += breatheSpeed * dt;            // 累加相位：改變速度時不會跳動
  const breathe = 0.5 + 0.5 * Math.sin(breathePhase);
  const wave = lerp(breathe, flapPulse, k);
  const coreI = p.pulseBase + p.pulseAmp * wave;

  const bob = -p.bob * Math.sin(phase - 0.6) + 0.06 * Math.sin(t * 0.7);
  const noseDownAwake = -p.pitchDeg + 2.5 * s * k + 8 * speedFrac - 14 * (flight.vy / FL.climbSpeed);
  const noseDown = lerp(noseDownAwake, 90, sk);  // 睡覺：翻成頭朝下、尾巴朝上
  const bank = -FL.bankDeg * (flight.turn / FL.turnRate) * (1 - sk);
  const swing = 3 * Math.sin(t * 0.5) * (1 - sk) + 2.5 * Math.sin(t * 0.33) * sk;   // 睡著時飄在空中輕輕晃
  const root = Mat.chain(
    Mat.translate(flight.pos[0], flight.pos[1] + bob, flight.pos[2]),
    Mat.rotY(flight.heading + deg(4) * Math.sin(t * 0.37) * (1 - sk)),
    Mat.rotX(deg(noseDown)),
    Mat.rotZ(deg(bank + swing)),
  );

  const feather = deg(-CONFIG.featherDeg * c * k);
  const coreScale = 1 + 0.07 * (coreI - p.pulseBase);

  // FIXED(D06): 翅膀碰到牆會自動往後收。從 0° 開始一個角度一個角度試，
  // 檢查「翅膀收到這個角度時，整片翅膀實際的位置」有沒有碰到東西，選第一個不會碰到的角度
  const WF = CONFIG.wingFold;
  for (const [side, key] of [[1, 'r'], [-1, 'l']]) {
    let target = 0;
    if (COL && sk < 0.5) {                       // 睡覺時翅膀包著身體，不用算
      target = deg(WF.maxDeg);                   // 全部角度都會碰到時，就收到最底
      for (let a = 0; a < WF.maxDeg + 0.1; a += WF.stepDeg) {
        if (wingIsClear(root, side, deg(a))) { target = deg(a); break; }
      }
    }
    if (target > wingFold[key] && COL && sk < 0.5 && !wingIsClear(root, side, wingFold[key])) {
      wingFold[key] = target;                    // 現在的角度已經碰到東西了：立刻收好，不慢慢收
    } else {
      const rate = target > wingFold[key] ? WF.foldSpeed : WF.openSpeed;
      wingFold[key] += (target - wingFold[key]) * ease(rate, dt);
    }
  }
  const flapR = flapDeg * (1 - WF.flapReduce * wingFold.r / deg(WF.maxDeg));
  const flapL = flapDeg * (1 - WF.flapReduce * wingFold.l / deg(WF.maxDeg));
  const local = {
    root: root,
    core: Mat.mul(Mat.translate(...DATA.bones[boneIndex.core].pivot), Mat.scale(coreScale)),
    // 翅根 → 往後收（rotY）→ 上下拍動（rotZ）→ 扭轉（rotX）。右翼正角度往後，左翼負角度往後
    wing_r: Mat.chain(Mat.translate(...DATA.bones[boneIndex.wing_r].pivot), Mat.rotY(wingFold.r), Mat.rotZ(deg(flapR)), Mat.rotX(feather)),
    wing_l: Mat.chain(Mat.translate(...DATA.bones[boneIndex.wing_l].pivot), Mat.rotY(-wingFold.l), Mat.rotZ(deg(-flapL)), Mat.rotX(feather)),
  };

  // 尾巴觸手：飛行時被氣流拉直、波動快一點；睡著時幾乎不動、垂下來
  const TD = CONFIG.tendrils;
  tendrilPhase += TD.waveSpeed * (1 + 0.6 * k) * (1 - 0.75 * sk) * dt;
  const tendril = [
    tendrilPhase,
    TD.waveAmp * (1 - 0.6 * sk),
    -TD.turnLag * (flight.turn / FL.turnRate) * (1 - sk),
    lerp(lerp(TD.droop, TD.droop * 0.3, k), TD.droop * 1.4, sk),
  ];

  const world = [];
  DATA.bones.forEach((b, i) => {
    const l = local[b.name] || Mat.translate(...b.pivot);
    world[i] = b.parent < 0 ? l : Mat.mul(world[b.parent], l);
  });

  return {
    world,
    coreI,
    wave,
    sway: (CONFIG.tailSway * (1 + k) * Math.sin(t * 1.3 + 0.4) - 0.12 * (flight.turn / FL.turnRate)) * (1 - sk),
    lift: 0.05 * k * Math.sin(phase + 1.0),
    breath: lerp(0.012 * Math.sin(t * 1.1), 0.02 * Math.sin(breathePhase), sk),
    bend: -CONFIG.wingBend * flapVel,
    phase, pulsePhase, pulseFreq: p.flapFreq / N, fly: k, pulseBase: p.pulseBase, pulseAmp: p.pulseAmp,
    sleep: sk, breathePhase, breatheSpeed, glowScale: lerp(1, SL.glow, sk), tendril,
    eyeGlow: CONFIG.eyeSpots.glow * lerp(1, CONFIG.eyeSpots.sleepGlow, sk),
  };
}

// ---------------------------------------------------------------------
//  孢子：從菌絲上隨機釋放，慢慢飄落、淡出
// ---------------------------------------------------------------------
const hyphaPts = DATA.parts.find((p) => p.name === 'hyphae').mesh.positions;
const spores = [];

// 觸手末端孢子囊現在的位置：和著色器 tendrilWave 用同一個公式，孢子才會從看得到的孢子囊灑出來
const TIPS = DATA.tendril_tips || [];
const BULB_T = 0.93;
function tendrilWorld(i, pose) {
  const [ph, amp, lag, droop] = pose.tendril;
  const w = ph - BULB_T * 3 + i * 1.7;
  const a = amp * BULB_T * BULB_T;
  const local = [
    TIPS[i][0] + pose.sway + Math.sin(w) * a + lag * BULB_T * BULB_T,
    TIPS[i][1] + pose.lift + Math.cos(w * 0.8 + i) * a * 0.6,
    TIPS[i][2],
  ];
  const p = Mat.apply(pose.world[0], local);
  p[1] -= droop * BULB_T * BULB_T;
  return p;
}

function randInSphere() {
  for (;;) {
    const v = [Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1];
    if (dot(v, v) <= 1) return v;
  }
}

// 孢子碰撞用的分格表：把碰撞方塊依照 x、z 位置放進 8×8 的格子，孢子只要檢查自己那一格
const SPORE_CELL = 8;
const sporeGrid = new Map();
if (COL) {
  for (const b of COL.boxes) {
    const x0 = Math.floor((b.c[0] - b.r) / SPORE_CELL), x1 = Math.floor((b.c[0] + b.r) / SPORE_CELL);
    const z0 = Math.floor((b.c[2] - b.r) / SPORE_CELL), z1 = Math.floor((b.c[2] + b.r) / SPORE_CELL);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const key = i + ',' + j;
      if (!sporeGrid.has(key)) sporeGrid.set(key, []);
      sporeGrid.get(key).push(b);
    }
  }
}

// 孢子如果跑進某個方塊裡，就把它推到最近的表面上（屋頂、樓板的頂面，或牆面），回傳有沒有碰到
function pushSporeOut(p) {
  const list = sporeGrid.get(Math.floor(p[0] / SPORE_CELL) + ',' + Math.floor(p[2] / SPORE_CELL));
  if (!list) return false;
  for (const b of list) {
    const d = [p[0] - b.c[0], p[1] - b.c[1], p[2] - b.c[2]];
    if (d[0] * d[0] + d[1] * d[1] + d[2] * d[2] > b.r * b.r) continue;
    const local = b.ax.map((a) => d[0] * a[0] + d[1] * a[1] + d[2] * a[2]);
    if (local.some((v, k) => Math.abs(v) > b.h[k])) continue;
    // 在方塊裡面：從最淺的那一面推出去
    let best = 0, bestPen = Infinity;
    for (let k = 0; k < 3; k++) {
      const pen = b.h[k] - Math.abs(local[k]);
      if (pen < bestPen) { bestPen = pen; best = k; }
    }
    const sgn = Math.sign(local[best]) || 1;
    for (let a = 0; a < 3; a++) p[a] += b.ax[best][a] * sgn * (bestPen + 0.005);
    return true;
  }
  return false;
}

function updateSpores(t, dt, pose) {
  const rate = lerp(SP.hoverRate, SP.flyRate, pose.fly) * (0.3 + 1.4 * pose.wave) * (1 - pose.sleep);
  let toSpawn = rate * dt;
  const rootM = pose.world[0];
  const back = [-Math.sin(flight.heading), 0, -Math.cos(flight.heading)];
  while ((toSpawn >= 1 || Math.random() < toSpawn) && spores.length < SP.max) {
    toSpawn -= 1;
    let pos;
    if (TIPS.length && Math.random() < CONFIG.tendrils.sporeShare) {   // 從觸手末端的孢子囊灑出來
      pos = tendrilWorld(Math.floor(Math.random() * TIPS.length), pose);
    } else {                                                           // 從身體裡的菌絲飄出來
      const i = Math.floor(Math.random() * (hyphaPts.length / 3));
      pos = Mat.apply(rootM, [hyphaPts[i * 3], hyphaPts[i * 3 + 1], hyphaPts[i * 3 + 2]]);
    }
    const r = randInSphere();
    spores.push({
      p: pos,
      v: [
        flight.vel[0] * 0.4 + back[0] * 0.15 + r[0] * 0.1,
        flight.vel[1] * 0.4 - 0.06 + r[1] * 0.06,
        flight.vel[2] * 0.4 + back[2] * 0.15 + r[2] * 0.1,
      ],
      age: 0,
      life: lerp(SP.life[0], SP.life[1], Math.random()),
      seed: Math.random(),
    });
  }

  const damp = Math.exp(-SP.drag * dt);
  for (let n = spores.length - 1; n >= 0; n--) {
    const sp = spores[n];
    sp.age += dt;
    if (sp.age >= sp.life) { spores.splice(n, 1); continue; }
    if (sp.landed) continue;                                      // 已經停住的孢子不再移動，只會慢慢熄滅
    sp.v[1] -= SP.gravity * dt;
    sp.v[0] += Math.sin(t * 0.7 + sp.seed * 30) * 0.05 * dt;   // 微弱的氣流
    sp.v[2] += Math.cos(t * 0.6 + sp.seed * 17) * 0.05 * dt;
    for (let a = 0; a < 3; a++) { sp.v[a] *= damp; sp.p[a] += sp.v[a] * dt; }
    // FIXED(D07): 除了地面，也會停在屋頂、樓板、牆面上（用分格表只檢查附近的方塊）
    const g = groundHeightAt(sp.p[0], sp.p[2]);
    let land = sp.p[1] <= g;
    if (land) sp.p[1] = g;
    else land = pushSporeOut(sp.p);
    if (land) {                                                   // 落地後停住、慢慢熄滅
      sp.v = [0, 0, 0];
      sp.landed = true;
      sp.life = Math.min(sp.life, sp.age + 2.5);
    }
  }

  for (let n = 0; n < spores.length; n++) {
    const sp = spores[n], o = n * 5;
    sporeCpu[o] = sp.p[0]; sporeCpu[o + 1] = sp.p[1]; sporeCpu[o + 2] = sp.p[2];
    sporeCpu[o + 3] = sp.age / sp.life;
    sporeCpu[o + 4] = sp.seed;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, sporeBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, sporeCpu, 0, spores.length * 5);
}

// ---------------------------------------------------------------------
//  鏡頭：平移跟著生物，角度固定（只有拖曳滑鼠才會旋轉）
// ---------------------------------------------------------------------
// 射線碰撞：從 o 往 dir 方向射一條線，看最近在多遠的地方會碰到牆、柱子、煙囪、冷卻塔或地面。
// 回傳最多可以伸多遠（不會超過 want）。鏡頭（D04）和翅膀收合（D06）都用這個。
const CAM_MARGIN = 0.3;     // 鏡頭和牆之間至少留這麼多空間
const CAM_MIN = 0.15;       // 鏡頭最近可以靠到多近（碰撞優先：不能為了保持距離把鏡頭推進牆裡）
function rayClearance(o, dir, want) {
  let best = want;
  if (COL) {
    for (const b of COL.boxes) {
      // 先粗略排除：方塊離這條線太遠就不用細算
      const cx = b.c[0] - o[0], cy = b.c[1] - o[1], cz = b.c[2] - o[2];
      const tc = Math.max(0, Math.min(best, cx * dir[0] + cy * dir[1] + cz * dir[2]));
      const qx = cx - dir[0] * tc, qy = cy - dir[1] * tc, qz = cz - dir[2] * tc;
      const lim = b.r + CAM_MARGIN;
      if (qx * qx + qy * qy + qz * qz > lim * lim) continue;
      // 細算：把線轉到方塊自己的座標裡，三個方向各算一次「進入、離開」的距離（slab 法）
      let tIn = -Infinity, tOut = Infinity;
      for (let k = 0; k < 3 && tIn <= tOut; k++) {
        const a = b.ax[k], h = b.h[k] + CAM_MARGIN;
        const ok = -(cx * a[0] + cy * a[1] + cz * a[2]);       // 起點在方塊座標裡的位置
        const dk = dir[0] * a[0] + dir[1] * a[1] + dir[2] * a[2];
        if (Math.abs(dk) < 1e-6) { if (Math.abs(ok) > h) tIn = Infinity; continue; }
        let t1 = (-h - ok) / dk, t2 = (h - ok) / dk;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tIn = Math.max(tIn, t1); tOut = Math.min(tOut, t2);
      }
      if (tIn <= tOut && tIn >= 0 && tIn < best) best = tIn;
    }
  }
  // 圓柱（煙囪、冷卻塔）和地面：沿著線一小段一小段檢查
  for (let s = 0.4; s < best; s += 0.25) {
    const p = [o[0] + dir[0] * s, o[1] + dir[1] * s, o[2] + dir[2] * s];
    let hit = p[1] < groundHeightAt(p[0], p[2]) + CAM_MARGIN;
    if (!hit && COL) {
      for (const c of COL.cyls) {
        const y = p[1] - c.base[1];
        if (y < -CAM_MARGIN || y > c.height + CAM_MARGIN) continue;
        const t = Math.max(0, Math.min(1, y / c.height)) * (c.radii.length - 1);
        const i0 = Math.min(Math.floor(t), c.radii.length - 2);
        const R = lerp(c.radii[i0], c.radii[i0 + 1], t - i0);
        const rho = Math.hypot(p[0] - c.base[0], p[2] - c.base[2]);
        if (c.shell ? Math.abs(rho - R) < SHELL_HALF + CAM_MARGIN : rho < R + CAM_MARGIN) { hit = true; break; }
      }
    }
    if (hit) { best = s - 0.25; break; }
  }
  return Math.max(CAM_MIN, best);
}

// FIXED(D04): 鏡頭會被牆擋住時自動拉近到牆前面，障礙物離開後再慢慢退回原本的距離
function updateCamera(t, dt) {
  const k = ease(4, dt);
  for (let a = 0; a < 3; a++) cam.target[a] += (flight.pos[a] - cam.target[a]) * k;
  const dir = [Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)];
  const allowed = rayClearance(cam.target, dir, cam.distance);
  // 被擋住時立刻拉近（才不會看到牆裡面），沒被擋住時慢慢退回去（畫面才不會一直跳）
  cam.actual = allowed < cam.actual ? allowed : cam.actual + (allowed - cam.actual) * ease(2.5, dt);
  return [
    cam.target[0] + dir[0] * cam.actual,
    cam.target[1] + dir[1] * cam.actual,
    cam.target[2] + dir[2] * cam.actual,
  ];
}

// ---------------------------------------------------------------------
//  繪製
// ---------------------------------------------------------------------
const colors = DATA.colors;
// 身體輪廓參數（給收翅包身體用，和 Rust 的公式一致）
const BODY = (() => {
  const P = DATA.params;
  let maxRaw = 0;
  for (let i = 0; i <= 1000; i++) {
    const th = Math.PI * i / 1000;
    maxRaw = Math.max(maxRaw, Math.sin(th) * Math.pow(Math.sin(th / 2), P.body_taper));
  }
  return { half: P.body_length / 2, radius: P.body_radius, taper: P.body_taper, maxRaw, flatten: P.body_flatten, tailLift: P.tail_lift };
})();
const halfSpan = DATA.params.wing_span * 0.5;

function drawPart(part, pose, cull) {
  const u = progMain.u;
  gl.uniformMatrix4fv(u.u_model, false, pose.world[part.bone]);
  gl.uniform1i(u.u_mat, part.mat);
  gl.uniform1f(u.u_alpha, part.alpha);
  gl.bindVertexArray(part.vao);
  if (cull) {
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.FRONT); gl.drawElements(gl.TRIANGLES, part.count, gl.UNSIGNED_INT, 0);   // 先畫背面
    gl.cullFace(gl.BACK);  gl.drawElements(gl.TRIANGLES, part.count, gl.UNSIGNED_INT, 0);   // 再畫正面
  } else {
    gl.disable(gl.CULL_FACE);
    gl.drawElements(gl.TRIANGLES, part.count, gl.UNSIGNED_INT, 0);
  }
}

// 翅膀膜，再把光點與小菌絲用加法混合疊在上面
function drawWing(wing, glow, pose, side) {
  gl.uniform1f(progMain.u.u_side, side);
  drawPart(wing, pose, false);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  drawPart(glow, pose, false);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}

let last = performance.now();
const startTime = last;

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  const t = (now - startTime) / 1000;
  resize();
  gl.viewport(0, 0, canvas.width, canvas.height);

  updateFlight(t, dt);
  const eye = updateCamera(t, dt);
  const aspect = canvas.width / canvas.height;
  const view = Mat.lookAt(eye, cam.target, [0, 1, 0]);
  const proj = Mat.perspective(deg(CONFIG.camera.fov), aspect, 0.1, 600);
  const pose = animate(t, dt);
  const corePos = Mat.apply(pose.world[boneIndex.core], [0, 0, 0]);
  updateSpores(t, dt, pose);

  const statusText = mode === 'sleep' ? (pose.sleep > 0.95 ? '睡覺中' : '準備入睡…')
    : pose.sleep > 0.05 ? '醒來中…'
    : flight.moving ? '飛行中 · 移動' : (pose.fly > 0.5 ? '飛行中' : '漂浮中');
  if (statusEl.textContent !== statusText) statusEl.textContent = statusText;

  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // 1. 背景
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.useProgram(progBg.program);
  gl.uniform1f(progBg.u.u_aspect, aspect);
  gl.bindVertexArray(emptyVao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // 2. 環境（不透明的先畫，鐵絲網半透明最後畫）
  if (ENV) {
    const E = CONFIG.environment;
    const eu = progEnv.u;
    gl.useProgram(progEnv.program);
    gl.uniformMatrix4fv(eu.u_view, false, view);
    gl.uniformMatrix4fv(eu.u_proj, false, proj);
    gl.uniform1f(eu.u_time, t);
    gl.uniform1f(eu.u_wind, E.wind);
    gl.uniform3fv(eu.u_camPos, eye);
    gl.uniform3fv(eu.u_moonDir, norm(E.moonDir));
    gl.uniform3fv(eu.u_moonColor, E.moonColor);
    gl.uniform3fv(eu.u_skyAmb, E.skyAmbient);
    gl.uniform3fv(eu.u_groundAmb, E.groundAmbient);
    gl.uniform3fv(eu.u_fogColor, E.fogColor);
    gl.uniform1f(eu.u_fogDensity, E.fogDensity);
    gl.uniform3fv(eu.u_corePos, corePos);
    gl.uniform3fv(eu.u_coreColor, colors.core);
    gl.uniform1f(eu.u_coreI, pose.coreI);
    gl.uniform1f(eu.u_coreLight, E.coreLight);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    for (const part of envParts) {
      if (part.mat === 1) continue;
      gl.uniform1i(eu.u_mat, part.mat);
      gl.bindVertexArray(part.vao);
      gl.drawElements(gl.TRIANGLES, part.count, gl.UNSIGNED_INT, 0);
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    for (const part of envParts) {
      if (part.mat !== 1) continue;
      gl.uniform1i(eu.u_mat, part.mat);
      gl.bindVertexArray(part.vao);
      gl.drawElements(gl.TRIANGLES, part.count, gl.UNSIGNED_INT, 0);
    }
  }

  // 微光粒子（加法混合；有環境時會被建築擋住）
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.depthMask(false);
  if (ENV) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
  if (!ENV) {
  gl.useProgram(progFloor.program);
  gl.uniformMatrix4fv(progFloor.u.u_view, false, view);
  gl.uniformMatrix4fv(progFloor.u.u_proj, false, proj);
  gl.uniform3fv(progFloor.u.u_center, cam.target);
  gl.uniform1f(progFloor.u.u_floorY, FL.floorY);
  gl.uniform3fv(progFloor.u.u_corePos, corePos);
  gl.uniform3fv(progFloor.u.u_coreColor, colors.core);
  gl.uniform1f(progFloor.u.u_coreI, pose.coreI);
  gl.bindVertexArray(quadVao);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  gl.useProgram(progMote.program);
  gl.uniformMatrix4fv(progMote.u.u_view, false, view);
  gl.uniformMatrix4fv(progMote.u.u_proj, false, proj);
  gl.uniform1f(progMote.u.u_time, t);
  gl.uniform1f(progMote.u.u_scale, 22 * canvas.height / 900);
  gl.uniform3fv(progMote.u.u_center, cam.target);
  gl.bindVertexArray(moteVao);
  gl.drawArrays(gl.POINTS, 0, CONFIG.moteCount);

  // 3. 生物本體
  gl.useProgram(progMain.program);
  const u = progMain.u;
  gl.uniformMatrix4fv(u.u_view, false, view);
  gl.uniformMatrix4fv(u.u_proj, false, proj);
  gl.uniform3fv(u.u_camPos, eye);
  gl.uniform3fv(u.u_corePos, corePos);
  gl.uniform3fv(u.u_lightDir, norm(CONFIG.lightDir));
  gl.uniform3fv(u.u_bodyColor, colors.body);
  gl.uniform3fv(u.u_coreColor, colors.core);
  gl.uniform3fv(u.u_wingColor, colors.wing);
  gl.uniform1f(u.u_coreI, pose.coreI);
  gl.uniform1f(u.u_sway, pose.sway);
  gl.uniform1f(u.u_lift, pose.lift);
  gl.uniform1f(u.u_breath, pose.breath);
  gl.uniform1f(u.u_bend, pose.bend);
  gl.uniform1f(u.u_phase, pose.phase);
  gl.uniform1f(u.u_time, t);
  gl.uniform1f(u.u_fly, pose.fly);
  gl.uniform1f(u.u_pulseBase, pose.pulseBase);
  gl.uniform1f(u.u_pulseAmp, pose.pulseAmp);
  gl.uniform1f(u.u_pulseFreq, pose.pulseFreq);
  gl.uniform1f(u.u_pulsePhase, pose.pulsePhase);
  gl.uniform1f(u.u_pulseSharp, CONFIG.pulseSharpness);
  gl.uniform1f(u.u_breatheSpeed, pose.breatheSpeed);
  gl.uniform1f(u.u_breathePhase, pose.breathePhase);
  gl.uniform1f(u.u_glowScale, pose.glowScale);
  gl.uniformMatrix4fv(u.u_rootModel, false, pose.world[0]);
  gl.uniform1f(u.u_fold, pose.sleep);
  gl.uniform4f(u.u_body, BODY.half, BODY.radius, BODY.taper, BODY.maxRaw);
  gl.uniform1f(u.u_bodyFlat, BODY.flatten);
  gl.uniform1f(u.u_tailLift, BODY.tailLift);
  gl.uniform1f(u.u_wrapFrom, CONFIG.sleep.wrapFrom);
  gl.uniform1f(u.u_wrapTo, CONFIG.sleep.wrapTo);
  gl.uniform1f(u.u_wingSpan, DATA.params.wing_span);
  gl.uniform1f(u.u_wrapGap, CONFIG.sleep.wrapGap);
  gl.uniform1f(u.u_wrapAngle, CONFIG.sleep.wrapAngle);
  gl.uniform1f(u.u_foldOpacity, lerp(1, CONFIG.sleep.foldedOpacity, pose.sleep));
  gl.uniform1f(u.u_flySpeed, CONFIG.energy.flySpeed);
  gl.uniform1f(u.u_hoverSpeed, CONFIG.energy.hoverSpeed);
  gl.uniform1f(u.u_fade, CONFIG.energy.fade);
  gl.uniform1f(u.u_strandBright, CONFIG.wingSpots.strandBrightness);
  gl.uniform1f(u.u_spotRoot, CONFIG.wingSpots.rootDistance);
  gl.uniform1f(u.u_rootBlend, CONFIG.wingRootBlend);
  gl.uniform4fv(u.u_tendril, pose.tendril);
  gl.uniform1f(u.u_tendrilBright, CONFIG.tendrils.brightness);
  gl.uniform1f(u.u_eyeGlow, pose.eyeGlow);

  //   核心是不透明的，先畫並寫入深度
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  drawPart(parts.core, pose, true);

  //   半透明的部分：不寫深度，依離鏡頭遠近由遠到近畫
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  const dist = (p) => { const d = sub(p, eye); return dot(d, d); };
  const groups = [
    { d: dist(Mat.apply(pose.world[0], [0, 0, 0])), draw: () => {
      drawPart(parts.inner_body, pose, true);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);                 // 菌絲用加法混合，看起來在發光
      drawPart(parts.hyphae, pose, false);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      drawPart(parts.body, pose, true);
      drawPart(parts.eye_spots, pose, false);              // 感光點貼在身體表面
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);                 // 觸手也用加法混合，看起來在發光
      drawPart(parts.tendrils, pose, false);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    } },
    { d: dist(Mat.apply(pose.world[parts.wing_r.bone], [halfSpan, 0, 0])), draw: () => drawWing(parts.wing_r, parts.wing_glow_r, pose, 1) },
    { d: dist(Mat.apply(pose.world[parts.wing_l.bone], [-halfSpan, 0, 0])), draw: () => drawWing(parts.wing_l, parts.wing_glow_l, pose, -1) },
  ];
  groups.sort((a, b) => b.d - a.d).forEach((g) => g.draw());

  // 4. 孢子（加法混合，會被核心擋住）
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.useProgram(progSpore.program);
  gl.uniformMatrix4fv(progSpore.u.u_view, false, view);
  gl.uniformMatrix4fv(progSpore.u.u_proj, false, proj);
  gl.uniform1f(progSpore.u.u_time, t);
  gl.uniform1f(progSpore.u.u_pxScale, proj[5] * canvas.height * 0.5);
  gl.uniform1f(progSpore.u.u_size, SP.size);
  gl.uniform3fv(progSpore.u.u_color, colors.core);
  gl.bindVertexArray(sporeVao);
  gl.drawArrays(gl.POINTS, 0, spores.length);

  // 5. 核心光暈（會被前面的建築擋住）
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.disable(gl.CULL_FACE);
  gl.useProgram(progGlow.program);
  gl.uniformMatrix4fv(progGlow.u.u_view, false, view);
  gl.uniformMatrix4fv(progGlow.u.u_proj, false, proj);
  gl.uniform3fv(progGlow.u.u_center, corePos);
  gl.uniform1f(progGlow.u.u_size, DATA.params.core_radius * 6);
  gl.uniform3fv(progGlow.u.u_color, colors.core);
  gl.uniform1f(progGlow.u.u_int, 0.3 + 0.8 * pose.coreI);
  gl.bindVertexArray(quadVao);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  gl.depthMask(true);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
