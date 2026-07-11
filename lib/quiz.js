// lib/quiz.js — 測驗計分與去正解純邏輯。

export function gradeQuiz(questions, answers, passScore = 80) {
  const qs = Array.isArray(questions) ? questions : [];
  const ans = Array.isArray(answers) ? answers : [];
  const correct = qs.map((q) => q.correct_index);
  const total = qs.length;
  let hit = 0;
  for (let i = 0; i < total; i++) {
    const ci = qs[i] && qs[i].correct_index;
    if (typeof ci === "number" && ans[i] === ci) hit++;
  }
  const score = total > 0 ? Math.round((hit / total) * 100) : 0;
  const passed = total > 0 && score >= passScore;
  return { score, passed, correct };
}

export function stripAnswers(questions) {
  return (Array.isArray(questions) ? questions : []).map((q) => {
    if (!q || typeof q !== "object") return q;
    const { correct_index, ...rest } = q;
    return rest;
  });
}
