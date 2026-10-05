/**
 * ====================================================================
 * 🏢 场地借用管理系统 - 后端核心脚本 (Code.gs)  [谷歌账户白名单拦截版]
 * ====================================================================
 */

// 🌐 公众页面（不需要登入白名单）：page 参数 → 模板文件名 + 网页标题
const PUBLIC_PAGES = {
  // 🔧 文件名同步：Apps Script 里的日历浏览页面文件名是 "Viewver"（历史拼写），两边要一致
  view: { file: "Viewver", title: "场地借用日历 (浏览模式)" },
  table: { file: "Table", title: "场地借用总表 (矩阵视图)" },
  // 📺 电视看板：大讲堂/大礼堂/伯才堂 专用周视图，给挂在墙上的电视/显示器用
  tv: { file: "TVBoard", title: "场地借用电视看板" },
};

function doGet(e) {
  const page = e && e.parameter && e.parameter.page ? String(e.parameter.page) : "admin";

  const publicPage = PUBLIC_PAGES[page];
  if (publicPage) {
    return HtmlService.createTemplateFromFile(publicPage.file)
      .evaluate()
      .setTitle(publicPage.title)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // 🛡️ 核心安全卡点：除了上面三个公众页面，其余任何 page 值（admin、空白、打错字的
  // 随便什么）一律当成管理端处理，必须先过白名单。以前只有 page === "admin" 才检查，
  // 结果 ?page=xxx 这种网址会跳过白名单直接显示管理端画面。
  const userEmail = Session.getActiveUser().getEmail();
  if (!checkAdminWhitelist_(userEmail)) {
    return HtmlService.createHtmlOutput(
      "<div style='text-align:center; padding-top:60px; font-family:\"Segoe UI\",Arial,sans-serif; color:#333;'>" +
        "<h2 style='color:#c00000; font-weight:bold;'>🔒 访问被拒绝 (Unauthorized Access)</h2>" +
        "<p style='margin-top:20px; font-size:15px;'>您的谷歌账户：<b style='color:#0056b3;'>" +
        escapeHtmlServer_(userEmail || "无法获取/未登录") +
        "</b> 不在合法的管理员白名单中。</p>" +
        "<p style='color:#666; font-size:13px; margin-top:30px;'>※ 若您拥有管理权限，请联系系统创建者在《场地编号》工作表的【管理员邮箱】列中追加您的账号。</p>" +
        "</div>",
    )
      .setTitle("拒绝访问")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  return HtmlService.createTemplateFromFile("Admin")
    .evaluate()
    .setTitle("场地借用管理系统")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function escapeHtmlServer_(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ====================================================================
// 👥 管理员名单（《场地编号》表的【管理员邮箱】【管理员姓名】两列）
// ====================================================================
// 回传 Map<小写 email, 姓名>。【管理员姓名】这一列是可选的：没有这一列、或某一行
// 没填姓名，该管理员还是在白名单里，只是自动带入「填写人」时只会显示 email。
// ⚠️ 白名单刻意不做缓存（CacheService）——把某人从名单移除要立刻生效。
function readAdminDirectory_() {
  const directory = new Map();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("场地编号");
  if (!sheet) return directory;
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return directory;
  const headers = data[0].map((h) => String(h || "").replace(/\s+/g, ""));
  const emailIndex = headers.indexOf("管理员邮箱");
  const nameIndex = headers.indexOf("管理员姓名");
  if (emailIndex === -1) return directory;
  for (let i = 1; i < data.length; i++) {
    const email = String(data[i][emailIndex] || "").toLowerCase().trim();
    if (!email) continue;
    const name = nameIndex > -1 ? String(data[i][nameIndex] || "").trim() : "";
    if (!directory.has(email) || (!directory.get(email) && name)) {
      directory.set(email, name);
    }
  }
  return directory;
}

/**
 * 🔑 白名单比对：脚本拥有者永远有权限（防止误操作把自己锁死），
 * 其他人必须出现在《场地编号》表的【管理员邮箱】列。
 */
function checkAdminWhitelist_(email) {
  if (!email) return false;
  email = String(email).toLowerCase().trim();
  try {
    const ownerEmail = String(Session.getEffectiveUser().getEmail() || "")
      .toLowerCase()
      .trim();
    if (ownerEmail && email === ownerEmail) return true;
    return readAdminDirectory_().has(email);
  } catch (err) {
    console.error("白名单读取失败: " + err.message);
    return false; // 默认没有登记的账号一律拒绝
  }
}

function getWebAppUrl() {
  try {
    return ScriptApp.getService().getUrl();
  } catch (e) {
    return "";
  }
}

/**
 * 🛡️ 安全拦截：写入类操作（新增/修改/删除）必须调用这个函数做二次校验。
 * 所有顶层函数都能被浏览器的 google.script.run 直接呼叫，页面层的白名单挡不住
 * 有人在控制台直接呼叫 createRecord(...)，所以校验必须钉在写入函数本身。
 */
function requireAdminAccess() {
  const email = Session.getActiveUser().getEmail();
  if (!checkAdminWhitelist_(email)) {
    throw new Error(
      "⛔ 权限不足：您的账号（" +
        (email || "未登录/无法获取") +
        "）不在管理员白名单中，无法执行此操作。",
    );
  }
  return email;
}

// 🔐 只有脚本拥有者本人（在 Apps Script 编辑器里手动运行）才能执行的维护函数用这个检查。
// 网页应用是"以部署者身份执行"，所以 getEffectiveUser() 永远是拥有者；只有拥有者
// 本人操作时，getActiveUser() 才会跟它是同一个人。
function isOwner_() {
  try {
    const active = String(Session.getActiveUser().getEmail() || "").toLowerCase().trim();
    const owner = String(Session.getEffectiveUser().getEmail() || "").toLowerCase().trim();
    return !!active && active === owner;
  } catch (err) {
    return false;
  }
}

function requireOwner_() {
  if (!isOwner_()) {
    throw new Error("⛔ 这个维护功能只能由系统拥有者在 Apps Script 编辑器里手动运行。");
  }
}

// 🔒 写入锁：所有会改动表格的操作都包在这里面，同一时间只让一个人写。
// 避免两位管理员同时借同一时段都通过冲突检查、或同时删除时行号错位删错行。
const LOCK_WAIT_MS = 30000;
function withScriptLock_(fn) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(LOCK_WAIT_MS);
  } catch (e) {
    throw new Error("⛔ 系统正忙（有其他管理员正在写入资料），请稍等几秒再试一次。");
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ⚡ 设定类资料（场地、单位颜色、假期、特殊状态类型）的缓存：这些资料每个公众页面、
// 电视看板每次刷新都要读，但很少变动。直接编辑《场地编号》/《特殊状态》表的文字时，
// onEdit(e) 会立刻清掉缓存；只改格子底色不会触发 onEdit，最多 CONFIG_CACHE_SECONDS 秒后生效。
const CONFIG_CACHE_SECONDS = 300;
const CONFIG_CACHE_KEYS = [
  "cfg:venues",
  "cfg:units",
  "cfg:unitColors",
  "cfg:holidays",
  "cfg:specialTypes",
];

function getCachedConfig_(key, producer) {
  let cache = null;
  try {
    cache = CacheService.getScriptCache();
    const hit = cache.get(key);
    if (hit) return JSON.parse(hit);
  } catch (e) {
    cache = null; // 缓存服务暂时不可用就直接读表，不影响功能
  }
  const value = producer();
  // 空清单不缓存：可能只是暂时读取失败，下次再读一次就好（空的设定本来读起来也很快）
  if (cache && !(Array.isArray(value) && value.length === 0)) {
    try {
      cache.put(key, JSON.stringify(value), CONFIG_CACHE_SECONDS);
    } catch (e) {
      // 超过单笔缓存大小上限之类的情况，忽略即可
    }
  }
  return value;
}

function clearConfigCache_() {
  try {
    CacheService.getScriptCache().removeAll(CONFIG_CACHE_KEYS);
  } catch (e) {
    // ignore
  }
}

/**
 * 🔧【维护工具】手动清除设定缓存：改了单位/特殊状态的格子底色想立刻看到效果时，
 * 在 Apps Script 编辑器选这个函数运行一次即可（不清也会在 5 分钟内自动更新）。
 */
function clearConfigCache() {
  requireOwner_();
  clearConfigCache_();
  return "✅ 已清除设定缓存，下次打开页面会读取最新的表格设定。";
}

// 📝 把多行资料一次写到工作表最后面，并且先把这些格子设成纯文本格式——
// 防止 Google Sheets 把 "08:00"、"5/10/2026" 自动转成日期，或把 "=..."、"-..."、"+..."
// 开头的文字当成公式解析。startCol 是 1-index 的起始栏位。
function appendRowsAsText_(sheet, rows, startCol, startRow) {
  if (!rows || rows.length === 0) return;
  const col = startCol || 1;
  const row = startRow || sheet.getLastRow() + 1;
  ensureRowCapacity_(sheet, row + rows.length - 1);
  sheet
    .getRange(row, col, rows.length, rows[0].length)
    .setNumberFormat("@")
    .setValues(rows.map((r) => r.map((v) => (v === null || v === undefined ? "" : String(v)))));
}

// 工作表总行数不够时先补行（getRange 超出工作表范围会直接报错，不像 appendRow 会自动长大）
function ensureRowCapacity_(sheet, neededLastRow) {
  const maxRows = sheet.getMaxRows();
  if (neededLastRow > maxRows) {
    sheet.insertRowsAfter(maxRows, neededLastRow - maxRows);
  }
}

// Google Sheets 不允许删掉"所有非冻结行"，删行前确保最后至少多一行空白行
function ensureSpareRow_(sheet) {
  if (sheet.getMaxRows() <= sheet.getLastRow()) {
    sheet.insertRowsAfter(sheet.getMaxRows(), 1);
  }
}

// 「填写人」留空时自动带入：《场地编号》表【管理员姓名】有填就显示"姓名 (email)"，
// 没填就只显示 email。
// ⚠️ 以前是用 People API 读 "people/me"，但网页应用是"以部署者身份执行"，"me" 永远是
// 拥有者本人——结果其他管理员留空时，全部被填成拥有者的名字。改成查管理员名单后就没这个问题，
// 也不再需要 People API 这个进阶服务。
function getCurrentUserDisplayLabel_(operatorEmail) {
  const email = String(operatorEmail || Session.getActiveUser().getEmail() || "").trim();
  if (!email) return "未知使用者";
  try {
    const name = readAdminDirectory_().get(email.toLowerCase());
    if (name) return `${name} (${email})`;
  } catch (e) {
    // 读不到名单就退回只用 email
  }
  return email;
}

// 今天（脚本时区）的 "yyyy-MM-dd"：填写日期一律由服务器决定，不信任浏览器传来的日期
// （浏览器时区设定错误、或早上 8 点前 UTC 日期还是昨天，都会导致填写日期错一天）
function todayIso_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
}

// 🆕 存储结构升级：原本「时间」是一个组合字符串栏位，现在拆成「时间(开始)」/「时间(结束)」两个独立栏位
const HEADERS = [
  "ID",
  "场地",
  "活动",
  "单位",
  "时间(开始)",
  "时间(结束)",
  "填写人",
  "填写日期",
  "使用日期",
  "系统时间戳",
];
const TRASH_SHEET_NAME = "已删除记录(回收站)";
const AUDIT_SHEET_NAME = "操作日志";

// 🚧 场地"特殊状态"（例如"维修"/"考试场地"/"不外借"）：跟一般借用记录是完全独立的两回事——
// 不占用时间段、不做冲突拦截，纯粹是"某场地在某天被标记成某种状态"，专门存在《特殊状态》这张表里。
// 这张表一分为二用：
//   A 列（从第 2 行开始）＝"状态类型定义区"：管理员手动列出可选的状态文字，并且可以手动
//     帮那一格上底色——上色的逻辑跟"单位"列一模一样（getUnitColorMap() 那一套），色码就是
//     图例/矩阵总表/日历显示时用的颜色。新增新的状态种类，直接在这一列多打一行文字即可，
//     不需要改代码。
//   C 列开始＝"标记记录区"：每次管理端提交"特殊状态"，就会在这里新增一行，记录是哪个场地、
//     哪个状态、哪一天。C/D 两列刻意留了 B 列当视觉分隔，不会互相干扰。
const SPECIAL_STATUS_SHEET_NAME = "特殊状态";
const SPECIAL_STATUS_TYPE_HEADER =
  "状态类型（在这列手动列出，格子手动上色＝图例颜色）";
const SPECIAL_STATUS_RECORD_START_COL = 3; // C 列开始放"标记记录"，跟 A 列的"状态类型定义"隔开（B 列留空当分隔）
const SPECIAL_STATUS_RECORD_HEADERS = [
  "ID",
  "场地编号",
  "场地名称",
  "状态名称",
  "使用日期",
  "填写人",
  "填写日期",
  "系统时间戳",
];

// ====================================================================
// 📅 提交前的共用校验 / 日期展开（一般借用记录、特殊状态共用）
// ====================================================================
// 单次提交最多会产生几笔记录。打错年份（例如结束日期打成明年）会一口气展开成几百笔，
// 很容易超过 Apps Script 6 分钟的执行上限、写到一半中断，所以直接挡下来。
const MAX_RECORDS_PER_SUBMIT = 200;

function parseIsoDate_(str, label) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || "").trim());
  if (!m) throw new Error(`⛔ ${label}格式不正确，请重新选择日期。`);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getMonth() !== Number(m[2]) - 1) throw new Error(`⛔ ${label}不是有效的日期。`);
  return d;
}

// 借用时间必须是 "HH:mm"，而且结束要晚于开始。以前结束早于开始（例如 14:00–13:00）
// 会被直接存进去、还会跳过冲突检测，之后同时段的借用也拦不住。
function validateTimeRange_(timeStart, timeEnd) {
  const s = timeStrToMinutes(timeStart);
  const e = timeStrToMinutes(timeEnd);
  if (s === null || e === null) {
    throw new Error("⛔ 借用时间格式不正确，请重新选择开始与结束时间。");
  }
  if (e <= s) {
    throw new Error(
      `⛔ 结束时间（${timeEnd}）必须晚于开始时间（${timeStart}）。如果活动跨过午夜，请拆成两笔提交。`,
    );
  }
  return { start: s, end: e };
}

// 把「开始日期 + 可选结束日期 + 可选按星期重复」展开成实际要写入的日期清单（"yyyy-MM-dd"）
function expandDates_(useDate, endDateStr, recurWeekdays) {
  const startDate = parseIsoDate_(useDate, "使用日期");
  const endDate = endDateStr ? parseIsoDate_(endDateStr, "结束日期") : startDate;
  if (endDate < startDate) {
    throw new Error("⛔ 结束日期不能早于开始日期，请检查日期设置。");
  }
  const recurSet =
    recurWeekdays && recurWeekdays.length > 0 ? new Set(recurWeekdays.map(Number)) : null;
  const tz = Session.getScriptTimeZone();
  const dates = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    if (!recurSet || recurSet.has(current.getDay())) {
      dates.push(Utilities.formatDate(current, tz, "yyyy-MM-dd"));
    }
    current.setDate(current.getDate() + 1);
    if (dates.length > 1000) break; // 防呆：不可能合理的超长范围，后面的上限检查会挡下
  }
  if (dates.length === 0) {
    throw new Error(
      recurSet
        ? "⛔ 所选的日期区间内，找不到任何一天符合勾选的星期几，请检查日期范围或星期几设置。"
        : "⛔ 没有产生任何要写入的日期，请检查日期设置。",
    );
  }
  return dates;
}

function assertWithinSubmitLimit_(count) {
  if (count > MAX_RECORDS_PER_SUBMIT) {
    throw new Error(
      `⛔ 这次提交会产生 ${count} 笔记录，超过单次上限 ${MAX_RECORDS_PER_SUBMIT} 笔。请检查日期范围是否打错，或分批提交。`,
    );
  }
}

function uniqueNonEmpty_(list) {
  const seen = new Set();
  const out = [];
  (list || []).forEach((v) => {
    const t = String(v == null ? "" : v).trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  });
  return out;
}

// 取得《特殊状态》工作表，第一次使用时自动建立（含表头样式、范例状态、纯文本格式防呆）
function getOrCreateSpecialStatusSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SPECIAL_STATUS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SPECIAL_STATUS_SHEET_NAME);
    sheet.getRange(1, 1).setValue(SPECIAL_STATUS_TYPE_HEADER);
    sheet
      .getRange(1, SPECIAL_STATUS_RECORD_START_COL, 1, SPECIAL_STATUS_RECORD_HEADERS.length)
      .setValues([SPECIAL_STATUS_RECORD_HEADERS]);
    sheet.setFrozenRows(1);
    sheet
      .getRange(1, 1, 1, SPECIAL_STATUS_RECORD_START_COL + SPECIAL_STATUS_RECORD_HEADERS.length - 1)
      .setFontWeight("bold");
    sheet.setColumnWidth(1, 260);
    // 🔧 标记记录区整块设成纯文本，防止日期被自动转成 Date
    sheet
      .getRange(2, SPECIAL_STATUS_RECORD_START_COL, sheet.getMaxRows() - 1, SPECIAL_STATUS_RECORD_HEADERS.length)
      .setNumberFormat("@");
    // 预先放几个常见范例，方便管理员上手（可以直接改文字/改颜色/删掉/新增更多行）
    sheet.getRange(2, 1, 3, 1).setValues([["维修"], ["考试场地"], ["不外借"]]);
  }
  return sheet;
}

// 读取"标记记录区"（C 列开始）的所有资料行。回传 { data, firstRow }，data 只包含
// 实际有内容的范围。注意：A 列的状态类型定义可能比记录还多行，所以 getLastRow()
// 不代表记录区的最后一行，判断记录用 ID 栏是否有值。
function readSpecialStatusRecordBlock_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { data: [], firstRow: 2 };
  const data = sheet
    .getRange(2, SPECIAL_STATUS_RECORD_START_COL, lastRow - 1, SPECIAL_STATUS_RECORD_HEADERS.length)
    .getValues();
  return { data: data, firstRow: 2 };
}

// 记录区（C 列 ID 栏）最后一个有值的行号；没有任何记录时回传 1（表头）
function lastSpecialStatusRecordRow_(sheet) {
  const block = readSpecialStatusRecordBlock_(sheet);
  const idIdx = SPECIAL_STATUS_RECORD_HEADERS.indexOf("ID");
  for (let i = block.data.length - 1; i >= 0; i--) {
    if (String(block.data[i][idIdx] || "").trim()) return block.firstRow + i;
  }
  return 1;
}

// 🎨 读取 A 列的"状态类型定义"，逻辑跟 getUnitColorMap() 完全对应：按表格原始顺序、
// 同名只取第一次出现的颜色、跳过默认白色/没上色的格子（回传空字串，前端会给预设样式）。
// 跟 getUnitColorMap() 不同的地方：这里"没上色"的状态名称也要保留在清单里（回传 color:''），
// 因为 Admin.html 的打勾清单需要显示所有可选状态，颜色只是拿来做图例/矩阵染色用。
function getSpecialStatusesFromSheet() {
  try {
    return getCachedConfig_("cfg:specialTypes", () => {
      const sheet = getOrCreateSpecialStatusSheet_();
      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) return [];
      const range = sheet.getRange(2, 1, lastRow - 1, 1);
      const values = range.getValues();
      const backgrounds = range.getBackgrounds();
      const seen = new Set();
      const list = [];
      for (let i = 0; i < values.length; i++) {
        const name = String(values[i][0] || "").trim();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        const color = String(backgrounds[i][0] || "").toLowerCase();
        list.push({ name: name, color: !color || color === "#ffffff" ? "" : color });
      }
      return list;
    });
  } catch (err) {
    return [];
  }
}

// 🚧 新增特殊状态标记：跟 createRecord() 共用同一套「日期区间 + 可选按星期重复」的日期展开逻辑，
// 但完全不检查场地时段冲突（特殊状态本来就跟一般借用记录彼此独立，可以同时存在），
// 也不需要时间段——一整天算。可以一次勾选多个场地 × 多个状态，会展开成每个场地/每天/每个
// 状态各一行。
function createSpecialStatusEntries(payload) {
  const operatorEmail = requireAdminAccess(); // 🛡️ 写入前强制校验管理员白名单
  if (!payload) throw new Error("⛔ 没有收到要提交的资料。");
  const venues = uniqueNonEmpty_(payload.venues);
  const statusNames = uniqueNonEmpty_(payload.statusNames);
  if (venues.length === 0) throw new Error("⛔ 请至少勾选一个场地。");
  if (statusNames.length === 0) throw new Error("⛔ 请至少勾选一个特殊状态。");
  if (!payload.useDate) throw new Error("⛔ 请选择日期。");

  const dates = expandDates_(payload.useDate, payload.endDate, payload.recurWeekdays);
  assertWithinSubmitLimit_(dates.length * venues.length * statusNames.length);

  // 场地编号 -> 场地名称 对照表，标记记录里直接存场地名称，方便之后不用每次都反查《场地编号》
  const venueNameMap = {};
  getVenuesFromSheet().forEach((v) => {
    venueNameMap[v.code] = v.name;
  });

  return withScriptLock_(() => {
    const sheet = getOrCreateSpecialStatusSheet_();
    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
    const formattedFillDate = formatDateStr(todayIso_());

    const rowsToAppend = [];
    dates.forEach((dateString) => {
      const formattedUseDate = formatDateStr(dateString);
      venues.forEach((venueCode) => {
        statusNames.forEach((statusName) => {
          rowsToAppend.push([
            "SS_" + Utilities.getUuid(),
            venueCode,
            venueNameMap[venueCode] || "",
            statusName,
            formattedUseDate,
            operatorEmail,
            formattedFillDate,
            timestamp,
          ]);
        });
      });
    });

    // 接在"记录区"最后一笔后面写（不是整张表的最后一行——A 列的状态类型可能比记录还长）
    appendRowsAsText_(
      sheet,
      rowsToAppend,
      SPECIAL_STATUS_RECORD_START_COL,
      lastSpecialStatusRecordRow_(sheet) + 1,
    );

    const summary = `新增特殊状态：${venues.join("、")} 设为「${statusNames.join("、")}」，共 ${rowsToAppend.length} 笔`;
    logSpecialStatusAudit_("新增特殊状态", operatorEmail, summary);
    return { success: true, count: rowsToAppend.length };
  });
}

// 读取某个日期区间内的特殊状态标记（Table.html/Viewver.html 用，逻辑对齐 readRecordsForRange：
// 传回的 date 已经统一转回 "yyyy-MM-dd"，方便前端直接用字符串比较）
function readSpecialStatusForRange(startDateStr, endDateStr) {
  try {
    if (!startDateStr || !endDateStr) return [];
    const sheet = getOrCreateSpecialStatusSheet_();
    const data = readSpecialStatusRecordBlock_(sheet).data;
    if (data.length === 0) return [];
    const colorMap = new Map(getSpecialStatusesFromSheet().map((s) => [s.name, s.color]));
    const idIdx = SPECIAL_STATUS_RECORD_HEADERS.indexOf("ID");
    const venueIdx = SPECIAL_STATUS_RECORD_HEADERS.indexOf("场地编号");
    const venueNameIdx = SPECIAL_STATUS_RECORD_HEADERS.indexOf("场地名称");
    const statusIdx = SPECIAL_STATUS_RECORD_HEADERS.indexOf("状态名称");
    const dateIdx = SPECIAL_STATUS_RECORD_HEADERS.indexOf("使用日期");
    const fillerIdx = SPECIAL_STATUS_RECORD_HEADERS.indexOf("填写人");
    const results = [];
    for (let i = 0; i < data.length; i++) {
      if (!String(data[i][idIdx] || "").trim()) continue;
      const dateVal = normalizeDateToISO(data[i][dateIdx]);
      if (!dateVal || dateVal < startDateStr || dateVal > endDateStr) continue;
      const statusName = String(data[i][statusIdx] || "").trim();
      if (!statusName) continue;
      results.push({
        id: data[i][idIdx],
        venueCode: String(data[i][venueIdx] || "").trim(),
        venueName: String(data[i][venueNameIdx] || "").trim(),
        status: statusName,
        color: colorMap.get(statusName) || "",
        date: dateVal,
        filler: String(data[i][fillerIdx] || "").trim(),
      });
    }
    return results;
  } catch (err) {
    return [];
  }
}

// 包一层给 Table.html 用（矩阵总表按月看），内部还是走 readSpecialStatusForRange
function readSpecialStatusForMonth(monthKey) {
  try {
    if (!monthKey) return [];
    const parts = monthKey.split("-");
    const y = Number(parts[0]),
      m = Number(parts[1]);
    if (!y || !m) return [];
    const daysInMonth = new Date(y, m, 0).getDate();
    const startStr = monthKey + "-01";
    const endStr = monthKey + "-" + String(daysInMonth).padStart(2, "0");
    return readSpecialStatusForRange(startStr, endStr);
  } catch (err) {
    return [];
  }
}

// 管理端用：列出所有特殊状态标记记录（不分月份，本来量就不大），按日期新到旧排序，
// 给 Admin.html 一个简单的清单可以查看/删除已经不需要的标记（例如维修完了要取消状态）
function readSpecialStatusList() {
  try {
    const sheet = getOrCreateSpecialStatusSheet_();
    const data = readSpecialStatusRecordBlock_(sheet).data;
    const idIdx = SPECIAL_STATUS_RECORD_HEADERS.indexOf("ID");
    const venueIdx = SPECIAL_STATUS_RECORD_HEADERS.indexOf("场地编号");
    const venueNameIdx = SPECIAL_STATUS_RECORD_HEADERS.indexOf("场地名称");
    const statusIdx = SPECIAL_STATUS_RECORD_HEADERS.indexOf("状态名称");
    const dateIdx = SPECIAL_STATUS_RECORD_HEADERS.indexOf("使用日期");
    const fillerIdx = SPECIAL_STATUS_RECORD_HEADERS.indexOf("填写人");
    const list = [];
    for (let i = 0; i < data.length; i++) {
      const id = String(data[i][idIdx] || "").trim();
      if (!id) continue;
      list.push({
        id: id,
        venueCode: String(data[i][venueIdx] || "").trim(),
        venueName: String(data[i][venueNameIdx] || "").trim(),
        status: String(data[i][statusIdx] || "").trim(),
        date: normalizeDateToISO(data[i][dateIdx]),
        filler: String(data[i][fillerIdx] || "").trim(),
      });
    }
    list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return list;
  } catch (err) {
    return [];
  }
}

// 管理端用：删除指定 ID 的特殊状态标记（例如维修完了、考试结束了，手动取消）。
// ⚠️ 只删"标记记录区"（C 列开始那一块）的格子、下方往上补，不能用 deleteRow() 删整行——
// 整行删除会连同同一行 A 列的"状态类型定义"（例如"维修"跟它的颜色）一起删掉。
function deleteSpecialStatusEntries(ids) {
  const operatorEmail = requireAdminAccess(); // 🛡️ 写入前强制校验管理员白名单
  if (!ids || ids.length === 0) return { success: true, count: 0 };
  return withScriptLock_(() => {
    const sheet = getOrCreateSpecialStatusSheet_();
    const block = readSpecialStatusRecordBlock_(sheet);
    const idSet = new Set(ids.map(String));
    const idIdx = SPECIAL_STATUS_RECORD_HEADERS.indexOf("ID");
    let deletedCount = 0;
    for (let i = block.data.length - 1; i >= 0; i--) {
      if (idSet.has(String(block.data[i][idIdx]))) {
        sheet
          .getRange(block.firstRow + i, SPECIAL_STATUS_RECORD_START_COL, 1, SPECIAL_STATUS_RECORD_HEADERS.length)
          .deleteCells(SpreadsheetApp.Dimension.ROWS);
        deletedCount++;
      }
    }
    if (deletedCount > 0) {
      logSpecialStatusAudit_("删除特殊状态", operatorEmail, `删除了 ${deletedCount} 笔特殊状态标记`);
    }
    return { success: true, count: deletedCount };
  });
}

// 特殊状态 / 公告栏用的简化版操作日志（跟 logAudit_() 共用同一张《操作日志》表，但栏位形状对不上
// 一般借用记录的 HEADERS，所以摘要文字直接放进"活动"那一栏，其余栏位留空）
function logSpecialStatusAudit_(actionType, operatorEmail, summaryText) {
  try {
    appendAuditRows_([[nowStamp_(), actionType, operatorEmail || "未知", "", "", summaryText, "", ""]]);
  } catch (e) {
    console.error("写入操作日志失败: " + e.message);
  }
}

function normalizeDateToISO(val) {
  if (val === null || val === undefined) return "";
  if (val instanceof Date)
    return Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
  var str = String(val).trim();
  if (!str) return "";
  if (str.indexOf("/") !== -1) {
    var parts = str.split("/");
    if (parts.length === 3) {
      if (parts[2].length === 4)
        return (
          parts[2] +
          "-" +
          parts[1].padStart(2, "0") +
          "-" +
          parts[0].padStart(2, "0")
        );
      if (parts[0].length === 4)
        return (
          parts[0] +
          "-" +
          parts[1].padStart(2, "0") +
          "-" +
          parts[2].padStart(2, "0")
        );
    }
  }
  if (str.indexOf("-") !== -1) {
    var parts = str.split("-");
    if (parts.length === 3) {
      if (parts[0].length === 4)
        return (
          parts[0] +
          "-" +
          parts[1].padStart(2, "0") +
          "-" +
          parts[2].padStart(2, "0")
        );
      if (parts[2].length === 4)
        return (
          parts[2] +
          "-" +
          parts[1].padStart(2, "0") +
          "-" +
          parts[0].padStart(2, "0")
        );
    }
  }
  return str;
}

// 🏷️ 判断一个"单位"编号是不是"学会团体"（例如 "A-摄影学会"、"E-辩论学会"，用纯字母开头编号），
// 跟"学校行政团体"（例如 "01-校长室"、"10-总务处"，用数字编号）区分开。矩阵总表的单位颜色
// 功能目前只服务学校行政团体，学会团体不需要在矩阵总表出现颜色/图例。
function isClubUnitCode(unitName) {
  const trimmed = String(unitName || "").trim();
  if (!trimmed) return false;
  const dashIdx = trimmed.indexOf("-");
  const prefix = dashIdx > -1 ? trimmed.substring(0, dashIdx) : trimmed;
  // 🔧 编号格式其实是"字母+数字"（例如 A01、B02...E0X），不是纯字母，所以改成只看
  // 编号前缀是不是以字母开头——只要以字母开头（不管后面接不接数字）都算学会团体；
  // 以数字开头（例如 01、10）才是学校行政团体
  return /^[A-Za-z]/.test(prefix);
}

// 🎨 读取《场地编号》工作表"单位"列里，管理员手动上的格子底色，按照该列由上到下的原始表格顺序
// 整理成 [{ unit, color }, ...] 数组，给矩阵总表（Table.html）用颜色区分不同单位借用的格子，
// 图例也照着这个顺序显示（改用数组而非物件返回，是为了避免"01"".."10"这种数字形态的
// 键名被 JS 引擎按数字重新排序、打乱原本的表格顺序）。
// - 同一单位如果在多行上了不同颜色，取第一个出现的颜色为准
// - 没有特别上色（默认白色/透明）的单位不会出现在这份清单里
// - 🆕"学会团体"（字母开头编号，如 A-摄影学会）一律跳过，矩阵总表只显示"学校行政团体"（数字编号）的颜色
function getUnitColorMap() {
  return getCachedConfig_("cfg:unitColors", readUnitColorMap_);
}

function readUnitColorMap_() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("场地编号");
    if (!sheet) return [];
    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    if (lastRow <= 1) return [];
    const headerRow = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    const unitIndex = headerRow.indexOf("单位");
    if (unitIndex === -1) return [];
    const unitCol1 = unitIndex + 1;
    const values = sheet.getRange(2, unitCol1, lastRow - 1, 1).getValues();
    const backgrounds = sheet
      .getRange(2, unitCol1, lastRow - 1, 1)
      .getBackgrounds();
    const seen = new Set();
    const colorList = [];
    for (let i = 0; i < values.length; i++) {
      const unitName = String(values[i][0]).trim();
      if (!unitName || seen.has(unitName)) continue;
      if (isClubUnitCode(unitName)) continue; // 🆕 学会团体不需要显示在矩阵总表
      const color = String(backgrounds[i][0] || "").toLowerCase();
      // 跳过默认白色/无填色的格子，避免把"没特别设色"的单位也强制染成白底
      if (!color || color === "#ffffff") continue;
      seen.add(unitName); // 只有真正取到颜色、加入清单的单位才标记为已处理，同一单位第一笔没上色不影响后面行再检查一次
      colorList.push({ unit: unitName, color: color });
    }
    return colorList;
  } catch (err) {
    return [];
  }
}

// 🏖️ 读取《场地编号》工作表里的"假期设定"三列：【假期设定(月)】【开始(日期)】【结束(日期)】，
// 整理成 [{ month, start, end }, ...]（都是数字，month 1~12、start/end 1~31），给矩阵总表 /
// 日历视图 / 电视看板把假期日期的格子填成黄色底。
// - 每年通用、不分年份：例如 01 | 05 | 14 代表"每年 1 月 5 日～14 日"是假期，跨年后
//   管理员只要照新学年的校历改这几格就好
// - 跨月的假期（例如 8/28～9/5）请拆成两行：08 | 28 | 31、09 | 01 | 05
// - 同一个月有两段假期，可以再多加一行同月份的设定，两段都会生效
// - 只填了开始或只填了结束，就当作只有那一天放假；开始 > 结束会自动对调
// - 月份那格有填、但开始/结束都空着（例如 03、04 那几行），代表那个月没有假期，直接跳过
// - 表头比对时会忽略空格、全形/半形括号的差异，所以写成「假期设定（月）」也认得出来
function getHolidaySettings() {
  return getCachedConfig_("cfg:holidays", readHolidaySettings_);
}

function readHolidaySettings_() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("场地编号");
    if (!sheet) return [];
    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    if (lastRow <= 1 || lastColumn < 1) return [];

    const normalizeHeader = (h) =>
      String(h || "")
        .replace(/\s+/g, "")
        .replace(/（/g, "(")
        .replace(/）/g, ")");
    const headers = sheet
      .getRange(1, 1, 1, lastColumn)
      .getValues()[0]
      .map(normalizeHeader);

    const monthIdx = headers.findIndex((h) => h.indexOf("假期设定") === 0);
    if (monthIdx === -1) return [];
    // 先找完全吻合的表头，找不到再退回"假期设定"右边第一个以 开始 / 结束 开头的列
    const findAfter = (exact, prefix) => {
      const exactIdx = headers.indexOf(exact);
      if (exactIdx !== -1) return exactIdx;
      for (let i = monthIdx + 1; i < headers.length; i++) {
        if (headers[i].indexOf(prefix) === 0) return i;
      }
      return -1;
    };
    const startIdx = findAfter("开始(日期)", "开始");
    const endIdx = findAfter("结束(日期)", "结束");
    if (startIdx === -1 && endIdx === -1) return [];

    const data = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
    const toInt = (v) => {
      const s = String(v === null || v === undefined ? "" : v).trim();
      if (!s) return NaN;
      const n = Number(s);
      return Number.isInteger(n) ? n : NaN;
    };

    const holidays = [];
    data.forEach((row) => {
      const month = toInt(row[monthIdx]);
      if (!(month >= 1 && month <= 12)) return;
      let start = startIdx === -1 ? NaN : toInt(row[startIdx]);
      let end = endIdx === -1 ? NaN : toInt(row[endIdx]);
      const startOk = start >= 1 && start <= 31;
      const endOk = end >= 1 && end <= 31;
      if (!startOk && !endOk) return; // 这个月没设假期
      if (!startOk) start = end;
      if (!endOk) end = start;
      if (start > end) {
        const tmp = start;
        start = end;
        end = tmp;
      }
      holidays.push({ month: month, start: start, end: end });
    });
    return holidays;
  } catch (err) {
    return [];
  }
}

function getVenuesFromSheet() {
  return getCachedConfig_("cfg:venues", readVenuesFromSheet_);
}

function readVenuesFromSheet_() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("场地编号");
    if (!sheet) throw new Error("找不到《场地编号》工作表（是否被改名或删除了？）");
    const data = sheet.getDataRange().getValues();
    let venueList = [];
    for (let i = 1; i < data.length; i++) {
      let code = String(data[i][0]).trim();
      let name = String(data[i][1]).trim();
      if (code) {
        venueList.push({ code: code, name: name });
      }
    }
    return venueList;
  } catch (err) {
    throw new Error(err.message);
  }
}

function getUnitsFromSheet() {
  return getCachedConfig_("cfg:units", readUnitsFromSheet_);
}

function readUnitsFromSheet_() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("场地编号");
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];
    const headers = data[0];
    const unitIndex = headers.indexOf("单位");
    if (unitIndex === -1) return [];
    const unitSet = new Set();
    for (let i = 1; i < data.length; i++) {
      const unitVal = String(data[i][unitIndex]).trim();
      if (unitVal) unitSet.add(unitVal);
    }
    return Array.from(unitSet).sort();
  } catch (err) {
    return [];
  }
}

// 把工作表某一行的原始值，按表头转换成前端要用的记录对象（各处读取记录共用这份逻辑）
function rowToRecordObj(headers, rowValues) {
  let obj = {};
  headers.forEach((header, index) => {
    let val = rowValues[index];
    if (header === "系统时间戳") {
      obj[header] =
        val instanceof Date
          ? Utilities.formatDate(
              val,
              Session.getScriptTimeZone(),
              "yyyy-MM-dd HH:mm:ss",
            )
          : String(val);
    } else if (header === "使用日期" || header === "填写日期") {
      obj[header] = normalizeDateToISO(val);
    } else if (header === "时间(开始)" || header === "时间(结束)") {
      // 🔧 时间栏位如果被表格自动转成了 Date，这里洗回干净的 "HH:mm" 字符串
      obj[header] = cellTimeToString(val);
    } else {
      obj[header] = val === null || val === undefined ? "" : String(val);
    }
  });
  // 🔧 新旧结构兼容层：不管这一行来自新结构（时间(开始)/时间(结束) 两栏，尚未跑过迁移的旧月份
  // 工作表仍是这样）还是旧结构（单一"时间"栏），这里都统一补出一个组合字符串 obj.时间，
  // 让 Table.html / Viewer.html 完全不用关心底层存储方式的变化
  if (obj["时间(开始)"] !== undefined || obj["时间(结束)"] !== undefined) {
    const s = obj["时间(开始)"] || "";
    const e = obj["时间(结束)"] || "";
    obj["时间"] = s || e ? `${s}-${e}` : "";
  }
  return obj;
}

// 判断一张工作表是不是"借用记录月份表"（表头第一格是 ID）。特殊状态、公告栏、
// 场地编号、回收站、操作日志都不是。
function isRecordSheetName_(sheetName) {
  return !(
    sheetName === "场地编号" ||
    sheetName === TRASH_SHEET_NAME ||
    sheetName === AUDIT_SHEET_NAME ||
    sheetName === SPECIAL_STATUS_SHEET_NAME ||
    sheetName === ANNOUNCEMENT_SHEET_NAME
  );
}

// 管理端"资料范围"选项 → 最早要读的月份（"yyyy-MM"）。null 代表全部。
const ADMIN_RANGE_MONTHS_BACK = { recent: 3, year: 12, all: null };

// ⚡ 管理端借用记录列表：以前每次打开都把系统里所有月份的记录全部读出来，年份越多越慢。
// 现在预设只读"3 个月前的那个月"到未来所有月份（rangeKey = "recent"），想查更早的记录
// 可以在管理端切换成"最近 12 个月"或"全部"。
function readRecordsForAdmin(rangeKey) {
  requireAdminAccess();
  const monthsBack = Object.prototype.hasOwnProperty.call(ADMIN_RANGE_MONTHS_BACK, rangeKey)
    ? ADMIN_RANGE_MONTHS_BACK[rangeKey]
    : ADMIN_RANGE_MONTHS_BACK.recent;
  let minMonthKey = null;
  if (monthsBack !== null) {
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
    minMonthKey = Utilities.formatDate(cutoff, Session.getScriptTimeZone(), "yyyy-MM");
  }
  const allRecords = [];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.getSheets().forEach((sheet) => {
    if (sheet.getType() !== SpreadsheetApp.SheetType.GRID) return;
    const sheetName = sheet.getName();
    if (!isRecordSheetName_(sheetName)) return;
    if (minMonthKey) {
      // 只读名字是 yyyy-MM 且不早于界线的月份表
      if (!/^\d{4}-\d{2}$/.test(sheetName) || sheetName < minMonthKey) return;
    }
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return;
    const headers = data[0];
    if (!headers || headers[0] !== "ID") return;
    for (let i = 1; i < data.length; i++) {
      if (!String(data[i][0] || "").trim()) continue;
      allRecords.push(rowToRecordObj(headers, data[i]));
    }
  });
  return allRecords;
}

// ⚡ 性能优化：Table.html 矩阵总表一次只看一个月，没必要每次都拉全部历史月份的数据。
// 只读取 monthKey（如 "2026-09"）对应的那张月份工作表。
function readRecordsForMonth(monthKey) {
  try {
    if (!monthKey) return [];
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(monthKey);
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];
    const headers = data[0];
    if (!headers || headers[0] !== "ID") return [];
    const records = [];
    for (let i = 1; i < data.length; i++) {
      if (!String(data[i][0] || "").trim()) continue;
      records.push(rowToRecordObj(headers, data[i]));
    }
    return records;
  } catch (err) {
    throw new Error(err.message);
  }
}

// ⚡ 性能优化：Viewver.html 公众日历视图原本用 readRecords() 把系统里所有历史月份的记录
// 一次性全部读出来，日历用久了、月份工作表越积越多只会越读越慢。日历翻页/切视图时
// FullCalendar 会带出当前可视区间的起讫日期（月视图通常还会带出前后月份的补白日子，
// 横跨 2~3 个月），这里改成只读取跟 [startDateStr, endDateStr] 这个区间有交集的月份
// 工作表，读出来的行也只保留真正落在区间内的那些。
function readRecordsForRange(startDateStr, endDateStr) {
  try {
    if (!startDateStr || !endDateStr) return [];
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const startParts = startDateStr.split("-");
    const endParts = endDateStr.split("-");
    const cursor = new Date(
      Number(startParts[0]),
      Number(startParts[1]) - 1,
      1,
    );
    const endMonth = new Date(Number(endParts[0]), Number(endParts[1]) - 1, 1);

    const allRecords = [];
    while (cursor <= endMonth) {
      const monthKey = Utilities.formatDate(
        cursor,
        Session.getScriptTimeZone(),
        "yyyy-MM",
      );
      const sheet = ss.getSheetByName(monthKey);
      if (sheet) {
        const data = sheet.getDataRange().getValues();
        if (data.length > 1) {
          const headers = data[0];
          if (headers && headers[0] === "ID") {
            for (let i = 1; i < data.length; i++) {
              if (!String(data[i][0] || "").trim()) continue;
              const rec = rowToRecordObj(headers, data[i]);
              // 月份工作表整月都在，但只保留真正落在所请求区间内的那些行
              if (
                rec.使用日期 &&
                rec.使用日期 >= startDateStr &&
                rec.使用日期 <= endDateStr
              ) {
                allRecords.push(rec);
              }
            }
          }
        }
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return allRecords;
  } catch (err) {
    throw new Error(err.message);
  }
}

// ====================================================================
// 📺 电视看板（TVBoard.html）专用：大讲堂 / 大礼堂 / 伯才堂
// ====================================================================
// 这三个场地在《场地编号》表格里的"场地编号"栏位本身存的就是中文名字
// （不是字母+数字的编号，例如 B001），所以这里直接用名字比对，
// 跟 Admin.html 场地筛选按钮那边 MAJOR_HALL_NAMES 的判断逻辑保持一致——
// 两边各自维护一份是因为一个跑在服务器（.gs），一个跑在浏览器（.html 里的 <script>），
// Apps Script 没有现成的方式让两边共用同一个 JS 常量，只能各自放一份、含义对齐即可。
const TV_BOARD_VENUE_NAMES = ["大讲堂", "大礼堂", "伯才堂"];

// 电视看板一次把「这一周」三个场地要用到的资料全部算好再回传，前端只管照着画格子，
// 不用自己再算日期区间、也不用额外呼叫好几次 google.script.run。
function getTvBoardWeekData() {
  try {
    const tz = Session.getScriptTimeZone();
    const now = new Date();

    // 🗓️ 算出「本周一」：JS Date.getDay() 是 0=周日...6=周六，这里统一以周一作为一周的开始
    // （跟 Viewver.html 用的 FullCalendar zh-cn 语系一致，zh-cn 语系底下一周也是从周一开始算）
    const dayOfWeek = now.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + diffToMonday,
    );

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(
        monday.getFullYear(),
        monday.getMonth(),
        monday.getDate() + i,
      );
      days.push(Utilities.formatDate(d, tz, "yyyy-MM-dd"));
    }
    const weekStart = days[0];
    const weekEnd = days[6];

    // 场地清单固定只留三大场所，且照 TV_BOARD_VENUE_NAMES 给的顺序排列（不是照《场地编号》
    // 表格里原本的行顺序），这样电视看板的版位每次开都固定在同样的位置
    const allVenues = getVenuesFromSheet();
    const venues = TV_BOARD_VENUE_NAMES.map(function (hallName) {
      const match = allVenues.find(function (v) {
        return v.code.indexOf(hallName) > -1 || v.name.indexOf(hallName) > -1;
      });
      // 万一《场地编号》表格里还没有建这个场地（理论上不该发生），退回用名字本身兜底，
      // 至少电视看板不会直接崩掉、只是那个场地永远显示没有借用记录
      return match || { code: hallName, name: hallName };
    });
    const venueCodeSet = new Set(
      venues.map(function (v) {
        return v.code;
      }),
    );

    const weekRecords = readRecordsForRange(weekStart, weekEnd).filter(
      function (r) {
        return venueCodeSet.has(r["场地"]);
      },
    );

    const weekSpecial = readSpecialStatusForRange(weekStart, weekEnd).filter(
      function (s) {
        return venueCodeSet.has(s.venueCode);
      },
    );

    return {
      weekStart: weekStart,
      weekEnd: weekEnd,
      days: days,
      venues: venues,
      records: weekRecords,
      specialStatus: weekSpecial,
      unitColors: getUnitColorMap(),
      // 🏢🚧 顶部"行政单位"/"特殊状态"图例用的颜色对照表，跟 Table.html 矩阵总表
      // 是完全同一套数据来源（getUnitColorMap() / getSpecialStatusesFromSheet()），
      // 一起塞进这个函数的回传值，电视看板不用为了图例再多打一次 RPC
      specialStatusTypes: getSpecialStatusesFromSheet(),
      // 🏖️ 假期设定（每年通用的 [{month, start, end}]），前端把落在假期的那几天整列填黄色
      holidays: getHolidaySettings(),
    };
  } catch (err) {
    throw new Error(err.message);
  }
}

function formatDateStr(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

/**
 * 🗑️ 回收站 + 📋 操作日志
 * ====================================================================
 * 之前删除是物理擦除、无法复原，也完全没有留痕（填写人是自由填写的文字，
 * 不代表真实操作者）。现在删除前会先把整行归档到回收站工作表，并且
 * 新增/修改/删除都会写一笔操作日志（含真实谷歌账号），方便事后追责或找回误删数据。
 */
function nowStamp_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
}

function getTrashSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(TRASH_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(TRASH_SHEET_NAME);
    sheet.appendRow(["删除时间", "操作人邮箱"].concat(HEADERS));
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 2 + HEADERS.length).setFontWeight("bold");
    // 🔧 整张资料区设成纯文本，防止时间/日期被表格自动识别成 Date
    sheet.getRange(2, 1, sheet.getMaxRows() - 1, 2 + HEADERS.length).setNumberFormat("@");
  }
  return sheet;
}

const AUDIT_HEADERS = ["时间", "操作类型", "操作人邮箱", "记录ID", "场地", "活动", "单位", "时间段"];

function getAuditSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(AUDIT_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(AUDIT_SHEET_NAME);
    sheet.appendRow(AUDIT_HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, AUDIT_HEADERS.length).setFontWeight("bold");
  }
  return sheet;
}

function appendAuditRows_(rows) {
  if (!rows || rows.length === 0) return;
  appendRowsAsText_(getAuditSheet_(), rows);
}

// 把一行借用记录按 HEADERS 固定顺序对齐成回收站的一行：[删除时间, 操作人邮箱, ...HEADERS]
function buildTrashRow_(headers, rowValues, operatorEmail) {
  // 如果这行来自尚未跑迁移的旧结构工作表（只有单一"时间"栏），先把组合文本拆成开始/结束，
  // 这样归档进回收站的记录也能对齐新结构，不会漏掉时间信息
  const hasSplitTime = headers.indexOf("时间(开始)") > -1 && headers.indexOf("时间(结束)") > -1;
  const legacyTimeIdx = headers.indexOf("时间");
  const legacySplit =
    !hasSplitTime && legacyTimeIdx > -1 ? legacyTimeStringToStartEnd(rowValues[legacyTimeIdx]) : null;
  const obj = rowToRecordObj(headers, rowValues);
  const alignedRow = HEADERS.map((h) => {
    if (legacySplit && h === "时间(开始)") return legacySplit.start;
    if (legacySplit && h === "时间(结束)") return legacySplit.end;
    const idx = headers.indexOf(h);
    if (idx === -1) return "";
    // 日期栏位统一存成 d/M/yyyy 文字（原值可能已被表格转成 Date）
    if (h === "使用日期" || h === "填写日期") return formatDateStr(obj[h]);
    if (h === "时间(开始)" || h === "时间(结束)") return obj[h];
    return rowValues[idx];
  });
  return [nowStamp_(), operatorEmail || "未知"].concat(alignedRow);
}

function buildAuditRow_(actionType, operatorEmail, rowValues, headers) {
  const idIdx = headers.indexOf("ID");
  const venueIdx = headers.indexOf("场地");
  const eventIdx = headers.indexOf("活动");
  const unitIdx = headers.indexOf("单位");
  return [
    nowStamp_(),
    actionType,
    operatorEmail || "未知",
    idIdx > -1 ? rowValues[idIdx] : "",
    venueIdx > -1 ? rowValues[venueIdx] : "",
    eventIdx > -1 ? rowValues[eventIdx] : "",
    unitIdx > -1 ? rowValues[unitIdx] : "",
    formatRowTimeDisplay(headers, rowValues),
  ];
}

/**
 * 🛡️ 场地时段冲突防呆引擎
 * ====================================================================
 */

// 🔧 把任意来源的"时间"栏位值统一转成干净的 "HH:mm" 字符串。
// 根本问题：Google 表格看到 appendRow() 写进去的 "06:00" 这种文本，会自作聪明地
// 把它自动识别并转存成内部的 Date/时间序列值（時區纪元 1899-12-30），如果栏位事先
// 没有被设成"纯文本"格式。之后不管是显示还是拿去跟别的时间比较大小，都要先
// 用这个函数把 Date 对象洗回 "HH:mm" 字符串，否则会显示成一整串很丑的 JS Date
// toString()（例如 "Sat Dec 30 1899 06:00:00 GMT+0655 ..."），冲突检测也会因为
// 正则匹配不到而直接放弃比对。
function cellTimeToString(val) {
  if (val === null || val === undefined || val === "") return "";
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), "HH:mm");
  }
  return String(val).trim();
}

// 把标准的 "HH:MM" 字符串转成分钟数，格式不对就返回 null
function timeStrToMinutes(hhmm) {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(cellTimeToString(hhmm)).trim());
  if (!m) return null;
  const h = parseInt(m[1], 10),
    mi = parseInt(m[2], 10);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

// 兼容旧数据：从任意格式的组合时间文本（"14:00-16:00"、"08.00-1200"、
// "开始:14:00 至 结束:16:00" 等）中提取出【开始/结束】分钟数，解析不出两组
// 有效时间时返回 null（无法判断的一律不拦截，避免旧的脏数据格式把系统卡死）
function parseTimeRangeToMinutes(timeStr) {
  if (!timeStr) return null;
  const regex = /(?:^|\D)(\d{1,2})[:.]?(\d{2})(?=\D|$)/g;
  const matches = [];
  let m;
  const s = String(timeStr);
  while ((m = regex.exec(s)) !== null) {
    const h = parseInt(m[1], 10);
    const mi = parseInt(m[2], 10);
    if (h >= 0 && h <= 23 && mi >= 0 && mi <= 59) matches.push(h * 60 + mi);
  }
  if (matches.length < 2) return null;
  const range = { start: matches[0], end: matches[1] };
  if (range.end <= range.start) return null; // 时间顺序不合理（如跨午夜），无法安全判断重叠，放行由人工核对
  return range;
}

// 同样兼容旧数据：把组合时间文本拆成 {start, end} 两个 "HH:MM" 字符串（迁移/归档时用）
function legacyTimeStringToStartEnd(timeStr) {
  if (!timeStr) return { start: "", end: "" };
  const regex = /(?:^|\D)(\d{1,2})[:.]?(\d{2})(?=\D|$)/g;
  const matches = [];
  let m;
  const s = String(timeStr);
  while ((m = regex.exec(s)) !== null) {
    matches.push(String(m[1]).padStart(2, "0") + ":" + m[2]);
  }
  return { start: matches[0] || "", end: matches[1] || "" };
}

// 不管一张工作表是新结构（时间(开始)/时间(结束) 两栏）还是尚未迁移的旧结构（单一"时间"栏），
// 都能算出某一行的 {start, end} 分钟数
function getRowTimeRangeMinutes(headers, row) {
  const startIdx = headers.indexOf("时间(开始)");
  const endIdx = headers.indexOf("时间(结束)");
  if (startIdx > -1 && endIdx > -1) {
    const s = timeStrToMinutes(cellTimeToString(row[startIdx]));
    const e = timeStrToMinutes(cellTimeToString(row[endIdx]));
    if (s === null || e === null || e <= s) return null;
    return { start: s, end: e };
  }
  const timeIdx = headers.indexOf("时间");
  if (timeIdx > -1) return parseTimeRangeToMinutes(row[timeIdx]);
  return null;
}

// 不管新旧结构，都拼出一个人看得懂的 "HH:MM-HH:MM" 展示文字（用于冲突提示/审计日志）
function formatRowTimeDisplay(headers, row) {
  const startIdx = headers.indexOf("时间(开始)");
  const endIdx = headers.indexOf("时间(结束)");
  if (startIdx > -1 && endIdx > -1)
    return `${cellTimeToString(row[startIdx])}-${cellTimeToString(row[endIdx])}`;
  const timeIdx = headers.indexOf("时间");
  return timeIdx > -1 ? row[timeIdx] : "";
}

// 读一张月份工作表，建成「场地|日期」→ 既有借用时段 的索引（每个月份只读一次，
// 不再像以前那样每个"日期 × 场地"组合都重新读一次整张表）。
// 工作表不存在时回传空索引——扫描冲突的过程中不会顺手建出空白的月份工作表。
function buildMonthConflictIndex_(monthKey) {
  const index = new Map();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(monthKey);
  if (!sheet) return index;
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return index;
  const data = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
  const headers = data[0];
  const idIdx = headers.indexOf("ID");
  const venueIdx = headers.indexOf("场地");
  const eventIdx = headers.indexOf("活动");
  const useDateIdx = headers.indexOf("使用日期");
  if (idIdx === -1 || venueIdx === -1 || useDateIdx === -1) return index;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!String(row[idIdx] || "").trim()) continue;
    const range = getRowTimeRangeMinutes(headers, row);
    if (!range) continue; // 既有数据时间格式无法解析时不拦截（多半是历史遗留数据）
    const key = String(row[venueIdx]).trim() + "|" + normalizeDateToISO(row[useDateIdx]);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push({
      id: String(row[idIdx]),
      event: row[eventIdx],
      start: range.start,
      end: range.end,
      display: formatRowTimeDisplay(headers, row),
    });
  }
  return index;
}

// 区间重叠判定：newStart < existingEnd 且 existingStart < newEnd；excludeId 用于编辑时排除自己
function findConflictInIndex_(index, venueCode, dateString, range, excludeId) {
  const list = index.get(String(venueCode).trim() + "|" + dateString) || [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (excludeId && r.id === String(excludeId)) continue;
    if (range.start < r.end && r.start < range.end) return r;
  }
  return null;
}

function conflictMessage_(venueCode, dateString, conflict, isEdit) {
  return (
    `⛔ 场地时段冲突：【${venueCode}】在 ${formatDateStr(dateString)} 已有借用记录「${conflict.event}」` +
    `（${conflict.display}），与本次${isEdit ? "修改后" : "提交"}的时间重叠，请修改时间或更换场地后再${isEdit ? "保存" : "提交"}。`
  );
}

// 按某张工作表自己的表头顺序，把一笔记录（以 HEADERS 栏名为键的物件）排成一行。
// 一般就是 HEADERS 的顺序；万一遇到还没迁移的旧结构表（单一"时间"栏），也能写对位置。
function recordToSheetRow_(sheetHeaders, rec) {
  return sheetHeaders.map((h) => {
    if (h === "时间") return `${rec["时间(开始)"] || ""}-${rec["时间(结束)"] || ""}`;
    return Object.prototype.hasOwnProperty.call(rec, h) ? rec[h] : "";
  });
}

function getSheetHeaders_(sheet) {
  return sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
}

function normalizeRecordInput_(record) {
  if (!record) throw new Error("⛔ 没有收到要提交的资料。");
  const event = String(record.event || "").trim();
  const unit = String(record.unit || "").trim();
  if (!event) throw new Error("⛔ 请填写活动名称。");
  if (!unit) throw new Error("⛔ 请选择借用单位。");
  return {
    event: event,
    unit: unit,
    timeStart: String(record.timeStart || "").trim(),
    timeEnd: String(record.timeEnd || "").trim(),
    filler: String(record.filler || "").trim(),
  };
}

function createRecord(record) {
  const operatorEmail = requireAdminAccess(); // 🛡️ 写入前强制校验管理员白名单
  const input = normalizeRecordInput_(record);
  const venues = uniqueNonEmpty_(record.venues);
  if (venues.length === 0) throw new Error("⛔ 请至少勾选一个场地。");
  const range = validateTimeRange_(input.timeStart, input.timeEnd);
  // 🆕 按星期重复：record.recurWeekdays 是 0~6 的星期几数组（0=周日...6=周六），没传 = 连续每天
  const dates = expandDates_(record.useDate, record.endDate, record.recurWeekdays);
  assertWithinSubmitLimit_(dates.length * venues.length);

  // 「填写人」留空就自动带出当前登入者的姓名+email
  const filler = input.filler || getCurrentUserDisplayLabel_(operatorEmail);

  return withScriptLock_(() => {
    // 按月份分组：每个月份只读一次工作表
    const datesByMonth = new Map();
    dates.forEach((d) => {
      const mk = d.substring(0, 7);
      if (!datesByMonth.has(mk)) datesByMonth.set(mk, []);
      datesByMonth.get(mk).push(d);
    });

    // 🚧 第一步：整批「日期 × 场地」全部扫描过、全部无冲突才写入（拿到锁之后才扫描，
    // 所以扫描完到写入之间不会有别人插队写进同一时段）
    datesByMonth.forEach((monthDates, monthKey) => {
      const index = buildMonthConflictIndex_(monthKey);
      monthDates.forEach((dateString) => {
        venues.forEach((venueCode) => {
          const conflict = findConflictInIndex_(index, venueCode, dateString, range, null);
          if (conflict) throw new Error(conflictMessage_(venueCode, dateString, conflict, false));
        });
      });
    });

    // ✅ 第二步：确认无冲突后，每个月份工作表一次整批写入
    const timestamp = nowStamp_();
    const formattedFillDate = formatDateStr(todayIso_());
    const auditRows = [];
    let count = 0;
    datesByMonth.forEach((monthDates, monthKey) => {
      const sheet = getSheetForDate_(monthKey + "-01");
      const sheetHeaders = getSheetHeaders_(sheet);
      const rows = [];
      monthDates.forEach((dateString) => {
        venues.forEach((venueCode) => {
          const rec = {
            ID: "ID_" + Utilities.getUuid(),
            场地: venueCode,
            活动: input.event,
            单位: input.unit,
            "时间(开始)": input.timeStart,
            "时间(结束)": input.timeEnd,
            填写人: filler,
            填写日期: formattedFillDate,
            使用日期: formatDateStr(dateString),
            系统时间戳: timestamp,
          };
          const row = recordToSheetRow_(sheetHeaders, rec);
          rows.push(row);
          auditRows.push(buildAuditRow_("新增", operatorEmail, row, sheetHeaders));
        });
      });
      appendRowsAsText_(sheet, rows);
      count += rows.length;
    });
    appendAuditRows_(auditRows);
    return { success: true, count: count };
  });
}

// 在月份工作表里找某一笔记录的位置。monthHints（可选）是前端带来的"这笔记录大概在哪个月"
// 提示，先找这几张表，找不到才退回扫描全部月份表。只读 A 栏（ID），不读整张表。
function locateRecords_(ids, monthHints) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const remaining = new Set((ids || []).map(String));
  const found = []; // { sheet, rowNumber, id }
  const visited = new Set();
  const scan = (sheet) => {
    if (!sheet || remaining.size === 0) return;
    const name = sheet.getName();
    if (visited.has(name)) return;
    visited.add(name);
    if (sheet.getType() !== SpreadsheetApp.SheetType.GRID || !isRecordSheetName_(name)) return;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;
    const col = sheet.getRange(1, 1, lastRow, 1).getValues();
    if (col[0][0] !== "ID") return;
    for (let i = 1; i < col.length; i++) {
      const id = String(col[i][0]);
      if (remaining.has(id)) {
        found.push({ sheet: sheet, rowNumber: i + 1, id: id });
        remaining.delete(id);
      }
    }
  };
  uniqueNonEmpty_(monthHints).forEach((mk) => scan(ss.getSheetByName(mk)));
  if (remaining.size > 0) ss.getSheets().forEach(scan);
  return found;
}

function batchDeleteRecords(ids, monthHints) {
  const operatorEmail = requireAdminAccess(); // 🛡️ 写入前强制校验管理员白名单
  if (!ids || ids.length === 0) return { success: true, count: 0 };
  return withScriptLock_(() => {
    const found = locateRecords_(ids, monthHints);
    if (found.length === 0) return { success: true, count: 0 };

    // 按工作表分组，每张表从下往上删（避免删除后行号错位）
    const bySheet = new Map();
    found.forEach((f) => {
      const name = f.sheet.getName();
      if (!bySheet.has(name)) bySheet.set(name, { sheet: f.sheet, rows: [] });
      bySheet.get(name).rows.push(f.rowNumber);
    });

    const trashRows = [];
    const auditRows = [];
    bySheet.forEach(({ sheet, rows }) => {
      const lastCol = sheet.getLastColumn();
      const headers = getSheetHeaders_(sheet);
      rows.sort((a, b) => b - a);
      // 先把要删的整行读出来归档（误删可以从回收站找回）
      rows.forEach((rowNumber) => {
        const values = sheet.getRange(rowNumber, 1, 1, lastCol).getValues()[0];
        trashRows.push(buildTrashRow_(headers, values, operatorEmail));
        auditRows.push(buildAuditRow_("删除", operatorEmail, values, headers));
      });
      ensureSpareRow_(sheet);
      rows.forEach((rowNumber) => sheet.deleteRow(rowNumber));
    });
    appendRowsAsText_(getTrashSheet_(), trashRows);
    appendAuditRows_(auditRows);
    return { success: true, count: found.length };
  });
}

// ✏️ 修改单笔记录：原地改写那一行（以前是"先删除再新增"，会有几个问题：记录拿到新的
// 系统时间戳、从「🔗同批」里脱离；中途失败时原记录已经删掉；被别人删掉的记录还会"复活"）。
// 如果使用日期换到别的月份，才会从旧月份表搬到新月份表。
function updateRecord(id, record, monthHint) {
  const operatorEmail = requireAdminAccess(); // 🛡️ 写入前强制校验管理员白名单
  const input = normalizeRecordInput_(record);
  const venues = uniqueNonEmpty_(record.venues);
  if (venues.length !== 1) throw new Error("⛔ 修改单笔记录时场地只能选一个。");
  const venueCode = venues[0];
  const range = validateTimeRange_(input.timeStart, input.timeEnd);
  const useDate = Utilities.formatDate(
    parseIsoDate_(record.useDate, "使用日期"),
    Session.getScriptTimeZone(),
    "yyyy-MM-dd",
  );
  const filler = input.filler || getCurrentUserDisplayLabel_(operatorEmail);

  return withScriptLock_(() => {
    const found = locateRecords_([id], [monthHint])[0];
    if (!found) {
      throw new Error("⛔ 找不到这笔记录（可能已经被其他管理员删除）。请重新整理列表后再操作。");
    }
    const oldSheet = found.sheet;
    const oldHeaders = getSheetHeaders_(oldSheet);
    const oldValues = oldSheet.getRange(found.rowNumber, 1, 1, oldSheet.getLastColumn()).getValues()[0];
    const oldObj = rowToRecordObj(oldHeaders, oldValues);

    // 🚧 冲突检查（排除自己原本这一笔）
    const targetMonth = useDate.substring(0, 7);
    const conflict = findConflictInIndex_(buildMonthConflictIndex_(targetMonth), venueCode, useDate, range, id);
    if (conflict) throw new Error(conflictMessage_(venueCode, useDate, conflict, true));

    const rec = {
      ID: String(id),
      场地: venueCode,
      活动: input.event,
      单位: input.unit,
      "时间(开始)": input.timeStart,
      "时间(结束)": input.timeEnd,
      填写人: filler,
      填写日期: formatDateStr(todayIso_()),
      使用日期: formatDateStr(useDate),
      // 保留原本的系统时间戳，修改后仍然属于同一批（🔗同批 还能一起选到）
      系统时间戳: oldObj["系统时间戳"] || nowStamp_(),
    };

    // 旧版本照样归档进回收站，改错了还能找回原本的内容
    appendRowsAsText_(getTrashSheet_(), [buildTrashRow_(oldHeaders, oldValues, operatorEmail)]);

    let newRow;
    let newHeaders;
    if (oldSheet.getName() === targetMonth) {
      newHeaders = oldHeaders;
      newRow = recordToSheetRow_(oldHeaders, rec);
      appendRowsAsText_(oldSheet, [newRow], 1, found.rowNumber); // 原地覆写这一行
    } else {
      const newSheet = getSheetForDate_(useDate);
      newHeaders = getSheetHeaders_(newSheet);
      newRow = recordToSheetRow_(newHeaders, rec);
      appendRowsAsText_(newSheet, [newRow]);
      ensureSpareRow_(oldSheet);
      oldSheet.deleteRow(found.rowNumber);
    }
    appendAuditRows_([buildAuditRow_("修改", operatorEmail, newRow, newHeaders)]);
    return { success: true };
  });
}

function getSheetForDate_(dateString) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const monthKey = String(dateString).substring(0, 7);
  if (!/^\d{4}-\d{2}$/.test(monthKey)) throw new Error("⛔ 日期格式不正确：" + dateString);
  let sheet = ss.getSheetByName(monthKey);
  if (!sheet) {
    sheet = ss.insertSheet(monthKey);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
    // 🔧 整张资料区设成纯文本：防止 "06:00" 被转成时间、"5/10/2026" 被按地区设定转成日期
    // （地区设定是美国时日/月还会对调），也防止 "=..." "-..." 开头的文字被当成公式
    sheet.getRange(2, 1, sheet.getMaxRows() - 1, HEADERS.length).setNumberFormat("@");
  }
  return sheet;
}

/**
 * 🔧【一次性迁移工具】把旧结构（单一"时间"栏位）的月份工作表，就地升级成
 * 新结构（"时间(开始)"/"时间(结束)" 两栏）。
 *
 * 使用方法：把这份新版 Code.gs 完整贴上去存档后，在 Apps Script 编辑器最上方的
 * 函数下拉选单选择 migrateAllSheetsToSplitTimeSchema，点击「运行」执行一次即可
 * （第一次运行可能会跳出权限授权，照常允许即可）。只需要跑这一次——它会自动找出
 * 所有还是旧结构的月份工作表，把"时间"栏位原地拆成两栏，并把每一行既有的组合时间
 * 文本拆成开始/结束分别填入，其余栏位内容和位置都不受影响。已经是新结构、或本来
 * 就不是借用记录数据表（比如《场地编号》《已删除记录(回收站)》《操作日志》）的
 * 工作表会自动跳过。之后新增的记录会自动套用新结构，不需要再跑第二次。
 */
function migrateAllSheetsToSplitTimeSchema() {
  requireOwner_(); // 🔐 只能由拥有者在编辑器手动运行，网页上任何人都呼叫不到
  return withScriptLock_(migrateAllSheetsToSplitTimeSchemaLocked_);
}

function migrateAllSheetsToSplitTimeSchemaLocked_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  let migratedCount = 0;
  const migratedSheetNames = [];

  sheets.forEach((sheet) => {
    if (sheet.getType() !== SpreadsheetApp.SheetType.GRID) return;
    const sheetName = sheet.getName();
    if (!isRecordSheetName_(sheetName)) return;

    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    if (lastRow < 1 || lastColumn < 1) return;

    const headerRow = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    if (!headerRow || headerRow[0] !== "ID") return; // 不是借用记录数据表，跳过

    const hasNewSplitCols =
      headerRow.indexOf("时间(开始)") > -1 &&
      headerRow.indexOf("时间(结束)") > -1;
    const oldTimeColIndex1 = headerRow.indexOf("时间") + 1; // 转成 1-index 的表格列号，找不到时是 0
    if (hasNewSplitCols || oldTimeColIndex1 === 0) return; // 已经是新结构，或找不到旧的"时间"栏位，跳过

    // 在旧"时间"栏位右边插入一个新列，Google 表格会自动把它右边的栏位整体后移，不影响其他数据
    sheet.insertColumnAfter(oldTimeColIndex1);
    sheet.getRange(1, oldTimeColIndex1).setValue("时间(开始)");
    sheet.getRange(1, oldTimeColIndex1 + 1).setValue("时间(结束)");

    // 🔧 先把这两栏整栏设成纯文本格式，再写入 "HH:mm" 字符串，避免表格自动识别成 Date
    sheet
      .getRange(1, oldTimeColIndex1, sheet.getMaxRows(), 2)
      .setNumberFormat("@");

    // 把每一行原本的组合时间文本，拆成开始/结束两个独立栏位
    if (lastRow > 1) {
      const timeValues = sheet
        .getRange(2, oldTimeColIndex1, lastRow - 1, 1)
        .getValues();
      const splitValues = timeValues.map((rowArr) => {
        const parsed = legacyTimeStringToStartEnd(rowArr[0]);
        return [parsed.start, parsed.end];
      });
      sheet
        .getRange(2, oldTimeColIndex1, lastRow - 1, 2)
        .setValues(splitValues);
    }

    migratedCount++;
    migratedSheetNames.push(sheetName);
  });

  const summary =
    migratedCount > 0
      ? `✅ 迁移完成，共升级了 ${migratedCount} 张工作表：${migratedSheetNames.join("、")}`
      : `ℹ️ 没有找到需要迁移的旧结构工作表（可能都已经是新结构，或系统里还没有任何借用记录）。`;
  Logger.log(summary);
  return summary;
}

/**
 * 🔧【一次性修复工具】修复已经被表格自动转成 Date 类型的"时间(开始)"/"时间(结束)"
 * 栏位数据（例如："借用时间"显示成 "Sat Dec 30 1899 06:00:00 GMT+0655 ..." 这种一大串
 * 英文字符的问题）。
 *
 * 使用方法：把这份新版 Code.gs 完整贴上去存档后，在 Apps Script 编辑器最上方的
 * 函数下拉选单选择 fixTimeColumnFormatting，点击「运行」执行一次即可（可能会跳出
 * 权限授权，照常允许）。只需要跑这一次——它会把每张月份工作表的时间(开始)/时间(结束)
 * 两栏整栏设为纯文本格式，并把已经被转存成 Date 的既有数据洗回干净的 "HH:mm" 字符串，
 * 其余栏位不受影响。之后新建的工作表（getSheetForDate）会自动套用纯文本格式，
 * 不会再发生同样的问题，不需要重复运行。
 */
function fixTimeColumnFormatting() {
  requireOwner_(); // 🔐 只能由拥有者在编辑器手动运行，网页上任何人都呼叫不到
  return withScriptLock_(fixTimeColumnFormattingLocked_);
}

function fixTimeColumnFormattingLocked_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  let fixedSheetCount = 0;
  let fixedCellCount = 0;
  const fixedSheetNames = [];

  sheets.forEach((sheet) => {
    if (sheet.getType() !== SpreadsheetApp.SheetType.GRID) return;
    const sheetName = sheet.getName();
    if (sheetName === "场地编号" || sheetName === AUDIT_SHEET_NAME) return;

    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    if (lastRow < 1 || lastColumn < 1) return;

    const headerRow = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    const isTrash = sheetName === TRASH_SHEET_NAME;
    // 回收站工作表的栏位相对 HEADERS 整体右移了 2 格（多了"删除时间""操作人邮箱"两栏）
    const startIdx = headerRow.indexOf("时间(开始)");
    const endIdx = headerRow.indexOf("时间(结束)");
    if (startIdx === -1 || endIdx === -1) return; // 不是新结构工作表（可能还没跑迁移，或不是记录表），跳过
    if (!isTrash && headerRow[0] !== "ID") return;

    const startCol1 = startIdx + 1;
    const endCol1 = endIdx + 1;

    // 先把整栏（含未来的空白行）强制设成纯文本格式，杜绝以后再被自动转成 Date
    sheet.getRange(1, startCol1, sheet.getMaxRows(), 1).setNumberFormat("@");
    sheet.getRange(1, endCol1, sheet.getMaxRows(), 1).setNumberFormat("@");

    if (lastRow > 1) {
      const startValues = sheet
        .getRange(2, startCol1, lastRow - 1, 1)
        .getValues();
      const endValues = sheet.getRange(2, endCol1, lastRow - 1, 1).getValues();
      let sheetChanged = false;

      const newStartValues = startValues.map((rowArr) => {
        const original = rowArr[0];
        const fixed = cellTimeToString(original);
        if (original instanceof Date) {
          sheetChanged = true;
          fixedCellCount++;
        }
        return [fixed];
      });
      const newEndValues = endValues.map((rowArr) => {
        const original = rowArr[0];
        const fixed = cellTimeToString(original);
        if (original instanceof Date) {
          sheetChanged = true;
          fixedCellCount++;
        }
        return [fixed];
      });

      if (sheetChanged) {
        // 重新设一次纯文本格式再写值，确保覆写进去的是字符串而不会又被打回 Date
        sheet
          .getRange(2, startCol1, lastRow - 1, 1)
          .setNumberFormat("@")
          .setValues(newStartValues);
        sheet
          .getRange(2, endCol1, lastRow - 1, 1)
          .setNumberFormat("@")
          .setValues(newEndValues);
        fixedSheetCount++;
        fixedSheetNames.push(sheetName);
      }
    }
  });

  const summary =
    fixedSheetCount > 0
      ? `✅ 修复完成，共处理了 ${fixedSheetCount} 张工作表、修正了 ${fixedCellCount} 个被误转成日期格式的时间格子：${fixedSheetNames.join("、")}`
      : `ℹ️ 没有发现需要修复的时间格子（所有栏位已经是干净的文本格式）。`;
  Logger.log(summary);
  return summary;
}

// ====================================================================
// 📢 Table.html 矩阵总表右侧公告栏：读取《公告栏》工作表 A2 格的 Markdown 内容
// ====================================================================
// ⚠️ 这里原本是读取一份指定的 Google 文档（DocumentApp.openById），后来发现
// Google 会不定期自动撤销这类第三方文档访问的授权（尤其是学校/企业 Workspace
// 账号，管理员那边的安全策略定期重新检查/收回授权是常见现象），导致公告栏三不五时
// 就跳出「您没有调用 DocumentApp.openById 的权限」，要手动重新跑一次授权才能修好，
// 很不稳定。索性改成直接读同一个 Google Sheets 项目里的一张《公告栏》工作表——
// 反正 SpreadsheetApp 本来就是这个项目最基本、最不会被单独收回的权限，不会再有
// 这种权限时不时被撤销的问题。
//
// v4（这一版，CLAUDE.md 里的版本编号）：A2 存的从"直接手打 HTML"改成 **Markdown 语法**（# 标题、**粗体**、
// - 条列、[文字](链接) 之类），后端完全不处理转换——Markdown → HTML 的转换挪到
// 前端做（Table.html/Admin.html 都用同一个 CDN 载入的 marked.js），后端这里只是
// 单纯存/取一段文字，跟内容到底是 Markdown 还是别的格式无关。
//
// 用法：管理员想改公告，最方便是用管理端页面最下方的「📢 矩阵总表公告栏」编辑区
// （见 Admin.html 的 saveAnnouncementContent()），也可以不透过管理端，直接打开
// 这份 Google Sheets、切到《公告栏》这张工作表，把 Markdown 内容整个贴在 A2 那
// 一格（第一次使用时系统会自动建立这张工作表并放一段范例）。矩阵总表每次打开、
// 以及开着的分页每 5 分钟都会自动重新读一次 A2 的最新内容，不用碰任何代码、
// 也不用重新部署。
//
// ⚠️ 虽然主要是 Markdown 语法，但 A2 内容最终还是会交给前端的 marked.js 转成 HTML
// 再塞进网页——marked.js 预设允许内文直接夹带原生 HTML 标签（例如想要的颜色/样式
// Markdown 本身表达不出来时，可以直接写 `<span style="color:...">文字</span>`），
// 所以效果上跟"信任的 HTML"是同一回事，只是常见情况（标题/粗体/条列/链接）现在
// 用 Markdown 语法写更省事。这张工作表本来就只有拿得到这份 Google Sheets 编辑权限
// 的人（也就是本来就信任的管理员）才能改，风险跟他们能编辑《场地编号》表的单位
// 颜色是同一个等级。
const ANNOUNCEMENT_SHEET_NAME = "公告栏";
const ANNOUNCEMENT_CONTENT_ROW = 2;
const ANNOUNCEMENT_CONTENT_COL = 1; // A2：实际要显示的 Markdown 内容
const ANNOUNCEMENT_UPDATED_ROW = 2;
const ANNOUNCEMENT_UPDATED_COL = 2; // B2：最后更新时间，由下面的 onEdit(e) 简易触发器自动写入

// 取得《公告栏》工作表，第一次使用时自动建立（含说明文字、范例 Markdown、防呆排版设置）
function getOrCreateAnnouncementSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(ANNOUNCEMENT_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(ANNOUNCEMENT_SHEET_NAME);
    sheet
      .getRange(1, ANNOUNCEMENT_CONTENT_COL)
      .setValue(
        "📢 公告内容（Markdown）——把要显示在矩阵总表公告栏的 Markdown 内容整个贴在下面这一格（A2）",
      );
    sheet
      .getRange(1, ANNOUNCEMENT_UPDATED_COL)
      .setValue("最后更新时间（自动填入，不用手动改）");
    sheet.getRange(1, 1, 1, 2).setFontWeight("bold");
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(ANNOUNCEMENT_CONTENT_COL, 520);
    sheet.setColumnWidth(ANNOUNCEMENT_UPDATED_COL, 160);
    sheet.setRowHeight(ANNOUNCEMENT_CONTENT_ROW, 220);
    sheet
      .getRange(ANNOUNCEMENT_CONTENT_ROW, ANNOUNCEMENT_CONTENT_COL)
      .setNumberFormat("@") // 纯文本：Markdown 常见的 "- 条列" 开头不会被当成公式变成 #ERROR!
      .setWrap(true)
      .setVerticalAlignment("top")
      .setValue(
        "# 📢 欢迎使用场地借用系统\n\n" +
          "这里是公告内容，**直接用 Markdown 语法写**就能更新，例如这句用了" +
          ' <span style="color:#e67e22">橘色文字</span>（Markdown 本身没有的效果，' +
          "直接夹一段 HTML 也可以）。\n\n" +
          "- 支持 `#`~`####` 标题、**粗体**、*斜体*、条列、[链接](https://example.com) 等常见 Markdown 语法\n" +
          "- 改完这一格，矩阵总表最多 5 分钟内会自动跟上最新内容，不用重新整理网页",
      );
    sheet
      .getRange(ANNOUNCEMENT_UPDATED_ROW, ANNOUNCEMENT_UPDATED_COL)
      .setValue(new Date());
  }
  return sheet;
}

function getAnnouncementContent() {
  try {
    const sheet = getOrCreateAnnouncementSheet_();
    const markdown = String(
      sheet
        .getRange(ANNOUNCEMENT_CONTENT_ROW, ANNOUNCEMENT_CONTENT_COL)
        .getValue() || "",
    ).trim();
    if (!markdown) {
      return { configured: false, markdown: "", updated: "" };
    }

    let updated = "";
    const updatedVal = sheet
      .getRange(ANNOUNCEMENT_UPDATED_ROW, ANNOUNCEMENT_UPDATED_COL)
      .getValue();
    if (updatedVal instanceof Date) {
      updated = Utilities.formatDate(
        updatedVal,
        Session.getScriptTimeZone(),
        "yyyy-MM-dd HH:mm",
      );
    }

    return { configured: true, markdown: markdown, updated: updated };
  } catch (err) {
    // 🛡️ 不管什么原因失败，都不该让整个矩阵总表页面挂掉，只在公告栏本身显示错误信息
    return { configured: true, markdown: "", updated: "", error: err.message };
  }
}

// 📢 Admin.html「矩阵总表公告栏」编辑区的保存按钮呼叫这个函数：直接把管理端大文本框
// 打的 Markdown 写回《公告栏》工作表 A2 格（跟 getAnnouncementContent() 读的是同一格）。
//
// ⚠️ 这里是用 Apps Script API（Range.setValue()）写入的，不是"真人在 Google Sheets
// 界面手动编辑"，所以不会触发下面的 onEdit(e) 简易触发器——因此这里要自己顺手把
// B2 的"最后更新时间"也写一次，不然透过管理端保存的话，时间戳不会自动更新。
function saveAnnouncementContent(markdown) {
  const operatorEmail = requireAdminAccess(); // 🛡️ 写入前强制校验管理员白名单
  const content = String(markdown == null ? "" : markdown);
  return withScriptLock_(() => {
    const sheet = getOrCreateAnnouncementSheet_();
    // ⚠️ 先设成纯文本再写：Markdown 条列常用 "- " 开头，Google Sheets 会把 "-"、"+"、"="
    // 开头的文字当成公式解析，存进去会变成 #ERROR!
    sheet
      .getRange(ANNOUNCEMENT_CONTENT_ROW, ANNOUNCEMENT_CONTENT_COL)
      .setNumberFormat("@")
      .setValue(content);

    const now = new Date();
    sheet.getRange(ANNOUNCEMENT_UPDATED_ROW, ANNOUNCEMENT_UPDATED_COL).setValue(now);

    logSpecialStatusAudit_("更新公告栏", operatorEmail, "更新了矩阵总表公告栏内容");

    return {
      success: true,
      updated: Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm"),
    };
  });
}

// 🕒 简易触发器（Apps Script 看到项目里有个函数就叫 onEdit(e) 会自动生效，不需要
// 手动安装、也不需要额外的权限授权）：只要有人直接在《公告栏》工作表的 A2 那格
// 手动编辑/贴上内容，就自动把 B2 的"最后更新时间"刷新成现在——纯粹方便管理员
// 自己确认"改动有没有存上去"，不影响公告内容本身怎么显示。
//
// ⚠️ 一个 Apps Script 项目只能有一个叫这个名字的简易触发器：如果之后想再新增别的
// "编辑表格自动做什么"需求，要把逻辑并进同一个 onEdit(e) 函数里，不能再定义第二个。
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const sheet = e.range.getSheet();
    const sheetName = sheet.getName();

    // ⚡ 《场地编号》《特殊状态》的文字一被手动修改，就清掉设定缓存，页面下次读取就是最新的
    // （只改格子底色不会触发 onEdit，那种情况最多 5 分钟后缓存自动过期）
    if (sheetName === "场地编号" || sheetName === SPECIAL_STATUS_SHEET_NAME) {
      clearConfigCache_();
      return;
    }
    if (sheetName !== ANNOUNCEMENT_SHEET_NAME) return;

    const editedRow1 = e.range.getRow();
    const editedRowCount = e.range.getNumRows();
    const editedCol1 = e.range.getColumn();
    const editedColCount = e.range.getNumColumns();
    const touchesContentCell =
      editedRow1 <= ANNOUNCEMENT_CONTENT_ROW &&
      ANNOUNCEMENT_CONTENT_ROW <= editedRow1 + editedRowCount - 1 &&
      editedCol1 <= ANNOUNCEMENT_CONTENT_COL &&
      ANNOUNCEMENT_CONTENT_COL <= editedCol1 + editedColCount - 1;
    if (!touchesContentCell) return;

    sheet
      .getRange(ANNOUNCEMENT_UPDATED_ROW, ANNOUNCEMENT_UPDATED_COL)
      .setValue(new Date());
  } catch (ignoreErr) {
    // 简易触发器本来就不该让"编辑表格"这个动作本身失败，安静跳过就好
  }
}
