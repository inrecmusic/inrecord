// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { trackEvent, trackGoogleAdsConversion } from "./track-event.js";

beforeEach(() => {
  window.fbq = vi.fn();
  window.gtag = vi.fn();
});

describe("trackEvent", () => {
  it("Purchase 同時打 Meta 與 GA4，帶正確參數", () => {
    trackEvent("Purchase", { value: 5800, currency: "TWD", contentIds: ["bundle"], transactionId: "T1" });
    expect(window.fbq).toHaveBeenCalledWith("track", "Purchase", {
      value: 5800, currency: "TWD", content_ids: ["bundle"], content_type: "product",
    });
    expect(window.gtag).toHaveBeenCalledWith("event", "purchase", {
      currency: "TWD", value: 5800, transaction_id: "T1", items: [{ item_id: "bundle", item_name: undefined }],
    });
  });
  it("InitiateCheckout 映射 GA4 begin_checkout", () => {
    trackEvent("InitiateCheckout", { value: 4299, currency: "TWD", contentIds: ["bundle"] });
    expect(window.gtag).toHaveBeenCalledWith("event", "begin_checkout", expect.objectContaining({ value: 4299 }));
  });
  it("globals 未定義不丟錯", () => {
    delete window.fbq; delete window.gtag;
    expect(() => trackEvent("PageView")).not.toThrow();
  });
});

describe("trackGoogleAdsConversion", () => {
  it("打 gtag conversion 帶 send_to", () => {
    trackGoogleAdsConversion({ sendTo: "AW-1/lab", value: 5800, currency: "TWD", transactionId: "T1" });
    expect(window.gtag).toHaveBeenCalledWith("event", "conversion", {
      send_to: "AW-1/lab", value: 5800, currency: "TWD", transaction_id: "T1",
    });
  });
});
