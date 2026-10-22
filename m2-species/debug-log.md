# Debug 紀錄

每一個找到的問題都有一個編號，狀態用顏色標示：

- 🔴 未修正
- 🟡 待修正／待確認（需要先決定怎麼處理）
- 🟢 已修正（而且重新跑過全部檢查，確認沒有弄壞別的地方）

程式碼裡也會在出問題的那一行上方加上同一個編號的標記（`BUG` = 🔴、`CHECK` = 🟡、`FIXED` = 🟢）。
執行 `python3 debug/status.py` 會比對程式碼和這份紀錄，兩邊對不上就會提醒。

## 總表

| 編號 | 狀態 | 位置 | 問題 | 怎麼發現的 | 怎麼確認修好 |
|---|---|---|---|---|---|
| D00 | 🟢 | 全部 | 沒有 WebGL 錯誤、數值沒有變成 NaN | 執行期檢查 | 一開始就通過，當作回歸檢查保留 |
| D01 | 🟢 | 全部 | 主控台沒有錯誤或警告 | 執行期檢查 | 一開始就通過，當作回歸檢查保留 |
| D02 | 🟢 | viewer.js 按鍵處理 | 長按 Z 時，按鍵自動重複會一直切換睡覺／醒來 | 執行期檢查 | 逐行除錯確認後修正；執行期檢查 D02 通過 |
| D03 | 🟢 | viewer.js 按鍵處理 | 長按 M 時，按鍵自動重複會一直切換飛行／漂浮 | 執行期檢查 | 同 D02；執行期檢查 D03 通過 |
| D04 | 🟢 | viewer.js `updateCamera` | 鏡頭沒有碰撞，轉到牆後面時視線會被牆擋住 | 執行期檢查 | 逐行除錯確認；執行期檢查 D04 通過（含空曠處不誤判）；牆和鐵絲網夾縫實測鏡頭不在任何東西裡 |
| D05 | 🟢 | viewer.js `resolveCollisions` | 身體正面撞牆不會穿過去 | 執行期檢查 | 一開始就通過，當作回歸檢查保留 |
| D06 | 🟡 | viewer.js `animate` | 碰撞只算身體那顆球，翅膀貼牆時會穿過牆 | 執行期檢查 | |
| D07 | 🟢 | viewer.js `updateSpores` | 孢子只檢查地面，會穿過屋頂、樓板和牆 | 執行期檢查 | 逐行除錯確認；執行期檢查 D07 通過（每幀檢查，40 顆全停在樓板頂面）；效能 0.54 毫秒/幀 |
| D08 | 🟡 | viewer.js `CONFIG.flight` | 飛行高度上限 30，冷卻塔有 80 高，飛不到塔頂 | 執行期檢查 | |
| R01 | 🟢 | src/environment.rs 爬藤 | 用 6.28 代替 2π，角度範圍少一小段 | Clippy | 改用 TAU 後 Clippy 不再報錯；資料重新產生；執行期檢查沒有變差 |
| R02 | 🟢 | src/environment.rs 瓦礫 | 用 6.28 代替 2π | Clippy | 改用 TAU 後 Clippy 不再報錯；資料重新產生；執行期檢查沒有變差 |
| R03 | 🟢 | src/environment.rs 碎石 | 用 6.28 代替 2π | Clippy | 改用 TAU 後 Clippy 不再報錯；資料重新產生；執行期檢查沒有變差 |
| R04 | 🟢 | src/environment.rs `add_lathe` | 參數太多（8 個）；只是寫法風格 | Clippy | 決定保留 8 個參數並標註 allow；Clippy 不再提醒；資料檔一個位元都沒變 |
| R05 | 🟢 | src/environment.rs 斷口迴圈 | 迴圈變數只拿來當索引，可以寫得更清楚 | Clippy | 改用 enumerate；Clippy 不再提醒；資料檔一個位元都沒變 |
| R06 | 🟢 | src/environment.rs 爬藤迴圈 | 同上 | Clippy | 改用 enumerate；Clippy 不再提醒；資料檔一個位元都沒變 |

## 用到的工具

| 用途 | 工具 | 為什麼選它 |
|---|---|---|
| Rust 靜態檢查 | [Clippy](https://github.com/rust-lang/rust-clippy)（Rust 官方，800 多條規則） | Rust 官方工具，裝 Rust 就有 |
| JS 靜態檢查 | [TypeScript](https://github.com/microsoft/TypeScript) 的 `checkJs` | 能抓出沒定義的變數、打錯的名字；原本想用 [ESLint](https://github.com/eslint/eslint)，但工作環境擋掉 npm，所以改用已經裝好的 TypeScript |
| 執行期檢查 | [Playwright](https://github.com/microsoft/playwright)（`debug/check_runtime.py`） | 真的在瀏覽器裡跑程式，模擬按鍵、飛行、撞牆 |
| 逐行除錯：Rust | rust-gdb（工作環境）／[CodeLLDB](https://github.com/vadimcn/codelldb)（VS Code） | 可以設中斷點、一行一行執行、看每個變數的值 |
| 逐行除錯：JS | Chrome DevTools Protocol（工作環境，用 Playwright 控制）／[vscode-js-debug](https://github.com/microsoft/vscode-js-debug)（VS Code） | 同上，VS Code 內建的 JS 除錯器也是用這個協定 |
| WebGL 畫面除錯 | [Spector.js](https://github.com/BabylonJS/Spector.js)（瀏覽器擴充） | 可以擷取一個畫面、看每一次繪圖指令和著色器；需要時在自己的瀏覽器用 |
| 逐行紅黃綠標記 | [ripgrep](https://github.com/BurntSushi/ripgrep)（`debug/status.py`）＋ [Todo Tree](https://github.com/Gruntfuggly/todo-tree)（VS Code） | 掃描程式碼裡的 BUG／CHECK／FIXED 標記，列出每一行的狀態 |

## 在 VS Code 裡看到每一行的紅黃綠（選用）

安裝 Todo Tree 擴充套件後，把下面這段加進 VS Code 的設定（`settings.json`）：

```json
"todo-tree.general.tags": ["BUG", "CHECK", "FIXED"],
"todo-tree.highlights.customHighlight": {
  "BUG":   { "foreground": "#ffffff", "background": "#d64545", "icon": "bug",   "iconColour": "#d64545" },
  "CHECK": { "foreground": "#000000", "background": "#e8b931", "icon": "alert", "iconColour": "#e8b931" },
  "FIXED": { "foreground": "#000000", "background": "#4caf6a", "icon": "check", "iconColour": "#4caf6a" }
}
```

## 修正紀錄

（每修好一個就在這裡記一筆：原因、怎麼修、驗證結果）

### D02、D03 長按按鍵一直切換模式 🟢

- **原因**：長按按鍵時，瀏覽器會一直送出「自動重複」的按鍵事件（`e.repeat = true`）。程式沒有分辨，每收到一次就切換一次模式。
- **逐行除錯**（`python3 debug/step_js.py 702 3 ...`）：停在第 702 行往下走，看到 `e.repeat = true` 時仍然執行切換，第 3 步 `mode` 從 `"sleep"` 變成 `"hover"`。
- **修正**：viewer.js 按鍵處理，只有 `!e.repeat`（真的按下去那一次）才切換。
- **驗證**：再逐行跑一次，`mode` 一直維持 `"sleep"`；執行期檢查 D02、D03 通過，其他檢查沒有變差。

### R01、R02、R03 用 6.28 代替 2π 🟢

- **原因**：隨機角度的範圍寫成 0～6.28，但一整圈是 2π ≈ 6.2832，少了 0.0032 弧度。畫面上看不出來，但數學上不正確，Clippy 把它列為錯誤等級。
- **逐行除錯**（rust-gdb）：停在 environment.rs 第 424 行 `add_vine`，往下一步印出 `wiggle_phase = 0.587`，再算出 6.28 和 2π 差了 -0.00319。
- **修正**：三處都改用標準函式庫的 `std::f32::consts::TAU`。
- **驗證**：Clippy 不再出現錯誤；重新 `cargo run` 產生資料；執行期檢查沒有變差。

### R04、R05、R06 Clippy 的寫法提醒 🟢

- **R05、R06**：迴圈寫成 `for c in 0..cols`，再用 `tops[c]` 取值。改成 `for (c, &top) in tops.iter().enumerate()`，一次拿到「第幾欄」和「那一欄的高度」，比較不容易寫錯索引。
- **R04**：`add_lathe` 有 8 個參數，Clippy 建議 7 個以內。每個參數都有用到，硬拆成結構反而更難讀，所以決定保留，並加上 `#[allow(clippy::too_many_arguments)]` 表示這是刻意的。
- **驗證**：只改寫法、不改結果，所以要求修改前後產生的資料檔**一個位元都不差**，用 `cmp` 比對完全相同；Clippy 已經沒有任何提醒。

### D04 鏡頭被牆擋住 🟢

- **原因**：`updateCamera` 只照「角度＋距離」算鏡頭位置，完全不管中間有沒有東西。
- **逐行除錯**（`python3 debug/step_js.py 1011 ...`）：把生物放在牆外 1.22 的地方、鏡頭轉到牆那一側，看到鏡頭位置在牆的另一邊（-5.11），代表視線整個被牆擋住。
- **修正**：新增 `cameraClearance`，從生物往鏡頭方向射一條線：
  - 對牆、柱子這些方塊用 slab 法算出「最早碰到的距離」。
  - 對煙囪、冷卻塔、地面則沿著線一小段一小段檢查。
  - 被擋住時鏡頭立刻拉近到牆前面，沒被擋住時再慢慢退回原本的距離，畫面不會一直跳。
- **除錯過程中又抓到一個錯**：一開始設了「鏡頭最近 0.8」的下限，結果在牆和鐵絲網夾縫裡，這個下限反而把鏡頭推進鐵絲網。改成碰撞優先（下限降到 0.15）之後，實測鏡頭不在任何東西裡面。
- **驗證**：執行期檢查 D04 通過，並加了反向檢查：在空曠的地方鏡頭要維持 6.4 的距離，不能被誤判拉近，實測 6.4。
- **TypeScript 檢查**：`cam.actual` 一開始沒有宣告，是執行到一半才加上的屬性。已經改成在建立 `cam` 時就宣告好。
- **已知的取捨**：生物緊貼著牆、鏡頭又轉到牆那一側時，空間只夠把鏡頭放得非常近，會看到生物身體的內部。這是空間不夠的必然結果，一般第三人稱遊戲也是這樣處理。

### D07 孢子穿過屋頂、樓板和牆 🟢

- **原因**：孢子落地只和地面高度比較，從來不管上面有沒有屋頂或樓板。
- **逐行除錯**（`python3 debug/step_js.py 985 ...`）：把孢子放在樓板頂面上方 0.005 的地方，看到程式拿它和地面高度 `g = -2.65` 比較，判斷「還沒落地」，於是繼續往下掉。
- **修正**：新增 `pushSporeOut`，孢子跑進碰撞方塊時，就推到最近的表面上停住，跟落地一樣慢慢熄滅。另外先把方塊依照位置分格存放（`sporeGrid`，8×8 一格），每顆孢子只檢查自己那一格。
- **除錯過程中又抓到兩個錯**：
  1. 「停住的孢子就跳過」那一行一開始放在重力計算後面，停住的孢子還是會被重力慢慢拉進樓板。已經移到重力計算前面。
  2. 原本的檢查只看最後剩下的孢子，但孢子停住 2.5 秒就會消失，穿過去的也會消失，等於誤判成通過。改成每一幀都檢查，也改了檢查的時間長度，讓孢子有足夠時間落下。
- **驗證**：修正前的程式 40 顆全部穿過樓板；修正後 0 顆穿過、40 顆全部停在樓板頂面。效能：500 顆孢子每一幀約 0.54 毫秒。
- **還沒處理**：煙囪和冷卻塔是圓柱，孢子不會停在上面。它們都在比較遠的地方，孢子很少飄到那裡。
