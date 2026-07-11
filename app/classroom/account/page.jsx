"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { validateDisplayName } from "@/lib/account";
import { statusLabel, invoiceText, sortOrdersDesc } from "@/lib/my-orders-view";
import Logo from "@/components/Logo";

const F = "'PingFang TC','Noto Sans TC',system-ui,-apple-system,sans-serif";

export default function AccountPage() {
  const [loading, setLoading] = useState(true);
  const [noConfig, setNoConfig] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [orders, setOrders] = useState(null); // null=載入中, []=空

  useEffect(() => {
    async function init() {
      if (!supabase) { setNoConfig(true); setLoading(false); return; }
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { window.location.href = "/classroom/login"; return; }
        setEmail(user.email || "");
        setName(user.user_metadata?.full_name || "");
      } catch {
        window.location.href = "/classroom/login";
        return;
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  useEffect(() => {
    if (!supabase) { setOrders([]); return; }
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { if (!cancelled) setOrders([]); return; }
      try {
        const r = await fetch("/api/classroom/my-orders", { headers: { Authorization: `Bearer ${token}` } });
        const d = r.ok ? await r.json() : { orders: [] };
        if (!cancelled) setOrders(d.orders || []);
      } catch { if (!cancelled) setOrders([]); }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setError(""); setSaved(false);
    if (!supabase) { setError("系統設定錯誤，請聯繫管理員"); return; }
    const check = validateDisplayName(name);
    if (!check.ok) { setError(check.error); return; }
    setSaving(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ data: { full_name: check.value } });
      if (err) throw err;
      setName(check.value);
      setSaved(true);
    } catch (err) {
      setError(err.message || "儲存失敗，請重試");
    } finally {
      setSaving(false);
    }
  }

  const wrap = { minHeight: "100vh", background: "#f1f5f9", padding: 24, fontFamily: F, display: "grid", placeItems: "center" };
  const card = { width: "100%", maxWidth: 420, background: "#fff", borderRadius: 18, padding: "30px 28px", boxShadow: "0 10px 40px rgba(0,0,0,.08)" };
  const input = { width: "100%", padding: "11px 14px", fontSize: 16, border: "1px solid #d5dce6", borderRadius: 10, outline: "none", fontFamily: F, boxSizing: "border-box" };
  const roInput = { ...input, background: "#f1f5f9", color: "#64748b" };
  const label = { display: "block", fontSize: 13, color: "#475569", marginBottom: 6, fontWeight: 500 };
  const btn = { width: "100%", padding: "12px", fontSize: 15, fontWeight: 600, color: "#fff", background: "#2563eb", border: 0, borderRadius: 10, cursor: "pointer", fontFamily: F };

  if (loading) return (<div style={wrap}><p style={{ color: "#64748b" }}>載入中…</p></div>);

  if (noConfig) return (
    <div style={wrap}>
      <div style={card}>
        <p style={{ color: "#dc2626", fontSize: 14 }}>系統設定錯誤，請聯繫管理員</p>
      </div>
    </div>
  );

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ marginBottom: 18 }}><Logo size={24} /></div>
        <h2 style={{ margin: "0 0 22px", fontSize: 22, color: "#0f172a" }}>帳號設定</h2>

        <form onSubmit={handleSave}>
          <div style={{ marginBottom: 16 }}>
            <label style={label} htmlFor="account-email">Email（登入帳號，無法修改）</label>
            <input id="account-email" style={roInput} value={email} readOnly />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={label} htmlFor="name">顯示名稱</label>
            <input id="name" style={input} value={name}
              onChange={e => { setName(e.target.value); setSaved(false); }}
              placeholder="用於留言與評分掛名" maxLength={40} />
          </div>
          <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 18px", lineHeight: 1.6 }}>
            修改後僅影響日後的留言與評分掛名，先前發表的內容不會更動。
          </p>
          {error && <p style={{ color: "#dc2626", fontSize: 13, margin: "0 0 12px" }}>{error}</p>}
          {saved && <p style={{ color: "#16a34a", fontSize: 13, margin: "0 0 12px" }}>已儲存</p>}
          <button type="submit" style={btn} disabled={saving}>{saving ? "儲存中…" : "儲存"}</button>
        </form>

        <div style={{ borderTop: "1px solid #eef2f7", marginTop: 22, paddingTop: 18 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15, color: "#0f172a" }}>我的訂單</h3>
          {orders === null ? (
            <p style={{ color: "#94a3b8", fontSize: 13 }}>載入中…</p>
          ) : orders.length === 0 ? (
            <p style={{ color: "#94a3b8", fontSize: 13 }}>目前沒有訂單</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {sortOrdersDesc(orders).map(o => {
                const st = o.status;
                const stColor = st === "paid" ? "#16a34a" : st === "refunded" ? "#dc2626" : st === "pending" ? "#b45309" : "#64748b";
                return (
                  <div key={o.mer_trade_no} style={{ border: "1px solid #eef2f7", borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{o.plan_label || o.plan || "課程"}</span>
                      <span style={{ fontSize: 14, color: "#0f172a", flexShrink: 0 }}>NT${(o.amount || 0).toLocaleString()}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: stColor }}>{statusLabel(o.status)}</span>
                      <span style={{ fontSize: 12, color: "#94a3b8" }}>{o.created_at ? new Date(o.created_at).toLocaleDateString("zh-TW") : ""}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{invoiceText(o.invoice_no)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div style={{ borderTop: "1px solid #eef2f7", marginTop: 22, paddingTop: 18 }}>
          <a href="/classroom/reset-password" style={{ color: "#2563eb", fontSize: 14, textDecoration: "none", display: "block" }}>修改密碼 →</a>
          <a href="/classroom/certificate" style={{ color: "#2563eb", fontSize: 14, textDecoration: "none", display: "block", marginTop: 12 }}>完課證書 →</a>
        </div>
        <div style={{ marginTop: 14 }}>
          <a href="/classroom" style={{ color: "#94a3b8", fontSize: 13, textDecoration: "none" }}>← 返回教室</a>
        </div>
      </div>
    </div>
  );
}
