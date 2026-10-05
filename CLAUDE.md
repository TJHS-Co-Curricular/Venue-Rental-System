# CLAUDE.md · 技术说明

场地借用系统的技术架构、约定与坑点。只描述**现在的设计**；改动历史见 [CHANGELOG.md](CHANGELOG.md)，业务规则见 [Docs/需求规格.md](Docs/需求规格.md)（需求编号如 `R-BK-06`），操作说明见 [README.md](README.md)。

> ⚠️ 改代码前先读「写入约定」「权限模型」两节——违反它们的改动会重新引入已经修过的严重 bug。

## 文件结构

| 文件 | 角色 |
|---|---|
| `Code.js`（线上叫 `Code.gs`） | 后端主体：路由、权限、CRUD、冲突检测、日志、缓存、公告、电视看板资料、维护工具 |
| `Cleanup.js`（线上叫 `Cleanup.gs`） | 定期清理：回收站/操作日志、过期借用月份表、触发器安装 |
| `Admin.html` | 管理端 |
| `Table.html` | 矩阵总表 + 公告栏 |
| `Viewver.html` | 日历视图（FullCalendar）。**文件名就是 `Viewver`（历史拼写）**，`PUBLIC_PAGES` 里引用的名字要一致 |
| `TVBoard.html` | 电视看板 |
| `appsscript.json` | V8、时区 Asia/Singapore、网页应用 `executeAs: USER_DEPLOYING`、`access: DOMAIN`；没有进阶服务 |
| `.clasp.json` | clasp 设定（`scriptId`），被 `.gitignore` 排除 |
| `Docs/Google Sheets 场地借用系统开发.md` | 早期开发对话记录（约 650KB）。里面有早期/其他项目的片段，**不是**现在的设计，参考时要甄别 |

`Code.gs` 与 `Cleanup.gs` 在同一个 Apps Script 项目，共享全局作用域（`Cleanup.gs` 直接用 `Code.gs` 的常量与辅助函数）。两个文件里**不能有同名的顶层 `const`**，否则整个项目载入失败。

## 部署

- 改完要把代码放进 Apps Script（`clasp push` 或编辑器贴上），再「管理部署 → 编辑原部署 → 新版本」。只存档不会影响线上 `/exec` 网址。
- `clasp push` 会删掉线上有、本地没有的文件；不要用 `clasp pull` 覆盖本地修改。
- 网页应用以部署者身份执行：所有服务（Sheets、Cache、Lock、ScriptApp）都用拥有者的权限。`Session.getActiveUser()` 才是真正的访问者。

## 资料模型

### 借用记录：每月一张工作表（表名 `yyyy-MM`）

由 `getSheetForDate_()` 在**真正写入时**建立（扫描冲突时不建表）。表头 `HEADERS`：

```
A ID          "ID_" + Utilities.getUuid()（完整 UUID）
B 场地         场地编号（《场地编号》A 栏）
C 活动
D 单位         "编号-名称"
E 时间(开始)    "HH:mm" 文字
F 时间(结束)    "HH:mm" 文字
G 填写人        留空时自动带入 "姓名 (email)"
H 填写日期      d/M/yyyy 文字，服务器决定（todayIso_）
I 使用日期      d/M/yyyy 文字
J 系统时间戳    yyyy-MM-dd HH:mm:ss；同一次提交共享同一个值 = "同批"；修改时保留
```

读取一律经过 `rowToRecordObj()`：日期统一成 `yyyy-MM-dd`（`normalizeDateToISO`），时间统一成 `HH:mm`（`cellTimeToString`，兼容已被表格转成 Date 的旧资料），并补一个组合字段 `时间`。A 栏 ID 为空的行一律跳过。

**旧结构兼容**：很早期的月份表只有单一「时间」栏。读取、冲突检测（`getRowTimeRangeMinutes`）、写入（`recordToSheetRow_` 按该表自己的表头排列栏位）、归档（`buildTrashRow_`）都兼容两种结构；`migrateAllSheetsToSplitTimeSchema()` 可以把旧表就地升级。

### 《场地编号》（固定名）

- A 栏 = 场地编号、B 栏 = 场地名称：`readVenuesFromSheet_()` **按位置**读。
- 其余按表头文字找（会去掉空格）：
  - 「单位」：下拉选项（`readUnitsFromSheet_`）；格子底色 = 单位颜色（`readUnitColorMap_`，回传**按表格顺序的数组**，不是物件——数字形态的键会被 JS 重新排序）。字母开头的编号是学会团体，`isClubUnitCode()` 判断，不进颜色表。
  - 「管理员邮箱」「管理员姓名」：`readAdminDirectory_()` → `Map<小写 email, 姓名>`。
  - 「假期设定(月)」「开始(日期)」「结束(日期)」：`readHolidaySettings_()` → `[{month, start, end}]`。表头比对兼容全形括号；数字格可能是 `"01"` 或 `1`；只填一端当单日、开始 > 结束自动对调、月份有填但日期全空跳过。超出当月天数由前端截掉。
- 【状态】栏目前**没有任何程序读取**。

### 《特殊状态》（固定名）

一张表分两区：

- **A 栏（第 2 行起）**：状态种类定义，格子底色 = 颜色。`getSpecialStatusesFromSheet()` 回传 `[{name, color}]`（没上色 `color: ''`，仍保留在清单）。
- **C 栏起**：标记记录，`SPECIAL_STATUS_RECORD_HEADERS` = ID / 场地编号 / 场地名称 / 状态名称 / 使用日期 / 填写人 / 填写日期 / 系统时间戳。B 栏空着当分隔。

⚠️ **删除标记绝对不能 `deleteRow()`**：同一行的 A 栏定义会一起被删掉。现在用 `getRange(行, 3, 1, 8).deleteCells(SpreadsheetApp.Dimension.ROWS)`。新记录接在记录区最后一笔之后（`lastSpecialStatusRecordRow_()` 看 C 栏），不是 `getLastRow()`——A 栏可能比记录还长。

### 《公告栏》（固定名）

A2 = Markdown 文字（格子设为纯文本）；B2 = 最后更新时间。B2 有两条更新路径，缺一不可：`saveAnnouncementContent()` 自己写；有人直接在表格编辑 A2 时由简易触发器 `onEdit(e)` 写（`Range.setValue()` **不会**触发 `onEdit`）。不用 Google 文档当来源：网页应用是非互动执行，文档授权被 Workspace 撤销后无法自行恢复。

### 《已删除记录(回收站)》《操作日志》

- 回收站：`[删除时间, 操作人邮箱, ...HEADERS]`，由 `buildTrashRow_()` 对齐。删除与修改（旧版本）都会写入。
- 操作日志：`AUDIT_HEADERS` = 时间 / 操作类型 / 操作人邮箱 / 记录ID / 场地 / 活动 / 单位 / 时间段。借用记录用 `buildAuditRow_()`；特殊状态与公告用 `logSpecialStatusAudit_()`（摘要放在「活动」栏）。

## 写入约定（必读）

1. **一律用 `appendRowsAsText_(sheet, rows, startCol?, startRow?)` 写入**，不要用 `appendRow()`。它先把目标格子设成 `@` 纯文本再 `setValues()`，并在需要时补行。理由：Google Sheets 会把 `"06:00"` 转成时间、把 `"5/10/2026"` 按试算表地区转成日期（美国地区日/月会对调）、把 `=` `+` `-` 开头的文字当公式（Markdown 条列会变 `#ERROR!`）。新建的月份表、回收站、特殊状态记录区整块预设为 `@`。
2. **所有改动表格的操作包在 `withScriptLock_(fn)` 里**（`LockService.getScriptLock()`，最多等 30 秒，`finally` 释放）。冲突检查在拿到锁之后做。锁**不可重入**：锁里面不要再呼叫另一个也会拿锁的公开函数。
3. 删行前呼叫 `ensureSpareRow_(sheet)`（Sheets 不允许删光所有非冻结行）；`getRange` 超出范围会报错，`appendRowsAsText_` 已用 `ensureRowCapacity_` 处理。
4. 「填写日期」由服务器 `todayIso_()` 决定，不信任浏览器。

## 权限模型

Apps Script 的**所有顶层函数**都能被浏览器用 `google.script.run.函数名()` 呼叫，访问权限是学校网域 = 全校任何登入的人。每个函数必须属于下面其中一类：

| 类别 | 规则 | 函数 |
|---|---|---|
| 页面路由 | `doGet()`：`PUBLIC_PAGES`（`view`/`table`/`tv`）直接回传；**其他任何 page 值**一律当管理端，先过 `checkAdminWhitelist_()` | `doGet` |
| 管理员写入/读取 | 第一行 `requireAdminAccess()` | `createRecord`、`updateRecord`、`batchDeleteRecords`、`createSpecialStatusEntries`、`deleteSpecialStatusEntries`、`saveAnnouncementContent`、`readRecordsForAdmin` |
| 拥有者维护 | 第一行 `requireOwner_()`（`getActiveUser() === getEffectiveUser()`，只有拥有者本人在编辑器运行才成立） | `migrateAllSheetsToSplitTimeSchema`、`fixTimeColumnFormatting`、`clearConfigCache`、`cleanupOldBookingMonthSheets`、`installMonthlyCleanupTrigger`、`uninstallMonthlyCleanupTrigger` |
| 定时触发器入口 | `isGenuineTriggerEvent_(e, 名称)` 比对 `e.triggerUid` 是项目里真实存在的触发器，否则退回 `requireOwner_()`。**函数名不能改**（已安装的触发器绑定这个名字） | `cleanupOldTrashAndAuditLogs(e)` |
| 公开读取 | 不需白名单，只读 | `getVenuesFromSheet`、`getUnitsFromSheet`、`getUnitColorMap`、`getSpecialStatusesFromSheet`、`getHolidaySettings`、`readRecordsForMonth`、`readRecordsForRange`、`readSpecialStatusForMonth`、`readSpecialStatusForRange`、`readSpecialStatusList`、`getTvBoardWeekData`、`getAnnouncementContent`、`getWebAppUrl` |
| 私有辅助 | **名字以 `_` 结尾**，`google.script.run` 呼叫不到 | 所有会写表格、建工作表、或泄漏资讯的辅助函数 |

**新增函数时**：会写入的公开函数要 `requireAdminAccess()` + `withScriptLock_()`；辅助函数名字以 `_` 结尾；纯计算、无副作用的工具函数（`formatDateStr`、`timeStrToMinutes`…）可以保持公开。

白名单（`readAdminDirectory_`）刻意**不缓存**，移除管理员要立即生效。拥有者永远在白名单内。

## 借用逻辑

- **校验**（后端为准，前端也有对应检查）：`normalizeRecordInput_()` 活动/单位不能空；`validateTimeRange_()` 时间格式正确且结束晚于开始；`expandDates_()` 展开日期（结束不能早于开始、按星期重复至少一天）；`assertWithinSubmitLimit_()` 单次 ≤ `MAX_RECORDS_PER_SUBMIT`（200）。前端超过 50 笔先 `confirm()`。
- **冲突检测**：`buildMonthConflictIndex_(monthKey)` 每个月份表读一次，建「场地|日期 → 时段」索引；`findConflictInIndex_()` 判断 `新开始 < 旧结束 且 旧开始 < 新结束`。无法解析时间的旧资料不拦截。错误讯息以 `⛔` 开头，前端 `formatOpError()` 原样显示。
- **`createRecord`**：锁内先扫完整批再写；每个月份表一次 `setValues()`；日志整批写入。回传 `{success, count}`。
- **`updateRecord(id, record, monthHint)`**：用 `locateRecords_()` 找到那一行（先找提示的月份表，只读 A 栏）；找不到就报错（不会让已删除的记录复活）；冲突检查排除自己；**原地覆写**并保留系统时间戳；换月份时才搬表；旧版本进回收站。
- **`batchDeleteRecords(ids, monthHints)`**：按表分组、由下往上删；回收站与日志整批写入。

## 缓存

`getCachedConfig_(key, producer)`：`CacheService` 脚本缓存 300 秒，用于场地、单位、单位颜色、假期、特殊状态类型（`CONFIG_CACHE_KEYS`）。空清单不缓存。`onEdit(e)` 在《场地编号》或《特殊状态》被手动编辑时清缓存；**只改格子底色不会触发 onEdit**，最多 5 分钟后生效，或拥有者运行 `clearConfigCache()`。

## 前端

共同约定：

- 表格里来的文字放进 `innerHTML` 前一律 `escapeHtml()`；**不要把资料拼进 `onclick="...('${...}')"`**（引号会弄坏按钮，`escapeHtml` 也救不了——HTML 实体会在 JS 解析前还原），改用 `createElement` + `addEventListener` 或 `data-*` 属性 + 事件委派。公告栏 Markdown 是管理员可信内容，例外。
- 每个 `google.script.run` 都要有 `withFailureHandler`，失败时关掉遮罩并显示错误。
- 颜色只接受 6 位色码（`HEX_COLOR_RE`）；单位名称比对前 `trim()`；深/浅字色门槛亮度 > 0.6。
- 假期颜色：`--holiday-tint: #fff59d`（格子）、`#fde047`（表头）、`#854d0e`（文字），三个公众页面一致。
- CDN 版本固定：Bootstrap 5.3.0、FullCalendar 6.1.8 + `@fullcalendar/core@6.1.8/locales/zh-cn.global.min.js`（v6 的 CSS 由 JS 注入，没有 `.css` 档）、marked 18.0.13（路径 `/lib/marked.umd.js`）。

### Admin.html

- 场地方块用 `venueTileRefs`（Map：场地编号 → {tile, input}）定位；楼栋分组 `getBlockGroupKey()`，「大栋」= `MAJOR_HALL_NAMES`（与 `Code.gs` 的 `TV_BOARD_VENUE_NAMES` 是同一份名单的两份拷贝，改一边要改另一边）。编辑模式 `isEditMode` 场地单选，并清掉结束日期/按星期重复。
- 勾选状态存在跨页集合 `selectedRecordIds`，不要依赖当前页面的 checkbox DOM。
- 写入经过 `beginWrite()`/`endWrite()`（`writeInFlight` 防重复提交、停用按钮）；成功用 `showToast()`；载入失败用 `showPageError(msg, retryFn)`。
- 「资料范围」`#dataRangeSelect` → `readRecordsForAdmin('recent' | 'year' | 'all')`。删除/修改会带 `monthHintsForIds()` 给后端。删除后 `afterRecordsDeleted()` 处理「正在编辑的记录被删」。
- 填写日期显示用 `localTodayIso()`（不能用 `valueAsDate = new Date()`，那是 UTC 日期）。
- 公告编辑：`announcementLoadedValue` 判断未保存修改；预览与矩阵总表都用 `marked.parse()`。

### Table.html

- 启动时等 5 个请求（`TOTAL_LOADS`）：场地、单位颜色、特殊状态类型、假期、当月记录 + 特殊状态。场地读取失败会在表格里显示错误。
- `buildRecordIndex()` / `buildSpecialStatusIndex()` 建「日期|场地」索引。点格子：`#tbodyRows` 事件委派 + `data-venue`/`data-date`。
- 每 5 分钟 `refreshMatrixSilently()`（不显示遮罩、失败不跳警告）；`monthRequestSeq` 丢弃过期月份的回应。
- 固定栏：第一栏宽度 `--sticky-col1-w`（64px），第二栏 `left` 等于它；左上角表头格 `z-index: 12`。
- 格子底色优先级：单位颜色（inline `!important`）> 特殊状态淡底（`!important`）> 假期 > 今天 > 周末。

### Viewver.html

- 函数型事件源：`readRecordsForRange` + `readSpecialStatusForRange` + 假期背景事件（`display: 'background'`，class `holiday-bg`）三者都回来才交给 FullCalendar。单位颜色等 `unitColorReady` Promise。
- `eventTimeFormat` / `slotLabelFormat` 固定 24 小时制。

### TVBoard.html

- 资料全部来自 `getTvBoardWeekData()`：本周一到周日（服务器时区）、三个场地、记录、特殊状态、单位颜色、特殊状态类型、假期。
- 事件区块用绝对定位按分钟换算像素（同场地同时段不会重叠，所以不需要并排排版）。07:00 与 22:00 标签分别 `translateY(0)` / `translateY(-100%)`，避免被裁掉。
- 特殊状态颜色用每笔的 `s.color`，写进该栏的 `--special-tint`。
- 每 5 分钟刷新（`boardRequestInFlight` 防叠加，失败保留画面并 1 分钟后重试）；每 6 小时 `safeReload()`：网络正常且 `getWebAppUrl()` 叫得到才 `location.reload()`，否则 10 分钟后再试。

## 定期清理（Cleanup.gs）

- 每月 1 号 3 点：`cleanupOldTrashAndAuditLogs(e)` → 锁内 `runScheduledCleanup_()`：
  1. 回收站/操作日志删除早于 `CLEANUP_RETENTION_MONTHS`（3）个月的行：最上面连续的一段一次 `deleteRows()`，零星的再个别删；时间解析不出的不删。
  2. `cleanupOldBookingMonthSheets_()`：年份早于 `今年 - (CLEANUP_BOOKING_RETENTION_YEARS - 1)` 的 `yyyy-MM` 表整张删除（设 2 = 保留今年 + 去年）。永久删除。
- `installMonthlyCleanupTrigger()` 会先删掉同名旧触发器，不会重复。

## 测试

仓库里没有自动化测试。改动后至少：

- `node --check Code.js Cleanup.js`；把每个 HTML 的内联 `<script>` 抽出来用 `new Function()` 检查语法。
- 后端：用 Node `vm` 建一个假的 Apps Script 环境（SpreadsheetApp / Session / Utilities / LockService / CacheService / ScriptApp），并模拟「非纯文本格子会自动转换」，才测得出写入格式问题。注意 `vm` 里的 `Date` 跟外面是不同 realm，`instanceof Date` 会失败。
- 前端：Playwright 打开本地 HTML，用 Proxy 模拟 `google.script.run`，CDN 资源改成本地档案；用 `page.clock` 测时间相关（定时刷新、早上 8 点前的日期）。

## 已知限制

- 电视看板的「今天」和红色时间线用电视本机时区。
- 电视看板固定像素版面，小屏幕需要卷动。
- 受 Apps Script 配额限制（执行时间 6 分钟、每日总量）；单次提交上限 200 笔就是为此设的。
