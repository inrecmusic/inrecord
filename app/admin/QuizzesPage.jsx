"use client";
import { useEffect, useState, useCallback } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import styles from "./admin.module.css";

const pw = () => (typeof window !== "undefined" ? sessionStorage.getItem("inrecord_admin_token") : "");
function api(path, opts = {}) {
  return fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${pw()}`, ...(opts.headers || {}) } });
}

function QuestionEditor({ quizId, showToast, onChange }) {
  const [questions, setQuestions] = useState([]);
  const [form, setForm] = useState({ question: "", options: ["", ""], correct_index: 0 });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api(`/api/admin/quiz-questions?quiz_id=${quizId}`);
    const d = await r.json();
    setQuestions(d.questions || []);
  }, [quizId]);
  useEffect(() => { load(); }, [load]);

  function setOpt(i, val) { setForm(f => ({ ...f, options: f.options.map((o, j) => (j === i ? val : o)) })); }
  function addOpt() { setForm(f => ({ ...f, options: [...f.options, ""] })); }
  function removeOpt(i) {
    setForm(f => {
      if (f.options.length <= 2) return f; // 至少保留兩個選項
      const options = f.options.filter((_, j) => j !== i);
      let correct_index = f.correct_index;
      if (i === correct_index) correct_index = 0;      // 刪到正解本身 → 重設為第一個
      else if (i < correct_index) correct_index -= 1;  // 刪在正解之前 → 下移一格，仍指同一選項
      if (correct_index >= options.length) correct_index = 0; // 安全網
      return { ...f, options, correct_index };
    });
  }

  async function addQuestion(e) {
    e.preventDefault();
    if (!form.question.trim()) { showToast("請輸入題目"); return; }
    if (form.options.length < 2 || form.options.some(o => !o.trim())) { showToast("至少兩個選項且不可空白"); return; }
    setBusy(true);
    try {
      // sort_order 用「現有最大值 +1」而非 questions.length：後者在刪過非最後一題後會與現有題目撞號
      const nextOrder = questions.length ? Math.max(...questions.map(q => Number(q.sort_order) || 0)) + 1 : 0;
      const r = await api("/api/admin/quiz-questions", { method: "POST", body: JSON.stringify({ quiz_id: quizId, question: form.question.trim(), options: form.options.map(o => o.trim()), correct_index: form.correct_index, sort_order: nextOrder }) });
      if (r.ok) { showToast("✅ 題目已新增"); setForm({ question: "", options: ["", ""], correct_index: 0 }); load(); onChange?.(); }
      else { const d = await r.json(); showToast("❌ " + (d.error || "新增失敗")); }
    } catch { showToast("❌ 新增失敗"); }
    setBusy(false);
  }

  async function removeQuestion(id) {
    if (!window.confirm("確定刪除此題？")) return;
    setBusy(true);
    try {
      const r = await api(`/api/admin/quiz-questions?id=${id}`, { method: "DELETE" });
      if (r.ok) { showToast("✅ 已刪除"); load(); onChange?.(); }
      else { const d = await r.json().catch(() => ({})); showToast(d.error === "last_question_published" ? "❌ 已發布測驗需保留至少一題，請先取消發布再刪除" : "❌ 刪除失敗"); }
    } catch { showToast("❌ 刪除失敗"); }
    setBusy(false);
  }

  return (
    <div style={{ marginTop: 12, paddingLeft: 12, borderLeft: "2px solid #e2e8f0" }}>
      {questions.map((q, i) => (
        <div key={q.id} style={{ marginBottom: 8, fontSize: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span style={{ color: "#0f172a", fontWeight: 600 }}>{i + 1}. {q.question}</span>
            <button className={`${styles.btnSmall} ${styles.btnDanger}`} onClick={() => removeQuestion(q.id)} disabled={busy}>刪除</button>
          </div>
          <div style={{ color: "#64748b", marginTop: 2 }}>
            {(q.options || []).map((o, j) => (
              <span key={j} style={{ marginRight: 10, color: j === q.correct_index ? "#16a34a" : "#64748b", fontWeight: j === q.correct_index ? 700 : 400 }}>
                {j === q.correct_index ? "✔ " : ""}{o}
              </span>
            ))}
          </div>
        </div>
      ))}

      <form onSubmit={addQuestion} style={{ marginTop: 10, display: "grid", gap: 8 }}>
        <input className={styles.input} placeholder="新題目" value={form.question} onChange={e => setForm(f => ({ ...f, question: e.target.value }))} />
        {form.options.map((o, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="radio" name={`correct-${quizId}`} checked={form.correct_index === i} onChange={() => setForm(f => ({ ...f, correct_index: i }))} title="正解" />
            <input className={styles.input} style={{ flex: 1 }} placeholder={`選項 ${i + 1}`} value={o} onChange={e => setOpt(i, e.target.value)} />
            {form.options.length > 2 && <button type="button" className={styles.btnSmall} onClick={() => removeOpt(i)}>移除</button>}
          </div>
        ))}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className={styles.btnSmall} onClick={addOpt}>＋ 選項</button>
          <button type="submit" className={styles.btnPrimary} disabled={busy}>新增題目（勾選左側圓鈕為正解）</button>
        </div>
      </form>
    </div>
  );
}

export default function QuizzesPage({ showToast, courseId }) {
  const [chapters, setChapters] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [form, setForm] = useState({ chapter_id: "", title: "", pass_score: 80 });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cr, qr] = await Promise.all([api("/api/admin/chapters"), api("/api/admin/quizzes")]);
      if (!cr.ok || !qr.ok) throw new Error("load_failed");
      const cd = await cr.json(); const qd = await qr.json();
      setChapters(cd.data || []); setQuizzes(qd.quizzes || []);
    } catch { showToast?.("❌ 測驗載入失敗，請重新整理頁面"); } // 失敗別靜默顯示「尚無測驗」誤導
  }, [showToast]);
  useEffect(() => { load(); }, [load]);

  const chapterTitle = (id) => chapters.find(c => c.id === id)?.title || "（未指定章節）";

  async function addQuiz(e) {
    e.preventDefault();
    if (!form.title.trim()) { showToast("請輸入測驗標題"); return; }
    setBusy(true);
    try {
      const r = await api("/api/admin/quizzes", { method: "POST", body: JSON.stringify({ chapter_id: form.chapter_id || null, title: form.title.trim(), pass_score: form.pass_score === "" || form.pass_score == null || Number.isNaN(Number(form.pass_score)) ? 80 : Number(form.pass_score) }) });
      if (r.ok) { showToast("✅ 測驗已建立"); setForm({ chapter_id: "", title: "", pass_score: 80 }); load(); }
      else showToast("❌ 建立失敗");
    } catch { showToast("❌ 建立失敗"); }
    setBusy(false);
  }

  async function togglePublish(q) {
    setBusy(true);
    try {
      const r = await api("/api/admin/quizzes", { method: "PATCH", body: JSON.stringify({ id: q.id, published: !q.published }) });
      if (r.ok) load();
      else { const d = await r.json().catch(() => ({})); showToast(d.error === "no_questions" ? "❌ 發布前請先新增至少一題" : "❌ 更新失敗"); }
    } catch { showToast("❌ 更新失敗"); }
    setBusy(false);
  }

  async function removeQuiz(id) {
    if (!window.confirm("確定刪除此測驗？其下題目與作答紀錄一併刪除、無法復原。")) return;
    setBusy(true);
    try {
      const r = await api(`/api/admin/quizzes?id=${id}`, { method: "DELETE" });
      if (r.ok) { showToast("✅ 已刪除"); if (expanded === id) setExpanded(null); load(); } else showToast("❌ 刪除失敗");
    } catch { showToast("❌ 刪除失敗"); }
    setBusy(false);
  }

  return (
    <div>
      <div className={styles.pageHeader}><div><h1>測驗管理</h1><p>依章節建立單選測驗、設定及格分、出題</p></div></div>

      <form onSubmit={addQuiz} className={styles.panel} style={{ display: "grid", gap: 10, marginBottom: 18 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>新增測驗</h3>
        <select className={styles.input} value={form.chapter_id} onChange={e => setForm(f => ({ ...f, chapter_id: e.target.value }))}>
          <option value="">（不綁章節）</option>
          {chapters.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <input className={styles.input} placeholder="測驗標題" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
        <label style={{ fontSize: 13, color: "#475569", display: "flex", alignItems: "center", gap: 8 }}>
          及格分 <input className={styles.input} style={{ width: 90 }} type="number" min={0} max={100} value={form.pass_score} onChange={e => setForm(f => ({ ...f, pass_score: e.target.value }))} /> 分
        </label>
        <button type="submit" className={styles.btnPrimary} disabled={busy}>建立測驗</button>
      </form>

      {quizzes.length === 0 ? <p style={{ color: "#94a3b8" }}>尚無測驗</p> : (
        <div style={{ display: "grid", gap: 10 }}>
          {quizzes.map(q => (
            <div key={q.id} className={styles.panel}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button className={styles.iconBtn} onClick={() => setExpanded(expanded === q.id ? null : q.id)} aria-label="展開題目">
                  {expanded === q.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: 15, color: "#0f172a" }}>{q.title}</strong>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{chapterTitle(q.chapter_id)}・及格 {q.pass_score} 分{q.published ? "" : "・未發布"}</div>
                </div>
                <button className={styles.btnSmall} onClick={() => togglePublish(q)} disabled={busy}>{q.published ? "設為未發布" : "發布"}</button>
                <button className={`${styles.btnSmall} ${styles.btnDanger}`} onClick={() => removeQuiz(q.id)} disabled={busy}>刪除</button>
              </div>
              {expanded === q.id && <QuestionEditor quizId={q.id} showToast={showToast} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
