"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Logo from "@/components/Logo";

function SuccessContent() {
  const params  = useSearchParams();
  const tradeNo = params.get("MerTradeNo") || params.get("TradeNo");
  const failed  = params.get("status") === "failed";

  const card = {
    maxWidth: 480, width: "100%", background: "#fff", borderRadius: 24,
    padding: 40, textAlign: "center", boxShadow: "0 20px 60px rgba(15,23,42,.1)",
  };
  const primaryBtn = {
    display: "inline-block", background: "linear-gradient(135deg,#2563eb,#3b82f6)",
    color: "#fff", fontWeight: 900, padding: "14px 28px", borderRadius: 12, textDecoration: "none",
  };
  const ghostBtn = {
    display: "inline-block", border: "1px solid #cbd5e1", color: "#475569",
    fontWeight: 700, padding: "13px 24px", borderRadius: 12, textDecoration: "none",
  };

  if (failed) {
    return (
      <div style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"linear-gradient(135deg,#fff7ed,#fef2f2)"}}>
        <div style={card}>
          <div style={{fontSize:64,marginBottom:16}}>😕</div>
          <Logo size={28} />
          <h1 style={{fontSize:32,letterSpacing:"-.04em",margin:"16px 0 10px"}}>付款未完成</h1>
          <p style={{color:"#64748b",marginBottom:8}}>這筆付款沒有完成，<strong>系統不會向你收取任何費用</strong>。</p>
          <p style={{color:"#64748b",marginBottom:28}}>可能是付款中途取消或銀行未授權，請重新嘗試；若已扣款卻看到此頁，款項會自動退回，也歡迎與我們聯絡。</p>
          {tradeNo && <p style={{fontSize:12,color:"#94a3b8",marginBottom:24}}>訂單編號：{tradeNo}</p>}
          <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
            <a href="/#pricing" style={primaryBtn}>重新購買</a>
            <a href="/contact" style={ghostBtn}>聯絡客服</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"linear-gradient(135deg,#f0fdf4,#eff6ff)"}}>
      <div style={card}>
        <div style={{fontSize:64,marginBottom:16}}>🎹</div>
        <Logo size={28} />
        <h1 style={{fontSize:32,letterSpacing:"-.04em",margin:"16px 0 10px"}}>購買成功！</h1>
        <p style={{color:"#64748b",marginBottom:28}}>恭喜你加入《零基礎流行鋼琴入門課》！<br/>我們已寄出開課確認 Email，請到信箱查收。</p>
        {tradeNo && <p style={{fontSize:12,color:"#94a3b8",marginBottom:24}}>訂單編號：{tradeNo}</p>}
        <a href="/" style={primaryBtn}>回到首頁</a>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<div style={{minHeight:"100vh",display:"grid",placeItems:"center"}}>載入中…</div>}>
      <SuccessContent />
    </Suspense>
  );
}
