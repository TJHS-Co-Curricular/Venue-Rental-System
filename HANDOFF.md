# HANDOFF · 场地借用系统（Venue-Rental-System）

> 2026-10-16 从 Claude 应用（Claude 项目「Venue-Rental-System」）转到 Claude Code 时写的一次性交接。长期规范在 `CLAUDE.md`；这份处理完可以删掉。
> 标【待确认】的是资料不足或前后不一致的地方，没有猜测补全。

## 0. 盘点：这份交接依据什么

| 来源 | 内容 |
|---|---|
| Claude 项目「Venue-Rental-System」的文档 | `claude/交接.md`（10-16）、`claude/CLAUDE.md`、`claude/src/`（Code.js、Cleanup.js、Admin.html、Table.html、Viewver.html、TVBoard.html、appsscript.json）、`claude/src/test/`（4 个测试脚本）。另有 `claude/README.md`、`claude/需求规格.md`、`claude/上线检查清单.md`、`claude/CHANGELOG.md`（10-05 上传）。这次交接时对话改挂到别的项目，所以 README / 需求规格 / 上线检查清单 / CHANGELOG / test 这几份**没有重新读 Claude 项目的版本**，以仓库里的为准 |
| 维护者电脑上的项目文件夹 | `D:\00-Data\Documents\Github\Venue-Rental-System`：全部代码、README、CHANGELOG、CLAUDE.md、`Docs/需求规格.md`、`Docs/上线检查清单.md`、`.clasp.json`、`.gitignore`、`.git` |
| git 记录 | 拷贝 `.git` 后在本机跑 `git log` / `git status`（见第 6 节） |
| 这个对话（10-16 中午） | 维护者反映「`clasp push` + 更新部署后，管理端没有整批编辑、矩阵总表没有活动预告」；当时确认本地文件已经是新版，给了排查步骤 |
| 过去的对话 | 只找到其他项目（成就奖、PPT-Presenter）的对话，没有找到 Claude 项目以外的场地系统对话。10-16 之前的历史以 `CHANGELOG.md` 为准 |

## 1. 项目目标

给循人中学联课活动处一套用学校 Google 账号就能用的场地借用系统：管理员登记借用和场地特殊状态，全校在矩阵总表、日历、电视看板上看到借用情况，同场地同时段不会被重复借用。

技术形式：Google Apps Script 网页应用 + 绑定的 Google 试算表「联课处场地系统-资料库」。

- 线上网址（原部署）：`https://script.google.com/a/macros/tsunjin.edu.my/s/AKfycbysW08R9szQRi7xvvdto4MPPV2DsxSWnvtUr4-u2hlR8Pg4_a4q5Go4Eg4dBYkPrxilkA/exec`
- `.clasp.json` 的 scriptId：`1zt_L53bxNVsQINvbTrqLs7d3C24VwpUa7TMQygvLeaHXQLVHGDPfpRkg`（✅ 就是线上部署所属的脚本（2026-10-16 维护者确认））
- 仓库：`TJHS-Co-Curricular/Venue-Rental-System`

## 2. 当前进度

### 已完成（代码已在 git，commit `3f2f15f`「16-10-2026」，已推到 GitHub）

**2026-10-16**
- 整批编辑：每行「整批编辑」按钮，可改同一批（同一个系统时间戳）的内容、场地、日期范围、星期几。后端 `readBatch` / `updateBatch` / `findBatchRows_`。
- 系统时间戳改为毫秒精度（`batchStamp_()`），避免两人同一秒提交被当成同一批。
- 借用记录列表的操作按钮排成 2×2。
- 矩阵总表公告栏改为「活动预告」：自动列出所选月份大讲堂 / 大礼堂 / 伯才堂的借用和特殊状态（按日期，过去变淡，今天标示，自动卷到今天，点开看明细）。手写 Markdown 公告移到下方「📝 其他公告」，空白就不显示。
- 活动预告「合并同类活动」：同礼堂 + 同活动 + 同单位只列一次，日期写成范围（`formatDateRanges()`）。**注意：这一项不在 Claude 项目的 `claude/src/Table.html` 里，只在仓库里**，所以仓库比 Claude 项目的副本新。
- README / CLAUDE.md / CHANGELOG 已同步。

**2026-10-05 及更早**（详见 `CHANGELOG.md`）
- 假期黄色底、【管理员姓名】栏、管理端「资料范围」、操作提示 / 错误条。
- 全面代码审查后的修正：特殊状态删除不再删到 A 栏定义、移除 People API、时间 / 日期顺序检查、单次 200 笔上限、`LockService` 写入锁、维护函数只限拥有者、私有函数 `_` 结尾、任意 `?page=` 都过白名单、纯文本写入、载入失败不卡住、早上 8 点前日期正确、日历中文语系 / 24 小时制、矩阵总表 5 分钟刷新、修改改为原地更新、5 分钟设定缓存、借用记录按日历年保留。当时的测试：Node 模拟后端 24 项、Playwright 51 项全部通过。
- 9 月：电视看板、公告栏（Sheet A2 + Markdown）、特殊状态、分页 / 跨页勾选、楼栋固定按钮、clasp 管理、第一版的冲突检查 / 回收站 / 操作日志 / 每月清理。

### 进行中

- ~~**上线 10-16 的新功能**~~ ✅ 已解决（2026-10-16 维护者确认）：线上 `/exec` 已有整批编辑、活动预告，活动预告也已合并同类活动。之前看不到新功能是 Claude 应用的连接问题，`.clasp.json` 的 scriptId 是对的。
- **GPG 测试的空提交共 3 个**（`b2fd59e`、`4015fa3`、`0c191ac`，都没有文件改动）：前两个已推到 GitHub；本地 `main` 比 `origin/main` 多 1 个（`0c191ac`）。要不要 push：【待确认】，不影响代码。
- **`migrate-to-code` 分支（交接提交 `94d7eb8`）还没推到 GitHub**。
- **`Docs/需求规格.md` 和 `Docs/上线检查清单.md` 还停在 10-05**：没有整批编辑、活动预告的需求和检查项。`claude/交接.md` 提到需求编号 R-BK-17/18、R-AN-05~09，但仓库的需求规格只到 R-BK-16、R-AN-04。这些编号的内容有没有写在别的地方：【待确认】。

### 未开始

- 把测试脚本放进仓库（目前只在 Claude 项目里，见第 5 节第 3 项）。
- `Docs/需求规格.md` §9「尚未处理」的四项：电视看板时区、电视看板固定像素版面、《场地编号》【状态】栏去留、礼堂名单写死在程序里（现在有三份拷贝）。

## 3. 关键决定（选了什么、为什么）

| 决定 | 原因 / 放弃了什么 |
|---|---|
| 资料放 Google Sheets、每个月一张工作表（`yyyy-MM`） | 学校本来就用 Google Workspace，老师能直接看表格；按月分表让矩阵总表 / 日历只读需要的月份，清理时整张删 |
| 网页应用「以部署者身份执行」+「学校网域」 | 访问者不需要试算表权限；代价是所有服务都用拥有者权限，所以白名单和写入检查必须在服务器端做 |
| 每个写入函数自己再查白名单（`requireAdminAccess()`） | 所有顶层函数都能被 `google.script.run` 直接呼叫，只靠页面挡不住 |
| 写入一律先设 `@` 纯文本（`appendRowsAsText_`），不用 `appendRow()` | Sheets 会把 `06:00` 变时间、`5/10/2026` 按地区变日期（美国地区日月对调）、`-` 开头变公式 `#ERROR!` |
| `LockService` 脚本锁包住所有写入 | 两位管理员同时提交可能都通过冲突检查、或同时删除删错行 |
| 公告来源：Sheet《公告栏》A2，不用 Google 文档 | Workspace 会不定期撤销文档授权，网页应用无法自行重新授权，公告栏三不五时坏掉（R-AN-03 ✅） |
| 公告用 Markdown（marked.js），允许夹 HTML | 管理员写起来比 HTML 简单；公告是管理员可信内容，所以不做 sanitize |
| 「填写人」用《场地编号》【管理员姓名】栏，移除 People API | 以部署者身份执行时 `people/me` 永远是拥有者，其他管理员都被填成拥有者的名字 |
| 修改单笔记录 = 原地覆写，保留系统时间戳 | 旧做法「先删再建」会脱离同批、中途失败丢资料、被删的记录会复活 |
| 系统时间戳当「批次 ID」，改成毫秒精度 | 不另加栏位、旧资料照样可用；秒级会把同一秒的两次提交当成同一批 |
| 整批编辑：先写新记录再删旧记录；保存前比对 `expectedIds` | 新记录写在表尾，不影响旧记录行号；中途失败最多多出重复、不会丢资料；有人同时改过就拒绝，避免覆盖别人 |
| 整批编辑由后端扫描全部月份表（`readBatch`） | 整批可能超出管理端目前的「资料范围」，不能只靠前端 `rawData` |
| 活动预告纯前端产生，用矩阵同一份当月资料 | 不多打后端请求；切月份、5 分钟刷新会自动跟着更新 |
| 特殊状态只标记、不阻挡借用 | 使用方确认（R-SS-03 ✅），不要加硬拦截 |
| 借用记录保留「今年 + 去年」（按日历年） | 使用方要求「29 年才删 27 年」；原本滚动 24 个月不符合（R-CU-02 ✅） |
| 设定类资料缓存 5 分钟，白名单不缓存 | 公众页面 / 电视看板一直读设定，缓存省时间；移除管理员要立刻生效 |
| 用 clasp + git 管理代码；更新时编辑原部署 | 网址不变，电视看板不用改设定；新增部署会产生新网址 |
| 电视看板每 6 小时重新载入前先确认网络和后端 | 无人值守，直接 reload 遇到断网 / 登入过期会卡在错误页 |

## 4. 已知问题、限制、踩过的坑

**未解决**
1. ~~线上部署有没有更新到 10-16 的版本~~ ✅ 已更新（2026-10-16 维护者确认）。
2. 电视看板的「今天」和红色时间线用电视本机时区，电视时区设错会错位。
3. 电视看板是固定像素版面，小屏幕要卷动。
4. 《场地编号》的【状态】栏程序没有读取，去留待使用方决定。
5. 三个礼堂名单写在程序里，有三份拷贝：`Code.js` `TV_BOARD_VENUE_NAMES`、`Admin.html` `MAJOR_HALL_NAMES`、`Table.html` `PREVIEW_HALL_NAMES`。
6. 改单位 / 特殊状态的格子**颜色**不会触发 `onEdit`，最多 5 分钟后才生效（或拥有者运行 `clearConfigCache()`）。
7. Apps Script 配额：单次执行 6 分钟。单次提交上限 200 笔就是为此设的；整批编辑会扫描全部月份表，月份表很多时会变慢。
8. 仓库里没有自动化测试。

**踩过的坑**
- 推送后线上没变：通常是「管理部署 → 编辑」时版本没改成「新版本」（下拉选单默认是当前版本），或用了「新增部署」（产生新网址）。用 `/dev` 测试网址分辨：`/dev` 有新功能而 `/exec` 没有 = 部署没更新；`/dev` 也没有 = 推上去的不是新文件，或推到了别的脚本（检查 `.clasp.json` 的 scriptId、`clasp deployments` 列表里有没有原部署 ID）。
- `clasp` 报 `No credentials found` → `clasp login`；`The caller does not have permission` → 用 zjchong@tsunjin.edu.my 登入，并在 https://script.google.com/home/usersettings 打开 Apps Script API；`Project settings not found` → 缺 `.clasp.json`（被 .gitignore 排除，重新 clone 后要补）。
- `clasp pull` 会覆盖本地修改；`clasp push` 会删掉线上有、本地没有的文件。
- 删除特殊状态用 `deleteRow()` 会连同一行 A 栏的状态定义一起删掉。
- `Range.setValue()` 不会触发 `onEdit`，所以 `saveAnnouncementContent()` 要自己写 B2 时间。
- 把资料拼进 `onclick="...('${x}')"`：资料有引号按钮就失效，`escapeHtml` 也救不了。
- `input.valueAsDate = new Date()` 是 UTC 日期，马来西亚早上 8 点前会显示昨天。
- `getUnitColorMap()` 回传数组而不是物件，因为 `"01"`、`"10"` 这类键会被 JS 重新排序。
- Node `vm` 测试里的 `Date` 跟外面不同 realm，`instanceof Date` 会失败。
- `Docs/Google Sheets 场地借用系统开发.md`（约 650KB）是早期对话记录，混有其他项目的片段，不是现在的设计。

## 5. 下一步（按优先级）

1. ~~**把 10-16 的版本部署上线并验证**~~ ✅ 已完成（2026-10-16 维护者确认）。以下步骤保留作为日后更新部署的参考。
   ```powershell
   cd D:\00-Data\Documents\Github\Venue-Rental-System
   clasp push --force
   clasp deployments
   ```
   - 列表里有 `AKfycbysW08R9szQRi7xvvdto4MPPV2DsxSWnvtUr4-u2hlR8Pg4_a4q5Go4Eg4dBYkPrxilkA` → `clasp deploy -i AKfycbysW08R9szQRi7xvvdto4MPPV2DsxSWnvtUr4-u2hlR8Pg4_a4q5Go4Eg4dBYkPrxilkA -d "整批编辑 + 活动预告"`，再 Ctrl+F5。
   - 没有 → `.clasp.json` 指向别的脚本：从线上部署对应的 Apps Script「项目设置」复制脚本 ID，改 `.clasp.json` 后重来。
   - 上线后照 `Docs/上线检查清单.md` §3 检查，再加做：整批编辑（延长日期、改星期几、增减场地、被单独删掉的几笔会补回来、两个分页同时改同一批会被拒绝）；活动预告（切月份、今天标示、自动卷动、同类合并的日期范围、点开明细、手写公告空白时隐藏）。
2. **补文档**：`Docs/需求规格.md` 加整批编辑（R-BK-17/18）和活动预告（R-AN-05~09）的需求；`Docs/上线检查清单.md` 加上一项的检查项；需求规格的「最后整理」日期改成 10-16。编号内容要先跟维护者确认【待确认】。
3. **把测试搬进仓库**：从 Claude 项目「Venue-Rental-System」下载 `claude/src/test/` 的 `gas_fake.js`、`test_batch_backend.js`、`test_batch_admin.js`、`test_preview_table.js`，放进 `tests/`。改掉写死的路径（`/home/claude/work`、`/home/claude/.npm-global/...`、`/home/claude/libs/node_modules`），加 `package.json` 写明 playwright、marked、bootstrap 依赖。`claude/src/Table.html` 没有「合并同类活动」，所以同一批写的 `test_preview_table.js` 很可能也没测到合并，可能要按现在的输出更新【待确认】。**归档 Claude 项目之前先把这几个文件拿出来**，它们不在 git 里。
4. **决定要不要 push `0c191ac`**（GPG 测试的空提交）【待确认】。
5. 礼堂名单三份拷贝合并成一份：由后端提供（例如 `getVenuesFromSheet` 或新的只读函数），前端不再写死。
6. 跟使用方讨论 `Docs/需求规格.md` §9 的其他项目（电视时区、小屏幕版面、【状态】栏）。

## 6. 文件变动

**这个对话（2026-10-16）没有修改任何文件**，只做了检查：本地文件是新版、`.clasp.json` 设定正常、给了部署排查步骤。

**Claude 项目里以前的对话**改过的文件，全部已经在 git 里：

| 文件 | 改动 | 所在 commit |
|---|---|---|
| `Code.js` | `batchStamp_()`（毫秒时间戳，`createRecord` / `updateRecord` 改用它）；`findConflictInIndex_` 的 `excludeId` 可以传 `Set`；新增 `findBatchRows_`、`readBatch`、`updateBatch` | `3f2f15f` |
| `Admin.html` | 「整批编辑」按钮、2×2 操作按钮（`.row-actions`）、`batchEdit` 状态、`startBatchEdit` / `fillBatchEditForm` / `inferBatchDatePattern` / `exitBatchEditMode`、`#batchEditNote`；送出时走 `updateBatch`；公告编辑区改名「其他公告」并加说明 | `3f2f15f` |
| `Table.html` | 公告栏改为活动预告 + 其他公告：`renderEventPreview`、`resolvePreviewHall`、`PREVIEW_HALL_NAMES`、`formatDateRanges`（同类合并）、自动卷到今天、`#manualAnnouncementSection` | `3f2f15f` |
| `README.md`、`CLAUDE.md`、`CHANGELOG.md` | 写入以上功能 | `3f2f15f` |
| 10-05 及更早的全部改动 | 见 CHANGELOG | `e5e3849` 及之前 |

`git status` 结果：工作目录和 HEAD 完全一致，没有未提交的改动。所以**没有比仓库更新的代码文件，这次不另外输出代码**。

唯一不在仓库里的是 Claude 项目的 `claude/src/test/` 四个测试脚本（见第 5 节第 3 项）。这次对话改挂到别的 Claude 项目，没法读出它们的内容，所以没有附上。

这次交接包新产生的文件：

| 文件 | 内容 |
|---|---|
| `HANDOFF.md` | 本文件（新增） |
| `CLAUDE.md` | 以仓库现有的 CLAUDE.md 为基础，在前面加了：沟通方式、技术栈与版本、目录结构、编码规范与命名约定、命令、绝对不能改的部分、执行身份。原本的资料模型、写入约定、权限模型、借用逻辑、缓存、前端、清理、测试、已知限制**全部保留** |

## 7. 待确认事项汇总

1. ~~线上 `/exec` 现在有没有整批编辑和活动预告~~ ✅ 有（2026-10-16 维护者确认）。
2. ~~`.clasp.json` 的 scriptId（`1zt_L53b…`）是不是线上部署 `AKfycbysW08R…` 所属的脚本~~ ✅ 是；之前的问题出在 Claude 应用的连接（2026-10-16 维护者确认）。
3. ~~「合并同类活动」加进仓库之后有没有再推送 / 部署过~~ ✅ 已上线（2026-10-16 维护者确认）。
4. `claude/交接.md` 提到的 R-BK-17/18、R-AN-05~09 的需求内容在哪里；仓库的 `Docs/需求规格.md` 没有这些编号。
5. 本地多出来的空提交 `0c191ac`（GPG 测试）要不要 push。
6. `claude/src/test/` 的测试脚本还能不能直接跑；`test_preview_table.js` 是否涵盖「合并同类活动」。
7. clasp、Node.js、Playwright 的版本（仓库里没有记录）。
8. 10-05 之后、10-16 之前，Claude 项目以外有没有别的对话改过这个项目（这次只找到其他项目的对话）。
