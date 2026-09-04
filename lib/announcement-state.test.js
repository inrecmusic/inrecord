import { describe, it, expect } from "vitest";
import { readAnnouncementState, writeSeen, writeAck, writeStripDismissed } from "./announcement-state.js";

// 已讀／已確認記在該裝置（localStorage）。storage 可注入，方便測試；沒有 storage 也不能炸。
const fakeStorage = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

describe("announcement-state", () => {
  it("初始狀態：沒看過、沒確認過、沒關過提示條", () => {
    expect(readAnnouncementState(fakeStorage())).toEqual({ seenAt: null, acked: [], stripDismissed: null });
  });

  it("寫入後讀得回來；ack 同一則兩次不重複", () => {
    const s = fakeStorage();
    writeSeen(s, "2026-09-04T10:00:00.000Z");
    writeAck(s, "a1"); writeAck(s, "a1"); writeAck(s, "a2");
    writeStripDismissed(s, "a3");
    expect(readAnnouncementState(s)).toEqual({ seenAt: "2026-09-04T10:00:00.000Z", acked: ["a1", "a2"], stripDismissed: "a3" });
  });

  it("acked 壞資料（非 JSON 陣列）當空陣列", () => {
    const s = fakeStorage();
    s.setItem("inrec_ann_acked", "{oops");
    expect(readAnnouncementState(s).acked).toEqual([]);
  });

  it("storage 為 null 或會丟例外時不炸、回初始狀態", () => {
    expect(readAnnouncementState(null)).toEqual({ seenAt: null, acked: [], stripDismissed: null });
    const boom = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
    expect(() => { writeSeen(boom, "x"); writeAck(boom, "a"); writeStripDismissed(boom, "b"); }).not.toThrow();
    expect(readAnnouncementState(boom)).toEqual({ seenAt: null, acked: [], stripDismissed: null });
  });
});
