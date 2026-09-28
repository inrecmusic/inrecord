import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { buildPurchaseEvent, buildLeadEvent } from "./meta-capi.js";

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

describe("buildPurchaseEvent", () => {
  const base = { merTradeNo: "INREC1", amount: 3999, plan: "bundle", email: "Test@Example.com ", eventTime: 1700000000 };
  it("email 正規化後 SHA256 放 user_data.em", () => {
    const e = buildPurchaseEvent(base);
    expect(e.user_data.em).toEqual([sha("test@example.com")]);
  });
  it("event 核心欄位", () => {
    const e = buildPurchaseEvent(base);
    expect(e.event_name).toBe("Purchase");
    expect(e.event_id).toBe("INREC1");
    expect(e.action_source).toBe("website");
    expect(e.event_time).toBe(1700000000);
    expect(e.custom_data).toEqual({ currency: "TWD", value: 3999, content_ids: ["bundle"], content_type: "product" });
  });
  it("fbp/fbc/ip/ua 原樣（不 hash）", () => {
    const e = buildPurchaseEvent({ ...base, capiData: { fbp: "fb.1.x.y", fbc: "fb.1.a.b", ip: "1.2.3.4", ua: "UA" } });
    expect(e.user_data.fbp).toBe("fb.1.x.y");
    expect(e.user_data.fbc).toBe("fb.1.a.b");
    expect(e.user_data.client_ip_address).toBe("1.2.3.4");
    expect(e.user_data.client_user_agent).toBe("UA");
  });
  it("fbc 缺但有 fbclid → 組 fb.1.<eventTime>.<fbclid>", () => {
    const e = buildPurchaseEvent({ ...base, attribution: { fbclid: "ABC" } });
    expect(e.user_data.fbc).toBe("fb.1.1700000000000.ABC"); // 毫秒（eventTime 秒 × 1000）
  });
  it("無 email 則不帶 em", () => {
    const e = buildPurchaseEvent({ ...base, email: "" });
    expect(e.user_data.em).toBeUndefined();
  });
});

describe("buildLeadEvent（留信箱換試看）", () => {
  const base = { email: " A@X.com ", eventId: "evt-1", eventTime: 1700000000 };

  it("event 核心欄位；event_id 與瀏覽器端相同才會被 Meta 去重", () => {
    const e = buildLeadEvent(base);
    expect(e.event_name).toBe("Lead");
    expect(e.event_time).toBe(1700000000);
    expect(e.event_id).toBe("evt-1");
    expect(e.action_source).toBe("website");
    expect(e.custom_data).toEqual({ content_name: "trial" });
  });

  it("email 正規化後 SHA256 放 user_data.em", () => {
    expect(buildLeadEvent(base).user_data.em).toEqual([sha("a@x.com")]);
  });

  it("fbp/fbc/ip/ua 原樣帶上（不 hash），提高 Meta 比對率", () => {
    const e = buildLeadEvent({ ...base, fbp: "fb.1.1.p", fbc: "fb.1.1.c", ip: "1.2.3.4", ua: "UA/1" });
    expect(e.user_data).toMatchObject({ fbp: "fb.1.1.p", fbc: "fb.1.1.c", client_ip_address: "1.2.3.4", client_user_agent: "UA/1" });
  });

  it("沒帶 eventId 就不填 event_id（填假值可能跟別人的事件撞號被誤刪）", () => {
    expect("event_id" in buildLeadEvent({ ...base, eventId: undefined })).toBe(false);
  });

  it("缺 email／缺識別值時不塞空欄位", () => {
    const e = buildLeadEvent({ eventId: "x", eventTime: 1 });
    expect(e.user_data).toEqual({});
  });
});
