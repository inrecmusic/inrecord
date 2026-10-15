import { describe, it, expect } from "vitest";
import { buildPack, couponAnomalies, upcomingDates, twLabel } from "./collect.js";

const period = { start: new Date("2026-09-06T16:00:00Z"), end: new Date("2026-09-13T16:00:00Z"), prevStart: new Date("2026-08-30T16:00:00Z"), label: "9/7–9/13" };
const o = (over) => ({ status: "paid", amount: 4299, created_at: "2026-09-08T03:00:00Z", source: "payuni", email: "a@x.com", plan: "bundle", ...over });
const base = { enrolledEmails: [], progressRows: [], emailLog: [], unsubscribes: [], coupons: [], saleSettings: {}, videos: [], announcements: [], adReport: null, brevoQuota: null, leadsCount: null };

describe("buildPack", () => {
  it("訂單：本週／上週分開算，卡住 pending 超過 72 小時才算，已付款來源分布排除手動開通（與 paid 同口徑）", () => {
    const now = new Date("2026-09-14T00:00:00Z");
    const pack = buildPack({ ...base, period, now,
      orders: [o(), o({ source: "concert" }), o({ source: "manual", amount: 0 }), o({ status: "pending", created_at: "2026-09-07T00:00:00Z" }), o({ status: "pending", created_at: "2026-09-13T12:00:00Z" }), o({ status: "refunded", amount: 5500 })],
      prevOrders: [o({ created_at: "2026-09-01T00:00:00Z" }), o({ created_at: "2026-09-01T00:00:00Z", source: "manual", amount: 0 })], enrolledEmails: ["a@x.com"],
    });
    expect(pack.period.label).toBe("9/7–9/13");
    expect(pack.orders).toMatchObject({ created: 6, paid: 2, revenue: 8598, refunded: 1, refund_amount: 5500, stuck_pending: 1 });
    expect(pack.orders.paid_by_source).toEqual({ payuni: 1, concert: 1 });   // manual 不算：加起來要等於 paid
    expect(pack.orders.by_source).toBeUndefined();
    expect(pack.prev_orders).toMatchObject({ created: 2, paid: 1, revenue: 4299 });
    expect(pack.prev_orders.paid_by_source).toEqual({ payuni: 1 });
    // core 六指標本週／上週（程式算好）
    expect(pack.core.revenue).toEqual({ this_week: 8598, last_week: 4299 });
    expect(pack.core.paid_orders).toEqual({ this_week: 2, last_week: 1 });
    expect(pack.core.created_orders).toEqual({ this_week: 6, last_week: 2 });
    expect(pack.core.ad_spend).toEqual({ this_week: null, last_week: null });   // 廣告未接上
    expect(Object.keys(pack.core)).toEqual(["revenue", "paid_orders", "created_orders", "active_students", "ad_spend", "newsletter_sent"]);
  });

  it("待處理：已付款未開通名單（只 payuni）、寄信失敗清單；電子報寄出數本週／上週", () => {
    const pack = buildPack({ ...base, period, now: new Date(),
      orders: [o({ email: "ung@x.com" }), o({ email: "ok@x.com" }), o({ source: "concert", email: "c@x.com" })],
      prevOrders: [], enrolledEmails: ["ok@x.com"],
      emailLog: [
        { to_email: "f@x.com", kind: "newsletter", status: "failed", created_at: "2026-09-08T00:00:00Z" },
        { to_email: "n@x.com", kind: "newsletter", status: "sent", created_at: "2026-09-08T00:00:00Z" },
        { to_email: "s@x.com", kind: "trial", status: "sent", created_at: "2026-09-08T00:00:00Z" },
        { to_email: "b@x.com", kind: "purchase", status: "sent", created_at: "2026-09-08T00:00:00Z" },
        { to_email: "p1@x.com", kind: "newsletter", status: "sent", created_at: "2026-09-02T00:00:00Z" },   // 上週
        { to_email: "p2@x.com", kind: "newsletter", status: "sent", created_at: "2026-09-03T00:00:00Z" },   // 上週
        { to_email: "old@x.com", kind: "newsletter", status: "sent", created_at: "2026-08-20T00:00:00Z" },  // 更早：不算
      ],
    });
    expect(pack.pending_actions.ungranted.map((u) => u.email)).toEqual(["ung@x.com"]);
    expect(pack.pending_actions.failed_emails).toEqual([{ to: "f@x.com", kind: "newsletter", at: "2026-09-08T00:00:00Z" }]);
    expect(pack.newsletter.sent).toBe(1);   // 只算 kind='newsletter'；試看信／購買信不是電子報
    expect(pack.core.newsletter_sent).toEqual({ this_week: 1, last_week: 2 });
  });

  it("學員：本週有觀看人數／單元數／完成數（core 含上週活躍）；內容：已發布無影片；草稿公告；潛客數；廣告花費上週", () => {
    const pack = buildPack({ ...base, period, now: new Date(), orders: [], prevOrders: [], enrolledEmails: ["a@x.com", "b@x.com"], prevAdSpend: 500.4,
      progressRows: [
        { user_id: "u1", watched_at: "2026-09-08T00:00:00Z", completed: true, viewed_seconds: 600 },
        { user_id: "u1", watched_at: "2026-09-09T00:00:00Z", completed: false, viewed_seconds: 100 },
        { user_id: "u2", watched_at: "2026-08-01T00:00:00Z", completed: true, viewed_seconds: 50 },
        { user_id: "u3", watched_at: "2026-09-02T00:00:00Z", completed: true, viewed_seconds: 0 },   // 上週
        { user_id: "u4", watched_at: "2026-09-05T00:00:00Z", completed: false, viewed_seconds: 0 },  // 上週
      ],
      videos: [{ title: "1-1", published: true, bunny_video_id: "x" }, { title: "2-1", published: true, bunny_video_id: null }, { title: "9-9", published: false, bunny_video_id: null }],
      announcements: [{ published: false }, { published: true }], leadsCount: 12,
    });
    expect(pack.students).toEqual({ enrolled: 2, active_this_week: 1, units_watched_this_week: 2, units_completed_this_week: 1, viewed_minutes_all_time: 13 });
    expect(pack.core.active_students).toEqual({ this_week: 1, last_week: 2 });
    expect(pack.core.ad_spend).toEqual({ this_week: null, last_week: 500 });
    expect(pack.content).toEqual({ published_units: 2, units_without_video: 1, first_missing_unit: "2-1" });
    expect(pack.drafts.announcements_unpublished).toBe(1);
    expect(pack.newsletter.leads).toBe(12);
  });
});

describe("couponAnomalies", () => {
  it("指定價券低於當前波段價、名稱像測試、無上限指定價券 → 列為異常；停用券不列", () => {
    const settings = { waves: [{ starts_at: "2026-09-06T16:00:00Z", ends_at: "2026-09-20T16:00:00Z", prices: { bundle: 4299, course: 5500 } }], list_price: { bundle: 6999, course: 6800 } };
    const now = new Date("2026-09-10T00:00:00Z");
    const list = couponAnomalies([
      { code: "SMOKETEST1", type: "price", value: 1, status: "active", usage_limit: 5 },
      { code: "FAN3999", type: "price", value: 3999, status: "active", usage_limit: null, plan: "bundle" },
      { code: "OK10", type: "percent", value: 10, status: "active", usage_limit: 100 },
      { code: "OLD1", type: "price", value: 1, status: "disabled", usage_limit: 1 },
    ], settings, now);
    expect(list.map((a) => a.code)).toEqual(["SMOKETEST1", "FAN3999"]);
    expect(list[0].reasons).toContain("test_like");
    expect(list[0].reasons).toContain("below_current_price");
    expect(list[1].reasons).toEqual(["below_current_price", "unlimited_price_coupon"]);
  });
});

describe("upcomingDates", () => {
  it("14 天內的波段換價與固定里程碑，已過的粉絲截止不列；附台灣時間標籤 label_tw", () => {
    const settings = { waves: [{ starts_at: "2026-09-20T16:00:00Z", ends_at: "2026-10-04T16:00:00Z", prices: { bundle: 4799 } }], fan_plan: { enabled: true, deadline: "2026-09-14T23:59:59+08:00" } };
    const list = upcomingDates(settings, new Date("2026-09-16T00:00:00Z"));
    expect(list.map((u) => u.label)).toEqual(["波段換價：bundle 4799", "第一批章節上架（Ch1～Ch3）"]);
    // UTC 9/20 16:00 ＝ 台灣 9/21 00:00：模型要照 label_tw 寫，不會再寫成 9/20
    expect(list.map((u) => u.label_tw)).toEqual(["9/21 00:00", "9/30 00:00"]);
    expect(list[0].at).toBe("2026-09-20T16:00:00Z");
  });
  it("twLabel：UTC 毫秒 → 台灣 M/D HH:mm", () => {
    expect(twLabel(Date.parse("2026-10-22T16:00:00Z"))).toBe("10/23 00:00");
    expect(twLabel(Date.parse("2026-10-31T12:30:00+08:00"))).toBe("10/31 12:30");
  });
});

describe("查詢失敗要標成 unavailable（不能當作 0）", () => {
  it("該區塊填 null 並列進 unavailable；core 對應指標 null；其餘區塊照常計算", () => {
    const pack = buildPack({ ...base, period, now: new Date(), orders: null, prevOrders: null, emailLog: null, enrolledEmails: ["a@x.com"] });
    expect(pack.unavailable).toEqual(["orders", "email_log"]);
    expect(pack.orders).toBeNull();
    expect(pack.prev_orders).toBeNull();
    expect(pack.pending_actions).toEqual({ ungranted: null, failed_emails: null });
    expect(pack.newsletter.sent).toBeNull();
    expect(pack.core.revenue).toEqual({ this_week: null, last_week: null });
    expect(pack.core.paid_orders).toEqual({ this_week: null, last_week: null });
    expect(pack.core.newsletter_sent).toEqual({ this_week: null, last_week: null });
    expect(pack.core.active_students).toEqual({ this_week: 0, last_week: 0 });
    expect(pack.students.enrolled).toBe(1);
  });

  it("全部查得到時 unavailable 是空陣列、數字照舊", () => {
    const pack = buildPack({ ...base, period, now: new Date(), orders: [o()], prevOrders: [] });
    expect(pack.unavailable).toEqual([]);
    expect(pack.orders.paid).toBe(1);
    expect(pack.newsletter.sent).toBe(0);
    expect(pack.core.revenue).toEqual({ this_week: 4299, last_week: 0 });
  });
});
