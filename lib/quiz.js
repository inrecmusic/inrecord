// lib/quiz.js — 測驗計分與去正解純邏輯。

export function gradeQuiz(questions, answers, passScore = 80) {
  const qs = Array.isArray(questions) ? questions : [];
  const ans = Array.isArray(answers) ? answers : [];
  const total = qs.length;
  let hit = 0;
  // results[i] = 該題「學員答對與否」的 boolean，僅回對錯，絕不回 correct_index 正解本身（防前端/網路層洩漏答案）。
  const results = qs.map((q, i) => {
    const ci = q && q.correct_index;
    const ok = typeof ci === "number" && ans[i] === ci;
    if (ok) hit++;
    return ok;
  });
  const score = total > 0 ? Math.round((hit / total) * 100) : 0;
  const passed = total > 0 && score >= passScore;
  return { score, passed, results };
}

export function stripAnswers(questions) {
  return (Array.isArray(questions) ? questions : []).map((q) => {
    if (!q || typeof q !== "object") return q;
    const { correct_index, ...rest } = q;
    return rest;
  });
}
