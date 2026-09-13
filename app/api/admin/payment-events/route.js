import { NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { serverError } from "@/lib/api-error";
import { extractCardInfo } from "@/lib/payment-events";

// 後台訂單詳情的「付款明細」：撈某筆訂單的 PAYUNi 原始回呼（新到舊），
// 並附上從 raw 猜出來的信用卡明細（分期期數／卡號末四碼／授權碼）。唯讀，不寫任何資料。
//
// 降級：payment_events 表不存在（supabase-payment-events.sql 還沒跑）→ 回 200 + tableMissing:true，
// 讓後台顯示「尚未啟用付款回呼紀錄」，而不是丟一個看起來像故障的 500。

export const maxDuration = 15; // 單表單鍵查詢，正常毫秒級；給點餘裕就好

const LIMIT = 50; // 同一筆訂單的回呼（取號→付款→重送）不會多到哪去，設上限避免髒資料拖垮頁面

// 表不存在：Postgres 42P01；PostgREST 找不到表時回 PGRST205 且訊息是 schema cache 那串
// ⚠️ 只認「整張表」不存在；欄位不存在（column … does not exist）是 schema 漂移，要走 500 讓人看到，
// 不能被說成「還沒建表、請先跑 SQL」——那會把老闆導去跑一支不會解決問題的 SQL。
const isMissingTable = (e) =>
  e?.code === "42P01" || e?.code === "PGRST205" ||
  /relation "?payment_events"? does not exist|payment_events.*schema cache/i.test(e?.message || "");

export async function GET(req) {
  if (!(await verifyAdminToken(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const merTradeNo = (new URL(req.url).searchParams.get("mer_trade_no") || "").trim();
  if (!merTradeNo) return NextResponse.json({ error: "mer_trade_no_required" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { data, error } = await supabase
    .from("payment_events")
    .select("id, kind, trade_status, pay_type, created_at, raw")
    .eq("mer_trade_no", merTradeNo)
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  if (error) {
    if (isMissingTable(error)) {
      console.error("[payment-events] payment_events 表不存在，請執行 supabase-payment-events.sql");
      return NextResponse.json({ ok: true, tableMissing: true, data: [] });
    }
    return serverError(error, "payment_events_load_failed");
  }

  return NextResponse.json({
    ok: true,
    tableMissing: false,
    data: (data || []).map((r) => ({
      id: r.id,
      kind: r.kind,
      trade_status: r.trade_status,
      pay_type: r.pay_type,
      created_at: r.created_at,
      card: extractCardInfo(r.raw),
      raw: r.raw,
    })),
  });
}
