"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { END_SIGNAL } from "@/lib/public-games";
import UpsellPanel, { nt } from "./UpsellPanel";

// 公開試玩頁的外殼：iframe 放遊戲，玩完一局才彈完整的導購視窗。
// 視窗跟試看影片頁看到一半彈的那個（components/TrialUpsell.jsx）共用 UpsellPanel——
// 價格、截止與之後價、倒數、條款句、按鈕都同一套。
// 訊號來自注入 iframe 的 MutationObserver（lib/public-games.js），帶 reason：
//   result（＋ok/total）＝一局玩完 → 先講成就（「你剛剛答對了 8 / 10 個音名，這是第二章…的內容」）再給 CTA；
//                                    每局都彈，關掉就露出遊戲自己的結果畫面（那裡有「再玩一次」）
//   pause／resume＝暫停遮罩亮起／收起 → 只出底部一條小提示，主按鈕是「繼續玩」。
//                                    暫停常是接電話、看訊息，這時跳全螢幕 CTA 等於把人趕走
// 遊戲改版導致訊號一直沒來時，用時間保底（FALLBACK_MS）出同一條小提示，不硬切斷遊戲。
const FALLBACK_MS = 150_000;
// utm_content 分開記：完整視窗（result）與小提示（hint）各自帶了多少單，週報才分得出來
const buyUrl = (slug, content) =>
  `/?utm_source=game&utm_medium=trial&utm_campaign=play-${slug}&utm_content=${content}#pricing`;

const COURSE_LINE = "正式課程每一章都配了這樣的互動練習 —— 先玩出手感，再回頭把樂理弄懂，一路帶到能彈完一首歌。";

// 成績要是遊戲畫面上真的寫著的數字才拿來講；讀不到、0 分或怪值就退回不講分數的版本。
export function validScore(score) {
  const ok = Number(score?.ok);
  const total = Number(score?.total);
  return Number.isInteger(ok) && Number.isInteger(total) && total > 0 && total <= 100 && ok > 0 && ok <= total
    ? { ok, total } : null;
}

export function playCopy(game = {}, score) {
  const s = validScore(score);
  if (s) {
    return {
      title: `你剛剛${game.scoreVerb || "答對"}了 ${s.ok} / ${s.total} ${game.scoreUnit || "題"}`,
      sub: `這就是${game.chapterTitle || game.chapter || "課程"}在教的內容。${COURSE_LINE}`,
    };
  }
  return { title: "玩完一局了，感覺如何？", sub: `這只是${game.chapter || "課程"}的其中一個遊戲。${COURSE_LINE}` };
}

// 小提示的價格句：只在波段中、還沒過截止時講（過了就不報價，跟 UpsellPanel 的降級規則一致）
export function hintPrice(offer, nowMs) {
  if (offer?.mode !== "wave" || !(offer.deadlineMs > nowMs) || !offer.deadlineLabel) return "";
  return `${offer.deadlineLabel} 前 NT$${nt(offer.price)}`;
}

export default function PlayTrial({ slug, name, blurb, game = {}, offer }) {
  const [panel, setPanel] = useState(null); // null＝完整視窗關著；{ score }＝一局玩完
  const [hint, setHint] = useState(null);   // null | "pause" | "timer"
  const frameRef = useRef(null);

  useEffect(() => {
    let t = setTimeout(() => setHint((h) => h || "timer"), FALLBACK_MS);
    const onMsg = (e) => {
      if (e.origin !== window.location.origin) return;   // 只收自家 iframe 的訊號
      if (e.data?.type !== END_SIGNAL) return;
      clearTimeout(t); t = null;                          // 訊號正常就不需要保底
      const r = e.data.reason;
      if (r === "pause") setHint("pause");
      else if (r === "resume") setHint((h) => (h === "pause" ? null : h));
      else {                                              // result；舊版訊號沒帶 reason 一律當玩完
        setHint(null);
        setPanel({ score: { ok: e.data.ok, total: e.data.total } });
      }
    };
    window.addEventListener("message", onMsg);
    return () => { window.removeEventListener("message", onMsg); clearTimeout(t); };
  }, []);

  const closePanel = useCallback(() => setPanel(null), []);

  // 「繼續玩」：暫停時直接幫他按遊戲自己的繼續鍵（同源 iframe 才碰得到），碰不到就只收起提示
  const resume = useCallback(() => {
    if (hint === "pause") {
      try { frameRef.current?.contentDocument?.getElementById("pResume")?.click(); } catch { /* 碰不到就算了 */ }
    }
    setHint(null);
  }, [hint]);

  const copy = panel ? playCopy(game, panel.score) : null;
  const price = hint ? hintPrice(offer, Date.now()) : "";

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

        {hint && (
          <div style={S.hint} role="status" aria-live="polite">
            <span style={S.hintText}>
              {hint === "pause" ? "先休息一下。" : "玩得還順手嗎？"}
              {price ? <span style={S.hintPrice}>{price}</span> : null}
            </span>
            <span style={S.hintBtns}>
              <a href={buyUrl(slug, "hint")} style={S.hintLink}>查看課程方案</a>
              <button type="button" onClick={resume} style={S.hintBtn}>繼續玩</button>
            </span>
          </div>
        )}
      </div>

      {copy && (
        <UpsellPanel
          title={copy.title}
          sub={copy.sub}
          offer={offer}
          onClose={closePanel}
          ctaHref={buyUrl(slug, "result")}
          closeLabel="先看這局成績"
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
  // 底部小提示：不擋遊戲、不鎖捲動，窄螢幕自動換成兩行
  hint: { position: "absolute", left: 12, right: 12, bottom: 12, margin: "0 auto", maxWidth: 560, display: "flex",
          flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "8px 14px", padding: "10px 12px 10px 16px",
          borderRadius: 14, background: "rgba(13,15,22,.92)", color: "#f3efe6", boxShadow: "0 10px 30px rgba(0,0,0,.35)",
          border: "1px solid rgba(255,255,255,.12)" },
  hintText: { fontSize: 14, lineHeight: 1.5, wordBreak: "keep-all", lineBreak: "strict" },
  hintPrice: { marginLeft: 6, color: "#e8c583", fontWeight: 700, whiteSpace: "nowrap" },
  hintBtns: { display: "flex", alignItems: "center", gap: 12, marginLeft: "auto" },
  hintLink: { color: "rgba(243,239,230,.75)", fontSize: 13.5, textDecoration: "underline", textUnderlineOffset: 3, whiteSpace: "nowrap" },
  hintBtn: { background: "linear-gradient(180deg,#f3d9a3,#e8c583)", color: "#2a1e08", border: 0, borderRadius: 999,
             padding: "9px 20px", fontWeight: 700, fontSize: 14.5, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  foot: { flex: "none", margin: 0, padding: "12px 18px 18px", color: "#8b8577", fontSize: 13, textAlign: "center",
          wordBreak: "keep-all", lineBreak: "strict" },
};
