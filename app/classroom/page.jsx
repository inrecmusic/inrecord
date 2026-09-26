"use client";
import { useEffect, useMemo, useState } from "react";
import { useAnnouncements, HubAnnouncements, ImportantDialog } from "@/components/Announcements";
import { supabase } from "@/lib/supabase";
import { isProfileCoreComplete } from "@/lib/student-profile";
import { announcementSummary } from "@/lib/announcement-md";
import { isUnread } from "@/lib/announcements-view";
import { buildHubModel, greetingLine, relativeDayLabel, joinCn } from "@/lib/hub-view";
import ProfileOnboarding from "@/components/ProfileOnboarding";
import { HUB_CSS } from "./hub-css";

const F = `var(--type-body)`;
const WEEKDAY = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

/* 小圖示（inline SVG，不用 emoji） */
const Play = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg>;
const Lock = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1zm2 0h6V8a3 3 0 0 0-6 0v2z" fill="currentColor" /></svg>;
const Cal = () => <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M7 2h2v2h6V2h2v2h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3V2zm13 8H4v10h16V10z" fill="currentColor" /></svg>;
const Bell = () => <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M12 2a6 6 0 0 0-6 6v4.6L4 16v1h16v-1l-2-3.4V8a6 6 0 0 0-6-6zm0 20a2.5 2.5 0 0 0 2.4-2H9.6A2.5 2.5 0 0 0 12 22z" fill="currentColor" /></svg>;
const Arrow = () => <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M5 12h12m-5-6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const Check = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const GAME_GLYPH = ["♩", "♫", "⇄", "♪", "♬"];

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
  const [announcements, setAnnouncements] = useState([]);
  const [earlyAccess, setEarlyAccess]     = useState(undefined); // bootstrap 帶回：false=非早鳥（9/30 前無正課可播）；完整上架後不再回傳
  const ann = useAnnouncements(announcements); // 最新公告區＋重要卡片
  const [chapters, setChapters]           = useState([]);
  const [videos, setVideos]               = useState([]);
  const [progress, setProgress]           = useState([]);
  const [openedGames, setOpenedGames]     = useState(null); // 已上傳的遊戲標題（有遊戲存取才查；null=不知道）
  const [nowMs, setNowMs]                 = useState(null); // 資料到齊後才定「現在」（render 不碰 Date.now，避免 hydration 不一致）
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
          setProfile(d.profile || d.prefill || {});
          setAnnouncements(d.announcements || []);
          setEarlyAccess(d.earlyAccess);
          setNowMs(Date.now());
          // 練功房卡片要知道哪些遊戲已上傳（best-effort，失敗就當不知道）
          if (d.hasSubscription) {
            fetch("/api/classroom/games", { headers: { Authorization: `Bearer ${accessToken}` } })
              .then((g) => (g.ok ? g.json() : null)).then((g) => setOpenedGames((g?.games || []).map((x) => x.title || "")))
              .catch(() => {});
          }
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

  const model = useMemo(
    () => buildHubModel({ chapters, videos, progress, earlyAccess, nowMs: nowMs ?? 0, openedGames }),
    [chapters, videos, progress, earlyAccess, nowMs, openedGames]
  );

  /* gates */
  if (loading || (hasPurchased && token && !profileLoaded)) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0c0f16" }}>
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
    return <ProfileOnboarding token={token} initial={profile} onDone={(p) => setProfile(p)} fontFamily={F} />;
  }

  /* 衍生資料 */
  const name = (profile && profile.real_name) || user?.email?.split("@")[0] || "同學";
  const effectiveDark = theme ? theme === "dark" : sysDark; // 目前實際是深色嗎（logo 用白版）
  const { hero, lastWatched, opened, watched, pct, weekCount, lessons, currentChapter, games, nextOpen, firstChapter } = model;
  const ringLen = 283, ringOff = Math.round(ringLen * (1 - Math.min(100, pct) / 100));
  const latestAnn = ann.sorted[0] || null;
  const dateLabel = nowMs ? (() => { const d = new Date(nowMs + 8 * 3_600_000); return `${d.getUTCMonth() + 1} 月 ${d.getUTCDate()} 日　${WEEKDAY[d.getUTCDay()]}`; })() : "";
  const chapterCount = model.chapters.filter((c) => !c.isAppendix).length;
  const appxCount = model.chapters.length - chapterCount;
  const showLockedPoster = !hero;

  return (
    <div className="hub" data-theme={theme || undefined}>
      <style>{HUB_CSS}</style>
      <ImportantDialog ann={ann} variant="hub" />

      <header className="nav">
        <div className="wrap">
          <a className="logo" href="/classroom" aria-label="InRecord"><img src={effectiveDark ? "/logo-wordmark-white.png" : "/logo-wordmark.png"} alt="InRecord" /></a>
          <nav className="links" aria-label="教室">
            <a className="on" href="/classroom" aria-current="page">儀表板</a>
            <a href="/classroom/watch">音樂教室</a>
            <a href="/classroom/account">帳號</a>
          </nav>
          <div className="sp" />
          {ann.sorted.length > 0 && (
            <a className="icon" href="#announcements" aria-label={ann.unread ? `公告，${ann.unread} 則未讀` : "公告"}>
              <Bell />{ann.unread > 0 && <span className="dot">{ann.unread}</span>}
            </a>
          )}
          <button className="icon" onClick={toggleTheme} aria-label={effectiveDark ? "切換為淺色模式" : "切換為深色模式"}>{effectiveDark ? "☾" : "☀"}</button>
          <a className="me" href="/classroom/account"><span className="nm">{name}</span><span className="av" aria-hidden="true">{name.slice(0, 1)}</span></a>
        </div>
      </header>

      <main className="wrap">
        <section className="greet">
          <img src="/mascot-wave-v2.png" alt="" width="74" height="74" />
          <div>
            <h1 className="serif">{greeting}，{name}。</h1>
            <p>{greetingLine(model, earlyAccess)}</p>
          </div>
          {dateLabel && <div className="date">{dateLabel}</div>}
        </section>

        <section className="hero">
          {hero ? (
            <a className="poster" href={`/classroom/watch?v=${hero.video.id}`} aria-label={`${watched ? "繼續上課" : "開始上課"}：${hero.ref}${hero.no ? `　${hero.name}` : ""}`}>
              <div className="top">
                {hero.chapterNew && <span className="chip gold">{joinCn(hero.chapterLabel, hero.chapterNewLabel)}</span>}
                {hero.duration && <span className="chip dark">{hero.duration}</span>}
              </div>
              <span className="play" aria-hidden="true"><Play /></span>
              <div className="txt">
                <div className="eyebrow">接著看　{hero.chapterLabel}{hero.positionInChapter ? `　第 ${hero.positionInChapter} 單元` : ""}</div>
                <h2 className="serif">{hero.no && <span className="no num">{hero.no}</span>}{hero.name}</h2>
                {lastWatched && lastWatched.video.id !== hero.video.id && (
                  <div className="meta"><span>上次看到 <b>{lastWatched.no}　{lastWatched.name}</b></span><span>{lastWatched.when}</span></div>
                )}
                <div className="row">
                  <span className="btn gold"><Play />{watched ? "繼續上課" : "開始上課"}</span>
                  {hero.durationShort && <div className="prog"><span>{hero.resumeAt ? `上次停在 ${hero.resumeLabel}` : "從頭開始"}</span><div className="bar"><i style={{ width: `${hero.resumePct}%` }} /></div><span>{hero.durationShort}</span></div>}
                </div>
              </div>
            </a>
          ) : (
            <div className="poster locked">
              <div className="txt">
                <div className="eyebrow">{earlyAccess === false ? "開課前" : "準備中"}</div>
                <h2 className="serif">{earlyAccess === false ? "第一批章節 9/30 開放" : "第一堂課很快和你見面"}</h2>
                <p>{earlyAccess === false ? "開放後從這裡接著上就可以，我們也會另外通知你。" : "影片上架後，這裡會直接接到下一個單元。"}</p>
              </div>
            </div>
          )}

          <div className="side">
            <div className="card progress">
              <h3>學習進度</h3>
              <div className="cap">以目前開放的單元計算</div>
              <div className="top">
                <div className="ring" role="img" aria-label={`已看 ${pct}%`}>
                  <svg viewBox="0 0 100 100"><circle className="t" cx="50" cy="50" r="45" /><circle className="v" cx="50" cy="50" r="45" strokeDasharray={ringLen} strokeDashoffset={ringOff} /></svg>
                  <div className="mid"><b className="num">{pct}%</b><small>已看</small></div>
                </div>
                <div>
                  <div className="big num">{watched} <small>/ {opened}</small></div>
                  <div className="lbl">{opened ? `已開放 ${opened} 支，看了 ${watched} 支` : earlyAccess === false ? "第一批章節 9/30 開放" : "影片上架後就會開始計算"}</div>
                </div>
              </div>
              <div className="stats">
                <div><b className="num">{weekCount}<small>課</small></b><span>最近 7 天看完</span></div>
                {firstChapter && <div><b className="num">{firstChapter.done}<small>/{firstChapter.units}</small></b><span>第一章進度</span></div>}
                {currentChapter && currentChapter.num !== 1
                  ? <div><b className="num">{currentChapter.done}<small>/{currentChapter.units}</small></b><span>{currentChapter.name}進度</span></div>
                  : <div><b className="num">{chapterCount}<small>章</small></b><span>章節總數</span></div>}
              </div>
              {nextOpen && (
                <div className="nextopen"><Cal /><span>下一次開放：<b>{nextOpen.label}</b>　{nextOpen.date}{nextOpen.inDays > 0 ? `（${nextOpen.inDays} 天後）` : "（今天）"}</span></div>
              )}
            </div>

            {latestAnn ? (
              <a className="card anncard" href="#announcements" onClick={(e) => { e.preventDefault(); ann.openItem(latestAnn.id); }}>
                <span className="tag"><Bell />公告　{relativeDayLabel(Date.parse(latestAnn.created_at), nowMs)}{isUnread(latestAnn, ann.readState) && <><span className="unread" aria-hidden="true" /><span className="sr">未讀</span></>}</span>
                <h3>{latestAnn.title}</h3>
                <p>{announcementSummary(String(latestAnn.body || "").split(/\n\s*\n/)[0], 64)}</p>
                <span className="more">看全文 <Arrow /></span>
                <img src="/mascot-wave-v2.png" alt="" />
              </a>
            ) : (
              <div className="card plain">
                <h3>我的資料與訂單</h3>
                <p>學員資料、購課紀錄與帳號設定，都在這裡管理。</p>
                <a className="more" href="/classroom/account">前往設定 <Arrow /></a>
              </div>
            )}
          </div>
        </section>

        {lessons.length > 0 && currentChapter && (
          <section className="sec" aria-labelledby="sec-lessons">
            <div className="sec-h">
              <h2 id="sec-lessons" className="serif">{currentChapter.name}　{currentChapter.main}</h2>
              <span className="cap">{currentChapter.units} 個單元{currentChapter.isNew ? `／${currentChapter.newLabel}` : ""}</span>
              <a className="more" href={currentChapter.overviewHref}>從頭看這章 <Arrow /></a>
            </div>
            <div className="lessons">
              {lessons.map((l) => (
                <a key={l.id} className={`lesson ${l.state}`} href={l.state === "locked" ? "/classroom/watch" : l.href}>
                  <div className="cover">
                    <span className="no num">{l.no || "—"}</span>
                    {l.duration && <span className="dur">{l.duration}</span>}
                    <i className="keys-tex" aria-hidden="true" />
                    <span className="pm" aria-hidden="true">{l.state === "done" ? <Check /> : l.state === "locked" ? <Lock /> : <Play />}</span>
                  </div>
                  <div className="body">
                    <h3>{l.name}</h3>
                    <div className="meta">
                      {l.state === "next" ? <span className="chip gold">接著看</span> : l.state === "done" ? <span className="chip">已看完</span> : l.state === "locked" ? <span className="chip lock">尚未上架</span> : <span className="chip">還沒看</span>}
                      <span>{l.duration}</span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        <section className="sec" aria-labelledby="sec-chapters">
          <div className="sec-h">
            <h2 id="sec-chapters" className="serif">課程章節</h2>
            <span className="cap">{chapterCount} 章{appxCount ? `、附錄 ${appxCount} 篇` : ""}／10/31 全部開放</span>
          </div>
          {model.chapters.length === 0 ? (
            <div className="card plain"><p>課程單元即將上線。</p></div>
          ) : (
            <div className="chapters">
              {model.chapters.map((c) => (
                <a key={c.id} className={`chapter ${c.isNew ? "new" : c.state}${c.isAppendix ? " appx" : ""}`} href={c.href}
                   aria-label={`${c.name}　${c.main}${c.sub ? `：${c.sub}` : ""}，${c.state === "locked" ? c.note : c.isNew ? "新上架" : c.state === "done" ? "已看完" : c.state === "progress" ? c.note : "還沒開始"}`}>
                  <div className="cover">
                    <span className={`roman num${c.isAppendix ? " sm" : ""}`}>{c.label}</span>
                    {c.state === "locked" ? <span className="chip lock"><Lock />{c.note}</span>
                      : c.isNew ? <span className="chip new">新上架</span>
                      : c.state === "done" ? <span className="chip">已看完</span>
                      : c.state === "progress" ? <span className="chip gold">進行中</span>
                      : <span className="chip">還沒開始</span>}
                    <i className="keys-tex" aria-hidden="true" />
                  </div>
                  <div className="body">
                    <h3>{c.main}{c.sub && <small>{c.sub}</small>}</h3>
                    {(c.state === "progress" || c.state === "done" || (c.state === "ready" && c.units)) && <div className="bar"><i style={{ width: `${c.pct}%` }} /></div>}
                    <div className="foot">
                      <span>{c.state === "locked" ? (c.isAppendix ? "講義" : c.units ? `共 ${c.units} 單元` : "單元準備中") : c.note}</span>
                      {c.state !== "locked" && <span className="go">{c.state === "done" ? "再看一次" : c.state === "progress" ? "接著看" : c.isNow ? "從這裡開始" : "開始"} <Arrow /></span>}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>

        <section className="sec" aria-labelledby="sec-games">
          <div className="sec-h">
            <h2 id="sec-games" className="serif">練功房</h2>
            <span className="cap">邊玩邊複習，把剛學的變成反射動作</span>
            <a className="more" href={hasSubscription ? "/classroom/watch" : "/#pricing"}>{hasSubscription ? "全部遊戲" : "了解課程包"} <Arrow /></a>
          </div>
          <div className="games-wrap">
            <div className="games">
              {hasSubscription && games.length > 0 ? games.map((g, i) => (
                <a key={g.name} className={`game ${g.opened ? "open" : "soon"}`} href={g.opened ? g.href : "/classroom/watch"}>
                  <div className="tile" aria-hidden="true"><span>{GAME_GLYPH[i % GAME_GLYPH.length]}</span></div>
                  <div className="body">
                    <h3>{g.name}</h3>
                    <p>{g.chapterLabel}　{g.after} 之後</p>
                    {g.opened ? <span className="chip gold">可以玩了</span> : <span className="chip">即將上線</span>}
                  </div>
                </a>
              )) : (
                <div className="card plain" style={{ gridColumn: "1 / -1" }}>
                  <h3>{hasSubscription ? "互動遊戲跟著章節上架" : "課程包附贈的互動練習"}</h3>
                  <p>{hasSubscription ? "每一章的遊戲會接在對應單元後面，上架後這裡會直接列出來。" : "用互動遊戲練音感與節奏，升級課程包即可解鎖。"}</p>
                  <a className="more" href={hasSubscription ? "/classroom/watch" : "/#pricing"}>{hasSubscription ? "進入音樂教室" : "了解課程包"} <Arrow /></a>
                </div>
              )}
            </div>
            <div className="mascot-stage" aria-hidden="true">
              <div className="bubble">練完這章的遊戲，剛學的就會變成反射動作。</div>
              <img src="/mascot-grand-v1.webp" alt="" />
            </div>
          </div>
        </section>

        {ann.sorted.length > 0 && <div id="announcements"><HubAnnouncements ann={ann} /></div>}
      </main>

      <div className="wrap">
        {/* 真實鋼琴鍵：52 個白鍵＝完整 88 鍵鋼琴；黑鍵依八度落在 C#/D#/F#/G#/A#（白鍵 index%7 ∈ {0,1,3,4,5}）。窄螢幕只顯示前 3 個八度。*/}
        <div className="keys" aria-hidden="true">{Array.from({ length: 52 }).map((_, i) => <i key={i} className={[0, 1, 3, 4, 5].includes(i % 7) ? "bk" : ""} />)}</div>
        <div className="foot">
          <span>InRecord 音樂刻　從零開始學鋼琴</span>
          <span className="links"><a href="/classroom/account">帳號與訂單</a><button type="button" onClick={handleLogout}>登出</button></span>
        </div>
      </div>
    </div>
  );
}
