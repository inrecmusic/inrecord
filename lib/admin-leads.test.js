import { describe, it, expect } from "vitest";
import { fetchPendingLeads, LEAD_SOURCES } from "./admin-leads.js";

// 最小 supabase 假物件：依鏈式 .in()/.is() 實際過濾 seed 資料後回 { data, error }。
function fakeSupabase(orders) {
  return {
    from() {
      let rows = [...orders];
      const b = {
        select() { return b; },
        in(col, vals) { rows = rows.filter((r) => vals.includes(r[col])); return b; },
        is(col, val) { rows = rows.filter((r) => (val === null ? r[col] == null : r[col] === val)); return b; },
        then(onF, onR) { return Promise.resolve({ data: rows, error: null }).then(onF, onR); },
      };
      return b;
    },
  };
}

describe("LEAD_SOURCES", () => {
  it("同時涵蓋 wordpress(碩樂) 與 concert(concert-shop) 兩個 webhook 來源", () => {
    expect(LEAD_SOURCES).toContain("wordpress");
    expect(LEAD_SOURCES).toContain("concert");
  });
});

describe("fetchPendingLeads", () => {
  const orders = [
    { id: "1", email: "a@x.com", source: "wordpress", access_granted_at: null },
    { id: "2", email: "b@x.com", source: "concert",   access_granted_at: null },
    { id: "3", email: "c@x.com", source: "wordpress", access_granted_at: "2026-06-01" }, // 已開通
    { id: "4", email: "d@x.com", source: "direct",    access_granted_at: null },          // 非 webhook 名單
  ];

  it("撈出未處理的 wordpress 與 concert（concert 不可漏！），排除已處理與其他來源", async () => {
    const { data } = await fetchPendingLeads(fakeSupabase(orders), {
      columns: "id, email, plan",
      flagColumn: "access_granted_at",
    });
    expect(data.map((o) => o.id).sort()).toEqual(["1", "2"]);
  });

  it("flagColumn 可指定為寄信旗標（presale_email_sent_at）", async () => {
    const rows = [
      { id: "1", source: "concert", presale_email_sent_at: null },
      { id: "2", source: "concert", presale_email_sent_at: "2026-06-01" },
    ];
    const { data } = await fetchPendingLeads(fakeSupabase(rows), {
      columns: "id, email",
      flagColumn: "presale_email_sent_at",
    });
    expect(data.map((o) => o.id)).toEqual(["1"]);
  });
});
