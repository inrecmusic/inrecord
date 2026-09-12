import { NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { selectAll } from "@/lib/supabase-paginate";
import { serverError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";
import { payLabel } from "@/lib/dashboard";
import { buildSyncPayload, lastMonthRange, twRangeToUtc, SHEET_NAME } from "@/lib/sheets-sync";

// 後台「同步訂單到 Google 試算表」。
// 走 Apps Script 網頁應用程式（docs/sheets/orders-sync.gs 的 doPost）＋共用密鑰，不需 Google Cloud 服務帳號。
// 未設 SHEETS_WEBHOOK_URL / SHEETS_WEBHOOK_SECRET → 整個功能安全停用（GET 回 configured:false、POST 回 503），
// 後台其他功能不受影響。

const TIMEOUT_MS = 20_000; // Apps Script 冷啟動＋寫表可能數秒，抓 20 秒上限避免函式吊死

// Apps Script 會回的固定錯誤碼（白名單，照原樣傳給後台好顯示對應說明；非白名單一律吞掉只留 server log）
const UPSTREAM_ERRORS = new Set([
  "bad_request", "not_configured", "unauthorized", "invalid_orders",
  "too_many_orders", "missing_order_no", "busy", "internal_error",
]);

const configured = () => !!(process.env.SHEETS_WEBHOOK_URL && process.env.SHEETS_WEBHOOK_SECRET);

// 只回「有沒有設定好」與預設區間（上個月），讓後台按鈕能在未設定時直接顯示停用原因。
// 不外呼 Apps Script，純讀 env。
// Apps Script 冷啟動＋批次寫入可能數十秒，不設會被 Vercel 預設時限砍掉（試算表其實已寫成功，前端卻顯示失敗）
export const maxDuration = 60;

export async function GET(req) {
  if (!(await verifyAdminToken(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, configured: configured(), sheet: SHEET_NAME, ...lastMonthRange() });
}

export async function POST(req) {
  const admin = await verifyAdminToken(req);
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = process.env.SHEETS_WEBHOOK_URL;
  const secret = process.env.SHEETS_WEBHOOK_SECRET;
  if (!url || !secret) {
    return NextResponse.json(
      { error: "sheets_not_configured", detail: "尚未設定 SHEETS_WEBHOOK_URL / SHEETS_WEBHOOK_SECRET，無法同步" },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  // 沿用後台日期篩選語意：單側留空＝該側不設限；兩側都空＝預設上個月整月（月底／月初登記上月帳）
  const picked = body?.from || body?.to;
  const { from, to } = picked ? { from: body.from || "", to: body.to || "" } : lastMonthRange();
  const range = twRangeToUtc(from, to);
  if (!range) {
    return NextResponse.json(
      { error: "invalid_range", detail: "日期格式須為 YYYY-MM-DD，且開始日不可晚於結束日" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const BASE_COLS = "mer_trade_no, created_at, updated_at, fulfilled_at, email, grant_email, buyer_name, plan, plan_label, amount, coupon_code, pay_type, status, invoice_no, source";
  const load = (cols) =>
    // selectAll 分頁撈取：訂單破千時不會被 PostgREST 預設 1000 列上限靜默截斷
    selectAll(supabase, "orders", (q) => {
      let s = q.select(cols).order("created_at", { ascending: true });
      if (range.startIso) s = s.gte("created_at", range.startIso);
      if (range.endIso) s = s.lte("created_at", range.endIso);
      return s;
    });

  let orders;
  try {
    orders = await load(`${BASE_COLS}, refunded_at, refund_amount`);
  } catch (err) {
    // 降級：supabase-payment-events.sql 還沒跑（沒有 refunded_at／refund_amount 欄）→ 用舊欄位組同步，
    // 退款日期／金額由 lib/sheets-sync 以 updated_at 推算。不可因為少欄位就整個同步失敗。
    if (/refunded_at|refund_amount/.test(err?.message || "")) {
      console.error("[sheets-sync] orders 缺 refunded_at／refund_amount 欄，改用推算值；請先執行 supabase-payment-events.sql");
      try {
        orders = await load(BASE_COLS);
      } catch (e) {
        return serverError(e, "orders_load_failed");
      }
    } else {
      return serverError(err, "orders_load_failed");
    }
  }

  const payload = buildSyncPayload(orders, { secret, payLabelFn: payLabel });
  const count = payload.orders.length;
  const skipped = orders.length - count; // 缺訂單編號（無法 upsert）而濾掉的髒資料
  if (skipped > 0) console.warn(`[sheets-sync] ${skipped} 筆訂單沒有 mer_trade_no，已略過`);

  let res;
  try {
    // Apps Script 網頁應用程式會 302 轉到 script.googleusercontent.com，fetch 預設 follow 即可
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.error("[sheets-sync] 連線 Apps Script 失敗:", err?.message || err);
    return NextResponse.json({ error: "sheets_request_failed" }, { status: 502 });
  }

  if (!res.ok) {
    console.error("[sheets-sync] Apps Script 回非 2xx:", res.status);
    return NextResponse.json({ error: "sheets_request_failed" }, { status: 502 });
  }

  // Apps Script 一律回 HTTP 200，成功與否看 body 的 ok
  const result = await res.json().catch((err) => {
    console.error("[sheets-sync] Apps Script 回應非 JSON:", err?.message || err);
    return null;
  });
  if (!result) return NextResponse.json({ error: "sheets_bad_response" }, { status: 502 });
  if (result.ok !== true) {
    console.error("[sheets-sync] Apps Script 拒絕同步:", result.error || "unknown", result.message || "");
    const reason = UPSTREAM_ERRORS.has(result.error) ? result.error : undefined;
    return NextResponse.json({ error: "sheets_rejected", reason }, { status: 502 });
  }

  const inserted = Number(result.inserted) || 0;
  const updated = Number(result.updated) || 0;

  await logAudit(supabase, {
    actor: admin.email,
    action: "order.sheets_sync",
    targetType: "sheet",
    targetId: SHEET_NAME,
    meta: { from, to, count, inserted, updated, ...(skipped > 0 ? { skipped } : {}) },
    req,
  });

  return NextResponse.json({ ok: true, count, inserted, updated, from, to });
}
