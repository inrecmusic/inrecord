"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { validateDisplayName } from "@/lib/account";
import { statusLabel, invoiceText, sortOrdersDesc } from "@/lib/my-orders-view";
import { isValidMobile, LEVELS } from "@/lib/student-profile";
import ProfileFields from "@/components/ProfileFields";
import Logo from "@/components/Logo";

export default function AccountPage() {
  const [loading, setLoading] = useState(true);
  const [noConfig, setNoConfig] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [orders, setOrders] = useState(null); // null=載入中, []=空
  const [prof, setProf] = useState({ real_name: "", phone: "", level: "", goal: "", source: "", equipment: "", age_group: "", gender: "" });
  const [profSaving, setProfSaving] = useState(false);
  const [profSaved, setProfSaved] = useState(false);
  const [profErr, setProfErr] = useState("");
  const [theme, setTheme] = useState(null); // null=跟系統；'dark'/'light'=手動（與儀表板共用 localStorage）
  const [sysDark, setSysDark] = useState(true); // 系統是否偏好深色（logo white 判斷用）

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

  useEffect(() => {
    (async () => {
      if (!supabase) return;
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const r = await fetch("/api/classroom/profile", { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json().catch(() => ({}));
      if (d.prefill) setProf(d.prefill); // 預填：帶入既有值或訂單姓名/手機
    })();
  }, []);

  useEffect(() => {
    try { const s = localStorage.getItem("inrec-hub-theme"); if (s) setTheme(s); } catch {}
    try { setSysDark(window.matchMedia("(prefers-color-scheme: dark)").matches); } catch {}
  }, []);
  function toggleTheme() {
    const eff = theme || (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    const next = eff === "dark" ? "light" : "dark";
    setTheme(next);
    try { localStorage.setItem("inrec-hub-theme", next); } catch {}
  }

  async function handleSave(e) {
    e.preventDefault();
    setError(""); setSaved(false);
    if (!supabase) { setError("系統設定有誤，請聯繫管理員"); return; }
    const check = validateDisplayName(name);
    if (!check.ok) { setError(check.error); return; }
    setSaving(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ data: { full_name: check.value } });
      if (err) throw err;
      setName(check.value);
      setSaved(true);
    } catch (err) {
      setError(err.message || "儲存失敗，請再試一次");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveProfile(e) {
    e.preventDefault(); setProfErr(""); setProfSaved(false);
    if (!prof.real_name.trim()) { setProfErr("請填真實姓名"); return; }
    if (!isValidMobile(prof.phone)) { setProfErr("手機格式需為 09 開頭共 10 碼"); return; }
    if (!LEVELS.includes(prof.level)) { setProfErr("請選擇鋼琴程度"); return; }
    setProfSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch("/api/classroom/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify(prof),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) setProfErr("儲存失敗：" + (d.error || "unknown"));
      else setProfSaved(true);
    } finally { setProfSaving(false); }
  }

  // 表單欄位樣式用 CSS 變數 → 隨深/淺主題自動變色（ProfileFields 也吃這組）
  const inp = { width: "100%", padding: "11px 14px", fontSize: 16, border: "1px solid var(--in-line)", borderRadius: 10, outline: "none", background: "var(--in-bg)", color: "var(--ink)", boxSizing: "border-box", fontFamily: "inherit" };
  const roInp = { ...inp, opacity: .6, cursor: "not-allowed" };
  const lab = { display: "block", fontSize: 13, color: "var(--ink-soft)", marginBottom: 6, fontWeight: 500 };

  const effectiveDark = theme ? theme === "dark" : sysDark; // 目前實際是深色嗎（logo 用白版）
  const logo = (
    <a href="/classroom" aria-label="回教室"><Logo white={effectiveDark} size={24} /></a>
  );

  if (loading || noConfig) {
    return (
      <div className="acct" data-theme={theme || undefined}>
        <style>{ACCT_CSS}</style>
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
          {noConfig
            ? <p style={{ color: "var(--err)", fontSize: 14 }}>系統設定有誤，請聯繫管理員</p>
            : <div className="spin" aria-label="載入中" />}
        </div>
      </div>
    );
  }

  return (
    <div className="acct" data-theme={theme || undefined}>
      <style>{ACCT_CSS}</style>
      <div className="glow" aria-hidden="true" />

      <nav>
        {logo}
        <div className="r">
          <a href="/classroom">教室</a>
          <a href="/classroom/watch">音樂教室</a>
          <button className="toggle" onClick={toggleTheme} aria-label="切換深色／淺色">{effectiveDark ? "☾" : "☀"}</button>
        </div>
      </nav>

      <div className="wrap">
        <div className="head">
          <div className="eyebrow">Account</div>
          <h1>帳號設定</h1>
        </div>

        {/* 基本資料 */}
        <section className="card">
          <h2>基本資料</h2>
          <form onSubmit={handleSave}>
            <div className="fg">
              <label style={lab} htmlFor="account-email">Email（登入帳號，不能修改）</label>
              <input id="account-email" style={roInp} value={email} readOnly />
            </div>
            <div className="fg">
              <label style={lab} htmlFor="name">顯示名稱</label>
              <input id="name" style={inp} value={name}
                onChange={e => { setName(e.target.value); setSaved(false); }}
                placeholder="留言、評分時顯示的名字" maxLength={40} />
              <p className="hint">改了之後，只有之後的留言和評分會用新名字，之前發過的不會變。</p>
            </div>
            {error && <p className="err">{error}</p>}
            {saved && <p className="ok">已儲存</p>}
            <button type="submit" className="btn" disabled={saving}>{saving ? "儲存中…" : "儲存"}</button>
          </form>
        </section>

        {/* 學員資料 */}
        <section className="card">
          <h2>我的學員資料</h2>
          <form onSubmit={handleSaveProfile} style={{ display: "grid", gap: 12 }}>
            <ProfileFields prof={prof} setProf={setProf} styles={{ input: inp, label: lab }} />
            {profErr && <p className="err" style={{ margin: 0 }}>{profErr}</p>}
            {profSaved && <p className="ok" style={{ margin: 0 }}>已儲存 ✓</p>}
            <p className="hint" style={{ margin: 0 }}>送出即表示你同意依<a className="ilink" href="/privacy">隱私政策</a>，將資料用於課程服務與聯繫。</p>
            <button type="submit" className="btn" style={{ marginTop: 4 }} disabled={profSaving}>{profSaving ? "儲存中…" : "儲存學員資料"}</button>
          </form>
        </section>

        {/* 訂單 */}
        <section className="card">
          <h2>我的訂單</h2>
          {orders === null ? (
            <p className="muted">載入中…</p>
          ) : orders.length === 0 ? (
            <p className="muted">還沒有訂單</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {sortOrdersDesc(orders).map(o => {
                const st = o.status;
                const stColor = st === "paid" ? "var(--ok)" : st === "refunded" ? "var(--err)" : st === "pending" ? "#d99a3c" : "var(--ink-faint)";
                return (
                  <div key={o.mer_trade_no} className="order">
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{o.plan_label || o.plan || "課程"}</span>
                      <span style={{ fontSize: 14, color: "var(--ink)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>NT${(o.amount || 0).toLocaleString()}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: stColor }}>{statusLabel(o.status)}</span>
                      <span className="muted" style={{ fontSize: 12 }}>{o.created_at ? new Date(o.created_at).toLocaleDateString("zh-TW") : ""}</span>
                    </div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{invoiceText(o.invoice_no)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 其他 */}
        <section className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <a className="link" href="/classroom/reset-password">修改密碼 →</a>
          <a className="muted" href="/classroom">← 回教室</a>
          {/* 完課證書入口暫隱藏：尚未製作，有學員申請再開；證書頁 /classroom/certificate 仍保留、日後取消本註解即恢復 */}
        </section>
      </div>

      <div className="keys" aria-hidden="true">{Array.from({ length: 24 }).map((_, i) => <i key={i} />)}</div>
    </div>
  );
}

const ACCT_CSS = `
.acct{
  --bg1:#1c2438; --bg2:#0e1118; --bg3:#090b10;
  --ink:#ece7db; --ink-soft:#a9a496; --ink-faint:#8f8a7d;
  --gold:#e8c583; --gold-line:rgba(232,197,131,.55);
  --card:rgba(255,255,255,.05); --card-b:rgba(255,255,255,.02);
  --line-soft:rgba(255,255,255,.15);
  --cta-bg:#e8c583; --cta-ink:#241a08;
  --glow:rgba(232,197,131,.16);
  --key-a:#171b22; --key-b:#0c0e13; --key-black:#05070b; --key-line:rgba(0,0,0,.55); --keys-op:.5;
  --in-bg:rgba(255,255,255,.05); --in-line:rgba(255,255,255,.18); --focus:rgba(232,197,131,.28);
  --tgl-bg:rgba(255,255,255,.07); --tgl-line:rgba(255,255,255,.2); --tgl-ink:#e8c583;
  --ok:#7fd69b; --err:#f2a3a3;
  --serif:"Songti TC","Noto Serif TC",Georgia,serif;
  color-scheme:dark;
  min-height:100vh; position:relative; overflow-x:hidden; padding-bottom:84px;
  color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang TC","Noto Sans TC",sans-serif;
  background:radial-gradient(120% 90% at 82% -10%,var(--bg1) 0%,var(--bg2) 46%,var(--bg3) 100%);
  transition:background .5s ease,color .35s ease;
}
@media (prefers-color-scheme:light){ .acct:not([data-theme]){
  --bg1:#ffffff; --bg2:#f7faff; --bg3:#edf3ff;
  --ink:#15233f; --ink-soft:#4d5a72; --ink-faint:#8590a4;
  --gold:#2563eb; --gold-line:rgba(37,99,235,.42);
  --card:rgba(255,255,255,.72); --card-b:rgba(238,244,255,.55);
  --line-soft:rgba(30,50,95,.12);
  --cta-bg:#2563eb; --cta-ink:#ffffff;
  --glow:rgba(37,99,235,.13);
  --key-a:#ffffff; --key-b:#e8f0fc; --key-black:#1a2b4d; --key-line:rgba(37,99,235,.16); --keys-op:.75;
  --in-bg:#ffffff; --in-line:rgba(37,99,235,.22); --focus:rgba(37,99,235,.16);
  --tgl-bg:rgba(37,99,235,.09); --tgl-line:rgba(37,99,235,.24); --tgl-ink:#2563eb;
  --ok:#16a34a; --err:#dc2626;
  color-scheme:light;
}}
.acct[data-theme="light"]{
  --bg1:#ffffff; --bg2:#f7faff; --bg3:#edf3ff;
  --ink:#15233f; --ink-soft:#4d5a72; --ink-faint:#8590a4;
  --gold:#2563eb; --gold-line:rgba(37,99,235,.42);
  --card:rgba(255,255,255,.72); --card-b:rgba(238,244,255,.55);
  --line-soft:rgba(30,50,95,.12);
  --cta-bg:#2563eb; --cta-ink:#ffffff;
  --glow:rgba(37,99,235,.13);
  --key-a:#ffffff; --key-b:#e8f0fc; --key-black:#1a2b4d; --key-line:rgba(37,99,235,.16); --keys-op:.75;
  --in-bg:#ffffff; --in-line:rgba(37,99,235,.22); --focus:rgba(37,99,235,.16);
  --tgl-bg:rgba(37,99,235,.09); --tgl-line:rgba(37,99,235,.24); --tgl-ink:#2563eb;
  --ok:#16a34a; --err:#dc2626;
  color-scheme:light;
}
.acct *{box-sizing:border-box}
.acct a{text-decoration:none; color:inherit}
.acct .glow{position:absolute; top:-160px; right:-120px; width:520px; height:520px; border-radius:50%; background:radial-gradient(circle,var(--glow),transparent 62%); pointer-events:none}
.acct nav{display:flex; align-items:center; justify-content:space-between; padding:22px clamp(20px,5vw,60px); position:relative; z-index:3}
.acct nav .r{display:flex; align-items:center; gap:18px; font-size:14px}
.acct nav .r a{color:var(--ink-soft); transition:.2s}
.acct nav .r a:hover{color:var(--ink)}
.acct .toggle{width:40px;height:40px;border-radius:50%;border:1px solid var(--tgl-line);background:var(--tgl-bg);color:var(--tgl-ink);display:grid;place-items:center;cursor:pointer;transition:.25s;font-size:16px}
.acct .toggle:hover{transform:rotate(-18deg)}
.acct .wrap{max-width:600px; margin:0 auto; padding:8px clamp(20px,5vw,60px) 0; position:relative; z-index:2}
.acct .eyebrow{font-size:12px; letter-spacing:.34em; text-transform:uppercase; color:var(--gold); font-weight:600}
.acct .head h1{font-family:var(--serif); font-weight:600; font-size:clamp(26px,5vw,38px); margin:10px 0 24px}
.acct .card{background:var(--card); border:1px solid var(--line-soft); border-radius:16px; padding:24px; margin-bottom:16px}
.acct .card h2{font-family:var(--serif); font-size:20px; color:var(--ink); margin:0 0 16px; display:flex; align-items:baseline; gap:12px; font-weight:600}
.acct .card h2::after{content:""; flex:1; height:1px; background:linear-gradient(90deg,var(--gold-line),transparent)}
.acct .fg{margin-bottom:14px}
.acct .hint{font-size:12px; color:var(--ink-faint); margin:6px 0 0; line-height:1.6}
.acct .ilink{color:var(--gold); font-weight:600}
.acct .err{color:var(--err); font-size:13px; margin:10px 0 0}
.acct .ok{color:var(--ok); font-size:13px; margin:10px 0 0}
.acct input:focus, .acct select:focus{box-shadow:0 0 0 3px var(--focus)}
.acct .btn{width:100%; margin-top:16px; padding:13px; font-size:15px; font-weight:700; color:var(--cta-ink); background:var(--cta-bg); border:0; border-radius:100px; cursor:pointer; font-family:inherit; transition:transform .2s}
.acct .btn:hover{transform:translateY(-2px)}
.acct .btn:disabled{opacity:.6; cursor:default; transform:none}
.acct .order{border:1px solid var(--line-soft); border-radius:12px; padding:12px 14px; background:var(--card-b)}
.acct .link{color:var(--gold); font-weight:600; font-size:14px}
.acct .muted{color:var(--ink-faint); font-size:13px}
.acct .spin{width:28px;height:28px;border:2.5px solid var(--line-soft);border-top-color:var(--gold);border-radius:50%;animation:acctspin .7s linear infinite}
@keyframes acctspin{to{transform:rotate(360deg)}}
.acct .keys{position:absolute; bottom:0; left:0; right:0; height:60px; display:flex; opacity:var(--keys-op); pointer-events:none}
.acct .keys i{flex:1; border-right:1px solid var(--key-line); background:linear-gradient(var(--key-a),var(--key-b))}
.acct .keys i:nth-child(2n)::after{content:""; display:block; width:58%; height:62%; margin:0 auto; background:var(--key-black); border-radius:0 0 3px 3px}
@media (prefers-reduced-motion:reduce){ .acct *{transition:none!important; animation:none!important} }
@media(max-width:520px){ .acct nav .r a{display:none} }
`;
