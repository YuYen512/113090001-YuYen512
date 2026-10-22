"""
debug 狀態總表：掃描程式碼裡的標記，和 debug-log.md 比對，避免「修了後面忘了前面」。

程式碼裡的標記（放在有問題的那一行上方）：
  // BUG(編號): 說明     🔴 未修正
  // CHECK(編號): 說明   🟡 待修正／待確認（需要決定怎麼處理）
  // FIXED(編號): 說明   🟢 已修正（保留在程式碼裡，看得出這一行改過什麼）

掃描用的是 ripgrep（https://github.com/BurntSushi/ripgrep）。
VS Code 的 Todo Tree 擴充套件（https://github.com/Gruntfuggly/todo-tree）也是用 ripgrep 找標記，
照 debug-log.md 最下面的設定，就能在編輯器裡直接看到每一行的紅黃綠。

用法（在 m2-species 資料夾裡）：python3 debug/status.py
"""
import pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
LOG = ROOT / "debug-log.md"
COLOR = {"BUG": "🔴", "CHECK": "🟡", "FIXED": "🟢"}
NAME = {"BUG": "未修正", "CHECK": "待修正／待確認", "FIXED": "已修正"}

# 1. 用 ripgrep 掃程式碼裡的標記
out = subprocess.run(
    ["rg", "-n", "--no-heading", "-e", r"//\s*(BUG|CHECK|FIXED)\([A-Z]\d+\)", "viewer.js", "index.html", "src"],
    cwd=ROOT, capture_output=True, text=True,
).stdout
code = {}
for line in out.splitlines():
    path, lineno, text = line.split(":", 2)
    m = re.search(r"(BUG|CHECK|FIXED)\(([A-Z]\d+)\):\s*(.*)", text)
    code.setdefault(m.group(2), []).append((m.group(1), f"{path}:{lineno}", m.group(3).strip()))

# 2. 讀 debug-log.md 的總表（每一列開頭是 | 編號 | 狀態 |）
log = {}
whole_program = set()
for line in LOG.read_text(encoding="utf-8").splitlines():
    m = re.match(r"\|\s*([A-Z]\d+)\s*\|\s*(🔴|🟡|🟢)\s*\|\s*([^|]*)", line)
    if m:
        log[m.group(1)] = m.group(2)
        if m.group(3).strip() == "全部":      # 檢查整支程式的項目，不對應某一行
            whole_program.add(m.group(1))

# 3. 印出總表，並比對兩邊
problems = []
print(f"\n{'編號':<6}{'狀態':<14}位置與說明")
for key in sorted(set(code) | set(log)):
    tags = code.get(key, [])
    kinds = {k for k, _, _ in tags}
    if len(kinds) > 1:
        problems.append(f"{key}：程式碼裡同時有 {'、'.join(sorted(kinds))} 標記，狀態矛盾")
    kind = next(iter(kinds)) if kinds else None
    color = COLOR.get(kind, "⚪")
    where = "；".join(f"{p} {d}" for _, p, d in tags) or "（程式碼裡找不到標記）"
    if not kind and key in whole_program:          # 檢查整支程式的項目，用紀錄檔裡的顏色
        color, where = log[key], "整支程式（不對應某一行）"
    label = {"🔴": "未修正", "🟡": "待修正／待確認", "🟢": "已修正"}.get(color, "沒有標記")
    print(f"{key:<6}{color} {label:<12}{where}")
    if key not in log:
        problems.append(f"{key}：程式碼有標記，但 debug-log.md 沒有登記")
    elif kind and log[key] != COLOR[kind]:
        problems.append(f"{key}：debug-log.md 寫 {log[key]}，程式碼標記是 {COLOR[kind]}，兩邊不一致")
    elif not kind and key in whole_program:
        pass
    elif not kind:
        problems.append(f"{key}：debug-log.md 有登記，但程式碼裡找不到標記")

counts = {c: sum(1 for k in code.values() if k and k[0][0] == t) for t, c in COLOR.items()}
print(f"\n🔴 未修正 {counts['🔴']}　🟡 待修正／待確認 {counts['🟡']}　🟢 已修正 {counts['🟢']}")
if problems:
    print("\n⚠️  需要注意：")
    for p in problems:
        print("   - " + p)
    sys.exit(1)
print("✅ 程式碼標記和 debug-log.md 一致")
