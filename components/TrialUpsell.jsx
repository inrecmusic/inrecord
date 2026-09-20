"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { LICENSE_TERM_TEXT } from "@/lib/terms-version";
import styles from "./TrialUpsell.module.css";

// 試看影片看完後的置中導購視窗。三層觸發、先到者為準、同一次瀏覽只彈一次：
//   ① Bunny player.js 的 ended（主要，比照 app/classroom/watch/page.jsx 的用法）
//   ② 實質看完：播放位置達 92%，且「連續播放累積時間」也過半 —— 只拖進度條到片尾不算
//   ③ player.js 沒上工時的保底計時 —— 這條路我們並不知道他看完沒有，文案要走中性版
// 價格與截止時間全部由 server 端的 salePhase() 算好用 props 傳進來，這裡一個數字都不寫死。
// 法務句一律取 lib/terms-version 的 LICENSE_TERM_TEXT（全站唯一權威寫法），本檔不自己講日期。

const FALLBACK_MS = 300000; // ③ 保底計時：從「使用者確實點進播放器」起算，長度抓試看片長
const PROGRESS_RATIO = 0.92; // ② 播放位置門檻
const WATCHED_RATIO = 0.6; // ② 連續播放累積門檻（防拖進度條誤觸）
const MID_RATIO = 0.5; // 看到一半：滑出側邊小卡（不擋畫面，影片不會因此暫停而漏看內容）
const CONTINUOUS_MAX_S = 1.5; // 兩次 timeupdate 的合理間隔，超過視為跳轉不計入

// 倒數格式化（純函式、無 Date.now）：ms → "N 天 HH:MM:SS"
export function fmtCountdown(ms) {
  let left = Math.max(0, ms);
  const days = Math.floor(left / 86400000); left -= days * 86400000;
  const h = Math.floor(left / 3600000); left -= h * 3600000;
  const m = Math.floor(left / 60000); left -= m * 60000;
  const s = Math.floor(left / 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${days} 天 ${p(h)}:${p(m)}:${p(s)}`;
}

// 千分位（不走 toLocaleString，避免不同 ICU 的空白／格式差異）
export function nt(n) {
  return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// 觸發來源決定語氣：保底計時不可以宣稱他看完了
export function upsellCopy(reason) {
  if (reason === "mid") {
    return {
      title: "看到一半了，感覺如何？",
      sub: "如果這樣的講法你跟得上，正式課程就是把這件事做完 —— 從鍵盤、中央 C 一路帶到能彈完一首歌。",
    };
  }
  return reason === "timer"
    ? {
        title: "想把這 5 分鐘變成一首完整的歌？",
        sub: "正式課程從鍵盤、中央 C、音名開始，不需要會看五線譜，一首接一首往下解鎖。",
      }
    : {
        title: "你看完了這 5 分鐘",
        sub: "接下來的 10 章節，就是把這 5 分鐘接下去，帶你彈完一首完整的歌。",
      };
}

// player.js 注入一次、快取 Promise；載入失敗就當沒有（不擋影片播放）。比照教室播放頁。
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

export default function TrialUpsell({ playerId, offer }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("ended");
  const [nowMs, setNowMs] = useState(null); // 倒數：mounted 後才有值 → 首次渲染不碰 Date.now()
  const firedRef = useRef(false);
  const midFiredRef = useRef(false);
  const panelRef = useRef(null);
  const returnFocusRef = useRef(null);
  const downOnBackdropRef = useRef(false);

  // 三層觸發
  useEffect(() => {
    if (!playerId) return;
    let unmounted = false;
    let fallbackTimer = null;
    let fallbackOff = false; // player.js 正常上工後就不再需要保底
    let lastSec = 0;
    let watched = 0; // 連續播放累積秒數（跳轉的落差不計入）

    const fire = (r) => {
      if (unmounted || firedRef.current) return;
      firedRef.current = true;
      clearTimeout(fallbackTimer);
      setReason(r);
      setOpen(true);
    };

    // ③ 保底只在「使用者真的點進播放器」之後才起算。
    // 沒有這道條件的話，player.js 被廣告阻擋器擋掉時，人只是把頁面開著沒按播放也會被彈窗蓋住影片。
    const armFallback = () => {
      if (unmounted || fallbackOff || fallbackTimer || firedRef.current) return;
      fallbackTimer = setTimeout(() => fire("timer"), FALLBACK_MS);
    };
    // 點進 iframe 會讓母頁失焦，且 activeElement 變成該 iframe —— 跨來源 iframe 唯一能偵測到的互動訊號。
    const onBlur = () => {
      if (document.activeElement?.id !== playerId) return;
      armFallback();
    };
    window.addEventListener("blur", onBlur);

    loadPlayerJs().then(() => {
      if (unmounted) return;
      const iframe = document.getElementById(playerId);
      if (!window.playerjs || !iframe) return; // 走 ③ 保底
      const player = new window.playerjs.Player(iframe);
      player.on("ready", () => {
        if (unmounted) return;
        fallbackOff = true;
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
        window.removeEventListener("blur", onBlur);
        player.on("ended", () => fire("ended"));
        player.on("timeupdate", (d) => {
          const sec = d?.seconds || 0;
          const dur = d?.duration || 0;
          const delta = sec - lastSec;
          if (delta > 0 && delta <= CONTINUOUS_MAX_S) watched += delta;
          lastSec = sec;
          if (dur > 0 && !midFiredRef.current && !firedRef.current
              && sec / dur >= MID_RATIO && watched >= dur * MID_RATIO * 0.8) {
            midFiredRef.current = true;
            setReason("mid");
            setOpen(true);
          }
          if (dur > 0 && sec / dur >= PROGRESS_RATIO && watched >= dur * WATCHED_RATIO) fire("progress");
        });
      });
    });

    return () => {
      unmounted = true;
      clearTimeout(fallbackTimer);
      window.removeEventListener("blur", onBlur);
    };
  }, [playerId]);

  const close = useCallback(() => {
    setOpen(false);
    const el = returnFocusRef.current;
    returnFocusRef.current = null;
    if (el && typeof el.focus === "function") el.focus();
  }, []);

  // 開啟時：鎖捲動、Esc 可關、焦點移進視窗並關在裡面；關閉後把焦點還給觸發元素
  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement;
    panelRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { close(); return; }
      if (e.key !== "Tab") return;
      const f = panelRef.current?.querySelectorAll("a[href], button:not([disabled])");
      if (!f?.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panelRef.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, close]);

  // 倒數 ticker：只在視窗開著時跑，每秒更新
  useEffect(() => {
    if (!open) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  if (!open) return null;

  const { title, sub } = upsellCopy(reason);
  const leftMs = nowMs != null && offer?.deadlineMs ? offer.deadlineMs - nowMs : null;
  // 進頁當下算的價，看到彈窗時可能已經過期（截止前幾分鐘進站的人）→ 整組降級成不報價
  const expired = leftMs != null && leftMs <= 0;
  const mode = expired ? "none" : offer?.mode || "none";
  const showCountdown = mode !== "none" && leftMs != null && leftMs > 0;
  const badge = mode === "fan" ? "粉絲限定 · 限時" : mode === "wave" ? "限時優惠 · 即將調漲" : mode === "list" ? offer?.planName || "" : "";

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(e) => { downOnBackdropRef.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && downOnBackdropRef.current) close(); }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="trial-upsell-title"
      >
        <button type="button" className={styles.close} aria-label="關閉" onClick={close}>×</button>
        <div className={styles.scroll}>
          {badge ? <span className={styles.badge}>{badge}</span> : null}
          <h2 id="trial-upsell-title" className={styles.title}>{title}</h2>
          <p className={styles.body}>{sub}</p>
          <ul className={styles.facts}>
            <li>10 章節 ＋ 2 附錄，約 6 小時</li>
            <li>24 個三和弦（12 個大三和弦 ＋ 12 個小三和弦）</li>
            <li>10 首曲目實戰</li>
          </ul>
          {mode !== "none" && (
            <>
              <div className={styles.priceRow}>
                <span className={styles.price}>NT${nt(offer.price)}</span>
                {offer.originalPrice > offer.price ? <span className={styles.was}>NT${nt(offer.originalPrice)}</span> : null}
              </div>
              {showCountdown && (
                <p className={styles.countdown}>
                  {mode === "fan"
                    ? <>距離 {offer.deadlineLabel} 截止還有 <strong>{fmtCountdown(leftMs)}</strong>，截止後調漲</>
                    : <>距離下次調漲（{offer.deadlineLabel}）還有 <strong>{fmtCountdown(leftMs)}</strong></>}
                </p>
              )}
            </>
          )}
        </div>
        {/* 頁尾不參與內捲：橫向手機／矮視窗也保證主 CTA 看得到 */}
        <div className={styles.foot}>
          <a className={styles.cta} href="/?ref=trial-endcard#pricing">查看課程方案</a>
          {/* 條款原文不動（其他頁面共用）；只在顯示時把「至少 3 年」用不斷行空格綁住，避免折行 */}
          <p className={styles.fine}>一次買斷，{LICENSE_TERM_TEXT.replace("至少 3 年", "至少\u00a03\u00a0年")}。</p>
          <button type="button" className={styles.later} onClick={close}>先關掉，回到影片</button>
        </div>
      </div>
    </div>
  );
}
