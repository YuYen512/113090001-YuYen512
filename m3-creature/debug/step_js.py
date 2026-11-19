"""
JS 逐行除錯：在 viewer.js 的某一行設中斷點，停下來後一行一行往下執行，
每一步印出「正在執行哪一行」和「當下的變數值」。

這和在 Chrome 開發者工具或 VS Code（vscode-js-debug）裡按「逐步執行」用的是同一套
Chrome DevTools Protocol，只是改成自動記錄，方便貼進 debug-log.md。

用法（在 m2-species 資料夾裡）：
  python3 debug/step_js.py 行號 [步數] [觸發用的 JS] [要看的變數,用 | 分開]
例：
  python3 debug/step_js.py 704 6 "window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyZ',repeat:true}))" "e.code|e.repeat|mode"
"""
import asyncio, json, pathlib, sys
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGE = (ROOT / "index.html").as_uri()
SOURCE = (ROOT / "viewer.js").read_text(encoding="utf-8").split("\n")
ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

line = int(sys.argv[1])                       # 1 開始的行號（和編輯器顯示的一樣）
steps = int(sys.argv[2]) if len(sys.argv) > 2 else 8
trigger = sys.argv[3] if len(sys.argv) > 3 else ""
watch = [w for w in (sys.argv[4] if len(sys.argv) > 4 else "").split("|") if w]
setup = sys.argv[5] if len(sys.argv) > 5 else ""


def short(v):
    if v.get("type") == "undefined":
        return "undefined"
    if "value" in v:
        return json.dumps(v["value"], ensure_ascii=False)
    return v.get("description", v.get("type", "?"))[:80]


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=ARGS)
        page = await browser.new_page(viewport={"width": 640, "height": 400})
        page.set_default_timeout(120000)
        await page.goto(PAGE)
        await page.wait_for_timeout(1200)
        if setup:
            await page.evaluate(setup)
        cdp = await page.context.new_cdp_session(page)
        paused = asyncio.Queue()
        cdp.on("Debugger.paused", lambda ev: paused.put_nowait(ev))
        await cdp.send("Debugger.enable")
        await cdp.send("Debugger.setBreakpointByUrl", {"lineNumber": line - 1, "urlRegex": r"viewer\.js$"})

        if trigger:   # 不要等它跑完：一碰到中斷點就會停住
            asyncio.ensure_future(page.evaluate(trigger))

        print(f"中斷點：viewer.js 第 {line} 行\n")
        for i in range(steps + 1):
            ev = await asyncio.wait_for(paused.get(), timeout=60)
            frame = ev["callFrames"][0]
            ln = frame["location"]["lineNumber"] + 1
            values = []
            for expr in watch:
                r = await cdp.send("Debugger.evaluateOnCallFrame", {"callFrameId": frame["callFrameId"], "expression": expr})
                values.append(f"{expr} = {short(r.get('result', {}))}")
            fn = frame.get("functionName") or "(頂層)"
            print(f"{'▶ 停在' if i == 0 else f'  第{i}步'}  {ln:>5} │ {SOURCE[ln - 1].strip()[:90]}")
            print(f"{'':>8}{fn}()  " + "  ".join(values))
            if i < steps:
                await cdp.send("Debugger.stepOver")
        await cdp.send("Debugger.setBreakpointsActive", {"active": False})
        await cdp.send("Debugger.resume")
        await browser.close()


asyncio.run(main())
