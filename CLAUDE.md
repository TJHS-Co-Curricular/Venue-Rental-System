# 场地借用管理系统 (Venue Rental System)

Google Apps Script + Google Sheets 场地/教室借用管理系统。Google Sheets 作为数据库，Apps Script (`Code.gs`) 作为后端，三个 `HtmlService` 页面作为前端（管理端 / 公众日历 / 公众矩阵总表）。

## 文件结构

| 文件 | 角色 | 访问路径 |
|---|---|---|
| `Code.gs` | 后端：路由、权限、CRUD、冲突检测、审计、迁移/修复工具 | — |
| `Cleanup.gs` | 独立的定期清理工具：每月自动清掉过旧的回收站/操作日志记录 | — |
| `Admin.html` | 管理端 UI（新增/编辑/删除借用记录） | `?page=admin`（默认，需白名单） |
| `Viewver.html` | 公众日历视图（FullCalendar） | `?page=view` |
| `Table.html` | 公众矩阵总表（场地 × 日期网格） | `?page=table` |
| `Google Sheets 场地借用系统开发.md` | 开发过程日志（历史记录，体量很大，不是给系统运行用的） | — |
| `.clasp.json` | `clasp` CLI 配置，用于把本地文件推送/拉取到 Apps Script 项目 | — |

> ⚠️ 文件名是 **`Viewver.html`**（不是 `Viewer.html`，是历史命名遗留的拼写），`Code.gs` 的 `doGet()` 里 `createTemplateFromFile('Viewver')` 必须跟这个文件名完全一致，改文件名时两边要一起改。

## 部署方式

这不是一个能直接跑 `clasp push` 自动生效的常规 web 项目：

1. 改完 `Code.gs` / `Admin.html` / `Table.html` / `Viewver.html` 后，需要在 **Apps Script 编辑器**里把对应文件内容整份贴上去存档（或用 `clasp push`，`.clasp.json` 已配置好）。
2. 部署 → 管理部署 → 新版本，改动才会真正生效（Apps Script 的 Web App 部署不会因为编辑器里存档就自动更新线上版本）。
3. 有些"一次性"函数（迁移/修复脚本，见下）无法通过网页触发，必须在 Apps Script 编辑器顶部的函数下拉选单里手动选中、点击「运行」执行一次（第一次运行可能需要手动授权）。

## 数据模型

### 借用记录（按月分表）

每个月一张工作表，表名固定为 `yyyy-MM`（例如 `2026-09`），由 `getSheetForDate()` 按需自动创建。表头（`HEADERS` 常量）：

```
A: ID            "ID_" + 完整 UUID (Utilities.getUuid())
B: 场地           场地编号（对应《场地编号》表的 A 列）
C: 活动           活动名称
D: 单位           借用单位（见下方"单位编号规则"）
E: 时间(开始)      "HH:mm" 纯文本
F: 时间(结束)      "HH:mm" 纯文本
G: 填写人
H: 填写日期        d/M/yyyy 格式文本（前端自动锁定为当天）
I: 使用日期        d/M/yyyy 格式文本
J: 系统时间戳      yyyy-MM-dd HH:mm:ss，同一次提交（连续多天/多场地）共享同一个值，
                  用于"同批"批量选取/删除
```

**⚠️ 时间栏位是已知的坑**：Google Sheets 只要看到写进去的文本长得像时间（如 `"06:00"`），就会自动把它转存成内部 Date/时间序列值，除非该栏位事先被设成纯文本格式。为此：
- `getSheetForDate()` / `getTrashSheet()` 建表时会对时间栏位整栏 `setNumberFormat('@')`。
- 任何读取时间栏位的地方都要经过 `cellTimeToString(val)`（在 `rowToRecordObj`、`getRowTimeRangeMinutes`、`formatRowTimeDisplay` 里已经处理），把可能是 Date 的值洗回 `"HH:mm"` 字符串，否则会显示成一大串英文 `Date.toString()`，冲突检测也会因为正则匹配不到而直接放弃比对。
- 如果发现线上数据已经被弄脏（前端显示一大串英文日期），运行一次性工具 `fixTimeColumnFormatting()` 修复既有数据。

### 旧结构兼容层

早期版本"时间"是单一组合字符串栏位，现在拆成"时间(开始)"/"时间(结束)"两栏。为了不用一次性改光所有历史月份工作表：
- `rowToRecordObj()` 会自动检测这一行是新结构还是旧结构，并统一补出一个 `obj.时间`（组合字符串），前端（`Table.html`/`Viewver.html`）完全不用关心底层是哪种结构。
- `getRowTimeRangeMinutes()` / `formatRowTimeDisplay()` / `archiveToTrash()` 同样做了新旧结构兼容判断。
- 一次性迁移工具 `migrateAllSheetsToSplitTimeSchema()` 可以把还没升级的旧月份工作表原地升级成新结构（只需要跑一次，之后新建的工作表都会自动是新结构）。

### 《场地编号》工作表（固定名）

参考表，包含：
- 场地编号、场地名称（`getVenuesFromSheet()` 读取）
- 单位列（`getUnitsFromSheet()` 读取，作为 Admin.html 单位下拉选项）
- 管理员邮箱列（`checkAdminWhitelist()` 读取，白名单校验用）
- 单位列的**格子背景色**（管理员手动上色，`getUnitColorMap()` 读取，用于矩阵总表的单位颜色区分）

### 单位编号规则（自定义业务规则）

单位名称格式统一是 `"编号-名称"`：
- **编号以数字开头**（如 `01-校长室` … `10-图书馆`）= **学校行政团体**。这类单位如果在《场地编号》表里被手动上了底色，会在矩阵总表（`Table.html`）里对应染色，并出现在"🏢 行政单位："图例里。
- **编号以字母开头**（如 `A01-摄影学会`）= **学会团体**（学生社团）。这类单位一律不参与矩阵总表的颜色/图例（`isClubUnitCode()` 判断逻辑：只要编号前缀第一个字符是字母就算学会团体，不要求后面没有数字）。

### 🚧《特殊状态》工作表（固定名，独立于一般借用记录）

用来标记场地的"维修"/"考试场地"/"不外借"之类状态，例如"这个场地这天被占用/不能借"，但**跟一般借用记录是完全独立的两回事**：不占用时间段（整天算，不选时间）、不做冲突拦截（同一场地同一天可以既有一般借用记录、也有特殊状态标记，两者互不影响），纯粹是标记 + 颜色显示用途（这是跟用户确认过的明确范围，不要自行加上"不外借时禁止提交"这种硬拦截）。

这张表刻意**一分为二**用（`getOrCreateSpecialStatusSheet()` 第一次使用时自动建立，并预先放好三个范例状态）：

- **A 列（第 2 行开始）＝"状态类型定义区"**：管理员手动列出可选的状态文字（例如"维修"、"考试场地"、"不外借"，没有固定枚举，可以像"单位"栏一样无限扩充），并且可以手动帮那一格上底色——上色逻辑跟"单位"列完全对应（`getSpecialStatusesFromSheet()`，同名取第一次出现的颜色、跳过默认白色）。新增新的状态种类，直接在这一列多打一行文字即可，不需要改代码；不上色也没关系，仍会出现在 Admin.html 的打勾清单里，只是没有专属颜色。
- **C 列开始＝"标记记录区"**（`SPECIAL_STATUS_RECORD_HEADERS`：ID/场地编号/场地名称/状态名称/使用日期/填写人/填写日期/系统时间戳）：每次管理端提交"特殊状态"，就会展开成每个场地 × 每一天 × 每个勾选状态各一行，写在这里。B 列刻意留空，纯粹当 A 列和 C 列之间的视觉分隔。
- 之所以要拆成两个区域（而不是像"单位"那样直接从一栏读色）：这张表的记录行是脚本自动 `appendRow` 写进去的，新写入的格子不会带任何背景色，没办法沿用"第一次出现的颜色"这套逻辑；所以颜色改成统一由 A 列的"定义区"决定，跟实际发生的标记记录（C 列开始）分开维护。

**核心函数**：
- `getSpecialStatusesFromSheet()`：读 A 列，回传 `[{name, color}]`，供 Admin.html 的打勾清单 + Table.html/Viewver.html 的图例共用。
- `createSpecialStatusEntries(payload)`：`payload = {venues, statusNames, useDate, endDate?, recurWeekdays?}`。日期展开逻辑（含"按星期重复"）直接复用 `createRecord()` 同一套写法，但**跳过冲突扫描**、也不需要时间栏位。可以一次勾选多个场地 × 多个状态，会展开成"场地数 × 天数 × 状态数"那么多行。
- `readSpecialStatusForRange(startDateStr, endDateStr)` / `readSpecialStatusForMonth(monthKey)`：给 Viewver.html（区间）/ Table.html（月份）用，逻辑对齐 `readRecordsForRange`/`readRecordsForMonth`，回传的 `date` 已统一转回 `yyyy-MM-dd` 方便字符串比较。
- `readSpecialStatusList()` / `deleteSpecialStatusEntries(ids)`：Admin.html 的"🚧 特殊状态记录"管理清单用，可以查看/取消（删除）已经不需要的标记（例如维修完了）。
- `logSpecialStatusAudit()`：特殊状态专用的简化版操作日志，跟 `logAudit()` 共用同一张《操作日志》表，但栏位形状对不上一般借用记录的 `HEADERS`，摘要文字直接放进"活动"那一栏。

**前端整合**：
- `Admin.html`：左侧表单里，"🔁 只在特定星期几重复借用"下方新增"🚧 特殊状态"打勾区块（`renderSpecialStatusChips()`），**共用**左侧已勾选的场地（`globalSelectedVenues`）+ 上方的使用日期/结束日期/按星期重复设置，但有自己独立的"🚧 提交特殊状态"按钮（`submitSpecialStatus()`），不会用到活动名称/借用单位/时间段栏位，也不会跟一般借用记录混在一起提交。右侧新增一张独立的"🚧 特殊状态记录"卡片（`renderSpecialStatusTable()`）可以查看/取消标记，支持勾选/全选 + "批量取消"（`toggleSelectAllSpecialStatus()`/`handleSpecialStatusRowCheckboxClick()`/`executeBatchCancelSpecialStatus()`），跟一般借用记录列表的批量删除是同一套勾选/按钮状态联动逻辑，只是确认方式改成较轻量的 `confirm()`（取消标记比物理删除借用记录风险低，不需要数字二次确认）——`deleteSpecialStatusEntries(ids)` 本来就吃 ID 数组，批量取消不需要改后端。
- `Table.html`：矩阵格子在原本的单位颜色染色之上，**叠加**一层特殊状态标记——不管这一格有没有一般借用记录，只要当天有特殊状态就用彩色内框（`box-shadow: inset`）+ 右上角 🚧 图示标出来，两者可以同时存在、互不覆盖；点击格子的明细弹窗最上方会先列出特殊状态，再列一般借用记录。图例区在"🏢 行政单位："下方新增一行"🚧 特殊状态："。
- `Viewver.html`：特殊状态标记转成 FullCalendar 的**全天事件**（`buildAllDayEventsFromSpecialStatus()`），标题格式"🚧 场地 · 状态"，颜色套用该状态的定义色（没上色则用默认琥珀色 `#f59e0b`）。日历的函数型事件源现在会**并行**呼叫 `readRecordsForRange()` 和 `readSpecialStatusForRange()`，两个都回来才一次性交给 FullCalendar 渲染，避免翻页时特殊状态还没到、画面先漏画一次。点击事件会打开同一个明细弹窗，用 `extendedProps.isSpecialStatus` 判断要不要用简化版字段（隐藏单位/精确时间，改显示"全天"）。

### 回收站 / 操作日志

- `已删除记录(回收站)`：删除前先归档整行（`archiveToTrash()`），栏位是 `[删除时间, 操作人邮箱, ...HEADERS]`。
- `操作日志`：新增/修改/删除都会记一笔（`logAudit()`），含真实操作者的 Google 账号邮箱（不是前端自由填写的"填写人"文字）。

## 权限模型

两层拦截，缺一不可：

1. **页面渲染层**（`doGet()`）：只拦 `?page=admin`。用 `Session.getActiveUser().getEmail()` 取得访问者邮箱，交给 `checkAdminWhitelist()` 比对《场地编号》表的"管理员邮箱"列；脚本拥有者（`Session.getEffectiveUser()`）永远有权限，防止误操作把自己锁死。校验失败直接在服务端拒绝渲染，返回一个提示页面。
2. **写入函数层**（`requireAdminAccess()`）：`createRecord` / `updateRecord` / `batchDeleteRecords` 内部都会先调用它。这是必须的第二道防线——否则任何人只要打开公开的日历/总表网址，在浏览器控制台直接呼叫 `google.script.run.createRecord(...)` 就能绕过页面层的白名单。

## 防呆设计（同场地同时段冲突检测）

- `findVenueTimeConflict(venueCode, dateString, timeStartStr, timeEndStr, excludeId)`：判定区间重叠用 `newStart < existingEnd && existingStart < newEnd`。
- `createRecord()` 会先对整批「日期 × 场地」组合逐一扫描一遍，全部无冲突才真正写入，避免连续多天借用横跨多天时写到一半才撞档、留下半套脏数据。
- `updateRecord()` 检查冲突时会 `excludeId` 排除自己原本那一笔。
- 冲突时抛出的错误消息以 `⛔` 开头，前端 `formatOpError()` 会原样透传（不再套用"操作失败: "前缀），用来跟其他非预期错误区分。

## 借用方式：连续多天 / 按星期重复

- **连续多天**：`useDate` + 可选的 `endDate`，`createRecord()` 会对区间内每一天都写一笔记录。
- **按星期重复**（`record.recurWeekdays`，可选，元素是 0~6，对齐 `Date.getDay()`，0=周日…6=周六）：例如"02月01日至03月01日的每个星期六"就是 `useDate=02-01, endDate=03-01, recurWeekdays=[6]`。只有传了这个字段才启用过滤，不影响原本"连续每天"的行为。若区间内一天都不符合勾选的星期几，会在写入前直接抛错，不会静默地什么都不做。
- Admin.html 对应 UI：结束日期栏位下方的"🔁 只在特定星期几重复借用"勾选框 + 周日～周六按钮组（`recurSelectedWeekdays` Set）。

## 性能优化要点

- `readRecordsForMonth(monthKey)`：矩阵总表只读当前所选月份，不是每次都拉全部历史数据。
- `readRecordsForRange(startDateStr, endDateStr)`：公众日历视图用，只读取跟给定日期区间有交集的月份工作表（FullCalendar 月视图翻页时通常会带出前后月份的补白日子，区间可能横跨 2~3 个月），读出来的行还会再按日期过滤一次，只保留真正落在区间内的。`Viewver.html` 通过 FullCalendar 内建的**函数型事件源**（`events: function(info, successCallback, failureCallback)`）调用它，每次翻页/切视图都会自动重新拉取当前可视区间的数据。
- `batchDeleteRecords()`：只删中标的那几行（从后往前 `deleteRow()`），不是整表清空重写。
- 前端（`Table.html`）用 `buildRecordIndex()` 把记录按 `日期|场地编号` 建成 `Map`，矩阵渲染时 O(1) 查表，不用每一格都重新扫描全部记录。
- UUID 用完整版（`Utilities.getUuid()`，不截断），降低长期高频使用下的撞号概率（曾评估过是否需要简化，用户决定维持完整 UUID）。

## 前端要点

### Admin.html（管理端）
- 场地用可搜索/可按栋号（编号首字母）过滤的多选方块 UI（`venue-tile`），编辑模式下强制单选（`isEditMode`），避免多选后其余场地被后端悄悄丢弃。
- 借用时间是两个独立 `<input type="time">`（24 小时制），不再是自由文本。
- "填写日期"自动锁定为当天、只读。
- "同批"按钮（`selectSameBatch`）：靠共享的"系统时间戳"一键勾选同一次提交的所有记录，方便整批删除/重建。
- 批量删除要求手动输入数量做二次确认（原生 `prompt`，防止手滑）。
- 所有拼接进 `innerHTML` 的用户输入都过 `escapeHtml()`（防 XSS）。
- "借用记录列表"分页：预设每页 8 条，`#pageSizeSelect` 可切换 8/16/32（`currentPage`/`pageSize` 状态，筛选或切换页数大小时重置回第 1 页）。
- 🛡️ **勾选状态是跨页的独立集合 `selectedRecordIds`（Set，存记录 ID），不是纯 DOM 状态**：分页上线后，`renderTable()` 每次翻页/筛选都会整个重建 `tbody`，如果勾选状态只靠 DOM 上 checkbox 的 `checked` 属性去读（例如直接 `document.querySelectorAll('.row-checkbox:checked')`），一翻页就会把还没被物理删除、只是暂时不在当前页的勾选状态弄丢——"🔗同批"如果命中的记录数超过一页，实际观察到的现象会是"只勾到当前这一页的那几笔"，看起来像是被"每页显示"笔数所左右（这正是这个坑真实发生过的 bug）。修复方式：所有会改变勾选的地方（`toggleSelectAll`/`handleRowCheckboxClick`/`selectSameBatch`）都改成读写 `selectedRecordIds`，`renderTable()` 渲染每一行 checkbox 时照这个集合决定要不要打勾，`updateBatchDeleteButtonState()`/`executeBatchDelete()` 也一律以 `selectedRecordIds.size`/`Array.from(selectedRecordIds)` 为准，不再依赖当前页面上还剩几个 DOM checkbox。`loadData()` 重新拉取数据后会把集合里已经不存在的 ID 清掉，避免残留指向已删除记录的勾选。之后如果要再加别的"批量 XX"功能，切记也要用这个集合，不要只在当前渲染出来的 checkbox 上做文章。
- "🚧 特殊状态"打勾区块 + 独立提交按钮，以及"🚧 特殊状态记录"管理清单卡片，见上方《特殊状态》工作表一节。
- 🆕 **"填写人"留空自动带姓名+email**：`<input id="filler">` 已拿掉 `required`，允许留空提交。真正的自动带入逻辑在后端 `createRecord()`/`updateRecord()`（不是前端），两个函数一开头（`requireAdminAccess()` 拿到 `operatorEmail` 之后）都会检查 `record.filler` 是不是空字符串，空的话就调用 `getCurrentUserDisplayLabel(operatorEmail)` 补上——放在后端而不是前端的原因：这样才是权威的、不能被客户端绕过，而且不用为了拿显示名多一趟 `google.script.run` 往返。`getCurrentUserDisplayLabel()` 靠 **Google People API**（`People.People.get('people/me', {personFields:'names'})`）读取当前 Google 账号自己设置的显示名，拼成 `"显示名 (email)"` 的格式（例如 `"CHONG ZHI JIE 庄智杰 (zjchong@tsunjin.edu.my)"`）；`Session.getActiveUser()` 本身只有 `getEmail()`，没有姓名可拿，所以才需要多接这个进阶服务。**这个服务是可选的**：`appsscript.json` 的 `dependencies.enabledAdvancedServices` 已经声明了 `People` v1，但光改 manifest 文本不会真的在 Cloud 项目里"启用" People API——首次部署还是要在 Apps Script 编辑器左侧「服务」点 **+**、选「Google People API」加一次（`clasp push` 不会帮你做这步）。没加这个服务、或者 API 呼叫失败（比如该账号从没设置过显示名），`getCurrentUserDisplayLabel()` 会 `catch` 住直接退回只用 email，不会让整笔提交失败——这个 fallback 已经用 Node 的 GAS 模拟环境验证过（People 全域 undefined / API 丢例外 / 正常返回 三种情况都测过）。

### Table.html（矩阵总表）
- 表格：场地为行、当月每一天为列，点击有记录的格子弹出明细 modal。
- 今天所在列高亮（`today-header`/`today-cell`），周末列/格弱高亮。
- 单位颜色：读取 `getUnitColorMap()`（**返回按表格原始顺序排列的数组，不是物件**——这是刻意的，因为 JS 物件的整数形态键名如 `"10"` 会被引擎按数字重新排序、打乱原本表格顺序，改用数组 + `Map` 才能保证图例顺序跟《场地编号》表格一致）。同一格如果涉及多个不同单位（同场地同天但时段不重叠的多笔借用），用斜向渐层同时显示每个单位的颜色。
- 顶部有一行"🏢 行政单位："图例，只列出真的有上色、且不是学会团体编号的单位。
- 🚧 特殊状态叠加显示（内框 + 右上角图示 + "🚧 特殊状态："图例行），详见上方《特殊状态》工作表一节的"前端整合"部分。

### Viewver.html（公众日历视图）
- 用 FullCalendar 渲染，时间来自兼容层拼出的 `item.时间`（组合字符串），前端自己用正则从中提取开始/结束时间转成 ISO 时间给日历用。
- 视觉设计跟 `Table.html` 共用同一套 CSS 变量（`--accent`/`--ink`/`--muted` 等），FullCalendar 的按钮/今日高亮颜色也改用同一个 `--accent`，两个公众页面看起来是同一个系统。
- 同样接了 `getUnitColorMap()`，日历事件会按行政单位底色着色（`buildEventsFromRecords()` 里设 `backgroundColor`/`borderColor`，并用 `pickReadableTextColor()` 依亮度自动挑深色/白色文字），学会团体（无颜色映射）维持默认样式；日历上方有对应的"🏢 行政单位："图例。
- 数据改用 `readRecordsForRange()`（见上方性能优化要点），不再是打开页面就读全部历史记录。
- 🚧 特殊状态标记转成全天事件叠加显示，详见上方《特殊状态》工作表一节的"前端整合"部分。

## 定期清理（Cleanup.gs）

《已删除记录(回收站)》和《操作日志》是全系统共用同一张表（不像借用记录按月分表），会随着系统长期使用无限膨胀。`Cleanup.gs` 是独立于 `Code.gs` 的文件，专门处理这件事：

- `cleanupOldTrashAndAuditLogs()`：把两张表里比"现在往前推 `CLEANUP_RETENTION_MONTHS`（目前是 3）个月"还旧的整行删掉。时间戳栏位兼容 Date 对象和文本两种存法（`parseLogTimestamp()`，思路跟 `Code.gs` 的 `cellTimeToString()` 一样），解析不出时间的行一律不清，避免误删。
- `installMonthlyCleanupTrigger()`：**一次性安装函数**，在 Apps Script 编辑器手动运行一次，会建立一个「每月 1 号凌晨自动执行 `cleanupOldTrashAndAuditLogs()`」的时间驱动触发器（重复运行不会建出重复触发器）。第一次运行会额外跳出"管理你的触发器"授权，正常允许即可。
- `uninstallMonthlyCleanupTrigger()`：不想要自动清理了，运行一次即可移除触发器。
- 改保留月数只需要改 `CLEANUP_RETENTION_MONTHS` 这个常量，不需要重新安装触发器。
- 依赖 `Code.gs` 里的 `TRASH_SHEET_NAME` / `AUDIT_SHEET_NAME` 常量——两个文件必须在同一个 Apps Script 项目里（同项目的 .gs 文件共享全局作用域）。

## 已知待办 / 可以继续深挖的方向

- `Google Sheets 场地借用系统开发.md` 体积很大（约 650KB），是长期迭代下来的完整开发日志，里面混有一些**早期/其他项目**的样式代码（例如"假期/学校假期/活动/考试"那套颜色图例，已确认与当前场地借用系统无关，`Table.html` 顶部对应的旧图例栏已被移除）——阅读时注意甄别，不要把日志里的旧片段誤当成当前系统的设计。
- 目前没有自动化测试；改动后建议至少用 `node --check` 对 `.gs`/内联 `<script>` 做语法检查，有条件时用 Playwright 对 `Table.html`/`Viewver.html` 做离线渲染截图核对（用 `google.script.run` 的 stub 模拟后端）。
