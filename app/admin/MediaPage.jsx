"use client";
import { useState, useCallback, useEffect } from "react";
import { adminFetch as _api } from "@/lib/admin-client";
import styles from "./admin.module.css";
import { Video, Play } from "lucide-react";

// ── Media Page ─────────────────────────────────────────────────────────────
export default function MediaPage(){
  const [videos,setVideos]=useState([]);
  const [loading,setLoading]=useState(false);

  const fetchVideos=useCallback(async()=>{
    setLoading(true);
    try{
      const r=await _api("/api/admin/videos");
      const {data}=await r.json();
      setVideos(data||[]);
    }catch{}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{fetchVideos();},[fetchVideos]);

  const published=videos.filter(v=>v.published).length;
  return(
    <div>
      <div className={styles.pageHeader}>
        <div><h1>媒體中心</h1><p>檢視課程影片單元與串接狀態</p></div>
        <div className={styles.pageActions}>
          <button className={styles.btnSmall} onClick={fetchVideos}>重新整理</button>
        </div>
      </div>
      <div className={styles.statsGrid4}>
        {[["影片單元",videos.length,"支"],["已發布",published,"支"],["草稿",videos.length-published,"支"],["已串接影片",videos.filter(v=>v.bunny_video_id||v.vimeo_id).length,"支（Bunny/Vimeo）"]].map(([l,v,s])=>(
          <div key={l} className={styles.statCard}><div className={styles.statHead}><span className={styles.statLabel}>{l}</span></div><strong className={styles.statValue}>{v}</strong><div className={styles.statSub}>{s}</div></div>
        ))}
      </div>
      <div className={styles.panel}>
        <div className={styles.panelHead}><h2 style={{display:"flex",alignItems:"center",gap:7}}><Video size={16} color="#2563eb"/>影片單元</h2><span className={styles.dim}>共 {videos.length} 支</span></div>
        {loading?<p style={{textAlign:"center",padding:32,color:"#94a3b8"}}>載入中…</p>
        :!videos.length?(
          <div className={styles.placeholderCard} style={{padding:"40px 24px"}}>
            <Video size={36} color="#cbd5e1"/>
            <p style={{margin:"12px 0 0",fontSize:14,color:"#94a3b8"}}>尚無影片單元，請先在「課程管理 → 管理教室 → 章節與單元管理」新增單元</p>
          </div>
        ):(
          <div className={styles.mediaGrid}>
          {videos.map(v=>(
            <div key={v.id} className={styles.videoCard}>
              <div className={styles.videoThumb}>
                {v.vimeo_id
                  ?<a href={`https://vimeo.com/${v.vimeo_id}`} target="_blank" rel="noreferrer" style={{position:"absolute",inset:0,display:"grid",placeItems:"center"}}>
                      <div className={styles.videoPlay}><Play size={22} fill="#fff" color="#fff"/></div>
                    </a>
                  :<div className={styles.videoPlay}><Play size={22} fill="#fff" color="#fff"/></div>
                }
                {v.duration&&<span className={styles.videoDuration}>{v.duration}</span>}
              </div>
              <div className={styles.videoInfo}>
                <div className={styles.videoTitle}>{v.title}</div>
                <div className={styles.videoMeta}><span>{v.bunny_video_id?`Bunny ${v.bunny_video_id.slice(0,8)}…`:v.vimeo_id?`Vimeo ${v.vimeo_id}`:"未設定影片"}</span></div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:6}}>
                  <span className={styles.pill} style={{background:v.published?"#dcfce7":"#f1f5f9",color:v.published?"#166534":"#475569",fontSize:11}}>{v.published?"已發布":"草稿"}</span>
                  <div className={styles.rowActions}>
                    {v.vimeo_id&&<a href={`https://vimeo.com/${v.vimeo_id}`} target="_blank" rel="noreferrer" className={styles.btnSmall} style={{padding:"4px 8px",fontSize:12}}>查看</a>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}
