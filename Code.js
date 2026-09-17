/**
 * ====================================================================
 * 🏢 场地借用管理系统 - 后端核心脚本 (Code.gs)  [谷歌账户白名单拦截版]
 * ====================================================================
 */

function doGet(e) {
  let page = e && e.parameter && e.parameter.page ? e.parameter.page : "admin";

  // 🛡️ 核心安全卡点：如果访问的是管理端(admin)，执行严格的谷歌账户白名单物理拦截
  if (page === "admin") {
    const userEmail = Session.getActiveUser().getEmail(); // 自动抓取当前访问者的谷歌邮箱

    // 调用白名单校验函数
    if (!checkAdminWhitelist(userEmail)) {
      // 校验失败，直接在服务器端拒绝渲染网页，输出安全警告
      return HtmlService.createHtmlOutput(
        "<div style='text-align:center; padding-top:60px; font-family:\"Segoe UI\",Arial,sans-serif; color:#333;'>" +
          "<h2 style='color:#c00000; font-weight:bold;'>🔒 访问被拒绝 (Unauthorized Access)</h2>" +
          "<p style='margin-top:20px; font-size:15px;'>您的谷歌账户：<b style='color:#0056b3;'>" +
          (userEmail || "无法获取/未登录") +
          "</b> 不在合法的管理员白名单中。</p>" +
          "<p style='color:#666; font-size:13px; margin-top:30px;'>※ 若您拥有管理权限，请联系系统创建者在《场地编号》工作表的【管理员邮箱】列中追加您的账号。</p>" +
          "</div>",
      )
        .setTitle("拒绝访问")
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
  }

  // 校验通过或访问的是公众视图，放行路由
  if (page === "view") {
    // 🔧 文件名同步：Apps Script 里的日历浏览页面文件已改名为 "Viewver"，这里跟着改，
    // 避免文件名对不上导致白屏（这也是你们自己开发日志里排查点1提过的最常见坑）
    return HtmlService.createTemplateFromFile("Viewver")
      .evaluate()
      .setTitle("场地借用日历 (浏览模式)")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else if (page === "table") {
    return HtmlService.createTemplateFromFile("Table")
      .evaluate()
      .setTitle("场地借用总表 (矩阵视图)")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else if (page === "tv") {
    // 📺 电视看板：大讲堂/大礼堂/伯才堂 专用周视图（日期为列、时间为行），
    // 给挂在墙上的电视/显示器用，不需要登入，无人操作也能一直自动刷新
    return HtmlService.createTemplateFromFile("TVBoard")
      .evaluate()
      .setTitle("场地借用电视看板")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // 完好渲染管理端
  return HtmlService.createTemplateFromFile("Admin")
    .evaluate()
    .setTitle("场地借用管理系统")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * 🔑 智能白名单比对核心引擎
 */
function checkAdminWhitelist(email) {
  if (!email) return false;
  email = email.toLowerCase().trim();

  // 🛡️ 安全特权兜底：当前脚本的拥有者（即您本人）永远拥有最高特权，防止误操作将自己锁死
  const OWNER_EMAIL = Session.getEffectiveUser()
    .getEmail()
    .toLowerCase()
    .trim();
  if (email === OWNER_EMAIL) return true;

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("场地编号");
    if (!sheet) return false;

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return false;

    const headers = data[0];
    // 动态寻找名为“管理员邮箱”的列索引
    const emailIndex = headers.indexOf("管理员邮箱");
    if (emailIndex === -1) return false;

    // 循环内存数据检索匹配
    for (let i = 1; i < data.length; i++) {
      const whitelistEmail = String(data[i][emailIndex]).toLowerCase().trim();
      if (whitelistEmail === email) {
        return true; // 完美咬合匹配，放行通过
      }
    }
  } catch (err) {
    console.error("白名单数据流管道异常: " + err.message);
  }
  return false; // 默认没有登记的账号一律封杀
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
 * 之前的白名单只挡在 doGet 渲染管理端页面那一层，任何人只要打开公开的
 * 日历/总表网址、在浏览器控制台直接呼叫 google.script.run.createRecord(...)
 * 之类的写入函数，就能完全绕过白名单。这里把校验直接钉在写入函数本身，
 * 不管从哪个页面发起调用都逃不掉。
 */
function requireAdminAccess() {
  const email = Session.getActiveUser().getEmail();
  if (!checkAdminWhitelist(email)) {
    throw new Error(
      "⛔ 权限不足：您的账号（" +
        (email || "未登录/无法获取") +
        "）不在管理员白名单中，无法执行此操作。",
    );
  }
  return email;
}

// 🆕「填写人」留空时自动带出当前登入者的资料，格式："CHONG ZHI JIE 庄智杰 (zjchong@tsunjin.edu.my)"。
// 显示名（People API 才拿得到，Session.getActiveUser() 本身只有 email、没有名字）来自 Google 账号
// 自己的 People 资料，需要先在 Apps Script 编辑器左侧「服务 +」加上「Google People API」这个进阶服务
// （一次性设置，见 README/CLAUDE.md）。没加这个服务、或者 API 呼叫失败（例如该账号没有设置过
// 显示名），就自动退回只用 email，不会让整个提交失败。
function getCurrentUserDisplayLabel(operatorEmail) {
  const email = operatorEmail || Session.getActiveUser().getEmail() || "";
  try {
    if (
      typeof People !== "undefined" &&
      People.People &&
      typeof People.People.get === "function"
    ) {
      const profile = People.People.get("people/me", { personFields: "names" });
      const displayName =
        profile && profile.names && profile.names.length > 0
          ? profile.names[0].displayName
          : "";
      if (displayName) {
        return email ? `${displayName} (${email})` : displayName;
      }
    }
  } catch (e) {
    Logger.log(
      "getCurrentUserDisplayLabel: 取不到 Google 账号显示名（可能还没加 People API 服务），改用 email 顶替。" +
        e.message,
    );
  }
  return email || "未知使用者";
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

// 取得《特殊状态》工作表，第一次使用时自动建立（含表头样式、范例状态、时间栏位防呆格式）
function getOrCreateSpecialStatusSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SPECIAL_STATUS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SPECIAL_STATUS_SHEET_NAME);
    sheet.getRange(1, 1).setValue(SPECIAL_STATUS_TYPE_HEADER);
    sheet
      .getRange(
        1,
        SPECIAL_STATUS_RECORD_START_COL,
        1,
        SPECIAL_STATUS_RECORD_HEADERS.length,
      )
      .setValues([SPECIAL_STATUS_RECORD_HEADERS]);
    sheet.setFrozenRows(1);
    sheet
      .getRange(
        1,
        1,
        1,
        SPECIAL_STATUS_RECORD_START_COL +
          SPECIAL_STATUS_RECORD_HEADERS.length -
          1,
      )
      .setFontWeight("bold");
    sheet.setColumnWidth(1, 260);
    // 🔧 防止"使用日期"/"填写日期"被 Google 表格自动识别转成 Date（跟其他表同样的坑点）
    const useDateCol1 =
      SPECIAL_STATUS_RECORD_START_COL +
      SPECIAL_STATUS_RECORD_HEADERS.indexOf("使用日期");
    const fillDateCol1 =
      SPECIAL_STATUS_RECORD_START_COL +
      SPECIAL_STATUS_RECORD_HEADERS.indexOf("填写日期");
    sheet
      .getRange(2, useDateCol1, sheet.getMaxRows() - 1, 1)
      .setNumberFormat("@");
    sheet
      .getRange(2, fillDateCol1, sheet.getMaxRows() - 1, 1)
      .setNumberFormat("@");
    // 预先放几个常见范例，方便管理员上手（可以直接改文字/改颜色/删掉/新增更多行）
    sheet.getRange(2, 1, 3, 1).setValues([["维修"], ["考试场地"], ["不外借"]]);
  }
  return sheet;
}

// 🎨 读取 A 列的"状态类型定义"，逻辑跟 getUnitColorMap() 完全对应：按表格原始顺序、
// 同名只取第一次出现的颜色、跳过默认白色/没上色的格子（回传空字串，前端会给预设样式）。
// 跟 getUnitColorMap() 不同的地方：这里"没上色"的状态名称也要保留在清单里（回传 color:''），
// 因为 Admin.html 的打勾清单需要显示所有可选状态，颜色只是拿来做图例/矩阵染色用。
function getSpecialStatusesFromSheet() {
  try {
    const sheet = getOrCreateSpecialStatusSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    const backgrounds = sheet.getRange(2, 1, lastRow - 1, 1).getBackgrounds();
    const seen = new Set();
    const list = [];
    for (let i = 0; i < values.length; i++) {
      const name = String(values[i][0] || "").trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      const color = String(backgrounds[i][0] || "").toLowerCase();
      list.push({
        name: name,
        color: !color || color === "#ffffff" ? "" : color,
      });
    }
    return list;
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
  try {
    if (!payload || !payload.venues || payload.venues.length === 0)
      throw new Error("⛔ 请至少勾选一个场地。");
    if (!payload.statusNames || payload.statusNames.length === 0)
      throw new Error("⛔ 请至少勾选一个特殊状态。");
    if (!payload.useDate) throw new Error("⛔ 请选择日期。");

    let startParts = payload.useDate.split("-");
    let startDate = new Date(
      Number(startParts[0]),
      Number(startParts[1]) - 1,
      Number(startParts[2]),
    );
    let endDate = startDate;
    if (payload.endDate) {
      let endParts = payload.endDate.split("-");
      endDate = new Date(
        Number(endParts[0]),
        Number(endParts[1]) - 1,
        Number(endParts[2]),
      );
    }

    const recurSet =
      payload.recurWeekdays && payload.recurWeekdays.length > 0
        ? new Set(payload.recurWeekdays.map(Number))
        : null;

    if (recurSet) {
      let checkDate = new Date(startDate);
      let hasMatch = false;
      while (checkDate <= endDate) {
        if (recurSet.has(checkDate.getDay())) {
          hasMatch = true;
          break;
        }
        checkDate.setDate(checkDate.getDate() + 1);
      }
      if (!hasMatch) {
        throw new Error(
          "⛔ 所选的日期区间内，找不到任何一天符合勾选的星期几，请检查日期范围或星期几设置。",
        );
      }
    }

    // 场地编号 -> 场地名称 对照表，标记记录里直接存场地名称，方便之后不用每次都反查《场地编号》
    const venueNameMap = {};
    getVenuesFromSheet().forEach((v) => {
      venueNameMap[v.code] = v.name;
    });

    const sheet = getOrCreateSpecialStatusSheet();
    const timestamp = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy-MM-dd HH:mm:ss",
    );
    const todayStr = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy-MM-dd",
    );
    const formattedFillDate = formatDateStr(todayStr);

    const rowsToAppend = [];
    let current = new Date(startDate);
    while (current <= endDate) {
      if (!recurSet || recurSet.has(current.getDay())) {
        const dateString = Utilities.formatDate(
          current,
          Session.getScriptTimeZone(),
          "yyyy-MM-dd",
        );
        const formattedUseDate = formatDateStr(dateString);
        payload.venues.forEach((venueCode) => {
          payload.statusNames.forEach((statusName) => {
            const id = "SS_" + Utilities.getUuid();
            rowsToAppend.push([
              id,
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
      }
      current.setDate(current.getDate() + 1);
    }

    if (rowsToAppend.length === 0) {
      throw new Error("⛔ 没有产生任何要写入的记录，请检查日期设置。");
    }

    sheet
      .getRange(
        sheet.getLastRow() + 1,
        SPECIAL_STATUS_RECORD_START_COL,
        rowsToAppend.length,
        SPECIAL_STATUS_RECORD_HEADERS.length,
      )
      .setValues(rowsToAppend);

    const summary = `新增特殊状态：${payload.venues.join("、")} 设为「${payload.statusNames.join("、")}」，共 ${rowsToAppend.length} 笔`;
    logSpecialStatusAudit("新增特殊状态", operatorEmail, summary);

    return { success: true, count: rowsToAppend.length };
  } catch (err) {
    throw new Error(err.message);
  }
}

// 读取某个日期区间内的特殊状态标记（Table.html/Viewver.html 用，逻辑对齐 readRecordsForRange：
// 传回的 date 已经统一转回 "yyyy-MM-dd"，方便前端直接用字符串比较）
function readSpecialStatusForRange(startDateStr, endDateStr) {
  try {
    if (!startDateStr || !endDateStr) return [];
    const sheet = getOrCreateSpecialStatusSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    const colorMap = new Map(
      getSpecialStatusesFromSheet().map((s) => [s.name, s.color]),
    );
    const data = sheet
      .getRange(
        2,
        SPECIAL_STATUS_RECORD_START_COL,
        lastRow - 1,
        SPECIAL_STATUS_RECORD_HEADERS.length,
      )
      .getValues();
    const idIdx = SPECIAL_STATUS_RECORD_HEADERS.indexOf("ID");
    const venueIdx = SPECIAL_STATUS_RECORD_HEADERS.indexOf("场地编号");
    const venueNameIdx = SPECIAL_STATUS_RECORD_HEADERS.indexOf("场地名称");
    const statusIdx = SPECIAL_STATUS_RECORD_HEADERS.indexOf("状态名称");
    const dateIdx = SPECIAL_STATUS_RECORD_HEADERS.indexOf("使用日期");
    const fillerIdx = SPECIAL_STATUS_RECORD_HEADERS.indexOf("填写人");
    const results = [];
    for (let i = 0; i < data.length; i++) {
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
    const sheet = getOrCreateSpecialStatusSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    const data = sheet
      .getRange(
        2,
        SPECIAL_STATUS_RECORD_START_COL,
        lastRow - 1,
        SPECIAL_STATUS_RECORD_HEADERS.length,
      )
      .getValues();
    const idIdx = SPECIAL_STATUS_RECORD_HEADERS.indexOf("ID");
    const venueIdx = SPECIAL_STATUS_RECORD_HEADERS.indexOf("场地编号");
    const venueNameIdx = SPECIAL_STATUS_RECORD_HEADERS.indexOf("场地名称");
    const statusIdx = SPECIAL_STATUS_RECORD_HEADERS.indexOf("状态名称");
    const dateIdx = SPECIAL_STATUS_RECORD_HEADERS.indexOf("使用日期");
    const fillerIdx = SPECIAL_STATUS_RECORD_HEADERS.indexOf("填写人");
    const list = [];
    for (let i = 0; i < data.length; i++) {
      const id = data[i][idIdx];
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
// 这份数据量通常不大，直接整表读出来找对应的 ID 就好，不用像 batchDeleteRecords() 那样
// 跨多张月份工作表逐一扫描。
function deleteSpecialStatusEntries(ids) {
  const operatorEmail = requireAdminAccess(); // 🛡️ 写入前强制校验管理员白名单
  try {
    if (!ids || ids.length === 0) return { success: true, count: 0 };
    const sheet = getOrCreateSpecialStatusSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, count: 0 };
    const idSet = new Set(ids);
    const idColOffset = SPECIAL_STATUS_RECORD_HEADERS.indexOf("ID");
    const data = sheet
      .getRange(
        2,
        SPECIAL_STATUS_RECORD_START_COL,
        lastRow - 1,
        SPECIAL_STATUS_RECORD_HEADERS.length,
      )
      .getValues();
    let deletedCount = 0;
    for (let i = data.length - 1; i >= 0; i--) {
      if (idSet.has(data[i][idColOffset])) {
        sheet.deleteRow(i + 2); // data 是 0-index、且从工作表第 2 行开始，行号要 +2
        deletedCount++;
      }
    }
    if (deletedCount > 0) {
      logSpecialStatusAudit(
        "删除特殊状态",
        operatorEmail,
        `删除了 ${deletedCount} 笔特殊状态标记`,
      );
    }
    return { success: true, count: deletedCount };
  } catch (err) {
    throw new Error(err.message);
  }
}

// 特殊状态专用的简化版操作日志（跟 logAudit() 共用同一张《操作日志》表，但栏位形状对不上
// 一般借用记录的 HEADERS，所以摘要文字直接放进"活动"那一栏，其余栏位留空）
function logSpecialStatusAudit(actionType, operatorEmail, summaryText) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(AUDIT_SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(AUDIT_SHEET_NAME);
      sheet.appendRow([
        "时间",
        "操作类型",
        "操作人邮箱",
        "记录ID",
        "场地",
        "活动",
        "单位",
        "时间段",
      ]);
      sheet.setFrozenRows(1);
      sheet.getRange("A1:H1").setFontWeight("bold");
    }
    const now = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy-MM-dd HH:mm:ss",
    );
    sheet.appendRow([
      now,
      actionType,
      operatorEmail || "未知",
      "",
      "",
      summaryText,
      "",
      "",
    ]);
  } catch (e) {
    console.error("写入特殊状态操作日志失败: " + e.message);
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

function getVenuesFromSheet() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName("场地编号");
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

function readRecords() {
  let allRecords = [];
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets();
    sheets.forEach((sheet) => {
      if (sheet.getType() !== SpreadsheetApp.SheetType.GRID) return;
      const sheetName = sheet.getName();
      if (
        sheetName === "场地编号" ||
        sheetName === TRASH_SHEET_NAME ||
        sheetName === AUDIT_SHEET_NAME
      )
        return;
      const data = sheet.getDataRange().getValues();
      if (data.length > 1) {
        const headers = data[0];
        if (headers && headers[0] === "ID") {
          for (let i = 1; i < data.length; i++) {
            allRecords.push(rowToRecordObj(headers, data[i]));
          }
        }
      }
    });
  } catch (err) {
    throw new Error(err.message);
  }
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
function getTrashSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(TRASH_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(TRASH_SHEET_NAME);
    sheet.appendRow(["删除时间", "操作人邮箱"].concat(HEADERS));
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 2 + HEADERS.length).setFontWeight("bold");
    // 🔧 防止时间栏位被表格自动识别成 Date：前面有"删除时间""操作人邮箱"两栏偏移，
    // 时间(开始)/时间(结束) 在 HEADERS 里是第 5、6 栏，这里要 +2
    const startCol = HEADERS.indexOf("时间(开始)") + 1 + 2;
    const endCol = HEADERS.indexOf("时间(结束)") + 1 + 2;
    if (startCol > 2 && endCol > 2) {
      sheet.getRange(1, startCol, sheet.getMaxRows(), 2).setNumberFormat("@");
    }
  }
  return sheet;
}

function archiveToTrash(trashSheet, headers, rowValues, operatorEmail) {
  try {
    const deleteTime = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy-MM-dd HH:mm:ss",
    );
    // 如果这行来自尚未跑迁移的旧结构工作表（只有单一"时间"栏），先把组合文本拆成开始/结束，
    // 这样归档进回收站的记录也能对齐新结构，不会漏掉时间信息
    const hasSplitTime =
      headers.indexOf("时间(开始)") > -1 && headers.indexOf("时间(结束)") > -1;
    const legacyTimeIdx = headers.indexOf("时间");
    const legacySplit =
      !hasSplitTime && legacyTimeIdx > -1
        ? legacyTimeStringToStartEnd(rowValues[legacyTimeIdx])
        : null;

    // 按 HEADERS 固定顺序对齐，缺的栏位补空字符串，保证回收站格式统一
    const alignedRow = HEADERS.map((h) => {
      if (legacySplit && h === "时间(开始)") return legacySplit.start;
      if (legacySplit && h === "时间(结束)") return legacySplit.end;
      const idx = headers.indexOf(h);
      return idx === -1 ? "" : rowValues[idx];
    });
    trashSheet.appendRow(
      [deleteTime, operatorEmail || "未知"].concat(alignedRow),
    );
  } catch (e) {
    console.error("归档到回收站失败: " + e.message);
  }
}

function logAudit(actionType, operatorEmail, rowValues, headers) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(AUDIT_SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(AUDIT_SHEET_NAME);
      sheet.appendRow([
        "时间",
        "操作类型",
        "操作人邮箱",
        "记录ID",
        "场地",
        "活动",
        "单位",
        "时间段",
      ]);
      sheet.setFrozenRows(1);
      sheet.getRange("A1:H1").setFontWeight("bold");
    }
    const idIdx = headers.indexOf("ID");
    const venueIdx = headers.indexOf("场地");
    const eventIdx = headers.indexOf("活动");
    const unitIdx = headers.indexOf("单位");
    const now = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy-MM-dd HH:mm:ss",
    );
    sheet.appendRow([
      now,
      actionType,
      operatorEmail || "未知",
      idIdx > -1 ? rowValues[idIdx] : "",
      venueIdx > -1 ? rowValues[venueIdx] : "",
      eventIdx > -1 ? rowValues[eventIdx] : "",
      unitIdx > -1 ? rowValues[unitIdx] : "",
      formatRowTimeDisplay(headers, rowValues),
    ]);
  } catch (e) {
    console.error("写入操作日志失败: " + e.message);
  }
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

// 检查【某场地】在【某天】的【某时间段】（开始/结束的 "HH:MM" 字符串）是否与既有记录重叠
// excludeId：编辑记录时排除自己原本那一笔，避免跟自己"冲突"
function findVenueTimeConflict(
  venueCode,
  dateString,
  timeStartStr,
  timeEndStr,
  excludeId,
) {
  const newStart = timeStrToMinutes(timeStartStr);
  const newEnd = timeStrToMinutes(timeEndStr);
  if (newStart === null || newEnd === null || newEnd <= newStart) return null; // 新记录时间格式无法解析时不拦截

  const sheet = getSheetForDate(dateString);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return null;
  const data = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
  const headers = data[0];
  const idIdx = headers.indexOf("ID");
  const venueIdx = headers.indexOf("场地");
  const eventIdx = headers.indexOf("活动");
  const useDateIdx = headers.indexOf("使用日期");
  if (idIdx === -1 || venueIdx === -1 || useDateIdx === -1) return null;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (excludeId && String(row[idIdx]) === String(excludeId)) continue;
    if (String(row[venueIdx]).trim() !== String(venueCode).trim()) continue;
    if (normalizeDateToISO(row[useDateIdx]) !== dateString) continue;

    const existingRange = getRowTimeRangeMinutes(headers, row);
    if (!existingRange) continue; // 既有数据时间格式无法解析时不拦截（多半是历史遗留数据）

    // 区间重叠判定：newStart < existingEnd 且 existingStart < newEnd
    if (newStart < existingRange.end && existingRange.start < newEnd) {
      return {
        conflictId: row[idIdx],
        conflictEvent: row[eventIdx],
        conflictTime: formatRowTimeDisplay(headers, row),
      };
    }
  }
  return null;
}

function createRecord(record) {
  const operatorEmail = requireAdminAccess(); // 🛡️ 写入前强制校验管理员白名单
  try {
    // 🆕「填写人」留空就自动带出当前登入者的姓名+email，不强迫一定要手动填
    if (!record.filler || String(record.filler).trim() === "") {
      record.filler = getCurrentUserDisplayLabel(operatorEmail);
    }
    let startParts = record.useDate.split("-");
    let startDate = new Date(
      Number(startParts[0]),
      Number(startParts[1]) - 1,
      Number(startParts[2]),
    );
    let endDate = startDate;
    if (record.endDate) {
      let endParts = record.endDate.split("-");
      endDate = new Date(
        Number(endParts[0]),
        Number(endParts[1]) - 1,
        Number(endParts[2]),
      );
    }
    const timestamp = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy-MM-dd HH:mm:ss",
    );
    const formattedFillDate = formatDateStr(record.fillDate);

    // 🆕 按星期重复：例如"02月01日至03月01日的每个星期六"。record.recurWeekdays 是
    // 0~6 的星期几数组（0=周日...6=周六，对齐 JS Date.getDay()），只有传了这个字段
    // 才启用过滤，不影响原本"连续每天"的用法（未传或空数组 = 不过滤，维持原行为）
    const recurSet =
      record.recurWeekdays && record.recurWeekdays.length > 0
        ? new Set(record.recurWeekdays.map(Number))
        : null;

    if (recurSet) {
      // 先检查日期范围内到底有没有任何一天符合选中的星期几，避免用户选错日期区间/
      // 星期几组合导致什么都没写入却毫无提示
      let checkDate = new Date(startDate);
      let hasMatch = false;
      while (checkDate <= endDate) {
        if (recurSet.has(checkDate.getDay())) {
          hasMatch = true;
          break;
        }
        checkDate.setDate(checkDate.getDate() + 1);
      }
      if (!hasMatch) {
        throw new Error(
          "⛔ 所选的日期区间内，找不到任何一天符合勾选的星期几，请检查日期范围或星期几设置。",
        );
      }
    }

    // 🚧 第一步：先对整批「日期 × 场地」组合逐一扫描冲突，全部通过才真正写入，
    // 避免连续借用横跨多天时写到一半才撞档，留下半套脏数据
    let scanDate = new Date(startDate);
    while (scanDate <= endDate) {
      if (!recurSet || recurSet.has(scanDate.getDay())) {
        const scanDateString = Utilities.formatDate(
          scanDate,
          Session.getScriptTimeZone(),
          "yyyy-MM-dd",
        );
        for (let vi = 0; vi < record.venues.length; vi++) {
          const conflict = findVenueTimeConflict(
            record.venues[vi],
            scanDateString,
            record.timeStart,
            record.timeEnd,
            null,
          );
          if (conflict) {
            throw new Error(
              `⛔ 场地时段冲突：【${record.venues[vi]}】在 ${formatDateStr(scanDateString)} 已有借用记录「${conflict.conflictEvent}」（${conflict.conflictTime}），与本次提交的时间重叠，请修改时间或更换场地后再提交。`,
            );
          }
        }
      }
      scanDate.setDate(scanDate.getDate() + 1);
    }

    // ✅ 第二步：确认无冲突后才正式写入（按星期重复时，只写入符合勾选星期几的那些日期）
    let current = new Date(startDate);
    while (current <= endDate) {
      if (!recurSet || recurSet.has(current.getDay())) {
        let dateString = Utilities.formatDate(
          current,
          Session.getScriptTimeZone(),
          "yyyy-MM-dd",
        );
        const sheet = getSheetForDate(dateString);
        const formattedUseDate = formatDateStr(dateString);
        record.venues.forEach((venueCode) => {
          // 🛡️ 改用完整 UUID（原本只取前 8 位），大幅降低长期高频使用下的撞号概率
          const id = "ID_" + Utilities.getUuid();
          const rowValues = [
            id,
            venueCode,
            record.event,
            record.unit,
            record.timeStart,
            record.timeEnd,
            record.filler,
            formattedFillDate,
            formattedUseDate,
            timestamp,
          ];
          sheet.appendRow(rowValues);
          logAudit("新增", operatorEmail, rowValues, HEADERS);
        });
      }
      current.setDate(current.getDate() + 1);
    }
    return { success: true };
  } catch (err) {
    throw new Error(err.message);
  }
}

function batchDeleteRecords(ids) {
  const operatorEmail = requireAdminAccess(); // 🛡️ 写入前强制校验管理员白名单
  try {
    if (!ids || ids.length === 0) return { success: true, count: 0 };
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets();
    let deletedCount = 0;
    const idSet = new Set(ids);
    const trashSheet = getTrashSheet();
    sheets.forEach((sheet) => {
      if (sheet.getType() !== SpreadsheetApp.SheetType.GRID) return;
      const sheetName = sheet.getName();
      if (
        sheetName === "场地编号" ||
        sheetName === TRASH_SHEET_NAME ||
        sheetName === AUDIT_SHEET_NAME
      )
        return;
      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) return;
      const lastColumn = sheet.getLastColumn();
      const data = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
      const headers = data[0];
      if (!headers || headers[0] !== "ID") return;

      // ⚡ 性能优化：改成只删中标的那几行（从后往前删，避免删除后行号错位），
      // 不再是「整张表清空再整表重写」这种对大表很吃资源的做法
      for (let i = data.length - 1; i >= 1; i--) {
        if (idSet.has(data[i][0])) {
          archiveToTrash(trashSheet, headers, data[i], operatorEmail); // 🗑️ 先归档到回收站再真正删除，误删可复原
          logAudit("删除", operatorEmail, data[i], headers);
          sheet.deleteRow(i + 1); // data 是 0-index，工作表行号是 1-index，第 1 行是表头
          deletedCount++;
        }
      }
    });
    return { success: true, count: deletedCount };
  } catch (err) {
    throw new Error(err.message);
  }
}

function updateRecord(id, record) {
  const operatorEmail = requireAdminAccess(); // 🛡️ 写入前强制校验管理员白名单
  try {
    // 🆕「填写人」留空就自动带出当前登入者的姓名+email，不强迫一定要手动填
    if (!record.filler || String(record.filler).trim() === "") {
      record.filler = getCurrentUserDisplayLabel(operatorEmail);
    }
    let singleVenue =
      record.venues && record.venues.length > 0 ? record.venues[0] : "";

    // 🚧 编辑记录同样要检查冲突，但排除自己原本这一笔，避免跟自己"撞档"
    const conflict = findVenueTimeConflict(
      singleVenue,
      record.useDate,
      record.timeStart,
      record.timeEnd,
      id,
    );
    if (conflict) {
      throw new Error(
        `⛔ 场地时段冲突：【${singleVenue}】在 ${formatDateStr(record.useDate)} 已有借用记录「${conflict.conflictEvent}」（${conflict.conflictTime}），与本次修改后的时间重叠，请修改时间或更换场地后再保存。`,
      );
    }

    batchDeleteRecords([id]); // 旧版本会被归档到回收站、并留一笔"删除"审计记录
    const sheet = getSheetForDate(record.useDate);
    const formattedUseDate = formatDateStr(record.useDate);
    const formattedFillDate = formatDateStr(record.fillDate);
    const timestamp = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy-MM-dd HH:mm:ss",
    );
    const rowValues = [
      id,
      singleVenue,
      record.event,
      record.unit,
      record.timeStart,
      record.timeEnd,
      record.filler,
      formattedFillDate,
      formattedUseDate,
      timestamp,
    ];
    sheet.appendRow(rowValues);
    logAudit("修改", operatorEmail, rowValues, HEADERS);
    return { success: true };
  } catch (err) {
    throw new Error(err.message);
  }
}

function getSheetForDate(dateString) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const monthKey = dateString.substring(0, 7);
  let sheet = ss.getSheetByName(monthKey);
  if (!sheet) {
    sheet = ss.insertSheet(monthKey);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold"); // 表头栏位数改成跟着 HEADERS 走，不再写死到 I 列
    // 🔧 关键修复：时间(开始)/时间(结束) 两栏强制设成纯文本格式，防止表格把 "06:00"
    // 这种文本自动识别转存成 Date/时间序列值（这正是"借用时间显示成一大串英文 Date"
    // 这个问题的根源）。整栏都设，覆盖未来任何一行新增的数据。
    const startCol = HEADERS.indexOf("时间(开始)") + 1;
    const endCol = HEADERS.indexOf("时间(结束)") + 1;
    if (startCol > 0 && endCol > 0) {
      sheet.getRange(1, startCol, sheet.getMaxRows(), 2).setNumberFormat("@");
    }
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  let migratedCount = 0;
  const migratedSheetNames = [];

  sheets.forEach((sheet) => {
    if (sheet.getType() !== SpreadsheetApp.SheetType.GRID) return;
    const sheetName = sheet.getName();
    if (
      sheetName === "场地编号" ||
      sheetName === TRASH_SHEET_NAME ||
      sheetName === AUDIT_SHEET_NAME
    )
      return;

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
// 📢 Table.html 矩阵总表右侧公告栏：读取指定 Google 文档内容
// ====================================================================
// 想法是管理员平常要改公告，只要去编辑这份 Google 文档就好，不用碰任何代码、也不用重新部署——
// 矩阵总表每次打开、以及开着的分页每 5 分钟都会自动重新读一次这份文档的最新内容。
//
// ⚠️ 部署后请把下面这个 ID 换成你实际要显示的 Google 文档：网址
// https://docs.google.com/document/d/【这一串】/edit 里、/d/ 和 /edit 之间的那一串英数字。
// 留空或维持预设值的话，公告栏会显示"尚未设置"，不会影响矩阵总表其他功能。
const ANNOUNCEMENT_DOC_ID = "1C9Wgde61e_GvjFKORJ8NJcmSEPn07eVgzLI8mGelB_Y";

function getAnnouncementHtml() {
  try {
    const docId = String(ANNOUNCEMENT_DOC_ID || "").trim();
    if (!docId) {
      return { configured: false, html: "", updated: "" };
    }
    const doc = DocumentApp.openById(docId);
    const html = docBodyToHtml(doc.getBody());

    let updated = "";
    try {
      const file = DriveApp.getFileById(docId);
      updated = Utilities.formatDate(
        file.getLastUpdated(),
        Session.getScriptTimeZone(),
        "yyyy-MM-dd HH:mm",
      );
    } catch (ignoreErr) {
      // 拿不到最后修改时间不影响公告本身显示，安静跳过就好
    }

    return { configured: true, html: html, updated: updated };
  } catch (err) {
    // 🛡️ 常见失败原因：ID 填错、文档被删除、或脚本执行者的账号没有这份文档的查看权限——
    // 不管哪一种都不该让整个矩阵总表页面挂掉，只在公告栏本身显示错误信息
    return { configured: true, html: "", updated: "", error: err.message };
  }
}

// 🔑 一次性授权用：第一次加上公告栏功能后，请在 Apps Script 编辑器里手动选中
// 这个函数、点击「运行」执行一次，跳出的 Google 权限确认视窗直接允许即可。
//
// 为什么需要这一步：这个项目原本已经授权过一次（读取 Sheets 之类），后来才新增
// DocumentApp/DriveApp 相关代码，但已经部署好的网页应用是「非互动」执行环境，
// 没办法自己跳出授权视窗要新权限——一定要在编辑器里（互动环境）手动跑一次
// 会用到新服务的函数，才能跳出授权视窗。跑这一次之后，已经部署好的网址
// 不用重新部署新版本，直接就能正常读取公告文档了（因为执行身份/授权是同一个
// Google 账号，网页应用会沿用这次授权的结果）。
//
// 如果 ANNOUNCEMENT_DOC_ID 还没填、或填错，这个函数一样能跑完，只是回传结果里
// configured/error 会告诉你实际状况，方便排查。
function authorizeAnnouncementDocAccess() {
  const result = getAnnouncementHtml();
  Logger.log(JSON.stringify(result));
  return result;
}

// 把 Google 文档的 Body 转成 HTML：段落/标题/条列表都处理，
// 文字的粗体/斜体/底线/颜色/超链接也会尽量保留，图片、表格等暂不处理（公告用不太到，先跳过避免出错）
function docBodyToHtml(body) {
  let html = "";
  let listOpenTag = ""; // 目前正开着的 <ul> 或 <ol>，空字符串代表没有开着的清单
  const numChildren = body.getNumChildren();

  function closeListIfOpen() {
    if (listOpenTag) {
      html += "</" + listOpenTag + ">";
      listOpenTag = "";
    }
  }

  for (let i = 0; i < numChildren; i++) {
    const el = body.getChild(i);
    const type = el.getType();

    if (type === DocumentApp.ElementType.LIST_ITEM) {
      const item = el.asListItem();
      const isOrdered = item.getGlyphType() === DocumentApp.GlyphType.NUMBER;
      const wantTag = isOrdered ? "ol" : "ul";
      if (listOpenTag !== wantTag) {
        closeListIfOpen();
        html += "<" + wantTag + ">";
        listOpenTag = wantTag;
      }
      html += "<li>" + textElementToHtml(item.editAsText()) + "</li>";
      continue;
    }

    closeListIfOpen();

    if (type === DocumentApp.ElementType.PARAGRAPH) {
      const para = el.asParagraph();
      const inner = textElementToHtml(para.editAsText());
      if (!inner.trim()) {
        // 空白段落当成一行小空隙，不然公告文档里段落间的空行会整个消失、排版跟原文档差很多
        html += '<p class="ann-blank">&nbsp;</p>';
        continue;
      }
      const tag = headingToHtmlTag(para.getHeading());
      html += "<" + tag + ">" + inner + "</" + tag + ">";
    }
    // 表格/图片/分隔线等其他元素类型：公告内容通常用不到，先不处理，避免为了少见情况把逻辑搞复杂
  }
  closeListIfOpen();
  return html;
}

function headingToHtmlTag(heading) {
  const H = DocumentApp.ParagraphHeading;
  switch (heading) {
    case H.TITLE:
      return "h2";
    case H.HEADING1:
      return "h3";
    case H.SUBTITLE:
      return "h4";
    case H.HEADING2:
      return "h4";
    case H.HEADING3:
      return "h5";
    case H.HEADING4:
      return "h5";
    case H.HEADING5:
      return "h5";
    case H.HEADING6:
      return "h5";
    default:
      return "p";
  }
}

// 把一段 Text 元素按字符属性的分段点切开，逐段包上 <b>/<i>/<u>/颜色/超链接，
// 尽量还原在 Google 文档里手动设置的格式
function textElementToHtml(textEl) {
  const content = textEl.getText();
  if (!content) return "";
  const indices = textEl.getTextAttributeIndices();
  let html = "";
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i];
    const end = i + 1 < indices.length ? indices[i + 1] : content.length;
    const segment = content.substring(start, end);
    if (!segment) continue;
    html += wrapTextSegment(textEl, start, escapeHtmlDoc(segment));
  }
  return html;
}

function wrapTextSegment(textEl, offset, escapedSegment) {
  let seg = escapedSegment.replace(/\n/g, "<br>");

  const styles = [];
  const color = textEl.getForegroundColor(offset);
  if (color) styles.push("color:" + color);
  const bg = textEl.getBackgroundColor(offset);
  if (bg) styles.push("background-color:" + bg);
  if (styles.length) {
    seg = '<span style="' + styles.join(";") + '">' + seg + "</span>";
  }

  const linkUrl = textEl.getLinkUrl(offset);
  if (linkUrl) {
    seg =
      '<a href="' +
      escapeHtmlDoc(linkUrl) +
      '" target="_blank" rel="noopener">' +
      seg +
      "</a>";
  }

  if (textEl.isUnderline(offset)) seg = "<u>" + seg + "</u>";
  if (textEl.isItalic(offset)) seg = "<i>" + seg + "</i>";
  if (textEl.isBold(offset)) seg = "<b>" + seg + "</b>";

  return seg;
}

function escapeHtmlDoc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
