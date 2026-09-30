// @vitest-environment jsdom
// 儀表板整頁 smoke（mock supabase／bootstrap）：三種放行情境的文案與「接著看」海報，
// 以及新版版面的骨架（進度分母＝已開放單元、章節卡狀態、遊戲間）。
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

const base = {
  hasPurchased: true, hasSubscription: false, progress: [], announcements: [],
  chapters: [{ id: "c1", title: "Ch1 踏上黑白鍵的第一步", sort_order: 0 }, { id: "c2", title: "Ch2 音符的語言—音名與唱名", sort_order: 1 }],
  totalCount: 2, completedCount: 0, percentage: 0,
  profile: { real_name: "王小明", phone: "0912345678", level: "none" }, // 核心資料齊全 → 不被首次引導攔截
};
const NONE_PLAYABLE = [
  { id: "v1", chapter_id: "c1", title: "1-1 認識鍵盤", playable: false, duration: "05:09" },
  { id: "v2", chapter_id: "c1", title: "1-2 手型", playable: false, duration: null },
];

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() };
}

let ClassroomHub;
async function mount(bootstrap) {
  vi.stubGlobal("fetch", vi.fn((url) =>
    Promise.resolve({ ok: true, json: async () => (String(url).includes("/api/classroom/bootstrap") ? bootstrap : { games: [] }) })
  ));
  const { container } = render(<ClassroomHub />);
  await waitFor(() => expect(container.textContent).toContain("王小明"));
  return container;
}

beforeEach(async () => {
  vi.stubGlobal("localStorage", memoryStorage());
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  // 直接測新版元件：page.jsx 只是依 HUB_V3 決定要渲染哪一版的薄殼
  ClassroomHub = (await import("./HubV3.jsx")).default;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("儀表板：放行情境", () => {
  it("非早鳥（earlyAccess=false）且無可播單元 → 9/30 開放文案、海報是鎖定版、不渲染播放連結", async () => {
    const c = await mount({ ...base, videos: NONE_PLAYABLE, earlyAccess: false });
    expect(c.textContent).toContain("第一批章節 9/30 開放，開放後從這裡接著上");
    expect(c.querySelector("a.poster")).toBeNull();
    expect(c.querySelector(".poster.locked")).not.toBeNull();
    // 章節卡全部鎖定並標開放日
    expect(c.querySelectorAll(".chapter.locked").length).toBe(2);
    expect(c.textContent).toContain("9/30 開放");
  });

  it("早鳥（earlyAccess=true）有可播單元 → 海報連到該單元、本章單元列出現", async () => {
    const videos = [{ ...NONE_PLAYABLE[0], playable: true }, NONE_PLAYABLE[1]];
    const c = await mount({ ...base, videos, earlyAccess: true });
    expect(c.querySelector("a.poster")?.getAttribute("href")).toBe("/classroom/watch?v=v1");
    expect(c.textContent).toContain("從 1-1 開始，我們慢慢來");
    expect(c.textContent).toContain("已開放 1 支，看了 0 支");
    expect(c.querySelectorAll(".lesson").length).toBe(2);
    expect(c.querySelector(".lesson.next h3")?.textContent).toBe("認識鍵盤");
    expect(c.querySelector(".lesson.locked")).not.toBeNull();
  });

  it("完整上架後 bootstrap 不帶 earlyAccess（undefined）→ 無可播單元也不提 9/30", async () => {
    const c = await mount({ ...base, videos: NONE_PLAYABLE });
    expect(c.textContent).toContain("課程準備中");
    expect(c.textContent).not.toContain("9/30 開放，開放後");
  });
});

describe("儀表板：版面骨架", () => {
  it("章節標題拆成主標＋副標、羅馬數字；有公告時右欄是公告卡並可開啟", async () => {
    const announcements = [{ id: "a1", title: "第二章上架", body: "這一章是後面所有內容的地基。", pinned: false, important: false, published: true, created_at: "2026-09-24T10:00:00Z" }];
    const c = await mount({ ...base, videos: [{ ...NONE_PLAYABLE[0], playable: true }], earlyAccess: true, announcements });
    expect(c.querySelector(".chapter h3")?.textContent).toContain("踏上黑白鍵的第一步");
    expect([...c.querySelectorAll(".chapter h3 small")].map((e) => e.textContent)).toContain("音名與唱名");
    expect([...c.querySelectorAll(".chapter .roman")].map((e) => e.textContent)).toEqual(["Ⅰ", "Ⅱ"]);
    const card = c.querySelector("a.anncard");
    expect(card?.textContent).toContain("第二章上架");
    card.click();
    await waitFor(() => expect(document.querySelector(".ann-modal")).not.toBeNull());
  });

  it("沒有遊戲存取 → 遊戲間顯示課程包說明；有存取且遊戲已上傳 → 標「可以玩了」並可就地開啟", async () => {
    const c1 = await mount({ ...base, videos: [{ ...NONE_PLAYABLE[0], playable: true }], earlyAccess: true });
    expect(c1.textContent).toContain("課程包附贈的互動練習");
    cleanup();
    vi.stubGlobal("fetch", vi.fn((url) => Promise.resolve({ ok: true, json: async () =>
      String(url).includes("/api/classroom/bootstrap")
        ? { ...base, hasSubscription: true, earlyAccess: true, videos: [{ id: "v21", chapter_id: "c2", title: "2-1 認識音名", playable: true, duration: "07:36" }] }
        : { games: [{ id: "g1", title: "音名快閃" }] } })));
    const { container: c2 } = render(<ClassroomHub />);
    await waitFor(() => expect(c2.textContent).toContain("可以玩了"));
    expect(c2.querySelectorAll(".game.soon").length).toBe(2);
    // 已上傳的遊戲卡是按鈕：點了就地開遊戲視窗，不用先進播放頁
    const open = c2.querySelector("button.game.open");
    expect(open).not.toBeNull();
    open.click();
    await waitFor(() => expect(document.body.textContent).toContain("🎮 音名快閃"));
  });
});
