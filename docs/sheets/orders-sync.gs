/**
 * InRecord 訂單同步 — Google Apps Script 網頁應用程式（doPost）
 * ---------------------------------------------------------------------------
 * 用途：InRecord 後台「訂單管理」按下同步按鈕後，把訂單以 JSON POST 進來，
 *       寫入本試算表中名為「InRecord 訂單」的專屬分頁。
 *
 * 三個重點：
 *   1. 只碰「InRecord 訂單」這一個分頁，其他分頁與既有資料一律不動。
 *   2. 以訂單編號（A 欄）為唯一鍵做 upsert：同一筆重複同步只更新那一列，不會長出重複列。
 *   3. 全程取得指令碼鎖，避免兩次同步同時寫入互相覆蓋。
 *
 * 設定與部署步驟請看同資料夾的 README.md。
 */

// ── 設定常數 ──────────────────────────────────────────────────────────────
var VERSION = '1.0.0';
var SHEET_NAME = 'InRecord 訂單';     // 專屬分頁名稱，請勿更改
var TIME_ZONE = 'Asia/Taipei';         // 日期一律台灣時間
var DATE_FORMAT = 'yyyy-MM-dd HH:mm';  // 方便依月份篩選
var MAX_ORDERS = 2000;                 // 單次同步筆數上限（超過請分月同步）
var LOCK_TIMEOUT_MS = 30000;           // 等待指令碼鎖的時間

// 表頭（欄位順序＝寫入順序，請勿任意調整）
var HEADERS = [
  '訂單編號', '成立日期', '付款日期', 'Email', '姓名', '方案', '金額', '優惠碼',
  '付款方式', '狀態', '發票號碼', '來源', '退款日期', '退款金額', '同步時間'
];

// 每一欄對應收到的 JSON 裡的欄位名稱（順序同上）。
// 最後一欄「同步時間」由本程式產生，故為 null。
var FIELDS = [
  'mer_trade_no', 'created_at', 'paid_at', 'email', 'name', 'plan', 'amount', 'coupon_code',
  'pay_type', 'status', 'invoice_no', 'source', 'refunded_at', 'refund_amount', null
];

// 欄位型別：日期欄正規化成台灣時間字串、金額欄寫成數字（方便加總）
var DATE_FIELDS = { created_at: true, paid_at: true, refunded_at: true };
var NUMBER_FIELDS = { amount: true, discount: true, refund_amount: true };
var DATE_COLUMNS = [2, 3, 14, 16];  // 需套用日期顯示格式的欄（1-based，含最後的同步時間）

// ── 網頁應用程式進入點 ────────────────────────────────────────────────────

/**
 * 健康檢查：部署完成後用瀏覽器直接開網址，看到 ok:true 就代表部署成功。
 * 不會回傳密鑰本身，只回報「有沒有設定」。
 */
function doGet() {
  var secret = PropertiesService.getScriptProperties().getProperty('SHEET_SYNC_SECRET');
  return json_({
    ok: true,
    service: 'inrecord-orders-sync',
    version: VERSION,
    sheet: SHEET_NAME,
    secret_configured: !!(secret && secret.length),
    time: Utilities.formatDate(new Date(), TIME_ZONE, 'yyyy-MM-dd HH:mm:ss')
  });
}

/**
 * 接收 { secret, orders: [{ mer_trade_no, created_at, ... }] }，做 upsert 後回傳筆數。
 * 欄序由本檔的 HEADERS／FIELDS 決定（InRecord 端的 lib/sheets-sync.js 只負責把欄位名對上）。
 * 注意：Apps Script 網頁應用程式一律回 HTTP 200，所以錯誤用 JSON 的 ok:false 表達。
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var body = parseBody_(e);
    if (!body) return json_({ ok: false, error: 'bad_request', message: '請以 JSON 格式 POST' });

    var secret = PropertiesService.getScriptProperties().getProperty('SHEET_SYNC_SECRET');
    if (!secret) return json_({ ok: false, error: 'not_configured', message: '尚未設定指令碼屬性 SHEET_SYNC_SECRET' });
    if (!secretOk_(body.secret, secret)) return json_({ ok: false, error: 'unauthorized' });

    if (!Array.isArray(body.orders)) {
      return json_({ ok: false, error: 'invalid_orders', message: 'orders 必須是陣列' });
    }
    var normalized = normalizeOrders_(body.orders);
    if (normalized.error) return json_(normalized);
    if (!normalized.rows.length) return json_({ ok: true, inserted: 0, updated: 0 });

    // 寫入期間上鎖，避免兩次同步同時進來互相覆蓋
    if (!lock.tryLock(LOCK_TIMEOUT_MS)) {
      return json_({ ok: false, error: 'busy', message: '另一次同步正在進行，請稍後再試' });
    }
    return json_(upsertOrders_(normalized.rows));
  } catch (err) {
    return json_({ ok: false, error: 'internal_error', message: String(err && err.message ? err.message : err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

// ── 輸入正規化與驗證 ──────────────────────────────────────────────────────

/** 驗證每一筆訂單並攤平成列；不合格回 { error, message }。 */
function normalizeOrders_(orders) {
  if (orders.length > MAX_ORDERS) {
    return { ok: false, error: 'too_many_orders', message: '單次最多 ' + MAX_ORDERS + ' 筆，請分批同步' };
  }

  var syncedAt = Utilities.formatDate(new Date(), TIME_ZONE, DATE_FORMAT);
  var rows = [];
  for (var i = 0; i < orders.length; i++) {
    var order = orders[i];
    if (!order || typeof order !== 'object' || Array.isArray(order) || !String(order.mer_trade_no || '').trim()) {
      return { ok: false, error: 'missing_order_no', message: '第 ' + (i + 1) + ' 筆缺少訂單編號（mer_trade_no）' };
    }
    rows.push(buildRow_(order, syncedAt));
  }
  return { rows: rows };
}

/** 依 FIELDS 的順序把一筆訂單攤平成一列，最後一欄補上同步時間。 */
function buildRow_(order, syncedAt) {
  return FIELDS.map(function (field) {
    if (!field) return syncedAt;
    if (DATE_FIELDS[field]) return toDateText_(order[field]);
    if (NUMBER_FIELDS[field]) return toNumber_(order[field]);
    return safeCell_(order[field]);
  });
}

// ── 寫入試算表 ────────────────────────────────────────────────────────────

/** 依第一欄（訂單編號）upsert：既有列整列覆寫、新訂單附加在最後，全部用批次寫入。 */
function upsertOrders_(rows) {
  var sheet = getOrCreateSheet_();

  // 同一批若出現重複訂單編號，以最後一筆為準（避免同一次寫兩列）
  var unique = [];
  var seen = {};
  rows.forEach(function (row) {
    var key = String(row[0]).trim();
    if (Object.prototype.hasOwnProperty.call(seen, key)) unique[seen[key]] = row;
    else { seen[key] = unique.length; unique.push(row); }
  });

  var rowByOrderNo = readOrderNoIndex_(sheet);
  var updates = [];   // { row, values }
  var inserts = [];   // values

  unique.forEach(function (values) {
    var row = rowByOrderNo[String(values[0]).trim()];
    if (row) updates.push({ row: row, values: values });
    else inserts.push(values);
  });

  // 更新：把列號排序後切成連續區塊，一塊一次 setValues，不逐列寫入
  groupRuns_(updates).forEach(function (run) {
    writeBlock_(sheet, run.start, run.values);
  });

  // 新增：全部接在資料最後面，一次寫完
  if (inserts.length) writeBlock_(sheet, sheet.getLastRow() + 1, inserts);

  return { ok: true, inserted: inserts.length, updated: updates.length };
}

/** 取得專屬分頁；不存在才建立（絕不動到其他分頁）。 */
function getOrCreateSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('找不到試算表：請從試算表的「擴充功能 → Apps Script」建立這支程式');

  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

  // 分頁是空的（新建或被清空）才寫表頭，避免覆蓋既有資料
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** 讀 A 欄（訂單編號）建索引：訂單編號 → 列號。重複時以最上面那列為準。 */
function readOrderNoIndex_(sheet) {
  var index = {};
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return index;

  var keys = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < keys.length; i++) {
    var key = String(keys[i][0] === null || keys[i][0] === undefined ? '' : keys[i][0]).trim();
    if (key && !Object.prototype.hasOwnProperty.call(index, key)) index[key] = i + 2;
  }
  return index;
}

/** 一次寫入一個連續區塊，並套用日期欄顯示格式（先設格式再寫值，字串才不會被亂解讀）。 */
function writeBlock_(sheet, startRow, values) {
  if (!values.length) return;
  var needed = startRow + values.length - 1;
  if (needed > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), needed - sheet.getMaxRows());

  DATE_COLUMNS.forEach(function (col) {
    sheet.getRange(startRow, col, values.length, 1).setNumberFormat(DATE_FORMAT);
  });
  sheet.getRange(startRow, 1, values.length, HEADERS.length).setValues(values);
}

/** 把 { row, values } 依列號排序後，切成一段段連續列。 */
function groupRuns_(updates) {
  var sorted = updates.slice().sort(function (a, b) { return a.row - b.row; });
  var runs = [];
  sorted.forEach(function (item) {
    var last = runs[runs.length - 1];
    if (last && item.row === last.start + last.values.length) last.values.push(item.values);
    else runs.push({ start: item.row, values: [item.values] });
  });
  return runs;
}

// ── 小工具 ────────────────────────────────────────────────────────────────

/** 解析 JSON body；格式不對回 null。 */
function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return null;
  try {
    var body = JSON.parse(e.postData.contents);
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch (err) {
    return null;
  }
}

/**
 * 比對密鑰。
 * 限制：Apps Script 沒有原生的定時比較函式，字串取長度、取字元本身也不保證常數時間，
 * 因此這裡只能「先比長度，再逐字元累加差異、不提早 return」，把時序差異壓到最小。
 * 真正的防線是密鑰夠長且隨機（建議 32 字元以上），單靠猜測無法在合理時間內破解。
 */
function secretOk_(input, expected) {
  var a = String(input === null || input === undefined ? '' : input);
  var b = String(expected === null || expected === undefined ? '' : expected);
  if (!b.length || a.length !== b.length) return false;

  var diff = 0;
  for (var i = 0; i < b.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** 日期一律轉成台灣時間的 yyyy-MM-dd HH:mm；已是這個格式就原樣沿用。 */
function toDateText_(value) {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) return Utilities.formatDate(value, TIME_ZONE, DATE_FORMAT);

  var text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(text)) return text;

  var date = new Date(text);
  return isNaN(date.getTime()) ? safeCell_(text) : Utilities.formatDate(date, TIME_ZONE, DATE_FORMAT);
}

/** 金額欄轉成數字；空值留白（不要寫成 0，才分得出「沒有」與「零元」）。 */
function toNumber_(value) {
  if (value === null || value === undefined || value === '') return '';
  var num = Number(value);
  return isNaN(num) ? safeCell_(value) : num;
}

/** 文字欄：null 轉空字串；開頭是 = + - @ 的字串補上單引號，避免被當成公式。 */
function safeCell_(value) {
  if (value === null || value === undefined) return '';
  var text = String(value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

/** 統一的 JSON 回應。 */
function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * 產生一組隨機密鑰（給設定時用）。
 * 在編輯器上方選這個函式按「執行」，再到下方「執行記錄」把結果複製出來，
 * 貼到指令碼屬性 SHEET_SYNC_SECRET，同一組也要交給 InRecord 設進環境變數。
 */
function generateSecret() {
  var secret = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  Logger.log('SHEET_SYNC_SECRET = ' + secret);
  return secret;
}
