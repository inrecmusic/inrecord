"use client";
import { useState, useCallback, useEffect, useMemo, Fragment } from "react";
import { adminFetch as _api } from "@/lib/admin-client";
import { fetchCommentStats } from "./shared";
import styles from "./admin.module.css";

export const MSG_PER_PAGE = 20;

export default function MessagesPage({ showToast }){
  const [comments,setComments]=useState([]);
  const [total,setTotal]=useState(0);           // 目前篩選條件下的總筆數（分頁用）
  const [stats,setStats]=useState({total:0,pending:0,replied:0}); // 全站統計（伺服器算）
  const [statsErr,setStatsErr]=useState("");
  const [loading,setLoading]=useState(false);
  const [loadErr,setLoadErr]=useState("");
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
    setLoading(true);setLoadErr("");
    try{
      const params=new URLSearchParams({page,per_page:MSG_PER_PAGE});
      if(filter!=="all")params.set("status",filter==="unread"?"pending":filter);
      const r=await _api(`/api/admin/unit-comments?${params}`);
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||`載入失敗（HTTP ${r.status}）`);
      setComments(d.data||[]);
      setTotal(d.total||0);
    }
    // 載入失敗保留前次資料並顯示錯誤，不要讓空清單看起來像「還沒有任何留言」
    catch(e){setLoadErr(e.message||"載入失敗");}
    finally{setLoading(false);}
  },[page,filter]);

  // 未回覆／已回覆一律取伺服器全量數字：清單每頁只有 20 筆，只算當頁會嚴重低估「未回覆」。
  // 統計失敗要看得出來：吞掉錯誤會讓三張卡停在 0，管理員以為沒有待回覆留言。
  const loadStats=useCallback(async()=>{
    try{setStats(await fetchCommentStats());setStatsErr("");}
    catch(e){setStatsErr(e?.message||"統計載入失敗");}
  },[]);

  const fetchMeta=useCallback(async()=>{
    try{
      const [rv,rc]=await Promise.all([_api("/api/admin/videos"),_api("/api/admin/chapters")]);
      setVideos((await rv.json()).data||[]);
      setChapters((await rc.json()).data||[]);
    }catch{}
  },[]);

  useEffect(()=>{fetchMeta();},[fetchMeta]);
  useEffect(()=>{fetchComments();},[fetchComments]);
  useEffect(()=>{loadStats();},[loadStats]);

  // ⚠️ 後端沒有搜尋參數，這個搜尋只作用在目前這一頁的 20 筆上（UI 已標示）。
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

  const videoName=id=>videos.find(v=>v.id===id)?.title||"—";
  const totalPages=Math.max(1,Math.ceil(total/MSG_PER_PAGE));

  async function submitReply(commentId){
    if(!replyText.trim())return;
    setReplying(true);
    try{
      const r=await _api("/api/admin/comment-replies",{method:"POST",body:JSON.stringify({comment_id:commentId,admin_content:replyText.trim()})});
      if(!r.ok)throw new Error((await r.json()).error);
      showToast("✅ 回覆已送出");
      setReplyingId(null);setReplyText("");fetchComments();loadStats();
    }catch(e){showToast("❌ "+(e.message||"回覆失敗"));}
    finally{setReplying(false);}
  }

  async function confirmDelete(){
    setDeleting(true);
    try{
      const r=await _api(`/api/admin/unit-comments?id=${deleteId}`,{method:"DELETE"});
      if(!r.ok)throw new Error((await r.json()).error);
      showToast("✅ 留言已刪除");setDeleteId(null);fetchComments();loadStats();
    }catch(e){showToast("❌ "+(e.message||"刪除失敗"));}
    finally{setDeleting(false);}
  }

  function openReply(c){
    if(replyingId===c.id){setReplyingId(null);return;}
    setReplyingId(c.id);setReplyText("");
  }

  return(
    <div>
      <div className={styles.pageHeader}><div><h1>留言管理</h1><p>{statsErr?"統計暫時無法載入":`共 ${stats.total} 則課程單元留言`}</p></div></div>
      {statsErr?<div style={{margin:"0 0 12px",padding:"8px 12px",borderRadius:8,background:"#fef2f2",color:"#b91c1c",fontSize:13}}>⚠️ {statsErr}　<button className={styles.btnSmall} onClick={loadStats}>重試</button></div>:null}
      {loadErr&&(
        <div role="alert" style={{margin:"0 0 14px",padding:"10px 14px",borderRadius:10,background:"#fef2f2",border:"1px solid #fecaca",color:"#991b1b",fontSize:13,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",wordBreak:"keep-all",lineBreak:"strict"}}>
          <span>⚠️ 留言載入失敗：{loadErr}</span>
          <button className={styles.btnSmall} onClick={()=>{fetchComments();loadStats();}}>重試</button>
        </div>
      )}
      <div className={styles.statsGrid} style={{gridTemplateColumns:"repeat(3,1fr)"}}>
        {[["全部留言",statsErr?"—":stats.total,"則"],["未回覆",statsErr?"—":stats.pending,"則待處理"],["已回覆",statsErr?"—":stats.replied,"則"]].map(([l,v,s])=>(
          <div key={l} className={styles.statCard}><div className={styles.statHead}><span className={styles.statLabel}>{l}</span></div><strong className={styles.statValue}>{v}</strong><div className={styles.statSub}>{s}</div></div>
        ))}
      </div>
      <div className={styles.panel}>
        <div className={styles.panelHead} style={{flexWrap:"wrap",gap:12}}>
          <div className={styles.tabGroup}>
            {[["all","全部"],["unread","未回覆"],["replied","已回覆"]].map(([key,label])=>(
              <button key={key} className={`${styles.tab} ${filter===key?styles.tabActive:""}`} onClick={()=>{setFilter(key);setPage(1);}}>
                {label}{key==="unread"&&!statsErr&&stats.pending>0&&<span className={styles.tabBadge}>{stats.pending}</span>}
              </button>
            ))}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:3}}>
            <input className={styles.searchInput} placeholder="搜尋留言、學員姓名…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:220}}/>
            <span style={{fontSize:11,color:"#94a3b8",wordBreak:"keep-all",lineBreak:"strict"}}>只搜尋目前這一頁（第 {page} 頁）的留言</span>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>單元</th><th>留言者</th><th>時間</th><th>內容</th><th>操作</th></tr></thead>
            <tbody>
              {loading?<tr><td colSpan={5} className={styles.empty}>載入中…</td></tr>
              /* 沒有列可顯示時才要區分「載入失敗」與「真的沒留言」；有前次資料就繼續顯示、錯誤走上方橫幅 */
              :!filtered.length?(loadErr
                ?<tr><td colSpan={5} style={{textAlign:"center",padding:28,color:"#dc2626"}}>⚠️ {loadErr}　<button className={styles.btnSmall} onClick={()=>{fetchComments();loadStats();}}>重試</button></td></tr>
                :<tr><td colSpan={5} className={styles.empty}><span className={styles.emptyIcon}>💬</span><span className={styles.emptyTitle}>{search?"這一頁沒有符合的留言":total===0?"還沒有任何留言":"沒有符合的留言"}</span><span className={styles.emptySub}>{search?"搜尋只作用在目前這一頁，可換頁再找":"學員提問將在這裡顯示"}</span></td></tr>)
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
