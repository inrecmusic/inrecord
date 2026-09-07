"use client";
import { useEffect, useState } from "react";
import { adminFetch as _api } from "@/lib/admin-client";
import styles from "./admin.module.css";

// 銷售設定 → 免費試看影片：首頁留信箱後寄出的試看連結會播這支。存 site_content.trial_video_id，存檔即時生效。
export default function TrialVideoPanel({ showToast }) {
  const [id, setId] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    _api("/api/admin/site-content").then((r) => r.json()).then((d) => {
      const v = d?.data?.trial_video_id;
      if (!cancelled && typeof v === "string") { setId(v); setSaved(v); }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  async function save() {
    setBusy(true);
    try {
      const r = await _api("/api/admin/site-content", { method: "PATCH", body: JSON.stringify({ key: "trial_video_id", body_md: id.trim() }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) { setSaved(id.trim()); showToast?.(id.trim() ? "✅ 試看影片已更新" : "✅ 已清除，試看頁改顯示「準備中」"); }
      else showToast?.("❌ 儲存失敗：" + (d.error === "invalid_body" ? "影片 ID 格式不對（只能英數與連字號）" : d.error || r.status));
    } catch (e) { showToast?.("❌ 儲存失敗：" + e.message); }
    finally { setBusy(false); }
  }
  return (
    <div className={styles.panel} style={{ marginTop: 16 }}>
      <strong>免費試看影片</strong>
      <p style={{ fontSize: 13, color: "#64748b", margin: "6px 0 10px" }}>
        首頁「留下 Email」後寄出的試看連結會播這支影片。填 Bunny Stream 的影片 ID（GUID）；留空＝試看頁顯示「準備中」。存檔即時生效，不用部署。
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input className={styles.searchInput} style={{ width: 380 }} value={id} onChange={(e) => setId(e.target.value)} placeholder="例：3f2b7c1e-9a0d-4c11-8b2a-0f1e2d3c4b5a" />
        <button className={styles.btnSmall} disabled={busy || id.trim() === saved} onClick={save}>{busy ? "儲存中…" : "儲存"}</button>
      </div>
    </div>
  );
}
