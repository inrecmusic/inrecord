import { describe, it, expect } from "vitest";
import { buildPack, couponAnomalies, upcomingDates } from "./collect.js";

const period = { start: new Date("2026-09-06T16:00:00Z"), end: new Date("2026-09-13T16:00:00Z"), prevStart: new Date("2026-08-30T16:00:00Z"), label: "9/7–9/13" };
const o = (over) => ({ status: "paid", amount: 4299, created_at: "2026-09-08T03:00:00Z", source: "payuni", email: "a@x.com", plan: "bundle", ...over });
const base = { enrolledEmails: [], progressRows: [], emailLog: [], unsubscribes: [], coupons: [], saleSettings: {}, videos: [], announcements: [], adReport: null, brevoQuota: null, leadsCount: null };

describe("buildPack", () => {
  it("訂單：本週／上週分開算，卡住 pending 超過 72 小時才算，來源分布", () => {
    const now = new Date("2026-09-14T00:00:00Z");
    const pack = buildPack({ ...base, period, now,
      orders: [o(), o({ source: "concert" }), o({ status: "pending", created_at: "2026-09-07T00:00:00Z" }), o({ status: "pending", created_at: "2026-09-13T12:00:00Z" }), o({ status: "refunded", amount: 5500 })],
      prevOrders: [o({ created_at: "2026-09-01T00:00:00Z" })], enrolledEmails: ["a@x.com"],
    });
    expect(pack.period.label).toBe("9/7–9/13");
    expect(pack.orders).toMatchObject({ created: 5, paid: 2, revenue: 8598, refunded: 1, refund_amount: 5500, stuck_pending: 1 });
    expect(pack.orders.by_source).toEqual({ payuni: 1, concert: 1 });
    expect(pack.prev_orders).toMatchObject({ created: 1, paid: 1, revenue: 4299 });
  });

  it("待處理：已付款未開通名單（只 payuni）、寄信失敗清單；電子報寄出數", () => {
    const pack = buildPack({ ...base, period, now: new Date(),
      orders: [o({ email: "ung@x.com" }), o({ email: "ok@x.com" }), o({ source: "concert", email: "c@x.com" })],
      prevOrders: [], enrolledEmails: ["ok@x.com"],
      emailLog: [{ to_email: "f@x.com", kind: "newsletter", status: "failed", created_at: "2026-09-08T00:00:00Z" }, { to_email: "s@x.com", kind: "trial", status: "sent", created_at: "2026-09-08T00:00:00Z" }],
    });
    expect(pack.pending_actions.ungranted.map((u) => u.email)).toEqual(["ung@x.com"]);
    expect(pack.pending_actions.failed_emails).toEqual([{ to: "f@x.com", kind: "newsletter", at: "2026-09-08T00:00:00Z" }]);
    expect(pack.newsletter.sent).toBe(1);
  });

  it("學員：本週有觀看人數／單元數／完成數；內容：已發布無影片；草稿公告；潛客數", () => {
    const pack = buildPack({ ...base, period, now: new Date(), orders: [], prevOrders: [], enrolledEmails: ["a@x.com", "b@x.com"],
      progressRows: [{ user_id: "u1", watched_at: "2026-09-08T00:00:00Z", completed: true, viewed_seconds: 600 }, { user_id: "u1", watched_at: "2026-09-09T00:00:00Z", completed: false, viewed_seconds: 100 }, { user_id: "u2", watched_at: "2026-08-01T00:00:00Z", completed: true, viewed_seconds: 50 }],
      videos: [{ title: "1-1", published: true, bunny_video_id: "x" }, { title: "2-1", published: true, bunny_video_id: null }, { title: "9-9", published: false, bunny_video_id: null }],
      announcements: [{ published: false }, { published: true }], leadsCount: 12,
    });
    expect(pack.students).toEqual({ enrolled: 2, active_this_week: 1, units_watched_this_week: 2, units_completed_this_week: 1, viewed_minutes_all_time: 13 });
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
  it("14 天內的波段換價與固定里程碑，已過的粉絲截止不列", () => {
    const settings = { waves: [{ starts_at: "2026-09-20T16:00:00Z", ends_at: "2026-10-04T16:00:00Z", prices: { bundle: 4799 } }], fan_plan: { enabled: true, deadline: "2026-09-14T23:59:59+08:00" } };
    const list = upcomingDates(settings, new Date("2026-09-16T00:00:00Z"));
    expect(list.map((u) => u.label)).toEqual(["波段換價：bundle 4799", "第一批章節上架（Ch1～Ch5）"]);
  });
});
