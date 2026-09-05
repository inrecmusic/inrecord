"use client";
import { useState, useMemo, useCallback, useEffect } from "react";
import { countPaidBuyers } from "@/lib/admin-students";
import { adminFetch as _api } from "@/lib/admin-client";
import styles from "./admin.module.css";
import { Music, BookOpen, X } from "lucide-react";
import { fmt } from "./shared";

// ── Courses Page ───────────────────────────────────────────────────────────
export default function CoursesPage({orders, onManage, showToast}){
  const [search,setSearch]=useState("");
  const [courses,setCourses]=useState([]);
  const [loading,setLoading]=useState(false);
  const [showModal,setShowModal]=useState(false);
  const [editing,setEditing]=useState(null);
  const [saving,setSaving]=useState(false);
  const [form,setForm]=useState({title:"",desc:"",price:"",status:"published"});
  const [formErr,setFormErr]=useState("");

  // 已購人數＝確實付款的人頭數（orders status=paid、email 去重）；
  // 舊版讀名單的人工標記，且 leads 在課程頁根本不會撈 → 永遠顯示 0。
  const purchased=useMemo(()=>countPaidBuyers(orders),[orders]);

  const fetchCourses=useCallback(async()=>{
    setLoading(true);
    try{const r=await _api("/api/admin/courses");const{data}=await r.json();setCourses(data||[]);}
    catch{setCourses([]);}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{fetchCourses();},[fetchCourses]);

  const filtered=useMemo(()=>courses.filter(c=>!search||c.title.includes(search)),[courses,search]);
  function openCreate(){setEditing(null);setForm({title:"",desc:"",price:"",status:"published"});setFormErr("");setShowModal(true);}
  function openEdit(c){setEditing(c);setForm({title:c.title,desc:c.description||"",price:String(c.price),status:c.status});setFormErr("");setShowModal(true);}

  async function handleSave(e){
    e.preventDefault();setFormErr("");
    if(!form.title.trim()){setFormErr("請輸入課程標題");return;}
    if(form.price===""||isNaN(form.price)){setFormErr("請輸入有效售價");return;}
    setSaving(true);
    try{
      const body={title:form.title.trim(),description:form.desc.trim()||null,price:Number(form.price),status:form.status};
      if(editing)body.id=editing.id;
      const r=await _api("/api/admin/courses",{method:editing?"PATCH":"POST",body:JSON.stringify(body)});
      if(!r.ok)throw new Error((await r.json()).error||"儲存失敗");
      showToast?.(editing?"✅ 課程已更新":"✅ 課程已新增");
      setShowModal(false);fetchCourses();
    }catch(err){setFormErr(err.message);}
    finally{setSaving(false);}
  }

  async function toggleStatus(c){
    try{const r=await _api("/api/admin/courses",{method:"PATCH",body:JSON.stringify({id:c.id,status:c.status==="published"?"draft":"published"})});if(!r.ok)throw new Error();fetchCourses();}
    catch{showToast?.("❌ 操作失敗");}
  }
  async function removeCourse(c){
    if(!window.confirm(`確定要刪除課程「${c.title}」嗎？此操作無法復原。`))return;
    try{const r=await _api(`/api/admin/courses?id=${c.id}`,{method:"DELETE"});if(!r.ok)throw new Error();showToast?.("✅ 課程已刪除");fetchCourses();}
    catch{showToast?.("❌ 刪除失敗");}
  }

  return(
    <div>
      <div className={styles.pageHeader}>
        <div><h1>課程管理</h1><p>管理您的所有課程內容</p></div>
        <div className={styles.pageActions}>
          <button className={styles.btnSmall} onClick={fetchCourses}>重新整理</button>
          <a href="/" target="_blank" className={styles.btnSmall} style={{display:"flex",alignItems:"center",gap:5}}>前台預覽</a>
          <button className={styles.btnPrimary} onClick={openCreate}>新增課程</button>
        </div>
      </div>
      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <input className={styles.searchInput} placeholder="搜尋課程…" value={search} onChange={e=>setSearch(e.target.value)}/>
          <span className={styles.dim}>共 {filtered.length} 筆課程</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>封面</th><th>標題</th><th>狀態</th><th>價格</th><th>已購人數</th><th>建立日期</th><th>操作</th></tr></thead>
            <tbody>
              {loading?<tr><td colSpan={7} className={styles.empty}>載入中…</td></tr>
              :!filtered.length?<tr><td colSpan={7} className={styles.empty}><span className={styles.emptyIcon}>📚</span><span className={styles.emptyTitle}>還沒有任何課程</span><span className={styles.emptySub}>點右上角「新增課程」開始建立</span></td></tr>
              :filtered.map(c=>(
                <tr key={c.id}>
                  <td><div className={styles.courseCoverThumb}><Music size={22} color="#f59e0b"/></div></td>
                  <td>
                    <div style={{fontWeight:800,fontSize:14}}>{c.title}</div>
                    <div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>{c.description||"零基礎・流行鋼琴"}</div>
                  </td>
                  <td><span className={styles.pill} style={{background:c.status==="published"?"#dcfce7":"#f1f5f9",color:c.status==="published"?"#166534":"#475569"}}>{c.status==="published"?"已發佈":"草稿"}</span></td>
                  <td style={{fontWeight:800}}>NT$ {Number(c.price).toLocaleString()}</td>
                  <td>{purchased} 位</td>
                  <td className={styles.dim}>{fmt(c.created_at).split(" ")[0]}</td>
                  <td>
                    <div className={styles.rowActions}>
                      <a href="/" target="_blank" className={styles.btnSmall}>查看</a>
                      <button className={styles.btnSmall} onClick={()=>openEdit(c)}>編輯</button>
                      <button className={styles.btnSmall} onClick={()=>toggleStatus(c)}>{c.status==="published"?"下架":"發佈"}</button>
                      <button className={styles.btnPrimary} style={{padding:"6px 12px",fontSize:12}} onClick={()=>onManage?.(c)}><BookOpen size={12}/> 管理教室</button>
                      <button className={`${styles.btnSmall} ${styles.btnDanger}`} onClick={()=>removeCourse(c)}>刪除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {showModal&&(
        <div className={styles.modalOverlay} onClick={()=>setShowModal(false)}>
          <div className={styles.modalCard} style={{width:"min(520px,100%)"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <h3 style={{margin:0,fontSize:18}}>{editing?"編輯課程":"新增課程"}</h3>
              <button className={styles.iconBtn} onClick={()=>setShowModal(false)}><X size={18}/></button>
            </div>
            <form onSubmit={handleSave} style={{display:"grid",gap:14}}>
              <div className={styles.formGroup}>
                <label>課程標題 *</label>
                <input className={styles.input} value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} placeholder="例：零基礎流行鋼琴入門課"/>
              </div>
              <div className={styles.formGroup}>
                <label>課程簡介</label>
                <textarea className={styles.replyTextarea} rows={3} value={form.desc} onChange={e=>setForm(p=>({...p,desc:e.target.value}))} placeholder="簡短描述課程內容…"/>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup} style={{flex:1}}>
                  <label>售價（TWD）*</label>
                  <input className={styles.input} type="number" min="0" value={form.price} onChange={e=>setForm(p=>({...p,price:e.target.value}))} placeholder="3500"/>
                </div>
                <div className={styles.formGroup} style={{flex:1}}>
                  <label>狀態</label>
                  <select className={styles.selectInput} style={{width:"100%"}} value={form.status} onChange={e=>setForm(p=>({...p,status:e.target.value}))}>
                    <option value="published">已發佈</option>
                    <option value="draft">草稿</option>
                  </select>
                </div>
              </div>
              {formErr&&<p style={{color:"#dc2626",fontSize:13,margin:0,fontWeight:700}}>{formErr}</p>}
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnSmall} onClick={()=>setShowModal(false)}>取消</button>
                <button type="submit" className={styles.btnPrimary} disabled={saving}>{saving?"儲存中…":editing?"儲存變更":"建立課程"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
