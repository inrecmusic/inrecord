"use client";
import { useCallback, useEffect, useState } from "react";
import TrialVideoPanel from "./TrialVideoPanel";
import { adminFetch } from "@/lib/admin-client";

// course 單賣已下架，只剩課程包（bundle）需設定價格
const PLANS = [
  { key: "bundle", label: "完整課程方案（課程包）" },
];

const EMPTY_SETTINGS = { open_at: null, lock_override: null, launch_notified_at: null, list_price: {}, list_anchor: {}, waves: [], fan_plan: {} };

// timestamptz <-> <input type="datetime-local">（以瀏覽器本地時區即台灣時間呈現）
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v) { return v ? new Date(v).toISOString() : null; }

export default function SaleSettingsPage({ showToast }) {
  const [s, setS] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);

  // 載入一定要檢查 r.ok：後端回 500/503 時 d.data 是 undefined，舊寫法會靜默套用空白表單，
  // 管理員一按「儲存」就把 open_at（教室立刻鎖站）／waves（前台售價失效）／粉絲方案價整組清掉。
  const load = useCallback(async () => {
    setLoading(true); setLoadErr("");
    try {
      const r = await adminFetch("/api/admin/sale-settings");
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `載入失敗（HTTP ${r.status}）`);
      setS(d.data || EMPTY_SETTINGS); // 成功但沒有資料列＝新環境尚未設定，空白表單是正常起點
    } catch (e) {
      setS(null); setLoadErr(e.message || "載入失敗");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding: 24 }}>載入中…</div>;

  // 載入未成功就不渲染表單（也就沒有儲存按鈕），避免把空白值覆蓋回正式設定
  if (loadErr || !s) return (
    <div style={{ padding: 24, maxWidth: 640, wordBreak: "keep-all", lineBreak: "strict" }}>
      <h2 style={{ marginTop: 0 }}>銷售設定</h2>
      <p style={{ color: "#dc2626" }}>⚠️ 載入失敗：{loadErr || "沒有取得設定資料"}</p>
      <p style={{ fontSize: 13, color: "#64748b" }}>為避免把空白設定覆蓋掉正式售價與開課日，這裡先不顯示表單。請重試，若持續失敗請檢查後端。</p>
      <button onClick={load} style={{ border: "1px solid #cbd5e1", background: "#f8fafc", borderRadius: 8, padding: "8px 16px", cursor: "pointer" }}>重試</button>
      <TrialVideoPanel showToast={showToast} />
    </div>
  );

  const fp = s.fan_plan || {};
  const fanEnabled = typeof fp.enabled === "boolean" ? fp.enabled : true;
  const fanDeadline = fp.deadline || "2026-08-06T23:59:59+08:00";
  const fanProofPrice = Number.isInteger(fp.proof_price) ? fp.proof_price : 3699;
  const fanDirectPrice = Number.isInteger(fp.direct_price) ? fp.direct_price : 3999;
  const fanProofEnabled = typeof fp.proof_enabled === "boolean" ? fp.proof_enabled : true;
  const fanProofDiscount = Number.isInteger(fp.proof_discount) ? fp.proof_discount : 300;
  const fanFields = { enabled: fanEnabled, deadline: fanDeadline, proof_price: fanProofPrice, direct_price: fanDirectPrice, proof_enabled: fanProofEnabled, proof_discount: fanProofDiscount };
  const setFan = (key, val) => setS((prev) => ({ ...prev, fan_plan: { ...fanFields, [key]: val } }));

  const setWave = (i, key, val) =>
    setS((prev) => ({ ...prev, waves: prev.waves.map((w, j) => (j === i ? { ...w, [key]: val } : w)) }));
  const setWavePrice = (i, plan, val) =>
    setS((prev) => ({ ...prev, waves: prev.waves.map((w, j) => (j === i ? { ...w, prices: { ...(w.prices || {}), [plan]: val === "" ? null : Number(val) } } : w)) }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await adminFetch("/api/admin/sale-settings", {
        method: "PATCH",
        body: JSON.stringify({
          open_at: s.open_at, lock_override: s.lock_override,
          list_price: s.list_price || {}, list_anchor: s.list_anchor || {}, waves: s.waves || [],
          fan_plan: fanFields,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { setS(d.data); showToast?.("已儲存"); } else { showToast?.(`儲存失敗：${d.error || res.status}`); }
    } catch { showToast?.("儲存失敗，請稍後再試"); }
    finally { setSaving(false); }
  };

  const sendLaunch = async () => {
    if (launching) return; // 防連點重觸發群發
    setLaunching(true);
    try {
      // 先預覽名單（不寄）：確認視窗顯示人數組成，避免按下去才發現名單不對
      const pre = await adminFetch("/api/admin/send-launch-notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dryRun: true }) });
      const p = await pre.json().catch(() => ({}));
      if (!pre.ok) { showToast?.(`讀取名單失敗：${p.error || pre.status}`); return; }
      const extra = p.unenrolledPaid ? `\n另有 ${p.unenrolledPaid} 位已付款但尚未開通，不在名單內（要先到訂單管理開通）。` : "";
      if (!confirm(`將寄開課通知給 ${p.pending ?? 0} 位已開通學員（名單共 ${p.total ?? 0} 位，已寄過的 ${p.alreadySent ?? 0} 位會跳過）。${extra}\n\n確定寄出？`)) return;
      const res = await adminFetch("/api/admin/send-launch-notify", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (res.ok) showToast?.(d.alreadyComplete ? "先前已寄送過" : `已寄送 ${d.sent ?? 0} 封`);
      else showToast?.(`寄送失敗：${d.error || res.status}`);
    } catch { showToast?.("寄送失敗，請稍後再試"); }
    finally { setLaunching(false); }
  };

  const field = { display: "block", marginBottom: 16 };
  const input = { padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 };

  return (
    <div style={{ padding: 24, maxWidth: 640, wordBreak: "keep-all", lineBreak: "strict" }}>
      <h2 style={{ marginTop: 0 }}>銷售設定</h2>

      <label style={field}>開課日（解鎖教室）
        <br /><input type="datetime-local" style={input} value={toLocalInput(s.open_at)}
          onChange={(e) => setS({ ...s, open_at: fromLocalInput(e.target.value) })} />
      </label>

      <div style={{ ...field, padding: 12, border: "1px solid #e2e8f0", borderRadius: 10 }}>
        <strong>劃線原價（NT$，刪除線錨點）</strong><br />
        {PLANS.map((p) => (
          <span key={p.key} style={{ marginRight: 16, display: "inline-block" }}>
            {p.label}：<input type="number" min="0" style={input}
              value={s.list_anchor?.[p.key] ?? ""}
              onChange={(e) => setS((prev) => ({ ...prev, list_anchor: { ...prev.list_anchor, [p.key]: e.target.value === "" ? null : Number(e.target.value) } }))} />
          </span>
        ))}
      </div>

      <div style={{ ...field, padding: 12, border: "1px solid #e2e8f0", borderRadius: 10 }}>
        <strong>正式售價（NT$，波段結束後常態售價）</strong><br />
        {PLANS.map((p) => (
          <span key={p.key} style={{ marginRight: 16, display: "inline-block" }}>
            {p.label}：<input type="number" min="0" style={input}
              value={s.list_price?.[p.key] ?? ""}
              onChange={(e) => setS((prev) => ({ ...prev, list_price: { ...prev.list_price, [p.key]: e.target.value === "" ? null : Number(e.target.value) } }))} />
          </span>
        ))}
      </div>

      <div style={field}>
        <strong>早鳥波段（依時間自動切換；起含、迄不含）</strong>
        {(s.waves || []).map((w, i) => (
          <div key={i} style={{ padding: 12, border: "1px solid #e2e8f0", borderRadius: 10, marginTop: 8 }}>
            <div style={{ marginBottom: 6 }}>第 {i + 1} 波
              <button onClick={() => setS((prev) => ({ ...prev, waves: prev.waves.filter((_, j) => j !== i) }))}
                style={{ marginLeft: 10, color: "#dc2626", border: 0, background: "none", cursor: "pointer" }}>刪除</button>
            </div>
            <label style={{ marginRight: 12 }}>起 <input type="datetime-local" style={input}
              value={toLocalInput(w.starts_at)}
              onChange={(e) => setWave(i, "starts_at", fromLocalInput(e.target.value))} /></label>
            <label style={{ marginRight: 12 }}>迄 <input type="datetime-local" style={input}
              value={toLocalInput(w.ends_at)}
              onChange={(e) => setWave(i, "ends_at", fromLocalInput(e.target.value))} /></label>
            <br />
            {PLANS.map((p) => (
              <span key={p.key} style={{ marginRight: 16, display: "inline-block", marginTop: 6 }}>
                {p.label} NT$ <input type="number" min="0" style={input}
                  value={w.prices?.[p.key] ?? ""}
                  onChange={(e) => setWavePrice(i, p.key, e.target.value)} />
              </span>
            ))}
          </div>
        ))}
        <button onClick={() => setS((prev) => ({ ...prev, waves: [...(prev.waves || []), { starts_at: null, ends_at: null, prices: {} }] }))}
          style={{ marginTop: 10, border: "1px solid #cbd5e1", background: "#f8fafc", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>＋ 新增波段</button>
      </div>

      <div style={{ ...field, padding: 12, border: "1px solid #e2e8f0", borderRadius: 10 }}>
        <strong>粉絲限定方案</strong><br />
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, margin: "8px 0" }}>
          <input type="checkbox" checked={fanEnabled} onChange={(e) => setFan("enabled", e.target.checked)} />
          啟用粉絲限定方案（取消勾選＝整張卡收起、上傳入口關閉、直購券停用）
        </label><br />
        <label style={{ marginRight: 16 }}>憑證申請截止
          <br /><input type="datetime-local" style={input} value={toLocalInput(fanDeadline)}
            onChange={(e) => setFan("deadline", fromLocalInput(e.target.value))} />
        </label><br />
        <span style={{ marginRight: 16, display: "inline-block", marginTop: 8 }}>粉絲價 NT$
          <input type="number" min="0" style={input} value={fanProofPrice}
            onChange={(e) => setFan("proof_price", e.target.value === "" ? 0 : Number(e.target.value))} />
        </span>
        <span style={{ display: "inline-block", marginTop: 8 }}>直購價 NT$
          <input type="number" min="0" style={input} value={fanDirectPrice}
            onChange={(e) => setFan("direct_price", e.target.value === "" ? 0 : Number(e.target.value))} />
        </span>
        <p style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>粉絲價 ≤ 直購價；改直購價會同步更新 FAN3999 券。以上三項只管「粉絲直購」，截止後整張粉絲卡收起。</p>

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed #cbd5e1" }}>
          <strong style={{ fontSize: 13.5 }}>憑證折抵（獨立於上面的截止日）</strong>
          <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0" }}>
            <input type="checkbox" checked={fanProofEnabled} onChange={(e) => setFan("proof_enabled", e.target.checked)} />
            開放上傳憑證折抵
          </label>
          <span style={{ display: "inline-block" }}>折抵金額 NT$
            <input type="number" min="1" style={input} value={fanProofDiscount}
              onChange={(e) => setFan("proof_discount", e.target.value === "" ? 0 : Number(e.target.value))} />
          </span>
          <p style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>憑證券改發「折抵金額」券，會跟著當下波段價自動走（例：波段價 4,299 折 300＝3,999），調價不必再改這裡。已發出但未使用的舊券維持原本的固定價。</p>
        </div>
      </div>

      <label style={field}>手動覆寫
        <br />
        <select style={input} value={s.lock_override ?? ""}
          onChange={(e) => setS({ ...s, lock_override: e.target.value || null })}>
          <option value="">依排程（預設）</option>
          <option value="open">強制開課</option>
          <option value="locked">強制鎖站</option>
        </select>
      </label>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8 }}>
        <button onClick={save} disabled={saving}
          style={{ background: "#2563eb", color: "#fff", border: 0, borderRadius: 10, padding: "10px 18px", fontWeight: 800, cursor: "pointer" }}>
          {saving ? "儲存中…" : "儲存"}
        </button>
        <button onClick={sendLaunch} disabled={launching}
          style={{ background: "#0f172a", color: "#fff", border: 0, borderRadius: 10, padding: "10px 18px", fontWeight: 800, cursor: launching ? "default" : "pointer", opacity: launching ? 0.6 : 1 }}>
          {launching ? "寄送中…" : "立即寄送開課通知"}
        </button>
        <span style={{ fontSize: 13, color: "#64748b" }}>
          {s.launch_notified_at ? `已於 ${new Date(s.launch_notified_at).toLocaleString("zh-TW")} 寄送` : "尚未寄送"}
        </span>
      </div>
      <TrialVideoPanel showToast={showToast} />
    </div>
  );
}
