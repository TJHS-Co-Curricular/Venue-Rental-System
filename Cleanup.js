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
 *   - CLEANUP_BOOKING_RETENTION_YEARS：场地借用记录（月份工作表）保留几个日历年，设成
 *     0 或负数可以关闭这个功能（关闭后场地借用记录永久保留，不会被自动删除）
 * 改完都不需要重新执行 installMonthlyCleanupTrigger()（触发器只是定期"叫醒"这个函数，
 * 函数本身的逻辑随时都是读最新版本的代码）。
 *
 * 如果想取消这整个自动清理（两件事一起停），运行一次 uninstallMonthlyCleanupTrigger() 即可。
 */

const CLEANUP_RETENTION_MONTHS = 3; // 🗑️ 回收站 / 操作日志保留最近几个月的记录，超过就自动清掉

// 🗓️ 场地借用记录（按月分表，例如 "2027-01"）保留几个「日历年」，超过就把整张月份
// 工作表直接删掉。设成 0 或负数会关闭这个功能（场地借用记录永久保留，不会被清）。
//
// 计算方式是按「年份」不是按「月份」：设成 2 = 保留今年 + 去年。
//   例：2029 年 1 月 1 日的定期清理会删掉 2027 年（以及更早）的全部月份表，
//       2028、2029 年的记录保留。也就是"29 年才删除 27 年的记录"。
//
// ⚠️ 重要，务必先看清楚：这个跟上面的回收站/日志清理完全不同性质——
//   - 删除单位是「整张月份工作表」，不是挑单行删（因为一张 "2027-01" 表里所有行
//     的"使用日期"本来就都落在 2027 年 1 月，没有"只留一部分"这回事）。
//   - 删掉的是场地借用记录「本体」，不是回收站里已经软删除的东西——被这个功能删掉的
//     月份工作表不会进《已删除记录(回收站)》，也没有任何地方可以恢复，是真正
//     永久性的删除。改这个数字、或第一次开启这个功能之前，请先确认这是你要的行为。
const CLEANUP_BOOKING_RETENTION_YEARS = 2;

const CLEANUP_TRIGGER_HANDLER = "cleanupOldTrashAndAuditLogs";

/**
 * 真正执行清理的函数（每月定时触发器会自动呼叫这个函数；也可以在 Apps Script
 * 编辑器手动选它运行来立即清一次）。函数名维持原本的 cleanupOldTrashAndAuditLogs
 * 没有改——已经装好的触发器绑定的就是这个函数名，改名字会让旧触发器失效。
 *
 * 🔐 权限：只有两种情况能执行——① 每月定时触发器（会带着真实的触发器 ID 进来），
 * ② 系统拥有者本人在编辑器手动运行。其他人就算在浏览器控制台用 google.script.run
 * 呼叫这个函数，也会被拒绝（以前任何登入学校网域的人都能触发永久删除）。
 *
 * 依序做两件事：
 *   1. 把《已删除记录(回收站)》和《操作日志》里，比"现在往前推
 *      CLEANUP_RETENTION_MONTHS 个月"还要旧的记录整行删掉。
 *   2. 视 CLEANUP_BOOKING_RETENTION_YEARS 设定清掉太旧的场地借用记录月份工作表
 *      （设成 0/负数则这一步会直接跳过）。
 */
function cleanupOldTrashAndAuditLogs(e) {
  if (!isGenuineTriggerEvent_(e, CLEANUP_TRIGGER_HANDLER)) requireOwner_();
  return withScriptLock_(runScheduledCleanup_);
}

function runScheduledCleanup_() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - CLEANUP_RETENTION_MONTHS);

    // 两张表的第一栏都是时间戳：回收站是「删除时间」，操作日志是「时间」
    const trashRemoved = cleanupSheetRowsOlderThan_(ss.getSheetByName(TRASH_SHEET_NAME), 1, cutoffDate);
    const auditRemoved = cleanupSheetRowsOlderThan_(ss.getSheetByName(AUDIT_SHEET_NAME), 1, cutoffDate);

    const cutoffLabel = Utilities.formatDate(cutoffDate, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
    let summary = `🗑️ 定期清理完成（回收站/操作日志保留最近 ${CLEANUP_RETENTION_MONTHS} 个月）：回收站清掉 ${trashRemoved} 行，`
      + `操作日志清掉 ${auditRemoved} 行（清理界线：${cutoffLabel} 之前的记录）。`;

    summary += ' ' + cleanupOldBookingMonthSheets_();

    Logger.log(summary);
    return summary;
  } catch (err) {
    Logger.log('❌ 定期清理失败: ' + err.message);
    throw new Error(err.message);
  }
}

// 判断这次呼叫是不是真的由本项目的时间驱动触发器发起的：触发器的事件物件会带
// triggerUid，而且这个 ID 必须对得上项目里真实存在、且绑定同一个函数的触发器。
// 浏览器那边就算自己捏造一个 {triggerUid: "..."} 传进来，也对不上真实的 ID。
function isGenuineTriggerEvent_(e, handlerName) {
  if (!e || typeof e !== 'object' || !e.triggerUid) return false;
  try {
    return ScriptApp.getProjectTriggers().some(
      (t) => t.getUniqueId() === String(e.triggerUid) && t.getHandlerFunction() === handlerName,
    );
  } catch (err) {
    return false;
  }
}

/**
 * 🔧 手动立即清理太旧的场地借用记录月份表（拥有者在编辑器运行用；平常不需要，
 * 每月的定期清理会自动处理）。
 */
function cleanupOldBookingMonthSheets() {
  requireOwner_();
  return withScriptLock_(cleanupOldBookingMonthSheets_);
}

/**
 * 🗓️ 清掉太旧的场地借用记录：扫描所有名字符合 "yyyy-MM" 格式的月份工作表
 * （例如 "2027-01"），年份早于「今年 - (CLEANUP_BOOKING_RETENTION_YEARS - 1)」的
 * 整张表永久删掉。CLEANUP_BOOKING_RETENTION_YEARS 设成 0 或负数时直接跳过。
 *
 * ⚠️ 再次提醒：这个删除是真正永久性的，删掉的月份工作表不会进《已删除记录(回收站)》、
 * 也没有地方能救回来。
 */
function cleanupOldBookingMonthSheets_() {
  if (!CLEANUP_BOOKING_RETENTION_YEARS || CLEANUP_BOOKING_RETENTION_YEARS <= 0) {
    return 'ℹ️ 场地借用记录清理功能目前是关闭的（CLEANUP_BOOKING_RETENTION_YEARS 设成 0 或负数），借用记录会永久保留。';
  }
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const currentYear = Number(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy"));
    const oldestKeptYear = currentYear - (CLEANUP_BOOKING_RETENTION_YEARS - 1);

    const monthSheetNamePattern = /^(\d{4})-(\d{2})$/;
    let removedCount = 0;
    const removedSheetNames = [];

    ss.getSheets().forEach((sheet) => {
      if (sheet.getType() !== SpreadsheetApp.SheetType.GRID) return;
      const sheetName = sheet.getName();
      const m = monthSheetNamePattern.exec(sheetName);
      if (!m) return; // 名字不是 "yyyy-MM" 格式的，一律不是借用记录月份表，跳过

      // 双重保险：再确认一次表头第一格是不是 "ID"，确定真的是借用记录数据表
      if (sheet.getLastColumn() < 1) return;
      if (sheet.getRange(1, 1).getValue() !== "ID") return;

      if (Number(m[1]) < oldestKeptYear) {
        ss.deleteSheet(sheet);
        removedCount++;
        removedSheetNames.push(sheetName);
      }
    });

    return removedCount > 0
      ? `🗓️ 场地借用记录清理完成（保留 ${oldestKeptYear} 年起的记录）：永久删除了 ${removedCount} 张月份工作表：${removedSheetNames.join('、')}。`
      : `ℹ️ 场地借用记录清理：没有找到 ${oldestKeptYear} 年以前的月份工作表。`;
  } catch (err) {
    Logger.log('❌ 场地借用记录清理失败: ' + err.message);
    return `❌ 场地借用记录清理失败: ${err.message}`;
  }
}

/**
 * 把某张表里，第 dateColIndex1 栏（1-index）时间早于 cutoffDate 的行删掉。
 * ⚡ 回收站/操作日志本来就是按时间顺序一行一行往下加的，所以要删的通常是"最上面连续的
 * 一大段"——这一段用一次 deleteRows() 整段删掉（以前是一行一行 deleteRow，第一次清理
 * 大量旧日志时可能超过 6 分钟执行上限）。万一中间夹着顺序乱掉的旧行，再个别删除。
 * 解析不出时间的行一律不清，避免误删。
 */
function cleanupSheetRowsOlderThan_(sheet, dateColIndex1, cutoffDate) {
  if (!sheet) return 0; // 表还不存在（例如系统还没产生过任何删除/操作记录），直接跳过
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;

  const values = sheet.getRange(2, dateColIndex1, lastRow - 1, 1).getValues();
  const isOld = (v) => {
    const d = parseLogTimestamp(v[0]);
    return !!d && d < cutoffDate;
  };

  let prefix = 0;
  while (prefix < values.length && isOld(values[prefix])) prefix++;

  const scattered = [];
  for (let i = prefix; i < values.length; i++) {
    if (isOld(values[i])) scattered.push(i + 2); // 工作表行号（第 1 行是表头）
  }

  ensureSpareRow_(sheet); // 不能删到一行非冻结行都不剩
  for (let j = scattered.length - 1; j >= 0; j--) sheet.deleteRow(scattered[j]);
  if (prefix > 0) sheet.deleteRows(2, prefix);
  return prefix + scattered.length;
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
  requireOwner_();
  const removedOld = removeCleanupTriggers_();

  ScriptApp.newTrigger(CLEANUP_TRIGGER_HANDLER)
    .timeBased()
    .onMonthDay(1)
    .atHour(3)
    .create();

  const bookingRetentionLabel = (!CLEANUP_BOOKING_RETENTION_YEARS || CLEANUP_BOOKING_RETENTION_YEARS <= 0)
    ? '场地借用记录永久保留、不清理'
    : `场地借用记录保留 ${CLEANUP_BOOKING_RETENTION_YEARS} 个日历年（今年${CLEANUP_BOOKING_RETENTION_YEARS > 1 ? ' + 往前 ' + (CLEANUP_BOOKING_RETENTION_YEARS - 1) + ' 年' : ''}）`;
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
  requireOwner_();
  const removed = removeCleanupTriggers_();
  const summary = removed > 0
    ? `✅ 已移除 ${removed} 个每月自动清理触发器，之后不会再自动清理回收站/操作日志。`
    : 'ℹ️ 没有找到需要移除的自动清理触发器（可能本来就没安装过）。';
  Logger.log(summary);
  return summary;
}

function removeCleanupTriggers_() {
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;
  triggers.forEach(t => {
    if (t.getHandlerFunction() === CLEANUP_TRIGGER_HANDLER) {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  return removed;
}
