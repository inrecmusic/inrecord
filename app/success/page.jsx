"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Logo from "@/components/Logo";

function SuccessContent() {
  const params  = useSearchParams();
  const tradeNo = params.get("MerTradeNo") || params.get("TradeNo");

  return (
    <div style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"linear-gradient(135deg,#f0fdf4,#eff6ff)"}}>
      <div style={{maxWidth:480,width:"100%",background:"#fff",borderRadius:24,padding:40,textAlign:"center",boxShadow:"0 20px 60px rgba(15,23,42,.1)"}}>
        <div style={{fontSize:64,marginBottom:16}}>🎹</div>
        <Logo size={28} />
        <h1 style={{fontSize:32,letterSpacing:"-.04em",margin:"16px 0 10px"}}>購買成功！</h1>
        <p style={{color:"#64748b",marginBottom:28}}>恭喜你加入《零基礎流行鋼琴入門課》！<br/>我們已寄出開課確認 Email，請到信箱查收。</p>
        {tradeNo && <p style={{fontSize:12,color:"#94a3b8",marginBottom:24}}>訂單編號：{tradeNo}</p>}
        <a href="/" style={{display:"inline-block",background:"linear-gradient(135deg,#2563eb,#3b82f6)",color:"#fff",fontWeight:900,padding:"14px 28px",borderRadius:12,textDecoration:"none"}}>回到首頁</a>
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
