// @vitest-environment jsdom
import { afterEach, describe, it, expect } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import InstructorBioCarousel from "./InstructorBioCarousel.jsx";

afterEach(cleanup);

const SLIDES = ["第一段內容", "第二段內容", "第三段內容"];

describe("InstructorBioCarousel", () => {
  it("slides 為空陣列 → 不渲染、不崩潰", () => {
    const { container } = render(<InstructorBioCarousel slides={[]} />);
    expect(container.textContent).toBe("");
  });

  it("slides 未傳（undefined）→ 不崩潰", () => {
    const { container } = render(<InstructorBioCarousel />);
    expect(container.textContent).toBe("");
  });

  it("預設顯示第一段", () => {
    render(<InstructorBioCarousel slides={SLIDES} />);
    expect(screen.getByText("第一段內容")).toBeTruthy();
  });

  it("點圓點頁籤切換到對應段落（含循環）", () => {
    render(<InstructorBioCarousel slides={SLIDES} />);

    fireEvent.click(screen.getByRole("tab", { name: "第 2 段" }));
    expect(screen.getByText("第二段內容")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "第 3 段" }));
    expect(screen.getByText("第三段內容")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "第 1 段" }));
    expect(screen.getByText("第一段內容")).toBeTruthy();
  });

  it("鍵盤右鍵前進、最後一段後循環回第一段", () => {
    render(<InstructorBioCarousel slides={SLIDES} />);
    const region = screen.getByRole("region", { name: "講師介紹" });

    fireEvent.keyDown(region, { key: "ArrowRight" });
    expect(screen.getByText("第二段內容")).toBeTruthy();
    fireEvent.keyDown(region, { key: "ArrowRight" });
    expect(screen.getByText("第三段內容")).toBeTruthy();
    fireEvent.keyDown(region, { key: "ArrowRight" });
    expect(screen.getByText("第一段內容")).toBeTruthy();
  });

  it("單張投影片時不顯示頁籤圓點", () => {
    render(<InstructorBioCarousel slides={["只有一段"]} />);
    expect(screen.queryByRole("tablist")).toBeNull();
  });
});
