"use client";
import styles from "./admin.module.css";
import { ArrowUpRight, X, TrendingUp, CreditCard } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { adminFetch as _api } from "@/lib/admin-client";
import { buildSalesTrend, buildPayDistribution } from "@/lib/dashboard";

// ── Stat Card ──────────────────────────────────────────────────────────────
export function StatCard({label,value,sub,icon:Icon,growth,color="#2563eb"}){
  const isUp=growth&&growth.startsWith("+");
  return(
    <div className={styles.statCard}>
      <div className={styles.statHead}><span className={styles.statLabel}>{label}</span>{Icon&&<span className={styles.statIcon} style={{color}}><Icon size={16}/></span>}</div>
      <strong className={styles.statValue}>{value}</strong>
      <div className={styles.statFoot}>
        <span className={styles.statSub}>{sub}</span>
        {growth&&<span className={`${styles.statGrowth} ${isUp?styles.up:styles.down}`}><ArrowUpRight size={12}/>{growth}</span>}
      </div>
    </div>
  );
}

// 憑證圖（proof-uploads 為私有 bucket）：向 /api/admin/proof-signed 取短期簽名 URL 顯示
export function ProofImage({ url }) {
  const [signed, setSigned] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setSigned(null); setErr(false);
    _api("/api/admin/proof-signed", { method: "POST", body: JSON.stringify({ url }) })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => { if (!cancelled) (d.signedUrl ? setSigned(d.signedUrl) : setErr(true)); })
      .catch(() => { if (!cancelled) setErr(true); });
    return () => { cancelled = true; };
  }, [url]);
  if (err) return <span style={{ color: "#dc2626", fontSize: 13 }}>憑證載入失敗</span>;
  if (!signed) return <span style={{ color: "#94a3b8", fontSize: 13 }}>載入憑證…</span>;
  return <a href={signed} target="_blank" rel="noreferrer"><img src={signed} alt="憑證" style={{ maxWidth: "100%", maxHeight: 280, borderRadius: 8, border: "1px solid #ddd" }} /></a>;
}

// 寄信常用範本（追單/歡迎/退款）—— 選了會填入主旨與內文，可再自由編輯。
export const EMAIL_TEMPLATES = [
  { id: "", name: "— 套用範本 —", subject: "", body: "" },
  { id: "followup", name: "追單（未完成付款）", subject: "您的課程訂單尚未完成付款 🎹",
    body: "嗨，\n\n感謝您選擇 InRecord！我們注意到您的課程訂單尚未完成付款。\n\n名額有限，完成付款即可保留您的優惠價與課程權益：\n\n- **付款連結**：（請貼上付款連結）\n- 若已完成付款請忽略本信。\n\n如有任何問題，直接回覆此信即可，我們很樂意協助 🙌" },
  { id: "welcome", name: "歡迎 / 開通通知", subject: "歡迎加入 InRecord！課程已為您開通 🎹",
    body: "嗨，\n\n歡迎加入 InRecord，您的課程已開通！\n\n- **登入方式**：請用本次購買的 Email 登入教室\n- 課程連結：https://inrecordmusic.com/classroom\n\n祝學習愉快，有任何問題隨時回覆此信 🙌" },
  { id: "refund", name: "退款通知", subject: "您的 InRecord 退款已處理",
    body: "嗨，\n\n您的退款申請已處理完成，款項將依原付款方式退還（信用卡約 3–7 個工作天、ATM/超商依銀行作業時間）。\n\n退款後，本課程之觀看權限已同步終止。\n\n如有任何問題，直接回覆此信即可。" },
];

// 單封自訂信（追單/客服）：對單一消費者寄一封自己編輯的信。內文支援受限 Markdown。
export function ComposeEmailModal({ open, initialTo = "", onClose, showToast }) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setTo(initialTo || ""); setSubject(""); setBody(""); setBusy(false); } }, [open, initialTo]);
  function applyTemplate(id) { const t = EMAIL_TEMPLATES.find(x => x.id === id); if (t && t.id) { setSubject(t.subject); setBody(t.body); } }
  if (!open) return null;

  async function send() {
    if (busy) return;
    const em = to.trim();
    if (!em) { showToast?.("❌ 請填寫收件 Email"); return; }
    if (!subject.trim() || !body.trim()) { showToast?.("❌ 請填寫主旨與內文"); return; }
    setBusy(true);
    try {
      const res = await _api("/api/admin/send-custom-email", { method: "POST", body: JSON.stringify({ to: em, subject: subject.trim(), bodyMd: body }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.ok === false) showToast?.("❌ 寄送失敗：" + (d.error || "unknown"));
      else { showToast?.("✅ 已寄出給 " + em); onClose?.(); }
    } catch (e) { showToast?.("❌ 寄送失敗：" + e.message); }
    finally { setBusy(false); }
  }

  const lbl = { fontSize: 13, fontWeight: 700, color: "#374151", display: "block" };
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalCard} style={{ width: "min(580px,100%)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>✉️ 寄信給客人</h3>
          <button className={styles.iconBtn} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          <label style={lbl}>常用範本
            <select className={styles.searchInput} style={{ width: "100%", marginTop: 4 }} defaultValue="" onChange={e => { applyTemplate(e.target.value); e.target.value = ""; }}>
              {EMAIL_TEMPLATES.map(t => <option key={t.id || "_"} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label style={lbl}>收件 Email
            <input className={styles.searchInput} style={{ width: "100%", marginTop: 4 }} type="email" value={to} onChange={e => setTo(e.target.value)} placeholder="customer@example.com" />
          </label>
          <label style={lbl}>主旨
            <input className={styles.searchInput} style={{ width: "100%", marginTop: 4 }} value={subject} onChange={e => setSubject(e.target.value)} placeholder="例如：您的課程訂單尚未完成付款" />
          </label>
          <label style={lbl}>內文<span style={{ fontWeight: 400, color: "#94a3b8" }}>（Markdown：# 標題、**粗體**、- 清單、--- 分隔線、[文字](網址)＝連結、整行只放連結＝置中按鈕）</span>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={10} style={{ width: "100%", marginTop: 4, padding: 10, borderRadius: 8, border: "1px solid #e2e8f0", fontFamily: "inherit", fontSize: 14, lineHeight: 1.7, resize: "vertical" }} placeholder={"嗨，\n\n感謝您的支持！我們注意到您的訂單尚未完成付款。\n\n以下是您的付款連結：…\n\n如有任何問題，直接回覆此信即可。"} />
          </label>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className={styles.btnSmall} onClick={onClose} disabled={busy}>取消</button>
            <button className={`${styles.btnSmall} ${styles.green}`} onClick={send} disabled={busy}>{busy ? "寄送中…" : "寄送"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 批次追單：對一批未付款/失敗訂單的消費者一次寄出同一封追單信。
export function BulkFollowupModal({ open, recipients = [], onClose, showToast }) {
  const FOLLOWUP = EMAIL_TEMPLATES.find(t => t.id === "followup");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (open) { setSubject(FOLLOWUP?.subject || ""); setBody(FOLLOWUP?.body || ""); setBusy(false); setResult(null); }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 開啟時以當下範本重設欄位，不隨範本物件變動重跑
  }, [open]);
  function applyTemplate(id) { const t = EMAIL_TEMPLATES.find(x => x.id === id); if (t && t.id) { setSubject(t.subject); setBody(t.body); } }
  if (!open) return null;

  async function send() {
    if (busy) return;
    if (!recipients.length) { showToast?.("❌ 沒有可追單的收件人"); return; }
    if (!subject.trim() || !body.trim()) { showToast?.("❌ 請填寫主旨與內文"); return; }
    if (!window.confirm(`確定要對 ${recipients.length} 位未付款顧客寄出追單信嗎？`)) return;
    setBusy(true); setResult(null);
    try {
      const res = await _api("/api/admin/bulk-followup", { method: "POST", body: JSON.stringify({ emails: recipients, subject: subject.trim(), bodyMd: body }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.ok === false) { showToast?.("❌ 批次寄送失敗：" + (d.error || "unknown")); setBusy(false); return; }
      setResult(d);
      showToast?.(`✅ 已寄出 ${d.sent}/${d.total}${d.failed?.length ? `，失敗 ${d.failed.length}` : ""}`);
    } catch (e) { showToast?.("❌ 批次寄送失敗：" + e.message); }
    finally { setBusy(false); }
  }

  const lbl = { fontSize: 13, fontWeight: 700, color: "#374151", display: "block" };
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalCard} style={{ width: "min(580px,100%)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>📨 批次追單</h3>
          <button className={styles.iconBtn} onClick={onClose}><X size={18} /></button>
        </div>
        {result ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ fontSize: 14, color: "#374151" }}>已寄出 <b style={{ color: "#16a34a" }}>{result.sent}</b> / {result.total} 封{result.failed?.length ? <>，失敗 <b style={{ color: "#dc2626" }}>{result.failed.length}</b></> : null}。</div>
            {result.failed?.length ? (
              <div style={{ maxHeight: 160, overflow: "auto", fontSize: 12, color: "#dc2626", background: "#fef2f2", borderRadius: 8, padding: 10 }}>
                {result.failed.map((f, i) => <div key={i}>{f.to}：{f.error}</div>)}
              </div>
            ) : null}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className={styles.btnSmall} onClick={onClose}>關閉</button>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ fontSize: 13, color: "#475569", background: "#f8fafc", borderRadius: 8, padding: "8px 12px" }}>
              將寄給目前篩選出的 <b>{recipients.length}</b> 位未付款／付款失敗顧客（已自動去重）。
            </div>
            <label style={lbl}>常用範本
              <select className={styles.searchInput} style={{ width: "100%", marginTop: 4 }} defaultValue="" onChange={e => { applyTemplate(e.target.value); e.target.value = ""; }}>
                {EMAIL_TEMPLATES.map(t => <option key={t.id || "_"} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label style={lbl}>主旨
              <input className={styles.searchInput} style={{ width: "100%", marginTop: 4 }} value={subject} onChange={e => setSubject(e.target.value)} placeholder="例如：您的課程訂單尚未完成付款" />
            </label>
            <label style={lbl}>內文<span style={{ fontWeight: 400, color: "#94a3b8" }}>（Markdown：# 標題、**粗體**、- 清單、--- 分隔線、[文字](網址)＝連結、整行只放連結＝置中按鈕）</span>
              <textarea value={body} onChange={e => setBody(e.target.value)} rows={10} style={{ width: "100%", marginTop: 4, padding: 10, borderRadius: 8, border: "1px solid #e2e8f0", fontFamily: "inherit", fontSize: 14, lineHeight: 1.7, resize: "vertical" }} />
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className={styles.btnSmall} onClick={onClose} disabled={busy}>取消</button>
              <button className={`${styles.btnSmall} ${styles.green}`} onClick={send} disabled={busy || !recipients.length}>{busy ? "寄送中…" : `寄給 ${recipients.length} 位`}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Order status pill helper ───────────────────────────────────────────────
export function OrderStatusPill({status}){
  const MAP={paid:["已付款","#dcfce7","#166534"],pending:["待付款","#fef3c7","#92400e"],refunded:["已退款","#dbeafe","#1e40af"],failed:["付款失敗","#fee2e2","#991b1b"],cancelled:["已取消","#f1f5f9","#475569"]};
  const [label,bg,fg]=MAP[status]||MAP.pending;
  return <span className={styles.pill} style={{background:bg,color:fg}}>{label}</span>;
}

export function fmt(v){if(!v)return "—";try{return new Date(v).toLocaleString("zh-TW");}catch{return v;}}

export function levelLabel(l){return{none:"沒碰過",little:"摸過一點",some:"有基礎"}[l]||"—";}

export function genderLabel(v){return{male:"男",female:"女",other:"其他",prefer_not:"不願透露"}[v]||"—";}

// PayUni PaymentType 數字→中文（比照 lib/dashboard.js PAY_TYPE_LABELS）；未知原樣顯示、空值—
export function payTypeLabel(v){return{"1":"信用卡","2":"ATM轉帳","3":"超商代碼",Credit:"信用卡",ATM:"ATM轉帳",CVS:"超商代碼"}[v]||v||"—";}

// ── Markdown default content ───────────────────────────────────────────────
// ── Markdown renderer ──────────────────────────────────────────────────────
export function renderMd(text){
  const lines=text.split("\n");
  const out=[];let listBuf=[];let key=0;let tl=null;
  function flush(){if(!listBuf.length)return;out.push(<ul key={key++} style={{margin:"6px 0 14px",paddingLeft:22,display:"grid",gap:5}}>{listBuf}</ul>);listBuf=[];}
  function tlRow(line){const p=line.split("|").map(s=>s.trim());let sub="",dim=false;p.slice(2).forEach(x=>{if(x.toLowerCase()==="dim")dim=true;else if(x)sub=x;});return{badge:p[0]||"",title:p[1]||"",sub,dim};}
  function tlCard(rows){return(<div key={key++} style={{background:"#eff4ff",borderRadius:16,padding:"18px 18px 6px",margin:"6px 0 18px"}}>{rows.map((r,ri)=>(<div key={ri} style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}><div style={{flex:"0 0 40px",width:40,height:40,borderRadius:20,background:r.dim?"#cbd5e1":"#2563eb",color:"#fff",fontWeight:800,fontSize:r.badge.length>=4?11:12,display:"flex",alignItems:"center",justifyContent:"center"}}>{r.badge}</div><div><div style={{fontSize:15,fontWeight:800,color:r.dim?"#94a3b8":"#0f172a"}}>{r.title}</div>{r.sub?<div style={{fontSize:12,color:"#64748b",marginTop:2}}>{r.sub}</div>:null}</div></div>))}</div>);}
  function inline(s){
    const parts=[];
    s.split(/(\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g).forEach((p,i)=>{
      const link=p.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if(link)parts.push(<a key={i} href={link[2]} target="_blank" rel="noreferrer" style={{color:"#2563eb"}}>{link[1]}</a>);
      else if(p.startsWith("**")&&p.endsWith("**")&&p.length>4)parts.push(<strong key={i}>{p.slice(2,-2)}</strong>);
      else if(p.startsWith("*")&&p.endsWith("*")&&p.length>2)parts.push(<em key={i}>{p.slice(1,-1)}</em>);
      else parts.push(p);
    });
    return parts;
  }
  for(let i=0;i<lines.length;i++){
    const l=lines[i];
    // :::timeline 區塊、@badge/@subtitle 指令（後者呈現在深色頁首、預覽內文略過）
    if(tl){if(l.trim()===":::"){out.push(tlCard(tl));tl=null;}else if(l.trim()!=="")tl.push(tlRow(l));continue;}
    if(l.trim()===":::timeline"){flush();tl=[];continue;}
    if(/^@(badge|subtitle)\s+/.test(l.trim()))continue;
    const imgM=l.trim().match(/^!\[([^\]]*)\]\((https?:\/\/[^)\s|]+)(?:\|(\d{1,4}))?\)$/);
    if(imgM){flush();const w=imgM[3]?Math.min(560,Number(imgM[3])):160;out.push(<p key={key++} style={{textAlign:"center",margin:"8px 0 18px"}}><img src={imgM[2]} alt={imgM[1]} style={{width:w,maxWidth:"80%",height:"auto"}}/></p>);}
    else if(l.startsWith("# ")){flush();out.push(<h1 key={key++} style={{fontSize:22,fontWeight:900,color:"#0f172a",margin:"0 0 6px",letterSpacing:"-.03em"}}>{inline(l.slice(2))}</h1>);}
    else if(l.startsWith("## ")){flush();out.push(<h2 key={key++} style={{fontSize:16,fontWeight:900,color:"#0f172a",margin:"24px 0 8px",paddingBottom:7,borderBottom:"1px solid #f1f5f9"}}>{inline(l.slice(3))}</h2>);}
    else if(l.startsWith("### ")){flush();out.push(<h3 key={key++} style={{fontSize:14,fontWeight:800,color:"#1e293b",margin:"14px 0 5px"}}>{inline(l.slice(4))}</h3>);}
    else if(l.trim()==="---"){flush();out.push(<hr key={key++} style={{border:"none",borderTop:"1px solid #e2e8f0",margin:"16px 0"}}/>);}
    else if(l.startsWith("- ")){listBuf.push(<li key={key++} style={{fontSize:14,color:"#374151",lineHeight:1.75}}>{inline(l.slice(2))}</li>);}
    else if(l.trim()===""){flush();}
    else{
      flush();
      // 整行只有一個連結 → 置中按鈕（與 lib/newsletter.js 實寄樣式一致）
      const btn=l.trim().match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if(btn)out.push(<p key={key++} style={{textAlign:"center",margin:"24px 0"}}><a href={btn[2]} target="_blank" rel="noreferrer" style={{display:"inline-block",background:"#2563eb",color:"#fff",fontWeight:700,fontSize:15,padding:"13px 32px",borderRadius:999,textDecoration:"none"}}>{btn[1]}</a></p>);
      else out.push(<p key={key++} style={{fontSize:14,color:"#374151",lineHeight:1.8,margin:"0 0 10px"}}>{inline(l)}</p>);
    }
  }
  if(tl)out.push(tlCard(tl));
  flush();return out;
}

// ── Chart helpers ──────────────────────────────────────────────────────────
// 銷售趨勢分桶改用 lib/dashboard.js 的 buildSalesTrend（真實訂單，可測）。
export function smoothPath(pts) {
  if (!pts.length) return "";
  let d=`M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i=1;i<pts.length;i++){const p=pts[i-1],c=pts[i],cx=((p.x+c.x)/2).toFixed(1); d+=` C ${cx} ${p.y.toFixed(1)} ${cx} ${c.y.toFixed(1)} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`;}
  return d;
}

export const CHART_FILTERS = [{key:"day",label:"最近 24 小時"},{key:"week",label:"本週"},{key:"month",label:"月"},{key:"year",label:"年"}];

export function FilterBtns({filter,onFilter}){return(<div className={styles.filterGroup}>{CHART_FILTERS.map(f=>(<button key={f.key} className={`${styles.filterBtn} ${filter===f.key?styles.filterActive:""}`} onClick={()=>onFilter(f.key)}>{f.label}</button>))}</div>);}

// ── Charts ─────────────────────────────────────────────────────────────────
export function SalesTrendChart({orders=[],filter,onFilter}){
  const data=useMemo(()=>buildSalesTrend(orders,filter,new Date()),[orders,filter]);
  const W=800,H=220,pL=54,pR=44,pT=16,pB=34,cW=W-pL-pR,cH=H-pT-pB;
  const maxRev=Math.max(...data.map(d=>d.revenue),1),maxOrd=Math.max(...data.map(d=>d.orders),1);
  const revCeil=Math.ceil(maxRev/10000)*10000,ordCeil=Math.ceil(maxOrd/3)*3;
  const xStep=data.length>1?cW/(data.length-1):cW;
  const revPts=data.map((d,i)=>({x:pL+i*xStep,y:pT+cH-(d.revenue/revCeil)*cH}));
  const ordPts=data.map((d,i)=>({x:pL+i*xStep,y:pT+cH-(d.orders/ordCeil)*cH}));
  const revTicks=[0,.25,.5,.75,1].map(p=>({y:pT+cH*(1-p),label:p===0?"0":`${((revCeil*p)/10000).toFixed(1)}萬`}));
  const ordTicks=[0,.25,.5,.75,1].map(p=>({y:pT+cH*(1-p),label:Math.round(ordCeil*p)}));
  const showEvery=data.length>20?Math.ceil(data.length/14):1,dotEvery=data.length>14?Math.ceil(data.length/14):1;
  return(
    <div className={styles.chartCard} style={{flex:"1 1 0"}}>
      <div className={styles.chartHead}><div className={styles.chartTitle}><TrendingUp size={15}/><span>銷售趨勢</span></div><FilterBtns filter={filter} onFilter={onFilter}/></div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",display:"block"}}>
        {revTicks.slice(1).map((t,i)=><line key={i} x1={pL} y1={t.y} x2={W-pR} y2={t.y} stroke="#f1f5f9" strokeWidth="1"/>)}
        {revTicks.map((t,i)=><text key={i} x={pL-6} y={t.y+4} textAnchor="end" fontSize="11" fill="#94a3b8">{t.label}</text>)}
        {ordTicks.map((t,i)=><text key={i} x={W-pR+6} y={t.y+4} textAnchor="start" fontSize="11" fill="#94a3b8">{t.label}</text>)}
        {data.map((d,i)=>i%showEvery===0?<text key={i} x={pL+i*xStep} y={H-6} textAnchor="middle" fontSize="11" fill="#94a3b8">{d.label}</text>:null)}
        <path d={`${smoothPath(revPts)} L ${revPts[revPts.length-1].x.toFixed(1)} ${pT+cH} L ${pL} ${pT+cH} Z`} fill="#f59e0b" fillOpacity="0.07"/>
        <path d={smoothPath(revPts)} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d={`${smoothPath(ordPts)} L ${ordPts[ordPts.length-1].x.toFixed(1)} ${pT+cH} L ${pL} ${pT+cH} Z`} fill="#1e293b" fillOpacity="0.04"/>
        <path d={smoothPath(ordPts)} fill="none" stroke="#1e293b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        {revPts.filter((_,i)=>i%dotEvery===0).map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="3" fill="#f59e0b" stroke="#fff" strokeWidth="1.5"/>)}
        {ordPts.filter((_,i)=>i%dotEvery===0).map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="3" fill="#1e293b" stroke="#fff" strokeWidth="1.5"/>)}
      </svg>
      <div className={styles.chartLegend}><span><span className={styles.dot} style={{background:"#1e293b"}}/>訂單數</span><span><span className={styles.dot} style={{background:"#f59e0b"}}/>營收</span></div>
    </div>
  );
}

export function DonutChart({orders=[],filter,onFilter}){
  const dist=useMemo(()=>buildPayDistribution(orders,filter,new Date()),[orders,filter]);
  const total=dist.reduce((s,d)=>s+d.count,0);
  const R=58,C=2*Math.PI*R; let acc=0;
  return(
    <div className={styles.chartCard} style={{width:360,flexShrink:0}}>
      <div className={styles.chartHead}><div className={styles.chartTitle}><CreditCard size={15}/><span>付款方式分布</span></div><FilterBtns filter={filter} onFilter={onFilter}/></div>
      {total===0?(
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:170,color:"#94a3b8",fontSize:13,flexDirection:"column",gap:8}}>
          <CreditCard size={28} color="#e2e8f0"/><span>尚無付款數據</span>
        </div>
      ):(
        <div style={{display:"flex",alignItems:"center",gap:18,padding:"10px 6px"}}>
          <svg width="140" height="140" viewBox="0 0 140 140" style={{flexShrink:0}}>
            <g transform="rotate(-90 70 70)">
              {dist.map((d,i)=>{const frac=d.count/total;const seg=frac*C;const off=-acc*C;acc+=frac;
                return <circle key={i} cx="70" cy="70" r={R} fill="none" stroke={DONUT_COLORS[i%DONUT_COLORS.length]} strokeWidth="18" strokeDasharray={`${seg.toFixed(2)} ${(C-seg).toFixed(2)}`} strokeDashoffset={off.toFixed(2)}/>;})}
            </g>
            <text x="70" y="65" textAnchor="middle" fontSize="12" fill="#94a3b8">總筆數</text>
            <text x="70" y="87" textAnchor="middle" fontSize="22" fontWeight="800" fill="#0f172a">{total}</text>
          </svg>
          <div style={{flex:1,display:"grid",gap:9,minWidth:0}}>
            {dist.map((d,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:12.5}}>
                <span style={{width:10,height:10,borderRadius:3,background:DONUT_COLORS[i%DONUT_COLORS.length],flexShrink:0}}/>
                <span style={{flex:1,color:"#374151",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{d.label}</span>
                <span style={{fontWeight:800,color:"#0f172a"}}>{d.count}</span>
                <span style={{color:"#94a3b8",width:36,textAlign:"right"}}>{Math.round(d.count/total*100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Audit / Email Log Page ─────────────────────────────────────────────────
export const EMAIL_KIND_LABEL={purchase:"購買確認",presale:"預購信",launch:"開課通知",newsletter:"電子報",custom:"自訂信",followup:"批次追單"};

// 學員資料頁（student_profiles）enum 顯示對照，比照 levelLabel；空值/未知值一律回退「—」。
export function sourceLabel(v){return{ig:"Instagram",friend:"朋友介紹",concert:"演奏會",search:"網路搜尋",other:"其他"}[v]||"—";}

export function equipmentLabel(v){return{acoustic:"鋼琴",digital:"電鋼琴",none:"目前沒有"}[v]||"—";}

export function ageGroupLabel(v){return{"under18":"未滿18","18_29":"18–29","30_44":"30–44","45_59":"45–59","60plus":"60以上"}[v]||"—";}

// ── Helpers ────────────────────────────────────────────────────────────────
export function statusLabel(s){return{requested:"已留 Email",preview_mode:"預覽模式",email_sent:"已寄試看信",demo_opened:"已開 Demo",purchased:"已購買"}[s]||s||"—";}

export const DONUT_COLORS=["#2563eb","#7c3aed","#f59e0b","#16a34a","#dc2626","#0891b2"];
