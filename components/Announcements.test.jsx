// @vitest-environment jsdom
// 教室公告：一則一列的清單 → 點開置中彈出視窗（上一則／下一則），未讀逐則記錄。
// 規則：沒有公告 → 什麼都不畫；點開哪則才算哪則已讀；重要公告要按「知道了」才消失，且只彈一次。
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { useAnnouncements, AnnouncementsBell, AnnouncementsStrip, AnnouncementsDrawer, ImportantDialog, AnnouncementList, HubAnnouncements } from "./Announcements";

afterEach(cleanup);

const fakeStorage = (seed = {}) => {
  const m = new Map(Object.entries(seed));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};
const A = (id, extra = {}) => ({ id, title: `標題 ${id}`, body: `內容 ${id}`, pinned: false, published: true, important: false, created_at: "2026-09-04T00:00:00Z", ...extra });
const TWO = [A("old", { created_at: "2026-09-01T00:00:00Z" }), A("new", { created_at: "2026-09-04T00:00:00Z" })];

function Watch({ items, storage }) {
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
function Hub({ items, storage }) {
  const ann = useAnnouncements(items, { storage });
  return <div data-testid="root"><HubAnnouncements ann={ann} /></div>;
}
function Plain({ items, storage }) {
  const ann = useAnnouncements(items, { storage });
  return <div data-testid="root"><AnnouncementList ann={ann} /></div>;
}

const row = (title) => screen.getByRole("button", { name: new RegExp(title) });
const modal = () => screen.getByRole("dialog", { name: /標題/ });

describe("公告清單與彈出視窗", () => {
  it("沒有公告 → 鈴鐺、提示條、抽屜、卡片全都不畫", () => {
    render(<Watch items={[]} storage={fakeStorage()} />);
    expect(screen.getByTestId("root").innerHTML).toBe("");
  });

  it("兩則未讀 → 鈴鐺顯示 2、提示條放最新那則", () => {
    render(<Watch items={TWO} storage={fakeStorage()} />);
    expect(screen.getByLabelText("公告，2 則未讀")).toBeTruthy();
    expect(screen.getByText("標題 new")).toBeTruthy();
    expect(screen.queryByText("標題 old")).toBeNull(); // 提示條只放一則
  });

  it("清單一則一列：只顯示摘要（不整篇攤開），未讀的有圓點", () => {
    render(<Plain items={[A("a", { body: "**第一段**重點\n\n- 條列一\n- 條列二" })]} storage={fakeStorage()} />);
    const r = row("標題 a");
    expect(r.querySelector(".ann-ex").textContent).toBe("第一段重點 條列一 條列二"); // 不出現 ** 或 -
    expect(r.className).toContain("unread");
    expect(within(r).getByText("未讀")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull(); // 還沒點，不彈視窗
  });

  it("點一列 → 彈出視窗顯示完整內容，且只有那則變已讀", () => {
    const storage = fakeStorage();
    render(<Watch items={TWO} storage={storage} />);
    fireEvent.click(screen.getByLabelText("公告，2 則未讀"));
    fireEvent.click(row("標題 new"));
    const d = modal();
    expect(d.getAttribute("aria-modal")).toBe("true");
    expect(d.textContent).toContain("內容 new");
    expect(screen.getByLabelText("公告，1 則未讀")).toBeTruthy(); // 另一則還是未讀
    expect(JSON.parse(storage.getItem("inrec_ann_read"))).toEqual(["new"]);
    expect(row("標題 old").className).toContain("unread");
    expect(row("標題 new").className).not.toContain("unread");
  });

  it("上一則／下一則可連續讀，到頭到尾停用，切換也算已讀", () => {
    const storage = fakeStorage();
    render(<Plain items={TWO} storage={storage} />);
    fireEvent.click(row("標題 new")); // 排序後 new 在第一則
    expect(screen.getByText("1 / 2")).toBeTruthy();
    expect(screen.getByRole("button", { name: "← 上一則" }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "下一則 →" }));
    expect(modal().textContent).toContain("內容 old");
    expect(screen.getByText("2 / 2")).toBeTruthy();
    expect(screen.getByRole("button", { name: "下一則 →" }).disabled).toBe(true);
    expect(JSON.parse(storage.getItem("inrec_ann_read"))).toEqual(["new", "old"]);
  });

  it("Esc、點遮罩、關閉鈕都能關；關閉後焦點回到那一列", () => {
    render(<Plain items={TWO} storage={fakeStorage()} />);
    // 關閉鈕
    fireEvent.click(row("標題 new"));
    fireEvent.click(screen.getByLabelText("關閉公告"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(row("標題 new"));
    // Esc
    fireEvent.click(row("標題 old"));
    fireEvent.keyDown(modal(), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(row("標題 old"));
    // 點遮罩
    fireEvent.click(row("標題 old"));
    fireEvent.click(document.querySelector(".ann-modal-bd"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("開啟時焦點移進視窗並鎖住背景捲動，關閉後還原", () => {
    render(<Plain items={TWO} storage={fakeStorage()} />);
    expect(document.body.style.overflow).toBe("");
    fireEvent.click(row("標題 new"));
    expect(document.activeElement).toBe(modal());
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByLabelText("關閉公告"));
    expect(document.body.style.overflow).toBe("");
  });

  it("Tab 鎖在視窗裡（最後一個按鈕再 Tab 回到第一個）", () => {
    render(<Plain items={TWO} storage={fakeStorage()} />);
    fireEvent.click(row("標題 new"));
    const d = modal();
    const close = screen.getByLabelText("關閉公告");
    const next = screen.getByRole("button", { name: "下一則 →" });
    next.focus();
    fireEvent.keyDown(d, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    d.focus();
    fireEvent.keyDown(d, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(next);
  });

  it("內容以 Markdown 呈現且已跳脫", () => {
    render(<Plain items={[A("md", { body: "**粗體** <b>x</b>" })]} storage={fakeStorage()} />);
    fireEvent.click(row("標題 md"));
    const d = modal();
    expect(d.querySelector(".ann-md strong")?.textContent).toBe("粗體");
    expect(d.querySelector("b")).toBeNull();
    expect(d.textContent).toContain("<b>x</b>");
  });
});

describe("未讀遷移（舊使用者升級）", () => {
  it("只有舊的 inrec_ann_seen_at 時：seenAt 之前的一次記成已讀，不會冒出一堆未讀", () => {
    const storage = fakeStorage({ inrec_ann_seen_at: "2026-09-02T00:00:00.000Z" });
    render(<Watch items={TWO} storage={storage} />);
    expect(screen.getByLabelText("公告，1 則未讀")).toBeTruthy(); // 只有 9/4 那則未讀
    expect(JSON.parse(storage.getItem("inrec_ann_read"))).toEqual(["old"]);
  });

  it("seenAt 晚於全部 → 全部已讀，鈴鐺沒有未讀數字（提示條常駐但不強調）", () => {
    const storage = fakeStorage({ inrec_ann_seen_at: "2026-09-09T00:00:00.000Z" });
    render(<Watch items={TWO} storage={storage} />);
    expect(screen.getByLabelText("公告")).toBeTruthy(); // 沒有「N 則未讀」
    expect(JSON.parse(storage.getItem("inrec_ann_read"))).toEqual(["new", "old"]);
  });

  it("已有逐則記錄的裝置不再看 seenAt（不會把未讀蓋掉）", () => {
    const storage = fakeStorage({ inrec_ann_seen_at: "2026-09-09T00:00:00.000Z", inrec_ann_read: JSON.stringify([]) });
    render(<Watch items={TWO} storage={storage} />);
    expect(screen.getByLabelText("公告，2 則未讀")).toBeTruthy();
  });

  it("全新裝置（什麼都沒有）→ 全部未讀", () => {
    const storage = fakeStorage();
    render(<Watch items={TWO} storage={storage} />);
    expect(screen.getByLabelText("公告，2 則未讀")).toBeTruthy();
    expect(JSON.parse(storage.getItem("inrec_ann_read"))).toEqual([]);
  });
});

describe("抽屜與儀表板共用同一組清單", () => {
  it("抽屜：點鈴鐺開、關閉鈕關；關掉不再等於全部已讀", () => {
    const storage = fakeStorage();
    render(<Watch items={TWO} storage={storage} />);
    fireEvent.click(screen.getByLabelText("公告，2 則未讀"));
    expect(screen.getByRole("dialog", { name: "課程公告" })).toBeTruthy();
    expect(screen.getAllByText("標題 old").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByLabelText("關閉公告清單"));
    expect(screen.queryByRole("dialog", { name: "課程公告" })).toBeNull();
    expect(screen.getByLabelText("公告，2 則未讀")).toBeTruthy(); // 沒點開＝還是未讀
  });

  it("儀表板：最多 3 則，可展開全部，點下去開同一個視窗", () => {
    const items = [1, 2, 3, 4].map((n) => A(`a${n}`, { created_at: `2026-09-0${n}T00:00:00Z` }));
    render(<Hub items={items} storage={fakeStorage()} />);
    expect(document.querySelectorAll(".ann-row")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "全部公告（4）→" }));
    expect(document.querySelectorAll(".ann-row")).toHaveLength(4);
    fireEvent.click(row("標題 a1"));
    expect(modal().textContent).toContain("內容 a1");
  });

  it("置頂徽章顯示在列與視窗裡", () => {
    render(<Plain items={[A("p", { pinned: true })]} storage={fakeStorage()} />);
    expect(within(row("標題 p")).getByText("置頂")).toBeTruthy();
    fireEvent.click(row("標題 p"));
    expect(within(modal()).getByText("置頂")).toBeTruthy();
  });
});

describe("重要公告卡片（行為不變）", () => {
  it("先彈卡片，按「知道了」才消失，並記住不再彈", () => {
    const storage = fakeStorage();
    render(<Watch items={[A("imp", { important: true })]} storage={storage} />);
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("標題 imp");
    fireEvent.click(screen.getByText("知道了"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(storage.getItem("inrec_ann_acked")).toBe(JSON.stringify(["imp"]));
  });

  it("按「知道了」不等於已讀，清單裡仍是未讀", () => {
    const storage = fakeStorage();
    render(<Watch items={[A("imp", { important: true })]} storage={storage} />);
    fireEvent.click(screen.getByText("知道了"));
    expect(screen.getByLabelText("公告，1 則未讀")).toBeTruthy();
  });
});

// 覆驗抓到的兩個 major，釘死避免再犯
describe("覆驗迴歸", () => {
  it("彈出視窗要掛在 body 上，不留在祖先的堆疊環境裡", () => {
    // 儀表板的 .wrap 有 position:relative + z-index，視窗若留在裡面，
    // 右下角固定的「登出」按鈕會浮在遮罩之上還可以點 → 學員讀公告時誤按就登出。
    render(<Watch items={TWO} storage={fakeStorage()} />);
    fireEvent.click(screen.getByLabelText(/公告/));
    fireEvent.click(screen.getAllByRole("button", { name: /標題 new/ })[0]);
    const dialog = screen.getByRole("dialog", { name: /標題 new/ });
    const root = screen.getByTestId("root");
    expect(root.contains(dialog)).toBe(false);   // 跳出了會關住 z-index 的容器
    expect(document.body.contains(dialog)).toBe(true);
  });

  it("「重要」徽章要和「置頂」在視覺上分得出來", () => {
    render(<Hub items={[A("x", { important: true, pinned: true })]} storage={fakeStorage()} />);
    const imp = screen.getByText("重要");
    const pin = screen.getByText("置頂");
    expect(imp.className).not.toBe(pin.className); // 兩顆不可共用同一組樣式
    expect(imp.className).toContain("imp");
  });
});
