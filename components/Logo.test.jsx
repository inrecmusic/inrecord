// @vitest-environment jsdom
// Logo 必須是真品牌字標（襯線 InRecord＋牛眼 o 的 PNG），不是用系統字體拼出來的仿製品。
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import Logo from "./Logo";

afterEach(cleanup);

describe("Logo（真品牌字標）", () => {
  it("預設渲染深色字標 PNG，alt=InRecord，高度＝size", () => {
    const { getByAltText } = render(<Logo size={28} />);
    const img = getByAltText("InRecord");
    expect(img.tagName).toBe("IMG");
    expect(img.getAttribute("src")).toBe("/logo-wordmark.png");
    expect(img.style.height).toBe("28px");
  });

  it("white 時改用白色字標 PNG（深色背景用）", () => {
    const { getByAltText } = render(<Logo white />);
    expect(getByAltText("InRecord").getAttribute("src")).toBe("/logo-wordmark-white.png");
  });
});
