"use client";
import { useEffect, useRef, useState } from "react";
import { END_SIGNAL } from "@/lib/public-games";

// 公開試玩頁的外殼：iframe 放遊戲，玩完一局蓋上 CTA。
// 結束訊號來自注入 iframe 的 MutationObserver（lib/public-games.js）；
// 遊戲改版導致訊號沒來時，用時間保底（FALLBACK_MS）仍會跳 CTA，不會讓人玩到忘記這是試玩。
const FALLBACK_MS = 150_000;
const BUY = "/?utm_source=game&utm_medium=trial&utm_campaign=play-do#pricing";

export default function PlayTrial({ slug, name, blurb }) {
  const [done, setDone] = useState(false);
  const frameRef = useRef(null);

  useEffect(() => {
    const onMsg = (e) => {
      if (e.origin !== window.location.origin) return;   // 只收自家 iframe 的訊號
      if (e.data?.type === END_SIGNAL) setDone(true);
    };
    window.addEventListener("message", onMsg);
    const t = setTimeout(() => setDone(true), FALLBACK_MS);
    return () => { window.removeEventListener("message", onMsg); clearTimeout(t); };
  }, []);

  // 再玩一次：重載 iframe 回到遊戲開頭，CTA 收起來
  function again() {
    setDone(false);
    const f = frameRef.current;
    if (f) f.src = f.src;   // eslint-disable-line no-self-assign
  }

  return (
    <div style={S.page}>
      <header style={S.head}>
        <a href="/" style={S.brand}>InRecord<span style={{ color: "#e8c583" }}>·</span>音樂刻</a>
        <span style={S.tag}>免費試玩</span>
      </header>

      <div style={S.stage}>
        <iframe
          ref={frameRef}
          src={`/api/play/${slug}`}
          title={name}
          sandbox="allow-scripts allow-same-origin"
          style={S.frame}
        />

        {done && (
          <div style={S.overlay} role="dialog" aria-label="試玩結束">
            <div style={S.card}>
              <p style={S.kicker}>玩完一局了</p>
              <h2 style={S.h2}>這只是第一章的其中一個遊戲</h2>
              <p style={S.p}>
                《從零開始學鋼琴》每一章都配了這樣的互動練習，<br />
                先玩出手感，再回頭把樂理弄懂。
              </p>
              <div style={S.row}>
                <a href={BUY} style={S.primary}>查看課程</a>
                <button type="button" onClick={again} style={S.ghost}>再玩一次</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <p style={S.foot}>{blurb}</p>
    </div>
  );
}

const S = {
  page: { minHeight: "100dvh", background: "#0d0f16", color: "#f3efe6", display: "flex", flexDirection: "column",
          fontFamily: "'PingFang TC','Noto Sans TC',system-ui,sans-serif" },
  head: { display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", flex: "none" },
  brand: { color: "#f3efe6", textDecoration: "none", fontWeight: 700, fontSize: 16, letterSpacing: ".02em" },
  tag: { fontSize: 12, fontWeight: 700, color: "#2a1e08", background: "#e8c583", borderRadius: 999, padding: "3px 10px" },
  stage: { position: "relative", flex: 1, minHeight: 0, margin: "0 12px", borderRadius: 16, overflow: "hidden",
           border: "1px solid rgba(255,255,255,.1)", background: "#000" },
  frame: { width: "100%", height: "100%", border: 0, display: "block" },
  overlay: { position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 20,
             background: "rgba(8,10,16,.82)", backdropFilter: "blur(6px)" },
  card: { maxWidth: 420, textAlign: "center" },
  kicker: { margin: 0, color: "#e8c583", fontSize: 13, fontWeight: 700, letterSpacing: ".06em" },
  h2: { margin: "10px 0 12px", fontSize: 22, lineHeight: 1.45, fontWeight: 700, wordBreak: "keep-all", lineBreak: "strict" },
  p: { margin: "0 0 22px", fontSize: 15, lineHeight: 1.85, color: "#c8c3b8", wordBreak: "keep-all", lineBreak: "strict" },
  row: { display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" },
  primary: { background: "linear-gradient(180deg,#f3d9a3,#e8c583)", color: "#2a1e08", textDecoration: "none",
             padding: "12px 26px", borderRadius: 999, fontWeight: 700, fontSize: 15 },
  ghost: { background: "transparent", color: "#f3efe6", border: "1px solid rgba(255,255,255,.28)",
           padding: "12px 22px", borderRadius: 999, fontWeight: 600, fontSize: 15, cursor: "pointer",
           fontFamily: "inherit" },
  foot: { flex: "none", margin: 0, padding: "12px 18px 18px", color: "#8b8577", fontSize: 13, textAlign: "center",
          wordBreak: "keep-all", lineBreak: "strict" },
};
