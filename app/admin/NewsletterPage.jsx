"use client";
import { useState, useCallback, useEffect } from "react";
import { adminFetch as _api } from "@/lib/admin-client";
import styles from "./admin.module.css";
import { renderMd, fmt, EMAIL_KIND_LABEL } from "./shared";
import LeadCleanupPanel from "./LeadCleanupPanel";

// 電子報：編輯標題+Markdown 內文 → 群發給「已付款／已開通學員 / 註冊官網帳號」。逐封寄(A 方案)，碰上限即回報。
// 「已付款」對象＝已付款訂單 ∪ enrollments（見 lib/newsletter-send.js），付了錢但還沒開通的人也收得到。
// 電子報範本：點選帶入標題與內文再自行修改。文案為正式敬語體，日期／章節等請發送前確認。
export const NEWSLETTER_TEMPLATES=[
  {name:"開課通知（早鳥分層）",subject:"課程上架時程・9/23 起陸續開放新章節",body:[
    "@badge 上架公告",
    "@subtitle 第一章已開放，後續章節自 9/23 起每週上架，給第一批預購的您。","",
    "![InRecord 吉祥物](https://inrecordmusic.com/mascot-wave-v2.png|120)","",
    "親愛的預購學員，您好：","",
    "感謝您在演奏會期間，以超早鳥方案預購張育瑞「從零開始學鋼琴－了解三和弦與基礎伴奏」。除了享有這堂課推出以來的最低優惠，也包含了為您準備的「搶先觀看」專屬權益。","",
    "## 第一章已開放，9/23 起每週上架新章節",
    "您於音樂會預購階段完成購課，享有早鳥搶先觀看權益。第一章已經開放，後續章節自 9/23 起每週上架，10/31 完整課程全數上架。","",
    ":::timeline",
    "9/23 | 第二、三章　上架",
    "9/30 | 第四章　上架",
    "10/7 | 第五章　上架",
    "10/14 | 第六章　上架",
    "10/21 | 第七章　上架",
    "10/28 | 第八章　上架",
    "10/31 | 第九、十章　完整課程全數開放 | dim",
    ":::","",
    "近期課程將展開正式對外宣傳，為避免新學員混淆，官方網站的公開資訊會統一標示為「9/30 開放第一章到第三章、10/31 完整課程正式上架」。請放心，您專屬的搶先觀看權益完全不受影響，其他新學員 9/30 起先開放第一到第三章、10/31 才全部開放。","",
    "## 10/31　完整課程正式上架",
    "10/31 起，所有課程內容將全數開放。課程為買斷制，您可以依照自己的學習進度，隨時回來複習。","",
    "## 關於搶先觀看版本",
    "10/31 前陸續開放的內容，是正式上架前提供給預購學員的專屬搶先版。","",
    "目前課程正進行最後的字幕校對與網站微調，部分畫面或操作後續仍可能持續更新。我們誠摯邀請第一批加入的您參與這個最終打磨階段；如果您在觀看時發現任何播放異常、字幕錯字，或對教學內容有任何建議，都歡迎直接來信告訴我們。您的回饋，將幫助這堂課在 10/31 正式上架時更加完美。","",
    "## 開始上課前，三分鐘完成準備",
    "![InRecord 吉祥物](https://inrecordmusic.com/mascot-piano-v2.png|110)","",
    "您的觀看權限在完成預購時就已經設定完畢，不需要另外購買或啟用。開始前想先請您花一分鐘填寫學員資料——這份資料會用於寄送新章節上架通知與課程連結、學員專屬活動的優先邀請，以及調整後續內容規劃。跟著下面四個步驟，一次完成：","",
    "**STEP 1｜用購買時的 Email 登入**",
    "在登入頁點「Email 連結登入（免密碼）」，輸入購買時的 Email，收信後點連結或輸入驗證碼即可；第一次登入系統會自動建立帳號。","",
    "![登入頁面](https://inrecordmusic.com/guide/step-1-login.png|500)","",
    "**STEP 2｜花一分鐘填寫學員資料**",
    "第一次進教室會先看到這份表單，填完「姓名、手機、鋼琴程度」三格必填就能開始上課，其餘可之後再補。","",
    "![填寫學員資料](https://inrecordmusic.com/guide/step-2-profile.png|500)","",
    "[填寫學員資料](https://inrecordmusic.com/classroom/account)","",
    "**STEP 3｜進入音樂教室**",
    "儀表板會記住你的學習進度，點「繼續上課」就能接著上次的地方繼續。","",
    "![音樂教室儀表板](https://inrecordmusic.com/guide/step-3-dashboard.png|500)","",
    "**STEP 4｜開始上課**",
    "影片旁的單元清單可切換章節與單元；影片下方還有學員留言、課程評價、作業繳交、互動遊戲與筆記，歡迎多多使用。","",
    "![播放頁功能介紹](https://inrecordmusic.com/guide/step-4-watch.png|500)","",
    "填寫完成後，只要登入購買課程時使用的帳號就可以直接開始觀看第一章。未來每次有新章節上架，我們也會另外寄送通知信，並附上課程連結。","",
    "如果填寫時遇到任何問題，直接回信告訴我們就可以。","",
    "**小提醒**：把 support@inrecordmusic.com 加入通訊錄，之後的新章節上架通知才不會被信箱歸進促銷或垃圾信件夾。","",
    "有任何問題，隨時歡迎來信至 support@inrecordmusic.com，我們收到後會盡快回覆。","",
    "**9/23 起新章節陸續上架，教室見！**"].join("\n")},
  {name:"新章節上架",subject:"【InRecord】新章節上架通知",body:[
    "親愛的學員，您好：","",
    "以下章節已於今日上架，歡迎進入音樂教室繼續您的學習：","",
    "## 本次上架內容",
    "- Ch○ 章節名稱（單元 ○-1 ～ ○-6）","",
    "後續章節將依時程陸續上架，全部內容預計 **10/31 前** 上架完畢。","",
    "[前往上課](https://inrecordmusic.com/classroom)","",
    "---","",
    "若有任何問題，歡迎直接回覆此信，我們將盡快為您處理。","",
    "**InRecord・音樂刻 敬上**"].join("\n")},
  {name:"課程異動公告",subject:"【InRecord】課程服務公告",body:[
    "親愛的學員，您好：","",
    "感謝您對 InRecord 的支持，以下事項向您說明：","",
    "## 公告內容",
    "（請填寫異動或維護說明，例：系統將於 ○/○ ○○:○○ 進行維護，期間暫停服務約 ○ 小時。）","",
    "造成不便，敬請見諒。","",
    "---","",
    "若有任何問題，歡迎直接回覆此信，我們將盡快為您處理。","",
    "**InRecord・音樂刻 敬上**"].join("\n")},
  {name:"一般消息",subject:"【InRecord】最新消息",body:[
    "親愛的學員，您好：","",
    "（開頭段落）","",
    "## 標題一",
    "（內文）","",
    "- 條列重點一",
    "- 條列重點二","",
    "[按鈕文字](https://inrecordmusic.com)","",
    "---","",
    "若有任何問題，歡迎直接回覆此信，我們將盡快為您處理。","",
    "**InRecord・音樂刻 敬上**"].join("\n")},
];

// ── 寄送成效（唯讀）────────────────────────────────────────────────────────
export const AUDIENCE_LABEL={
  buyers:"已付款／已開通學員",
  buyers_early:"已購課 · 9/2 前（早鳥）",
  buyers_standard:"已購課 · 9/2 起",
  registered:"註冊官網帳號",
  leads:"潛客名單（Brevo）",
};
const STATS_ERR={unauthorized:"登入已過期，請重新登入",db_not_configured:"資料庫尚未設定",invalid_range:"開始日不能晚於結束日",range_too_long:"日期區間超過 Brevo 上限 90 天，請縮小區間",server_error:"伺服器錯誤，請稍後再試"};
const WARN_BOX={fontSize:12.5,color:"#92400e",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:10,padding:"8px 12px",marginBottom:12};
const NUM={fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap",fontSize:13};
const pct=r=>r==null?"—":`${(r*100).toFixed(1)}%`;

export default function NewsletterPage({showToast}){
  const [subject,setSubject]=useState("");
  const [bodyMd,setBodyMd]=useState("");
  const [savedSubject,setSavedSubject]=useState("");
  const [savedBody,setSavedBody]=useState("");
  const [audience,setAudience]=useState("buyers");
  const [mode,setMode]=useState("edit");
  const [lastSent,setLastSent]=useState(null);
  const [busy,setBusy]=useState("");
  const [result,setResult]=useState(null);
  // 改用 Brevo 後台範本寄送：>0 時主旨／內容以 Brevo 範本為準，本地標題／內文不寄
  const [brevoTemplates,setBrevoTemplates]=useState([]);
  const [brevoTemplateId,setBrevoTemplateId]=useState(0);
  const [testTo,setTestTo]=useState(""); // 測試收件人（逗號/空白分隔，可多個；留空＝ADMIN_EMAIL）
  // 多份草稿：newsletter 表以 id 為鍵，subject 當顯示名稱。需先移除 DB 的 newsletter_singleton 約束。
  const [draftId,setDraftId]=useState("default");
  const [drafts,setDrafts]=useState([]);
  const [quota,setQuota]=useState(null); // Brevo 寄件額度；期間依方案而定（免費＝每日、付費＝計費週期），見 lib/brevo-quota.js
  const refreshQuota=useCallback(async()=>{
    try{const r=await _api("/api/admin/brevo-quota");const d=await r.json().catch(()=>({}));if(d.ok)setQuota(d);}catch{}
  },[]);
  // 寄送成效：預設收合，展開才查（免得每次進頁都打 Brevo）。日期留空交給後端算預設區間，
  // 避免在 render 階段算 Date.now() 造成 hydration 不一致。
  const [statsOpen,setStatsOpen]=useState(false);
  const [statsFrom,setStatsFrom]=useState("");
  const [statsTo,setStatsTo]=useState("");
  const [stats,setStats]=useState(null);
  const [statsBusy,setStatsBusy]=useState(false);
  const [statsErr,setStatsErr]=useState("");
  const loadStats=useCallback(async(from="",to="")=>{
    setStatsBusy(true);setStatsErr("");
    try{
      const qs=new URLSearchParams({...(from?{from}:{}),...(to?{to}:{})});
      const r=await _api(`/api/admin/email-stats${qs.toString()?`?${qs}`:""}`);
      const d=await r.json().catch(()=>({}));
      if(!r.ok||!d.ok)throw new Error(d.message||STATS_ERR[d.error]||d.error||`載入失敗（HTTP ${r.status}）`);
      setStats(d);setStatsFrom(d.from);setStatsTo(d.to);
    }catch(e){setStats(null);setStatsErr(e.message||"載入失敗");}
    finally{setStatsBusy(false);}
  },[]);
  function toggleStats(){
    const next=!statsOpen;
    setStatsOpen(next);
    if(next&&!stats&&!statsBusy)loadStats();
  }
  const useTpl=brevoTemplateId>0;
  const tplName=brevoTemplates.find(t=>t.id===brevoTemplateId)?.name||`#${brevoTemplateId}`;
  const dirty=subject!==savedSubject||bodyMd!==savedBody;

  const load=useCallback(async(id="default")=>{
    try{
      const res=await _api(`/api/admin/newsletter?id=${encodeURIComponent(id)}`);
      const {data,drafts:list}=await res.json();
      setDraftId(data.id||id);
      setDrafts(list||[]);
      setSubject(data.subject||"");setBodyMd(data.body_md||"");
      setSavedSubject(data.subject||"");setSavedBody(data.body_md||"");
      setLastSent(data.last_sent_at?{at:data.last_sent_at,count:data.last_sent_count}:null);
    }catch{}
    try{
      const res=await _api("/api/admin/brevo-templates");
      const d=await res.json().catch(()=>({}));
      if(d.ok)setBrevoTemplates(d.data||[]);
    }catch{}
    refreshQuota();
  },[refreshQuota]);
  useEffect(()=>{load("default");},[load]);

  async function persist(){
    const res=await _api("/api/admin/newsletter",{method:"PATCH",body:JSON.stringify({id:draftId,subject,body_md:bodyMd})});
    if(res.ok){
      setSavedSubject(subject);setSavedBody(bodyMd);
      setDrafts(d=>d.some(x=>x.id===draftId)?d.map(x=>x.id===draftId?{...x,subject}:x):[...d,{id:draftId,subject,hasBody:true}]);
    }else{
      const d=await res.json().catch(()=>({}));
      if(d.hint)showToast?.("❌ "+d.hint);
    }
    return res.ok;
  }
  async function save(){
    setBusy("save");
    try{ if(await persist())showToast?.("✅ 草稿已儲存"); else showToast?.("❌ 儲存失敗"); }
    catch(e){showToast?.("❌ 儲存失敗："+e.message);} finally{setBusy("");}
  }
  async function sendTest(){
    if(!useTpl&&(!subject.trim()||!bodyMd.trim())){showToast?.("請先填標題與內文");return;}
    setBusy("test");setResult(null);
    try{
      if(!useTpl)await persist();
      const list=testTo.split(/[\s,;、]+/).filter(Boolean);
      const res=await _api("/api/admin/newsletter/send",{method:"POST",body:JSON.stringify({test:true,draftId,...(list.length?{testEmails:list}:{}),...(useTpl?{brevoTemplateId}:{})})});
      const d=await res.json();
      if(d.ok)showToast?.("✅ 測試信已寄到 "+(d.to||"管理員信箱")+(d.unsubscribed?.length?`（${d.unsubscribed.length} 位已退訂，略過）`:""));
      else if(d.test&&d.sent!=null)showToast?.(`⚠️ 測試信 ${d.failed} 封失敗（成功 ${d.sent}：${d.to||"—"}）`);
      else showToast?.("❌ 測試寄送失敗："+(d.error||"unknown"));
    }catch(e){showToast?.("❌ 測試寄送失敗："+e.message);} finally{setBusy("");refreshQuota();}
  }
  async function previewAudience(){
    setBusy("preview");setResult(null);
    try{
      const res=await _api("/api/admin/newsletter/send",{method:"POST",body:JSON.stringify({audience,draftId,dryRun:true,...(useTpl?{brevoTemplateId}:{})})});
      const d=await res.json().catch(()=>({}));
      if(!res.ok||!d.ok){showToast?.("❌ 預覽失敗："+(d.error||`HTTP ${res.status}`));return;}
      showToast?.(`【${AUDIENCE_LABEL[audience]||audience}】名單 ${d.total} 人，這次會寄 ${d.pending} 封${d.alreadySent?`（${d.alreadySent} 人已收過這封，會跳過）`:""}`);
      setResult(d);
    }catch(e){showToast?.("❌ 預覽失敗："+e.message);} finally{setBusy("");}
  }

  async function sendAll(){
    if(!useTpl&&(!subject.trim()||!bodyMd.trim())){showToast?.("請先填標題與內文");return;}
    const label=AUDIENCE_LABEL[audience]||audience;
    const what=useTpl?`用 Brevo 範本「${tplName}」`:"把這封電子報";
    if(!window.confirm(`確定${what}「正式群發」給【${label}】嗎？\n寄出後無法收回，建議先用「寄測試給我自己」確認版面。`))return;
    setBusy("all");setResult(null);
    try{
      if(!useTpl)await persist();
      const res=await _api("/api/admin/newsletter/send",{method:"POST",body:JSON.stringify({audience,draftId,...(useTpl?{brevoTemplateId}:{})})});
      const d=await res.json();
      if(!d.ok){showToast?.("❌ 群發失敗："+(d.error||"unknown"));}
      else{
        setResult(d);
        if(d.total===0)showToast?.("名單為空，沒有寄出");
        else if(d.limitHit)showToast?.(`⚠️ 已寄 ${d.sent} 封，剩 ${d.total-d.sent} 封未寄（碰到單日安全閥）`);
        else showToast?.(`✅ 群發完成：成功 ${d.sent}/${d.total}${d.failed?`，失敗 ${d.failed}`:""}`);
        await load();
      }
    }catch(e){showToast?.("❌ 群發失敗："+e.message);} finally{setBusy("");refreshQuota();}
  }

  async function switchDraft(id){
    if(id===draftId)return;
    if(dirty&&!window.confirm("目前這份有未儲存的修改，切換會丟失。要繼續嗎？"))return;
    await load(id);
    setMode("edit");
  }
  async function newDraft(){
    const name=window.prompt("新草稿的代號（英數與 - _，例如 b-plan）：","");
    const id=String(name||"").trim().toLowerCase();
    if(!id)return;
    if(!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(id)){showToast?.("❌ 代號只能用小寫英數與 - _");return;}
    if(drafts.some(d=>d.id===id)){showToast?.("❌ 這個代號已經有了");return;}
    if(dirty&&!window.confirm("目前這份有未儲存的修改，新增會丟失。要繼續嗎？"))return;
    setDraftId(id);setSubject("");setBodyMd("");setSavedSubject("");setSavedBody("");setLastSent(null);setMode("edit");
    setDrafts(d=>[...d,{id,subject:"",hasBody:false}]);
  }
  async function deleteDraft(){
    if(draftId==="default"){showToast?.("❌ 預設草稿不能刪除");return;}
    if(!window.confirm(`確定刪除草稿「${subject||draftId}」？無法復原。`))return;
    const res=await _api(`/api/admin/newsletter?id=${encodeURIComponent(draftId)}`,{method:"DELETE"});
    if(res.ok){showToast?.("✅ 已刪除");await load("default");}
    else showToast?.("❌ 刪除失敗");
  }

  return(
    <div>
      <div className={styles.pageHeader} style={{flexWrap:"wrap",gap:12}}>
        <div><h1>電子報</h1><p>編輯內容 → 群發給學員（支援 Markdown）</p></div>
        <div className={styles.pageActions} style={{flexWrap:"wrap",gap:8}}>
          <div className={styles.filterGroup}>
            <button className={`${styles.filterBtn} ${mode==="edit"?styles.filterActive:""}`} onClick={()=>setMode("edit")}>編輯</button>
            <button className={`${styles.filterBtn} ${mode==="preview"?styles.filterActive:""}`} onClick={()=>setMode("preview")}>預覽</button>
          </div>
          {dirty&&<span style={{fontSize:12,fontWeight:800,color:"#92400e",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"4px 10px",alignSelf:"center"}}>未儲存</span>}
          <button className={styles.btnSmall} disabled={!!busy} onClick={save}>{busy==="save"?"儲存中…":"儲存草稿"}</button>
        </div>
      </div>

      <div className={styles.panel} style={{marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:14,paddingBottom:14,borderBottom:"1px solid #e2e8f0"}}>
          <span style={{fontSize:13,fontWeight:700,color:"#475569"}}>草稿</span>
          {/* 草稿多了之後，一份一顆按鈕會把整列撐開、主旨長的還會折行。改成下拉選單：固定寬度、看得到全部。 */}
          <select value={draftId} onChange={e=>switchDraft(e.target.value)}
            style={{minWidth:280,maxWidth:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #cbd5e1",fontSize:13.5,background:"#fff",color:"#0f172a"}}>
            {(drafts.length?drafts:[{id:draftId,subject}]).map(d=>(
              <option key={d.id} value={d.id}>
                {(d.subject||(d.id==="default"?"（預設草稿）":d.id))}　［{d.id}］
              </option>
            ))}
          </select>
          <button type="button" className={styles.btnSmall} onClick={newDraft}>＋ 新增草稿</button>
          {draftId!=="default"&&<button type="button" className={styles.btnSmall} onClick={deleteDraft}>刪除這份</button>}
          <span style={{fontSize:12,color:"#94a3b8"}}>可以同時存多份（例如 A 版／B 版），各自儲存、各自寄測試信</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:14}}>
          <span style={{fontSize:13,fontWeight:700,color:"#475569"}}>範本</span>
          {NEWSLETTER_TEMPLATES.map(t=>(
            <button key={t.name} type="button" className={styles.btnSmall}
              onClick={()=>{
                if((subject.trim()||bodyMd.trim())&&!window.confirm(`套用「${t.name}」範本會覆蓋目前編輯中的標題與內文，確定？`))return;
                setSubject(t.subject);setBodyMd(t.body);setMode("edit");
              }}>{t.name}</button>
          ))}
          <span style={{fontSize:12,color:"#94a3b8"}}>套用後請確認日期與內容再發送</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:14}}>
          <span style={{fontSize:13,fontWeight:700,color:"#475569"}}>Brevo 範本</span>
          <select className={styles.searchInput} style={{width:"auto",minWidth:280}} value={brevoTemplateId} onChange={e=>setBrevoTemplateId(Number(e.target.value))}>
            <option value={0}>不使用（寄下方標題／內文）</option>
            {brevoTemplates.map(t=><option key={t.id} value={t.id}>#{t.id} {t.name}</option>)}
          </select>
          {useTpl
            ?<span style={{fontSize:12,fontWeight:700,color:"#92400e"}}>會以 Brevo 後台「{tplName}」的主旨與內容寄出，下方標題／內文不會寄</span>
            :<span style={{fontSize:12,color:"#94a3b8"}}>在 Brevo 後台建好的 Transactional 範本會列在這裡</span>}
        </div>
        <label style={{display:"block",fontSize:13,fontWeight:700,color:"#475569",marginBottom:6}}>標題</label>
        <input className={styles.searchInput} style={{width:"100%",marginBottom:16}} value={subject} onChange={e=>setSubject(e.target.value)} placeholder="例：六月課程最新消息 🎹"/>
        <label style={{display:"block",fontSize:13,fontWeight:700,color:"#475569",marginBottom:6}}>內文（Markdown：# 標題 / **粗體** / - 清單 / --- 分隔線 / [文字](網址)＝連結 / 整行只放連結＝置中按鈕）</label>
        {mode==="edit"
          ?<textarea value={bodyMd} onChange={e=>setBodyMd(e.target.value)} style={{width:"100%",minHeight:360,fontFamily:"'Courier New',Consolas,monospace",fontSize:13,lineHeight:1.75,boxSizing:"border-box",resize:"vertical",border:"1px solid #e2e8f0",borderRadius:10,padding:12}}/>
          :<div style={{maxWidth:760,padding:"4px 0"}}>{renderMd(bodyMd)}</div>}
      </div>

      <div className={styles.panel}>
        <div style={{display:"flex",alignItems:"baseline",gap:12,flexWrap:"wrap",margin:"0 0 12px"}}>
          <h3 style={{margin:0}}>群發</h3>
          {quota&&quota.ok&&(
            <span style={{fontSize:12.5,color:quota.remaining==null?"#64748b":quota.remaining<=30?"#dc2626":quota.remaining<=100?"#b45309":"#64748b"}}>
              {quota.limit!=null
                ? <>{quota.daily?"今日":"本期"} Brevo 額度剩 <b style={{fontVariantNumeric:"tabular-nums"}}>{quota.remaining}</b>／{quota.limit} 封</>
                : <>{quota.daily?"今日":"本期"} Brevo 已寄 <b style={{fontVariantNumeric:"tabular-nums"}}>{quota.used}</b> 封</>}
              <span style={{color:"#94a3b8"}}>
                （{quota.limit!=null&&`已寄 ${quota.used}，`}含登入驗證信；{quota.daily?"台灣早上 8 點重置":`自 ${quota.periodStart} 起算`}）
              </span>
            </span>
          )}
        </div>
        <div style={{display:"flex",gap:18,flexWrap:"wrap",marginBottom:14}}>
          <label style={{display:"flex",gap:6,alignItems:"center",fontSize:14,cursor:"pointer"}}><input type="radio" name="aud" checked={audience==="buyers"} onChange={()=>setAudience("buyers")}/> 🎓 已付款／已開通學員</label>
          <label style={{display:"flex",gap:6,alignItems:"center",fontSize:14,cursor:"pointer"}} title="9/2（台灣時間）之前完成購課或開通者＝音樂會預購的早鳥。判定與教室的搶先看分層同一套規則"><input type="radio" name="aud" checked={audience==="buyers_early"} onChange={()=>setAudience("buyers_early")}/> 🎫 已購課 · 9/2 前（早鳥）</label>
          <label style={{display:"flex",gap:6,alignItems:"center",fontSize:14,cursor:"pointer"}} title="9/2 當天及之後才完成購課或開通者"><input type="radio" name="aud" checked={audience==="buyers_standard"} onChange={()=>setAudience("buyers_standard")}/> 🗓️ 已購課 · 9/2 起</label>
          <label style={{display:"flex",gap:6,alignItems:"center",fontSize:14,cursor:"pointer"}}><input type="radio" name="aud" checked={audience==="registered"} onChange={()=>setAudience("registered")}/> 👤 註冊官網帳號</label>
          <label style={{display:"flex",gap:6,alignItems:"center",fontSize:14,cursor:"pointer"}} title="首頁留信箱進 Brevo 清單的人，自動排除已購買與已退訂者"><input type="radio" name="aud" checked={audience==="leads"} onChange={()=>setAudience("leads")}/> 📬 潛客名單（還沒購買）</label>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <input className={styles.searchInput} style={{width:300}} value={testTo} onChange={e=>setTestTo(e.target.value)} placeholder="測試收件人，逗號分隔可多個（留空＝寄給我自己）"/>
          <button className={styles.btnSmall} disabled={!!busy} onClick={sendTest}>{busy==="test"?"寄送中…":testTo.trim()?"寄測試":"寄測試給我自己"}</button>
          <button className={styles.btnSmall} disabled={!!busy} onClick={previewAudience} title="只算名單、不寄任何信：確認對象選對了、名單撈得出來">{busy==="preview"?"計算中…":"預覽名單"}</button>
          <button className={styles.btnPrimary} disabled={!!busy} onClick={sendAll}>{busy==="all"?"群發中…":"正式群發"}</button>
        </div>
        {lastSent&&<p className={styles.dim} style={{fontSize:12,marginTop:12}}>上次寄送：{fmt(lastSent.at)}（{lastSent.count} 封）</p>}
        {result&&<div style={{marginTop:12,fontSize:13,background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:10,padding:"10px 12px"}}>
          本次：對象 {result.total} 人 · 成功 {result.sent} · 失敗 {result.failed}{result.limitHit?` · ⚠️ 碰單日安全閥，剩 ${result.total-result.sent} 未寄`:""}
        </div>}
      </div>

      <div className={styles.panel} style={{marginTop:16}}>
        <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <h3 style={{margin:0}}>寄送成效</h3>
          <button className={styles.btnSmall} onClick={toggleStats}>{statsOpen?"收合":"展開"}</button>
          <span style={{fontSize:12,color:"#94a3b8"}}>每次群發的送達／開信／點擊／退訂，資料取自 Brevo 交易信事件（唯讀，不會寄出任何信）</span>
        </div>
        {statsOpen&&<>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",margin:"14px 0"}}>
            <input className={styles.selectInput} type="date" value={statsFrom} onChange={e=>setStatsFrom(e.target.value)} title="開始日期"/>
            <span style={{color:"#94a3b8"}}>～</span>
            <input className={styles.selectInput} type="date" value={statsTo} onChange={e=>setStatsTo(e.target.value)} title="結束日期"/>
            <button className={styles.btnSmall} disabled={statsBusy} onClick={()=>loadStats(statsFrom,statsTo)}>{statsBusy?"查詢中…":"查詢"}</button>
            <span style={{fontSize:12,color:"#94a3b8"}}>留空＝過去 30 天；Brevo 事件查詢上限 90 天</span>
          </div>
          {stats&&!stats.brevoConfigured&&<div style={WARN_BOX}>尚未設定 BREVO_API_KEY，只能顯示寄出封數。設好金鑰並重新部署後，這裡才會出現開信與點擊。</div>}
          {stats?.brevoError&&<div style={WARN_BOX}>Brevo 事件讀取失敗（{stats.brevoError}）。為避免顯示不完整的數字，這次的開信／點擊全部留白（顯示「—」）；寄出封數來自本站紀錄，仍然正確。稍後再查一次即可。</div>}
          {stats?.truncated&&<div style={WARN_BOX}>事件筆數太多已截斷，開信數可能偏低，請縮小日期區間再查。</div>}
          {stats&&stats.brevoConfigured&&!stats.brevoError&&stats.data.length>0&&!stats.data.some(g=>g.stats)&&
            <div style={WARN_BOX}>這段期間在 Brevo 查不到任何事件（可能已超過事件保留期），只能顯示寄出封數。</div>}
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>日期</th><th>主旨</th><th>寄出</th><th>送達</th><th>開信（人）</th><th>代理載入</th><th>點擊</th><th>退信</th><th>退訂</th></tr></thead>
              <tbody>
                {statsBusy?<tr><td colSpan={9} className={styles.empty}>載入中…</td></tr>
                :statsErr?<tr><td colSpan={9} className={styles.empty}><span className={styles.emptyIcon}>⚠️</span><span className={styles.emptyTitle}>載入失敗</span><span className={styles.emptySub}>{statsErr}</span></td></tr>
                :!stats?.data?.length?<tr><td colSpan={9} className={styles.empty}><span className={styles.emptyIcon}>📭</span><span className={styles.emptyTitle}>這段期間沒有群發紀錄</span><span className={styles.emptySub}>換個日期區間再查一次</span></td></tr>
                :stats.data.map(g=>{
                  const st=g.stats;
                  return(
                    <tr key={g.key}>
                      <td className={styles.dim} style={{whiteSpace:"nowrap",fontSize:12}}>
                        {g.dateTW}
                        {st&&!st.precise&&<span style={{color:"#b45309",cursor:"help",fontWeight:800}} title="這批信在 Brevo 事件裡沒有標籤，只能以收件人＋寄送時間推算，可能混入同一位收件人同期收到的其他信件的開信"> *</span>}
                      </td>
                      <td style={{fontSize:13,maxWidth:320,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={g.subject}>
                        {g.subject}
                        <span className={styles.dim} style={{fontSize:11,marginLeft:6}}>{EMAIL_KIND_LABEL[g.kind]||g.kind||""}</span>
                      </td>
                      <td style={NUM}>{g.sentCount}{g.failedCount>0&&<span style={{color:"#dc2626",fontSize:11}}> +{g.failedCount} 未寄出</span>}</td>
                      <td style={NUM}>{st?st.delivered:"—"}</td>
                      <td style={NUM}>{st?<>{st.opened}<span className={styles.dim} style={{fontSize:11,marginLeft:4}}>{pct(st.openRate)}</span></>:"—"}</td>
                      <td style={NUM}>{st?st.proxyOpened:"—"}</td>
                      <td style={NUM}>{st?<>{st.clicked}<span className={styles.dim} style={{fontSize:11,marginLeft:4}}>{pct(st.clickRate)}</span></>:"—"}</td>
                      <td style={NUM}>{st?(st.bounced||0):"—"}</td>
                      <td style={NUM}>{st?st.unsubscribed:"—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {stats?.diagnostics&&<p className={styles.dim} style={{fontSize:12,marginTop:10}}>
            這段期間 Brevo 共 {stats.diagnostics.total} 筆事件，對到本站寄件紀錄 {stats.diagnostics.attributed} 筆
            {stats.diagnostics.noRecipient>0&&<>，{stats.diagnostics.noRecipient} 筆的收件人不在本站紀錄內（Auth 驗證信等，不計入）</>}
            {stats.diagnostics.tooOld>0&&<>，{stats.diagnostics.tooOld} 筆距離最近一次寄送超過 14 天（不計入）</>}。
          </p>}
          <p className={styles.dim} style={{fontSize:12,lineHeight:1.8,marginTop:12}}>
            開信率只能當趨勢看，不是精確人數：它靠收件人載入一張追蹤圖片判斷，Apple Mail 的隱私保護會自動載入而把數字灌高、Gmail 不載入圖片又會壓低。
            Brevo 能辨識出前者，所以這裡把它拆成「代理載入」單獨一欄，沒有混進「開信（人）」。點擊數不受圖片影響，是比較可靠的參與度指標。<br/>
            開信率與點擊率的分母都是「送達」，不是「寄出」。「—」代表查不到事件（多半是超過 Brevo 的事件保留期），不是 0 人。<br/>同一主旨、同一天（台灣時間）、同一類型算同一次群發；寄出數與未寄出數來自本站自己的寄信紀錄，一定正確。每個開信事件只會算給該收件人最近一次收到的信，所以同一批名單連寄兩封時，前一封不會吃到後一封的開信。
            　標有 <b style={{color:"#b45309"}}>*</b> 的那幾列，Brevo 事件裡沒有標籤可比對，只能以收件人＋寄送時間推算，可能混入同一位收件人同期收到的其他信件的開信。
          </p>
        </>}
      </div>
      {/* 潛客名單維護：與群發對象「潛客」用同一套「已購買」判定 */}
      <LeadCleanupPanel showToast={showToast} />
    </div>
  );
}
