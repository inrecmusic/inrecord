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

  it("總學員數用伺服器回傳的 total，不是被分頁截斷的清單長度", () => {
    renderDash({ leads: [{ id: "l1" }, { id: "l2" }], leadsTotal: 137 });
    expect(card("總學員數")).toContain("137");
  });
});
