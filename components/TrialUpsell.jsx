"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import UpsellPanel, { fmtCountdown, nt } from "./UpsellPanel";

export { fmtCountdown, nt };

// 試看影片看完後的置中導購視窗。三層觸發、先到者為準、同一次瀏覽只彈一次：
//   ① Bunny player.js 的 ended（主要，比照 app/classroom/watch/page.jsx 的用法）
//   ② 實質看完：播放位置達 92%，且「連續播放累積時間」也過半 —— 只拖進度條到片尾不算
//   ③ player.js 沒上工時的保底計時 —— 這條路我們並不知道他看完沒有，文案要走中性版
// 價格與截止時間全部由 server 端的 salePhase() 算好用 props 傳進來，這裡一個數字都不寫死。
// 本檔只管「什麼時候彈、講什麼」；視窗畫面（價格、倒數、法務句、焦點與捲動鎖）在 UpsellPanel，
// 遊戲試玩頁（components/PlayTrial.jsx）共用同一個，兩邊才會長得一模一樣。

const FALLBACK_MS = 300000; // ③ 保底計時：從「使用者確實點進播放器」起算，長度抓試看片長
const PROGRESS_RATIO = 0.92; // ② 播放位置門檻
const WATCHED_RATIO = 0.6; // ② 連續播放累積門檻（防拖進度條誤觸）
const MID_RATIO = 0.5; // 看到一半：滑出側邊小卡（不擋畫面，影片不會因此暫停而漏看內容）
const CONTINUOUS_MAX_S = 1.5; // 兩次 timeupdate 的合理間隔，超過視為跳轉不計入

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
  const firedRef = useRef(false);
  const midFiredRef = useRef(false);

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

  const close = useCallback(() => setOpen(false), []);

  if (!open) return null;

  const { title, sub } = upsellCopy(reason);
  return (
    <UpsellPanel
      title={title}
      sub={sub}
      offer={offer}
      onClose={close}
      labelId="trial-upsell-title"
      closeLabel="先關掉，回到影片"
    />
  );
}
