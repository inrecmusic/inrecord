// @vitest-environment jsdom
import { afterEach, describe, it, expect } from "vitest";
import { render, cleanup } from "@testing-library/react";
import PointCarousel from "./PointCarousel.jsx";

afterEach(cleanup);

describe("PointCarousel 空資料防護", () => {
  it("slides 為空陣列 → 不渲染、不崩潰", () => {
    const { container } = render(<PointCarousel slides={[]} />);
    expect(container.textContent).toBe("");
  });

  it("slides 未傳（undefined）→ 不崩潰", () => {
    const { container } = render(<PointCarousel />);
    expect(container.textContent).toBe("");
  });
});
