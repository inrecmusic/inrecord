import { describe, it, expect } from "vitest";
import { enabledPlatforms, sanitizeTrackingConfig, metaSnippet, googleConfigSnippet, lineSnippet } from "./tracking.js";

describe("enabledPlatforms", () => {
  it("只回傳 enabled 且有 id 的平台", () => {
    const out = enabledPlatforms({
      meta: { id: "123", enabled: true },
      ga4: { id: "G-A", enabled: false },
      google_ads: { id: "AW-1", purchase_label: "lab", enabled: true },
      line: { id: "", enabled: true },
    });
    expect(out.meta).toEqual({ id: "123" });
    expect(out.ga4).toBeNull();                 // enabled=false
    expect(out.googleAds).toEqual({ id: "AW-1", purchaseLabel: "lab" });
    expect(out.line).toBeNull();                // id 空
  });
  it("空 config 全為 null", () => {
    const out = enabledPlatforms({});
    expect(out).toEqual({ meta: null, ga4: null, googleAds: null, line: null });
  });
});

describe("sanitizeTrackingConfig", () => {
  it("normalize 並保留四平台", () => {
    const r = sanitizeTrackingConfig({ meta: { id: " 123 ", enabled: true }, ga4: { id: "G-A", enabled: 1 } });
    expect(r.ok).toBe(true);
    expect(r.config.meta).toEqual({ id: "123", enabled: true });
    expect(r.config.ga4).toEqual({ id: "G-A", enabled: true });
    expect(r.config.line).toEqual({ id: "", enabled: false });
  });
  it("啟用卻無 id → 錯誤", () => {
    const r = sanitizeTrackingConfig({ meta: { id: "", enabled: true } });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("meta_id_required");
  });
  it("拒絕含危險字元的 id", () => {
    expect(sanitizeTrackingConfig({ meta: { id: "1'};alert(1)//", enabled: true } }).error).toBe("meta_id_invalid");
    expect(sanitizeTrackingConfig({ line: { id: "</script>", enabled: true } }).error).toBe("line_id_invalid");
  });
  it("拒絕含危險字元的 google_ads 轉換標籤", () => {
    expect(sanitizeTrackingConfig({ google_ads: { id: "AW-1", purchase_label: "a`b", enabled: true } }).error).toBe("google_ads_label_invalid");
  });
});

describe("snippet builders", () => {
  it("metaSnippet 含 init 與 id", () => {
    const s = metaSnippet("999");
    expect(s).toContain("fbq('init','999')");
    expect(s).toContain("fbq('track','PageView')");
  });
  it("googleConfigSnippet 依有無 id 產出 config", () => {
    expect(googleConfigSnippet({ ga4Id: "G-A", adsId: "AW-1" })).toContain("gtag('config','G-A')");
    expect(googleConfigSnippet({ ga4Id: "G-A", adsId: "AW-1" })).toContain("gtag('config','AW-1')");
    expect(googleConfigSnippet({ adsId: "AW-1" })).not.toContain("G-");
  });
  it("lineSnippet 含 tagId", () => {
    expect(lineSnippet("T1")).toContain("tagId:'T1'");
  });
  it("非法 id 回空字串（防禦）", () => {
    expect(metaSnippet("a';b")).toBe("");
    expect(lineSnippet("<x>")).toBe("");
  });
});
