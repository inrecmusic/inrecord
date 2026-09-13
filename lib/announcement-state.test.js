import { describe, it, expect } from "vitest";
import { readAnnouncementState, writeRead, writeAck, writeStripDismissed } from "./announcement-state.js";

// 已讀（逐則）／已確認記在該裝置（localStorage）。storage 可注入，方便測試；沒有 storage 也不能炸。
const fakeStorage = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

describe("announcement-state", () => {
  it("初始狀態：沒讀過（read 為 null＝還沒有逐則記錄）、沒確認過、沒關過提示條", () => {
    expect(readAnnouncementState(fakeStorage())).toEqual({ seenAt: null, read: null, acked: [], stripDismissed: null });
  });

  it("寫入後讀得回來；同一則記兩次不重複；空清單也算「已有記錄」", () => {
    const s = fakeStorage();
    expect(writeRead(s, [])).toEqual([]);
    expect(readAnnouncementState(s).read).toEqual([]); // 不是 null＝遷移過了
    writeRead(s, ["a1"]); writeRead(s, ["a1", "a2"]);
    writeAck(s, "b1"); writeAck(s, "b1"); writeAck(s, "b2");
    writeStripDismissed(s, "c1");
    expect(readAnnouncementState(s)).toEqual({ seenAt: null, read: ["a1", "a2"], acked: ["b1", "b2"], stripDismissed: "c1" });
  });

  it("writeRead 會先讀回現有值再合併（另一個分頁寫的不會被蓋掉）", () => {
    const s = fakeStorage();
    writeRead(s, ["a1"]);
    s.setItem("inrec_ann_read", JSON.stringify(["a1", "other-tab"]));
    expect(writeRead(s, ["a2"])).toEqual(["a1", "other-tab", "a2"]);
  });

  it("舊裝置只有 inrec_ann_seen_at 時讀得到，read 仍是 null（待遷移）", () => {
    const s = fakeStorage();
    s.setItem("inrec_ann_seen_at", "2026-09-04T10:00:00.000Z");
    expect(readAnnouncementState(s)).toEqual({ seenAt: "2026-09-04T10:00:00.000Z", read: null, acked: [], stripDismissed: null });
  });

  it("壞資料（非 JSON 陣列）當空陣列", () => {
    const s = fakeStorage();
    s.setItem("inrec_ann_read", "{oops");
    s.setItem("inrec_ann_acked", "{oops");
    expect(readAnnouncementState(s).read).toEqual([]);
    expect(readAnnouncementState(s).acked).toEqual([]);
  });

  it("storage 為 null 或會丟例外時不炸、回初始狀態", () => {
    expect(readAnnouncementState(null)).toEqual({ seenAt: null, read: null, acked: [], stripDismissed: null });
    const boom = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
    expect(() => { writeRead(boom, ["a"]); writeAck(boom, "a"); writeStripDismissed(boom, "b"); }).not.toThrow();
    expect(readAnnouncementState(boom)).toEqual({ seenAt: null, read: null, acked: [], stripDismissed: null });
  });
});
