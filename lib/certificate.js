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

  const eligible = videoTotal > 0 && videoDone === videoTotal && quizDone === quizTotal;
  return { eligible, videoDone, videoTotal, quizDone, quizTotal };
}
