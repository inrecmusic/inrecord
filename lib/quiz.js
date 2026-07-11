// lib/quiz.js — 測驗計分與去正解純邏輯。

export function gradeQuiz(questions, answers, passScore = 80) {
  const qs = Array.isArray(questions) ? questions : [];
  const ans = Array.isArray(answers) ? answers : [];
  const correct = qs.map((q) => q.correct_index);
  const total = qs.length;
  let hit = 0;
  for (let i = 0; i < total; i++) {
    if (ans[i] === qs[i].correct_index) hit++;
  }
  const score = total > 0 ? Math.round((hit / total) * 100) : 0;
  const passed = total > 0 && score >= passScore;
  return { score, passed, correct };
}

export function stripAnswers(questions) {
  return (Array.isArray(questions) ? questions : []).map(({ correct_index, ...rest }) => rest);
}
