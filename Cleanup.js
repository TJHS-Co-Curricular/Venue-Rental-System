/**
 * ====================================================================
 * 🗑️ 定期清理工具 (Cleanup.gs)
 * ====================================================================
 * 独立于 Code.gs 的一个文件，专门负责定期清掉《已删除记录(回收站)》和《操作日志》里
 * 太旧的历史记录，避免这两张表随着系统长期使用无限膨胀（借用记录本身按月分表、
 * 不会有这个问题，但回收站/日志是所有月份共用同一张表，一直往下长）。
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
 * 3. 之后每个月 1 号凌晨左右会自动执行一次 cleanupOldTrashAndAuditLogs()，不需要再手动跑。
 *
 * 如果想改成保留更长/更短的时间，改下面 CLEANUP_RETENTION_MONTHS 这个数字就好，
 * 改完不需要重新执行 installMonthlyCleanupTrigger()（触发器只是定期"叫醒"这个函数，
 * 函数本身的逻辑随时都是读最新版本的代码）。
 *
 * 如果想取消这个自动清理，运行一次 uninstallMonthlyCleanupTrigger() 即可。
 */

const CLEANUP_RETENTION_MONTHS = 3; // 🗑️ 回收站 / 操作日志保留最近几个月的记录，超过就自动清掉

/**
 * 真正执行清理的函数：把《已删除记录(回收站)》和《操作日志》里，比
 * "现在往前推 CLEANUP_RETENTION_MONTHS 个月"还要旧的记录整行删掉。
 * 每月定时触发器会自动呼叫这个函数；也可以在 Apps Script 编辑器手动选它运行来立即清一次。
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
    const summary = `🗑️ 定期清理完成（保留最近 ${CLEANUP_RETENTION_MONTHS} 个月）：回收站清掉 ${trashRemoved} 行，`
      + `操作日志清掉 ${auditRemoved} 行（清理界线：${cutoffLabel} 之前的记录）。`;
    Logger.log(summary);
    return summary;
  } catch (err) {
    Logger.log('❌ 定期清理失败: ' + err.message);
    throw new Error(err.message);
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

  const summary = `✅ 已建立每月自动清理触发器：每个月 1 号凌晨 3 点左右会自动执行一次 cleanupOldTrashAndAuditLogs()`
    + `（保留最近 ${CLEANUP_RETENTION_MONTHS} 个月的回收站/操作日志记录）`
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
