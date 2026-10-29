"""
執行期檢查（回歸測試）：在瀏覽器裡真的跑 index.html，一項一項檢查。
每修好一個問題就重跑一次全部，確認前面修好的沒有又壞掉。

用法（在 m2-species 資料夾裡）：python3 debug/check_runtime.py
需要：Python 的 playwright 套件（https://github.com/microsoft/playwright）

每一項檢查都對應 debug-log.md 裡的一個編號（D01、D02…）。
"""
import asyncio, json, pathlib, sys
from playwright.async_api import async_playwright

PAGE = (pathlib.Path(__file__).resolve().parent.parent / "index.html").as_uri()
ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

# 共用的小工具（注入到頁面裡）
HELPERS = """
window.__t = {
  // 點 p 是否在某個碰撞方塊裡（margin = 額外的厚度）
  insideBox(p, b, margin = 0) {
    const d = [p[0] - b.c[0], p[1] - b.c[1], p[2] - b.c[2]];
    for (let k = 0; k < 3; k++) {
      const a = b.ax[k];
      if (Math.abs(d[0] * a[0] + d[1] * a[1] + d[2] * a[2]) > b.h[k] + margin) return false;
    }
    return true;
  },
  insideAny(p, margin = 0) { return COL.boxes.some((b) => this.insideBox(p, b, margin)); },
  // 從 a 到 b 的線段中間有沒有穿過任何方塊（取樣）
  segmentBlocked(a, b, steps = 80) {
    for (let i = 1; i < steps; i++) {
      const f = i / steps;
      if (this.insideAny([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f])) return true;
    }
    return false;
  },
  // 找一面又高又寬的牆，回傳牆中心、朝外方向
  pickWall() {
    const b = COL.boxes.find((b) => Math.abs(b.ax[1][1]) > 0.99 && b.h[0] > 3 && b.h[1] > 1 && b.h[2] < 0.5 && b.c[1] - groundHeightAt(b.c[0], b.c[2]) > 1.6 && b.c[1] < 6);
    return { b, n: b.ax[2] };
  },
  reset() { keys.clear(); flight.speed = 0; flight.vy = 0; flight.turn = 0; stamina = 1; exhausted = false; setMode('fly'); },
};
"""

CHECKS = [
  ("D00", "沒有 WebGL 錯誤、數值沒有變成 NaN（飛行／漂浮／睡覺各跑一段）", """async () => {
    const errs = [];
    for (const m of ['fly', 'hover', 'sleep', 'fly']) {
      setMode(m);
      await new Promise((r) => setTimeout(r, 700));
      const e = gl.getError(); if (e) errs.push(m + ':' + e);
    }
    const bad = [...flight.pos, ...cam.target, cam.yaw, cam.distance].some((v) => !Number.isFinite(v));
    __t.reset();
    return { ok: errs.length === 0 && !bad, info: { glErrors: errs, nan: bad } };
  }"""),

  ("D02", "長按 Z 不會一直切換睡覺／醒來", """async () => {
    __t.reset();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' }));
    for (let i = 0; i < 9; i++) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', repeat: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyZ' }));
    const after = mode; __t.reset();
    return { ok: after === 'sleep', info: { 長按Z十下之後的模式: after } };
  }"""),

  ("D03", "長按 M 不會一直切換飛行／漂浮", """async () => {
    __t.reset();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM' }));
    for (let i = 0; i < 9; i++) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM', repeat: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyM' }));
    const after = mode; __t.reset();
    return { ok: after === 'hover', info: { 長按M十下之後的模式: after } };
  }"""),

  ("D04", "生物在牆邊、鏡頭轉到牆後面時，鏡頭不會穿進牆裡或被牆擋住；空曠處鏡頭保持原本距離", """async () => {
    __t.reset();
    const { b, n } = __t.pickWall();
    const p = [b.c[0] + n[0] * 1.2, b.c[1], b.c[2] + n[2] * 1.2];
    flight.pos = p.slice(); cam.target = p.slice();
    cam.yaw = Math.atan2(-n[0], -n[2]); cam.pitch = 0.15; cam.distance = 6.4;  // 鏡頭放到牆的另一邊
    let blocked = 0, inside = 0;
    for (let i = 0; i < 30; i++) {
      const eye = updateCamera(i / 60, 1 / 60);
      if (__t.insideAny(eye)) inside++;
      if (__t.segmentBlocked(cam.target, eye)) blocked++;
    }
    // 反向檢查：在空曠的地方（起飛點附近沒有建築），鏡頭要保持設定的距離，不能被誤判拉近
    flight.pos = [0, 0, 0]; cam.target = [0, 0, 0]; cam.yaw = 0.85; cam.pitch = 0.22; cam.distance = 6.4;
    let eye = null; for (let i = 0; i < 240; i++) eye = updateCamera(i / 60, 1 / 60);
    const openDist = Math.hypot(eye[0] - cam.target[0], eye[1] - cam.target[1], eye[2] - cam.target[2]);
    __t.reset();
    return { ok: inside === 0 && blocked === 0 && openDist > 6.3,
             info: { 鏡頭在牆裡的影格: inside, 視線被牆擋住的影格: blocked, 空曠處的鏡頭距離: +openDist.toFixed(2) } };
  }"""),

  ("D05", "身體正面撞牆不會穿過去（之前修好的碰撞，回歸檢查）", """async () => {
    __t.reset();
    const { b, n } = __t.pickWall();
    flight.pos = [b.c[0] + n[0] * 4, b.c[1], b.c[2] + n[2] * 4];
    flight.heading = Math.atan2(-n[0], -n[2]);
    keys.add('KeyW');
    let maxInside = 0;
    for (let i = 0; i < 300; i++) {
      updateFlight(i / 60, 1 / 60); flight.pos[1] = b.c[1];
      if (__t.insideAny(flight.pos)) maxInside++;
    }
    const side = (flight.pos[0] - b.c[0]) * n[0] + (flight.pos[2] - b.c[2]) * n[2];
    __t.reset(); flight.pos = [0, 0, 0];
    return { ok: maxInside === 0 && side > 0, info: { 身體在牆裡的影格: maxInside, 停在牆的哪一側: side > 0 ? '外側（正確）' : '穿過去了' } };
  }"""),

  ("D06", "翅膀貼著牆時不會穿過牆（會自動往後收）；空曠處翅膀完全張開", """async () => {
    __t.reset();
    const { b, n } = __t.pickWall();
    // 讓生物側身貼著牆（右翼朝牆）
    flight.pos = [b.c[0] + n[0] * 3, b.c[1], b.c[2] + n[2] * 3];
    flight.heading = Math.atan2(-n[0], -n[2]) + Math.PI / 2;
    const toWall = [-n[0], 0, -n[2]];
    let worst = 0;
    for (let i = 0; i < 240; i++) {
      flight.pos[0] += toWall[0] * 0.03; flight.pos[2] += toWall[2] * 0.03;   // 一直往牆擠
      updateFlight(i / 60, 1 / 60); flight.pos[1] = b.c[1];
      const pose = animate(i / 60, 1 / 60);
      for (const bone of ['wing_r', 'wing_l']) {
        // 沿著翅膀從翅根（埋在身體裡）到翅尖取樣：任何一段穿過牆都算
        const sgn = bone === 'wing_r' ? 1 : -1;
        const root = Mat.apply(pose.world[boneIndex[bone]], [sgn * 0.5, 0, -0.3]);
        const tip = Mat.apply(pose.world[boneIndex[bone]], [sgn * DATA.params.wing_span * 0.9, 0, -0.3]);
        if (__t.segmentBlocked(root, tip, 30)) worst++;
      }
    }
    // 反向檢查：在空曠的地方翅膀要完全張開，不能被誤判而收起來
    __t.reset(); flight.pos = [0, 0, 0];
    for (let i = 0; i < 300; i++) { updateFlight(i / 60, 1 / 60); animate(i / 60, 1 / 60); }
    const openFold = Math.max(wingFold.r, wingFold.l) * 180 / Math.PI;
    return { ok: worst === 0 && openFold < 1, info: { 翅膀穿過牆的次數: worst, 空曠處翅膀收起的角度: +openFold.toFixed(1) } };
  }"""),

  ("D07", "掉下來的孢子不會穿過屋頂、樓板、牆", """async () => {
    __t.reset(); spores.length = 0;
    // 在一塊水平的樓板正上方放孢子，讓它們掉下來
    const slab = COL.boxes.find((b) => b.ax[1][1] > 0.99 && b.h[0] > 1.5 && b.h[2] > 1.5 && b.h[1] < 0.4 && b.c[1] > 2);
    for (let i = 0; i < 40; i++) spores.push({ p: [slab.c[0] + (Math.random() - 0.5), slab.c[1] + 2, slab.c[2] + (Math.random() - 0.5)], v: [0, -0.2, 0], age: 0, life: 99, seed: Math.random() });
    const pose = animate(0, 1 / 60); pose.sleep = 1;   // 睡著時不會產生新孢子
    // 每一幀都檢查（孢子停住 2.5 秒後會消失，只看最後會漏掉穿過去又消失的）
    const fellThrough = new Set(), onSlab = new Set();
    for (let i = 0; i < 1200; i++) {                     // 孢子掉得很慢（最快約每秒 0.17），給它 20 秒
      updateSpores(i / 60, 1 / 60, pose);
      for (const sp of spores) {
        if (sp.p[1] < slab.c[1] - slab.h[1] - 0.05) fellThrough.add(sp);
        if (sp.landed && Math.abs(sp.p[1] - (slab.c[1] + slab.h[1])) < 0.1) onSlab.add(sp);
      }
    }
    const landedOnSlab = onSlab.size;
    spores.length = 0; __t.reset();
    return { ok: fellThrough.size === 0 && landedOnSlab > 30, info: { 孢子數: 40, 穿過樓板的: fellThrough.size, 停在樓板頂面的: landedOnSlab } };
  }"""),

  ("D10", "體力循環：飛行會累 → 累倒自己睡著 → 太累時叫不醒 → 睡飽自己醒來", """async () => {
    __t.reset(); flight.pos = [0, 0, 0];
    const info = {};
    // 1. 一直往前飛，體力會減少，累了之後飛得比較慢
    keys.add('KeyW');
    for (let i = 0; i < 60 * 30; i++) { updateFlight(i / 60, 1 / 60); updateStamina(1 / 60); }
    info.飛30秒後的體力 = +stamina.toFixed(2);
    const fastSpeed = flight.speed;
    for (let i = 0; i < 60 * 20; i++) { updateFlight(i / 60, 1 / 60); updateStamina(1 / 60); }
    info.累了的速度比 = +(flight.speed / fastSpeed).toFixed(2);
    // 2. 繼續飛到累倒：自己進入睡覺
    let n = 0;
    while (mode !== 'sleep' && n++ < 60 * 30) { updateFlight(n / 60, 1 / 60); updateStamina(1 / 60); }
    info.累倒後的模式 = mode; info.是累倒的 = exhausted;
    // 3. 剛累倒時按方向鍵、Z 叫不醒
    sleepBlend = 1;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyZ' }));
    info.剛累倒時按鍵後的模式 = mode;
    // 4. 睡著會恢復，睡飽自己醒來
    n = 0;
    while (mode === 'sleep' && n++ < 60 * 60) { sleepBlend = 1; updateStamina(1 / 60); }
    info.醒來時的體力 = +stamina.toFixed(2); info.醒來後的模式 = mode;
    __t.reset();
    return { ok: info.飛30秒後的體力 < 0.6 && info.飛30秒後的體力 > 0.4 && info.累了的速度比 < 0.9
               && info.累倒後的模式 === 'sleep' && info.是累倒的 && info.剛累倒時按鍵後的模式 === 'sleep'
               && info.醒來後的模式 === 'hover' && info.醒來時的體力 >= 0.99, info };
  }"""),

  ("D08", "飛行高度上限維持 30（已決定維持現狀，冷卻塔頂端暫時飛不到）", """async () => {
    const tower = COL.cyls.find((c) => c.shell);
    const top = tower.base[1] + tower.height;
    return { ok: FL.ceilingY === 30, info: { 飛行高度上限: FL.ceilingY, 冷卻塔頂端高度: +top.toFixed(1) } };
  }"""),
]


async def main():
    only = set(sys.argv[1:])
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=ARGS)
        page = await browser.new_page(viewport={"width": 900, "height": 600})
        page.set_default_timeout(120000)
        console_errors = []
        page.on("pageerror", lambda e: console_errors.append(str(e)))
        page.on("console", lambda m: console_errors.append(m.text) if m.type in ("error", "warning") else None)
        await page.goto(PAGE)
        await page.wait_for_timeout(1500)
        await page.evaluate(HELPERS)
        results = []
        for code, name, js in CHECKS:
            if only and code not in only:
                continue
            try:
                r = await page.evaluate(js)
            except Exception as e:  # 檢查本身出錯也要記下來
                r = {"ok": False, "info": "檢查執行失敗：" + str(e).splitlines()[0]}
            results.append((code, name, r))
        results.append(("D01", "主控台沒有錯誤或警告", {"ok": not console_errors, "info": console_errors[:5]}))
        await browser.close()

    print()
    for code, name, r in sorted(results):
        mark = "🟢 通過" if r["ok"] else "🔴 沒通過"
        print(f"{mark}  {code} {name}")
        print(f"          {json.dumps(r['info'], ensure_ascii=False)}")
    failed = [c for c, _, r in results if not r["ok"]]
    print(f"\n共 {len(results)} 項，通過 {len(results) - len(failed)} 項，沒通過 {len(failed)} 項：{' '.join(failed) or '無'}")
    sys.exit(1 if failed else 0)


asyncio.run(main())
