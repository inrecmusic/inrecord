"use client";
import { DEFAULT_TERMS_MD, DEFAULT_PRIVACY_MD } from "@/lib/legal-docs";
import { useState, useEffect } from "react";
import { adminFetch as _api } from "@/lib/admin-client";
import styles from "./admin.module.css";
import { renderMd } from "./shared";

export function TermsPage({showToast}){return <DocEditorPage title="服務條款" contentKey="terms" defaultMd={DEFAULT_TERMS_MD} showToast={showToast}/>;}

export function PrivacyPage({showToast}){return <DocEditorPage title="隱私權政策" contentKey="privacy" defaultMd={DEFAULT_PRIVACY_MD} showToast={showToast}/>;}

// ── Privacy / Terms ────────────────────────────────────────────────────────
export default function DocEditorPage({title,contentKey,defaultMd,showToast}){
  const [md,setMd]=useState(defaultMd);
  const [saved,setSaved]=useState(defaultMd);
  const [mode,setMode]=useState("preview");
  const [busy,setBusy]=useState(false);
  const dirty=md!==saved;
  // 從 DB 載入（有編輯過才覆蓋預設）；存檔寫 DB → 正式 /privacy /terms 即時反映（ISR 5 分鐘）。
  useEffect(()=>{let cancelled=false;_api("/api/admin/site-content").then(r=>r.json()).then(d=>{const v=d?.data?.[contentKey];if(!cancelled&&typeof v==="string"&&v.trim()){setMd(v);setSaved(v);}}).catch(()=>{});return()=>{cancelled=true;};},[contentKey]);
  async function save(){
    if(busy)return;setBusy(true);
    try{const r=await _api("/api/admin/site-content",{method:"PATCH",body:JSON.stringify({key:contentKey,body_md:md})});const d=await r.json().catch(()=>({}));
      if(!r.ok||d.ok===false)showToast?.("❌ 儲存失敗："+(d.error||"unknown"));
      else{setSaved(md);showToast?.(`✅ ${title}已儲存，前台將於數分鐘內更新`);}
    }catch(e){showToast?.("❌ 儲存失敗："+e.message);}finally{setBusy(false);}
  }
  return(
    <div>
      <div className={styles.pageHeader} style={{flexWrap:"wrap",gap:12}}>
        <div><h1>{title}</h1><p>將顯示於前台・使用 Markdown 語法編輯</p></div>
        <div className={styles.pageActions} style={{flexWrap:"wrap",gap:8}}>
          <div className={styles.filterGroup}>
            <button className={`${styles.filterBtn} ${mode==="preview"?styles.filterActive:""}`} onClick={()=>setMode("preview")}>預覽</button>
            <button className={`${styles.filterBtn} ${mode==="edit"?styles.filterActive:""}`} onClick={()=>setMode("edit")}>編輯</button>
          </div>
          {dirty&&<span style={{fontSize:12,fontWeight:800,color:"#92400e",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"4px 10px",alignSelf:"center"}}>有未儲存的變更</span>}
          {dirty&&<button className={styles.btnSmall} onClick={()=>setMd(saved)}>復原</button>}
          <button className={styles.btnPrimary} onClick={save} disabled={busy}>{busy?"儲存中…":"儲存"}</button>
        </div>
      </div>
      <div className={styles.panel}>
        {mode==="edit"
          ?<textarea
              className={styles.replyTextarea}
              value={md}
              onChange={e=>setMd(e.target.value)}
              style={{width:"100%",minHeight:640,fontFamily:"'Courier New',Consolas,monospace",fontSize:13,lineHeight:1.75,boxSizing:"border-box",resize:"vertical"}}
            />
          :<div style={{maxWidth:760,padding:"4px 0"}}>{renderMd(md)}</div>
        }
      </div>
    </div>
  );
}
