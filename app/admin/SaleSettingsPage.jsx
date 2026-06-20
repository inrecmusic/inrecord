"use client";
import { useEffect, useState } from "react";

const pw = () => (typeof window !== "undefined" ? sessionStorage.getItem("inrecord_admin_token") : "");
async function adminFetch(path, opts = {}) {
  return fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${pw()}`, ...(opts.headers || {}) } });
}

const PLANS = [
  { key: "course", label: "鋼琴自學全課程" },
  { key: "bundle", label: "學琴全攻略（課程包）" },
];

const EMPTY_SETTINGS = { open_at: null, lock_override: null, launch_notified_at: null, list_price: {}, waves: [] };

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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminFetch("/api/admin/sale-settings")
      .then((r) => r.json())
      .then((d) => setS(d.data || EMPTY_SETTINGS))
      .catch(() => { setS(EMPTY_SETTINGS); showToast?.("載入銷售設定失敗，顯示空白表單"); })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line

  if (loading || !s) return <div style={{ padding: 24 }}>載入中…</div>;

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
          list_price: s.list_price || {}, waves: s.waves || [],
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { setS(d.data); showToast?.("已儲存"); } else { showToast?.(`儲存失敗：${d.error || res.status}`); }
    } catch { showToast?.("儲存失敗，請稍後再試"); }
    finally { setSaving(false); }
  };

  const sendLaunch = async () => {
    if (!confirm("確定立即寄送開課通知給所有已預購買家？")) return;
    const res = await adminFetch("/api/admin/send-launch-notify", { method: "POST" });
    const d = await res.json().catch(() => ({}));
    if (res.ok) showToast?.(d.alreadyNotified ? "先前已寄送過" : `已寄送 ${d.sent ?? 0} 封`);
    else showToast?.(`寄送失敗：${d.error || res.status}`);
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
        <strong>正式牌價（NT$，刪除線錨點＋波段後常態價）</strong><br />
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
        <button onClick={sendLaunch}
          style={{ background: "#0f172a", color: "#fff", border: 0, borderRadius: 10, padding: "10px 18px", fontWeight: 800, cursor: "pointer" }}>
          立即寄送開課通知
        </button>
        <span style={{ fontSize: 13, color: "#64748b" }}>
          {s.launch_notified_at ? `已於 ${new Date(s.launch_notified_at).toLocaleString("zh-TW")} 寄送` : "尚未寄送"}
        </span>
      </div>
    </div>
  );
}
