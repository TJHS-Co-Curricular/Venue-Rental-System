/**
 * ====================================================================
 * 🗑️ 定期清理工具 (Cleanup.gs)
 * ====================================================================
 * 独立于 Code.gs 的一个文件，专门负责两件互相独立的定期清理工作：
 *   1. 《已删除记录(回收站)》和《操作日志》——这两张表是所有月份共用同一张表，
 *      随着系统长期使用会一直往下长，太旧的行定期清掉即可（默认保留 3 个月）。
 *   2. 场地借用记录本身（按月分表，例如 "2027-01" 这种工作表）——预设是永久保留，
 *      但可以设定一个保留年限（默认 2 年），超过的整张月份工作表会被直接删掉。
 *      ⚠️ 这个跟第 1 点不一样：删掉的是真正的借用记录、而且是整张表一起永久删除、
 *      不会进回收站，详细注意事项看下面 CLEANUP_BOOKING_RETENTION_YEARS 那段说明。
 *
 * ⚠️ 这个文件要跟 Code.gs 放在同一个 Apps Script 项目里才能用——它直接沿用 Code.gs 里
 * 已经定义好的 TRASH_SHEET_NAME / AUDIT_SHEET_NAME 常量（同一个 Apps Script 项目里，
 * 所有 .gs 文件共享同一个全局作用域，不需要重复定义或 import）。
 *
 * ====================================================================
 * 使用方法（只需要做一次）：
 * ====================================================================
 * 1. 把这份文件连同 Code.gs 一起贴到 Apps Script 编辑器里存档（或用 clasp push）。
 * 2. 在编辑器顶部的函数下拉选单里选择 installMonthlyCleanupTrigger，点击「运行」执行一次
 *    （第一次运行会跳出权限授权，除了原本的表格读写权限，这次还会多要一个"管理你的
 *    触发器"的权限，正常允许即可）。
 * 3. 之后每个月 1 号凌晨左右会自动执行一次 cleanupOldTrashAndAuditLogs()——这个函数
 *    现在会一次处理上面两件事（回收站/日志 + 场地借用记录），不需要再手动跑，
 *    也不需要为了场地借用记录清理另外装一个触发器。
 *
 * 如果想改保留时间，改下面对应的常量数字就好：
 *   - CLEANUP_RETENTION_MONTHS：回收站 / 操作日志保留几个月
 *   - CLEANUP_BOOKING_RETENTION_YEARS：场地借用记录（月份工作表）保留几年，设成
 *     0 或负数可以关闭这个功能（关闭后场地借用记录永久保留，不会被自动删除）
 * 改完都不需要重新执行 installMonthlyCleanupTrigger()（触发器只是定期"叫醒"这个函数，
 * 函数本身的逻辑随时都是读最新版本的代码）。
 *
 * 如果想取消这整个自动清理（两件事一起停），运行一次 uninstallMonthlyCleanupTrigger() 即可。
 */

const CLEANUP_RETENTION_MONTHS = 3; // 🗑️ 回收站 / 操作日志保留最近几个月的记录，超过就自动清掉

// 🗓️ 场地借用记录（按月分表，例如 "2027-01"）保留最近几"年"，超过就把整张月份
// 工作表直接删掉。设成 0 或负数会关闭这个功能（场地借用记录永久保留，不会被清）。
//
// ⚠️ 重要，务必先看清楚：这个跟上面的回收站/日志清理完全不同性质——
//   - 删除单位是「整张月份工作表」，不是挑单行删（因为一张 "2027-01" 表里所有行
//     的"使用日期"本来就都落在 2027 年 1 月，没有"只留一部分"这回事）。
//   - 删掉的是场地借用记录「本体」，不是回收站里已经软删除的东西——被这个功能删掉的
//     月份工作表不会进《已删除记录(回收站)》，也没有任何地方可以恢复，是真正
//     永久性的删除。改这个数字、或第一次开启这个功能之前，请先确认这是你要的行为。
const CLEANUP_BOOKING_RETENTION_YEARS = 2; // 🗓️ 场地借用记录保留最近几年（例：2 = 保留最近 2 年，例如 2029 年时会清掉 2027 年及更早的记录）

/**
 * 真正执行清理的函数（每月定时触发器会自动呼叫这个函数；也可以在 Apps Script
 * 编辑器手动选它运行来立即清一次）。函数名维持原本的 cleanupOldTrashAndAuditLogs
 * 没有改——因为如果你之前已经跑过 installMonthlyCleanupTrigger()，已经装好的
 * 触发器绑定的就是这个函数名，改名字会让旧触发器失效；所以新加的场地借用记录
 * 清理直接并进同一个函数里一起执行，不需要另外装新的触发器。
 *
 * 依序做两件事：
 *   1. 把《已删除记录(回收站)》和《操作日志》里，比"现在往前推
 *      CLEANUP_RETENTION_MONTHS 个月"还要旧的记录整行删掉。
 *   2. 呼叫 cleanupOldBookingMonthSheets()，视 CLEANUP_BOOKING_RETENTION_YEARS
 *      设定清掉太旧的场地借用记录月份工作表（设成 0/负数则这一步会直接跳过）。
 */
function cleanupOldTrashAndAuditLogs() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - CLEANUP_RETENTION_MONTHS);

    // 两张表的第一栏都是时间戳：回收站是「删除时间」，操作日志是「时间」
    const trashSheet = ss.getSheetByName(TRASH_SHEET_NAME);
    const auditSheet = ss.getSheetByName(AUDIT_SHEET_NAME);

    const trashRemoved = cleanupSheetRowsOlderThan(trashSheet, 1, cutoffDate);
    const auditRemoved = cleanupSheetRowsOlderThan(auditSheet, 1, cutoffDate);

    const cutoffLabel = Utilities.formatDate(cutoffDate, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
    let summary = `🗑️ 定期清理完成（回收站/操作日志保留最近 ${CLEANUP_RETENTION_MONTHS} 个月）：回收站清掉 ${trashRemoved} 行，`
      + `操作日志清掉 ${auditRemoved} 行（清理界线：${cutoffLabel} 之前的记录）。`;

    const bookingSummary = cleanupOldBookingMonthSheets();
    summary += ' ' + bookingSummary;

    Logger.log(summary);
    return summary;
  } catch (err) {
    Logger.log('❌ 定期清理失败: ' + err.message);
    throw new Error(err.message);
  }
}

/**
 * 🗓️ 清掉太旧的场地借用记录：扫描所有名字符合 "yyyy-MM" 格式的月份工作表
 * （例如 "2027-01"），只要那个月份比"现在往前推 CLEANUP_BOOKING_RETENTION_YEARS
 * 年"还要旧，就把整张工作表永久删掉。CLEANUP_BOOKING_RETENTION_YEARS 设成 0 或
 * 负数时这个函数直接跳过、不做任何事（场地借用记录永久保留）。
 *
 * ⚠️ 再次提醒：这个删除是真正永久性的，删掉的月份工作表不会进《已删除记录(回收站)》、
 * 也没有地方能救回来——回收站只接住管理端手动删除单笔记录的情况，不包含这种整张
 * 月份表一起清掉的批次清理。
 *
 * 设计上是整张表一起删、不是挑行删：工作表本来就是照"使用日期"所在月份分的，
 * 一张 "2027-01" 表里所有行的使用日期本来就都落在 2027 年 1 月，没有"部分保留"
 * 这回事，整张删掉最干净、也最快（不用一行一行读值判断，直接砍掉整张表）。
 */
function cleanupOldBookingMonthSheets() {
  if (!CLEANUP_BOOKING_RETENTION_YEARS || CLEANUP_BOOKING_RETENTION_YEARS <= 0) {
    return 'ℹ️ 场地借用记录清理功能目前是关闭的（CLEANUP_BOOKING_RETENTION_YEARS 设成 0 或负数），借用记录会永久保留。';
  }
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const now = new Date();
    const cutoffMonthStart = new Date(now.getFullYear() - CLEANUP_BOOKING_RETENTION_YEARS, now.getMonth(), 1);

    const sheets = ss.getSheets();
    const monthSheetNamePattern = /^(\d{4})-(\d{2})$/;
    let removedCount = 0;
    const removedSheetNames = [];

    sheets.forEach((sheet) => {
      if (sheet.getType() !== SpreadsheetApp.SheetType.GRID) return;
      const sheetName = sheet.getName();
      const m = monthSheetNamePattern.exec(sheetName);
      if (!m) return; // 名字不是 "yyyy-MM" 格式的，一律不是借用记录月份表，跳过

      // 双重保险：再确认一次表头第一格是不是 "ID"，确定真的是借用记录数据表
      // （理论上名字符合 yyyy-MM 格式的表就只会是月份记录表，这里多一层保护）
      if (sheet.getLastColumn() < 1) return;
      const firstHeaderCell = sheet.getRange(1, 1).getValue();
      if (firstHeaderCell !== "ID") return;

      const sheetMonthStart = new Date(Number(m[1]), Number(m[2]) - 1, 1);
      if (sheetMonthStart < cutoffMonthStart) {
        ss.deleteSheet(sheet);
        removedCount++;
        removedSheetNames.push(sheetName);
      }
    });

    return removedCount > 0
      ? `🗓️ 场地借用记录清理完成（保留最近 ${CLEANUP_BOOKING_RETENTION_YEARS} 年）：永久删除了 ${removedCount} 张月份工作表：${removedSheetNames.join('、')}。`
      : `ℹ️ 场地借用记录清理：没有找到超过 ${CLEANUP_BOOKING_RETENTION_YEARS} 年保留期限的月份工作表。`;
  } catch (err) {
    Logger.log('❌ 场地借用记录清理失败: ' + err.message);
    return `❌ 场地借用记录清理失败: ${err.message}`;
  }
}

/**
 * 把某张表里，第 dateColIndex1 栏（1-index）时间早于 cutoffDate 的行整行删掉。
 * 兼容该栏位可能是 Date 对象、也可能是文本时间戳的情况（跟 Code.gs 的 cellTimeToString
 * 是同样的思路：Google 表格常常会把看起来像日期时间的文本自动转成 Date）。
 * 从最后一行往上删，避免删除后行号错位。
 */
function cleanupSheetRowsOlderThan(sheet, dateColIndex1, cutoffDate) {
  if (!sheet) return 0; // 表还不存在（例如系统还没产生过任何删除/操作记录），直接跳过
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0; // 只有表头或整张空表，没东西可清

  const lastColumn = sheet.getLastColumn();
  const data = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  let removedCount = 0;

  for (let i = data.length - 1; i >= 1; i--) { // 第 0 行是表头，跳过；从下往上删
    const parsedDate = parseLogTimestamp(data[i][dateColIndex1 - 1]);
    if (parsedDate && parsedDate < cutoffDate) {
      sheet.deleteRow(i + 1); // data 是 0-index，工作表行号是 1-index
      removedCount++;
    }
    // 解析不出时间的行（脏数据/格式异常）一律不清，避免误删无法辨认时间的记录
  }
  return removedCount;
}

/**
 * 把一个可能是 Date 对象、也可能是 "yyyy-MM-dd HH:mm:ss" 文本的值，统一解析成 Date 对象。
 * 解析不出来就返回 null（调用方会因此跳过这一行，不会误删）。
 */
function parseLogTimestamp(val) {
  if (val instanceof Date) return val;
  const str = String(val || '').trim();
  if (!str) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(str);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  }
  const fallback = new Date(str);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * 🔧【一次性安装工具】建立一个"每月 1 号凌晨自动执行 cleanupOldTrashAndAuditLogs()"的
 * 时间驱动触发器。只需要在 Apps Script 编辑器里手动运行这一个函数一次即可，之后系统
 * 会自动按月清理，不需要再管。重复运行也不会建出重复的触发器（会先清掉同名的旧触发器）。
 */
function installMonthlyCleanupTrigger() {
  const removedOld = removeCleanupTriggers();

  ScriptApp.newTrigger('cleanupOldTrashAndAuditLogs')
    .timeBased()
    .onMonthDay(1)
    .atHour(3)
    .create();

  const bookingRetentionLabel = (!CLEANUP_BOOKING_RETENTION_YEARS || CLEANUP_BOOKING_RETENTION_YEARS <= 0)
    ? '场地借用记录永久保留、不清理'
    : `场地借用记录保留最近 ${CLEANUP_BOOKING_RETENTION_YEARS} 年`;
  const summary = `✅ 已建立每月自动清理触发器：每个月 1 号凌晨 3 点左右会自动执行一次 cleanupOldTrashAndAuditLogs()`
    + `（回收站/操作日志保留最近 ${CLEANUP_RETENTION_MONTHS} 个月，${bookingRetentionLabel}）`
    + (removedOld > 0 ? `，同时移除了 ${removedOld} 个重复的旧触发器` : '') + '。';
  Logger.log(summary);
  return summary;
}

/**
 * 取消每月自动清理（如果之后不想要这个功能了，运行这个函数一次即可）。
 */
function uninstallMonthlyCleanupTrigger() {
  const removed = removeCleanupTriggers();
  const summary = removed > 0
    ? `✅ 已移除 ${removed} 个每月自动清理触发器，之后不会再自动清理回收站/操作日志。`
    : 'ℹ️ 没有找到需要移除的自动清理触发器（可能本来就没安装过）。';
  Logger.log(summary);
  return summary;
}

function removeCleanupTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'cleanupOldTrashAndAuditLogs') {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  return removed;
}
