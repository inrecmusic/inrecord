"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Logo from "@/components/Logo";

const F = "'PingFang TC','Noto Sans TC',system-ui,-apple-system,sans-serif";

export default function CertificatePage() {
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    if (!supabase) { setState({ loading: false, error: "config" }); return; }
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/classroom/login"; return; }
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      try {
        const r = await fetch("/api/classroom/certificate", { headers: { Authorization: `Bearer ${token}` } });
        if (r.status === 403) { if (!cancelled) setState({ loading: false, forbidden: true }); return; }
        const d = await r.json();
        if (!cancelled) setState({ loading: false, ...d });
      } catch {
        if (!cancelled) setState({ loading: false, error: "fetch" });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const wrap = { minHeight: "100vh", background: "#f1f5f9", padding: 24, fontFamily: F, display: "grid", placeItems: "center" };

  if (state.loading) return (<div style={wrap}><p style={{ color: "#64748b" }}>載入中…</p></div>);

  if (state.error === "config") return (<div style={wrap}><p style={{ color: "#dc2626", fontSize: 14 }}>系統設定錯誤，請聯繫管理員</p></div>);

  if (state.forbidden) return (
    <div style={wrap}>
      <div style={{ maxWidth: 420, background: "#fff", borderRadius: 18, padding: "30px 28px", textAlign: "center", boxShadow: "0 10px 40px rgba(0,0,0,.08)" }}>
        <div style={{ marginBottom: 14, display: "flex", justifyContent: "center" }}><Logo size={24} /></div>
        <p style={{ color: "#475569", fontSize: 14, lineHeight: 1.7 }}>購課並完成課程後即可取得完課證書。</p>
        <a href="/classroom" style={{ display: "inline-block", marginTop: 16, color: "#2563eb", fontSize: 14, textDecoration: "none" }}>← 返回教室</a>
      </div>
    </div>
  );

  if (!state.eligible) return (
    <div style={wrap}>
      <div style={{ maxWidth: 420, width: "100%", background: "#fff", borderRadius: 18, padding: "30px 28px", boxShadow: "0 10px 40px rgba(0,0,0,.08)" }}>
        <div style={{ marginBottom: 14 }}><Logo size={24} /></div>
        <h2 style={{ margin: "0 0 8px", fontSize: 20, color: "#0f172a" }}>尚未完成課程</h2>
        <p style={{ color: "#64748b", fontSize: 14, lineHeight: 1.8, margin: "0 0 16px" }}>完成以下項目即可領取完課證書：</p>
        <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#334155" }}>課程單元</span>
            <span style={{ color: state.videoDone === state.videoTotal && state.videoTotal > 0 ? "#16a34a" : "#b45309", fontWeight: 600 }}>已看完 {state.videoDone}/{state.videoTotal}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#334155" }}>章節測驗</span>
            <span style={{ color: state.quizDone === state.quizTotal ? "#16a34a" : "#b45309", fontWeight: 600 }}>已通過 {state.quizDone}/{state.quizTotal}</span>
          </div>
        </div>
        <a href="/classroom" style={{ display: "inline-block", marginTop: 20, color: "#2563eb", fontSize: 14, textDecoration: "none" }}>← 繼續上課</a>
      </div>
    </div>
  );

  const issued = state.issuedAt ? new Date(state.issuedAt).toLocaleDateString("zh-TW") : "";

  return (
    <div style={{ ...wrap, display: "block", padding: 0 }}>
      <style>{`
        @media print {
          .cert-noprint { display: none !important; }
          .cert-page { background: #fff !important; padding: 0 !important; }
          .cert-card { box-shadow: none !important; border: none !important; margin: 0 auto !important; }
        }
      `}</style>
      <div className="cert-page" style={{ minHeight: "100vh", background: "#f1f5f9", padding: 24, display: "grid", placeItems: "center", fontFamily: F }}>
        <div>
          <div className="cert-card" style={{
            width: "100%", maxWidth: 640, background: "#fff", borderRadius: 8,
            border: "1px solid #e5e7eb", boxShadow: "0 10px 50px rgba(0,0,0,.10)",
            padding: "56px 56px 48px", textAlign: "center", position: "relative",
          }}>
            <div style={{ position: "absolute", inset: 10, border: "1px solid #dbe3ef", borderRadius: 4, pointerEvents: "none" }} />
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}><Logo size={30} /></div>
            <div style={{ fontSize: 12, letterSpacing: ".28em", color: "#2563eb", fontWeight: 600, textTransform: "uppercase", marginBottom: 22 }}>Certificate of Completion</div>
            <div style={{ fontSize: 14, color: "#64748b", marginBottom: 6 }}>茲證明</div>
            <div style={{ fontSize: 30, fontWeight: 700, color: "#0f172a", letterSpacing: ".02em", marginBottom: 14 }}>{state.name}</div>
            <div style={{ fontSize: 15, color: "#475569", lineHeight: 1.9 }}>已完成線上課程</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: "#0f172a", margin: "6px 0 26px" }}>《{state.courseTitle}》</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 30, paddingTop: 18, borderTop: "1px solid #eef2f7" }}>
              <div style={{ textAlign: "left", fontSize: 12, color: "#94a3b8" }}>
                發證日期<br /><span style={{ color: "#334155", fontSize: 13 }}>{issued}</span>
              </div>
              <div style={{ textAlign: "right", fontSize: 12, color: "#94a3b8" }}>
                驗證碼<br /><span style={{ color: "#334155", fontSize: 13, fontFamily: "ui-monospace,monospace" }}>{state.certCode}</span>
              </div>
            </div>
          </div>
          <div className="cert-noprint" style={{ textAlign: "center", marginTop: 20 }}>
            <button onClick={() => window.print()} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 10, padding: "11px 26px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: F }}>列印／存成 PDF</button>
            <div style={{ marginTop: 14 }}><a href="/classroom" style={{ color: "#94a3b8", fontSize: 13, textDecoration: "none" }}>← 返回教室</a></div>
          </div>
        </div>
      </div>
    </div>
  );
}
