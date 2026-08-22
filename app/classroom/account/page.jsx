"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { validateDisplayName } from "@/lib/account";
import { statusLabel, invoiceText, sortOrdersDesc } from "@/lib/my-orders-view";
import { isValidMobile, LEVELS } from "@/lib/student-profile";
import ProfileFields from "@/components/ProfileFields";
import Logo from "@/components/Logo";

// 單一課程架構：目前只有一門課，訂單以此課名顯示（多課程再改為讀 courses）。
const COURSE_NAME = "Crossverick Vol.1　從零開始學鋼琴｜了解三和弦與基礎伴奏";

function getDeviceId() {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("inrec_device_id");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("inrec_device_id", id); }
  return id;
}
function fmtDate(s) { try { return new Date(s).toLocaleDateString("zh-TW"); } catch { return ""; } }
function fmtDateTime(s) {
  try { return new Date(s).toLocaleString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).replace(/\//g, "-"); }
  catch { return "—"; }
}

export default function AccountPage() {
  const [loading, setLoading] = useState(true);
  const [noConfig, setNoConfig] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [prof, setProf] = useState({ real_name: "", phone: "", level: "", goal: "", source: "", equipment: "", age_group: "", gender: "" });
  const [orders, setOrders] = useState(null);
  const [devices, setDevices] = useState(null);
  const [curDevice, setCurDevice] = useState("");
  const [tab, setTab] = useState("profile");
  const [theme, setTheme] = useState(null);
  const [sysDark, setSysDark] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const [devBusy, setDevBusy] = useState("");

  useEffect(() => {
    (async () => {
      if (!supabase) { setNoConfig(true); setLoading(false); return; }
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { window.location.href = "/classroom/login"; return; }
        setEmail(user.email || "");
        setDisplayName(user.user_metadata?.full_name || "");
        setAvatarUrl(user.user_metadata?.avatar_url || user.user_metadata?.picture || "");
        setCurDevice(getDeviceId());
      } catch { window.location.href = "/classroom/login"; return; }
      finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (!supabase) { setOrders([]); return; }
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setOrders([]); return; }
      try {
        const r = await fetch("/api/classroom/my-orders", { headers: { Authorization: `Bearer ${token}` } });
        setOrders((r.ok ? (await r.json()).orders : []) || []);
      } catch { setOrders([]); }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!supabase) return;
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const r = await fetch("/api/classroom/profile", { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json().catch(() => ({}));
      if (d.prefill) setProf(d.prefill);
    })();
  }, []);

  const loadDevices = useCallback(async () => {
    if (!supabase) { setDevices([]); return; }
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) { setDevices([]); return; }
    try {
      const r = await fetch("/api/classroom/devices", { headers: { Authorization: `Bearer ${token}` } });
      setDevices((r.ok ? (await r.json()).devices : []) || []);
    } catch { setDevices([]); }
  }, []);
  useEffect(() => { loadDevices(); }, [loadDevices]);

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
  const effectiveDark = theme ? theme === "dark" : sysDark;

  async function saveProfile(e) {
    e.preventDefault(); setErr(""); setSaved(false);
    if (!prof.real_name.trim()) { setErr("請填真實姓名"); return; }
    if (!isValidMobile(prof.phone)) { setErr("手機格式需為 09 開頭共 10 碼"); return; }
    if (!LEVELS.includes(prof.level)) { setErr("請選擇鋼琴程度"); return; }
    let dn = displayName.trim();
    if (dn) { const c = validateDisplayName(dn); if (!c.ok) { setErr(c.error); return; } dn = c.value; }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch("/api/classroom/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify(prof),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) { setErr("儲存失敗：" + (d.error || "unknown")); return; }
      const { error: e2 } = await supabase.auth.updateUser({ data: { full_name: dn } });
      if (e2) { setErr(e2.message || "顯示名稱儲存失敗"); return; }
      setSaved(true);
    } finally { setSaving(false); }
  }

  async function signOutDevice(id) {
    setDevBusy(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`/api/classroom/devices?device_id=${encodeURIComponent(id)}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      await loadDevices();
    } finally { setDevBusy(""); }
  }
  async function handleLogout() { await supabase?.auth.signOut(); window.location.href = "/"; }

  const inp = { width: "100%", padding: "11px 14px", fontSize: 14.5, border: "1px solid var(--in-line)", borderRadius: 10, outline: "none", background: "var(--in-bg)", color: "var(--ink)", boxSizing: "border-box", fontFamily: "inherit" };
  const roInp = { ...inp, opacity: .5, cursor: "not-allowed" };
  const lab = { display: "block", fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 8, fontWeight: 600, letterSpacing: ".02em" };

  const name = prof.real_name || displayName || email.split("@")[0] || "同學";

  if (loading || noConfig) {
    return (
      <div className="mc" data-theme={theme || undefined}>
        <style>{MC_CSS}</style>
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
          {noConfig ? <p style={{ color: "var(--danger)", fontSize: 14 }}>系統設定有誤，請聯繫管理員</p> : <div className="spin" aria-label="載入中" />}
        </div>
      </div>
    );
  }

  return (
    <div className="mc" data-theme={theme || undefined}>
      <style>{MC_CSS}</style>

      <div className="top">
        <a href="/classroom" aria-label="InRecord"><Logo white={effectiveDark} size={22} /></a>
        <div className="right">
          <a href="/classroom/watch">音樂教室</a>
          <span className="cur">會員中心</span>
          <button className="toggle" onClick={toggleTheme} aria-label="切換深色／淺色">{effectiveDark ? "☾" : "☀"}</button>
        </div>
      </div>

      <div className="shell">
        <aside className="side">
          <div className="me">
            <div className="avatar">
              {avatarUrl
                ? <img src={avatarUrl} alt="" referrerPolicy="no-referrer" />
                : <svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="32" r="14" fill="currentColor" opacity=".85" /><path d="M14 72c1.5-15 12-24 26-24s24.5 9 26 24z" fill="currentColor" opacity=".85" /></svg>}
            </div>
            <div className="nm">{name}</div>
            <div className="em">{email}</div>
            <div className="badge">已驗證</div>
          </div>
          <nav className="nav">
            <a href="/classroom">我的學習</a>
            <button className={tab === "profile" ? "on" : ""} onClick={() => setTab("profile")}>會員資料</button>
            <button className={tab === "orders" ? "on" : ""} onClick={() => setTab("orders")}>訂單紀錄</button>
            <button className={tab === "devices" ? "on" : ""} onClick={() => setTab("devices")}>登入裝置</button>
            <div className="sep" />
            <a href="/classroom/reset-password" className="out">修改密碼</a>
            <button className="out" onClick={handleLogout}>登出</button>
          </nav>
        </aside>

        <main>
          {tab === "profile" && (
            <section className="panel">
              <div className="phead"><h1>基本資料</h1><p>這些資料用來安排適合的教學與聯繫；暱稱會顯示在課程留言、評分區。</p></div>
              <form onSubmit={saveProfile}>
                <div className="pbody">
                  <div className="grid2">
                    <div><label style={lab}>暱稱</label>
                      <input style={inp} value={displayName} onChange={(e) => { setDisplayName(e.target.value); setSaved(false); }} placeholder="公開顯示在留言、評分區" maxLength={40} /></div>
                    <div><label style={lab}>電子信箱（不能修改）</label>
                      <input style={roInp} value={email} readOnly /></div>
                    <ProfileFields prof={prof} setProf={setProf} styles={{ input: inp, label: lab }} />
                  </div>
                  <p className="hint">送出即表示你同意依<a className="ilink" href="/privacy">隱私政策</a>，將資料用於課程服務與聯繫。</p>
                  {err && <p className="msg err">{err}</p>}
                  {saved && <p className="msg ok">已儲存 ✓</p>}
                </div>
                <div className="pfoot"><button type="submit" className="btn" disabled={saving}>{saving ? "儲存中…" : "儲存"}</button></div>
              </form>
            </section>
          )}

          {tab === "orders" && (
            <section className="panel">
              <div className="phead"><h1>訂單紀錄</h1><p>你在 InRecord 的購課與付款紀錄。</p></div>
              <div className="pbody">
                {orders === null ? <p className="muted">載入中…</p>
                  : orders.length === 0 ? <p className="muted">還沒有訂單</p>
                  : (
                    <div style={{ display: "grid", gap: 12 }}>
                      {sortOrdersDesc(orders).map((o) => (
                        <div key={o.mer_trade_no} className="order">
                          <div className="r1">
                            <span className="pl">{COURSE_NAME}</span>
                            <span className="amt">NT${(o.amount || 0).toLocaleString()}</span>
                          </div>
                          <div className="r2">
                            <span className="plan">方案：{o.plan_label || o.plan || "課程"}</span>
                            <span><span className={"st " + (o.status === "paid" ? "paid" : o.status === "refunded" ? "refund" : "")}>{statusLabel(o.status)}</span> <span className="muted">· {fmtDate(o.created_at)}</span></span>
                          </div>
                          {invoiceText(o.invoice_no) && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{invoiceText(o.invoice_no)}</div>}
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </section>
          )}

          {tab === "devices" && (
            <section className="panel">
              <div className="phead"><h1>登入裝置</h1></div>
              <div className="pbody">
                <p className="devnote">InRecord 允許同時在多台裝置上課。當裝置數量達到上限，新裝置要進來時會擠掉最久沒用的那一台、自動登出。你也可以在這裡手動登出不再使用的裝置。</p>
                {devices === null ? <p className="muted">載入中…</p>
                  : devices.length === 0 ? <p className="muted">目前沒有已記錄的上課裝置。</p>
                  : (
                    <div style={{ marginTop: 8 }}>
                      {devices.map((d) => {
                        const isCur = d.device_id === curDevice;
                        return (
                          <div key={d.device_id} className="dev">
                            <dl className="kv">
                              <dt>裝置</dt><dd>{d.device || "未知裝置"}</dd>
                              <dt>瀏覽器</dt><dd>{d.browser || "—"}</dd>
                              <dt>登入時間</dt><dd>{fmtDateTime(d.created_at)}</dd>
                              <dt>最後使用</dt><dd>{fmtDateTime(d.last_seen_at)}</dd>
                            </dl>
                            <div className="side2">
                              {isCur ? <span className="cur2">目前裝置</span>
                                : <button className="signout" onClick={() => signOutDevice(d.device_id)} disabled={devBusy === d.device_id}>{devBusy === d.device_id ? "登出中…" : "登出此裝置"}</button>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

const MC_CSS = `
.mc{
  --page:#f5f7fa; --card:#ffffff; --card-2:#f7f9fc;
  --ink:#16233b; --ink-soft:#586378; --ink-faint:#9aa3b2;
  --accent:#2563eb; --accent-soft:#eaf0ff;
  --line:#eaeef4; --line-2:#f0f3f8;
  --ok:#0f9d58; --ok-bg:#e8f6ee; --danger:#dc2626;
  --in-bg:#ffffff; --in-line:#dbe1ea; --focus:rgba(37,99,235,.14);
  --tgl-bg:#f0f4fb; --tgl-line:#e2e8f2; --tgl-ink:#2563eb;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang TC","Noto Sans TC","Helvetica Neue",sans-serif;
  --shadow:0 1px 2px rgba(16,24,40,.04),0 12px 32px -18px rgba(16,24,40,.18);
  color-scheme:light;
  min-height:100vh; background:var(--page); color:var(--ink); font-family:var(--sans);
  -webkit-font-smoothing:antialiased; letter-spacing:.01em; transition:background .35s,color .3s;
}
.mc[data-theme="dark"]{
  --page:#0c0f15; --card:#141922; --card-2:#0f141c;
  --ink:#ece7db; --ink-soft:#a7a294; --ink-faint:#7f7a6f;
  --accent:#e8c583; --accent-soft:rgba(232,197,131,.12);
  --line:#3a4553; --line-2:#2c3542;
  --ok:#7fd69b; --ok-bg:rgba(127,214,155,.12); --danger:#f0a1a1;
  --in-bg:#0f141c; --in-line:#414c5a; --focus:rgba(232,197,131,.22);
  --tgl-bg:#1a2029; --tgl-line:#414c5a; --tgl-ink:#e8c583;
  --shadow:0 1px 2px rgba(0,0,0,.3),0 16px 40px -20px rgba(0,0,0,.6);
  color-scheme:dark;
}
@media (prefers-color-scheme:dark){ .mc:not([data-theme]){
  --page:#0c0f15; --card:#141922; --card-2:#0f141c;
  --ink:#ece7db; --ink-soft:#a7a294; --ink-faint:#7f7a6f;
  --accent:#e8c583; --accent-soft:rgba(232,197,131,.12);
  --line:#3a4553; --line-2:#2c3542;
  --ok:#7fd69b; --ok-bg:rgba(127,214,155,.12); --danger:#f0a1a1;
  --in-bg:#0f141c; --in-line:#414c5a; --focus:rgba(232,197,131,.22);
  --tgl-bg:#1a2029; --tgl-line:#414c5a; --tgl-ink:#e8c583;
  --shadow:0 1px 2px rgba(0,0,0,.3),0 16px 40px -20px rgba(0,0,0,.6);
  color-scheme:dark;
}}
.mc *{box-sizing:border-box}
.mc a{color:inherit; text-decoration:none}
.mc .top{display:flex; align-items:center; justify-content:space-between; padding:18px clamp(16px,4vw,44px); max-width:1140px; margin:0 auto}
.mc .top .right{display:flex; align-items:center; gap:22px; font-size:14px; color:var(--ink-soft)}
.mc .top .right a:hover{color:var(--ink)}
.mc .top .right .cur{color:var(--accent); font-weight:600}
.mc .toggle{width:36px;height:36px;border-radius:50%;border:1px solid var(--tgl-line);background:var(--tgl-bg);color:var(--tgl-ink);cursor:pointer;font-size:15px;display:grid;place-items:center;transition:.2s}
.mc .toggle:hover{border-color:var(--accent)}
.mc .shell{max-width:1140px; margin:0 auto; padding:8px clamp(16px,4vw,44px) 60px; display:grid; grid-template-columns:250px 1fr; gap:24px; align-items:start}
@media(max-width:820px){ .mc .shell{grid-template-columns:1fr; gap:16px} }
.mc .side{background:var(--card); border:1px solid var(--line); border-radius:16px; padding:26px 14px 14px; box-shadow:var(--shadow); position:sticky; top:16px}
@media(max-width:820px){ .mc .side{position:static} }
.mc .me{display:flex; flex-direction:column; align-items:center; text-align:center; padding:0 6px 20px; border-bottom:1px solid var(--line-2)}
.mc .avatar{width:80px;height:80px;border-radius:50%;overflow:hidden;background:var(--card-2);border:1px solid var(--line);display:grid;place-items:center;color:var(--ink-faint)}
.mc .avatar img{width:100%;height:100%;object-fit:cover}
.mc .avatar svg{width:100%;height:100%}
.mc .me .nm{margin-top:13px;font-weight:700;font-size:17px;color:var(--ink);letter-spacing:.02em}
.mc .me .em{margin-top:4px;font-size:12.5px;color:var(--ink-faint);word-break:break-all}
.mc .badge{margin-top:11px;font-size:11.5px;font-weight:600;color:var(--ok);background:var(--ok-bg);border-radius:6px;padding:3px 10px}
.mc .nav{display:flex;flex-direction:column;gap:1px;margin-top:12px}
.mc .nav a,.mc .nav button{display:block;width:100%;text-align:left;padding:11px 14px;border:0;background:none;border-radius:9px;font-size:14.5px;font-weight:500;color:var(--ink-soft);cursor:pointer;transition:.14s;font-family:inherit}
.mc .nav a:hover,.mc .nav button:hover{background:var(--card-2);color:var(--ink)}
.mc .nav button.on{background:var(--accent-soft);color:var(--accent);font-weight:600}
.mc .nav .sep{height:1px;background:var(--line-2);margin:9px 8px}
.mc .nav a.out,.mc .nav button.out{color:var(--ink-faint);font-size:14px}
.mc .panel{background:var(--card); border:1px solid var(--line); border-radius:16px; box-shadow:var(--shadow); overflow:hidden}
.mc .phead{padding:26px 28px 0}
.mc .phead h1{margin:0;font-weight:700;font-size:21px;letter-spacing:-.01em}
.mc .phead p{margin:8px 0 0;font-size:13.5px;color:var(--ink-soft);line-height:1.7}
.mc .pbody{padding:24px 28px}
.mc .pfoot{display:flex;justify-content:flex-end;padding:16px 28px;border-top:1px solid var(--line-2)}
.mc .grid2{display:grid;grid-template-columns:1fr 1fr;gap:18px 22px}
@media(max-width:560px){ .mc .grid2{grid-template-columns:1fr} }
.mc input:focus,.mc select:focus{box-shadow:0 0 0 3px var(--focus)}
.mc .hint{font-size:12px;color:var(--ink-faint);margin:16px 0 0;line-height:1.6}
.mc .ilink{color:var(--accent);font-weight:600}
.mc .msg{font-size:13px;margin:10px 0 0}
.mc .msg.err{color:var(--danger)} .mc .msg.ok{color:var(--ok)}
.mc .btn{border:0;border-radius:10px;padding:11px 30px;font-size:14.5px;font-weight:600;font-family:inherit;cursor:pointer;background:var(--accent);color:#fff;transition:transform .15s}
.mc[data-theme="dark"] .btn{color:#241a08}
@media (prefers-color-scheme:dark){ .mc:not([data-theme]) .btn{color:#241a08} }
.mc .btn:hover{transform:translateY(-1px)} .mc .btn:disabled{opacity:.6;transform:none;cursor:default}
.mc .order{border:1px solid var(--line);border-radius:12px;padding:16px 18px;background:var(--card-2)}
.mc .order .r1{display:flex;justify-content:space-between;gap:14px;align-items:baseline}
.mc .order .pl{font-weight:600;font-size:14.5px;line-height:1.5}
.mc .order .amt{font-weight:700;font-size:15px;font-variant-numeric:tabular-nums;white-space:nowrap}
.mc .order .r2{display:flex;justify-content:space-between;gap:12px;margin-top:9px;font-size:12.5px;flex-wrap:wrap}
.mc .plan{color:var(--ink-soft)}
.mc .st{font-weight:600} .mc .st.paid{color:var(--ok)} .mc .st.refund{color:var(--danger)}
.mc .muted{color:var(--ink-faint)}
.mc .devnote{font-size:13.5px;color:var(--ink-soft);line-height:1.75;margin:0}
.mc .dev{display:grid;grid-template-columns:1fr auto;gap:14px;padding:20px 0;border-bottom:1px solid var(--line-2)}
.mc .dev:last-child{border-bottom:0;padding-bottom:2px}
.mc .dev .kv{display:grid;grid-template-columns:auto 1fr;gap:5px 16px;font-size:13px;margin:0}
.mc .dev .kv dt{color:var(--ink-faint)}
.mc .dev .kv dd{margin:0;color:var(--ink);font-variant-numeric:tabular-nums}
.mc .dev .side2{display:flex;align-items:flex-start;justify-content:flex-end;white-space:nowrap}
.mc .cur2{font-size:12.5px;font-weight:600;color:var(--accent)}
.mc .signout{font-size:12.5px;color:var(--danger);border:1px solid var(--in-line);background:transparent;border-radius:8px;padding:6px 13px;cursor:pointer;font-family:inherit}
.mc .signout:hover{border-color:var(--danger)} .mc .signout:disabled{opacity:.6;cursor:default}
.mc .spin{width:28px;height:28px;border:2.5px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:mcspin .7s linear infinite}
@keyframes mcspin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){ .mc *{transition:none!important;animation:none!important} }
`;
