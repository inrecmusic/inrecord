"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { isValidMobile, LEVELS } from "@/lib/student-profile";
import ProfileFields from "./ProfileFields";

// 首次引導：已購課但核心資料（姓名／手機／鋼琴程度）未填時顯示。
// 儀表板與播放頁共用同一份（原本兩檔各有一份逐字重複的副本，改動容易只改到一邊而行為分歧）。
// fontFamily 由呼叫端傳入（兩頁字體變數不同）。

// 存檔前取當下最新 access_token：頁面掛太久 token 會過期，直接用舊的會 401。
async function freshToken(fallback) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || fallback || "";
  } catch { return fallback || ""; }
}

export default function ProfileOnboarding({ token, initial, onDone, fontFamily }) {
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
      const authToken = await freshToken(token);
      const body = skipOptional ? { real_name: f.real_name, phone: f.phone, level: f.level } : f;
      const r = await fetch("/api/classroom/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify(body),
      });
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
    <div style={{ minHeight: "100vh", background: "#f8fafc", display: "grid", placeItems: "center", padding: "40px 20px", fontFamily }}>
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
