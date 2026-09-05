"use client";
import { useState, useEffect } from "react";
import styles from "./admin.module.css";
import { BarChart2, TrendingUp } from "lucide-react";

// ── Integration Page ───────────────────────────────────────────────────────
export default function IntegrationPage({showToast}){
  const [payuniStatus,setPayuniStatus]=useState("unknown");const [payuniMsg,setPayuniMsg]=useState("");

  // ── 分析追蹤設定 ──────────────────────────────────────────────────────────
  const LS_ANALYTICS="inrecord_analytics";
  const ADEF={gaId:"",phKey:"",phHost:"https://us.i.posthog.com",phPersonalKey:"",pixelId:"",capiToken:""};
  const [a,setA]=useState(ADEF);
  const [aSaved,setASaved]=useState(ADEF);
  const aDirty=JSON.stringify(a)!==JSON.stringify(aSaved);
  const af=(k)=>(e)=>setA(p=>({...p,[k]:e.target.value}));
  useEffect(()=>{try{const v=JSON.parse(localStorage.getItem(LS_ANALYTICS)||"null");if(v){setA(v);setASaved(v);}}catch{}},[]);
  function saveAnalytics(){localStorage.setItem(LS_ANALYTICS,JSON.stringify(a));setASaved({...a});showToast("✅ 分析追蹤設定已儲存");}

  async function testPayuni(){if(payuniStatus==="testing")return;setPayuniMsg("測試中…");setPayuniStatus("testing");try{const res=await fetch("/api/payuni/checkout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dryRun:true})});const d=await res.json().catch(()=>({}));if(res.ok&&d.ok){setPayuniStatus("ok");setPayuniMsg("✅ Payuni 設定正常");}else throw new Error(d.error||"config_missing");}catch(e){setPayuniStatus("error");setPayuniMsg("❌ "+(e.message.includes("fetch")?"後端尚未部署":e.message));}}
  const s2={card:{background:"#fff",border:"1px solid #e2e8f0",borderRadius:20,padding:24,marginBottom:20},h3:{margin:"0 0 4px",fontSize:20},desc:{color:"#64748b",fontSize:14,margin:"0 0 16px"},stepList:{paddingLeft:20,display:"grid",gap:8,fontSize:14,color:"#334155"},codeBlock:{background:"#0f172a",color:"#e2e8f0",borderRadius:12,padding:16,fontFamily:"monospace",fontSize:13,lineHeight:1.8,overflowX:"auto"},envTable:{width:"100%",borderCollapse:"collapse",fontSize:13,marginTop:10},th:{background:"#f8fafc",color:"#94a3b8",padding:"10px 12px",textAlign:"left",borderBottom:"1px solid #e2e8f0",fontSize:12,textTransform:"uppercase"},td:{padding:"10px 12px",borderBottom:"1px solid #e2e8f0"},code:{background:"#f1f5f9",padding:"2px 6px",borderRadius:5,fontFamily:"monospace",fontSize:12},badge:(s)=>({display:"inline-flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:999,fontSize:13,fontWeight:900,background:s==="ok"?"#dcfce7":s==="error"?"#fee2e2":"#f1f5f9",color:s==="ok"?"#166534":s==="error"?"#991b1b":"#6b7280"}),testRow:{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",marginTop:16}};
  return(
    <div>
      <div className={styles.pageHeader}><div><h1>系統設定</h1><p>管理外部服務整合與環境變數</p></div></div>
      <div style={s2.card}>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:12}}><div style={{width:48,height:48,borderRadius:14,background:"#0B996E",display:"grid",placeItems:"center",color:"#fff",fontWeight:900,fontSize:20,flexShrink:0}}>B</div><div style={{flex:1}}><h3 style={s2.h3}>Brevo</h3><div style={{color:"#94a3b8",fontSize:13}}>交易與課程通知信寄送（lib/brevo）</div></div></div>
        <p style={s2.desc}>課程購買成功後，後端透過 Brevo 寄送開課通知信（<code style={s2.code}>lib/brevo</code>），供 notify 開課信與後台補寄信使用。</p>
        <table style={s2.envTable}><thead><tr><th style={s2.th}>環境變數</th><th style={s2.th}>說明</th><th style={s2.th}>範例</th></tr></thead><tbody>{[["BREVO_API_KEY","Brevo API 金鑰","xkeysib-xxx..."],["BREVO_LIST_ID","目標名單 ID","3"],["BREVO_SENDER_EMAIL","已驗證寄件人","hello@你的網域.com"],["BREVO_SENDER_NAME","寄件人名稱","InRecord"],["BREVO_TEMPLATE_ID","（可選）Template ID","5"]].map(([k,d,e])=><tr key={k}><td><code style={s2.code}>{k}</code></td><td style={{color:"#64748b"}}>{d}</td><td style={{color:"#94a3b8"}}><code style={s2.code}>{e}</code></td></tr>)}</tbody></table>
        <ol style={s2.stepList}><li>前往 <strong>app.brevo.com</strong> → Settings → API Keys → 建立新的 API Key</li><li>Contacts → Lists → 建立名單，記下 List ID</li><li>Settings → Senders → 新增並驗證寄件人 Email</li><li><strong>Vercel</strong> → Settings → Environment Variables 填入所有變數後重新部署</li></ol>
      </div>
      <div style={s2.card}>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:12}}><div style={{width:48,height:48,borderRadius:14,background:"#D4192C",display:"grid",placeItems:"center",color:"#fff",fontWeight:900,fontSize:16,flexShrink:0}}>PAY</div><div style={{flex:1}}><h3 style={s2.h3}>Payuni 統一金流</h3><div style={{color:"#94a3b8",fontSize:13}}>信用卡、ATM 轉帳、超商繳費 金流結帳</div></div><div style={s2.badge(payuniStatus)}>{payuniStatus==="ok"?"已連線":payuniStatus==="error"?"連線失敗":"未測試"}</div></div>
        <table style={s2.envTable}><thead><tr><th style={s2.th}>環境變數</th><th style={s2.th}>說明</th></tr></thead><tbody>{[["PAYUNI_MERCHANT_ID","特店代號（Payuni 後台取得）"],["PAYUNI_HASH_KEY","HashKey（32 字元）"],["PAYUNI_HASH_IV","HashIV（16 字元）"],["PAYUNI_API_URL","正式：https://api.payuni.com.tw/api/upp"],["NEXT_PUBLIC_SITE_URL","正式網域，用於 ReturnURL / NotifyURL"]].map(([k,d])=><tr key={k}><td><code style={s2.code}>{k}</code></td><td style={{color:"#64748b"}}>{d}</td></tr>)}</tbody></table>
        <ol style={{...s2.stepList,marginTop:14}}><li>前往 <strong>www.payuni.com.tw</strong> → 申請特店帳號</li><li>後台 → 系統設定 → 取得 特店代號、HashKey、HashIV</li><li>測試環境使用 <code style={s2.code}>https://sandbox-api.payuni.com.tw/api/upp</code></li><li>Vercel 填入所有變數後重新部署，測試通過後換成正式 API URL</li></ol>
        <div style={s2.testRow}><button onClick={testPayuni} disabled={payuniStatus==="testing"} style={{border:0,background:"#D4192C",color:"#fff",borderRadius:10,padding:"9px 14px",fontWeight:900,cursor:payuniStatus==="testing"?"default":"pointer",opacity:payuniStatus==="testing"?0.6:1}}>測試 Payuni 連線</button>{payuniMsg&&<span style={{fontSize:13,fontWeight:800,color:payuniStatus==="ok"?"#16a34a":"#dc2626"}}>{payuniMsg}</span>}</div>
      </div>
      <div style={s2.card}>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:12}}><div style={{width:48,height:48,borderRadius:14,background:"#3ECF8E",display:"grid",placeItems:"center",color:"#fff",fontWeight:900,fontSize:16,flexShrink:0}}>SB</div><div><h3 style={s2.h3}>Supabase</h3><div style={{color:"#94a3b8",fontSize:13}}>PostgreSQL 資料庫・名單 + 訂單記錄</div></div></div>
        <ol style={s2.stepList}><li>前往 <strong>supabase.com</strong> → New project</li><li>SQL Editor → 貼上 <code style={s2.code}>supabase-schema.sql</code> → Run</li><li>Settings → API → 複製 URL、anon key、service_role key</li><li>填入 <code style={s2.code}>NEXT_PUBLIC_SUPABASE_URL</code>、<code style={s2.code}>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>、<code style={s2.code}>SUPABASE_SERVICE_ROLE_KEY</code></li></ol>
        <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:12,padding:14,fontSize:13,color:"#1d4ed8",marginTop:14}}>💡 <strong>沒設定 Supabase 也沒關係</strong>：名單會自動 fallback 到 localStorage。</div>
      </div>
      {/* ── 分析追蹤 ──────────────────────────────────────────────────────── */}
      <div style={s2.card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:10}}>
          <div>
            <h3 style={{...s2.h3,marginBottom:4}}>分析追蹤</h3>
            <div style={{color:"#94a3b8",fontSize:13}}>串接第三方分析工具，追蹤課程頁瀏覽與購買轉換</div>
          </div>
          {aDirty&&<span style={{fontSize:12,fontWeight:800,color:"#92400e",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"4px 10px",alignSelf:"flex-start"}}>有未儲存的變更</span>}
        </div>
        <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:12,padding:"12px 14px",fontSize:13,color:"#92400e",marginBottom:16,lineHeight:1.7}}>⚠️ <strong>尚未實際套用</strong>：此區 ID 目前僅儲存在本機，<strong>網站並未注入任何分析腳本</strong>（GA／PostHog／Pixel 皆未啟用）。要真的開始追蹤需另接腳本注入後才會生效。</div>

        {/* Google Analytics 4 */}
        <div style={{marginBottom:24,paddingBottom:24,borderBottom:"1px solid #f1f5f9"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <div style={{width:34,height:34,borderRadius:9,background:"linear-gradient(135deg,#f59e0b,#d97706)",display:"grid",placeItems:"center",flexShrink:0}}><BarChart2 size={16} color="#fff"/></div>
            <div><div style={{fontWeight:800,fontSize:14,color:"#0f172a"}}>Google Analytics 4</div><div style={{fontSize:12,color:"#94a3b8"}}>追蹤網站流量、事件與電商轉換</div></div>
          </div>
          <div className={styles.formGroup}>
            <label>Google Analytics ID</label>
            <input className={styles.input} value={a.gaId} onChange={af("gaId")} placeholder="G-XXXXXXXXXX"/>
            <span style={{fontSize:11.5,color:"#94a3b8",marginTop:3,display:"block"}}>GA4 管理介面 → 資料串流 → 評估 ID，格式為 <code style={{background:"#f1f5f9",padding:"1px 5px",borderRadius:4,fontFamily:"monospace"}}>G-</code> 開頭</span>
          </div>
        </div>

        {/* PostHog */}
        <div style={{marginBottom:24,paddingBottom:24,borderBottom:"1px solid #f1f5f9"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <div style={{width:34,height:34,borderRadius:9,background:"#1e293b",display:"grid",placeItems:"center",flexShrink:0}}><TrendingUp size={16} color="#fff"/></div>
            <div><div style={{fontWeight:800,fontSize:14,color:"#0f172a"}}>PostHog 產品分析</div><div style={{fontSize:12,color:"#94a3b8"}}>用戶行為熱圖、Session Replay、轉換漏斗</div></div>
          </div>
          <div style={{display:"grid",gap:12}}>
            <div className={styles.formGroup}>
              <label>Project API Key</label>
              <input className={styles.input} value={a.phKey} onChange={af("phKey")} placeholder="phc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"/>
              <span style={{fontSize:11.5,color:"#94a3b8",marginTop:3,display:"block"}}>PostHog 設定 → Project API Keys，格式 <code style={{background:"#f1f5f9",padding:"1px 5px",borderRadius:4,fontFamily:"monospace"}}>phc_</code> 開頭</span>
            </div>
            <div className={styles.formGroup}>
              <label>PostHog Host</label>
              <input className={styles.input} value={a.phHost} onChange={af("phHost")} placeholder="https://us.i.posthog.com"/>
              <span style={{fontSize:11.5,color:"#94a3b8",marginTop:3,display:"block"}}>美國區：<code style={{background:"#f1f5f9",padding:"1px 5px",borderRadius:4,fontFamily:"monospace"}}>us.i.posthog.com</code>　歐洲區：<code style={{background:"#f1f5f9",padding:"1px 5px",borderRadius:4,fontFamily:"monospace"}}>eu.i.posthog.com</code></span>
            </div>
            <div className={styles.formGroup}>
              <label>Personal API Key <span style={{fontWeight:400,color:"#94a3b8",fontSize:12}}>(選填)</span></label>
              <input className={styles.input} value={a.phPersonalKey} onChange={af("phPersonalKey")} placeholder="phx_xxxxxxxx"/>
              <span style={{fontSize:11.5,color:"#94a3b8",marginTop:3,display:"block"}}>個人設定 → Personal API Keys，格式 <code style={{background:"#f1f5f9",padding:"1px 5px",borderRadius:4,fontFamily:"monospace"}}>phx_</code> 開頭，可解鎖進階 Dashboard 查詢</span>
            </div>
          </div>
        </div>

        {/* Meta Pixel */}
        <div style={{marginBottom:20}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <div style={{width:34,height:34,borderRadius:9,background:"#1877f2",display:"grid",placeItems:"center",flexShrink:0}}><span style={{color:"#fff",fontWeight:900,fontSize:16,lineHeight:1}}>f</span></div>
            <div><div style={{fontWeight:800,fontSize:14,color:"#0f172a"}}>Meta Pixel / Conversions API</div><div style={{fontSize:12,color:"#94a3b8"}}>追蹤 Facebook / Instagram 廣告購買轉換</div></div>
          </div>
          <div style={{display:"grid",gap:12}}>
            <div className={styles.formGroup}>
              <label>Meta Pixel ID</label>
              <input className={styles.input} value={a.pixelId} onChange={af("pixelId")} placeholder="1234567890123456"/>
              <span style={{fontSize:11.5,color:"#94a3b8",marginTop:3,display:"block"}}>Events Manager → 資料來源 → 像素 ID，15–16 位數字</span>
            </div>
            <div className={styles.formGroup}>
              <label>Conversions API Access Token <span style={{fontWeight:400,color:"#94a3b8",fontSize:12}}>(選填)</span></label>
              <input className={styles.input} value={a.capiToken} onChange={af("capiToken")} placeholder="EAAxxxxxxxxxxxxxxxx"/>
              <span style={{fontSize:11.5,color:"#94a3b8",marginTop:3,display:"block"}}>伺服器端事件追蹤，提升廣告歸因準確率；不填仍可使用瀏覽器端 Pixel</span>
            </div>
          </div>
        </div>

        <div style={{display:"flex",justifyContent:"flex-end",gap:10,paddingTop:16,borderTop:"1px solid #f1f5f9"}}>
          {aDirty&&<button className={styles.btnSmall} onClick={()=>setA({...aSaved})}>復原變更</button>}
          <button className={styles.btnPrimary} onClick={saveAnalytics}>儲存設定</button>
        </div>
      </div>

      <div style={s2.card}>
        <h3 style={s2.h3}>本機啟動指令</h3>
        <div style={{...s2.codeBlock,marginTop:14}}>
          <div><span style={{color:"#64748b"}}># 安裝依賴</span></div><div>npm install</div>
          <div style={{marginTop:8}}><span style={{color:"#64748b"}}># 複製環境變數範本</span></div><div>cp .env.local.example .env.local</div>
          <div style={{marginTop:8}}><span style={{color:"#64748b"}}># 啟動開發伺服器</span></div><div>npm run dev</div>
          <div style={{marginTop:8}}><span style={{color:"#64748b"}}># 部署到 Vercel</span></div><div>npx vercel --prod</div>
        </div>
      </div>
    </div>
  );
}
