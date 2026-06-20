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

const EMPTY_SETTINGS = { open_at: null, early_bird_ends_at: null, plan_pricing: {}, lock_override: null, launch_notified_at: null };

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

  const setPrice = (plan, field, val) => {
    const v = val === "" ? null : Number(val);
    setS((prev) => ({ ...prev, plan_pricing: { ...prev.plan_pricing, [plan]: { ...(prev.plan_pricing?.[plan] || {}), [field]: v } } }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await adminFetch("/api/admin/sale-settings", {
        method: "PATCH",
        body: JSON.stringify({
          open_at: s.open_at, early_bird_ends_at: s.early_bird_ends_at,
          plan_pricing: s.plan_pricing, lock_override: s.lock_override,
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

      <label style={field}>早鳥截止日（之後恢復原價）
        <br /><input type="datetime-local" style={input} value={toLocalInput(s.early_bird_ends_at)}
          onChange={(e) => setS({ ...s, early_bird_ends_at: fromLocalInput(e.target.value) })} />
      </label>

      {PLANS.map((p) => (
        <div key={p.key} style={{ ...field, padding: 12, border: "1px solid #e2e8f0", borderRadius: 10 }}>
          <strong>{p.label}</strong><br />
          <span>原價 NT$ </span>
          <input type="number" min="0" style={input} value={s.plan_pricing?.[p.key]?.original ?? ""}
            onChange={(e) => setPrice(p.key, "original", e.target.value)} />
          <span style={{ marginLeft: 12 }}>早鳥價 NT$ </span>
          <input type="number" min="0" style={input} value={s.plan_pricing?.[p.key]?.earlyBird ?? ""}
            onChange={(e) => setPrice(p.key, "earlyBird", e.target.value)} />
        </div>
      ))}

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
