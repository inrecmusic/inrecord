// 測試信不可混進「寄送成效」：測試信與正式群發往往同主旨、同一天，
// 若 email_log 的 kind 相同就會被 groupSends 併成同一組，寄出數與開信率整個算歪。
// 實際隔離靠兩件事：(1) 寄測試信時 kind 記成 newsletter_test（見 app/api/admin/newsletter/send）
//                  (2) email-stats 的顯示白名單不含它
import { describe, it, expect } from "vitest";
import { groupSends } from "./email-stats.js";

const DISPLAY_KINDS = ["newsletter", "custom", "trial", "followup", "recovery"]; // 與 route.js 的 KINDS 一致

describe("測試信與正式群發不可併組", () => {
  const rows = [
    // 同一天、同一個主旨的測試信
    { to_email: "boss@x.com", subject: "課程上架時程異動公告", kind: "newsletter_test", status: "sent", created_at: "2026-09-13T02:00:00Z" },
    { to_email: "helper@x.com", subject: "課程上架時程異動公告", kind: "newsletter_test", status: "sent", created_at: "2026-09-13T02:01:00Z" },
    // 正式群發
    { to_email: "a@x.com", subject: "課程上架時程異動公告", kind: "newsletter", status: "sent", created_at: "2026-09-13T05:00:00Z" },
    { to_email: "b@x.com", subject: "課程上架時程異動公告", kind: "newsletter", status: "sent", created_at: "2026-09-13T05:00:05Z" },
  ];

  it("kind 不同就分成兩組，正式群發的寄出數不含測試信", () => {
    const groups = groupSends(rows);
    expect(groups).toHaveLength(2);
    const real = groups.find((g) => g.kind === "newsletter");
    expect(real.sentCount).toBe(2); // 不是 4
  });

  it("newsletter_test 不在面板的顯示白名單內", () => {
    const shown = groupSends(rows).filter((g) => DISPLAY_KINDS.includes(g.kind));
    expect(shown).toHaveLength(1);
    expect(shown[0].kind).toBe("newsletter");
  });
});
