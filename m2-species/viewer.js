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
    brightness: 1.0,           // 亮度
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

  // 晝夜：人類不在了，夜裡沒有一盞燈，滿天星星；地上唯一的光是牠和真菌
  dayNight: {
    dayLength: 1200,           // 一整天（白天 + 夜晚）是幾秒：20 分鐘，夜晚大約 10 分鐘
    startHour: 21.5,           // 一打開是幾點（21.5 = 晚上 9 點半）
    fastForward: 30,           // 按 T 快轉的倍數
    dayDrainMul: 3,            // 白天硬要醒著飛，體力消耗是晚上的幾倍
    // 白天的光
    sunColor: [1.0, 0.93, 0.8],
    daySkyAmbient: [0.42, 0.47, 0.53],
    dayGroundAmbient: [0.16, 0.15, 0.13],
    // 天空的顏色：天頂、地平線（地平線的顏色也是霧的顏色，遠方才會自然地融進天空）
    nightTop: [0.008, 0.016, 0.035],
    dayTop: [0.22, 0.42, 0.7],
    dayHorizon: [0.6, 0.67, 0.73],
    duskTop: [0.16, 0.17, 0.32],
    duskHorizon: [0.72, 0.42, 0.3],
    stars: 1.0,                // 星星的亮度
    moonStrength: 0.5,         // 月光的強度（太亮地面會白得像雪）
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

  // 體力：飛行會累，睡覺會恢復
  stamina: {
    flyDrain: 1 / 180,         // 在空中移動時每秒消耗多少（1 = 全部）：一直飛大約 3 分鐘會累倒
    flyIdleDrain: 1 / 600,     // 飛行模式停在原地拍翅膀，消耗得比較慢（大約 10 分鐘）
    hoverRecover: 1 / 180,     // 漂浮時慢慢恢復
    sleepRecover: 1 / 25,      // 睡著時恢復得最快：從累倒到睡飽大約 25 秒
    tiredBelow: 0.35,          // 體力低於多少開始看得出累（飛得慢、拍翅吃力、光變暗、慢慢往下掉）
    slowest: 0.45,             // 累到極點時，最快速度剩原本的多少
    sinkSpeed: 0.35,           // 累到極點時，沒有按上升會慢慢往下掉的速度
    wakeAt: 0.5,               // 累倒睡著後，體力恢復到多少才叫得醒
  },

  // 地底冷卻池
  coolingPool: {
    glow: [0.06, 0.26, 0.7],   // 池水藍光的顏色和亮度
    light: [0.12, 0.42, 1.0],  // 池水照亮四周牆壁的光
  },

  // 繁殖：自行分裂。在地底冷卻池邊，核心分出一小顆光，包成卵黏在池壁上，孵出幼體
  breeding: {
    minStamina: 0.5,           // 體力至少要多少才能分裂
    cost: 0.3,                 // 分裂一次用掉多少體力
    splitTime: 5,              // 分裂的過程幾秒
    cooldown: 25,              // 分裂完要隔幾秒才能再分裂
    incubate: 80,              // 卵幾秒後孵化（每顆會差一點）
    maxOffspring: 5,           // 卵和幼體加起來最多幾隻
    eggRadius: 0.16,           // 卵的大小（半徑）
    youngStart: 0.22,          // 剛孵出來的幼體是成體的幾倍大
    youngScale: 0.42,          // 長大後（還是幼體）是成體的幾倍大
    growTime: 90,              // 幾秒長到 youngScale
    youngSpeed: 2.2,           // 幼體飛多快（成體是 3.2）
    youngLinger: [3, 8],       // 幼體到了一個地方，停下來看幾秒
    youngRoam: 12,             // 幼體通常在附近幾公尺內找下一個想去的地方
    youngGlow: 0.55,           // 幼體的菌絲和核心比成體暗多少（菌絲還很微弱）
  },

  // 自己的行為：沒人操作時自己探索、天快亮時自己找地方躲起來
  autonomy: {
    enabled: true,
    idleDelay: 10,             // 幾秒沒按鍵，牠就開始自己探索
    linger: [6, 10],           // 到了一個地方，停下來看幾秒（同時降低高度撒孢子）
    sowBoost: 8,               // 停下來時撒孢子的量是平常的幾倍
    sowHeight: 2.0,            // 停下來撒孢子時，降到離下面多高
    seekHour: 4.5,             // 幾點開始找地方躲（6 點天亮；一天 20 分鐘時，大約有 75 秒可以飛過去）
    seekTimeout: 45,           // 找躲藏點最多花幾秒，超過就原地睡
    giveUpAfter: 25,           // 一個探索目標飛了幾秒還到不了，就換一個（遠的地方會依距離多給一點時間）
  },
  // 孢子落地長出的真菌：人類的廢墟慢慢被發光的菌斑覆蓋
  fungus: {
    chance: 0.5,               // 每顆落地的孢子長出真菌的機率
    max: 600,                  // 最多幾片
    mergeDist: 0.7,            // 落在已經有真菌的地方附近，就讓那一片長大
    startSize: [0.3, 0.5],     // 剛長出來的大小（半徑）
    growPerSpore: 0.1,         // 每多一顆孢子，那一片長大多少
    maxSize: 1.8,
    growSpeed: 0.08,           // 長大的速度
    glow: 0.9,                 // 夜裡的亮度
    dayGlow: 0.25,             // 白天看起來的亮度
  },

  // 孢子：生物飛行時幫真菌散播
  spores: {
    max: 500,
    hoverRate: 0.5,            // 漂浮時每秒平均掉幾顆
    flyRate: 4.0,              // 飛行時每秒平均掉幾顆（脈動時更多）
    life: [8, 14],             // 存在幾秒
    gravity: 0.24,             // 落下的速度（太慢的話孢子還沒落地就熄了，長不出真菌）
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
    p += vec3(u_sway, u_lift, 0.0) * a_w + tendrilWave(t, floor(a_uv.y));
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

  if (u_mat == 5) {                    // 尾巴觸手：和身體一樣的半透明質感（像身體延伸出去），能量淡淡流到末端的孢子囊
    float t = fract(v_uv.y);
    float dist = v_uv.x;
    float I = (u_pulseBase * 0.5 + u_pulseAmp * energyAt(dist)) * exp(-(dist - 1.2) * u_fade * 0.5);
    float bulb = smoothstep(0.84, 0.9, t);
    vec3 base = u_bodyColor * (0.18 + 0.55 * diff);
    vec3 col = base * (0.35 + 1.3 * fres) + film(fres * 1.2 + 0.15) * 0.22 * fres + vec3(1.0) * spec * 0.7
             + u_coreColor * (coreLight * 1.3 + (0.15 + 0.6 * I) * (0.3 + bulb));
    float a = 0.05 + 0.55 * fres + 0.35 * coreLight + spec * 0.5 + (0.1 + 0.3 * I) * (0.3 + bulb);
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
// 天空：顏色隨時間變化；夜裡是沒有光害的星空和銀河，白天有太陽（鏡頭轉動時天空跟著轉）
const BG_FS = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform vec3 u_camF, u_camR, u_camU;      // 鏡頭的前、右、上
uniform float u_tanH, u_aspect, u_time;
uniform vec3 u_top, u_horizon, u_sunDir, u_moonDir, u_twiColor;
uniform float u_day, u_twi, u_stars;

float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise3(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
// 一層星星：把天空切成小格子，每格有一定機會放一顆星
float starLayer(vec3 d, float scale, float chance, float size) {
  vec3 p = d * scale;
  vec3 c = floor(p);
  if (hash3(c) > chance) return 0.0;
  vec3 sp = normalize(c + 0.5 + (vec3(hash3(c + 1.7), hash3(c + 3.1), hash3(c + 5.3)) - 0.5) * 0.7) * scale;
  float dist = length(p - sp);
  float bright = 0.35 + 0.65 * hash3(c + 9.1);
  float twinkle = 0.75 + 0.25 * sin(u_time * (1.5 + 3.0 * hash3(c + 4.4)) + hash3(c) * 40.0);
  return smoothstep(size, 0.0, dist) * bright * twinkle;
}

void main() {
  vec2 ndc = v_uv * 2.0 - 1.0;
  vec3 d = normalize(u_camF + u_camR * ndc.x * u_tanH * u_aspect + u_camU * ndc.y * u_tanH);
  float up = max(d.y, 0.0);
  vec3 c = mix(u_horizon, u_top, pow(up, 0.55));

  // 黃昏、黎明：太陽那一側的地平線染成橘紅
  vec2 hz = normalize(d.xz + 1e-5), sz = normalize(u_sunDir.xz + 1e-5);
  float toward = pow(max(dot(hz, sz), 0.0), 2.0);
  c += u_twiColor * u_twi * exp(-up * 5.0) * (0.25 + 0.75 * toward);

  // 星星和銀河：只有夜裡看得到，靠近地平線被霧氣遮住
  float night = u_stars * (1.0 - u_day) * smoothstep(-0.02, 0.18, d.y);
  if (night > 0.001) {
    float band = exp(-pow(dot(d, normalize(vec3(0.35, 0.55, 0.76))) / 0.2, 2.0));
    float cloud = noise3(d * 7.0) * 0.6 + noise3(d * 19.0) * 0.4;
    vec3 milky = vec3(0.1, 0.11, 0.15) * band * smoothstep(0.35, 0.8, cloud);
    float st = starLayer(d, 140.0, 0.05 + 0.08 * band, 0.2) * 0.9
             + starLayer(d, 70.0, 0.012, 0.16) * 1.6
             + starLayer(d, 260.0, 0.06 * band, 0.25) * 0.5;
    c += (milky + vec3(0.85, 0.9, 1.0) * st) * night;
  }

  // 月亮（夜裡）和太陽（白天）
  float md = dot(d, u_moonDir);
  float moonUp = smoothstep(-0.05, 0.05, u_moonDir.y) * (1.0 - u_day * 0.85);
  c += vec3(0.8, 0.83, 0.9) * smoothstep(0.99962, 0.9998, md) * moonUp;
  c += vec3(0.25, 0.3, 0.4) * pow(max(md, 0.0), 400.0) * 0.5 * moonUp;
  float sd = dot(d, u_sunDir);
  float sunUp = smoothstep(-0.08, 0.04, u_sunDir.y);
  c += vec3(1.0, 0.95, 0.85) * smoothstep(0.9993, 0.9996, sd) * sunUp * 2.0;
  c += vec3(1.0, 0.85, 0.6) * (pow(max(sd, 0.0), 60.0) * 0.35 + pow(max(sd, 0.0), 6.0) * 0.08) * sunUp;
  o = vec4(c, 1.0);
}`;

// 背景微光粒子：在鏡頭周圍的一個箱子裡循環，飛多遠都看得到
const MOTE_VS = `#version 300 es
layout(location=0) in vec4 a_mote;   // xyz + 隨機種子
uniform mat4 u_view, u_proj; uniform float u_time, u_scale, u_night; uniform vec3 u_center;
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
  v_a = edge * (0.35 + 0.65 * fract(sd * 7.3)) * (0.6 + 0.4 * sin(u_time * (0.5 + sd) + sd * 20.0)) * mix(0.15, 1.0, u_night);
}`;
const MOTE_FS = `#version 300 es
precision highp float;
in float v_a; out vec4 o;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float g = exp(-dot(c, c) * 3.5) * v_a * 0.3;
  o = vec4(vec3(0.5, 0.9, 0.85) * g, 1.0);
}`;

// 卵：半透明的殼，裡面有一顆會脈動的小光核（從成體核心分出來的）和微弱的菌絲
// 快孵化時光核越來越亮、殼會微微顫動。kind = 1 是正在從成體身上分出去的光球
const EGG_VS = `#version 300 es
layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 i_pos;
layout(location=2) in vec4 i_info;        // 半徑、種子、孵化進度（0～1）、種類（0 卵 / 1 光球）
uniform mat4 u_view, u_proj; uniform float u_time;
out vec3 v_w, v_n, v_c; out vec4 v_info;
void main() {
  float r = i_info.x * (1.0 + 0.15 * i_info.z);
  float shake = smoothstep(0.88, 1.0, i_info.z) * 0.06 * sin(u_time * 14.0 + i_info.y * 30.0);
  r *= 1.0 + shake;
  vec3 stretch = a_pos * vec3(1.0, 1.15, 1.0);                       // 稍微長一點，像一顆卵
  v_w = i_pos + stretch * r;
  v_n = normalize(a_pos); v_c = i_pos; v_info = i_info;
  gl_Position = u_proj * u_view * vec4(v_w, 1.0);
}`;
const EGG_FS = `#version 300 es
precision highp float;
in vec3 v_w, v_n, v_c; in vec4 v_info; out vec4 o;
uniform vec3 u_camPos, u_shell, u_core; uniform float u_time;
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
void main() {
  float prog = v_info.z, seed = v_info.y, r = v_info.x;
  vec3 V = normalize(u_camPos - v_w);
  vec3 N = normalize(v_n);
  if (dot(N, V) < 0.0) N = -N;
  float fres = pow(1.0 - abs(dot(N, V)), 2.5);
  // 視線離卵中心多近 → 裡面的光核
  vec3 rd = -V;
  vec3 oc = v_c - u_camPos;
  float closest = length(oc - rd * dot(oc, rd)) / r;
  float beat = 0.5 + 0.5 * sin(u_time * mix(1.2, 4.0, prog * prog) + seed * 20.0);
  float nucleus = exp(-closest * closest * 9.0) * (0.35 + 0.5 * prog + 0.3 * beat);
  // 微弱的菌絲（卵裡本來就有）
  float line = 1.0 - smoothstep(0.0, 0.07, abs(n3(v_n * 3.2 + seed * 9.0) - 0.5));
  float hyphae = line * (0.25 + 0.5 * prog) * (0.6 + 0.4 * beat);
  if (v_info.w > 0.5) {                                                  // 分出去中的光球：中間最亮、邊緣柔和
    float edge = 1.0 - fres;
    o = vec4(u_core * (0.5 + 1.0 * edge) * (0.8 + 0.4 * beat), clamp(0.15 + 0.85 * edge * edge, 0.0, 1.0));
    return;
  }
  vec3 col = u_shell * (0.15 + 0.6 * fres) + u_core * (nucleus * 1.4 + hyphae * 0.5);
  float a = 0.18 + 0.55 * fres + nucleus * 0.6 + hyphae * 0.3;
  o = vec4(col, clamp(a, 0.0, 1.0));
}`;

// 冷卻池的水：人類離開很久了，池水還留著一點餘溫，發出淡淡的藍光
// （真實的核燃料冷卻池裡，水會發出藍色的「契忍可夫輻射」光）
const WATER_VS = `#version 300 es
layout(location=0) in vec2 a_corner;
uniform mat4 u_view, u_proj; uniform vec4 u_rect; uniform float u_y;
out vec3 v_w;
void main() {
  vec2 t = a_corner * 0.5 + 0.5;
  v_w = vec3(mix(u_rect.x, u_rect.y, t.x), u_y, mix(u_rect.z, u_rect.w, t.y));
  gl_Position = u_proj * u_view * vec4(v_w, 1.0);
}`;
const WATER_FS = `#version 300 es
precision highp float;
in vec3 v_w; out vec4 o;
uniform vec3 u_camPos, u_glow, u_corePos, u_coreColor; uniform float u_time, u_coreI; uniform vec4 u_rect;
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec2 p = v_w.xz;
  // 水面的小波紋（兩層往不同方向慢慢流）
  float w1 = vnoise(p * 1.3 + vec2(u_time * 0.12, u_time * 0.05));
  float w2 = vnoise(p * 2.7 - vec2(u_time * 0.07, u_time * 0.11));
  float caustic = pow(1.0 - abs(w1 + w2 - 1.0), 6.0);
  // 越靠池中央越深、越亮（光從池底的深處發出來）
  vec2 c = vec2(u_rect.x + u_rect.y, u_rect.z + u_rect.w) * 0.5, h = vec2(u_rect.y - u_rect.x, u_rect.w - u_rect.z) * 0.5;
  vec2 q = abs(p - c) / h;
  float center = 1.0 - smoothstep(0.2, 1.0, max(q.x, q.y));
  vec3 V = normalize(u_camPos - v_w);
  float fres = pow(1.0 - max(V.y, 0.0), 3.0);
  vec3 col = u_glow * (0.35 + 0.65 * center) * (0.8 + 0.5 * caustic);
  col += vec3(0.6, 0.8, 1.0) * fres * 0.08;
  // 生物飛近時，牠的光倒映在水面上
  vec3 L = u_corePos - v_w;
  col += u_coreColor * u_coreI * 0.6 / (1.0 + dot(L, L) * 0.25) * (0.6 + 0.4 * caustic);
  o = vec4(col, 0.94);
}`;

// 真菌：貼在表面上的一片發光菌斑（菌絲網 + 幾顆小菇），會呼吸般明滅；生物靠近時亮起來
const FUNGUS_VS = `#version 300 es
layout(location=0) in vec2 a_corner;
layout(location=1) in vec3 a_pos;
layout(location=2) in vec3 a_n;
layout(location=3) in vec2 a_info;     // 大小、種子
uniform mat4 u_view, u_proj;
out vec2 v_c; out float v_seed; out vec3 v_w;
void main() {
  vec3 n = normalize(a_n);
  vec3 t = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 b = cross(n, t);
  float r = a_info.x * 1.3;
  vec3 w = a_pos + n * 0.08 + (t * a_corner.x + b * a_corner.y) * r;
  v_c = a_corner; v_seed = a_info.y; v_w = w;
  gl_Position = u_proj * u_view * vec4(w, 1.0);
}`;
const FUNGUS_FS = `#version 300 es
precision highp float;
in vec2 v_c; in float v_seed; in vec3 v_w; out vec4 o;
uniform vec3 u_color, u_corePos; uniform float u_time, u_glow, u_coreI;
// FIXED(D13): 原本用 sin 做雜湊，有些顯示卡算大數字的 sin 不精確，真菌上出現一格一格的雜點；改用不用 sin 的雜湊
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  float r = length(v_c);
  if (r > 1.0) discard;
  vec2 q = v_c * 3.0 + v_seed * 17.0;
  float edge = smoothstep(1.0, 0.25, r + (vnoise(q * 0.8) - 0.5) * 0.45);          // 邊緣不規則
  float net = 1.0 - smoothstep(0.0, 0.07, abs(vnoise(q) - 0.5));                     // 菌絲網
  net += 0.6 * (1.0 - smoothstep(0.0, 0.05, abs(vnoise(q * 2.3 + 5.0) - 0.5)));
  float caps = 0.0;                                                                    // 幾顆小菇的發光頭
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec2 c = (vec2(h21(vec2(v_seed, fi)), h21(vec2(fi, v_seed))) - 0.5) * 1.3;
    caps += exp(-dot(v_c - c, v_c - c) * 220.0) * (0.5 + h21(vec2(fi * 3.1, v_seed)));
  }
  float breathe = 0.7 + 0.3 * sin(u_time * 0.8 + v_seed * 40.0);
  float near = exp(-dot(v_w - u_corePos, v_w - u_corePos) / 18.0) * (0.6 + u_coreI);  // 生物靠近時亮起來
  float g = (net * 0.35 * edge + caps * 1.4 + edge * 0.08) * breathe * u_glow * (1.0 + 1.5 * near);
  o = vec4(u_color * g, 1.0);
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
// 地底冷卻池：房間範圍 (x0, x1, z0, z1)、洞口範圍、天花板底面高度、池水的光（位置、顏色）
uniform vec4 u_room, u_hole; uniform float u_ceilY; uniform vec3 u_poolLightPos, u_poolLight;
out vec4 o;

float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }

// 在地底嗎？（1 = 在地底房間裡，月光、陽光照不到；洞口正下方有一點天光漏下來）
float underground() {
  vec2 p = v_wpos.xz;
  float inRoom = step(u_room.x, p.x) * step(p.x, u_room.y) * step(u_room.z, p.y) * step(p.y, u_room.w);
  float below = 1.0 - smoothstep(u_ceilY - 0.05, u_ceilY + 0.05, v_wpos.y);
  vec2 hc = vec2(u_hole.x + u_hole.y, u_hole.z + u_hole.w) * 0.5, hh = vec2(u_hole.y - u_hole.x, u_hole.w - u_hole.z) * 0.5;
  vec2 q = abs(p - hc) - hh;
  float shaft = 1.0 - smoothstep(0.0, 4.0, max(q.x, q.y));       // 洞口附近
  return inRoom * below * (1.0 - 0.55 * shaft);
}
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
  // 地底：天光幾乎照不到，只剩池水淡淡的藍光
  float ug = underground();
  vec3 P = u_poolLightPos - v_wpos;
  float pd2 = dot(P, P);
  float pf = max(dot(N, P * inversesqrt(max(pd2, 1e-4))), 0.0) * 0.8 + 0.2;
  vec3 pool = u_poolLight * pf / (1.0 + pd2 * 0.03) * ug;
  vec3 sky = (amb + u_moonColor * moon) * (1.0 - ug) + vec3(0.012, 0.014, 0.02) * ug;
  return base * (sky + core + pool);
}
vec3 fogged(vec3 c) {
  float d = length(v_wpos - u_camPos);
  vec3 fogC = mix(u_fogColor, vec3(0.005, 0.012, 0.025), underground());   // 地底的霧是暗的
  return mix(c, fogC, 1.0 - exp(-d * u_fogDensity));
}

void main() {
  vec3 N = normalize(v_nrm);
  // FIXED(D11): 原本用「是不是正面」決定要不要翻轉法線，地面的三角形是反面朝上，法線被翻成朝下，
  // 所以地面從來沒被月光（現在加上的太陽）照到，白天也是黑的。改成「朝向鏡頭的那一面」才翻。
  if (dot(N, u_camPos - v_wpos) < 0.0) N = -N;

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
const progFungus = compile(FUNGUS_VS, FUNGUS_FS);
const progWater = compile(WATER_VS, WATER_FS);
const progEgg = compile(EGG_VS, EGG_FS);
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
const staminaBar = document.getElementById('staminaBar');
const staminaText = document.getElementById('staminaText');
const clockEl = document.getElementById('clock');
const fungusEl = document.getElementById('fungusCount');
const offspringEl = document.getElementById('offspring');
const modeButtons = document.querySelectorAll('.seg button[data-mode]');
function setMode(m) {
  mode = m;
  modeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
}
setMode(mode);

// 體力：1 = 精神飽滿，0 = 累倒
let stamina = 1;
let exhausted = false;            // 是不是累倒才睡著的（累倒時要睡夠才叫得醒）
let wakeBlockedAt = -10;          // 上一次想叫醒但叫不醒的時間（面板會短暫提示）
// 想切換模式時都經過這裡：累倒睡著、體力還沒恢復夠時叫不醒
function requestMode(m) {
  if (exhausted && m !== 'sleep' && stamina < CONFIG.stamina.wakeAt) {
    wakeBlockedAt = performance.now() / 1000;
    return;
  }
  if (m !== 'sleep') { exhausted = false; daySleep = false; }    // 你叫醒牠（白天也可以，只是很耗體力）
  setMode(m);
}
modeButtons.forEach((b) => b.addEventListener('click', () => { brainHandOver(); requestMode(b.dataset.mode); b.blur(); }));

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
  brainHandOver();                               // 你一按鍵，就換回你來操控
  // FIXED(D03): 長按 M 時，按鍵自動重複（e.repeat）不再切換飛行／漂浮
  if (e.code === 'KeyM') { if (!e.repeat) requestMode(mode === 'fly' ? 'hover' : 'fly'); return; }
  // FIXED(D02): 長按 Z 時，按鍵自動重複（e.repeat）不再切換睡覺／醒來
  if (e.code === 'KeyZ') { if (!e.repeat) requestMode(mode === 'sleep' ? 'hover' : 'sleep'); return; }
  if (e.code === 'KeyT') { if (!e.repeat) dayClock.speed = dayClock.speed > 1 ? 1 : DN.fastForward; return; }   // 時間快轉
  if (e.code === 'KeyR') { if (!e.repeat) tryBreed(); return; }                                                        // 分裂
  if (CONTROL_KEYS.includes(e.code)) {
    e.preventDefault();
    keys.add(e.code);
    if (mode === 'sleep' && !e.repeat) requestMode('hover');   // 睡著時按方向鍵會叫醒牠（累倒時要睡夠才叫得醒）
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

// FIXED(D15): 轉視角時鏡頭會突然拉近：鏡頭和生物之間只要有東西就會被拉到它前面，
// 連看得穿的鐵絲網、細細的柱子和樹幹也算。改成鏡頭只躲「真的會擋住視線的牆和建築」，
// 下面這兩種鏡頭不躲（生物本身的碰撞不受影響，還是會被擋住）：
//   - 很薄的板子：鐵絲網的網面（看得穿）
//   - 細桿子，不管直的還是倒的：鐵絲網柱子（包括被藤蔓拉倒的）、車窗框
//   - 直立的細長東西：樹幹、鋼柱（轉過去時只擋住一小條畫面）
if (COL) {
  for (const b of COL.boxes) {
    const sorted = b.h.slice().sort((x, y) => x - y);
    const longest = b.h.indexOf(sorted[2]);
    const upright = Math.abs(b.ax[longest][1]) > 0.8;
    b.cameraIgnores = sorted[0] < 0.1 || sorted[1] < 0.3 || (upright && sorted[1] < 1.5);
  }
}

const GROUND = ENV ? {
  pos: ENV.parts.find((p) => p.name === 'ground').mesh.positions,
  n: ENV.params.ground_grid,
  size: ENV.params.ground_size,
} : null;

// 地形高度（從地面網格雙線性內插）
// 地底冷卻池（Rust 產生的位置和尺寸）
const POOL = ENV && ENV.pool ? ENV.pool : null;
const inRoomXZ = (x, z) => POOL && x > POOL.room[0] && x < POOL.room[1] && z > POOL.room[2] && z < POOL.room[3];
const inPoolXZ = (x, z) => POOL && x > POOL.pool[0] && x < POOL.pool[1] && z > POOL.pool[2] && z < POOL.pool[3];
const inHoleXZ = (x, z, m = 0) => POOL && x > POOL.hole[0] - m && x < POOL.hole[1] + m && z > POOL.hole[2] - m && z < POOL.hole[3] + m;
const inChamber = (p) => inRoomXZ(p[0], p[2]) && p[1] < POOL.ceiling_y + 0.5;    // 在地底房間裡

// 地面高度：在地底房間的範圍裡是房間的地板（冷卻池裡是水面）。
// 地面上飛過房間上方時，會被天花板（碰撞方塊）擋住，只有洞口那裡掉得下去
function groundHeightAt(x, z) {
  if (inRoomXZ(x, z)) return inPoolXZ(x, z) ? POOL.water_y : POOL.floor_y;
  return terrainHeightAt(x, z);
}
function terrainHeightAt(x, z) {
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
  // 操控來源：你按的鍵；沒人操作時由 brain（牠自己的決定）給一樣格式的指令
  const src = brain.input || {
    fwd: (held('KeyW', 'ArrowUp') ? 1 : 0) - (held('KeyS', 'ArrowDown') ? 1 : 0),
    turn: (held('KeyA', 'ArrowLeft') ? 1 : 0) - (held('KeyD', 'ArrowRight') ? 1 : 0),
    climb: (held('Space', 'KeyE') ? 1 : 0) - (held('ShiftLeft', 'ShiftRight', 'KeyQ') ? 1 : 0),
  };
  const still = !awake || split;                     // 分裂的時候停在原地
  const fwd = still ? 0 : src.fwd;
  const turnIn = still ? 0 : src.turn;
  const climb = still ? 0 : src.climb;

  const vigor = staminaVigor();                // 累的時候飛得比較慢
  const targetSpeed = (fwd > 0 ? FL.maxSpeed * fwd : fwd < 0 ? 0.35 * FL.maxSpeed * fwd : 0) * lerp(CONFIG.stamina.slowest, 1, vigor);
  flight.speed += (targetSpeed - flight.speed) * ease(fwd ? FL.accel : FL.accel * 1.6, dt);
  flight.turn += (turnIn * FL.turnRate - flight.turn) * ease(4, dt);
  flight.heading += flight.turn * dt;
  // 累的時候爬升比較無力；沒按上升時會慢慢往下掉
  const sink = awake && climb <= 0 && mode !== 'hover' ? -CONFIG.stamina.sinkSpeed * (1 - vigor) : 0;
  flight.vy += (climb * FL.climbSpeed * lerp(0.5, 1, vigor) + sink - flight.vy) * ease(3, dt);

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
//  繁殖：自行分裂 → 卵黏在池壁上 → 孵化 → 幼體跟著成體飛
// ---------------------------------------------------------------------
const BR = CONFIG.breeding;
const eggs = [];          // { p, n, age, hatchAt, seed }
const young = [];         // { pos, vel, heading, age, scale }
let split = null;         // 正在分裂：{ t, site, n }
let breedCooldown = 0;
let breedMsg = { text: '', until: -1 };
let breedClock = 0;

// 離成體最近的池壁內側（卵黏的地方）。不在池邊就回傳 null
function poolWallSite() {
  if (!POOL || !inChamber(flight.pos)) return null;
  const p = flight.pos, [x0, x1, z0, z1] = POOL.pool;
  if (p[1] > POOL.rim_y + 3.5) return null;
  const faces = [
    { d: Math.abs(p[0] - x0), n: [1, 0, 0], at: (a) => [x0, a, 'z'] },
    { d: Math.abs(p[0] - x1), n: [-1, 0, 0], at: (a) => [x1, a, 'z'] },
    { d: Math.abs(p[2] - z0), n: [0, 0, 1], at: (a) => [a, z0, 'x'] },
    { d: Math.abs(p[2] - z1), n: [0, 0, -1], at: (a) => [a, z1, 'x'] },
  ];
  // 只算「在這面牆的範圍前面」的牆
  const valid = faces.filter((f) => (f.n[0] ? p[2] > z0 - 1 && p[2] < z1 + 1 : p[0] > x0 - 1 && p[0] < x1 + 1));
  if (!valid.length) return null;
  const f = valid.reduce((a, b) => (b.d < a.d ? b : a));
  if (f.d > 3.5) return null;
  return f;
}
// 這面牆上要黏卵的位置：已經有卵的話黏在旁邊（一串一串的），不然就在正前方
function eggSpot(face) {
  const [x0, x1, z0, z1] = POOL.pool;
  const alongX = !face.n[0];
  const lo = (alongX ? x0 : z0) + 0.4, hi = (alongX ? x1 : z1) - 0.4;
  const onFace = eggs.filter((e) => e.n[0] === face.n[0] && e.n[2] === face.n[2]);
  let a = alongX ? flight.pos[0] : flight.pos[2];
  const near = onFace.filter((e) => Math.abs((alongX ? e.p[0] : e.p[2]) - a) < 2);
  if (near.length) a = (alongX ? near[0].p[0] : near[0].p[2]) + (Math.random() < 0.5 ? -1 : 1) * (0.3 + 0.3 * Math.random());
  a = Math.max(lo, Math.min(hi, a));
  const band = POOL.rim_y - POOL.water_y;
  const y = POOL.water_y + band * (0.25 + 0.6 * Math.random());
  const off = BR.eggRadius + 0.01;
  const w = face.at(a);
  const p = w[2] === 'z' ? [w[0], y, w[1]] : [w[0], y, w[1]];
  return [p[0] + face.n[0] * off, p[1], p[2] + face.n[2] * off];
}

// 現在不能分裂的原因（可以的話回傳 null）
function breedBlocker() {
  if (split) return '正在分裂';
  if (mode === 'sleep') return '睡著了';
  if (!poolWallSite()) return '要在地底冷卻池的池邊才能分裂';
  if (stamina < BR.minStamina) return `體力不夠（要 ${Math.round(BR.minStamina * 100)}% 以上）`;
  if (eggs.length + young.length >= BR.maxOffspring) return '已經有很多後代了';
  if (breedCooldown > 0) return '剛分裂完，休息一下';
  return null;
}
function tryBreed() {
  const why = breedBlocker();
  if (why) { breedMsg = { text: '還不能分裂：' + why, until: breedClock + 2.5 }; return false; }
  const face = poolWallSite();
  split = { t: 0, site: eggSpot(face), n: face.n.slice() };
  return true;
}

function updateBreeding(dt) {
  breedClock += dt;
  breedCooldown = Math.max(0, breedCooldown - dt);
  if (split) {
    split.t += dt;
    if (split.t >= BR.splitTime) {                                 // 光球黏上池壁，變成一顆卵
      eggs.push({ p: split.site, n: split.n, age: 0, hatchAt: BR.incubate * (0.85 + 0.3 * Math.random()), seed: Math.random() });
      stamina = Math.max(0, stamina - BR.cost);
      breedCooldown = BR.cooldown;
      split = null;
      breedMsg = { text: '產下一顆卵', until: breedClock + 3 };
    }
  }
  for (let i = eggs.length - 1; i >= 0; i--) {
    const e = eggs[i];
    e.age += dt;
    if (e.age >= e.hatchAt) {                                     // 孵化
      eggs.splice(i, 1);
      young.push({ pos: [e.p[0] + e.n[0] * 0.5, e.p[1] + 0.2, e.p[2] + e.n[2] * 0.5],
                   heading: Math.atan2(e.n[0], e.n[2]), age: 0, scale: BR.youngStart, born: e.p.slice(), goal: null });
      breedMsg = { text: '卵孵化了！', until: breedClock + 3 };
    }
  }
  updateYoung(dt);
}

// 幼體：自己決定要去哪裡（不跟著成體）。剛孵出來的前幾秒先在卵旁邊飄一下，
// 之後就自己探索：通常在附近找一個地方飛過去，偶爾去看大樹、汽車、廢墟這些地方；到了停下來看一看，再換下一個。
// 怎麼飛過去和成體自己探索時一樣（steerTo：路上有東西擋住就先爬高；route：進出地底經過洞口）。
function youngPickGoal(y) {
  if (Math.random() < 0.3 && LANDMARKS.length) {
    const options = LANDMARKS.map((m) => ({ m, w: Math.exp(-Math.hypot(m.at[0] - y.pos[0], m.at[2] - y.pos[2]) / 30) }));
    let r = Math.random() * options.reduce((a, o) => a + o.w, 0);
    for (const o of options) if ((r -= o.w) <= 0) return o.m.at.slice();
  }
  // 附近隨便一個「進得去」的地方（不在牆裡、離地面有一點高度；在地底的話就留在地底）
  for (let k = 0; k < 12; k++) {
    const a = Math.random() * Math.PI * 2, d = 3 + Math.random() * BR.youngRoam;
    const g = [y.pos[0] + Math.sin(a) * d, y.pos[1] + (Math.random() * 3 - 1.2), y.pos[2] + Math.cos(a) * d];
    const under = inChamber(y.pos);
    if (under && !inRoomXZ(g[0], g[2])) continue;
    const floor = groundHeightAt(g[0], g[2]) + 1.2;
    g[1] = Math.max(g[1], floor);
    g[1] = Math.min(g[1], under ? POOL.ceiling_y - 1.2 : FL.ceilingY - 2);
    const q = g.slice();
    resolveCollisions(q, 0.6);
    if (Math.hypot(q[0] - g[0], q[1] - g[1], q[2] - g[2]) < 0.05) return g;
  }
  return y.pos.slice();
}

function updateYoung(dt) {
  const asleep = sleepBlend > 0.5;                       // 成體睡著時（天亮了），幼體也停下來睡
  for (const y of young) {
    y.age += dt;
    y.scale = lerp(BR.youngStart, BR.youngScale, smooth(Math.min(1, y.age / BR.growTime)));
    let input = { fwd: 0, turn: 0, climb: 0 };
    if (y.age < 4) {                                     // 剛孵出來：在卵旁邊往上飄一點
      input.climb = clamp1((y.born[1] + 0.8 - y.pos[1]) / 1.5) * 0.5;
    } else if (!asleep) {
      y.timer = (y.timer || 0) + dt;
      if (!y.goal) { y.goal = youngPickGoal(y); y.state = 'go'; y.timer = 0; y.best = Infinity; y.lastProgress = 0; }
      if (y.state === 'go') {
        const wp = route(y.goal, y.pos);
        const st = steerTo(wp, y.pos, y.heading);
        input = st.input;
        const real = Math.hypot(...sub(y.goal, y.pos));
        if (real < y.best - 0.3) { y.best = real; y.lastProgress = y.timer; }
        if (real < 1.0) { y.state = 'linger'; y.timer = 0; y.lingerFor = lerp(BR.youngLinger[0], BR.youngLinger[1], Math.random()); }
        else if (y.timer - y.lastProgress > 6) y.goal = null;          // 卡住了：換一個地方
      } else {
        input.turn = 0.3 * Math.sin(y.timer * 0.7 + y.born[0]);          // 停下來東張西望
        if (y.timer > y.lingerFor) y.goal = null;
      }
    }
    // 飛起來：和成體一樣的方式（轉向、前進、上升），速度比較慢
    y.heading += input.turn * FL.turnRate * 0.9 * dt;
    const want = Math.max(0, input.fwd) * BR.youngSpeed;
    y.speed = (y.speed || 0) + (want - (y.speed || 0)) * ease(2.5, dt);
    y.vy = (y.vy || 0) + (input.climb * FL.climbSpeed * 0.8 - (y.vy || 0)) * ease(3, dt);
    y.pos[0] += Math.sin(y.heading) * y.speed * dt;
    y.pos[2] += Math.cos(y.heading) * y.speed * dt;
    y.pos[1] += y.vy * dt;
    const r = 0.95 * y.scale;
    resolveCollisions(y.pos, r);
    y.pos[1] = Math.max(y.pos[1], groundHeightAt(y.pos[0], y.pos[2]) + r + 0.15);
    y.pos[1] = Math.min(y.pos[1], FL.ceilingY);
  }
}

// 幼體的姿勢：借用成體這一幀的動作（拍翅、脈動、睡覺），搬到幼體的位置、縮小
function youngPose(pose, y) {
  const A = Mat.chain(
    Mat.translate(...y.pos), Mat.rotY(y.heading), Mat.scale(y.scale),
    Mat.rotY(-pose.anchorYaw), Mat.translate(-pose.anchor[0], -pose.anchor[1], -pose.anchor[2]),
  );
  return Object.assign({}, pose, {
    world: pose.world.map((m) => Mat.mul(A, m)),
    glowScale: pose.glowScale * BR.youngGlow,
    coreI: pose.coreI * lerp(0.6, 1, BR.youngGlow),
    tendril: [pose.tendril[0], pose.tendril[1], pose.tendril[2], pose.tendril[3] * y.scale],
  });
}

// 卵和分裂中光球的繪製資料
const EGG_FLOATS = 7;
const eggCpu = new Float32Array((BR.maxOffspring + 2) * EGG_FLOATS);
const eggBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, eggBuf);
gl.bufferData(gl.ARRAY_BUFFER, eggCpu.byteLength, gl.DYNAMIC_DRAW);
const eggVao = gl.createVertexArray();
let eggIndexCount = 0;
{
  gl.bindVertexArray(eggVao);
  const pos = [], idx = [], R = 10, S = 14;
  for (let i = 0; i <= R; i++) for (let j = 0; j <= S; j++) {
    const th = Math.PI * i / R, ph = 2 * Math.PI * j / S;
    pos.push(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
  }
  for (let i = 0; i < R; i++) for (let j = 0; j < S; j++) {
    const a = i * (S + 1) + j;
    idx.push(a, a + S + 1, a + 1, a + 1, a + S + 1, a + S + 2);
  }
  eggIndexCount = idx.length;
  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, eggBuf);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, EGG_FLOATS * 4, 0);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, EGG_FLOATS * 4, 12);
  gl.vertexAttribDivisor(1, 1); gl.vertexAttribDivisor(2, 1);
  gl.bindVertexArray(null);
}
// 分裂中的光球在哪裡：前一段在核心裡慢慢長大，後一段從核心飛向池壁
function budState(corePos) {
  if (!split) return null;
  const u = smooth(Math.max(0, Math.min(1, (split.t / BR.splitTime - 0.4) / 0.6)));
  const p = [0, 1, 2].map((a) => lerp(corePos[a], split.site[a], u));
  p[1] += Math.sin(Math.PI * u) * 0.35;
  const grow = Math.min(1, split.t / (BR.splitTime * 0.4));
  return { p, r: u > 0 ? lerp(0.07, BR.eggRadius, u) : 0.03 + 0.04 * grow, landing: u };
}
function fillEggs(corePos) {
  let n = 0;
  const put = (p, r, seed, prog, kind) => {
    const o = n * EGG_FLOATS;
    eggCpu.set([p[0], p[1], p[2], r, seed, prog, kind], o);
    n++;
  };
  for (const e of eggs) put(e.p, BR.eggRadius, e.seed, Math.min(1, e.age / e.hatchAt), 0);
  const bud = budState(corePos);
  if (bud) put(bud.p, bud.r, 0.5, 0, bud.landing > 0.97 ? 0 : 1);
  gl.bindBuffer(gl.ARRAY_BUFFER, eggBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, eggCpu, 0, n * EGG_FLOATS);
  return n;
}

// ---------------------------------------------------------------------
//  牠自己的行為（brain）：沒人操作時自己探索；天快亮時自己飛去躲起來睡
//  做法：brain 決定「要去哪裡」，再換成和按鍵一樣的指令（前進、轉向、上升）交給飛行
// ---------------------------------------------------------------------
const AU = CONFIG.autonomy;
const LANDMARK_NAMES = ['大樹', '汽車', '警告牌', '廢墟', '真菌', '冷卻池'];
const LANDMARKS = ENV && ENV.landmarks ? ENV.landmarks.map((m) => ({ at: [m[0], m[1], m[2]], look: [m[3], m[4], m[5]], kind: m[6] })) : [];
// 躲藏點：只留下「生物真的進得去」的（不卡在牆或樓板裡、正上方沒有東西擋住，從上面可以直接降落進去）
// （第一次用到時才檢查：碰撞和射線的程式在檔案後面才準備好）
let shelterCache = null;
function shelters() {
  if (shelterCache) return shelterCache;
  shelterCache = (ENV && ENV.shelters ? ENV.shelters : []).map((s) => ({ at: [s[0], s[1], s[2]], kind: s[3] })).filter((s) => {
    const p = s.at.slice();
    resolveCollisions(p, FL.collisionRadius + 0.15);
    if (Math.hypot(p[0] - s.at[0], p[1] - s.at[1], p[2] - s.at[2]) > 0.05) return false;
    if (s.kind === 2) return true;                        // 地底：從洞口進去（route 會帶路），不用檢查正上方
    const up = FL.ceilingY - 1 - s.at[1];
    return up > 0 && rayClearance(s.at, [0, 1, 0], up) >= up - 0.01;
  });
  return shelterCache;
}

const brain = {
  state: 'manual',        // manual 你在操控、explore 飛去探索、linger 停下來看、rest 累了休息、seek 找地方躲、hidden 躲好了
  input: null,            // 給飛行的指令（null = 用鍵盤）
  idle: 0,                // 多久沒按鍵了（秒）
  goal: null, look: null, label: '',
  timer: 0,               // 目前這件事做了多久
  best: Infinity, lastProgress: 0,
  disabled: false,        // 自動檢查時關掉
};
function brainHandOver() {
  brain.idle = 0;
  if (brain.state !== 'manual' && brain.state !== 'hidden') { brain.state = 'manual'; brain.input = null; }
}
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp1 = (x) => Math.max(-1, Math.min(1, x));

// 朝目標飛：路上有東西擋住就先往上爬，越過去再前進；快到了就減速、對準高度
function steerTo(goal, p = flight.pos, heading = flight.heading) {
  const d = sub(goal, p);
  const hd = Math.hypot(d[0], d[2]);
  const dist = Math.hypot(d[0], d[1], d[2]);
  const diff = wrapAngle(Math.atan2(d[0], d[2]) - heading);
  let fwd = hd > 0.6 ? Math.max(0, 1 - Math.abs(diff) / 1.2) * Math.min(1, hd / 4) : 0;
  let climb = clamp1(d[1] / 1.5);
  if (dist > 1.5) {
    const clear = rayClearance(p, [d[0] / dist, d[1] / dist, d[2] / dist], dist) >= dist - 0.3;
    if (!clear) {
      const look = Math.min(hd, 8);
      const ahead = hd > 0.5 && rayClearance(p, [d[0] / hd, 0, d[2] / hd], look) < look - 0.3;
      if (ahead) { climb = 1; fwd *= 0.25; }              // 正前方有東西：先爬高
      else climb = Math.max(climb, 0);                     // 前面空了，但直直飛過去會撞到：保持高度往前
    }
  }
  // 牠的翅膀在牆邊會收起來，太靠近目標的時候放慢
  return { input: { fwd, turn: clamp1(diff * 2), climb }, dist, hd };
}

// 要進出地底時，先經過洞口：地面上 → 洞口正上方 → 往下穿過洞口 → 地底（出來時反過來）
function route(goal, p = flight.pos) {
  if (!POOL) return goal;
  const hc = [(POOL.hole[0] + POOL.hole[1]) / 2, (POOL.hole[2] + POOL.hole[3]) / 2];
  const nearHole = Math.hypot(p[0] - hc[0], p[2] - hc[1]) < 1.8;
  const inShaft = inHoleXZ(p[0], p[2]) && p[1] < POOL.surface_y + 1.5 && p[1] > POOL.ceiling_y - 1.5;
  const pIn = inChamber(p), gIn = inChamber(goal);
  if (gIn && !pIn) return inShaft || nearHole ? [hc[0], POOL.floor_y + 4, hc[1]] : [hc[0], POOL.surface_y + 3, hc[1]];
  if (!gIn && (pIn || inShaft)) return nearHole ? [hc[0], POOL.surface_y + 3.5, hc[1]] : [hc[0], POOL.ceiling_y - 2.5, hc[1]];
  return goal;
}

function nearestShelter() {
  let best = null, bd = Infinity;
  for (const s of shelters()) {
    const d = Math.hypot(s.at[0] - flight.pos[0], s.at[2] - flight.pos[2]) + Math.abs(s.at[1] - flight.pos[1]) * 1.5;
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

function pickLandmark() {
  // 有自己種的真菌時，偶爾回去看看
  if (fungi.length && Math.random() < 0.25) {
    const f = fungi[Math.floor(Math.random() * fungi.length)];
    return { at: [f.p[0] + f.n[0] * 2, f.p[1] + f.n[1] * 2 + 0.5, f.p[2] + f.n[2] * 2], look: f.p, kind: 4 };
  }
  // 越近的地方越容易被選中，但不要一直回到剛剛那個
  const options = LANDMARKS.filter((m) => m !== brain.lastMark).map((m) => {
    const d = Math.hypot(m.at[0] - flight.pos[0], m.at[2] - flight.pos[2]);
    let w = Math.exp(-d / 25);
    // 冷卻池：體力夠、後代還不多的時候特別想去（去繁殖）
    if (m.kind === 5) w *= stamina >= BR.minStamina && eggs.length + young.length < BR.maxOffspring ? 6 : 0.3;
    return { m, w };
  });
  let r = Math.random() * options.reduce((a, o) => a + o.w, 0);
  for (const o of options) { if ((r -= o.w) <= 0) return o.m; }
  return options.length ? options[0].m : null;
}

function startGoing(state, goal, look, label) {
  brain.state = state; brain.goal = goal; brain.look = look; brain.label = label;
  brain.timer = 0; brain.best = Infinity; brain.lastProgress = 0;
  // 遠的地方多給一點時間（要進出地底的話再多一點）
  const far = Math.hypot(...sub(goal, flight.pos)) / FL.maxSpeed;
  brain.giveUp = Math.max(AU.giveUpAfter, far * 2 + (POOL && inChamber(goal) !== inChamber(flight.pos) ? 20 : 0));
}

function updateBrain(dt) {
  brain.idle += dt;
  if (brain.disabled || !AU.enabled) { brain.input = null; return; }
  if (split) { brain.input = null; return; }                // 分裂的時候不動
  if (mode === 'sleep') { brain.input = null; if (brain.state !== 'hidden') brain.state = 'manual'; return; }
  if (brain.state === 'hidden') brain.state = 'manual';     // 醒來了
  brain.timer += dt;
  const hour = dayClock.phase * 24;
  const userIdle = brain.idle > 3;

  // 1. 天快亮了：自己找地方躲（你在操控時不搶，但你一停手牠就去）
  const preDawn = (hour >= AU.seekHour && hour < 6) || (isDaytime() && brain.state === 'seek');
  if (preDawn && userIdle && brain.state !== 'seek') {
    const s = nearestShelter();
    if (s) startGoing('seek', s.at, null, s.kind === 0 ? '飛去樹冠下躲起來' : '飛進廢墟裡躲起來');
  }
  if (brain.state === 'seek') {
    if (mode !== 'fly') setMode('fly');
    const st = steerTo(route(brain.goal));
    brain.input = st.input;
    const realDist = Math.hypot(...sub(brain.goal, flight.pos));
    if (realDist < 0.9 || brain.timer > AU.seekTimeout) {     // 到了（或找太久了）：就地睡
      brain.state = 'hidden'; brain.input = null;
      daySleep = true; keys.clear(); setMode('sleep');
    }
    return;
  }

  // 2. 太久沒人操作（而且是晚上）：自己探索
  if (brain.state === 'manual') {
    if (brain.idle > AU.idleDelay && !isDaytime() && LANDMARKS.length) {
      const m = pickLandmark();
      if (m) { brain.lastMark = m; startGoing('explore', m.at, m.look, LANDMARK_NAMES[m.kind]); }
    } else { brain.input = null; return; }
  }
  if (isDaytime()) { brain.state = 'manual'; brain.input = null; return; }   // 白天被你叫醒時不自己亂飛

  if (brain.state !== 'rest' && stamina < CONFIG.stamina.tiredBelow) {      // 累了：停下來漂浮休息
    brain.state = 'rest'; brain.timer = 0;
  }
  if (brain.state === 'rest') {
    if (mode !== 'hover') setMode('hover');
    brain.input = { fwd: 0, turn: 0, climb: 0 };
    if (stamina > 0.6) brain.state = 'manual';               // 休息夠了，再去探索
    return;
  }
  if (brain.state === 'explore') {
    if (mode !== 'fly') setMode('fly');
    const wp = route(brain.goal);
    const wpKey = wp.map((x) => x.toFixed(1)).join();
    if (wpKey !== brain.wpKey) { brain.wpKey = wpKey; brain.best = Infinity; brain.lastProgress = brain.timer; }  // 換下一段路
    const st = steerTo(wp);
    brain.input = st.input;
    if (st.dist < brain.best - 0.5) { brain.best = st.dist; brain.lastProgress = brain.timer; }
    const realDist = Math.hypot(...sub(brain.goal, flight.pos));
    if (realDist < 1.2) {                                    // 到了：停下來看一看
      brain.state = 'linger'; brain.timer = 0;
      brain.lingerFor = lerp(AU.linger[0], AU.linger[1], Math.random());
    } else if (brain.timer - brain.lastProgress > 8 || brain.timer > brain.giveUp) {
      brain.state = 'manual'; brain.idle = AU.idleDelay;     // 到不了：換一個地方
    }
    return;
  }
  if (brain.state === 'linger') {
    if (mode !== 'hover') setMode('hover');
    const d = sub(brain.look, flight.pos);
    const diff = wrapAngle(Math.atan2(d[0], d[2]) - flight.heading);
    // 停下來時慢慢降到離下面的東西（地面、車頂、牆頂）約 2 公尺，孢子才落得到，在那裡長出真菌
    const below = Math.min(rayClearance(flight.pos, [0, -1, 0], 30), flight.pos[1] - groundHeightAt(flight.pos[0], flight.pos[2]));
    const sink = Math.max(0, below - AU.sowHeight);
    brain.input = { fwd: 0, turn: clamp1(diff * 1.5) * 0.6, climb: -clamp1(sink / 1.5) * 0.6 };
    // 在冷卻池邊、可以分裂的時候：分裂（繁殖）；只差一點體力的話，就在池邊休息到夠了
    if (brain.label === '冷卻池' && !split && brain.timer > 1.5) {
      const why = breedBlocker();
      if (!why) {
        tryBreed();
        brain.lingerFor = brain.timer + BR.splitTime + 3;
      } else if (why.startsWith('體力') && brain.timer < 40) {
        brain.lingerFor = Math.max(brain.lingerFor, brain.timer + 1);
      }
    }
    if (brain.timer > brain.lingerFor && !split) { brain.state = 'manual'; brain.idle = AU.idleDelay; }
  }
}

function brainStatus() {
  switch (brain.state) {
    case 'seek': return isDaytime() ? '天亮了！' + brain.label : '天快亮了，' + brain.label;
    case 'explore': return '自己探索中 · 去看看' + brain.label;
    case 'linger': return brain.label === '冷卻池' ? '在冷卻池邊' : '正在看' + brain.label + '…';
    case 'rest': return '自己探索中 · 累了，休息一下';
    default: return null;
  }
}

// ---------------------------------------------------------------------
//  晝夜：太陽東升西落，夜裡月亮和星星；牠白天睡覺、晚上活動
// ---------------------------------------------------------------------
const DN = CONFIG.dayNight;
// phase：一天裡的位置，0 = 半夜 12 點、0.25 = 早上 6 點日出、0.5 = 中午、0.75 = 傍晚 6 點日落
const dayClock = { phase: DN.startHour / 24, speed: 1, frozen: false };
let daySleep = false;              // 是不是因為天亮才睡的（天黑會自己醒來）
const sunHeight = (phase) => Math.sin((phase - 0.25) * Math.PI * 2);
const isDaytime = () => sunHeight(dayClock.phase) > 0;

function updateDayNight(dt) {
  const wasDay = isDaytime();
  if (!dayClock.frozen) dayClock.phase = (dayClock.phase + dt * dayClock.speed / DN.dayLength) % 1;
  const nowDay = isDaytime();
  if (!wasDay && nowDay) {                 // 天亮了：回去睡覺（正在飛去躲藏點的話，讓牠飛到再睡）
    daySleep = true;
    if (mode !== 'sleep' && brain.state !== 'seek') { keys.clear(); setMode('sleep'); }
  }
  if (wasDay && !nowDay && daySleep) {     // 天黑了：醒來活動（累倒時還是要睡夠才會醒）
    daySleep = false;
    if (mode === 'sleep' && !(exhausted && stamina < CONFIG.stamina.wakeAt)) { exhausted = false; setMode('hover'); }
  }
}

// 這個時間的天空和光線
function skyState(phase) {
  const E = CONFIG.environment;
  const a = (phase - 0.25) * Math.PI * 2;
  const h = Math.sin(a);
  const sunDir = norm([Math.cos(a) * 0.9, h, 0.35]);
  const moonDir = norm([-sunDir[0], Math.max(-sunDir[1], -0.2) + 0.35, -0.3]);
  const day = smooth(Math.max(0, Math.min(1, (h + 0.05) / 0.35)));
  const twi = Math.exp(-Math.pow(h / 0.16, 2));
  const mix3 = (x, y, t) => [lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)];
  const add3 = (x, y, k) => [x[0] + y[0] * k, x[1] + y[1] * k, x[2] + y[2] * k];
  // 主要的光：白天是太陽，夜裡是月亮；日出日落時光很弱、偏橘
  // 太陽在地平線上時用太陽、下面時用月亮；兩個在地平線附近都淡到 0，交接時才不會突然跳一下
  const sunW = smooth(Math.max(0, Math.min(1, h / 0.25)));
  const moonW = smooth(Math.max(0, Math.min(1, -h / 0.2)));
  const lightDir = h > 0 ? sunDir : moonDir;
  let lightColor = h > 0 ? DN.sunColor.map((x) => x * sunW) : E.moonColor.map((x) => x * moonW * DN.moonStrength);
  lightColor = add3(lightColor, DN.duskHorizon, twi * 0.2);
  let horizon = mix3(E.fogColor, DN.dayHorizon, day);
  horizon = mix3(horizon, DN.duskHorizon, twi * 0.75);
  let top = mix3(DN.nightTop, DN.dayTop, day);
  top = mix3(top, DN.duskTop, twi * 0.5);
  return {
    sunDir, moonDir, day, twi, lightDir, lightColor, top, horizon,
    fogColor: horizon,
    skyAmb: mix3(E.skyAmbient, DN.daySkyAmbient, day),
    groundAmb: mix3(E.groundAmbient, DN.dayGroundAmbient, day),
  };
}

// 面板上顯示的時間
function clockText() {
  const hours = dayClock.phase * 24;
  const hh = Math.floor(hours), mm = Math.floor((hours - hh) * 60);
  const name = hours < 5 ? '深夜' : hours < 7 ? '黎明' : hours < 17 ? '白天' : hours < 19 ? '黃昏' : '夜晚';
  return `${name} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}${dayClock.speed > 1 ? ' ▸▸' : ''}`;
}

// ---------------------------------------------------------------------
//  體力：飛行會消耗，漂浮慢慢恢復，睡覺恢復最快；累倒會自己睡著，睡飽會自己醒來
// ---------------------------------------------------------------------
// 累的程度換成 0～1：1 = 還有精神，0 = 累到極點（體力低於 tiredBelow 才開始往下降）
function staminaVigor() {
  return smooth(Math.max(0, Math.min(1, stamina / CONFIG.stamina.tiredBelow)));
}

function updateStamina(dt) {
  const ST = CONFIG.stamina;
  if (mode === 'sleep') {
    if (sleepBlend > 0.95) stamina += ST.sleepRecover * dt;      // 真的睡著了才開始恢復
  } else if (flight.moving) {
    stamina -= ST.flyDrain * dt * (isDaytime() ? DN.dayDrainMul : 1);   // 白天硬要飛，很耗體力
  } else if (mode === 'fly') {
    stamina -= ST.flyIdleDrain * dt * (isDaytime() ? DN.dayDrainMul : 1);
  } else {
    stamina += ST.hoverRecover * dt * (isDaytime() ? 0 : 1);             // 白天漂浮也休息不到
  }
  stamina = Math.max(0, Math.min(1, stamina));

  if (stamina <= 0 && mode !== 'sleep') {                       // 累倒了：自己睡著
    exhausted = true;
    keys.clear();
    setMode('sleep');
  }
  if (exhausted && mode === 'sleep' && stamina >= 1) {          // 累倒的那一次，睡飽了會自己醒來
    exhausted = false;
    if (daySleep) return;                                         // 但如果是白天，就繼續睡到天黑
    setMode('hover');
  }
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
  // 累了：拍翅變慢、變小，核心的脈動變弱變暗（睡著時不受影響，改成看恢復了多少）
  const vigor = staminaVigor();
  const tired = (1 - vigor) * (1 - sk);
  p.flapFreq *= 1 - 0.35 * tired;
  p.flapAmp *= 1 - 0.3 * tired;
  p.pulseAmp *= 1 - 0.65 * tired;
  p.pulseBase *= 1 - 0.4 * tired;
  p.bob *= 1 + 1.2 * tired;                     // 飛得搖搖晃晃
  p.pulseAmp *= lerp(1, 0.6 + 0.4 * stamina, sk);  // 睡著時，越睡越飽，光也慢慢回來

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
  let coreI = p.pulseBase + p.pulseAmp * wave;
  if (split) {                                          // 分裂中：核心快速閃動、越來越亮
    const g = smooth(Math.min(1, split.t / 1.2)) * (1 - smooth(Math.max(0, (split.t - BR.splitTime * 0.7) / (BR.splitTime * 0.3))));
    coreI += g * (0.5 + 0.5 * Math.sin(t * 11));
  }

  const bob = -p.bob * Math.sin(phase - 0.6) + 0.06 * Math.sin(t * 0.7);
  const noseDownAwake = -p.pitchDeg + 2.5 * s * k + 8 * speedFrac - 14 * (flight.vy / FL.climbSpeed);
  const noseDown = lerp(noseDownAwake + 10 * tired, 90, sk);   // 累的時候頭垂下來一點  // 睡覺：翻成頭朝下、尾巴朝上
  const bank = -FL.bankDeg * (flight.turn / FL.turnRate) * (1 - sk);
  const swing = 3 * Math.sin(t * 0.5) * (1 - sk) + 2.5 * Math.sin(t * 0.33) * sk;   // 睡著時飄在空中輕輕晃
  const anchor = [flight.pos[0], flight.pos[1] + bob, flight.pos[2]];
  const anchorYaw = flight.heading + deg(4) * Math.sin(t * 0.37) * (1 - sk);
  const root = Mat.chain(
    Mat.translate(...anchor),
    Mat.rotY(anchorYaw),
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
    sleep: sk, breathePhase, breatheSpeed, glowScale: lerp(1, SL.glow, sk) * (1 - 0.5 * tired), tendril, tired,
    eyeGlow: CONFIG.eyeSpots.glow * lerp(1, CONFIG.eyeSpots.sleepGlow, sk),
    anchor, anchorYaw,                                  // 幼體借用這一幀的動作時，用來換算位置
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
    return b.ax[best].map((x) => x * sgn);                      // 回傳落在哪一面（朝外的方向），真菌會貼著這一面長
  }
  return null;
}

function updateSpores(t, dt, pose) {
  const rate = lerp(SP.hoverRate, SP.flyRate, pose.fly) * (0.3 + 1.4 * pose.wave) * (1 - pose.sleep) * (1 - 0.6 * (pose.tired || 0))
    // 自己探索時停下來看一個地方，會刻意在那裡撒孢子（幫真菌「播種」）
    * (brain.state === 'linger' ? CONFIG.autonomy.sowBoost : 1);
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
    let land = sp.p[1] <= g ? [0, 1, 0] : null;
    if (land) sp.p[1] = g;
    else land = pushSporeOut(sp.p);
    if (land) {                                                   // 落地後停住、慢慢熄滅
      sp.v = [0, 0, 0];
      sp.landed = true;
      sp.life = Math.min(sp.life, sp.age + 2.5);
      if (Math.random() < CONFIG.fungus.chance) seedFungus(sp.p, land);   // 有些會長成真菌
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
//  真菌：孢子落地的地方慢慢長出發光的菌斑；同一個地方落越多孢子，那一片就長越大
// ---------------------------------------------------------------------
const FG = CONFIG.fungus;
const fungi = [];
function seedFungus(p, n) {
  if (inPoolXZ(p[0], p[2]) && p[1] < POOL.water_y + 0.05) return;     // 掉進水裡的孢子長不出真菌
  for (const f of fungi) {
    const d = Math.hypot(f.p[0] - p[0], f.p[1] - p[1], f.p[2] - p[2]);
    if (d < FG.mergeDist && dot(f.n, n) > 0.8) { f.target = Math.min(FG.maxSize, f.target + FG.growPerSpore); return; }
  }
  if (fungi.length >= FG.max) return;
  fungi.push({ p: p.slice(), n: n.slice(), size: 0, target: lerp(FG.startSize[0], FG.startSize[1], Math.random()), seed: Math.random() });
}
const FUNGUS_FLOATS = 8;
const fungusCpu = new Float32Array(FG.max * FUNGUS_FLOATS);
const fungusBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, fungusBuf);
gl.bufferData(gl.ARRAY_BUFFER, fungusCpu.byteLength, gl.DYNAMIC_DRAW);
const fungusVao = gl.createVertexArray();
gl.bindVertexArray(fungusVao);
{
  const corner = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, corner);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, fungusBuf);
  const stride = FUNGUS_FLOATS * 4;
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 0);    // 位置
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 12);   // 朝向
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 24);   // 大小、種子
  for (const a of [1, 2, 3]) gl.vertexAttribDivisor(a, 1);
}
gl.bindVertexArray(null);

function updateFungi(dt) {
  for (let k = 0; k < fungi.length; k++) {
    const f = fungi[k];
    f.size += (f.target - f.size) * (1 - Math.exp(-FG.growSpeed * dt));
    const o = k * FUNGUS_FLOATS;
    fungusCpu[o] = f.p[0]; fungusCpu[o + 1] = f.p[1]; fungusCpu[o + 2] = f.p[2];
    fungusCpu[o + 3] = f.n[0]; fungusCpu[o + 4] = f.n[1]; fungusCpu[o + 5] = f.n[2];
    fungusCpu[o + 6] = f.size; fungusCpu[o + 7] = f.seed;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, fungusBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, fungusCpu, 0, fungi.length * FUNGUS_FLOATS);
}

// ---------------------------------------------------------------------
//  鏡頭：平移跟著生物，角度固定（只有拖曳滑鼠才會旋轉）
// ---------------------------------------------------------------------
// 射線碰撞：從 o 往 dir 方向射一條線，看最近在多遠的地方會碰到牆、柱子、煙囪、冷卻塔或地面。
// 回傳最多可以伸多遠（不會超過 want）。鏡頭（D04）和翅膀收合（D06）都用這個。
const CAM_MARGIN = 0.3;     // 鏡頭和牆之間至少留這麼多空間
const CAM_MIN = 0.15;       // 鏡頭最近可以靠到多近（碰撞優先：不能為了保持距離把鏡頭推進牆裡）
// forCamera = true：給鏡頭用的，忽略看得穿或很細的東西（見上面 D15）
function rayClearance(o, dir, want, forCamera = false) {
  let best = want;
  if (COL) {
    for (const b of COL.boxes) {
      if (forCamera && b.cameraIgnores) continue;
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
  const allowed = rayClearance(cam.target, dir, cam.distance, true);
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

// 畫一隻生物（成體或幼體）：先畫不透明的核心，再由遠到近畫半透明的身體和翅膀
function drawCreature(pose, corePos, view, proj, eye, t) {
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
      drawPart(parts.tendrils, pose, true);               // 觸手和身體一樣是半透明的，先畫，埋在身體裡的那段會被外殼蓋住
      drawPart(parts.body, pose, true);
      drawPart(parts.eye_spots, pose, false);              // 感光點貼在身體表面
    } },
    { d: dist(Mat.apply(pose.world[parts.wing_r.bone], [halfSpan, 0, 0])), draw: () => drawWing(parts.wing_r, parts.wing_glow_r, pose, 1) },
    { d: dist(Mat.apply(pose.world[parts.wing_l.bone], [-halfSpan, 0, 0])), draw: () => drawWing(parts.wing_l, parts.wing_glow_l, pose, -1) },
  ];
  groups.sort((a, b) => b.d - a.d).forEach((g) => g.draw());

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

  updateBrain(dt);
  updateFlight(t, dt);
  updateStamina(dt);
  updateDayNight(dt);
  updateFungi(dt);
  updateBreeding(dt);
  const sky = skyState(dayClock.phase);
  const eye = updateCamera(t, dt);
  const aspect = canvas.width / canvas.height;
  const view = Mat.lookAt(eye, cam.target, [0, 1, 0]);
  const proj = Mat.perspective(deg(CONFIG.camera.fov), aspect, 0.1, 600);
  const pose = animate(t, dt);
  const corePos = Mat.apply(pose.world[boneIndex.core], [0, 0, 0]);
  updateSpores(t, dt, pose);

  let statusText = mode === 'sleep' ? (pose.sleep > 0.95 ? (exhausted ? '累倒了，睡覺恢復中' : '睡覺中') : (exhausted ? '累倒了…' : '準備入睡…'))
    : pose.sleep > 0.05 ? '醒來中…'
    : flight.moving ? '飛行中 · 移動' : (pose.fly > 0.5 ? '飛行中' : '漂浮中');
  if (mode === 'sleep' && daySleep && pose.sleep > 0.95 && !exhausted) statusText = brain.state === 'hidden' ? '白天 · 躲起來睡覺（天黑會醒來）' : '白天 · 睡覺中（天黑會醒來）';
  const bs = brainStatus();
  if (bs && mode !== 'sleep') statusText = bs;
  if (mode !== 'sleep' && !split && !breedBlocker()) statusText = '在冷卻池邊 · 按 R 分裂';
  if (split) statusText = '正在分裂…';
  if (breedClock < breedMsg.until) statusText = breedMsg.text;
  const oc = `卵 ${eggs.length} · 幼體 ${young.length}`;
  if (offspringEl.textContent !== oc) offspringEl.textContent = oc;
  if (mode !== 'sleep' && isDaytime()) statusText += ' · 白天很耗體力';
  if (mode !== 'sleep' && stamina < CONFIG.stamina.tiredBelow) statusText += ' · 累了';
  const ct = clockText();
  if (clockEl.textContent !== ct) clockEl.textContent = ct;
  const fc = fungi.length + ' 片';
  if (fungusEl.textContent !== fc) fungusEl.textContent = fc;
  if (now / 1000 - wakeBlockedAt < 1.5) statusText = '太累了，叫不醒…';
  if (statusEl.textContent !== statusText) statusEl.textContent = statusText;
  const pct = Math.round(stamina * 100);
  if (staminaText.textContent !== pct + '%') {
    staminaText.textContent = pct + '%';
    staminaBar.style.width = pct + '%';
    staminaBar.classList.toggle('low', stamina < CONFIG.stamina.tiredBelow);
  }

  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // 1. 背景
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.useProgram(progBg.program);
  {
    const bu = progBg.u;
    const f = norm(sub(cam.target, eye)), r = norm(cross(f, [0, 1, 0])), uu = cross(r, f);
    gl.uniform3fv(bu.u_camF, f); gl.uniform3fv(bu.u_camR, r); gl.uniform3fv(bu.u_camU, uu);
    gl.uniform1f(bu.u_tanH, Math.tan(deg(CONFIG.camera.fov) / 2));
    gl.uniform1f(bu.u_aspect, aspect);
    gl.uniform1f(bu.u_time, t);
    gl.uniform3fv(bu.u_top, sky.top); gl.uniform3fv(bu.u_horizon, sky.horizon);
    gl.uniform3fv(bu.u_sunDir, sky.sunDir); gl.uniform3fv(bu.u_moonDir, sky.moonDir);
    gl.uniform3fv(bu.u_twiColor, DN.duskHorizon);
    gl.uniform1f(bu.u_day, sky.day); gl.uniform1f(bu.u_twi, sky.twi); gl.uniform1f(bu.u_stars, DN.stars);
  }
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
    gl.uniform3fv(eu.u_moonDir, sky.lightDir);          // 主要的光（白天太陽、夜裡月亮）
    gl.uniform3fv(eu.u_moonColor, sky.lightColor);
    gl.uniform3fv(eu.u_skyAmb, sky.skyAmb);
    gl.uniform3fv(eu.u_groundAmb, sky.groundAmb);
    gl.uniform3fv(eu.u_fogColor, sky.fogColor);
    if (POOL) {
      gl.uniform4f(eu.u_room, ...POOL.room);
      gl.uniform4f(eu.u_hole, ...POOL.hole);
      gl.uniform1f(eu.u_ceilY, POOL.ceiling_y);
      gl.uniform3f(eu.u_poolLightPos, (POOL.pool[0] + POOL.pool[1]) / 2, POOL.water_y + 1.5, (POOL.pool[2] + POOL.pool[3]) / 2);
      const breathe = 0.9 + 0.1 * Math.sin(t * 0.6);
      gl.uniform3fv(eu.u_poolLight, CONFIG.coolingPool.light.map((x) => x * breathe));
    } else {
      gl.uniform4f(eu.u_room, 1, 0, 1, 0);
    }
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

  // 冷卻池的水
  if (POOL) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(progWater.program);
    const wu = progWater.u;
    gl.uniformMatrix4fv(wu.u_view, false, view);
    gl.uniformMatrix4fv(wu.u_proj, false, proj);
    gl.uniform4f(wu.u_rect, ...POOL.pool);
    gl.uniform1f(wu.u_y, POOL.water_y);
    gl.uniform3fv(wu.u_camPos, eye);
    gl.uniform3fv(wu.u_glow, CONFIG.coolingPool.glow);
    gl.uniform3fv(wu.u_corePos, corePos);
    gl.uniform3fv(wu.u_coreColor, colors.core);
    gl.uniform1f(wu.u_coreI, pose.coreI);
    gl.uniform1f(wu.u_time, t);
    gl.bindVertexArray(fungusVao);                       // 借用真菌的四邊形（只用到角落座標）
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  // 真菌（加法混合；貼在表面上，會被前面的東西擋住）
  if (fungi.length) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(progFungus.program);
    const fu = progFungus.u;
    gl.uniformMatrix4fv(fu.u_view, false, view);
    gl.uniformMatrix4fv(fu.u_proj, false, proj);
    gl.uniform3fv(fu.u_color, colors.core);
    gl.uniform3fv(fu.u_corePos, corePos);
    gl.uniform1f(fu.u_coreI, pose.coreI);
    gl.uniform1f(fu.u_time, t);
    gl.uniform1f(fu.u_glow, lerp(FG.glow, FG.dayGlow, sky.day));
    gl.bindVertexArray(fungusVao);
    // 貼在表面上的薄片容易和地面搶「誰在前面」而出現雜點，讓它的深度往鏡頭拉近一點
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(-4, -16);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, fungi.length);
    gl.disable(gl.POLYGON_OFFSET_FILL);
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
  gl.uniform1f(progMote.u.u_night, 1 - sky.day);
  gl.uniform3fv(progMote.u.u_center, cam.target);
  gl.bindVertexArray(moteVao);
  gl.drawArrays(gl.POINTS, 0, CONFIG.moteCount);

  // 3. 生物本體，還有跟著牠的幼體
  drawCreature(pose, corePos, view, proj, eye, t);
  for (const y of young) {
    const yp = youngPose(pose, y);
    drawCreature(yp, Mat.apply(yp.world[boneIndex.core], [0, 0, 0]), view, proj, eye, t);
  }

  // 卵、正在分出去的光球（池壁上，半透明）
  const eggCount = fillEggs(corePos);
  if (eggCount) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(progEgg.program);
    const gu = progEgg.u;
    gl.uniformMatrix4fv(gu.u_view, false, view);
    gl.uniformMatrix4fv(gu.u_proj, false, proj);
    gl.uniform3fv(gu.u_camPos, eye);
    gl.uniform3fv(gu.u_shell, colors.body);
    gl.uniform3fv(gu.u_core, colors.core);
    gl.uniform1f(gu.u_time, t);
    gl.bindVertexArray(eggVao);
    gl.drawElementsInstanced(gl.TRIANGLES, eggIndexCount, gl.UNSIGNED_SHORT, 0, eggCount);
  }

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
  for (const y of young) {                              // 幼體的光暈（小、比較暗）
    const yp = youngPose(pose, y);
    gl.uniform3fv(progGlow.u.u_center, Mat.apply(yp.world[boneIndex.core], [0, 0, 0]));
    gl.uniform1f(progGlow.u.u_size, DATA.params.core_radius * 6 * y.scale);
    gl.uniform1f(progGlow.u.u_int, (0.3 + 0.8 * pose.coreI) * BR.youngGlow);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  gl.depthMask(true);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
