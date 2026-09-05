"use client";
import { useState, useCallback, useEffect, useMemo } from "react";
import { adminFetch as _api } from "@/lib/admin-client";
import styles from "./admin.module.css";
import { StatCard } from "./shared";
import { Users, TrendingUp, GraduationCap, CreditCard, X } from "lucide-react";

// ── Subscriptions Page ────────────────────────────────────────────────────
export default function SubscriptionsPage({ showToast }) {
  const [subs, setSubs]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter]   = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ email: "", plan_type: "bundle", expires_at: "2999-12-31" });
  const [addErr, setAddErr]   = useState("");
  const [acting, setActing]   = useState(null);

  const fetchSubs = useCallback(async () => {
    setLoading(true);
    try {
      const r = await _api("/api/admin/subscriptions");
      const { data } = await r.json();
      setSubs(data || []);
    } catch { setSubs([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSubs(); }, [fetchSubs]);

  const now = new Date();

  const isLive = s => s.status === "active" && new Date(s.expires_at) > now;

  const filtered = useMemo(() => {
    if (filter === "active")  return subs.filter(isLive);
    if (filter === "expired") return subs.filter(s => !isLive(s));
    return subs;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- isLive 依 now 計算，now 已在依賴中
  }, [subs, filter, now]);

  const activeCount = subs.filter(isLive).length;
  const thisMonth   = subs.filter(s => { const d = new Date(s.created_at || 0); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); }).length;
  const bundleCount = subs.filter(s => s.plan_type === "bundle" && isLive(s)).length;
  const gameCount   = subs.filter(s => s.plan_type === "game"   && isLive(s)).length;

  const planLabel = { bundle: "學琴全攻略", game: "互動遊戲", monthly: "月繳", yearly: "年繳", gift: "贈送" };

  async function extendOne(id) {
    setActing(id + "_extend");
    try {
      const r = await _api("/api/admin/subscriptions", {
        method: "PATCH",
        body: JSON.stringify({ id, action: "extend_month" }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      showToast("✅ 已延長 1 個月"); fetchSubs();
    } catch (e) { showToast("❌ " + (e.message || "操作失敗")); }
    finally { setActing(null); }
  }

  async function cancelOne(id) {
    if (!window.confirm("確定要取消這筆遊戲存取嗎？\n學員將立即失去遊戲權限，且無法復原。")) return;
    setActing(id + "_cancel");
    try {
      const r = await _api("/api/admin/subscriptions", {
        method: "PATCH",
        body: JSON.stringify({ id, action: "cancel" }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      showToast("✅ 已取消訂閱"); fetchSubs();
    } catch (e) { showToast("❌ " + (e.message || "操作失敗")); }
    finally { setActing(null); }
  }

  const [adding,setAdding]=useState(false);
  async function handleAdd(e) {
    e.preventDefault(); setAddErr("");
    if (adding) return; // 防連點重複新增
    if (!addForm.email.trim()) { setAddErr("請輸入 Email"); return; }
    if (!addForm.expires_at)   { setAddErr("請選擇到期日"); return; }
    setAdding(true); // 驗證通過才上鎖（上鎖後所有路徑都會走到 finally 解鎖）
    try {
      const r = await _api("/api/admin/subscriptions", {
        method: "POST",
        body: JSON.stringify(addForm),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      showToast("✅ 已新增遊戲存取");
      setShowAdd(false);
      setAddForm({ email: "", plan_type: "bundle", expires_at: "2999-12-31" });
      fetchSubs();
    } catch (e) { setAddErr(e.message || "新增失敗"); }
    finally { setAdding(false); }
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <div><h1>遊戲存取</h1><p>管理已購買互動遊戲的學員存取</p></div>
        <div className={styles.pageActions}>
          <button className={styles.btnSmall} onClick={fetchSubs}>重新整理</button>
          <button className={styles.btnPrimary} onClick={() => setShowAdd(true)}>手動新增</button>
        </div>
      </div>

      <div className={styles.statsGrid4}>
        <StatCard label="有效存取人數" value={activeCount} sub="目前有效" icon={Users} color="#16a34a"/>
        <StatCard label="本月新增"     value={thisMonth}   sub="新增存取數" icon={TrendingUp} color="#2563eb"/>
        <StatCard label="課程包永久"   value={bundleCount} sub="課程＋遊戲" icon={GraduationCap} color="#f59e0b"/>
        <StatCard label="遊戲單買永久" value={gameCount}   sub="互動遊戲" icon={CreditCard} color="#7c3aed"/>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHead} style={{ flexWrap: "wrap", gap: 12 }}>
          <div className={styles.tabGroup}>
            {[
              ["all",     "全部"],
              ["active",  "有效"],
              ["expired", "已失效"],
            ].map(([key, label]) => (
              <button key={key}
                className={`${styles.tab} ${filter === key ? styles.tabActive : ""}`}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <span className={styles.dim}>共 {filtered.length} 筆</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Email</th>
                <th>方案</th>
                <th>狀態</th>
                <th>到期日</th>
                <th>剩餘天數</th>
                <th>來源</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className={styles.empty}>載入中…</td></tr>
              ) : !filtered.length ? (
                <tr><td colSpan={7} className={styles.empty}><span className={styles.emptyIcon}>🎮</span><span className={styles.emptyTitle}>還沒有任何訂閱</span><span className={styles.emptySub}>學員訂閱互動遊戲後將在這裡顯示</span></td></tr>
              ) : filtered.map(s => {
                const expDate  = new Date(s.expires_at);
                const isActive = s.status === "active" && expDate > now;
                const daysLeft = isActive ? Math.ceil((expDate - now) / 86400000) : 0;
                const isSoon   = isActive && daysLeft <= 7;
                return (
                  <tr key={s.id}>
                    <td style={{ fontSize: 13 }}>{s.email}</td>
                    <td>
                      <span className={styles.pill} style={{
                        background: s.plan_type === "bundle" ? "#fef3c7" : s.plan_type === "game" ? "#eff6ff" : "#f1f5f9",
                        color: s.plan_type === "bundle" ? "#92400e" : s.plan_type === "game" ? "#1d4ed8" : "#475569",
                      }}>
                        {planLabel[s.plan_type] || s.plan_type}
                      </span>
                    </td>
                    <td>
                      <span className={styles.pill} style={{
                        background: isActive ? "#dcfce7" : "#fee2e2",
                        color: isActive ? "#166534" : "#991b1b",
                      }}>
                        {isActive ? "訂閱中" : "已到期"}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                      {expDate.toLocaleDateString("zh-TW")}
                    </td>
                    <td>
                      {isActive ? (
                        <span style={{ color: isSoon ? "#dc2626" : "#374151", fontWeight: isSoon ? 700 : 400 }}>
                          {daysLeft} 天{isSoon ? " ⚠️" : ""}
                        </span>
                      ) : "—"}
                    </td>
                    <td className={styles.dim} style={{ fontSize: 12 }}>{s.source || "—"}</td>
                    <td>
                      <div className={styles.rowActions}>
                        <button
                          className={styles.btnSmall}
                          disabled={acting === s.id + "_extend"}
                          onClick={() => extendOne(s.id)}
                        >
                          +1月
                        </button>
                        {isActive && (
                          <button
                            className={`${styles.btnSmall} ${styles.btnDanger}`}
                            disabled={acting === s.id + "_cancel"}
                            onClick={() => cancelOne(s.id)}
                          >
                            取消
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add modal */}
      {showAdd && (
        <div className={styles.modalOverlay} onClick={() => setShowAdd(false)}>
          <div className={styles.modalCard} style={{ width: "min(480px,100%)" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>手動新增遊戲存取</h3>
              <button className={styles.iconBtn} onClick={() => setShowAdd(false)}><X size={18}/></button>
            </div>
            <form onSubmit={handleAdd} style={{ display: "grid", gap: 14 }}>
              <div className={styles.formGroup}>
                <label>Email *</label>
                <input className={styles.input} type="email" value={addForm.email}
                  onChange={e => setAddForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="student@example.com"/>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup} style={{ flex: 1 }}>
                  <label>方案</label>
                  <select className={styles.selectInput} style={{ width: "100%" }} value={addForm.plan_type}
                    onChange={e => setAddForm(p => ({ ...p, plan_type: e.target.value }))}>
                    <option value="bundle">學琴全攻略（課程＋遊戲）</option>
                    <option value="game">互動遊戲</option>
                  </select>
                </div>
                <div className={styles.formGroup} style={{ flex: 1 }}>
                  <label>到期日 *</label>
                  <input className={styles.input} type="date" value={addForm.expires_at}
                    onChange={e => setAddForm(p => ({ ...p, expires_at: e.target.value }))}/>
                  <span style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 3, display: "block" }}>永久存取請填 <code style={{ background:"#f1f5f9", padding:"1px 5px", borderRadius:4 }}>2999-12-31</code></span>
                </div>
              </div>
              {addErr && <p style={{ color: "#dc2626", fontSize: 13, margin: 0 }}>{addErr}</p>}
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnSmall} onClick={() => setShowAdd(false)}>取消</button>
                <button type="submit" className={styles.btnPrimary}>新增存取</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
