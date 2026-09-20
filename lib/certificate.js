// lib/certificate.js — 完課證書資格判定純邏輯（吃 id 陣列，不碰 DB）。

export function certificateStatus({ publishedVideoIds, completedVideoIds, publishedQuizIds, passedQuizIds } = {}) {
  const pv = Array.isArray(publishedVideoIds) ? publishedVideoIds : [];
  const cv = new Set(Array.isArray(completedVideoIds) ? completedVideoIds : []);
  const pq = Array.isArray(publishedQuizIds) ? publishedQuizIds : [];
  const pass = new Set(Array.isArray(passedQuizIds) ? passedQuizIds : []);

  const videoTotal = pv.length;
  const videoDone = pv.filter((id) => cv.has(id)).length;
  const quizTotal = pq.length;
  const quizDone = pq.filter((id) => pass.has(id)).length;

  // ⚠️ 資格暫不看測驗：學員端沒有作答介面（quiz API 目前只有後台在用），
  // 只要後台發布任何一份測驗，全體學員就永遠拿不到證書。
  // 等學員端測驗上線再把 quizDone === quizTotal 加回來；數字仍照常回報供畫面顯示。
  const eligible = videoTotal > 0 && videoDone === videoTotal;
  return { eligible, videoDone, videoTotal, quizDone, quizTotal };
}
