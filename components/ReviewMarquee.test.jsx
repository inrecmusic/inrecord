// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import ReviewMarquee from "./ReviewMarquee";

afterEach(cleanup);

const card = (i, text = null) => ({ id: `r${i}`, score: 5, text, name: `學員${i}`, date: "2026/10/05" });

describe("ReviewMarquee（首頁課程評價跑馬燈）", () => {
  it("不足 3 張不渲染", () => {
    const { container } = render(<ReviewMarquee cards={[card(1), card(2)]} rating={5} ratingCount={2} />);
    expect(container.innerHTML).toBe("");
  });

  it("3 張：標題、星等、每張暱稱／日期；無文字卡沒有文字段落；補到 8 張再重複一份做無縫循環", () => {
    render(<ReviewMarquee cards={[card(1, "很有幫助"), card(2), card(3)]} rating={5} ratingCount={4} />);
    expect(screen.getByRole("heading", { name: "課程評價" })).toBeTruthy();
    expect(screen.getByText("5.0")).toBeTruthy();
    expect(screen.getByText("4 則學員評價")).toBeTruthy();
    // 3 張 → fillLoop 到 9 張 → track 兩份 = 18 張
    expect(screen.getAllByText("學員1")).toHaveLength(6);
    expect(screen.getAllByText("很有幫助")).toHaveLength(6);
    const blank = screen.getAllByTestId("review-card").filter((el) => el.getAttribute("data-has-text") === "false");
    expect(blank.length).toBe(12); // 學員2、學員3 各 6 份
    blank.forEach((el) => expect(el.querySelector("p")).toBeNull());
  });

  it("第二份 track 對輔助科技隱藏；星星以 aria-label 讀出分數", () => {
    const { container } = render(<ReviewMarquee cards={[card(1), card(2), card(3)]} rating={5} ratingCount={3} />);
    expect(container.querySelectorAll('[aria-hidden="true"][data-track="clone"]')).toHaveLength(1);
    expect(screen.getAllByLabelText("5 顆星").length).toBeGreaterThan(0);
  });

  it("補圈的重複卡片標 data-dup 且對輔助科技隱藏；原始 3 張不隱藏（reduced-motion／螢幕閱讀器只看到一份）", () => {
    const { container } = render(<ReviewMarquee cards={[card(1), card(2), card(3)]} rating={5} ratingCount={3} />);
    const originals = container.querySelectorAll('[data-testid="review-card"]:not([data-dup])');
    expect(originals).toHaveLength(3);
    originals.forEach((el) => expect(el.getAttribute("aria-hidden")).toBeNull());
    const dups = container.querySelectorAll('[data-testid="review-card"][data-dup="true"]');
    expect(dups).toHaveLength(15); // 第一份 track 補到 9 張多出 6 張 ＋ 第二份 track 整份 9 張
    dups.forEach((el) => expect(el.getAttribute("aria-hidden")).toBe("true"));
  });

  it("rating 為 null（hero 不顯示星等）時只顯示標題，不出現 NaN", () => {
    const { container } = render(<ReviewMarquee cards={[card(1), card(2), card(3)]} rating={null} ratingCount={0} />);
    expect(container.textContent).not.toContain("NaN");
    expect(screen.queryByText(/則學員評價/)).toBeNull();
  });

  it("不出現任何 email 樣式字串", () => {
    const { container } = render(<ReviewMarquee cards={[card(1), card(2), card(3)]} rating={5} ratingCount={3} />);
    expect(container.textContent).not.toMatch(/@/);
  });
});
