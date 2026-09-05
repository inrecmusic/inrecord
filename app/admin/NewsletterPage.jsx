"use client";
import { useState, useCallback, useEffect } from "react";
import { adminFetch as _api } from "@/lib/admin-client";
import styles from "./admin.module.css";
import { renderMd, fmt } from "./shared";

// 電子報：編輯標題+Markdown 內文 → 群發給「已付款／已開通學員 / 註冊官網帳號」。逐封寄(A 方案)，碰上限即回報。
// 「已付款」對象＝已付款訂單 ∪ enrollments（見 lib/newsletter-send.js），付了錢但還沒開通的人也收得到。
// 電子報範本：點選帶入標題與內文再自行修改。文案為正式敬語體，日期／章節等請發送前確認。
export const NEWSLETTER_TEMPLATES=[
  {name:"開課通知（早鳥分層）",subject:"9/30 正式開課・9/2 搶先開放第一章",body:[
    "@badge 上架公告",
    "@subtitle 9/2 搶先開放第一章節，給第一批預購的您。","",
    "![InRecord 吉祥物](https://inrecordmusic.com/mascot-wave-v2.png|120)","",
    "親愛的預購學員，您好：","",
    "感謝您在演奏會期間，以超早鳥方案預購張育瑞「從零開始學鋼琴－了解三和弦與基礎伴奏」。除了享有這堂課推出以來的最低優惠，也包含了為您準備的「搶先觀看」專屬權益。","",
    "## 9/2 起　第一章搶先開放",
    "您於音樂會預購階段完成購課，享有早鳥搶先觀看權益。第一章將於今晚 8 點開放，後續每週開放一章（9/9、9/16、9/23），9/30 完整課程全數上架。","",
    ":::timeline",
    "9/2 | 第一章　搶先開放 | 晚上 8:00 開放",
    "9/9 | 第二章　上架",
    "9/16 | 第三章　上架",
    "9/23 | 第四章　上架",
    "9/30 | 完整課程　正式全數開放 | dim",
    ":::","",
    "近期課程將展開正式對外宣傳，為避免新學員混淆，官方網站的公開資訊會統一標示為「9/30 完整課程正式上架」。請放心，您專屬的 9/2 搶先觀看權益完全不受影響，其他新學員則會統一自 9/30 起才能開始觀看。","",
    "## 9/30　完整課程正式上架",
    "9/30 起，所有課程內容將全數開放。課程購買後可永久觀看，您可以依照自己的學習進度，隨時回來複習。","",
    "## 關於搶先觀看版本",
    "9/2～9/29 期間開放的內容，是正式上架前提供給預購學員的專屬搶先版。","",
    "目前課程正進行最後的字幕校對與網站微調，部分畫面或操作後續仍可能持續更新。我們誠摯邀請第一批加入的您參與這個最終打磨階段；如果您在觀看時發現任何播放異常、字幕錯字，或對教學內容有任何建議，都歡迎直接來信告訴我們。您的回饋，將幫助這堂課在 9/30 正式上架時更加完美。","",
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
    "填寫完成後，9/2 晚上 8:00 第一章開放，只要登入購買課程時使用的帳號就可以直接開始觀看。未來每次有新章節上架，我們也會另外寄送通知信，並附上課程連結。","",
    "如果填寫時遇到任何問題，直接回信告訴我們就可以。","",
    "**小提醒**：把 support@inrecordmusic.com 加入通訊錄，之後的新章節上架通知才不會被信箱歸進促銷或垃圾信件夾。","",
    "有任何問題，隨時歡迎來信至 support@inrecordmusic.com，我們收到後會盡快回覆。","",
    "**9/2 晚上 8:00，第一章見！**"].join("\n")},
  {name:"新章節上架",subject:"【InRecord】新章節上架通知",body:[
    "親愛的學員，您好：","",
    "以下章節已於今日上架，歡迎進入音樂教室繼續您的學習：","",
    "## 本次上架內容",
    "- Ch○ 章節名稱（單元 ○-1 ～ ○-6）","",
    "後續章節將依時程陸續上架，全部內容預計 **9/30 前** 上架完畢。","",
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
  const [quota,setQuota]=useState(null); // Brevo 寄件額度；期間依方案而定（免費＝每日、付費＝計費週期），見 lib/brevo-quota.js
  const refreshQuota=useCallback(async()=>{
    try{const r=await _api("/api/admin/brevo-quota");const d=await r.json().catch(()=>({}));if(d.ok)setQuota(d);}catch{}
  },[]);
  const useTpl=brevoTemplateId>0;
  const tplName=brevoTemplates.find(t=>t.id===brevoTemplateId)?.name||`#${brevoTemplateId}`;
  const dirty=subject!==savedSubject||bodyMd!==savedBody;

  const load=useCallback(async()=>{
    try{
      const res=await _api("/api/admin/newsletter");
      const {data}=await res.json();
      setSubject(data.subject||"");setBodyMd(data.body_md||"");
      setSavedSubject(data.subject||"");setSavedBody(data.body_md||"");
      if(data.last_sent_at)setLastSent({at:data.last_sent_at,count:data.last_sent_count});
    }catch{}
    try{
      const res=await _api("/api/admin/brevo-templates");
      const d=await res.json().catch(()=>({}));
      if(d.ok)setBrevoTemplates(d.data||[]);
    }catch{}
    refreshQuota();
  },[refreshQuota]);
  useEffect(()=>{load();},[load]);

  async function persist(){
    const res=await _api("/api/admin/newsletter",{method:"PATCH",body:JSON.stringify({subject,body_md:bodyMd})});
    if(res.ok){setSavedSubject(subject);setSavedBody(bodyMd);}
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
      const res=await _api("/api/admin/newsletter/send",{method:"POST",body:JSON.stringify({test:true,...(list.length?{testEmails:list}:{}),...(useTpl?{brevoTemplateId}:{})})});
      const d=await res.json();
      if(d.ok)showToast?.("✅ 測試信已寄到 "+(d.to||"管理員信箱")+(d.unsubscribed?.length?`（${d.unsubscribed.length} 位已退訂，略過）`:""));
      else if(d.test&&d.sent!=null)showToast?.(`⚠️ 測試信 ${d.failed} 封失敗（成功 ${d.sent}：${d.to||"—"}）`);
      else showToast?.("❌ 測試寄送失敗："+(d.error||"unknown"));
    }catch(e){showToast?.("❌ 測試寄送失敗："+e.message);} finally{setBusy("");refreshQuota();}
  }
  async function sendAll(){
    if(!useTpl&&(!subject.trim()||!bodyMd.trim())){showToast?.("請先填標題與內文");return;}
    const label=audience==="buyers"?"已付款／已開通學員":"註冊官網帳號";
    const what=useTpl?`用 Brevo 範本「${tplName}」`:"把這封電子報";
    if(!window.confirm(`確定${what}「正式群發」給【${label}】嗎？\n寄出後無法收回，建議先用「寄測試給我自己」確認版面。`))return;
    setBusy("all");setResult(null);
    try{
      if(!useTpl)await persist();
      const res=await _api("/api/admin/newsletter/send",{method:"POST",body:JSON.stringify({audience,...(useTpl?{brevoTemplateId}:{})})});
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
          <label style={{display:"flex",gap:6,alignItems:"center",fontSize:14,cursor:"pointer"}}><input type="radio" name="aud" checked={audience==="registered"} onChange={()=>setAudience("registered")}/> 👤 註冊官網帳號</label>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <input className={styles.searchInput} style={{width:300}} value={testTo} onChange={e=>setTestTo(e.target.value)} placeholder="測試收件人，逗號分隔可多個（留空＝寄給我自己）"/>
          <button className={styles.btnSmall} disabled={!!busy} onClick={sendTest}>{busy==="test"?"寄送中…":testTo.trim()?"寄測試":"寄測試給我自己"}</button>
          <button className={styles.btnPrimary} disabled={!!busy} onClick={sendAll}>{busy==="all"?"群發中…":"正式群發"}</button>
        </div>
        {lastSent&&<p className={styles.dim} style={{fontSize:12,marginTop:12}}>上次寄送：{fmt(lastSent.at)}（{lastSent.count} 封）</p>}
        {result&&<div style={{marginTop:12,fontSize:13,background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:10,padding:"10px 12px"}}>
          本次：對象 {result.total} 人 · 成功 {result.sent} · 失敗 {result.failed}{result.limitHit?` · ⚠️ 碰單日安全閥，剩 ${result.total-result.sent} 未寄`:""}
        </div>}
      </div>
    </div>
  );
}
