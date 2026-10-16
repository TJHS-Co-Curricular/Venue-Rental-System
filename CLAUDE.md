# CLAUDE.md · 场地借用系统（Venue-Rental-System）

循人中学联课活动处的场地借用登记与公布系统：Google Apps Script 网页应用，资料存在绑定的 Google 试算表「联课处场地系统-资料库」。

这份文件是长期规范，只写**现在的设计**和必须遵守的约定。改动历史见 [CHANGELOG.md](CHANGELOG.md)，业务规则见 [Docs/需求规格.md](Docs/需求规格.md)（需求编号如 `R-BK-06`），操作说明见 [README.md](README.md)，部署与上线检查见 [Docs/上线检查清单.md](Docs/上线检查清单.md)。2026-10-16 从 Claude 应用转到 Claude Code 时的一次性交接在 `HANDOFF.md`，处理完可以删掉。

> ⚠️ 改代码前先读「绝对不能改的部分」「写入约定」「权限模型」三节。违反它们的改动，会把已经修好的严重 bug 带回来。

## 和维护者沟通

- 一律用**简体中文**回复，用词浅白。维护者是 ZhiJie Chong，不是专职程序员：说明改了什么、要不要重新部署就好。
- 业务规则以 `Docs/需求规格.md` 为准。标「✅ 已确认」的规则，改之前先问维护者。
- 可能有别的 Claude 会话同时改这个项目：动手前先看文件的最新版本，用合并的方式改，不要整个覆盖。

## 技术栈与版本

| 项目 | 版本 / 说明 |
|---|---|
| 执行环境 | Google Apps Script，V8 runtime（`appsscript.json`：`runtimeVersion: V8`、时区 `Asia/Singapore`、`exceptionLogging: STACKDRIVER`） |
| 网页应用 | `executeAs: USER_DEPLOYING`（以部署者身份执行）、`access: DOMAIN`（只开放学校网域 tsunjin.edu.my） |
| 资料库 | Google Sheets（借用记录每月一张工作表） |
| 用到的服务 | SpreadsheetApp、HtmlService、Session、Utilities、LockService、CacheService、ScriptApp、Logger。**没有进阶服务**（People API 已移除，不要加回来） |
| 前端 | HtmlService 模板页面，原生 JS（无构建步骤、无框架） |
| CDN（版本固定） | Bootstrap 5.3.0；FullCalendar 6.1.8 + `@fullcalendar/core@6.1.8/locales/zh-cn.global.min.js`（v6 的 CSS 由 JS 注入，没有 `.css` 档）；marked 18.0.13（`/lib/marked.umd.js`）。全部来自 cdn.jsdelivr.net |
| 本地工具 | clasp（版本【待确认】）、git；测试用 Node.js + Playwright（版本【待确认】） |
| 开发机 | Windows，项目文件夹 `D:\00-Data\Documents\Github\Venue-Rental-System` |
| 仓库 | `https://github.com/TJHS-Co-Curricular/Venue-Rental-System`（分支 `main`） |

## 目录结构

```
Code.js             后端主体（线上叫 Code.gs）：路由、权限、CRUD、冲突检测、整批编辑、日志、缓存、公告、电视看板资料、维护工具
Cleanup.js          定期清理（线上叫 Cleanup.gs）：回收站/操作日志、过期借用月份表、触发器安装
Admin.html          管理端（借用记录、整批编辑、特殊状态、公告编辑）
Table.html          矩阵总表 + 右侧公告栏（自动活动预告 + 手写「其他公告」）
Viewver.html        日历视图（FullCalendar）。文件名就是 Viewver（历史拼写），不要改
TVBoard.html        电视看板（大讲堂 / 大礼堂 / 伯才堂本周时段表）
appsscript.json     Apps Script 清单
.clasp.json         clasp 设定（scriptId）。被 .gitignore 排除，新复制的项目要自己补
.gitignore          排除 .clasp.json、Claude outputs/
README.md           给管理员 / 部署者：设定、使用、常见问题
CHANGELOG.md        历次改动（最新在最上面）
CLAUDE.md           本文件
Docs/
  需求规格.md        业务规则与需求编号
  上线检查清单.md    部署、更新、上线后检查、定期维护
  Google Sheets 场地借用系统开发.md   早期开发对话记录（约 650KB）。有早期 / 其他项目的片段，不是现在的设计，参考时要甄别
```

- `Code.gs` 与 `Cleanup.gs` 在同一个 Apps Script 项目，共享全局作用域（`Cleanup.gs` 直接用 `Code.gs` 的常量和辅助函数）。两个文件里**不能有同名的顶层 `const`**，否则整个项目载入失败。
- 仓库里**没有**自动化测试。旧会话写的测试脚本放在 Claude 项目「Venue-Rental-System」的 `claude/src/test/`，没有进 git，见 `HANDOFF.md`。

## 编码规范与命名约定

- 注释、界面文字、错误讯息一律**简体中文**。给使用者看的错误讯息以 `⛔` 开头，前端 `formatOpError()` 会原样显示。
- **私有函数名字以 `_` 结尾**（`google.script.run` 呼叫不到）。会写表格、建工作表或泄漏资讯的辅助函数必须是私有的。
- 新增公开函数要先归进「权限模型」表格里的其中一类：会写入的 → 第一行 `requireAdminAccess()` + 整个包在 `withScriptLock_()`；只读公开 → 不能泄漏管理资讯；维护 → `requireOwner_()`。
- 常量全大写下划线（`MAX_RECORDS_PER_SUBMIT`、`TV_BOARD_VENUE_NAMES`）；工作表名称用常量（`TRASH_SHEET_NAME`、`SPECIAL_STATUS_SHEET_NAME`…），不要散落字面量。
- 借用记录在程序里用中文栏名当键（`r.使用日期`、`r['时间(开始)']`），跟 `HEADERS` 一致。
- 日期：前后端之间一律 `yyyy-MM-dd`；写进表格是 `dd/MM/yyyy` 文字（`formatDateStr`，日和月补 0；读取时 `normalizeDateToISO` 也兼容不补 0 的旧资料）；时间一律 `HH:mm` 文字。本地今天用 `localTodayIso()` / `todayIso_()`，不要用 `toISOString()` 或 `valueAsDate = new Date()`（UTC，马来西亚早上 8 点前会变成昨天）。
- 前端：表格资料放进 `innerHTML` 前一律 `escapeHtml()`；不要把资料拼进 `onclick="..."` 字符串，改用 `addEventListener` 或 `data-*` + 事件委派；每个 `google.script.run` 都要有 `withFailureHandler`。
- 颜色只接受 6 位色码（`HEX_COLOR_RE`）。
- 三个礼堂名单有三份拷贝，改一份要改全部：`Code.js` 的 `TV_BOARD_VENUE_NAMES`、`Admin.html` 的 `MAJOR_HALL_NAMES`、`Table.html` 的 `PREVIEW_HALL_NAMES`。
- 改完功能要同步更新：`CHANGELOG.md`（最上面加日期段落）、`README.md`（使用说明）、本文件（设计）、`Docs/需求规格.md`（新需求编号）、`Docs/上线检查清单.md`（新的检查项）。

## 命令

所有命令都在项目文件夹里执行（Windows PowerShell）：

```powershell
cd D:\00-Data\Documents\Github\Venue-Rental-System

# 第一次 / 凭证过期
clasp login                      # 要用学校账号 zjchong@tsunjin.edu.my 登入

# 语法检查（改完必做）
node --check Code.js
node --check Cleanup.js
# HTML 的内联 <script>：抽出来用 new Function() 检查（见下方「测试」）

# 推送到 Apps Script（会让线上项目变成本地文件夹的样子）
clasp push                       # 必要时加 --force
clasp deployments                # 列出部署，确认原部署 ID 在列表里

# 更新原本的部署（网址不变）
clasp deploy -i AKfycbysW08R9szQRi7xvvdto4MPPV2DsxSWnvtUr4-u2hlR8Pg4_a4q5Go4Eg4dBYkPrxilkA -d "说明"
```

- 不用命令的话：Apps Script 编辑器「部署 → 管理部署 → 选原本的部署 → ✏️ 编辑 → 版本选『**新版本**』→ 部署」。版本下拉选单默认是「当前版本」，不改就等于没部署。
- 部署后已经开着的页面要 Ctrl+F5；电视看板最晚 6 小时内会自动重新载入。
- 线上网址：`https://script.google.com/a/macros/tsunjin.edu.my/s/AKfycbysW08R9szQRi7xvvdto4MPPV2DsxSWnvtUr4-u2hlR8Pg4_a4q5Go4Eg4dBYkPrxilkA/exec`（不加参数 = 管理端；`?page=table` 矩阵总表；`?page=view` 日历；`?page=tv` 电视看板）。
- 「部署 → 测试部署」的 `/dev` 网址永远跑最新推上去的代码，可以用来分辨问题出在推送还是部署。
- 常见错误：`No credentials found` → `clasp login`；`The caller does not have permission` → 换学校账号登入，并在 https://script.google.com/home/usersettings 打开 Apps Script API；`Project settings not found` → 缺 `.clasp.json`。
- 维护函数（只有拥有者能在 Apps Script 编辑器里选函数运行）：`installMonthlyCleanupTrigger`、`uninstallMonthlyCleanupTrigger`、`clearConfigCache`、`cleanupOldBookingMonthSheets`、`fixTimeColumnFormatting`、`migrateAllSheetsToSplitTimeSchema`。

## 绝对不能改的部分

1. **不要用「新增部署」更新程序**：会产生新网址，旧网址和电视看板继续跑旧代码。一律编辑原部署（ID `AKfycbysW08R…`）。
2. **不要 `clasp pull`**：会用线上版本覆盖本地还没推上去的修改。`clasp push` 会删掉线上有、本地没有的文件。
3. **文件名不能改**：`Viewver.html`（拼法就是这样，`PUBLIC_PAGES` 引用它）；`Code` / `Cleanup` / `Admin` / `Table` / `TVBoard` 都被代码引用。
4. **函数名 `cleanupOldTrashAndAuditLogs` 不能改**：已安装的定时触发器绑定这个名字。`onEdit` 是简易触发器，整个项目只能有一个。
5. **工作表名称和表头文字不能改**：《场地编号》《特殊状态》《公告栏》《已删除记录(回收站)》《操作日志》、月份表名 `yyyy-MM`、`HEADERS` 的栏名。《场地编号》A 栏 = 场地编号、B 栏 = 场地名称是**按位置**读的。
6. **删除特殊状态不能用 `deleteRow()`**：同一行 A 栏的状态定义会一起被删掉。只能 `getRange(行, 3, 1, 8).deleteCells(ROWS)`。
7. **所有写入都用 `appendRowsAsText_()`**（先设 `@` 纯文本再写），不要用 `appendRow()` / 直接 `setValues()` 写使用者资料。
8. **所有改动表格的操作都包在 `withScriptLock_()` 里**；锁不可重入，锁里面不要再呼叫另一个会拿锁的公开函数。
9. **会写入的公开函数第一行必须是 `requireAdminAccess()`**；`doGet` 里除了 `PUBLIC_PAGES` 以外的任何 `page` 值都要过白名单。白名单（`readAdminDirectory_`）**不能加缓存**。
10. **「系统时间戳」是批次识别码**：同一次提交共享同一个值；修改、整批修改都要沿用原值；新值由 `batchStamp_()` 产生（毫秒）。不要拿它做日期计算，也不要改格式。
11. **特殊状态不能阻挡借用**（R-SS-03 ✅ 已确认）。
12. **公告来源不能改回 Google 文档**（R-AN-03 ✅ 已确认）；不要加回 People API。
13. **借用记录清理是永久删除**（保留今年 + 去年，R-CU-02 ✅ 已确认）。改 `CLEANUP_BOOKING_RETENTION_YEARS` 前先问维护者。
14. 不要提交 `.clasp.json`。CDN 保持固定版本号，不要改成 `latest` 或不带版本的网址。

## 执行身份

网页应用以部署者身份执行：所有服务（Sheets、Cache、Lock、ScriptApp）都用拥有者的权限，`Session.getEffectiveUser()` 永远是拥有者；`Session.getActiveUser()` 才是真正的访问者。所以「现在是谁」一律看 `getActiveUser()`，「是不是拥有者本人」看两者是否相同（`isOwner_()`）。

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
H 填写日期      dd/MM/yyyy 文字，服务器决定（todayIso_）
I 使用日期      dd/MM/yyyy 文字
J 系统时间戳    同一次提交共享同一个值 = "同批"；修改时保留。新资料由 batchStamp_() 产生
               "yyyy-MM-dd HH:mm:ss.SSS"（精确到毫秒，避免同一秒的两次提交被当成同一批）；
               旧资料只到秒，照样可用。它是批次的识别码，不要拿来做日期计算
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
| 管理员写入/读取 | 第一行 `requireAdminAccess()` | `createRecord`、`updateRecord`、`updateBatch`、`batchDeleteRecords`、`createSpecialStatusEntries`、`deleteSpecialStatusEntries`、`saveAnnouncementContent`、`readRecordsForAdmin`、`readBatch` |
| 拥有者维护 | 第一行 `requireOwner_()`（`getActiveUser() === getEffectiveUser()`，只有拥有者本人在编辑器运行才成立） | `migrateAllSheetsToSplitTimeSchema`、`fixTimeColumnFormatting`、`clearConfigCache`、`cleanupOldBookingMonthSheets`、`installMonthlyCleanupTrigger`、`uninstallMonthlyCleanupTrigger` |
| 定时触发器入口 | `isGenuineTriggerEvent_(e, 名称)` 比对 `e.triggerUid` 是项目里真实存在的触发器，否则退回 `requireOwner_()`。**函数名不能改**（已安装的触发器绑定这个名字） | `cleanupOldTrashAndAuditLogs(e)` |
| 公开读取 | 不需白名单，只读 | `getVenuesFromSheet`、`getUnitsFromSheet`、`getUnitColorMap`、`getSpecialStatusesFromSheet`、`getHolidaySettings`、`readRecordsForMonth`、`readRecordsForRange`、`readSpecialStatusForMonth`、`readSpecialStatusForRange`、`readSpecialStatusList`、`getTvBoardWeekData`、`getAnnouncementContent`、`getWebAppUrl` |
| 公开但无害（历史原因没加 `_`） | 浏览器叫得到，但不会写入或泄漏管理资讯 | `requireAdminAccess`（只回传访问者自己的 email，不是管理员就报错）、`onEdit`（简易触发器；从浏览器呼叫时传不进真正的表格范围，会被 `try/catch` 安静跳过） |
| 私有辅助 | **名字以 `_` 结尾**，`google.script.run` 呼叫不到 | 所有会写表格、建工作表、或泄漏资讯的辅助函数 |

**新增函数时**：会写入的公开函数要 `requireAdminAccess()` + `withScriptLock_()`；辅助函数名字以 `_` 结尾；纯计算、无副作用的工具函数（`formatDateStr`、`timeStrToMinutes`…）可以保持公开。

白名单（`readAdminDirectory_`）刻意**不缓存**，移除管理员要立即生效。拥有者永远在白名单内。

## 借用逻辑

- **校验**（后端为准，前端也有对应检查）：`normalizeRecordInput_()` 活动/单位不能空；`validateTimeRange_()` 时间格式正确且结束晚于开始；`expandDates_()` 展开日期（结束不能早于开始、按星期重复至少一天）；`assertWithinSubmitLimit_()` 单次 ≤ `MAX_RECORDS_PER_SUBMIT`（200）。前端超过 50 笔先 `confirm()`。
- **冲突检测**：`buildMonthConflictIndex_(monthKey)` 每个月份表读一次，建「场地|日期 → 时段」索引；`findConflictInIndex_()` 判断 `新开始 < 旧结束 且 旧开始 < 新结束`。无法解析时间的旧资料不拦截。错误讯息以 `⛔` 开头，前端 `formatOpError()` 原样显示。
- **`createRecord`**：锁内先扫完整批再写；每个月份表一次 `setValues()`；日志整批写入。回传 `{success, count}`。
- **`updateRecord(id, record, monthHint)`**：用 `locateRecords_()` 找到那一行（先找提示的月份表，只读 A 栏）；找不到就报错（不会让已删除的记录复活）；冲突检查排除自己；**原地覆写**并保留系统时间戳；换月份时才搬表；旧版本进回收站。
- **`batchDeleteRecords(ids, monthHints)`**：按表分组、由下往上删；回收站与日志整批写入。
- **整批编辑**：`readBatch(timestamp)` 用 `findBatchRows_()` 扫描**所有**月份表找同一个系统时间戳的记录（整批可能超出管理端的资料范围，所以不靠前端的 `rawData`）。`updateBatch(timestamp, expectedIds, record)` 在锁内：
  1. 重新找出整批，跟 `expectedIds` 比对；不一样（有人改过/删过）就拒绝。
  2. 依新设定展开「日期 × 场地」，冲突检查排除整批旧 ID（`findConflictInIndex_` 的 `excludeId` 可以传 `Set`）。
  3. **先写新记录**（沿用原本的系统时间戳），**再删旧记录**：新记录都写在各表最下面，不会改变旧记录的行号；中途失败最多多出重复，不会丢资料。旧记录进回收站，日志动作为「整批修改」/「整批修改(旧)」。

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

- 场地方块用 `venueTileRefs`（Map：场地编号 → {tile, input}）定位；楼栋分组 `getBlockGroupKey()`，「大栋」= `MAJOR_HALL_NAMES`（与 `Code.gs` 的 `TV_BOARD_VENUE_NAMES`、`Table.html` 的 `PREVIEW_HALL_NAMES` 是同一份名单，改一份要改全部）。编辑模式 `isEditMode` 场地单选，并清掉结束日期/按星期重复。
- 勾选状态存在跨页集合 `selectedRecordIds`，不要依赖当前页面的 checkbox DOM。
- 写入经过 `beginWrite()`/`endWrite()`（`writeInFlight` 防重复提交、停用按钮）；成功用 `showToast()`；载入失败用 `showPageError(msg, retryFn)`。
- 整批编辑：`batchEdit = {timestamp, ids}`；`startBatchEdit()` 呼叫 `readBatch`，`fillBatchEditForm()` 把整批带进表单（场地可多选、显示结束日期/按星期重复），`inferBatchDatePattern()` 从实际日期推回"每天"或"固定星期几"；日期或"日期 × 场地"不完整时在 `#batchEditNote` 提醒会补回来。`resetForm()`、`editRow()` 会呼叫 `exitBatchEditMode()`。
- 「资料范围」`#dataRangeSelect` → `readRecordsForAdmin('recent' | 'year' | 'all')`。删除/修改会带 `monthHintsForIds()` 给后端。删除后 `afterRecordsDeleted()` 处理「正在编辑的记录被删」。
- 填写日期显示用 `localTodayIso()`（不能用 `valueAsDate = new Date()`，那是 UTC 日期）。
- 公告编辑：`announcementLoadedValue` 判断未保存修改；预览与矩阵总表都用 `marked.parse()`。编辑区只管「其他公告」，活动预告是矩阵总表自动生成的。

### Table.html

- 启动时等 5 个请求（`TOTAL_LOADS`）：场地、单位颜色、特殊状态类型、假期、当月记录 + 特殊状态。场地读取失败会在表格里显示错误。
- `buildRecordIndex()` / `buildSpecialStatusIndex()` 建「日期|场地」索引。点格子：`#tbodyRows` 事件委派 + `data-venue`/`data-date`。
- 每 5 分钟 `refreshMatrixSilently()`（不显示遮罩、失败不跳警告）；`monthRequestSeq` 丢弃过期月份的回应。
- 固定栏：第一栏宽度 `--sticky-col1-w`（64px），第二栏 `left` 等于它；左上角表头格 `z-index: 12`。
- 格子底色优先级：单位颜色（inline `!important`）> 特殊状态淡底（`!important`）> 假期 > 今天 > 周末。
- **公告栏 = 活动预告 + 手写公告**：
  - 活动预告 `renderEventPreview()` 纯前端生成，资料就是矩阵用的 `bookingRecords` / `specialStatusList`（不另外呼叫后端）。在 `renderMatrix()` 开头呼叫（所以切月份、5 分钟刷新都会跟着更新），场地载入失败的路径也会呼叫。
  - **同类合并**：同礼堂 + 同活动 + 同单位（特殊状态：同礼堂 + 同状态）合并成一项，`formatDateRanges()` 把日期写成 `dd/MM/yyyy-dd/MM/yyyy`（连续段用「、」分开，超过 3 段写首尾 + 共几天）；日期范围相同的项目共用一个标题。时间不同的会列出所有时段。点开明细用的 `data-date`：今天 > 接下来第一天 > 第一天。
  - 礼堂判断 `resolvePreviewHall()`：先用 `staticVenues` 把记录的场地对回场地，再看编号或名称是否包含 `PREVIEW_HALL_NAMES` 之一。**这份名单共有三份拷贝**：`Code.gs` 的 `TV_BOARD_VENUE_NAMES`、`Admin.html` 的 `MAJOR_HALL_NAMES`、`Table.html` 的 `PREVIEW_HALL_NAMES`，改一份要改全部。
  - 点预告项目走 `showBookingModal(data-venue, data-date)`，`data-venue` 必须是 `recordIndex` 用的场地编号。
  - 自动卷到今天：`previewScrolledMonth` 记录已卷过的月份，每个月只卷一次；`.announcement-panel` 是 `position: relative`（`offsetTop` 的基准），标题列 sticky。
  - 手写公告在 `#manualAnnouncementSection`，没设置或空白时加 `d-none`；读取失败时如果之前已有内容就保留不覆盖。

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

仓库里没有自动化测试（旧会话的测试脚本见 `HANDOFF.md`，拿到后建议放进 `tests/`，并把写死的 `/home/claude/...` 路径改掉）。改动后至少：

- `node --check Code.js Cleanup.js`；把每个 HTML 的内联 `<script>` 抽出来用 `new Function()` 检查语法。
- 后端：用 Node `vm` 建一个假的 Apps Script 环境（SpreadsheetApp / Session / Utilities / LockService / CacheService / ScriptApp），并模拟「非纯文本格子会自动转换」，才测得出写入格式问题。注意 `vm` 里的 `Date` 跟外面是不同 realm，`instanceof Date` 会失败。
- 前端：Playwright 打开本地 HTML，用 Proxy 模拟 `google.script.run`，CDN 资源改成本地档案；用 `page.clock` 测时间相关（定时刷新、早上 8 点前的日期）。

## 已知限制

- 电视看板的「今天」和红色时间线用电视本机时区。
- 电视看板固定像素版面，小屏幕需要卷动。
- 受 Apps Script 配额限制（执行时间 6 分钟、每日总量）；单次提交上限 200 笔就是为此设的。
