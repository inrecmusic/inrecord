"use client";
import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-client";

const EMPTY = {
  meta: { id: "", enabled: false },
  ga4: { id: "", enabled: false },
  google_ads: { id: "", purchase_label: "", enabled: false },
  line: { id: "", enabled: false },
};

const CARDS = [
  { key: "meta", title: "Meta / Facebook Pixel", hint: "事件管理員 → 資料來源 → 你的 Pixel → Pixel ID（純數字）", idLabel: "Pixel ID" },
  { key: "ga4", title: "Google Analytics 4", hint: "GA4 管理 → 資料串流 → 評估 ID，格式 G-XXXXXXX", idLabel: "評估 ID (G-)" },
  { key: "google_ads", title: "Google Ads", hint: "Google Ads → 目標 → 轉換 → 代碼設定，AW-XXXXXXX 與轉換標籤", idLabel: "轉換 ID (AW-)" },
  { key: "line", title: "LINE Tag", hint: "LINE 官方帳號 / LINE Ads → LINE Tag ID", idLabel: "Tag ID" },
];

export default function TrackingSettingsPage({ showToast }) {
  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [saving, setSaving] = useState(false);

  // 載入一定要檢查 r.ok：後端回 500/503 時 d.data 是 undefined，舊寫法會靜默套用空白表單，
  // 管理員一按「儲存」就把 Meta Pixel／GA4／Google Ads／LINE Tag 全部清空。
  const load = useCallback(async () => {
    setLoading(true); setLoadErr("");
    try {
      const r = await adminFetch("/api/admin/tracking-settings");
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `載入失敗（HTTP ${r.status}）`);
      setC({ ...EMPTY, ...(d.data || {}) }); // 成功但沒有資料＝尚未設定過，空白表單是正常起點
    } catch (e) {
      setC(null); setLoadErr(e.message || "載入失敗");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding: 24 }}>載入中…</div>;

  // 載入未成功就不渲染表單（也就沒有儲存按鈕），避免把空白追蹤碼覆蓋回正式設定
  if (loadErr || !c) return (
    <div style={{ maxWidth: 720, padding: 24, wordBreak: "keep-all", lineBreak: "strict" }}>
      <h2 style={{ fontSize: 20, fontWeight: 800 }}>追蹤碼中心</h2>
      <p style={{ color: "#dc2626" }}>⚠️ 載入失敗：{loadErr || "沒有取得設定資料"}</p>
      <p style={{ fontSize: 13, color: "#64748b" }}>為避免把空白值覆蓋掉正在運作的追蹤碼，這裡先不顯示表單。請重試，若持續失敗請檢查後端。</p>
      <button onClick={load} style={{ border: "1px solid #cbd5e1", background: "#f8fafc", borderRadius: 8, padding: "8px 16px", cursor: "pointer" }}>重試</button>
    </div>
  );

  const set = (key, field, val) => setC((prev) => ({ ...prev, [key]: { ...prev[key], [field]: val } }));

  async function save() {
    setSaving(true);
    try {
      const r = await adminFetch("/api/admin/tracking-settings", { method: "PATCH", body: JSON.stringify({ config: c }) });
      const d = await r.json();
      if (!r.ok) { showToast?.("儲存失敗：" + (d.error || r.status)); return; }
      setC({ ...EMPTY, ...(d.data || {}) });
      showToast?.("✅ 追蹤碼已儲存，前台即時生效");
    } catch {
      showToast?.("儲存失敗，請稍後再試");
    } finally {
      setSaving(false);
    }
  }

  const wrap = { maxWidth: 720, padding: 24, display: "grid", gap: 16 };
  const card = { border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, background: "#fff", wordBreak: "keep-all", lineBreak: "strict" };
  const label = { fontSize: 13, color: "#64748b", marginBottom: 4 };
  const input = { width: "100%", padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 14 };

  return (
    <div style={wrap}>
      <h2 style={{ fontSize: 20, fontWeight: 800 }}>追蹤碼中心</h2>
      <p style={{ fontSize: 13, color: "#64748b" }}>貼上各平台 ID 並開啟即生效（免重新部署）。留空或關閉則不注入。投放廣告時 campaign 命名建議與 UTM 一致，Phase 2 才能對接花費算 ROAS。</p>
      {CARDS.map(({ key, title, hint, idLabel }) => (
        <div key={key} style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <strong>{title}</strong>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={!!c[key].enabled} onChange={(e) => set(key, "enabled", e.target.checked)} /> 啟用
            </label>
          </div>
          <div style={label}>{idLabel}</div>
          <input style={input} value={c[key].id} onChange={(e) => set(key, "id", e.target.value)} placeholder={idLabel} />
          {key === "google_ads" && (
            <div style={{ marginTop: 8 }}>
              <div style={label}>購買轉換標籤 (label)</div>
              <input style={input} value={c.google_ads.purchase_label} onChange={(e) => set("google_ads", "purchase_label", e.target.value)} placeholder="轉換動作的 label" />
            </div>
          )}
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>{hint}</div>
        </div>
      ))}
      <button onClick={save} disabled={saving} style={{ justifySelf: "start", background: "#2563eb", color: "#fff", fontWeight: 700, padding: "10px 20px", borderRadius: 10, border: 0, cursor: "pointer" }}>
        {saving ? "儲存中…" : "儲存"}
      </button>
    </div>
  );
}
