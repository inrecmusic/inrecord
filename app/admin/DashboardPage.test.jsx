// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import DashboardPage from "./DashboardPage";
afterEach(cleanup);

const now = new Date().toISOString();
const orders = [
  { id: "1", status: "paid", source: "payuni", amount: 3999, created_at: now },
  { id: "2", status: "paid", source: "concert", amount: 3500, created_at: now },
  { id: "3", status: "paid", source: "manual", amount: 0, created_at: now },  // 手動開通不算成交
  { id: "4", status: "pending", source: "payuni", amount: 3999, created_at: now },
];
const card = (label) =>
  [...document.querySelectorAll('[class*="statCard"]')].find((el) => el.textContent.startsWith(label))?.textContent;

const noop = () => {};
const renderDash = (props) => render(
  <DashboardPage orders={orders} trendFilter="month" donutFilter="month"
    setTrendFilter={noop} setDonutFilter={noop} onViewOrders={noop} leads={[]} {...props} />
);

describe("DashboardPage 同一頁的成交筆數定義一致", () => {
  it("本月訂單排除手動開通單（3 筆已付款 → 2）", () => {
    renderDash();
    expect(card("本月訂單")).toContain("2");
  });

  // 漏斗「完成付款」刻意仍含手動開通單：2026-09-05 定案只改「本月訂單」與訂單頁「已付款訂單」兩張卡，
  // 其餘口徑是否全面排除 manual 尚未定案（2026-09-11 老闆指示暫不處理）。
  it("漏斗「完成付款」維持含手動開通單（3 筆）", () => {
    renderDash();
    expect(screen.getByText(/3 人/)).toBeTruthy();
  });

  it("營收不受影響（手動開通單金額為 0）", () => {
    renderDash();
    expect(card("總營收")).toContain("7,499");
  });

  // 舊卡「總學員數／Demo 開啟率」讀 course_preview_leads，2026-09 起留 Email 只進 Brevo、該表無人寫入 → 永遠 0。
  it("付費學員＝去重後的付款人數，手動開通單與未付款不算", () => {
    renderDash({ orders: [...orders, { id: "5", status: "paid", source: "payuni", amount: 3999, email: "A@x.com", created_at: now }] });
    expect(card("付費學員")).toContain("1"); // 只有第 5 筆有 email；1~4 無 email 不計
  });

  it("付費學員：同一人多筆訂單只算一次（不分大小寫）", () => {
    renderDash({ orders: [
      { id: "1", status: "paid", source: "payuni", amount: 3999, email: "a@x.com", created_at: now },
      { id: "2", status: "paid", source: "payuni", amount: 3999, email: "A@X.com", created_at: now },
      { id: "3", status: "paid", source: "manual", amount: 0, email: "m@x.com", created_at: now },
    ] });
    expect(card("付費學員")).toContain("1");
  });

  it("潛客名單：抓得到顯示人數，抓不到顯示「—」不冒充 0", () => {
    renderDash({ leadCount: 44 });
    expect(card("潛客名單")).toContain("44");
    cleanup();
    renderDash();
    expect(card("潛客名單")).toContain("—");
  });
});
