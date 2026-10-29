"use client";
// 後台「課程管理 → 曲目」：上傳打譜軟體匯出的 MusicXML（.musicxml／.mxl）、驗證並列出警告、
// 用學員端同一個元件預覽、掛到一或多個單元、發布／下架、替換新版、刪除草稿。
// 檔案在瀏覽器端讀取與驗證（readScoreFile＋parseMusicXml），送給 /api/admin/scores 的是 XML 文字；
// 新建一律草稿（後端強制 published:false），按「發布」學員才看得到（且要 INTERACTIVE_SCORES=on 的站台）。
// 舊版 ABC 小蜜蜂只能發布／下架。
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./admin.module.css";
import { adminFetch as api } from "@/lib/admin-client";
import { readScoreFile } from "@/lib/score/mxl";
import { parseMusicXml, ScoreError } from "@/lib/score/musicxml";
import InteractiveScore from "@/components/classroom/score/InteractiveScore";

const DIFF = { 1: "入門", 2: "初級", 3: "中級" };
const KEY_NAMES = ["C♭", "G♭", "D♭", "A♭", "E♭", "B♭", "F", "C", "G", "D", "A", "E", "B", "F♯", "C♯"];
const ERR_TEXT = {
  not_grand_staff: "需要鋼琴大譜表兩行（上右手、下左手）。請在打譜軟體確認是鋼琴譜再匯出。",
  empty: "檔案是空的，或樂譜裡沒有任何小節。",
  no_part: "樂譜裡沒有任何聲部。",
};
const errText = (e) => (e instanceof ScoreError ? ERR_TEXT[e.code] || e.message : "檔案讀不出來，請確認是 .musicxml 或 .mxl。");
const EMPTY = { id: null, title: "", subtitle: "", difficulty: "", musicxml: "", file_name: "", unitIds: [], version: 1, published: false, fileChanged: false };

async function readBytes(file) {
  if (typeof file.arrayBuffer === "function") return new Uint8Array(await file.arrayBuffer());
  return new Uint8Array(
    await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.readAsArrayBuffer(file);
    }),
  );
}
const fmtDate = (s) => (s ? new Date(s).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" }) : "—");

export default function ScoresManagePage({ showToast = () => {} }) {
  const [rows, setRows] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null); // null＝沒有在編輯
  const [fileErr, setFileErr] = useState("");
  const [model, setModel] = useState(null);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sr, cr, vr] = await Promise.all([api("/api/admin/scores"), api("/api/admin/chapters"), api("/api/admin/videos")]);
      const sj = await sr.json();
      if (!sr.ok) throw new Error(sj.error || "load_failed");
      setRows(sj.data || []);
      setChapters((await cr.json()).data || []);
      setVideos((await vr.json()).data || []);
    } catch {
      showToast("❌ 曲目載入失敗（若是第一次使用，請確認已執行 supabase-scores-v2.sql）");
      setRows([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- showToast 是父層通知函式，不參與資料流
  }, []);
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const unitsByChapter = useMemo(() => {
    const out = chapters.map((c) => ({ chapter: c, units: videos.filter((v) => v.chapter_id === c.id) }));
    const orphan = videos.filter((v) => !chapters.some((c) => c.id === v.chapter_id));
    if (orphan.length) out.push({ chapter: { id: "_", title: "未分章節" }, units: orphan });
    return out;
  }, [chapters, videos]);

  const openCreate = () => {
    setForm({ ...EMPTY });
    setModel(null);
    setFileErr("");
    setPreview(false);
  };
  const openEdit = async (row) => {
    try {
      const r = await api(`/api/admin/scores?id=${row.id}`);
      const { data } = await r.json();
      if (!r.ok || !data) throw new Error();
      setForm({
        id: data.id, title: data.title || "", subtitle: data.subtitle || "", difficulty: data.difficulty ?? "",
        musicxml: data.musicxml || "", file_name: data.file_name || "", unitIds: (data.units || []).map((u) => u.video_id),
        version: data.version || 1, published: !!data.published, fileChanged: false,
      });
      try {
        setModel(parseMusicXml(data.musicxml));
        setFileErr("");
      } catch (e) {
        setModel(null);
        setFileErr(errText(e));
      }
      setPreview(false);
    } catch {
      showToast("❌ 讀取曲目失敗");
    }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(false);
    try {
      const xml = readScoreFile(file.name, await readBytes(file));
      const m = parseMusicXml(xml);
      setModel(m);
      setFileErr("");
      setForm((f) => ({ ...f, musicxml: xml, file_name: file.name, fileChanged: true, title: f.title || m.title || "" }));
    } catch (err) {
      setModel(null);
      setFileErr(errText(err));
      setForm((f) => ({ ...f, musicxml: "", fileChanged: true }));
    }
  };

  const toggleUnit = (id) =>
    setForm((f) => ({ ...f, unitIds: f.unitIds.includes(id) ? f.unitIds.filter((x) => x !== id) : [...f.unitIds, id] }));

  const canSave = !!form && !!form.title.trim() && !!form.musicxml && !!model && !fileErr && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const body = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      difficulty: form.difficulty === "" ? null : Number(form.difficulty),
      unitIds: form.unitIds,
    };
    if (!form.id || form.fileChanged) Object.assign(body, { musicxml: form.musicxml, file_name: form.file_name || null });
    try {
      const r = await api("/api/admin/scores", { method: form.id ? "PATCH" : "POST", body: JSON.stringify(form.id ? { id: form.id, ...body } : body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(ERR_TEXT[d.error] || d.error || "save_failed");
      showToast(form.id ? `✅ 已儲存${d.version ? `（v${d.version}）` : ""}` : "✅ 已建立草稿，確認沒問題再按「發布」");
      setForm(null);
      setModel(null);
      fetchAll();
    } catch (e) {
      showToast(`❌ 儲存失敗：${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const setPublished = async (row, published) => {
    const r = await api("/api/admin/scores", { method: "PATCH", body: JSON.stringify({ id: row.id, published }) });
    if (r.ok) {
      showToast(published ? "✅ 已發布" : "已下架");
      fetchAll();
    } else showToast("❌ 更新失敗");
  };
  const remove = async (row) => {
    if (typeof window !== "undefined" && !window.confirm(`確定刪除草稿「${row.title}」？`)) return;
    const r = await api(`/api/admin/scores?id=${row.id}`, { method: "DELETE" });
    if (r.ok) {
      showToast("已刪除");
      fetchAll();
    } else showToast("❌ 刪除失敗（已發布的曲目要先下架）");
  };

  const summary = model
    ? `${model.measures.length} 小節 · 1=${KEY_NAMES[model.measures[0].key.fifths + 7]} · ${(model.measures.find((m) => !m.implicit) || model.measures[0]).time.beats}/${(model.measures.find((m) => !m.implicit) || model.measures[0]).time.beatType} · ${model.tempo ? `♩=${Math.round(model.tempo)}` : "沒寫速度"} · ${model.hasChords ? `和弦 ${model.chords.length} 個` : "沒有和弦名"}`
    : "";
  const td = { padding: "10px 14px", verticalAlign: "top" };
  const tag = (bg, color) => ({ display: "inline-block", fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 999, background: bg, color });

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1>曲目管理</h1>
          <p>上傳 MuseScore 等打譜軟體匯出的雙手 MusicXML，預覽後發布到單元的「樂譜」分頁</p>
        </div>
        <div className={styles.pageActions}>
          <button className={styles.btnSmall} onClick={fetchAll}>重新整理</button>
          <button className={styles.btnPrimary} onClick={openCreate}>新增曲目</button>
        </div>
      </div>

      {form && (
        <div className={styles.panel} style={{ marginBottom: 16, display: "grid", gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{form.id ? `編輯曲目（目前 v${form.version}）` : "新增曲目"}</h3>
          <div className={styles.formRow} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            <div className={styles.formGroup}>
              <label htmlFor="score-title">曲名</label>
              <input id="score-title" className={styles.input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="score-sub">作者／出處</label>
              <input id="score-sub" className={styles.input} value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} placeholder="例：InRecord 編曲" />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="score-diff">難度</label>
              <select id="score-diff" className={styles.selectInput} value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
                <option value="">未設定</option>
                {Object.entries(DIFF).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="score-file">樂譜檔（.musicxml／.mxl）{form.id ? "：選新檔＝替換新版" : ""}</label>
            <input id="score-file" type="file" accept=".musicxml,.mxl,.xml" onChange={onFile} />
            {form.file_name && !fileErr && <span style={{ fontSize: 12, color: "#64748b" }}>{form.file_name}{form.id && form.fileChanged ? `　→ 儲存後變成 v${form.version + 1}` : ""}</span>}
          </div>
          {fileErr && <div role="alert" style={{ color: "#b91c1c", fontSize: 13, fontWeight: 600 }}>⚠️ {fileErr}</div>}
          {model && (
            <div style={{ fontSize: 13, color: "#334155" }}>
              <div>✓ 讀到了：{summary}</div>
              {model.warnings.length > 0 && (
                <ul data-testid="score-warnings" style={{ margin: "6px 0 0", paddingLeft: 18, color: "#b45309" }}>
                  {model.warnings.map((w, i) => <li key={i}>{w.message}</li>)}
                </ul>
              )}
            </div>
          )}

          <div className={styles.formGroup}>
            <label>掛到哪些單元（可多選）</label>
            <div style={{ display: "grid", gap: 8, maxHeight: 220, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 8, padding: 10 }}>
              {unitsByChapter.map(({ chapter, units }) => (
                <div key={chapter.id}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>{chapter.title}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
                    {units.map((v) => (
                      <label key={v.id} style={{ fontSize: 13, display: "inline-flex", gap: 4, alignItems: "center" }}>
                        <input type="checkbox" checked={form.unitIds.includes(v.id)} onChange={() => toggleUnit(v.id)} />
                        {v.title}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {!unitsByChapter.length && <span style={{ fontSize: 12, color: "#94a3b8" }}>沒有單元</span>}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className={styles.btnSmall} disabled={!model} onClick={() => setPreview((v) => !v)}>預覽</button>
            <button type="button" className={styles.btnPrimary} disabled={!canSave} onClick={save}>{saving ? "儲存中…" : "儲存"}</button>
            <button type="button" className={styles.btnSmall} onClick={() => { setForm(null); setModel(null); setPreview(false); }}>取消</button>
            {!form.id && <span style={{ fontSize: 12, color: "#64748b", alignSelf: "center" }}>新建的曲目是草稿，學員看不到；在列表按「發布」才會出現</span>}
          </div>
          {preview && model && (
            <div style={{ border: "1px dashed #cbd5e1", borderRadius: 12, padding: 10, background: "#F5F5F7" }}>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>預覽（學員看到的畫面；尚未儲存）</div>
              <InteractiveScore xml={form.musicxml} title={form.title || model.title} subtitle={form.subtitle} />
            </div>
          )}
        </div>
      )}

      <div className={styles.panel}>
        {loading ? (
          <div className={styles.empty} style={{ padding: "40px 0" }}>載入中…</div>
        ) : !rows.length ? (
          <div className={styles.empty} style={{ padding: "48px 0", textAlign: "center" }}>還沒有任何曲目，點右上角「新增曲目」上傳第一首</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #f1f5f9" }}>
                  {["曲名", "難度", "狀態", "掛在哪些單元", "最後更新", "操作"].map((h) => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: "#64748b", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const abc = row.format !== "musicxml";
                  return (
                    <tr key={row.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={td}>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>
                          {row.title} {abc && <span style={tag("#f1f5f9", "#64748b")}>舊版 ABC</span>}
                          {!abc && row.version > 1 && <span style={{ fontSize: 11, color: "#94a3b8" }}> v{row.version}</span>}
                        </div>
                        {row.subtitle && <div style={{ fontSize: 12, color: "#94a3b8" }}>{row.subtitle}</div>}
                      </td>
                      <td style={td}>{DIFF[row.difficulty] || "—"}</td>
                      <td style={td}>{row.published ? <span style={tag("#dcfce7", "#15803d")}>已發布</span> : <span style={tag("#fef3c7", "#b45309")}>草稿</span>}</td>
                      <td style={td}>{(row.units || []).map((u) => u.title || u.video_id).join("、") || "—"}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtDate(row.updated_at)}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          {!abc && <button className={styles.btnSmall} onClick={() => openEdit(row)}>編輯</button>}
                          <button className={styles.btnSmall} onClick={() => setPublished(row, !row.published)}>{row.published ? "下架" : "發布"}</button>
                          {!abc && !row.published && <button className={styles.btnDanger} onClick={() => remove(row)}>刪除</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
