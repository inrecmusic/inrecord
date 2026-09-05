"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAnnouncements, AnnouncementsBell, AnnouncementsStrip, AnnouncementsDrawer, ImportantDialog } from "@/components/Announcements";
import { formatSeconds, sortNotes } from "@/lib/notes-format";
import { isProfileCoreComplete } from "@/lib/student-profile";
import ProfileOnboarding from "@/components/ProfileOnboarding";
import NotesTab from "@/components/classroom/NotesTab";
import GamesTab from "@/components/classroom/GamesTab";
import AssignmentTab from "@/components/classroom/AssignmentTab";
import RatingTab from "@/components/classroom/RatingTab";
import CommentsSection from "@/components/classroom/CommentsSection";
import MaterialsSection from "@/components/classroom/MaterialsSection";
import { freshToken, openMaterialById, getDeviceId, F } from "@/components/classroom/shared";

/* ── Helpers ─────────────────────────────────────────────────────────────────── */
function fmtDur(sec) {
  if (!sec) return "";
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

// 側欄展開項的內容類型對應。順序固定：先看的、再練的、最後交的——
// 位置一致，學員掃第二個單元時不用重新找。key 對應 lib/unit-content.js 的 kind。
const UNIT_ICONS = [
  { key: "handout",    emoji: "📎", label: "講義下載" },
  { key: "score",      emoji: "🎼", label: "樂譜下載" },
  { key: "game",       emoji: "🎮", label: "互動遊戲" },
  { key: "assignment", emoji: "📝", label: "作業繳交" },
];

// 尚未上傳影片的單元／尚無單元的章節顯示此文案。改期只需改這一行。
const COMING_SOON = "預計 9/30 上架";
// 各章的預計上架日（章號 → 文案）；章號取自章節標題開頭的 ChN。
const CHAPTER_COMING_SOON = { 2: "預計 9/9 上架", 3: "預計 9/16 上架", 4: "預計 9/23 上架" };
// 個別單元的預計上架日（優先於章、章優先於 COMING_SOON）；key = 單元標題開頭編號。
// 影片實際掛上去後這一列就不會顯示了（只有 !playable 才印），所以上架後不必回來刪。
const UNIT_COMING_SOON = { "1-3": "預計 9/3 上架", "1-4": "預計 9/5 上架", "1-5": "預計 9/5 上架" };
function comingSoonFor(title, chNum) {
  return UNIT_COMING_SOON[unitNo(title)] || CHAPTER_COMING_SOON[chNum] || COMING_SOON;
}

// 課綱規劃中、尚未上傳的互動遊戲：灰色不可點，hover 顯示預計上架。
// 接在對應單元下方（見 PLANNED_CHAPTER_GAMES.after），故縮排與單元的子項目一致。
function PlannedGameRow({ name }) {
  return (
    <div className="unit-row" title={COMING_SOON} style={{
      display: "flex", alignItems: "flex-start", gap: 8,
      padding: "7px 8px 7px 20px", borderRadius: 9,
    }}>
      <span style={{ fontSize: 12, flexShrink: 0, marginTop: 1, opacity: .75 }}>🎮</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, lineHeight: 1.45, color: "#94a3b8" }}>{name}</div>
        <div className="cs-hint" style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>互動遊戲 · {COMING_SOON}</div>
      </div>
    </div>
  );
}
// 課綱規劃的互動遊戲總數（首頁課程大綱 8 章共 9 款）。遊戲陸續上傳期間，側欄總覽先照課綱顯示；
// 實際上傳數超過時顯示實際數。全部上傳完（≥9）後此常數自然失效。
const PLANNED_GAMES = 9;
// 課綱規劃的各章互動遊戲名稱（依章節標題 ChN 對應）。上傳後：該章任一單元掛了同名遊戲，
// 對應的規劃列就自動消失（比對用 includes，容忍上傳時加副標）。
// after = 接在哪個單元之後（比對單元標題開頭的編號，如 "1-2"）。該單元尚未上架時退回章節最後一列。
const PLANNED_CHAPTER_GAMES = {
  1:  [{ name: "Do 給你找",       after: "1-2" }],
  2:  [{ name: "音名快閃",        after: "2-1" }, { name: "唱名階梯", after: "2-2" }],
  4:  [{ name: "節奏打點師",      after: "4-5" }],
  6:  [{ name: "和弦辨識家",      after: "6-4" }],
  7:  [{ name: "情緒調色盤",      after: "7-1" }],
  8:  [{ name: "分解和弦連連看",  after: "8-4" }],
  9:  [{ name: "和弦神預測",      after: "9-3" }],
  10: [{ name: "自由創作坊",      after: "10-6" }],
};

// 單元標題開頭的編號："1-2 尋找起始音 Do" → "1-2"
function unitNo(title) { return String(title || "").trim().split(/\s+/)[0]; }

// Bunny Stream 影片進度追蹤需要 player.js（Bunny CDN 提供）。注入一次、快取 Promise；
// 載入失敗就放棄（不擋影片播放）。用 window.playerjs.Player(iframe) 監聽 timeupdate。
let _playerJsPromise = null;
function loadPlayerJs() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.playerjs) return Promise.resolve();
  if (_playerJsPromise) return _playerJsPromise;
  _playerJsPromise = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://assets.mediadelivery.net/playerjs/playerjs-latest.min.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
  return _playerJsPromise;
}

/* ── Main ────────────────────────────────────────────────────────────────────── */
export default function ClassroomPage() {
  const [user, setUser]                   = useState(null);
  const [token, setToken]                 = useState("");
  const [hasPurchased, setHasPurchased]   = useState(false);
  const [loadError, setLoadError]         = useState(false); // bootstrap 載入失敗→顯示重試，不誤判未購買
  const [hasSubscription, setHasSubscription] = useState(false);
  const [subDaysLeft, setSubDaysLeft]     = useState(0);
  const [loading, setLoading]             = useState(true);

  const [profile, setProfile]             = useState(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileErr, setProfileErr]       = useState(false);

  const [chapters, setChapters]           = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const ann = useAnnouncements(announcements); // 鈴鐺／提示條／抽屜／重要卡片共用狀態
  const [contentItems, setContentItems]   = useState({});
  const [contentStats, setContentStats]   = useState(null);
  const [pendingGameId, setPendingGameId] = useState(null);
  const [itemErr, setItemErr]             = useState("");
  const [videos, setVideos]               = useState([]);
  const [currentVideo, setCurrentVideo]   = useState(null);
  const [embedSrc, setEmbedSrc] = useState("");
  const [progress, setProgress]           = useState([]);
  const [tab, setTab]                     = useState("rating");

  const gameCacheRef                      = useRef({});
  const playerCtrlRef = useRef(null); // { getSeconds, seek, pause, play }
  const [isTablet, setIsTablet]           = useState(false);
  const [isPhone, setIsPhone]             = useState(false);
  const [drawerOpen, setDrawerOpen]       = useState(false);
  useEffect(() => {
    const check = () => {
      setIsTablet(window.innerWidth <= 1024);
      setIsPhone(window.innerWidth <= 640);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  /* auth + purchase + subscription */
  useEffect(() => {
    async function init() {
      try {
        if (!supabase) { window.location.href = "/classroom/login"; return; }
        const { data: { user: u } } = await supabase.auth.getUser();
        if (!u) { window.location.href = "/classroom/login"; return; }
        const { data: { session } } = await supabase.auth.getSession();
        const accessToken = session?.access_token || "";
        setUser(u);
        setToken(accessToken);
        try {
          // 單一往返取回進場所需全部資料（購課/遊戲/學員資料/章節/影片/進度/公告，含裝置上限檢查），
          // 取代原本 verify×2 → course+progress → profile 的三波瀑布。
          const r = await fetch(`/api/classroom/bootstrap?player=1&device_id=${getDeviceId()}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d.error || "bootstrap_failed");
          setHasPurchased(!!d.hasPurchased);
          setHasSubscription(!!d.hasSubscription);
          setSubDaysLeft(d.subscription?.daysLeft || 0);
          setChapters(d.chapters || []);
          setVideos(d.videos || []);
          setProgress(d.progress || []);
          setAnnouncements(d.announcements || []);
          setContentItems(d.contentItems || {});
          setContentStats(d.contentStats || null);
          const vids = d.videos || [];
          if (vids.length) {
            const pm = Object.fromEntries((d.progress || []).map(p => [p.video_id, p]));
            // 來自儀表板的 ?v=<單元id> 優先選中；否則預設第一個「未完成且可播放」、再否則第一支可播放、再否則第一支
            // （尚未上傳影片的空單元排在前面，不能讓預設落在佔位圖上）
            const wantId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("v") : null;
            const playable = v => !!(v.bunny_video_id || v.vimeo_id);
            setCurrentVideo((wantId && vids.find(v => v.id === wantId)) || vids.find(v => playable(v) && !pm[v.id]?.completed) || vids.find(playable) || vids[0]);
          }
          setProfile(d.profile || d.prefill || {});
        } catch {
          setLoadError(true); // 載入失敗≠未購買：顯示重試畫面，不能把已購課學員推到「尚未購買」推銷頁
          setProfileErr(true); // fail-open：資料載入失敗不把已購課使用者卡在首次引導
        } finally {
          setProfileLoaded(true);
        }
      } catch {
        window.location.href = "/classroom/login";
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  /* token 過期策略：token state 只在進頁設一次（不隨刷新更新——否則 course/player/embed
     等以 token 為依賴的 effect 每小時重跑，影片會重載、單元被重選）。所有「晚於進頁」的
     fetch（寫入與切單元後的讀取）一律用 freshToken() 於呼叫當下取最新 token。 */

  /* Vimeo player time-based progress tracking (every 10s) */
  useEffect(() => {
    if (!currentVideo?.vimeo_id || !token) return;
    const videoId = currentVideo.id;
    let interval;
    let player;
    let cancelled = false;

    async function setup() {
      const { default: Player } = await import("@vimeo/player");
      if (cancelled) return;
      const iframe = document.getElementById("vimeo-player");
      if (!iframe) return;
      player = new Player(iframe);
      await player.ready();
      if (cancelled) return;

      playerCtrlRef.current = {
        getSeconds: () => player.getCurrentTime(),
        seek: (sec) => player.setCurrentTime(sec),
        pause: () => { try { player.pause(); } catch {} },
        play: () => { try { player.play(); } catch {} },
      };

      let lastTick = null; // 上次心跳的播放位置，用來算「實際播放增量」
      interval = setInterval(async () => {
        try {
          const [currentTime, duration] = await Promise.all([
            player.getCurrentTime(),
            player.getDuration(),
          ]);
          if (!duration) return;
          // 只累計「正向、且不超過心跳間隔」的位移＝實際播放；拖拉/快轉/倒轉都不計入
          const delta = lastTick == null ? 0 : Math.max(0, Math.min(15, Math.round(currentTime - lastTick)));
          lastTick = currentTime;
          const tk = await freshToken(token);
          const r = await fetch("/api/classroom/progress", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
            body: JSON.stringify({
              video_id: videoId,
              watched_seconds: Math.floor(currentTime),
              total_seconds: Math.floor(duration),
              viewed_delta: delta,
            }),
          });
          const { data } = await r.json();
          if (data) setProgress(prev => {
            const i = prev.findIndex(p => p.video_id === videoId);
            return i >= 0 ? prev.map((p, j) => j === i ? data : p) : [...prev, data];
          });
        } catch {}
      }, 10000);
    }

    setup();
    return () => { cancelled = true; playerCtrlRef.current = null; clearInterval(interval); player?.destroy(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 刻意只依 id／token 等穩定值觸發，避免物件參考變動造成重跑（2026-08-25 影片每小時重載的教訓）
  }, [currentVideo?.id, token]);

  // Bunny 影片：切換時向後端索取帶 token 的簽名 embed URL（Vimeo 不走此路徑）
  useEffect(() => {
    setEmbedSrc("");
    const vid = currentVideo?.id;
    if (!vid || !token || !currentVideo?.bunny_video_id) return;
    freshToken(token)
      .then(tk => fetch(`/api/classroom/video-embed?video_id=${vid}`, {
        headers: { Authorization: `Bearer ${tk}` },
      }))
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (data?.src) setEmbedSrc(data.src); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 刻意只依 id／token 等穩定值觸發，避免物件參考變動造成重跑（2026-08-25 影片每小時重載的教訓）
  }, [currentVideo?.id, token]);

  /* Bunny player time-based progress tracking (player.js, 每 10 秒) — 比照 Vimeo。
     正式課程影片走 Bunny，原本只有 Vimeo 有進度回報 → 側欄進度/已完成永遠 0。 */
  useEffect(() => {
    if (!currentVideo?.bunny_video_id || !token || !embedSrc) return;
    const videoId = currentVideo.id;
    let interval, cancelled = false, lastSeconds = 0, lastDuration = 0;
    let pendingViewed = 0; // 心跳間累積的實際播放秒數（拖拉不計）

    async function postProgress() {
      if (!lastDuration) return;
      const delta = pendingViewed; pendingViewed = 0; // 送出本次累積的實際播放秒數
      try {
        const tk = await freshToken(token);
        const r = await fetch("/api/classroom/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
          body: JSON.stringify({
            video_id: videoId,
            watched_seconds: Math.floor(lastSeconds),
            total_seconds: Math.floor(lastDuration),
            viewed_delta: delta,
          }),
        });
        const { data } = await r.json();
        if (data && !cancelled) setProgress(prev => {
          const i = prev.findIndex(p => p.video_id === videoId);
          return i >= 0 ? prev.map((p, j) => j === i ? data : p) : [...prev, data];
        });
      } catch {}
    }

    async function setup() {
      await loadPlayerJs();
      if (cancelled || !window.playerjs) return;
      const iframe = document.getElementById("bunny-player");
      if (!iframe) return;
      const player = new window.playerjs.Player(iframe);
      player.on("ready", () => {
        if (cancelled) return;
        playerCtrlRef.current = {
          getSeconds: () => Promise.resolve(lastSeconds),
          seek: (sec) => player.setCurrentTime(sec),
          pause: () => { try { player.pause(); } catch {} },
          play: () => { try { player.play(); } catch {} },
        };
        player.on("timeupdate", (d) => {
          const sec = d?.seconds || 0;
          // 只累計正向、小於 2 秒的位移＝正常播放推進；拖拉/快轉的大跳躍不計入
          const step = sec - lastSeconds;
          if (step > 0 && step < 2) pendingViewed += step;
          lastSeconds = sec; lastDuration = d?.duration || 0;
        });
        player.on("ended", () => { if (lastDuration) { lastSeconds = lastDuration; postProgress(); } });
        interval = setInterval(postProgress, 10000);
      });
    }

    setup();
    return () => { cancelled = true; playerCtrlRef.current = null; clearInterval(interval); };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 刻意只依 id／token 等穩定值觸發，避免物件參考變動造成重跑（2026-08-25 影片每小時重載的教訓）
  }, [currentVideo?.id, token, embedSrc]);

  function handleSelect(v) {
    setCurrentVideo(v);
    // 切單元就放棄「等清單載好再自動開遊戲」的待辦（點遊戲 icon 的路徑會在呼叫本函式之後再重設），
    // 否則跨單元殘留的 pendingGameId 會在之後回到那個單元時突然全螢幕開遊戲。
    setPendingGameId(null);
    if (isTablet) setDrawerOpen(false);
  }

  // 手風琴：展開的單元 id。一次只開一個——21 個單元全展開會讓側欄無法掃視。
  // 有影片的單元點了同時切換播放；沒影片的單元只展開（仍可下載講義樂譜）。
  function handleUnitClick(v) {
    setItemErr("");   // 換單元就清掉上一個單元的下載錯誤，否則會跟著顯示在新展開的面板裡
    if (v.bunny_video_id || v.vimeo_id) handleSelect(v);
  }

  // 點展開清單裡的項目：講義樂譜直接下載，遊戲與作業切到對應分頁。
  async function handleItemClick(e, v, item) {
    e.stopPropagation();
    if (v.bunny_video_id || v.vimeo_id) handleSelect(v);
    if (item.kind === "game") { setPendingGameId(item.id); setTab("games"); return; }
    if (item.kind === "assignment") { setTab("assignment"); return; }
    setItemErr("");
    const ok = await openMaterialById(token, item.id);
    if (!ok) setItemErr("檔案暫時無法下載，請稍後再試");
  }

  async function handleLogout() {
    await supabase?.auth.signOut();
    window.location.href = "/";
  }

  /* ── Loading ──（已購課但 profile 尚未抓完也算 loading，避免先閃教室主體再跳引導表單） */
  if (loading || (hasPurchased && token && !profileLoaded)) return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#fff", fontFamily: F }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 28, height: 28, border: "2.5px solid rgba(0,0,0,0.08)",
          borderTopColor: "#2563eb", borderRadius: "50%",
          animation: "spin .7s linear infinite", margin: "0 auto 12px",
        }} />
        <p style={{ fontSize: 14, color: "#64748b", margin: 0, fontWeight: 400 }}>載入中…</p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  /* ── Load error ──（與儀表板一致：網路/伺服器問題只提示重試） */
  if (loadError) return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f1f5f9", color: "#0f172a", textAlign: "center", padding: 32, fontFamily: F }}>
      <div>
        <div style={{ fontSize: 40, marginBottom: 14 }}>🎹</div>
        <h2 style={{ margin: "0 0 10px", fontSize: 22, fontWeight: 700 }}>教室載入時出了點問題</h2>
        <p style={{ color: "#475569", marginBottom: 24, fontSize: 15 }}>可能是網路或伺服器忙碌，請稍後再試一次。</p>
        <button onClick={() => window.location.reload()} style={{ padding: "12px 30px", background: "#2563eb", color: "#fff", border: 0, borderRadius: 980, fontWeight: 600, fontSize: 15, cursor: "pointer", fontFamily: F }}>重新整理</button>
      </div>
    </div>
  );

  /* ── No purchase ── */
  if (!hasPurchased) return (
    <div style={{
      minHeight: "100vh", display: "grid", placeItems: "center",
      background: "#f1f5f9", color: "#0f172a", textAlign: "center",
      padding: 32, fontFamily: F,
    }}>
      <div>
        <div style={{ fontSize: 56, marginBottom: 20 }}>🎹</div>
        <h2 style={{ margin: "0 0 10px", fontFamily: "var(--type-display)", fontSize: 30, fontWeight: 400, letterSpacing: "-.02em" }}>尚未購買課程</h2>
        <p style={{ color: "#475569", marginBottom: 32, fontSize: 15, lineHeight: 1.65, maxWidth: 320, margin: "0 auto 32px" }}>
          請先完成購課，即可觀看所有教學影片。
        </p>
        <a href="/#pricing" style={{
          display: "inline-block", padding: "13px 32px",
          background: "#2563eb", color: "#fff", borderRadius: 980,
          fontWeight: 600, textDecoration: "none", fontSize: 15, fontFamily: F,
        }}>
          查看課程方案
        </a>
        <div style={{ marginTop: 16 }}>
          <button onClick={handleLogout} style={{
            background: "none", border: 0, color: "#94a3b8",
            cursor: "pointer", fontSize: 13, fontFamily: F,
          }}>
            登出
          </button>
        </div>
      </div>
    </div>
  );

  // 首次引導：已購課但核心資料未填 → 先完善資料（選配可跳過）；profileErr（fetch 失敗）fail-open 放行進教室，不卡在引導
  if (hasPurchased && profileLoaded && !profileErr && !isProfileCoreComplete(profile)) {
    return <ProfileOnboarding token={token} initial={profile} onDone={(p) => setProfile(p)} fontFamily={F} />;
  }

  const progMap         = Object.fromEntries(progress.map(p => [p.video_id, p]));
  const doneCount       = progress.filter(p => p.completed).length;
  const totalCount      = videos.length;
  const pct             = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
  const chap            = chapters.find(c => c.id === currentVideo?.chapter_id);
  const currentProgEntry = currentVideo ? progMap[currentVideo.id] : null;
  const isDone          = !!currentProgEntry?.completed;
  const currentWatchPct = (currentProgEntry?.total_seconds > 0)
    ? Math.min(100, Math.round((currentProgEntry.watched_seconds / currentProgEntry.total_seconds) * 100))
    : 0;

  /* ── Classroom ── */
  return (
    <div style={{
      height: isTablet ? "auto" : "100dvh",
      minHeight: "100dvh",
      background: "#f1f5f9", color: "#0f172a",
      display: "flex", flexDirection: "column",
      overflow: isTablet ? "auto" : "hidden",
      fontFamily: F,
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        *, *::before, *::after { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 10px; }
        @media (max-width: 640px) {
          input, textarea, select { font-size: 16px !important; }
        }
      `}</style>

      {/* ── Topbar ── */}
      <header style={{
        height: 52, flexShrink: 0,
        background: "rgba(255,255,255,0.88)",
        backdropFilter: "blur(20px) saturate(1.8)",
        WebkitBackdropFilter: "blur(20px) saturate(1.8)",
        borderBottom: "1px solid rgba(0,0,0,0.08)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 22px",
      }}>
        <a href="/classroom" aria-label="回教室" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
          <img src="/logo-wordmark.png" alt="InRecord" style={{ height: 24, width: "auto", display: "block" }} />
        </a>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!isTablet && <span style={{ fontSize: 13, color: "#64748b" }}>{user?.email}</span>}
          <AnnouncementsBell ann={ann} />

          {/* 所有在賣方案(bundle)皆含遊戲、遊戲不再單賣 → 已購課者必有遊戲存取，
              僅顯示「已開通」徽章；移除會導到重買整包的「購買遊戲」死按鈕。 */}
          {hasSubscription && (
            <div style={{
              display: "flex", alignItems: "center", gap: 5,
              fontSize: 12, fontWeight: 600, color: "#16a34a",
              background: "rgba(22,163,74,0.1)", padding: "4px 12px", borderRadius: 980,
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: "50%",
                background: "#16a34a", display: "inline-block",
              }} />
              遊戲・已開通
            </div>
          )}

          <a href="/classroom/account" style={{
            background: "none", border: "1px solid rgba(0,0,0,0.13)",
            color: "#334155", borderRadius: 980, padding: "5px 16px",
            cursor: "pointer", fontSize: 12, fontWeight: 500, fontFamily: F,
            textDecoration: "none",
          }}>
            帳號
          </a>

          <button onClick={handleLogout} style={{
            background: "none", border: "1px solid rgba(0,0,0,0.13)",
            color: "#334155", borderRadius: 980, padding: "5px 16px",
            cursor: "pointer", fontSize: 12, fontWeight: 500, fontFamily: F,
            transition: "background .15s",
          }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
          >
            登出
          </button>
        </div>
      </header>

      {/* Announcements */}
      <AnnouncementsStrip ann={ann} />
      <AnnouncementsDrawer ann={ann} />
      <ImportantDialog ann={ann} />

      {/* ── Body ── */}
      <div style={{
        flex: 1, display: "flex",
        flexDirection: "row",
        minHeight: 0,
        overflow: isTablet ? "visible" : "hidden",
      }}>

        {/* ── Left: player + info + comments + tabs ── */}
        <div style={{
          flex: 1, minWidth: 0, display: "flex", flexDirection: "column",
          overflowY: isTablet ? "visible" : "auto",
          borderRight: isTablet ? "none" : "1px solid rgba(0,0,0,0.07)",
        }}>

          {/* Player */}
          <div style={{ flexShrink: 0, background: "#000" }}>
            {currentVideo?.bunny_video_id ? (
              <div style={{ paddingTop: isPhone ? "56.25%" : "44%", position: "relative", background: "#000" }}>
                {embedSrc ? (
                  <iframe
                    id="bunny-player"
                    src={embedSrc}
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
                    allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8" }}>
                    載入影片中…
                  </div>
                )}
              </div>
            ) : currentVideo?.vimeo_id ? (
              <div style={{ paddingTop: isPhone ? "56.25%" : "44%", position: "relative" }}>
                <iframe
                  id="vimeo-player"
                  src={`https://player.vimeo.com/video/${currentVideo.vimeo_id}?autoplay=0&title=0&byline=0&portrait=0`}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <div style={{ paddingTop: isPhone ? "56.25%" : "44%", position: "relative", background: "#0A0A0A" }}>
                <div style={{
                  position: "absolute", inset: 0,
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 14,
                }}>
                  <svg width="52" height="52" viewBox="0 0 24 24" fill="none" opacity={0.25}>
                    <circle cx="12" cy="12" r="10" stroke="#fff" strokeWidth="1.5"/>
                    <circle cx="12" cy="12" r="4" fill="#fff"/>
                  </svg>
                  <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.28)", letterSpacing: ".02em" }}>
                    請從右側選擇課程單元
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Info bar */}
          <div style={{
            padding: "11px 20px", flexShrink: 0, background: "#fff",
            borderBottom: "1px solid rgba(0,0,0,0.06)",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14,
          }}>
            <div style={{ minWidth: 0 }}>
              {chap && (
                <div style={{ fontSize: 11, fontWeight: 600, color: "#2563eb", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 2 }}>
                  {chap.title}
                </div>
              )}
              <div style={{ fontSize: 15, fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {currentVideo ? currentVideo.title : "請選擇課程單元"}
              </div>
              {currentVideo?.duration && (
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{currentVideo.duration}</div>
              )}
            </div>

            {isTablet ? (
              <button
                onClick={() => setDrawerOpen(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  minHeight: 44, background: "#eff6ff", border: "1.5px solid #bfdbfe",
                  color: "#1d4ed8", borderRadius: 20, padding: "10px 16px",
                  fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0,
                }}
              >
                📚 課程目錄 {doneCount}/{totalCount}
              </button>
            ) : currentVideo && (
              isDone ? (
                <div style={{
                  display: "flex", alignItems: "center", gap: 5,
                  fontSize: 12, fontWeight: 600, color: "#16a34a",
                  background: "rgba(22,163,74,0.1)", padding: "6px 16px", borderRadius: 980, flexShrink: 0,
                }}>
                  ✓ 已完成
                </div>
              ) : currentWatchPct > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: "#2563eb", fontWeight: 600 }}>觀看中 {currentWatchPct}%</span>
                  <div style={{ width: 64, height: 3, background: "#e2e8f0", borderRadius: 2 }}>
                    <div style={{ width: `${currentWatchPct}%`, height: "100%", background: "#2563eb", borderRadius: 2, transition: "width .4s" }} />
                  </div>
                </div>
              ) : null
            )}
          </div>

          {/* Materials */}
          <MaterialsSection token={token} video={currentVideo} />

          {/* Comments Section */}
          <CommentsSection token={token} video={currentVideo} chapters={chapters} />

          {/* Tab bar */}
          <div style={{
            display: "flex", flexShrink: 0, borderBottom: "1px solid rgba(0,0,0,0.07)",
            background: "#fff", padding: "0 10px",
            position: "sticky", top: 0, zIndex: 10,
          }}>
            {[
              { id: "rating",     label: "課程評價" },
              { id: "assignment", label: "作業繳交" },
              { id: "games",      label: "互動遊戲" },
              { id: "notes",      label: "筆記" },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{
                  minHeight: 44, padding: "12px 16px", fontSize: 14, fontWeight: tab === t.id ? 600 : 400,
                  cursor: "pointer", border: 0, background: "none", fontFamily: F,
                  color: tab === t.id ? "#0f172a" : "#64748b",
                  borderBottom: tab === t.id ? "2px solid #2563eb" : "2px solid transparent",
                  transition: "color .12s",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ padding: "18px 20px", background: "#fff", minHeight: 320 }}>
            {tab === "rating"     && <RatingTab token={token} />}
            {tab === "assignment" && <AssignmentTab video={currentVideo} token={token} />}
            {tab === "games"      && <GamesTab token={token} hasSubscription={hasSubscription} video={currentVideo} gameCache={gameCacheRef} pendingGameId={pendingGameId} onPendingConsumed={() => setPendingGameId(null)} />}
            {tab === "notes"      && <NotesTab token={token} video={currentVideo} playerCtrl={playerCtrlRef} />}
          </div>
        </div>

        {/* ── Right: chapter list ── */}
        {isTablet && drawerOpen && (
          <div
            onClick={() => setDrawerOpen(false)}
            style={{
              position: "fixed", inset: 0,
              background: "rgba(0,0,0,.4)", zIndex: 49,
            }}
          />
        )}
        <div style={isTablet ? {
          position: "fixed", top: 0, right: 0, bottom: 0,
          width: "min(380px, 88vw)", zIndex: 50,
          display: "flex", flexDirection: "column",
          background: "#fff", flexShrink: 0,
          boxShadow: "-8px 0 32px rgba(0,0,0,.18)",
          transform: drawerOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform .28s ease",
        } : {
          width: 360,
          display: "flex", flexDirection: "column",
          background: "#fff", flexShrink: 0,
        }}>

          {/* 課程總覽：讓學員一眼看到總量 */}
          {contentStats && (
            <div style={{
              padding: "11px 16px", borderBottom: "1px solid rgba(0,0,0,0.06)",
              background: "#f8fbff", fontSize: 11.5, color: "#334155", lineHeight: 1.7, flexShrink: 0,
            }}>
              本課程共 {[
                [contentStats.videos, "支影片"],
                [contentStats.handout, "份講義"],
                [contentStats.score, "份樂譜"],
                [Math.max(contentStats.game, PLANNED_GAMES), "個互動遊戲"],
                [contentStats.assignment, "份作業"],
              ].filter(([n]) => n > 0).map(([n, unit], i) => (
                <span key={unit}>
                  {i > 0 && " · "}
                  <b style={{ color: "#2563eb", fontWeight: 700 }}>{n}</b> {unit}
                </span>
              ))}
            </div>
          )}

          {/* Progress */}
          <div style={{ padding: "14px 18px 12px", borderBottom: "1px solid rgba(0,0,0,0.06)", flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, fontWeight: 500, marginBottom: 9 }}>
              <span style={{ color: "#64748b" }}>學習進度</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: "#2563eb", fontWeight: 600 }}>{doneCount} / {totalCount} 完成</span>
                {isTablet && (
                  <button
                    onClick={() => setDrawerOpen(false)}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      fontSize: 18, color: "#64748b", lineHeight: 1, padding: "2px 4px",
                    }}
                  >✕</button>
                )}
              </div>
            </div>
            <div style={{ height: 4, background: "#e2e8f0", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%", background: "#2563eb", borderRadius: 2,
                width: `${pct}%`, transition: "width .6s ease",
              }} />
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 5, textAlign: "right" }}>{pct}%</div>
          </div>

          {/* Unit list */}
          <div style={{
            flex: 1,
            overflowY: "auto",
            overflowX: isTablet ? "auto" : "hidden",
            padding: isTablet ? "6px 10px 10px" : "6px 10px 32px",
          }}>
            {/* 未上架單元的「預計 9/30 上架」只在滑鼠懸停該列時顯示（列表平時保持乾淨；觸控裝置以列色灰階區分） */}
            <style>{`.unit-row .cs-hint{display:none}.unit-row:hover .cs-hint{display:block}`}</style>
            {chapters.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 16px" }}>
                <p style={{ color: "#64748b", fontSize: 13, margin: 0, lineHeight: 1.6 }}>課程尚未上架</p>
              </div>
            )}
            {chapters.map((c, ci) => {
              const cv = videos.filter(v => v.chapter_id === c.id);
              // 課綱規劃、尚未上傳的互動遊戲（灰色預顯示；上傳同名遊戲後自動不列）
              const chNum = Number((c.title.match(/^Ch(\d+)/i) || [])[1]);
              const uploadedGameTitles = cv.flatMap(v => (contentItems[v.id] || []).filter(i => i.kind === "game").map(i => i.title || ""));
              const plannedGames = (PLANNED_CHAPTER_GAMES[chNum] || []).filter(g => !uploadedGameTitles.some(t => t.includes(g.name)));
              // 對得上單元的接在該單元下方；對不上的（單元還沒上架）仍放章節最後
              const plannedTail = plannedGames.filter(g => !cv.some(v => unitNo(v.title) === g.after));
              return (
                <div key={c.id} style={{ marginBottom: 4 }}>
                  {/* Chapter header */}
                  <div style={{
                    fontSize: 10.5, fontWeight: 600, color: "#94a3b8",
                    textTransform: "uppercase", letterSpacing: ".06em",
                    padding: "12px 6px 5px",
                  }}>
                    {c.title}
                  </div>

                  {!cv.length && (
                    <div style={{ fontSize: 12, color: "#94a3b8", padding: "4px 8px 8px 14px" }}>
                      單元準備中，{CHAPTER_COMING_SOON[chNum] || COMING_SOON}
                    </div>
                  )}

                  {/* Unit buttons */}
                  {cv.map((v, idx) => {
                    const isActive   = v.id === currentVideo?.id;
                    const pe         = progMap[v.id];
                    const done       = !!pe?.completed;
                    const watchPct   = (pe?.total_seconds > 0)
                      ? Math.min(100, Math.round((pe.watched_seconds / pe.total_seconds) * 100))
                      : 0;
                    const isWatching = !done && watchPct > 0;
                    const items      = contentItems[v.id] || [];
                    const playable   = !!(v.bunny_video_id || v.vimeo_id);
                    // 沒影片的單元只列可下載項目（遊戲/作業要切分頁、會綁到別的單元）
                    const visibleItems = playable ? items : items.filter(i => i.kind === "handout" || i.kind === "score");
                    // 規劃中的互動遊戲：接在對應單元下方（灰色列）
                    const unitPlanned = plannedGames.filter(g => g.after === unitNo(v.title));
                    return (
                      <div key={v.id}>
                        <div className="unit-row"
                          role="button" tabIndex={0}
                          title={!playable ? comingSoonFor(v.title, chNum) : undefined}
                          onClick={() => handleUnitClick(v)}
                          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleUnitClick(v); } }}
                          style={{
                            display: "flex", alignItems: "flex-start", gap: 2,
                            padding: "7px 8px 7px 4px", borderRadius: 9, cursor: "pointer",
                            background: isActive ? "rgba(37,99,235,0.08)" : "transparent",
                            transition: "background .1s",
                          }}
                          onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }}
                          onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                        >
                          {/* 不折疊：子項目一律顯示，這裡只留與原本相同寬度的留白維持縮排對齊 */}
                          <div style={{ width: 14, flexShrink: 0 }} />

                          {/* Status indicator */}
                          <div style={{
                            width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                            display: "grid", placeItems: "center",
                            fontSize: 10.5, fontWeight: 600, margin: "1px 8px 0 2px",
                            background: isActive ? "#2563eb" : done ? "rgba(22,163,74,0.12)" : isWatching ? "rgba(37,99,235,0.08)" : "#f1f5f9",
                            color: isActive ? "#fff" : done ? "#16a34a" : isWatching ? "#2563eb" : "#64748b",
                            border: `1.5px solid ${isActive ? "#2563eb" : done ? "rgba(22,163,74,0.4)" : isWatching ? "rgba(37,99,235,0.3)" : "rgba(0,0,0,0.1)"}`,
                          }}>
                            {done && !isActive ? "✓" : idx + 1}
                          </div>

                          {/* Title + meta */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: 13, lineHeight: 1.45,
                              fontWeight: isActive ? 600 : 400,
                              color: isActive ? "#2563eb" : playable ? "#334155" : "#94a3b8",
                              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                            }}>
                              {v.title}
                            </div>
                            {!playable ? (
                              <div className="cs-hint" style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{comingSoonFor(v.title, chNum)}</div>
                            ) : isWatching ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3 }}>
                                <div style={{ flex: 1, height: 3, background: "#e2e8f0", borderRadius: 2 }}>
                                  <div style={{ width: `${watchPct}%`, height: "100%", background: "#2563eb", borderRadius: 2 }} />
                                </div>
                                <span style={{ fontSize: 10, color: "#2563eb", flexShrink: 0 }}>{watchPct}%</span>
                              </div>
                            ) : (
                              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                                {v.duration && <span>{v.duration}</span>}
                                {visibleItems.length > 0 && <span style={{ color: "#b6c0cd" }}>{visibleItems.length} 項</span>}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 展開內容：該單元的真實項目 */}
                        {/* 沒影片的單元只列講義／樂譜（可直接下載）；遊戲與作業要切分頁、會綁到別的單元，先不顯示 */}
                        {visibleItems.length > 0 && (
                          <div style={{ padding: "2px 8px 8px 37px" }}>
                            {visibleItems.map(item => {
                              const ic = UNIT_ICONS.find(x => x.key === item.kind);
                              return (
                                <div key={`${item.kind}-${item.id}`}
                                  role="button" tabIndex={0}
                                  aria-label={`${item.title} — ${ic?.label}`}
                                  onClick={e => handleItemClick(e, v, item)}
                                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleItemClick(e, v, item); } }}
                                  style={{
                                    display: "flex", alignItems: "center", gap: 9,
                                    padding: "6px 9px", borderRadius: 8, cursor: "pointer",
                                    fontSize: 12.5, color: "#334155", transition: "background .12s, color .12s",
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(37,99,235,0.07)"; e.currentTarget.style.color = "#2563eb"; }}
                                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#334155"; }}
                                >
                                  <span style={{ fontSize: 13, flexShrink: 0 }}>{ic?.emoji}</span>
                                  <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {item.title}
                                  </span>
                                  <span style={{ fontSize: 10, color: "#94a3b8", flexShrink: 0 }}>{ic?.label}</span>
                                </div>
                              );
                            })}
                            {itemErr && <div style={{ fontSize: 11.5, color: "#b45309", padding: "4px 9px 0" }}>{itemErr}</div>}
                          </div>
                        )}

                        {unitPlanned.map(g => <PlannedGameRow key={g.name} name={g.name} />)}
                      </div>
                    );
                  })}

                  {/* 對不上單元的規劃遊戲（該單元尚未上架）才留在章節最後 */}
                  {plannedTail.map(g => <PlannedGameRow key={g.name} name={g.name} />)}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
