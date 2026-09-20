"use client";
import { useState } from "react";
import { adminFetch as _api } from "@/lib/admin-client";
import styles from "./admin.module.css";

// 潛客名單清理：比對 Brevo 潛客名單與已購買者，把買過課的人移出名單。
// 購買當下自動退出名單是 2026-09 才補齊的，在那之前就買課又留過信箱的人還留在名單裡。
// 先「比對」看數字與名單，確認後才「移出」。移出是 best-effort，可重複執行。
export default function LeadCleanupPanel({ showToast }) {
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null);
  const [showList, setShowList] = useState(false);

  async function compare() {
    setBusy("compare"); setShowList(false);
    try {
      const r = await _api("/api/admin/lead-cleanup");
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { showToast?.("❌ 比對失敗：" + (d.error || r.status)); setResult(null); return; }
      setResult(d);
      showToast?.(d.matchedCount ? `比對完成：${d.matchedCount} 位已購買者還在名單裡` : "✅ 名單很乾淨，沒有已購買者");
    } catch (e) { showToast?.("❌ 比對失敗：" + e.message); }
    finally { setBusy(""); }
  }

  async function cleanup() {
    if (!result?.matchedCount) return;
    if (!window.confirm(`將把 ${result.matchedCount} 位已購買者移出 Brevo 潛客名單。\n\n・只動名單，不會刪除任何訂單或學員資料。\n・移出後他們不再收到潛客名單的行銷信，購課信與開課通知不受影響。\n\n確定執行？`)) return;
    setBusy("cleanup");
    try {
      const r = await _api("/api/admin/lead-cleanup", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { showToast?.("❌ 清理失敗：" + (d.error || r.status)); return; }
      showToast?.(d.failed ? `已移出 ${d.removed} 位，${d.failed} 位失敗，可再執行一次` : `✅ 已移出 ${d.removed} 位`);
      await compare();
    } catch (e) { showToast?.("❌ 清理失敗：" + e.message); }
    finally { setBusy(""); }
  }

  const matched = result?.matched || [];
  return (
    <div className={styles.panel} style={{ marginTop: 16 }}>
      <strong>潛客名單清理</strong>
      <p style={{ fontSize: 13, color: "#64748b", margin: "6px 0 10px", wordBreak: "keep-all", lineBreak: "strict" }}>
        比對 Brevo 潛客名單與已購買者（已付款訂單＋已開通紀錄），把買過課的人移出名單。
        現在購買時會自動移出，這裡是清掉這個機制上線前就已經買課的舊資料，隨時可以再跑一次確認。
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button className={styles.btnSmall} disabled={!!busy} onClick={compare}>
          {busy === "compare" ? "比對中…" : "比對名單"}
        </button>
        <button
          className={styles.btnSmall}
          disabled={!!busy || !result?.matchedCount}
          onClick={cleanup}
        >
          {busy === "cleanup" ? "移出中…" : `移出已購買者${result?.matchedCount ? `（${result.matchedCount}）` : ""}`}
        </button>
      </div>

      {result && (
        <div style={{ marginTop: 12, fontSize: 13, color: "#334155", display: "grid", gap: 4 }}>
          <div>潛客名單共 <strong>{result.leadTotal}</strong> 位；已購買者共 <strong>{result.buyerTotal}</strong> 位。</div>
          <div>
            名單中已購買 <strong style={{ color: result.matchedCount ? "#b45309" : "#16a34a" }}>{result.matchedCount}</strong> 位
            {matched.length > 0 && (
              <button
                type="button"
                onClick={() => setShowList((v) => !v)}
                style={{ marginLeft: 8, background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: 13, padding: 0 }}
              >
                {showList ? "收合名單" : "查看名單"}
              </button>
            )}
          </div>
          {showList && (
            <ul style={{ margin: "6px 0 0", paddingLeft: 18, maxHeight: 220, overflowY: "auto", fontSize: 12, color: "#64748b" }}>
              {matched.map((e) => <li key={e}>{e}</li>)}
              {result.matchedCount > matched.length && (
                <li style={{ listStyle: "none", marginLeft: -18, marginTop: 4 }}>
                  （另有 {result.matchedCount - matched.length} 位未列出，執行清理會一併處理）
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
