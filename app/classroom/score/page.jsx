"use client";
// /classroom/score?v=<單元id>&s=<樂譜id> — 互動樂譜整頁（A4 紙一張張往下疊）
// 從影片頁「整頁開啟」換頁過來（同一個分頁）；左上角返回：從影片頁來的回到課程影片，直接打開網址的回到音樂教室。
// 權限與影片下方的分頁相同：/api/classroom/scores 驗登入＋開通；教室鎖站時 middleware 一樣擋 /classroom/*。
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import ScoreTab from "@/components/classroom/ScoreTab";
import { F } from "@/components/classroom/shared";
import { cameFromWatch, scorePageUrl } from "@/components/classroom/score-open";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ScorePage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [params, setParams] = useState(null); // { v, s }
  const [fromWatch, setFromWatch] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const v = q.get("v");
    const s = q.get("s");
    setParams({ v: v && UUID_RE.test(v) ? v : null, s: s && UUID_RE.test(s) ? s : null });
    setFromWatch(cameFromWatch());
    (async () => {
      try {
        if (!supabase) { window.location.href = "/classroom/login"; return; }
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { window.location.href = "/classroom/login"; return; }
        const { data: { session } } = await supabase.auth.getSession();
        setToken(session?.access_token || "");
      } catch {
        window.location.href = "/classroom/login";
      }
    })();
  }, []);

  const back = () => {
    if (fromWatch && window.history.length > 1) router.back();
    else router.push(params?.v ? `/classroom/watch?v=${params.v}` : "/classroom");
  };
  // 換曲時把網址的 ?s= 換掉（不新增歷史紀錄），重新整理或分享網址都停在同一首
  const onPick = (id) => { if (params?.v) window.history.replaceState(null, "", scorePageUrl(params.v, id)); };

  return (
    <div style={{ minHeight: "100vh", background: "#E9E9EE", fontFamily: F }}>
      <header style={{
        position: "sticky", top: 0, zIndex: 30, height: 56, display: "flex", alignItems: "center", gap: 12,
        padding: "0 16px", background: "rgba(255,255,255,.92)", backdropFilter: "blur(10px)", borderBottom: "1px solid rgba(0,0,0,.07)",
      }}>
        <button type="button" onClick={back} style={{
          display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid #cbd5e1", background: "#fff", color: "#0f172a",
          borderRadius: 999, padding: "7px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: F,
        }}>
          ← {fromWatch || params?.v ? "回到課程影片" : "回到音樂教室"}
        </button>
        <span style={{ fontSize: 14, color: "#64748b" }}>互動樂譜</span>
      </header>
      <main style={{ padding: "16px 16px 48px" }}>
        {params && !params.v && <p style={{ textAlign: "center", color: "#64748b", fontSize: 14 }}>找不到這份樂譜，請從課程單元重新開啟。</p>}
        {params?.v && !token && <p style={{ textAlign: "center", color: "#64748b", fontSize: 14 }}>樂譜載入中…</p>}
        {params?.v && token && <ScoreTab token={token} video={{ id: params.v }} pickId={params.s} paged onPick={onPick} />}
      </main>
    </div>
  );
}
