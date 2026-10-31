"use client";
// 後台「課程管理 → 曲目」：新增／編輯／刪除互動樂譜。
// 右手旋律兩種放法：上傳打譜軟體匯出的 MusicXML（.musicxml／.mxl，右手一行或雙手兩行），或在這裡直接打簡譜
// （送簡譜來源給 API，由伺服器轉 MusicXML；來源存在 meta.jianpu，之後可再打開修改）。
// 只有右手的曲子，左手依和弦自動產生（柱式＋第 8 章 8-2～8-8）；可設全曲預設伴奏，
// 也可在掛單元時逐一指定該單元固定用哪一種（學員端就不能切換）。設定都存在 scores.meta。
// 新建一律草稿（後端強制 published:false），按「發布」學員才看得到（且要 INTERACTIVE_SCORES=on 的站台）。
// 刪除：草稿、已發布、舊版 ABC 都能刪，刪前跳確認框。
// 上傳的曲目可隨時改和弦（lib/score/chord-edit.js）：只重寫改過的小節，音符不動，存檔即成新版。
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./admin.module.css";
import { adminFetch as api } from "@/lib/admin-client";
import { readScoreFile } from "@/lib/score/mxl";
import { parseMusicXml, ScoreError } from "@/lib/score/musicxml";
import { jianpuToMusicXml } from "@/lib/score/jianpu-input";
import { chordText, applyChordText } from "@/lib/score/chord-edit";
import { ACCOMPANIMENTS } from "@/lib/score/accompaniment";
import InteractiveScore from "@/components/classroom/score/InteractiveScore";

const DIFF = { 1: "入門", 2: "初級", 3: "中級" };
const ACC_IDS = new Set(["original", ...ACCOMPANIMENTS.map((a) => a.id)]);
const KEY_NAMES = ["C♭", "G♭", "D♭", "A♭", "E♭", "B♭", "F", "C", "G", "D", "A", "E", "B", "F♯", "C♯"];
const KEYS = ["C", "G", "D", "A", "E", "F", "Bb", "Eb", "Ab"];
const TIMES = ["4/4", "3/4", "2/4", "6/8"];
const ERR_TEXT = {
  not_grand_staff: "鋼琴譜最多兩行（上右手、下左手）。請在打譜軟體確認是鋼琴譜再匯出。",
  empty: "檔案是空的，或樂譜裡沒有任何小節。",
  no_part: "樂譜裡沒有任何聲部。",
};
const errText = (e) => (e instanceof ScoreError ? ERR_TEXT[e.code] || e.message : "檔案讀不出來，請確認是 .musicxml 或 .mxl。");
const EMPTY_JP = { key: "C", beats: 4, beatType: 4, tempo: 84, melody: "", chords: "" };
const EMPTY = {
  id: null, title: "", subtitle: "", difficulty: "", musicxml: "", file_name: "", unitIds: [], version: 1, published: false,
  fileChanged: false, source: "file", jp: EMPTY_JP, defaultAcc: "", unitAcc: {},
  baseXml: "", chords: "", uploadedNew: false, // 改和弦：baseXml＝上傳／讀進來的原檔，chords＝和弦文字框
};

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

  // 簡譜分頁：每次改字就重新轉換與檢查（錯誤即時顯示第幾小節）
  const applyJianpu = (f) => {
    if (!f.jp.melody.trim()) {
      setModel(null);
      setFileErr("");
      return { ...f, musicxml: "" };
    }
    try {
      const xml = jianpuToMusicXml({ ...f.jp, title: f.title });
      setModel(parseMusicXml(xml));
      setFileErr("");
      return { ...f, musicxml: xml };
    } catch (e) {
      setModel(null);
      setFileErr(e.message || "簡譜讀不出來");
      return { ...f, musicxml: "" };
    }
  };
  const setJp = (patch) => setForm((f) => applyJianpu({ ...f, jp: { ...f.jp, ...patch } }));
  const switchSource = (source) => {
    setPreview(false);
    setForm((f) => (source === "jianpu" ? applyJianpu({ ...f, source }) : { ...f, source, musicxml: "" }));
    if (source === "file") {
      setModel(null);
      setFileErr("");
    }
  };

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
      const meta = data.meta || {};
      const next = {
        ...EMPTY,
        id: data.id, title: data.title || "", subtitle: data.subtitle || "", difficulty: data.difficulty ?? "",
        musicxml: data.musicxml || "", file_name: data.file_name || "", unitIds: (data.units || []).map((u) => u.video_id),
        version: data.version || 1, published: !!data.published,
        source: meta.jianpu ? "jianpu" : "file", jp: meta.jianpu ? { ...EMPTY_JP, ...meta.jianpu } : EMPTY_JP,
        // 已下架的型態（2026-10-31 前的分解、琶音等）當作沒設，存檔才不會被擋
        defaultAcc: ACC_IDS.has(meta.defaultAccompaniment) ? meta.defaultAccompaniment : "",
        unitAcc: Object.fromEntries(Object.entries(meta.unitAccompaniment || {}).filter(([, v]) => ACC_IDS.has(v))),
      };
      try {
        const m = parseMusicXml(data.musicxml);
        setModel(m);
        setFileErr("");
        if (!meta.jianpu) Object.assign(next, { baseXml: data.musicxml, chords: chordText(m) });
      } catch (e) {
        setModel(null);
        setFileErr(errText(e));
      }
      setForm(next);
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
      setForm((f) => ({ ...f, musicxml: xml, file_name: file.name, fileChanged: true, uploadedNew: true, baseXml: xml, chords: chordText(m), title: f.title || m.title || "" }));
    } catch (err) {
      setModel(null);
      setFileErr(errText(err));
      setForm((f) => ({ ...f, musicxml: "", fileChanged: true, uploadedNew: true, baseXml: "", chords: "" }));
    }
  };

  // 改和弦：每次改字都從原檔重算（只動改過的小節），錯誤即時顯示第幾小節
  const setChords = (chords) => {
    setPreview(false);
    setForm((f) => {
      try {
        const xml = applyChordText(f.baseXml, parseMusicXml(f.baseXml), chords);
        setModel(parseMusicXml(xml));
        setFileErr("");
        return { ...f, chords, musicxml: xml, fileChanged: f.uploadedNew || xml !== f.baseXml };
      } catch (e) {
        setModel(null);
        setFileErr(e.message || "和弦讀不出來");
        return { ...f, chords, musicxml: "" };
      }
    });
  };

  const toggleUnit = (id) =>
    setForm((f) => ({ ...f, unitIds: f.unitIds.includes(id) ? f.unitIds.filter((x) => x !== id) : [...f.unitIds, id] }));
  const setUnitAcc = (id, value) =>
    setForm((f) => {
      const unitAcc = { ...f.unitAcc };
      if (value) unitAcc[id] = value;
      else delete unitAcc[id];
      return { ...f, unitAcc };
    });

  // 伴奏選項：有原譜左手才多「原譜左手」；沒有和弦就無法自動配
  const accOptions = [
    ...(model?.hasLeftHand ? [{ value: "original", label: "原譜左手" }] : []),
    ...(model?.hasChords ? ACCOMPANIMENTS.map((a) => ({ value: a.id, label: a.label })) : []),
  ];

  const canSave = !!form && !!form.title.trim() && !!form.musicxml && !!model && !fileErr && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const unitAcc = Object.fromEntries(Object.entries(form.unitAcc).filter(([k]) => form.unitIds.includes(k)));
    const body = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      difficulty: form.difficulty === "" ? null : Number(form.difficulty),
      unitIds: form.unitIds,
      default_accompaniment: form.defaultAcc || null,
      unit_accompaniment: unitAcc,
    };
    if (form.source === "jianpu") body.jianpu = form.jp;
    else if (!form.id || form.fileChanged) Object.assign(body, { musicxml: form.musicxml, file_name: form.file_name || null });
    try {
      const r = await api("/api/admin/scores", { method: form.id ? "PATCH" : "POST", body: JSON.stringify(form.id ? { id: form.id, ...body } : body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || ERR_TEXT[d.error] || d.error || "save_failed");
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
  // 上移／下移：照清單順序重新編號，只送順序有變的那幾首（學員端同一單元的曲子也照這個順序）
  const move = async (index, delta) => {
    const j = index + delta;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[index], next[j]] = [next[j], next[index]];
    setRows(next);
    const changed = next.map((r, i) => ({ r, i })).filter(({ r, i }) => r.sort_order !== i);
    const results = await Promise.all(
      changed.map(({ r, i }) => api("/api/admin/scores", { method: "PATCH", body: JSON.stringify({ id: r.id, sort_order: i }) })),
    );
    if (results.some((x) => !x.ok)) showToast("❌ 順序沒有存好，請重新整理再試一次");
    fetchAll();
  };
  const remove = async (row) => {
    const q = row.published ? `「${row.title}」已發布，刪除後學員會立刻看不到，而且無法復原。確定刪除？` : `確定刪除「${row.title}」？刪除後無法復原。`;
    if (typeof window !== "undefined" && !window.confirm(q)) return;
    const r = await api(`/api/admin/scores?id=${row.id}`, { method: "DELETE" });
    if (r.ok) {
      showToast("已刪除");
      if (form?.id === row.id) setForm(null);
      fetchAll();
    } else showToast("❌ 刪除失敗");
  };

  const firstFull = model ? model.measures.find((m) => !m.implicit) || model.measures[0] : null;
  const summary = model
    ? `${model.measures.length} 小節 · 1=${KEY_NAMES[model.measures[0].key.fifths + 7]} · ${firstFull.time.beats}/${firstFull.time.beatType} · ${model.tempo ? `♩=${Math.round(model.tempo)}` : "沒寫速度"} · ${model.hasChords ? `和弦 ${model.chords.length} 個` : "沒有和弦名"} · ${model.hasLeftHand ? "雙手" : "只有右手"}`
    : "";
  const td = { padding: "10px 14px", verticalAlign: "top" };
  const tag = (bg, color) => ({ display: "inline-block", fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 999, background: bg, color });
  const ta = { width: "100%", fontFamily: "ui-monospace,Menlo,monospace", fontSize: 13, padding: 8, border: "1px solid #d5dce6", borderRadius: 8 };
  const accLabel = (v) => accOptions.find((o) => o.value === v)?.label;

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1>曲目管理</h1>
          <p>上傳打譜軟體匯出的 MusicXML，或直接打簡譜；只有右手的曲子左手會依和弦自動配</p>
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

          <div role="tablist" aria-label="右手旋律來源" className={styles.tabGroup}>
            <button type="button" role="tab" aria-selected={form.source === "file"} className={`${styles.tab} ${form.source === "file" ? styles.tabActive : ""}`} onClick={() => switchSource("file")}>上傳檔案</button>
            <button type="button" role="tab" aria-selected={form.source === "jianpu"} className={`${styles.tab} ${form.source === "jianpu" ? styles.tabActive : ""}`} onClick={() => switchSource("jianpu")}>直接打簡譜</button>
          </div>

          {form.source === "file" ? (
            <div className={styles.formGroup}>
              <label htmlFor="score-file">樂譜檔（.musicxml／.mxl，右手一行或雙手兩行）{form.id ? "：選新檔＝替換新版" : ""}</label>
              <input id="score-file" type="file" accept=".musicxml,.mxl,.xml" onChange={onFile} />
              {form.file_name && !fileErr && <span style={{ fontSize: 12, color: "#64748b" }}>{form.file_name}{form.id && form.fileChanged ? `　→ 儲存後變成 v${form.version + 1}` : ""}</span>}
              {form.baseXml && (
                <>
                  <label htmlFor="score-file-chords" style={{ marginTop: 8 }}>和弦（每小節用 | 分開；只會改你動到的小節，音符不變）</label>
                  <input id="score-file-chords" style={ta} spellCheck={false} value={form.chords} onChange={(e) => setChords(e.target.value)} />
                </>
              )}
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <label style={{ fontSize: 13 }}>調號{" "}
                  <select aria-label="調號" value={form.jp.key} onChange={(e) => setJp({ key: e.target.value })}>
                    {KEYS.map((k) => <option key={k} value={k}>1={k.replace("b", "♭")}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 13 }}>拍號{" "}
                  <select aria-label="拍號" value={`${form.jp.beats}/${form.jp.beatType}`} onChange={(e) => { const [b, t] = e.target.value.split("/").map(Number); setJp({ beats: b, beatType: t }); }}>
                    {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 13 }}>速度 ♩={" "}
                  <input aria-label="速度" type="number" min="40" max="200" value={form.jp.tempo ?? ""} style={{ width: 64 }} onChange={(e) => setJp({ tempo: e.target.value ? Number(e.target.value) : null })} />
                </label>
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="score-melody">右手旋律（簡譜）</label>
                <textarea id="score-melody" rows={4} style={ta} spellCheck={false} value={form.jp.melody} onChange={(e) => setJp({ melody: e.target.value })} placeholder="5 3 3 - | 4 2 2 - | 1 2 3 4 | 5 5 5 -" />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="score-chords">和弦（每小節用 | 分開）</label>
                <input id="score-chords" style={ta} spellCheck={false} value={form.jp.chords} onChange={(e) => setJp({ chords: e.target.value })} placeholder="C | G7 | C | G7" />
              </div>
              <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.7 }}>
                旋律：<code>1</code>–<code>7</code> 唱名、<code>0</code> 休止、<code>-</code> 延長一拍、<code>&apos;</code> 高八度、<code>,</code> 低八度、<code>_</code> 八分（<code>__</code> 十六分）、<code>.</code> 附點、<code>#</code>／<code>b</code> 升降、<code>|</code> 小節線；以四分音符為一拍，第一小節拍數不足視為弱起。
                和弦：每小節 1、2 或 4 個，例如 <code>C</code> <code>Am</code> <code>G7</code> <code>Cmaj7</code> <code>Dm7</code> <code>F#m</code> <code>Bb</code> <code>G7/B</code>；空白小節沿用前一個。
              </p>
            </div>
          )}

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

          {accOptions.length > 0 && (
            <div className={styles.formGroup}>
              <label htmlFor="score-acc">預設伴奏</label>
              <select id="score-acc" className={styles.selectInput} value={form.defaultAcc} onChange={(e) => setForm({ ...form, defaultAcc: e.target.value })}>
                <option value="">自動（{model?.hasLeftHand ? "原譜左手" : "柱式"}）</option>
                {accOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}

          <div className={styles.formGroup}>
            <label>掛到哪些單元（可多選；可逐一指定該單元固定用哪種伴奏）</label>
            <div style={{ display: "grid", gap: 8, maxHeight: 260, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 8, padding: 10 }}>
              {unitsByChapter.map(({ chapter, units }) => (
                <div key={chapter.id}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>{chapter.title}</div>
                  <div style={{ display: "grid", gap: 4 }}>
                    {units.map((v) => {
                      const on = form.unitIds.includes(v.id);
                      return (
                        <div key={v.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <label style={{ fontSize: 13, display: "inline-flex", gap: 4, alignItems: "center" }}>
                            <input type="checkbox" checked={on} onChange={() => toggleUnit(v.id)} />
                            {v.title}
                          </label>
                          {on && accOptions.length > 0 && (
                            <select aria-label={`${v.title} 的伴奏`} value={form.unitAcc[v.id] || ""} onChange={(e) => setUnitAcc(v.id, e.target.value)} style={{ fontSize: 12 }}>
                              <option value="">學員自選</option>
                              {accOptions.map((o) => <option key={o.value} value={o.value}>只用{o.label}</option>)}
                            </select>
                          )}
                        </div>
                      );
                    })}
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
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>預覽（學員看到的畫面；尚未儲存）{form.defaultAcc ? `　預設伴奏：${accLabel(form.defaultAcc)}` : ""}</div>
              <InteractiveScore key={form.musicxml.length + form.defaultAcc} xml={form.musicxml} title={form.title || model.title} subtitle={form.subtitle} defaultAccompaniment={form.defaultAcc || null} />
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
                {rows.map((row, index) => {
                  const abc = row.format !== "musicxml";
                  const ua = row.meta?.unitAccompaniment || {};
                  const accName = (v) => (v === "original" ? "原譜左手" : ACCOMPANIMENTS.find((a) => a.id === v)?.label);
                  return (
                    <tr key={row.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={td}>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>
                          {row.title} {abc && <span style={tag("#f1f5f9", "#64748b")}>舊版 ABC</span>}
                          {!abc && row.meta?.jianpu && <span style={tag("#eef2ff", "#4338ca")}>簡譜輸入</span>}
                          {!abc && row.version > 1 && <span style={{ fontSize: 11, color: "#94a3b8" }}> v{row.version}</span>}
                        </div>
                        {row.subtitle && <div style={{ fontSize: 12, color: "#94a3b8" }}>{row.subtitle}</div>}
                      </td>
                      <td style={td}>{DIFF[row.difficulty] || "—"}</td>
                      <td style={td}>{row.published ? <span style={tag("#dcfce7", "#15803d")}>已發布</span> : <span style={tag("#fef3c7", "#b45309")}>草稿</span>}</td>
                      <td style={td}>
                        {(row.units || []).map((u) => (
                          <div key={u.video_id}>{u.title || u.video_id}{accName(ua[u.video_id]) ? <span style={{ color: "#64748b" }}>（只用{accName(ua[u.video_id])}）</span> : ""}</div>
                        ))}
                        {!(row.units || []).length && "—"}
                      </td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtDate(row.updated_at)}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        <div className={styles.rowActions}>
                          <button className={styles.btnSmall} disabled={index === 0} onClick={() => move(index, -1)} aria-label={`把「${row.title}」往上移`}>上移</button>
                          <button className={styles.btnSmall} disabled={index === rows.length - 1} onClick={() => move(index, 1)} aria-label={`把「${row.title}」往下移`}>下移</button>
                          {!abc && <button className={styles.btnSmall} onClick={() => openEdit(row)}>編輯</button>}
                          <button className={styles.btnSmall} onClick={() => setPublished(row, !row.published)}>{row.published ? "下架" : "發布"}</button>
                          <button className={`${styles.btnSmall} ${styles.btnDanger}`} onClick={() => remove(row)}>刪除</button>
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
