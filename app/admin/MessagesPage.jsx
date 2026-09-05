"use client";
import { useState, useCallback, useEffect, useMemo, Fragment } from "react";
import { adminFetch as _api } from "@/lib/admin-client";
import styles from "./admin.module.css";

export const MSG_PER_PAGE = 20;

export default function MessagesPage({ showToast }){
  const [comments,setComments]=useState([]);
  const [total,setTotal]=useState(0);
  const [loading,setLoading]=useState(false);
  const [videos,setVideos]=useState([]);
  const [chapters,setChapters]=useState([]);
  const [filter,setFilter]=useState("all");
  const [search,setSearch]=useState("");
  const [page,setPage]=useState(1);
  const [replyingId,setReplyingId]=useState(null);
  const [replyText,setReplyText]=useState("");
  const [replying,setReplying]=useState(false);
  const [deleteId,setDeleteId]=useState(null);
  const [deleting,setDeleting]=useState(false);

  const fetchComments=useCallback(async()=>{
    setLoading(true);
    try{
      const params=new URLSearchParams({page,per_page:MSG_PER_PAGE});
      if(filter!=="all")params.set("status",filter==="unread"?"pending":filter);
      const r=await _api(`/api/admin/unit-comments?${params}`);
      const {data,total:t}=await r.json();
      setComments(data||[]);
      setTotal(t||0);
    }catch{}
    finally{setLoading(false);}
  },[page,filter]);

  const fetchMeta=useCallback(async()=>{
    try{
      const [rv,rc]=await Promise.all([_api("/api/admin/videos"),_api("/api/admin/chapters")]);
      setVideos((await rv.json()).data||[]);
      setChapters((await rc.json()).data||[]);
    }catch{}
  },[]);

  useEffect(()=>{fetchMeta();},[fetchMeta]);
  useEffect(()=>{fetchComments();},[fetchComments]);

  const filtered=useMemo(()=>{
    if(!search)return comments;
    const q=search.toLowerCase();
    return comments.filter(c=>
      c.content?.toLowerCase().includes(q)||
      c.user_name?.toLowerCase().includes(q)||
      c.user_email?.toLowerCase().includes(q)||
      c.videos?.title?.toLowerCase().includes(q)
    );
  },[comments,search]);

  const pendingCount=useMemo(()=>comments.filter(c=>c.status==="pending").length,[comments]);
  const repliedCount=useMemo(()=>comments.filter(c=>c.status==="replied").length,[comments]);
  const videoName=id=>videos.find(v=>v.id===id)?.title||"—";
  const totalPages=Math.max(1,Math.ceil(total/MSG_PER_PAGE));

  async function submitReply(commentId){
    if(!replyText.trim())return;
    setReplying(true);
    try{
      const r=await _api("/api/admin/comment-replies",{method:"POST",body:JSON.stringify({comment_id:commentId,admin_content:replyText.trim()})});
      if(!r.ok)throw new Error((await r.json()).error);
      showToast("✅ 回覆已送出");
      setReplyingId(null);setReplyText("");fetchComments();
    }catch(e){showToast("❌ "+(e.message||"回覆失敗"));}
    finally{setReplying(false);}
  }

  async function confirmDelete(){
    setDeleting(true);
    try{
      const r=await _api(`/api/admin/unit-comments?id=${deleteId}`,{method:"DELETE"});
      if(!r.ok)throw new Error((await r.json()).error);
      showToast("✅ 留言已刪除");setDeleteId(null);fetchComments();
    }catch(e){showToast("❌ "+(e.message||"刪除失敗"));}
    finally{setDeleting(false);}
  }

  function openReply(c){
    if(replyingId===c.id){setReplyingId(null);return;}
    setReplyingId(c.id);setReplyText("");
  }

  return(
    <div>
      <div className={styles.pageHeader}><div><h1>留言管理</h1><p>共 {total} 則課程單元留言</p></div></div>
      <div className={styles.statsGrid} style={{gridTemplateColumns:"repeat(3,1fr)"}}>
        {[["全部留言",total,"則"],["未回覆",pendingCount,"則待處理"],["已回覆",repliedCount,"則"]].map(([l,v,s])=>(
          <div key={l} className={styles.statCard}><div className={styles.statHead}><span className={styles.statLabel}>{l}</span></div><strong className={styles.statValue}>{v}</strong><div className={styles.statSub}>{s}</div></div>
        ))}
      </div>
      <div className={styles.panel}>
        <div className={styles.panelHead} style={{flexWrap:"wrap",gap:12}}>
          <div className={styles.tabGroup}>
            {[["all","全部"],["unread","未回覆"],["replied","已回覆"]].map(([key,label])=>(
              <button key={key} className={`${styles.tab} ${filter===key?styles.tabActive:""}`} onClick={()=>{setFilter(key);setPage(1);}}>
                {label}{key==="unread"&&pendingCount>0&&<span className={styles.tabBadge}>{pendingCount}</span>}
              </button>
            ))}
          </div>
          <input className={styles.searchInput} placeholder="搜尋留言、學員姓名…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:220}}/>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>單元</th><th>留言者</th><th>時間</th><th>內容</th><th>操作</th></tr></thead>
            <tbody>
              {loading?<tr><td colSpan={5} className={styles.empty}>載入中…</td></tr>
              :!filtered.length?<tr><td colSpan={5} className={styles.empty}><span className={styles.emptyIcon}>💬</span><span className={styles.emptyTitle}>{total===0?"還沒有任何留言":"沒有符合的留言"}</span><span className={styles.emptySub}>學員提問將在這裡顯示</span></td></tr>
              :filtered.map(c=>(
                <Fragment key={c.id}>
                  <tr className={replyingId===c.id?styles.commentRowActive:""}>
                    <td style={{minWidth:140}}><span className={styles.unitTag}>{c.videos?.title||videoName(c.video_id)}</span></td>
                    <td style={{minWidth:160}}>
                      <div className={styles.commenterCell}>
                        <div className={styles.commenterAvatar}>{(c.user_name||c.user_email||"?")[0].toUpperCase()}</div>
                        <div>
                          <div className={styles.commenterName}>{c.user_name||"匿名"}</div>
                          <div className={styles.realIdentity}>{c.user_email}</div>
                        </div>
                      </div>
                    </td>
                    <td className={styles.dim} style={{whiteSpace:"nowrap",minWidth:120}}>
                      {c.created_at?new Date(c.created_at).toLocaleString("zh-TW",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}):"—"}
                    </td>
                    <td>
                      <div className={styles.commentContent}>{c.content}</div>
                      {c.comment_replies?.length>0&&<div className={styles.replyPreview}><span className={styles.replyLabel}>已回覆：</span>{c.comment_replies[0].admin_content}</div>}
                    </td>
                    <td style={{minWidth:140}}>
                      <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-start"}}>
                        <span className={`${styles.pill} ${c.status==="replied"?styles.demo_opened:styles.requested}`}>{c.status==="replied"?"已回覆":"未回覆"}</span>
                        <div className={styles.rowActions}>
                          <button className={styles.btnSmall} onClick={()=>openReply(c)}>{replyingId===c.id?"收起":"回覆"}</button>
                          <button className={`${styles.btnSmall} ${styles.btnDanger}`} onClick={()=>setDeleteId(c.id)}>刪除</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                  {replyingId===c.id&&(
                    <tr className={styles.replyRow}>
                      <td colSpan={5}>
                        <div className={styles.replyBox}>
                          <textarea className={styles.replyTextarea} placeholder="輸入回覆內容…" value={replyText} rows={3} onChange={e=>setReplyText(e.target.value)} autoFocus/>
                          <div className={styles.replyActions}>
                            <button className={styles.btnPrimary} onClick={()=>submitReply(c.id)} disabled={replying}>{replying?"送出中…":"送出回覆"}</button>
                            <button className={styles.btnSmall} onClick={()=>setReplyingId(null)}>取消</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages>1&&(
          <div className={styles.pagination}>
            <button className={styles.pageBtn} disabled={page===1} onClick={()=>setPage(p=>p-1)}>‹</button>
            {Array.from({length:totalPages},(_,i)=>i+1).map(p=>(
              <button key={p} className={`${styles.pageBtn} ${p===page?styles.pageBtnActive:""}`} onClick={()=>setPage(p)}>{p}</button>
            ))}
            <button className={styles.pageBtn} disabled={page===totalPages} onClick={()=>setPage(p=>p+1)}>›</button>
          </div>
        )}
      </div>
      {deleteId&&(
        <div className={styles.modalOverlay} onClick={()=>setDeleteId(null)}>
          <div className={styles.modalCard} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:"0 0 8px",fontSize:17}}>確認刪除留言</h3>
            <p style={{margin:"0 0 20px",color:"#64748b",fontSize:14}}>此操作無法復原，確定要刪除這則留言嗎？</p>
            <div className={styles.modalActions}><button className={styles.btnSmall} onClick={()=>setDeleteId(null)}>取消</button><button className={`${styles.btnPrimary} ${styles.btnDangerFill}`} onClick={confirmDelete} disabled={deleting}>確認刪除</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
