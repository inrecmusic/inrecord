import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { selectAll } from "@/lib/supabase-paginate";
import { groupSends, summarizeGroup, hasTag, twDay, buildSendIndex, attributeEvents, TAG_SINCE_TW_DAY } from "@/lib/email-stats";

// 後台電子報「寄送成效」：email_log 的群發分組 ＋ Brevo 交易信事件（開信／點擊／退訂）。唯讀。
// 電子報是逐封寄的交易信，Brevo 沒有 Campaign 報表，只能查事件端點再自己對帳，見 lib/email-stats.js。
export const maxDuration = 60;

// 要在面板上列出的信件類型（群發性質）。購買確認／開課通知／發票不列，但**仍會被讀進來**
// 建收件人時間軸——不然那些信的開信會被算到電子報頭上（見 lib/email-stats.js 的說明）。
const KINDS = ["newsletter", "custom", "trial", "followup", "recovery"];
const MAX_DAYS = 90;      // Brevo 事件端點的區間硬上限，超過會 400
const PAGE = 5000;        // Brevo limit 上限
const MAX_PAGES = 8;      // 安全閥，避免無限迴圈
const BUDGET_MS = 45_000; // 留餘裕給 maxDuration=60
const DAY_MS = 86_400_000;

const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
const shiftDay = (day, delta) => new Date(Date.parse(`${day}T00:00:00Z`) + delta * DAY_MS).toISOString().slice(0, 10);
const spanDays = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS) + 1;

// Brevo 事件的日期以 UTC 計，台灣 00:00–08:00 的寄送落在前一個 UTC 日 → 前後各墊一天再查。
// 墊完若超過 90 天就退回原區間（寧可少墊，也不要整支 400）。
async function fetchEvents(apiKey, from, to) {
  const utcToday = new Date().toISOString().slice(0, 10);
  let start = shiftDay(from, -1);
  let end = shiftDay(to, 1);
  if (end > utcToday) end = utcToday;       // 未來日期 Brevo 不接受
  if (spanDays(start, end) > MAX_DAYS) { start = from; end = to > utcToday ? utcToday : to; }

  const events = [];
  const deadline = Date.now() + BUDGET_MS;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    if (Date.now() > deadline) return { events, brevoError: null, truncated: true };
    const url = `https://api.brevo.com/v3/smtp/statistics/events?startDate=${start}&endDate=${end}&limit=${PAGE}&offset=${page * PAGE}`;
    let res;
    try {
      res = await fetch(url, { headers: { "api-key": apiKey }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
    } catch {
      return { events, brevoError: "brevo_unreachable", truncated: false };
    }
    if (!res.ok) return { events, brevoError: `brevo_${res.status}`, truncated: false };
    const batch = (await res.json().catch(() => ({})))?.events || [];
    events.push(...batch);
    if (batch.length < PAGE) return { events, brevoError: null, truncated: false };
  }
  return { events, brevoError: null, truncated: true };
}

export async function GET(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const sp = new URL(req.url).searchParams;
  const today = twDay(new Date().toISOString());
  const to = isDay(sp.get("to")) ? sp.get("to") : today;
  const from = isDay(sp.get("from")) ? sp.get("from") : shiftDay(to, -29); // 預設過去 30 天
  if (from > to) return NextResponse.json({ error: "invalid_range" }, { status: 400 });
  if (spanDays(from, to) > MAX_DAYS)
    return NextResponse.json({ error: "range_too_long", message: `Brevo 事件查詢上限 ${MAX_DAYS} 天，請縮小日期區間` }, { status: 400 });

  // selectAll 分頁：一次群發就可能上千封，PostgREST 單次 1000 列會把資料默默截斷。
  // 刻意不加 .in("kind", KINDS)：時間軸要涵蓋所有寄信類型，才能讓購買確認／開課通知
  // 「認領」自己的開信事件，不會被誤算進電子報。顯示時才依 KINDS 過濾。
  let rows;
  try {
    rows = await selectAll(sb, "email_log", (q) => q
      .select("to_email, subject, kind, status, created_at")
      .gte("created_at", `${from}T00:00:00+08:00`)
      .lte("created_at", `${to}T23:59:59.999+08:00`)
      .order("created_at", { ascending: false }));
  } catch (e) { return serverError(e); }

  const groups = groupSends(rows).filter((g) => KINDS.includes(g.kind));
  const apiKey = process.env.BREVO_API_KEY;
  // 金鑰沒設／Brevo 打不通都不讓整支掛掉：寄出數照樣回，開信數留白由 UI 說明原因
  const { events, brevoError, truncated } = apiKey
    ? await fetchEvents(apiKey, from, to)
    : { events: [], brevoError: null, truncated: false };

  // 事件歸屬：每個事件只歸給該收件人最近一次收到的信（含不顯示的購買確認等），避免舊群發吸收新群發的開信
  // brevoError 時 events 可能只有前幾頁 → 整批視為不可用，寧可留白也不要顯示系統性偏低的數字
  const usable = !brevoError;
  const byKey = usable ? attributeEvents(buildSendIndex(rows), events) : new Map();

  return NextResponse.json({
    ok: true,
    from, to,
    brevoConfigured: !!apiKey,
    brevoError,
    truncated,
    tagSince: TAG_SINCE_TW_DAY,
    data: groups.map((g) => {
      const mine = byKey.get(g.key);
      return {
        key: g.key,
        subject: g.subject,
        kind: g.kind,
        dateTW: g.dateTW,
        sentCount: g.sentCount,
        failedCount: g.failedCount,
        recipientCount: g.recipients.size,
        taggable: hasTag(g),
        // 逐組判斷：這組收件人完全沒有任何事件（多半是超過 Brevo 保留期）就回 null，
        // 由 UI 顯示「—」。全域用 events.length 判斷會把「查不到」畫成「0 人開信」。
        stats: usable && mine?.length ? summarizeGroup(g, mine, { requireTag: hasTag(g) }) : null,
      };
    }),
  });
}
