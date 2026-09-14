import { describe, it, expect } from "vitest";
import { escapeLike } from "./escape-like.js";

// 模擬 Postgres LIKE（預設跳脫字元 `\`）：反斜線後的字元照字面比對，`%`→任意長度、`_`→單一字元
function likeMatch(pattern, text) {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\" && i + 1 < pattern.length) { re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); continue; }
    if (c === "%") { re += ".*"; continue; }
    if (c === "_") { re += "."; continue; }
    re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "i").test(text);
}

describe("escapeLike", () => {
  it("跳脫 % _ \\ 三個 LIKE 特殊字元，其餘不動", () => {
    expect(escapeLike("a_b%c\\d@x.com")).toBe("a\\_b\\%c\\\\d@x.com");
    expect(escapeLike("plain@x.com")).toBe("plain@x.com");
    expect(escapeLike(null)).toBe("");
  });

  it("含底線的 email 不會命中差一字的另一個 email（未跳脫時 _ 是單字元萬用）", () => {
    const email = "a_b@x.com";
    // 未跳脫：誤命中
    expect(likeMatch(email, "axb@x.com")).toBe(true);
    // 跳脫後：只命中自己（且仍不分大小寫）
    expect(likeMatch(escapeLike(email), "axb@x.com")).toBe(false);
    expect(likeMatch(escapeLike(email), "A_B@X.com")).toBe(true);
  });
});
