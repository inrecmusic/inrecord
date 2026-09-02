import { describe, it, expect } from "vitest";
import { mergeStudents, countPaidBuyers } from "./admin-students.js";

describe("mergeStudents", () => {
  it("現場購買者（只在 enrollments + orders、不在 leads）也會出現，且標記為已購課", () => {
    const r = mergeStudents({
      enrollments: [{ email: "Buyer@x.com", enrolled_at: "2026-06-26T16:00:00Z", course_id: "piano-101" }],
      orders: [{ email: "buyer@x.com", phone: "0912345678", plan: "bundle", plan_label: "從零開始學鋼琴（線上課程）", source: "concert", status: "paid", created_at: "2026-06-26T15:00:00Z" }],
      leads: [],
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      email: "buyer@x.com",
      phone: "0912345678",
      plan_label: "從零開始學鋼琴（線上課程）",
      source: "concert",
      enrolled: true,
      isLead: false,
      purchased: true,
      status: "purchased",
    });
    expect(r[0].id).toBe("enr:buyer@x.com"); // 無 lead → 合成 id，不可 PATCH
  });

  it("已付款但尚未開通者（演奏會預購：只在 orders、無 enrollment/lead）也算學員，purchased=true、enrolled=false", () => {
    const r = mergeStudents({
      enrollments: [],
      orders: [{ email: "pre@x.com", phone: "0987", plan: "bundle", plan_label: "從零開始學鋼琴（線上課程）", source: "concert", status: "paid", created_at: "2026-06-27T05:00:00Z" }],
      leads: [],
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      email: "pre@x.com",
      phone: "0987",
      source: "concert",
      enrolled: false,   // 尚未開通
      purchased: true,   // 但已付款 → 已購課
      status: "purchased",
      isLead: false,
    });
  });

  it("email 大小寫不同視為同一人，已購課者用 enrollment 覆寫 lead 狀態並帶入電話", () => {
    const r = mergeStudents({
      enrollments: [{ email: "a@x.com", enrolled_at: "2026-06-20T00:00:00Z" }],
      orders: [{ email: "A@x.com", phone: "0900", status: "paid", created_at: "2026-06-19T00:00:00Z" }],
      leads: [{ id: "lead-1", email: "a@X.com", status: "requested", created_at: "2026-06-01T00:00:00Z" }],
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: "lead-1", isLead: true, enrolled: true, purchased: true, status: "purchased", phone: "0900" });
  });

  it("純體驗名單（未購課）保留為潛在客戶，狀態沿用 lead.status", () => {
    const r = mergeStudents({
      enrollments: [],
      orders: [],
      leads: [{ id: "lead-9", email: "lead@x.com", status: "demo_opened", source: "demo", created_at: "2026-06-10T00:00:00Z" }],
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: "lead-9", isLead: true, enrolled: false, purchased: false, status: "demo_opened", phone: null });
  });

  it("多筆訂單取最近一筆的聯絡資訊", () => {
    const r = mergeStudents({
      enrollments: [{ email: "m@x.com", enrolled_at: "2026-01-01T00:00:00Z" }],
      orders: [
        { email: "m@x.com", phone: "OLD", status: "paid", created_at: "2026-01-01T00:00:00Z" },
        { email: "m@x.com", phone: "NEW", status: "paid", created_at: "2026-06-01T00:00:00Z" },
      ],
      leads: [],
    });
    expect(r[0].phone).toBe("NEW");
  });

  it("最新在前（依 created_at 由 enrolled_at / order / lead 推得）排序", () => {
    const r = mergeStudents({
      enrollments: [{ email: "new@x.com", enrolled_at: "2026-06-26T00:00:00Z" }],
      orders: [{ email: "new@x.com", status: "paid", created_at: "2026-06-26T00:00:00Z" }],
      leads: [{ id: "old", email: "old@x.com", status: "requested", created_at: "2026-01-01T00:00:00Z" }],
    });
    expect(r.map((x) => x.email)).toEqual(["new@x.com", "old@x.com"]);
  });

  it("paid 旗標：只有真的有已付款訂單的人才是 true（開通與人工標記都不算）", () => {
    const r = mergeStudents({
      enrollments: [{ email: "granted@x.com" }],                       // 只開通、查無訂單（測試帳號）
      orders: [{ email: "buyer@x.com", plan: "bundle", status: "paid" }], // 付了錢、還沒開通
      leads: [{ email: "marked@x.com", status: "purchased" }],         // 只被人工標記
    });
    const by = Object.fromEntries(r.map(x => [x.email, x]));
    expect(by["buyer@x.com"].paid).toBe(true);
    expect(by["granted@x.com"].paid).toBe(false);
    expect(by["marked@x.com"].paid).toBe(false);
    // purchased（含開通與人工標記）維持原本語意，不受影響
    expect(by["granted@x.com"].purchased).toBe(true);
    expect(by["marked@x.com"].purchased).toBe(true);
  });

  it("空輸入 → 空陣列、不崩潰", () => {
    expect(mergeStudents()).toEqual([]);
    expect(mergeStudents({})).toEqual([]);
  });

  it("併入 profile：有 profile 的 email 帶 hasProfile=true 與 level/phone", () => {
    const out = mergeStudents({ enrollments: [{ email: "a@x.com" }], orders: [], leads: [],
      profiles: [{ email: "a@x.com", real_name: "王", phone: "0912345678", level: "some" }] });
    const row = out.find(r => r.email === "a@x.com");
    expect(row.hasProfile).toBe(true);
    expect(row.profileName).toBe("王");
    expect(row.level).toBe("some");
  });
  it("無 profile → hasProfile=false", () => {
    const out = mergeStudents({ enrollments: [{ email: "b@x.com" }], orders: [], leads: [], profiles: [] });
    expect(out.find(r => r.email === "b@x.com").hasProfile).toBe(false);
  });
});

describe("countPaidBuyers", () => {
  it("只算 status='paid'，pending / notified / refunded / failed 都不算", () => {
    expect(countPaidBuyers([
      { email: "a@x.com", status: "paid" },
      { email: "b@x.com", status: "pending" },
      { email: "c@x.com", status: "notified" },
      { email: "d@x.com", status: "refunded" },
      { email: "e@x.com", status: "failed" },
    ])).toBe(1);
  });

  it("同一人多筆已付款訂單只算一位（email 忽略大小寫與前後空白）", () => {
    expect(countPaidBuyers([
      { email: "Buyer@x.com", status: "paid" },
      { email: " buyer@x.com ", status: "paid" },
      { email: "other@x.com", status: "paid" },
    ])).toBe(2);
  });

  it("後台手動開通（source='manual'、amount 0）算實際購買者", () => {
    expect(countPaidBuyers([{ email: "m@x.com", status: "paid", source: "manual", amount: 0 }])).toBe(1);
  });

  it("空輸入／缺 email → 0，不崩潰", () => {
    expect(countPaidBuyers()).toBe(0);
    expect(countPaidBuyers([])).toBe(0);
    expect(countPaidBuyers([{ status: "paid" }, { email: "  ", status: "paid" }])).toBe(0);
  });
});
