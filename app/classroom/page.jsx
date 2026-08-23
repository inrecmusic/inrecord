"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isProfileCoreComplete, isValidMobile, LEVELS } from "@/lib/student-profile";
import ProfileFields from "@/components/ProfileFields";

const F = `var(--type-body)`;

/* ── 首次引導（核心資料未填時，仿播放頁一致）───────────────────────────────── */
function ProfileOnboarding({ token, initial, onDone }) {
  const [f, setF] = useState({ real_name: "", phone: "", level: "", goal: "", source: "", equipment: "", age_group: "", gender: "", ...initial });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function save(skipOptional) {
    setErr("");
    if (!f.real_name.trim()) { setErr("請填真實姓名"); return; }
    if (!isValidMobile(f.phone)) { setErr("手機格式需為 09 開頭共 10 碼"); return; }
    if (!LEVELS.includes(f.level)) { setErr("請選擇鋼琴程度"); return; }
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token || token;
      const body = skipOptional ? { real_name: f.real_name, phone: f.phone, level: f.level } : f;
      const r = await fetch("/api/classroom/profile", { method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` }, body: JSON.stringify(body) });
      if (r.status === 401) { setErr("登入狀態逾時，請重新整理頁面後再存一次"); return; }
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) { setErr("儲存失敗：" + (d.error || "請稍後再試")); return; }
      onDone({ ...f, ...body });
    } catch { setErr("儲存失敗，請稍後再試"); }
    finally { setBusy(false); }
  }
  const label = { display: "block", fontSize: 13, color: "#475569", marginBottom: 6, fontWeight: 500 };
  const input = { width: "100%", padding: "11px 14px", fontSize: 16, border: "1px solid #d5dce6", borderRadius: 10 };
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", display: "grid", placeItems: "center", padding: "40px 20px", fontFamily: F }}>
      <div style={{ width: "min(480px,100%)", background: "#fff", borderRadius: 16, padding: 28, boxShadow: "0 2px 24px rgba(15,23,42,.07)" }}>
        <h2 style={{ margin: "0 0 6px", fontSize: 22 }}>完善你的學員資料</h2>
        <p style={{ margin: "0 0 18px", fontSize: 13, color: "#64748b" }}>幾個問題，幫我們更了解你、安排適合的教學（核心必填，其餘可之後補）。</p>
        <div style={{ display: "grid", gap: 12 }}>
          <ProfileFields prof={f} setProf={setF} styles={{ input, label }} />
          {err && <p style={{ color: "#dc2626", fontSize: 13, margin: 0 }}>{err}</p>}
          <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>填寫即表示同意依<a href="/privacy" style={{ color: "#2563eb" }}>隱私政策</a>將資料用於課程服務與聯繫。</p>
          <button onClick={() => save(false)} disabled={busy} style={{ width: "100%", padding: 12, fontSize: 15, fontWeight: 600, color: "#fff", background: "#2563eb", border: 0, borderRadius: 10 }}>{busy ? "儲存中…" : "儲存並開始上課"}</button>
          <button onClick={() => save(true)} disabled={busy} style={{ width: "100%", padding: 10, fontSize: 13, color: "#64748b", background: "none", border: 0 }}>只填必填、其餘之後補</button>
        </div>
      </div>
    </div>
  );
}

/* ── 音樂廳學員中心 ─────────────────────────────────────────────────────────── */
export default function ClassroomHub() {
  const [user, setUser]                   = useState(null);
  const [token, setToken]                 = useState("");
  const [hasPurchased, setHasPurchased]   = useState(false);
  const [hasSubscription, setHasSubscription] = useState(false);
  const [loading, setLoading]             = useState(true);
  const [profile, setProfile]             = useState(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileErr, setProfileErr]       = useState(false);
  const [loadError, setLoadError]         = useState(false); // bootstrap 載入失敗→顯示重試，不誤判未購買
  const [chapters, setChapters]           = useState([]);
  const [videos, setVideos]               = useState([]);
  const [progress, setProgress]           = useState([]);
  const [pct, setPct]                     = useState(0);
  const [done, setDone]                   = useState(0);
  const [total, setTotal]                 = useState(0);
  const [theme, setTheme]                 = useState(null);   // null=跟系統；'dark'/'light'=手動
  const [sysDark, setSysDark]             = useState(true);   // 系統是否偏好深色（logo white 判斷用）
  const [greeting, setGreeting]           = useState("歡迎回來");

  /* auth + 教室資料一次載入（bootstrap 單一往返，取代原本 5 支 API 的兩個 wave）*/
  useEffect(() => {
    (async () => {
      try {
        if (!supabase) { window.location.href = "/classroom/login"; return; }
        const { data: { user: u } } = await supabase.auth.getUser();
        if (!u) { window.location.href = "/classroom/login"; return; }
        const { data: { session } } = await supabase.auth.getSession();
        const accessToken = session?.access_token || "";
        setUser(u); setToken(accessToken);
        try {
          const r = await fetch("/api/classroom/bootstrap", { headers: { Authorization: `Bearer ${accessToken}` } });
          if (!r.ok) { setLoadError(true); return; } // 載入失敗→重試畫面，別掉到「尚未購買」
          const d = await r.json().catch(() => ({}));
          setHasPurchased(!!d.hasPurchased);
          setHasSubscription(!!d.hasSubscription);
          setChapters(d.chapters || []);
          setVideos(d.videos || []);
          setProgress(d.progress || []);
          setPct(d.percentage || 0);
          setDone(d.completedCount || 0);
          setTotal(d.totalCount || (d.videos || []).length);
          setProfile(d.profile || d.prefill || {});
        } catch {
          setLoadError(true); // 網路/逾時失敗→重試，別誤判未購買
        } finally {
          setProfileLoaded(true);
        }
      } catch { window.location.href = "/classroom/login"; }
      finally { setLoading(false); }
    })();
  }, []);

  /* 主題：mount 後讀 localStorage（避免 SSR hydration 不一致）；問候依時間 */
  useEffect(() => {
    try { const s = localStorage.getItem("inrec-hub-theme"); if (s) setTheme(s); } catch {}
    try { setSysDark(window.matchMedia("(prefers-color-scheme: dark)").matches); } catch {}
    const h = new Date().getHours();
    setGreeting(h >= 5 && h < 11 ? "早安" : h >= 11 && h < 17 ? "午安" : "晚安");
  }, []);
  function toggleTheme() {
    const eff = theme || (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    const next = eff === "dark" ? "light" : "dark";
    setTheme(next);
    try { localStorage.setItem("inrec-hub-theme", next); } catch {}
  }
  async function handleLogout() { await supabase?.auth.signOut(); window.location.href = "/"; }

  /* gates */
  if (loading || (hasPurchased && token && !profileLoaded)) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0e1118" }}>
        <div style={{ width: 28, height: 28, border: "2.5px solid rgba(255,255,255,.12)", borderTopColor: "#e8c583", borderRadius: "50%", animation: "hubspin .7s linear infinite" }} />
        <style>{`@keyframes hubspin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }
  if (loadError) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f1f5f9", color: "#0f172a", textAlign: "center", padding: 32, fontFamily: F }}>
        <div>
          <div style={{ fontSize: 40, marginBottom: 14 }}>🎹</div>
          <h2 style={{ margin: "0 0 10px", fontSize: 22, fontWeight: 700 }}>教室載入時出了點問題</h2>
          <p style={{ color: "#475569", marginBottom: 24, fontSize: 15 }}>可能是網路或伺服器忙碌，請稍後再試一次。</p>
          <button onClick={() => window.location.reload()} style={{ padding: "12px 30px", background: "#2563eb", color: "#fff", border: 0, borderRadius: 980, fontWeight: 600, fontSize: 15, cursor: "pointer" }}>重新整理</button>
        </div>
      </div>
    );
  }
  if (!hasPurchased) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f1f5f9", color: "#0f172a", textAlign: "center", padding: 32, fontFamily: F }}>
        <div>
          <div style={{ fontSize: 56, marginBottom: 20 }}>🎹</div>
          <h2 style={{ margin: "0 0 10px", fontFamily: "var(--type-display)", fontSize: 30, fontWeight: 400 }}>尚未購買課程</h2>
          <p style={{ color: "#475569", marginBottom: 32, fontSize: 15, maxWidth: 320, margin: "0 auto 32px" }}>請先完成購課，即可觀看所有教學影片。</p>
          <a href="/#pricing" style={{ display: "inline-block", padding: "13px 32px", background: "#2563eb", color: "#fff", borderRadius: 980, fontWeight: 600, textDecoration: "none", fontSize: 15 }}>查看課程方案</a>
        </div>
      </div>
    );
  }
  if (hasPurchased && profileLoaded && !profileErr && !isProfileCoreComplete(profile)) {
    return <ProfileOnboarding token={token} initial={profile} onDone={(p) => setProfile(p)} />;
  }

  /* 衍生資料 */
  const progMap = Object.fromEntries(progress.map(p => [p.video_id, p]));
  const nextVideo = videos.find(v => !progMap[v.id]?.completed) || videos[0] || null;
  const roman = ["Ⅰ","Ⅱ","Ⅲ","Ⅳ","Ⅴ","Ⅵ","Ⅶ","Ⅷ","Ⅸ","Ⅹ"];
  const name = (profile && profile.real_name) || user?.email?.split("@")[0] || "同學";
  const dash = 578, offset = Math.round(dash * (1 - Math.min(100, pct) / 100));
  const effectiveDark = theme ? theme === "dark" : sysDark; // 目前實際是深色嗎（logo 用白版）

  return (
    <div className="hub" data-theme={theme || undefined}>
      <style>{HUB_CSS}</style>
      <div className="glow" aria-hidden="true" />

      <nav>
        <a href="/classroom" aria-label="InRecord"><img src={effectiveDark ? "/logo-wordmark-white.png" : "/logo-wordmark.png"} alt="InRecord" style={{ height: 22, width: "auto", display: "block" }} /></a>
        <div className="r">
          <a href="/classroom/watch">音樂教室</a>
          <a href="/classroom/account">帳號</a>
          <button className="toggle" onClick={toggleTheme} aria-label="切換深色／淺色">{effectiveDark ? "☾" : "☀"}</button>
          <div className="av">{name.slice(0, 1)}</div>
        </div>
      </nav>

      <div className="wrap">
        <div className="hero">
          <div>
            <div className="eyebrow">Welcome back</div>
            <h1>{greeting}，{name}。{nextVideo ? <><br />上次上到 <span>{nextVideo.title}</span>，我們繼續吧。</> : <><br />準備好，我們開始吧。</>}</h1>
            <p>{total > 0 ? <>已經完成 {pct}%（{done}/{total} 單元）了，點下面接著上次的進度。</> : <>課程即將上線，第一堂課很快和你見面。</>}</p>
            {nextVideo && <a className="cta" href={`/classroom/watch?v=${nextVideo.id}`}>▶ 繼續上課 · {nextVideo.title}</a>}
          </div>
          <div className="ring">
            <svg width="210" height="210" viewBox="0 0 210 210" aria-hidden="true">
              <circle cx="105" cy="105" r="92" fill="none" stroke="var(--ring-track)" strokeWidth="14" />
              <circle cx="105" cy="105" r="92" fill="none" stroke="var(--gold)" strokeWidth="14" strokeLinecap="round" strokeDasharray={dash} strokeDashoffset={offset} transform="rotate(-90 105 105)" />
            </svg>
            <div className="mid"><b className="numt">{pct}%</b><small>整體進度</small></div>
          </div>
        </div>

        <div className="sect-t">課程章節</div>
        <div className="chapters">
          {chapters.length === 0 && <div className="empty">課程單元即將上線 🎼</div>}
          {chapters.map((ch, i) => {
            const vs = videos.filter(v => v.chapter_id === ch.id);
            const chDone = vs.filter(v => progMap[v.id]?.completed).length;
            const firstUndone = vs.find(v => !progMap[v.id]?.completed) || vs[0];
            const isNow = nextVideo && vs.some(v => v.id === nextVideo.id);
            return (
              <a key={ch.id} className="ch" href={firstUndone ? `/classroom/watch?v=${firstUndone.id}` : "/classroom/watch"}>
                <div className="n">{roman[i] || i + 1}</div>
                <div className="t">{ch.title}<small>{vs.length ? `${vs.length} 單元` : "準備中"}{vs.length ? ` · 已完成 ${chDone}/${vs.length}` : ""}</small></div>
                <div className={"s" + (isNow ? " now" : "")}>{isNow ? "繼續 →" : chDone === vs.length && vs.length ? "已完成" : "前往 →"}</div>
              </a>
            );
          })}
        </div>

        <div className="grid2">
          <div className="tile">
            <h4>AI 練功房</h4>
            <p>{hasSubscription ? "用互動遊戲練音感與節奏，把剛學的變成反射動作。" : "課程包附贈的互動練習，升級即可解鎖。"}</p>
            <a className="link" href={hasSubscription ? "/classroom/watch" : "/#pricing"}>{hasSubscription ? "進入練功房 →" : "了解課程包 →"}</a>
          </div>
          <div className="tile">
            <h4>我的資料與訂單</h4>
            <p>學員資料（鋼琴程度、練習器材）、購課紀錄與帳號設定，都在這裡管理。</p>
            <a className="link" href="/classroom/account">前往設定 →</a>
          </div>
        </div>
      </div>

      <div className="keys" aria-hidden="true">{Array.from({ length: 24 }).map((_, i) => <i key={i} />)}</div>
      <button className="signout" onClick={handleLogout}>登出</button>
    </div>
  );
}

const HUB_CSS = `
.hub{
  --bg1:#1c2438; --bg2:#0e1118; --bg3:#090b10;
  --ink:#ece7db; --ink-soft:#a9a496; --ink-faint:#8f8a7d;
  --gold:#e8c583; --gold-line:rgba(232,197,131,.55);
  --card:rgba(255,255,255,.05); --card-a:rgba(255,255,255,.07); --card-b:rgba(255,255,255,.02);
  --line:rgba(255,255,255,.16); --line-soft:rgba(255,255,255,.15);
  --cta-bg:#e8c583; --cta-ink:#241a08;
  --glow:rgba(232,197,131,.16);
  --key-a:#171b22; --key-b:#0c0e13; --key-black:#05070b; --key-line:rgba(0,0,0,.55); --keys-op:.5;
  --ring-track:rgba(255,255,255,.11);
  --cta-shadow:0 12px 40px -12px rgba(232,197,131,.55);
  --av-a:#e8c583; --av-b:#b8894a; --av-ink:#2a1e0a;
  --tgl-bg:rgba(255,255,255,.07); --tgl-line:rgba(255,255,255,.2); --tgl-ink:#e8c583;
  --serif:"Songti TC","Noto Serif TC",Georgia,serif;
  min-height:100vh; position:relative; overflow-x:hidden; padding-bottom:80px;
  color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang TC","Noto Sans TC",sans-serif;
  background:radial-gradient(120% 90% at 82% -10%,var(--bg1) 0%,var(--bg2) 46%,var(--bg3) 100%);
  transition:background .5s ease,color .35s ease;
}
@media (prefers-color-scheme:light){ .hub:not([data-theme]){
  --bg1:#ffffff; --bg2:#f7faff; --bg3:#edf3ff;
  --ink:#15233f; --ink-soft:#4d5a72; --ink-faint:#8590a4;
  --gold:#2563eb; --gold-line:rgba(37,99,235,.42);
  --card:rgba(255,255,255,.72); --card-a:#ffffff; --card-b:rgba(238,244,255,.55);
  --line:rgba(37,99,235,.2); --line-soft:rgba(30,50,95,.12);
  --cta-bg:#2563eb; --cta-ink:#ffffff;
  --glow:rgba(37,99,235,.13);
  --key-a:#ffffff; --key-b:#e8f0fc; --key-black:#1a2b4d; --key-line:rgba(37,99,235,.16); --keys-op:.75;
  --ring-track:rgba(37,99,235,.15);
  --cta-shadow:0 14px 38px -14px rgba(37,99,235,.5);
  --av-a:#4f8cff; --av-b:#2563eb; --av-ink:#ffffff;
  --tgl-bg:rgba(37,99,235,.09); --tgl-line:rgba(37,99,235,.24); --tgl-ink:#2563eb;
}}
.hub[data-theme="light"]{
  --bg1:#ffffff; --bg2:#f7faff; --bg3:#edf3ff;
  --ink:#15233f; --ink-soft:#4d5a72; --ink-faint:#8590a4;
  --gold:#2563eb; --gold-line:rgba(37,99,235,.42);
  --card:rgba(255,255,255,.72); --card-a:#ffffff; --card-b:rgba(238,244,255,.55);
  --line:rgba(37,99,235,.2); --line-soft:rgba(30,50,95,.12);
  --cta-bg:#2563eb; --cta-ink:#ffffff;
  --glow:rgba(37,99,235,.13);
  --key-a:#ffffff; --key-b:#e8f0fc; --key-black:#1a2b4d; --key-line:rgba(37,99,235,.16); --keys-op:.75;
  --ring-track:rgba(37,99,235,.15);
  --cta-shadow:0 14px 38px -14px rgba(37,99,235,.5);
  --av-a:#4f8cff; --av-b:#2563eb; --av-ink:#ffffff;
  --tgl-bg:rgba(37,99,235,.09); --tgl-line:rgba(37,99,235,.24); --tgl-ink:#2563eb;
}
.hub *{box-sizing:border-box}
.hub a{text-decoration:none; color:inherit}
.hub .numt{font-variant-numeric:tabular-nums}
.hub .glow{position:absolute; top:-160px; right:-120px; width:520px; height:520px; border-radius:50%; background:radial-gradient(circle,var(--glow),transparent 62%); pointer-events:none}
.hub nav{display:flex; align-items:center; justify-content:space-between; padding:22px clamp(20px,5vw,60px); position:relative; z-index:3}
.hub nav .r{display:flex; align-items:center; gap:20px; font-size:14px}
.hub nav .r a{color:var(--ink-soft); transition:.2s}
.hub nav .r a:hover{color:var(--ink)}
.hub .toggle{width:40px;height:40px;border-radius:50%;border:1px solid var(--tgl-line);background:var(--tgl-bg);color:var(--tgl-ink);display:grid;place-items:center;cursor:pointer;transition:.25s;font-size:16px}
.hub .toggle:hover{transform:rotate(-18deg)}
.hub .av{width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,var(--av-a),var(--av-b));display:grid;place-items:center;color:var(--av-ink);font-weight:800;font-size:14px}
.hub .wrap{max-width:1080px; margin:0 auto; padding:14px clamp(20px,5vw,60px) 0; position:relative; z-index:2}
.hub .eyebrow{font-size:12px; letter-spacing:.34em; text-transform:uppercase; color:var(--gold); font-weight:600}
.hub .hero{display:grid; grid-template-columns:1.4fr .85fr; gap:34px; align-items:center; margin:20px 0 48px}
.hub .hero h1{font-family:var(--serif); font-weight:600; font-size:clamp(28px,5vw,48px); line-height:1.14; margin:14px 0 12px; text-wrap:balance}
.hub .hero h1 span{color:var(--gold); font-style:italic}
.hub .hero p{color:var(--ink-soft); font-size:15px; max-width:44ch; line-height:1.72}
.hub .cta{display:inline-flex; align-items:center; gap:10px; margin-top:24px; background:var(--cta-bg); color:var(--cta-ink); font-weight:700; padding:14px 26px; border-radius:100px; font-size:15px; box-shadow:var(--cta-shadow); transition:transform .2s}
.hub .cta:hover{transform:translateY(-2px)}
.hub .ring{position:relative; width:210px; height:210px; margin:0 auto}
.hub .ring .mid{position:absolute; inset:0; display:grid; place-content:center; text-align:center}
.hub .ring .mid b{font-family:var(--serif); font-size:46px; color:var(--ink); line-height:1}
.hub .ring .mid small{color:var(--ink-soft); font-size:12px; letter-spacing:.1em; text-transform:uppercase; margin-top:5px; display:block}
.hub .sect-t{font-family:var(--serif); font-size:23px; color:var(--ink); margin-bottom:16px; display:flex; align-items:baseline; gap:12px}
.hub .sect-t::after{content:""; flex:1; height:1px; background:linear-gradient(90deg,var(--gold-line),transparent)}
.hub .chapters{display:flex; flex-direction:column; gap:10px; margin-bottom:48px}
.hub .empty{padding:22px; text-align:center; color:var(--ink-faint); border:1px dashed var(--line); border-radius:14px; font-size:14px}
.hub .ch{display:grid; grid-template-columns:44px 1fr auto; gap:18px; align-items:center; padding:16px 20px; background:var(--card); border:1px solid var(--line-soft); border-radius:14px; transition:.2s; cursor:pointer}
.hub .ch:hover{border-color:var(--gold-line); transform:translateX(3px)}
.hub .ch .n{font-family:var(--serif); font-size:22px; color:var(--gold); text-align:center}
.hub .ch .t{font-weight:600; font-size:15.5px; color:var(--ink)}
.hub .ch .t small{display:block; color:var(--ink-faint); font-weight:400; font-size:12.5px; margin-top:2px}
.hub .ch .s{font-size:12px; color:var(--ink-faint); white-space:nowrap}
.hub .ch .s.now{color:var(--gold); font-weight:600}
.hub .grid2{display:grid; grid-template-columns:1fr 1fr; gap:16px}
.hub .tile{padding:24px; border-radius:16px; border:1px solid var(--line); background:linear-gradient(160deg,var(--card-a),var(--card-b))}
.hub .tile h4{font-family:var(--serif); font-size:19px; margin-bottom:6px; color:var(--ink)}
.hub .tile p{color:var(--ink-soft); font-size:13.5px; line-height:1.65}
.hub .tile .link{color:var(--gold); font-weight:600; font-size:13.5px; margin-top:14px; display:inline-block}
.hub .keys{position:absolute; bottom:0; left:0; right:0; height:60px; display:flex; opacity:var(--keys-op); pointer-events:none}
.hub .keys i{flex:1; border-right:1px solid var(--key-line); background:linear-gradient(var(--key-a),var(--key-b))}
.hub .keys i:nth-child(2n)::after{content:""; display:block; width:58%; height:62%; margin:0 auto; background:var(--key-black); border-radius:0 0 3px 3px}
.hub .signout{position:fixed; bottom:16px; right:16px; z-index:5; background:var(--tgl-bg); border:1px solid var(--tgl-line); color:var(--ink-soft); font-size:12px; padding:7px 14px; border-radius:100px; cursor:pointer; font-family:inherit}
.hub .signout:hover{color:var(--ink)}
@media (prefers-reduced-motion:reduce){ .hub *{transition:none!important} }
@media(max-width:760px){ .hub .hero{grid-template-columns:1fr} .hub .grid2{grid-template-columns:1fr} .hub nav .r a{display:none} .hub .ring{margin-top:8px} }
`;
