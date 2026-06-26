import { describe, it, expect } from "vitest";
import { toPublicComment, COMMENT_LIST_SELECT } from "./comments.js";

describe("toPublicComment", () => {
  const raw = {
    id: "c1", video_id: "v1", chapter_id: "ch1",
    user_id: "u-uuid", user_name: "小明", user_email: "ming@example.com",
    content: "讚", status: "approved", created_at: "2026-06-01",
    comment_replies: [{ admin_content: "謝謝", created_at: "2026-06-02" }],
  };

  it("不外洩 user_email / user_id（PII）", () => {
    const pub = toPublicComment(raw);
    expect(pub).not.toHaveProperty("user_email");
    expect(pub).not.toHaveProperty("user_id");
  });

  it("保留前台需要的欄位與管理員回覆", () => {
    const pub = toPublicComment(raw);
    expect(pub).toMatchObject({
      id: "c1", video_id: "v1", chapter_id: "ch1", user_name: "小明",
      content: "讚", status: "approved", created_at: "2026-06-01",
    });
    expect(pub.comment_replies).toEqual([{ admin_content: "謝謝", created_at: "2026-06-02" }]);
  });

  it("沒有 replies 時回空陣列", () => {
    expect(toPublicComment({ id: "c1" }).comment_replies).toEqual([]);
  });
});

describe("COMMENT_LIST_SELECT", () => {
  it("查詢投影不含 user_email / user_id", () => {
    expect(COMMENT_LIST_SELECT).not.toContain("user_email");
    expect(COMMENT_LIST_SELECT).not.toContain("user_id");
  });
});
