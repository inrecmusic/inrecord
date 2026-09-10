// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
const api = vi.fn();
vi.mock("@/lib/admin-client", () => ({ adminFetch: (...a) => api(...a) }));
import MessagesPage from "./MessagesPage";
afterEach(cleanup); beforeEach(() => vi.clearAllMocks());

const ok = (body) => ({ ok: true, status: 200, json: async () => body });
// 當頁只有 2 則（1 則未回覆），但全站有 120 則、37 則未回覆
const pageRows = [
  { id: "a", status: "pending", content: "當頁未回覆", user_name: "小明", user_email: "a@x.com" },
  { id: "b", status: "replied", content: "當頁已回覆", user_name: "小華", user_email: "b@x.com" },
];

function routeApi(url) {
  if (url.includes("count=true")) return Promise.resolve(ok({ unread: 37 }));
  if (url.includes("per_page=1")) return Promise.resolve(ok({ total: 120, data: [] }));
  if (url.includes("unit-comments")) return Promise.resolve(ok({ total: 120, data: pageRows }));
  return Promise.resolve(ok({ data: [] })); // videos / chapters
}

// 「未回覆」等字在分頁標籤與表格也有，統計卡要從 statCard 容器取
const cardValue = (label) =>
  [...document.querySelectorAll('[class*="statCard"]')].find((el) => el.textContent.startsWith(label))?.textContent;

describe("MessagesPage 統計用全站數字（不是只算當頁 20 筆）", () => {
  it("未回覆／已回覆顯示伺服器全量，不是當頁的 1 則／1 則", async () => {
    api.mockImplementation(routeApi);
    render(<MessagesPage showToast={vi.fn()} />);

    await screen.findByText("當頁未回覆");
    expect(cardValue("未回覆")).toContain("37");
    expect(cardValue("已回覆")).toContain("83");
    expect(cardValue("全部留言")).toContain("120");
  });

  it("「未回覆」分頁標籤上的徽章也是全站未回覆數", async () => {
    api.mockImplementation(routeApi);
    render(<MessagesPage showToast={vi.fn()} />);

    await screen.findByText("當頁未回覆");
    const tab = screen.getByRole("button", { name: /未回覆/ });
    expect(within(tab).getByText("37")).toBeTruthy();
  });

  it("搜尋框明講只作用在目前這一頁（後端沒有搜尋參數）", async () => {
    api.mockImplementation(routeApi);
    render(<MessagesPage showToast={vi.fn()} />);

    expect(await screen.findByText(/只搜尋目前這一頁/)).toBeTruthy();
  });

  it("載入失敗顯示錯誤與重試，不會被當成「還沒有任何留言」", async () => {
    api.mockImplementation((url) =>
      url.includes("unit-comments")
        ? Promise.resolve({ ok: false, status: 500, json: async () => ({ error: "server_error" }) })
        : Promise.resolve(ok({ data: [] }))
    );
    render(<MessagesPage showToast={vi.fn()} />);

    expect(await screen.findAllByText(/server_error/)).toBeTruthy();
    expect(screen.queryByText("還沒有任何留言")).toBeNull();
    expect(screen.getAllByRole("button", { name: "重試" }).length).toBeGreaterThan(0);
  });
});
