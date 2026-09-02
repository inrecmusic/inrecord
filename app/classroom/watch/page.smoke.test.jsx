// @vitest-environment jsdom
// 播放頁 smoke test。2026-09-02 開課當晚，一段殘留 effect 引用了已刪除的 state，
// 播放頁對已開通學員整頁崩潰，但 HTTP 全 200、伺服器日誌乾淨——沒有任何自動檢查擋得住。
// 這支測試把整頁真的 render 起來（mock 掉 supabase 與 bootstrap），render 或 effect 只要
// 丟出例外就會失敗；順帶釘住側欄「預計上架」文案的排程。
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { id: "u1", email: "student@example.com" } } }),
      getSession: async () => ({ data: { session: { access_token: "tok" } } }),
    },
  },
}));

const CHAPTERS = [
  { id: "c1", title: "Ch1 先坐上琴椅" },
  { id: "c2", title: "Ch2 音名與唱名" },
  { id: "c3", title: "Ch3 節奏" },
  { id: "c4", title: "Ch4 和弦" },
  { id: "c5", title: "Ch5 伴奏" },
];
// 只有 1-1 掛了影片；其餘皆未上架，側欄會印各自的「預計 X 上架」
const VIDEOS = [
  { id: "v11", chapter_id: "c1", title: "1-1 認識鍵盤", bunny_video_id: "bunny-1" },
  { id: "v13", chapter_id: "c1", title: "1-3 手型" },
  { id: "v21", chapter_id: "c2", title: "2-1 音名" },
  { id: "v31", chapter_id: "c3", title: "3-1 四分音符" },
  { id: "v41", chapter_id: "c4", title: "4-1 大三和弦" },
  { id: "v51", chapter_id: "c5", title: "5-1 分解和弦" },
];
const BOOTSTRAP = {
  hasPurchased: true,
  hasSubscription: false,
  chapters: CHAPTERS,
  videos: VIDEOS,
  progress: [],
  announcements: [],
  contentItems: {},
  contentStats: null,
  // 核心資料齊全 → 不會被首次引導攔截
  profile: { real_name: "王小明", phone: "0912345678", level: "none" },
};

const json = (body) => Promise.resolve({ ok: true, json: async () => body });

// 這個 jsdom 版本的 localStorage 少了 setItem，頁面的 getDeviceId() 會直接丟錯。
// 補一個記憶體版，讓測試測的是頁面本身而不是環境缺口。
function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
}

let ClassroomPage;
beforeEach(async () => {
  vi.stubGlobal("localStorage", memoryStorage());
  window.innerWidth = 1440; // jsdom 預設 1024 會被判成平板，側欄收進抽屜就測不到
  vi.stubGlobal("fetch", vi.fn((url) =>
    String(url).includes("/api/classroom/bootstrap") ? json(BOOTSTRAP) : json({})
  ));
  ClassroomPage = (await import("./page.jsx")).default;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("播放頁", () => {
  it("已開通學員進頁不會崩潰，側欄列出章節與單元", async () => {
    const { container } = render(<ClassroomPage />);
    await waitFor(() => expect(container.textContent).toContain("1-1 認識鍵盤"));
    // 章節標題在麵包屑與側欄各出現一次，故比對整頁文字而非單一節點
    for (const c of CHAPTERS) expect(container.textContent).toContain(c.title);
    for (const v of VIDEOS) expect(container.textContent).toContain(v.title);
  });

  it("未上架單元顯示各章的預計上架日", async () => {
    const { container } = render(<ClassroomPage />);
    await waitFor(() => expect(container.textContent).toContain("1-1 認識鍵盤"));
    const text = container.textContent;
    expect(text).toContain("預計 9/3 上架");   // 1-3：單元層覆寫
    expect(text).toContain("預計 9/9 上架");   // 第二章
    expect(text).toContain("預計 9/16 上架");  // 第三章
    expect(text).toContain("預計 9/23 上架");  // 第四章
    expect(text).toContain("預計 9/30 上架");  // 第五章之後：完整課程全數上架
  });
});
