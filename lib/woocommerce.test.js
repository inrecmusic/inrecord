import { describe, it, expect } from "vitest";
import crypto from "crypto";
import {
  verifyWooSignature,
  parseCourseProductMap,
  extractCourseOrder,
} from "./woocommerce.js";

// 依 WooCommerce 規格：signature = base64( HMAC-SHA256( 原始body, secret ) )
function signWoo(rawBody, secret) {
  return crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
}

describe("verifyWooSignature", () => {
  const secret = "shop-secret-123";
  const body = JSON.stringify({ id: 1, status: "processing" });

  it("簽章正確時回 true", () => {
    expect(verifyWooSignature(body, signWoo(body, secret), secret)).toBe(true);
  });
  it("簽章錯誤時回 false", () => {
    expect(verifyWooSignature(body, signWoo(body, "wrong-secret"), secret)).toBe(false);
  });
  it("body 被竄改時回 false", () => {
    const sig = signWoo(body, secret);
    const tampered = JSON.stringify({ id: 1, status: "completed" });
    expect(verifyWooSignature(tampered, sig, secret)).toBe(false);
  });
  it("缺簽章回 false", () => {
    expect(verifyWooSignature(body, "", secret)).toBe(false);
    expect(verifyWooSignature(body, null, secret)).toBe(false);
  });
  it("缺 secret 回 false（不可放行）", () => {
    expect(verifyWooSignature(body, signWoo(body, secret), "")).toBe(false);
    expect(verifyWooSignature(body, signWoo(body, secret), undefined)).toBe(false);
  });
  it("非 base64 的垃圾簽章回 false 而不丟例外", () => {
    expect(verifyWooSignature(body, "!!!not-base64!!!", secret)).toBe(false);
  });
});

describe("parseCourseProductMap", () => {
  it("解析單一對應 '1234:bundle'，key 為字串", () => {
    expect(parseCourseProductMap("1234:bundle")).toEqual({ "1234": "bundle" });
  });
  it("解析逗號分隔多組對應", () => {
    expect(parseCourseProductMap("1234:bundle,5678:course")).toEqual({
      "1234": "bundle",
      "5678": "course",
    });
  });
  it("容忍空白與空項", () => {
    expect(parseCourseProductMap(" 1234 : bundle , , 5678:course ")).toEqual({
      "1234": "bundle",
      "5678": "course",
    });
  });
  it("空字串/未設定回空物件", () => {
    expect(parseCourseProductMap("")).toEqual({});
    expect(parseCourseProductMap(undefined)).toEqual({});
  });
  it("忽略缺 plan 或缺 id 的格式錯誤項", () => {
    expect(parseCourseProductMap("1234:,:bundle,9999:bundle")).toEqual({ "9999": "bundle" });
  });
});

describe("extractCourseOrder", () => {
  const productMap = { "93": "bundle" };

  function order(overrides = {}) {
    return {
      id: 727,
      status: "processing",
      billing: { email: "Fan@Example.com ", phone: "0912-345-678" },
      line_items: [
        { product_id: 93, name: "課程包（課程＋AI 遊戲）", quantity: 1, total: "3999.00" },
        { product_id: 22, name: "鋼琴貼紙周邊", quantity: 1, total: "150.00" },
      ],
      ...overrides,
    };
  }

  it("混合訂單挑出課程項，回正規化資料", () => {
    expect(extractCourseOrder(order(), productMap)).toEqual({
      email: "fan@example.com",
      plan: "bundle",
      planLabel: "課程包（課程＋AI 遊戲）",
      amount: 3999,
      merTradeNo: "WC727",
      phone: "0912-345-678",
    });
  });
  it("帶手機時回 phone；缺手機回空字串", () => {
    expect(extractCourseOrder(order(), productMap).phone).toBe("0912-345-678");
    expect(extractCourseOrder(order({ billing: { email: "a@b.com" } }), productMap).phone).toBe("");
  });
  it("completed 狀態也算已付款", () => {
    expect(extractCourseOrder(order({ status: "completed" }), productMap)?.plan).toBe("bundle");
  });
  it("未付款狀態（pending/on-hold）回 null", () => {
    expect(extractCourseOrder(order({ status: "pending" }), productMap)).toBeNull();
    expect(extractCourseOrder(order({ status: "on-hold" }), productMap)).toBeNull();
  });
  it("純周邊訂單（無課程商品）回 null", () => {
    const merchOnly = order({
      line_items: [{ product_id: 22, name: "鋼琴貼紙周邊", quantity: 1, total: "150.00" }],
    });
    expect(extractCourseOrder(merchOnly, productMap)).toBeNull();
  });
  it("缺 email 回 null", () => {
    expect(extractCourseOrder(order({ billing: {} }), productMap)).toBeNull();
    expect(extractCourseOrder(order({ billing: null }), productMap)).toBeNull();
  });
  it("測試 ping（無 line_items）回 null", () => {
    expect(extractCourseOrder({ webhook_id: 5 }, productMap)).toBeNull();
  });
  it("金額取課程項 total 取整（非整張訂單總額）", () => {
    const o = order({
      total: "4149.00",
      line_items: [
        { product_id: 93, name: "課程包", quantity: 1, total: "3999.50" },
        { product_id: 22, name: "周邊", quantity: 1, total: "150.00" },
      ],
    });
    expect(extractCourseOrder(o, productMap)?.amount).toBe(4000);
  });
  it("未指定前綴時 mer_trade_no 預設 WC（向後相容）", () => {
    expect(extractCourseOrder(order(), productMap).merTradeNo).toBe("WC727");
  });
  it("可指定前綴：concert 用 CC，避免與 WooCommerce 同號訂單碰撞", () => {
    expect(extractCourseOrder(order(), productMap, "CC").merTradeNo).toBe("CC727");
  });
});
