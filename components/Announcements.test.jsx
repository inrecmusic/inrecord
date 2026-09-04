// @vitest-environment jsdom
// 教室公告（播放頁版）：鈴鐺＋未讀數、未讀提示條、右側抽屜、重要公告卡片。
// 規則：沒有公告 → 什麼都不畫；打開抽屜再關掉 → 全部算已讀；重要公告要按「知道了」才消失，且只彈一次。
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useAnnouncements, AnnouncementsBell, AnnouncementsStrip, AnnouncementsDrawer, ImportantDialog } from "./Announcements";

afterEach(cleanup);

const fakeStorage = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
const A = (id, extra = {}) => ({ id, title: `標題 ${id}`, body: `內容 ${id}`, pinned: false, published: true, important: false, created_at: "2026-09-04T00:00:00Z", ...extra });

function Harness({ items, storage }) {
  const ann = useAnnouncements(items, { storage });
  return (
    <div data-testid="root">
      <AnnouncementsBell ann={ann} />
      <AnnouncementsStrip ann={ann} />
      <AnnouncementsDrawer ann={ann} />
      <ImportantDialog ann={ann} />
    </div>
  );
}

describe("Announcements（播放頁）", () => {
  it("沒有公告 → 鈴鐺、提示條、抽屜、卡片全都不畫", () => {
    render(<Harness items={[]} storage={fakeStorage()} />);
    expect(screen.getByTestId("root").innerHTML).toBe("");
  });

  it("兩則未讀 → 鈴鐺顯示 2、提示條放最新那則", () => {
    const items = [A("old", { created_at: "2026-09-01T00:00:00Z" }), A("new", { created_at: "2026-09-04T00:00:00Z" })];
    render(<Harness items={items} storage={fakeStorage()} />);
    expect(screen.getByLabelText("公告，2 則未讀")).toBeTruthy();
    expect(screen.getByText("標題 new")).toBeTruthy();
    expect(screen.queryByText("標題 old")).toBeNull(); // 提示條只放一則
  });

  it("點鈴鐺開抽屜列出全部；關掉後全部算已讀，紅點與提示條消失", async () => {
    const storage = fakeStorage();
    const items = [A("old", { created_at: "2026-09-01T00:00:00Z" }), A("new", { created_at: "2026-09-04T00:00:00Z" })];
    render(<Harness items={items} storage={storage} />);
    fireEvent.click(screen.getByLabelText("公告，2 則未讀"));
    expect(screen.getByRole("dialog", { name: "課程公告" })).toBeTruthy();
    expect(screen.getAllByText("標題 old").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByLabelText("關閉公告清單"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("公告")).toBeTruthy();          // 沒有未讀數的鈴鐺
    expect(screen.queryByText("標題 new")).toBeNull();           // 提示條消失
    expect(storage.getItem("inrec_ann_seen_at")).toBeTruthy();
  });

  it("重要公告：先彈卡片，按「知道了」才消失，並記住不再彈", () => {
    const storage = fakeStorage();
    render(<Harness items={[A("imp", { important: true })]} storage={storage} />);
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("標題 imp");
    fireEvent.click(screen.getByText("知道了"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(storage.getItem("inrec_ann_acked")).toBe(JSON.stringify(["imp"]));
  });

  it("內容以 Markdown 呈現且已跳脫", () => {
    render(<Harness items={[A("md", { body: "**粗體** <b>x</b>" })]} storage={fakeStorage()} />);
    fireEvent.click(screen.getByLabelText("公告，1 則未讀"));
    const dialog = screen.getByRole("dialog", { name: "課程公告" });
    expect(dialog.querySelector(".ann-md strong")?.textContent).toBe("粗體");
    expect(dialog.querySelector("b")).toBeNull();
    expect(dialog.textContent).toContain("<b>x</b>");
  });
});
