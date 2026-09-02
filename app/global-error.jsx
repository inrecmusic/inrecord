"use client";
// root layout 自己壞掉時 app/error.jsx 也救不了（它活在 layout 裡），由這一層接手。
// 依 Next 規定必須自帶 <html>/<body>，且不能依賴 layout 提供的字型變數。
import { useEffect } from "react";

export default function GlobalError({ error, reset }) {
  useEffect(() => { console.error("[global-error]", error); }, [error]);

  return (
    <html lang="zh-Hant">
      <body style={{ margin: 0, background: "#f8fafc" }}>
        <div style={{
          minHeight: "100vh", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 14,
          padding: "40px 20px", textAlign: "center",
          fontFamily: "system-ui, -apple-system, 'Noto Sans TC', sans-serif", color: "#334155",
        }}>
          <div style={{ fontSize: 40, lineHeight: 1 }}>🎹</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "#0f172a" }}>
            網站暫時出了點狀況
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.7, margin: 0, maxWidth: 420, color: "#64748b" }}>
            請稍後再試一次。若一直出現，再麻煩來信 support@inrecordmusic.com 告訴我們。
          </p>
          <button onClick={() => reset()} style={{
            padding: "10px 22px", borderRadius: 999, border: "none", cursor: "pointer",
            background: "#2563eb", color: "#fff", fontSize: 14, fontWeight: 600, marginTop: 6,
          }}>重新載入</button>
        </div>
      </body>
    </html>
  );
}
