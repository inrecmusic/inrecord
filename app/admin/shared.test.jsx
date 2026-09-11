// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
const api = vi.fn();
vi.mock("@/lib/admin-client", () => ({ adminFetch: (...a) => api(...a) }));
import { payTypeLabel, fetchCommentStats } from "./shared";
beforeEach(() => vi.clearAllMocks());

describe("payTypeLabel（統一走 lib/dashboard 的 payLabel）", () => {
  it("PayUni 數字碼照 lib/dashboard 對照表翻譯，含先前漏掉的 6＝超商條碼", () => {
    expect(payTypeLabel("1")).toBe("信用卡");
    expect(payTypeLabel("2")).toBe("ATM 轉帳");
    expect(payTypeLabel("3")).toBe("超商代碼");
    expect(payTypeLabel("6")).toBe("超商條碼");
  });

  it("先前漏掉的字串型別也翻得出來", () => {
    expect(payTypeLabel("WEBATM")).toBe("網路 ATM");
    expect(payTypeLabel("CVSCOM")).toBe("超商條碼");
    expect(payTypeLabel("BARCODE")).toBe("超商條碼");
  });

  it("未知碼原樣顯示、空值顯示破折號（維持原行為）", () => {
    expect(payTypeLabel("ZZZ")).toBe("ZZZ");
    expect(payTypeLabel("")).toBe("—");
    expect(payTypeLabel(null)).toBe("—");
    expect(payTypeLabel(undefined)).toBe("—");
  });

  it("傳整筆訂單時，沒有 pay_type 會退回來源標籤（與對帳彙整一致）", () => {
    expect(payTypeLabel({ source: "concert" })).toBe("音樂會現場");
    expect(payTypeLabel({ source: "wordpress" })).toBe("碩樂現場");
    expect(payTypeLabel({ pay_type: "6", source: "payuni" })).toBe("超商條碼");
  });
});

describe("fetchCommentStats（統計取伺服器全量、不是只算當頁）", () => {
  it("全部＝清單 total、未回覆＝count=true 的 unread、已回覆＝兩者相減", async () => {
    api.mockImplementation((url) =>
      url.includes("count=true")
        ? Promise.resolve({ ok: true, status: 200, json: async () => ({ unread: 37 }) })
        : Promise.resolve({ ok: true, status: 200, json: async () => ({ total: 120, data: [] }) })
    );
    await expect(fetchCommentStats()).resolves.toEqual({ total: 120, pending: 37, replied: 83 });
  });

  it("只抓 1 筆列表，不會把整份留言撈回來", async () => {
    api.mockResolvedValue({ ok: true, status: 200, json: async () => ({ total: 5, unread: 5, data: [] }) });
    await fetchCommentStats();
    expect(api).toHaveBeenCalledWith("/api/admin/unit-comments?page=1&per_page=1");
    expect(api).toHaveBeenCalledWith("/api/admin/unit-comments?count=true");
  });

  it("unread 大於 total 等異常資料不會算出負數", async () => {
    api.mockImplementation((url) =>
      url.includes("count=true")
        ? Promise.resolve({ ok: true, status: 200, json: async () => ({ unread: 9 }) })
        : Promise.resolve({ ok: true, status: 200, json: async () => ({ total: 3 }) })
    );
    await expect(fetchCommentStats()).resolves.toEqual({ total: 3, pending: 9, replied: 0 });
  });

  it("任一支失敗就 throw，呼叫端才不會把 0 當成真實統計", async () => {
    api.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: "server_error" }) });
    await expect(fetchCommentStats()).rejects.toThrow("server_error");
  });
});
