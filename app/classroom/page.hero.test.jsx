// @vitest-environment jsdom
// 儀表板 hero 文案：非早鳥 9/30 前 bootstrap 把所有正課的可播欄位摘掉 → nextVideo 為 null、CTA 不渲染，
// 此時不能再說「點下面接著上次的進度」（下面沒東西可點）。整頁 render（mock supabase／bootstrap）釘住三種情境。
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
  chapters: [{ id: "c1", title: "Ch1" }],
  totalCount: 2, completedCount: 0, percentage: 0,
  profile: { real_name: "王小明", phone: "0912345678", level: "none" }, // 核心資料齊全 → 不被首次引導攔截
};
const NONE_PLAYABLE = [
  { id: "v1", chapter_id: "c1", title: "1-1 認識鍵盤", playable: false },
  { id: "v2", chapter_id: "c1", title: "1-2 手型", playable: false },
];

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() };
}

let ClassroomHub;
async function mount(bootstrap) {
  vi.stubGlobal("fetch", vi.fn((url) =>
    Promise.resolve({ ok: true, json: async () => (String(url).includes("/api/classroom/bootstrap") ? bootstrap : {}) })
  ));
  const { container } = render(<ClassroomHub />);
  await waitFor(() => expect(container.textContent).toContain("王小明"));
  return container;
}

beforeEach(async () => {
  vi.stubGlobal("localStorage", memoryStorage());
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  ClassroomHub = (await import("./page.jsx")).default;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("儀表板 hero 文案", () => {
  it("非早鳥（earlyAccess=false）且無可播單元 → 改顯示 9/30 開放文案、不渲染 CTA", async () => {
    const c = await mount({ ...base, videos: NONE_PLAYABLE, earlyAccess: false });
    expect(c.textContent).toContain("第一批章節 9/30 開放，開放後從這裡接著上");
    expect(c.textContent).not.toContain("點下面接著上次的進度");
    expect(c.querySelector("a.cta")).toBeNull();
  });

  it("早鳥（earlyAccess=true）有可播單元 → 維持原句並顯示繼續上課 CTA", async () => {
    const videos = [{ ...NONE_PLAYABLE[0], playable: true }, NONE_PLAYABLE[1]];
    const c = await mount({ ...base, videos, earlyAccess: true });
    expect(c.textContent).toContain("點下面接著上次的進度");
    expect(c.querySelector("a.cta")?.getAttribute("href")).toBe("/classroom/watch?v=v1");
  });

  it("完整上架後 bootstrap 不帶 earlyAccess（undefined）→ 無可播單元也維持原句（只有明確 false 才換文案）", async () => {
    const c = await mount({ ...base, videos: NONE_PLAYABLE });
    expect(c.textContent).toContain("點下面接著上次的進度");
    expect(c.textContent).not.toContain("9/30 開放");
  });
});
