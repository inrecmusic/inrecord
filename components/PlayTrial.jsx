"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { END_SIGNAL } from "@/lib/public-games";
import UpsellPanel from "./UpsellPanel";

// 公開試玩頁的外殼：iframe 放遊戲，玩完一局／按暫停時彈導購視窗。
// 視窗跟試看影片頁看到一半彈的那個（components/TrialUpsell.jsx）共用 UpsellPanel——
// 價格、倒數、條款句、按鈕都同一套，兩邊長得一模一樣。
// 結束訊號來自注入 iframe 的 MutationObserver（lib/public-games.js），帶 reason：
//   result＝一局玩完 → 每局都彈；關掉就露出遊戲自己的結果畫面（那裡有「再玩一次」）
//   pause＝按了暫停 → 一次瀏覽只彈一次（每按一次暫停就彈很煩）；關掉回到暫停畫面，進度還在
// 遊戲改版導致訊號一直沒來時，用時間保底（FALLBACK_MS）仍會彈，不會讓人玩到忘記這是試玩。
const FALLBACK_MS = 150_000;
const buyUrl = (slug) => `/?utm_source=game&utm_medium=trial&utm_campaign=play-${slug}#pricing`;

// 語氣比照試看影片的中場版（「看到一半了，感覺如何？」）。保底計時不知道他玩到哪，不可以宣稱玩完了。
export function playCopy(reason, chapter) {
  const sub = `這只是${chapter || "課程"}的其中一個遊戲。正式課程每一章都配了這樣的互動練習 —— 先玩出手感，再回頭把樂理弄懂，一路帶到能彈完一首歌。`;
  if (reason === "result") return { title: "玩完一局了，感覺如何？", sub, closeLabel: "先看這局成績" };
  if (reason === "pause") return { title: "先休息一下？", sub, closeLabel: "回到遊戲" };
  return { title: "玩得還順手嗎？", sub, closeLabel: "繼續玩" };
}

export default function PlayTrial({ slug, name, blurb, chapter, offer }) {
  const [reason, setReason] = useState(null); // null＝視窗關著
  const pauseShownRef = useRef(false);

  useEffect(() => {
    let t = setTimeout(() => setReason((r) => r || "timer"), FALLBACK_MS);
    const onMsg = (e) => {
      if (e.origin !== window.location.origin) return;   // 只收自家 iframe 的訊號
      if (e.data?.type !== END_SIGNAL) return;
      clearTimeout(t); t = null;                          // 訊號正常就不需要保底
      if (e.data.reason === "pause") {
        if (pauseShownRef.current) return;
        pauseShownRef.current = true;
        setReason("pause");
      } else {
        setReason("result");                              // 舊版訊號沒帶 reason 一律當玩完
      }
    };
    window.addEventListener("message", onMsg);
    return () => { window.removeEventListener("message", onMsg); clearTimeout(t); };
  }, []);

  const close = useCallback(() => setReason(null), []);
  const copy = reason ? playCopy(reason, chapter) : null;

  return (
    <div style={S.page}>
      <header style={S.head}>
        <a href="/" style={S.brand}>InRecord<span style={{ color: "#e8c583" }}>·</span>音樂刻</a>
        <span style={S.tag}>免費試玩</span>
      </header>

      <div style={S.stage}>
        <iframe
          src={`/api/play/${slug}`}
          title={name}
          sandbox="allow-scripts allow-same-origin"
          style={S.frame}
        />
      </div>

      {copy && (
        <UpsellPanel
          title={copy.title}
          sub={copy.sub}
          offer={offer}
          onClose={close}
          ctaHref={buyUrl(slug)}
          closeLabel={copy.closeLabel}
          labelId="play-upsell-title"
        />
      )}

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
           border: "1px solid rgba(255,255,255,.1)", background: "#fff" },
  // 絕對定位撐滿 stage：iframe 的 height:100% 在 flex 子層沒有確定高度可依，
  // 會掉回瀏覽器預設的 150px（實測過），所以不用百分比高度。
  frame: { position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, display: "block" },
  foot: { flex: "none", margin: 0, padding: "12px 18px 18px", color: "#8b8577", fontSize: 13, textAlign: "center",
          wordBreak: "keep-all", lineBreak: "strict" },
};
