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

  it("點『下一段』單向前進，最後一段後循環回第一段", () => {
    render(<InstructorBioCarousel slides={SLIDES} />);
    const btn = screen.getByRole("button", { name: /下一段/ });

    fireEvent.click(btn);
    expect(screen.getByText("第二段內容")).toBeTruthy();

    fireEvent.click(btn);
    expect(screen.getByText("第三段內容")).toBeTruthy();

    fireEvent.click(btn); // 第三段後循環
    expect(screen.getByText("第一段內容")).toBeTruthy();
  });

  it("單張投影片時不顯示前進按鈕", () => {
    render(<InstructorBioCarousel slides={["只有一段"]} />);
    expect(screen.queryByRole("button", { name: /下一段/ })).toBeNull();
  });
});
