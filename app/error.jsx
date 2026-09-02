"use client";
// 路由段錯誤邊界。任一頁在 render 期間丟出未捕捉的例外（如 2026-09-02 播放頁的 ReferenceError）
// 時由這裡接手，換成可自救的提示，而不是整頁空白。教室內的錯誤多給一個回教室的出口。
import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function RouteError({ error, reset }) {
  const pathname = usePathname() || "";
  const inClassroom = pathname.startsWith("/classroom");

  // 只寫 console：前端目前沒有錯誤上報服務，至少讓使用者截圖時帶得走訊息。
  useEffect(() => { console.error("[route-error]", pathname, error); }, [error, pathname]);

  return (
    <div style={{
      minHeight: "70vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 14,
      padding: "40px 20px", textAlign: "center",
      fontFamily: "var(--type-body)", color: "#334155",
    }}>
      <div style={{ fontSize: 40, lineHeight: 1 }}>🎹</div>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "#0f172a" }}>
        這一頁出了點狀況
      </h1>
      <p style={{ fontSize: 14, lineHeight: 1.7, margin: 0, maxWidth: 420, color: "#64748b" }}>
        重新載入通常就會好。若一直出現，再麻煩來信 support@inrecordmusic.com 告訴我們，
        我們會盡快處理。
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 6 }}>
        <button onClick={() => reset()} style={{
          padding: "10px 22px", borderRadius: 999, border: "none", cursor: "pointer",
          background: "#2563eb", color: "#fff", fontSize: 14, fontWeight: 600,
        }}>重新載入</button>
        <a href={inClassroom ? "/classroom" : "/"} style={{
          padding: "10px 22px", borderRadius: 999, cursor: "pointer",
          border: "1px solid #cbd5e1", background: "#fff", color: "#334155",
          fontSize: 14, fontWeight: 600, textDecoration: "none",
        }}>{inClassroom ? "回教室" : "回首頁"}</a>
      </div>
    </div>
  );
}
