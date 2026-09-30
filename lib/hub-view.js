// lib/hub-view.js — 學員中心儀表板的資料模型（純函式，可測；不碰 Date.now，時間由呼叫端傳入）
//
// bootstrap（儀表板模式）給的東西：chapters{id,title,sort_order}、videos{id,chapter_id,title,sort_order,duration,playable}、
// progress{video_id,completed,watched_seconds,total_seconds,watched_at}、earlyAccess（false＝非早鳥 9/30 前無正課可播；完整上架後不再回傳）。
// 這裡把它們整理成畫面要的：接著看、進度數字、本章單元、章節卡、練功房、下一次開放。
//
// ⚠️ videos.sort_order 是「章內序號」（後台每章從 0 起編），bootstrap 的全域排序會跨章交錯（1-1、2-1、1-2…），
// 所以這裡一定先依章節順序、再依章內序號攤平，才找「第一支未完成」。
// ⚠️ 試看單元（標題以「試看」開頭）任何人任何時候都可播，不算課程進度、不當「接著看」。
import { FULL_RELEASE_MS, SECOND_RELEASE_MS, isTrialVideo } from "./early-access.js";
import { CHAPTER_RELEASE_DATES, DEFAULT_RELEASE_DATE, PLANNED_CHAPTER_GAMES, chapterNum, mdLabel, unitNo } from "./release-schedule.js";
import { parseDurationSeconds } from "./duration.js";

const DAY = 86_400_000;
const TW_OFFSET = 8 * 3_600_000;
const CN_NUM = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
export const ROMAN = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ", "Ⅷ", "Ⅸ", "Ⅹ"];

// 台灣日期序號（天）：同一天的兩個時刻回同一個整數
export const twDayIndex = (ms) => Math.floor((ms + TW_OFFSET) / DAY);
const twDateMs = (dateStr) => Date.parse(`${dateStr}T00:00:00+08:00`);

export function cnNum(n) {
  if (!Number.isFinite(n) || n < 0) return String(n);
  if (n <= 10) return CN_NUM[n];
  if (n < 20) return `十${CN_NUM[n - 10]}`;
  return `${CN_NUM[Math.floor(n / 10)]}十${n % 10 ? CN_NUM[n % 10] : ""}`;
}

// 中文接數字要留半形空格：「第二章」＋「3 天前」→「第二章 3 天前」；「第二章」＋「昨天」→「第二章昨天」
export const joinCn = (a, b) => (/\d$/.test(a) || /^\d/.test(b) ? `${a} ${b}` : `${a}${b}`);

// 相對日：過去→「今天／昨天／N 天前」，未來→「明天／N 天後」
export function relativeDayLabel(targetMs, nowMs) {
  if (!Number.isFinite(targetMs) || !Number.isFinite(nowMs)) return "";
  const d = twDayIndex(targetMs) - twDayIndex(nowMs);
  if (d === 0) return "今天";
  if (d === -1) return "昨天";
  if (d === 1) return "明天";
  return d < 0 ? `${-d} 天前` : `${d} 天後`;
}

// "05:09" → "5 分 9 秒"；"07:36" → "7 分 36 秒"；解析不出 → ""
export function durationLabel(text) {
  const s = parseDurationSeconds(text);
  if (!s) return "";
  const m = Math.floor(s / 60), r = s % 60;
  return m ? (r ? `${m} 分 ${r} 秒` : `${m} 分鐘`) : `${r} 秒`;
}
// "05:09" → "5:09"（縮圖角標）
export function durationShort(text) {
  const s = parseDurationSeconds(text);
  return s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "";
}
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// "Ch2 音符的語言—音名與唱名" → { num:2, main:"音符的語言", sub:"音名與唱名", label:"Ⅱ", isAppendix:false }
// "附錄1 如何更有效率地練琴？" → { num:NaN, main:"如何更有效率地練琴？", label:"附錄一", isAppendix:true }
export function splitChapterTitle(title, index = 0) {
  const t = String(title || "").trim();
  const appx = /^附錄\s*(\d*)\s*(.*)$/.exec(t);
  if (appx) return { num: NaN, main: appx[2].trim() || t, sub: "", label: appx[1] ? `附錄${cnNum(Number(appx[1]))}` : "附錄", isAppendix: true };
  const num = chapterNum(t);
  const body = t.replace(/^Ch\d+\s*/i, "");
  const [main, ...rest] = body.split(/[—–]/);
  return { num, main: (main || body).trim(), sub: rest.join("—").trim(), label: ROMAN[Number.isFinite(num) ? num - 1 : index] || String(index + 1), isAppendix: false };
}

// 章節的中文名：「第二章」；附錄或標題沒有 ChN → 用卡片標籤（附錄一／Ⅲ）
export const chapterName = (c) => (!c ? "" : c.isAppendix || !Number.isFinite(c.num) ? c.label : `第${cnNum(c.num)}章`);

// 單元標題 "2-1 認識音名 C、D、E、F、G、A、B" → { no:"2-1", name:"認識音名 C、D、E、F、G、A、B", ref:"2-1" }
// 沒有編號（試看／附錄影片）→ ref 退回單元名，句子裡才不會出現空字串
export function splitUnitTitle(title) {
  const t = String(title || "").trim();
  const no = unitNo(t);
  return /^\d+-\d+$/.test(no) ? { no, name: t.slice(no.length).trim(), ref: no } : { no: "", name: t, ref: t };
}

// 這一章「什麼時候開放」（給還沒有可播單元的章）：非早鳥 9/30 前看批次日，其餘看章節時程表
export function chapterOpenDate(num, early, nowMs) {
  if (early === false) {
    if (Number.isFinite(num) && num <= 3) return nowMs < FULL_RELEASE_MS ? "2026-09-30" : (CHAPTER_RELEASE_DATES[num] || "2026-09-30");
    return nowMs < SECOND_RELEASE_MS ? "2026-10-31" : (CHAPTER_RELEASE_DATES[num] || DEFAULT_RELEASE_DATE);
  }
  return CHAPTER_RELEASE_DATES[num] || DEFAULT_RELEASE_DATE;
}
// 鎖定章節的說明：日期還沒到→「9/30 開放」；日期過了影片還沒掛上→「即將上架」（與播放頁側欄的保險絲一致）
export function lockedNote(dateStr, nowMs) {
  return twDayIndex(twDateMs(dateStr)) < twDayIndex(nowMs) ? "即將上架" : `${mdLabel(dateStr)} 開放`;
}

// 下一次開放：{ label:"第三、四章", date:"9/30", inDays:5 } | null
export function nextRelease({ early, nowMs, chapters = [], playableByChapter = new Map() } = {}) {
  const today = twDayIndex(nowMs);
  if (early === false) {
    if (nowMs < FULL_RELEASE_MS) return { label: "第一批章節（第一到三章）", date: "9/30", inDays: twDayIndex(FULL_RELEASE_MS) - today };
    if (nowMs < SECOND_RELEASE_MS) return { label: "全部章節", date: "10/31", inDays: twDayIndex(SECOND_RELEASE_MS) - today };
    return null;
  }
  // 早鳥：時程表裡「日期還沒到、或到了但影片還沒掛上」的最早一天
  let best = null;
  for (const [numStr, date] of Object.entries(CHAPTER_RELEASE_DATES)) {
    const num = Number(numStr);
    const ch = chapters.find((c) => chapterNum(c.title) === num);
    if (ch && (playableByChapter.get(ch.id) || 0) > 0) continue; // 已經看得到就不算「下一次」
    const dayIdx = twDayIndex(twDateMs(date));
    if (dayIdx < today) continue; // 過期未上架：交給「即將上架」，這裡不預告舊日期
    if (!best || dayIdx < best.dayIdx) best = { dayIdx, date, nums: [num] };
    else if (dayIdx === best.dayIdx) best.nums.push(num);
  }
  if (!best) return null;
  const nums = best.nums.sort((a, b) => a - b);
  return { label: `第${nums.map(cnNum).join("、")}章`, date: mdLabel(best.date), inDays: best.dayIdx - today };
}

// 依課程順序攤平：章節 sort_order → 章內 sort_order → created_at／標題
export function orderVideos(chapters = [], videos = []) {
  const chIdx = new Map(chapters.map((c, i) => [c.id, Number.isFinite(c.sort_order) ? c.sort_order : i]));
  const key = (v) => [chIdx.has(v.chapter_id) ? chIdx.get(v.chapter_id) : Number.MAX_SAFE_INTEGER, Number.isFinite(v.sort_order) ? v.sort_order : 0];
  return [...videos].sort((a, b) => {
    const [ca, sa] = key(a), [cb, sb] = key(b);
    return ca - cb || sa - sb || String(a.created_at || "").localeCompare(String(b.created_at || "")) || String(a.title || "").localeCompare(String(b.title || ""));
  });
}

// 主模型
export function buildHubModel({ chapters = [], videos = [], progress = [], earlyAccess, nowMs, openedGames = null } = {}) {
  const sortedChapters = [...chapters].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const course = orderVideos(sortedChapters, videos.filter((v) => !isTrialVideo(v))); // 試看不算課程
  const known = new Set(course.map((v) => v.id));
  const prog = new Map(progress.filter((p) => known.has(p.video_id)).map((p) => [p.video_id, p])); // 忽略指向已下架影片的孤兒進度
  const isDone = (v) => !!prog.get(v.id)?.completed;
  const playable = course.filter((v) => v.playable);
  const byChapter = new Map();
  for (const v of course) byChapter.set(v.chapter_id, [...(byChapter.get(v.chapter_id) || []), v]);
  const playableByChapter = new Map([...byChapter].map(([id, vs]) => [id, vs.filter((v) => v.playable).length]));

  // 上次看到：watched_at 最晚的一筆（只算還在的影片）
  const last = [...prog.values()].filter((p) => p.watched_at).sort((a, b) => Date.parse(b.watched_at) - Date.parse(a.watched_at))[0] || null;
  const lastVideo = last ? course.find((v) => v.id === last.video_id) || null : null;
  const lastWatched = lastVideo ? { video: lastVideo, ...splitUnitTitle(lastVideo.title), when: relativeDayLabel(Date.parse(last.watched_at), nowMs) } : null;

  // 接著看：最近看到一半的那支優先（學員正在看的）；否則課程順序裡第一支「可播且未完成」；全部看完就回第一支可播
  const resume = lastVideo && lastVideo.playable && !isDone(lastVideo) ? lastVideo : null;
  const nextVideo = resume || playable.find((v) => !isDone(v)) || playable[0] || null;
  const nextChapter = nextVideo ? sortedChapters.find((c) => c.id === nextVideo.chapter_id) || null : null;

  // 進度：分母＝已開放（可播）的單元數；學員在還沒開放的內容上不該被扣分
  const opened = playable.length;
  const watched = playable.filter(isDone).length;
  const pct = opened ? Math.round((watched / opened) * 100) : 0;
  // 最近 7 天看完的課（與圓環同一個口徑：completed）
  const weekCount = [...prog.values()].filter((p) => p.completed && p.watched_at && nowMs - Date.parse(p.watched_at) < 7 * DAY && nowMs - Date.parse(p.watched_at) >= 0).length;

  // 章節卡
  let chapterIdx = 0;
  const chapterCards = sortedChapters.map((c) => {
    const vs = byChapter.get(c.id) || [];
    const t = splitChapterTitle(c.title, chapterIdx);
    if (!t.isAppendix) chapterIdx++;
    const units = vs.length, done = vs.filter(isDone).length, open = vs.filter((v) => v.playable).length;
    const isNow = !!nextChapter && nextChapter.id === c.id;
    // 「新上架」以學員實際看得到的日期算：非早鳥用批次日（Ch1～3 9/30、其餘 10/31），早鳥用章節時程表
    const releaseDate = earlyAccess === false ? (Number.isFinite(t.num) && t.num <= 3 ? "2026-09-30" : "2026-10-31") : (CHAPTER_RELEASE_DATES[t.num] || null);
    const releasedDaysAgo = releaseDate ? twDayIndex(nowMs) - twDayIndex(twDateMs(releaseDate)) : null;
    let state, note;
    if (!open) { state = "locked"; note = lockedNote(chapterOpenDate(t.num, earlyAccess, nowMs), nowMs); }
    else if (units && done >= units) { state = "done"; note = "已看完"; }
    else if (done > 0) { state = "progress"; note = `已看 ${done} / ${units} 單元`; }
    else { state = "ready"; note = `${units} 單元`; } // 還沒開始看（含「接著看」落在這章的情況）
    const isNew = state !== "locked" && done === 0 && releasedDaysAgo !== null && releasedDaysAgo >= 0 && releasedDaysAgo <= 14;
    const target = vs.find((v) => v.playable && !isDone(v)) || vs.find((v) => v.playable) || null;
    const first = vs.find((v) => v.playable) || null;
    const card = {
      id: c.id, num: t.num, label: t.label, main: t.main, sub: t.sub, isAppendix: t.isAppendix,
      units, done, open, pct: units ? Math.round((done / units) * 100) : 0, state, note, isNow, isNew,
      newLabel: isNew ? `${relativeDayLabel(twDateMs(releaseDate), nowMs)}上架` : "",
      href: target ? `/classroom/watch?v=${target.id}` : "/classroom/watch",
      overviewHref: first ? `/classroom/watch?v=${first.id}` : "/classroom/watch", // 「從頭看這章」：這章第一支可播
    };
    card.name = chapterName(card);
    return card;
  });

  // 本章單元（接著看的那一章）
  const currentChapter = nextChapter ? chapterCards.find((c) => c.id === nextChapter.id) || null : null;
  const lessons = nextChapter ? (byChapter.get(nextChapter.id) || []).map((v) => {
    const u = splitUnitTitle(v.title);
    const state = !v.playable ? "locked" : isDone(v) ? "done" : v.id === nextVideo?.id ? "next" : "todo";
    return { id: v.id, no: u.no, name: u.name, duration: durationShort(v.duration), state, href: `/classroom/watch?v=${v.id}` };
  }) : [];

  // 練功房：接著看那一章的規劃遊戲（沒有就往後找第一章有規劃的）
  const gameChapter = [currentChapter, ...chapterCards].find((c) => c && PLANNED_CHAPTER_GAMES[c.num]) || null;
  const games = gameChapter ? PLANNED_CHAPTER_GAMES[gameChapter.num].map((g) => {
    const afterUnit = (byChapter.get(gameChapter.id) || []).find((v) => unitNo(v.title) === g.after) || null;
    // openedGames 可以是標題字串或 { id, title }；給了 id 就能在儀表板直接開遊戲，不用先進播放頁
    const hit = Array.isArray(openedGames) ? openedGames.find((t) => String(t?.title ?? t).includes(g.name)) : null;
    const opened = Array.isArray(openedGames) ? !!hit : null;
    return { name: g.name, after: g.after, chapterLabel: gameChapter.name, opened, game: hit?.id ? hit : null, href: afterUnit ? `/classroom/watch?v=${afterUnit.id}` : "/classroom/watch" };
  }) : [];

  const heroUnit = nextVideo ? splitUnitTitle(nextVideo.title) : null;
  const heroProg = nextVideo ? prog.get(nextVideo.id) : null;
  const heroTotal = nextVideo ? (parseDurationSeconds(nextVideo.duration) || Number(heroProg?.total_seconds) || 0) : 0;
  const heroAt = Math.max(0, Math.min(Number(heroProg?.watched_seconds) || 0, heroTotal));
  const hero = nextVideo ? {
    video: nextVideo, ...heroUnit,
    resumeAt: heroAt, resumeLabel: mmss(heroAt), resumePct: heroTotal ? Math.round((heroAt / heroTotal) * 100) : 0,
    chapterLabel: currentChapter ? currentChapter.name : "",
    chapterNew: !!currentChapter?.isNew, chapterNewLabel: currentChapter?.newLabel || "",
    duration: durationLabel(nextVideo.duration), durationShort: durationShort(nextVideo.duration),
    positionInChapter: lessons.findIndex((l) => l.id === nextVideo.id) + 1,
  } : null;

  return {
    nextVideo, hero, lastWatched, opened, watched, pct, weekCount,
    chapters: chapterCards, currentChapter, lessons, games,
    nextOpen: nextRelease({ early: earlyAccess, nowMs, chapters: sortedChapters, playableByChapter }),
    firstChapter: chapterCards.find((c) => c.num === 1) || null,
  };
}

// 問候下方那一句
export function greetingLine(model, earlyAccess) {
  if (!model.nextVideo) {
    if (earlyAccess === false) return "第一批章節 9/30 開放，開放後從這裡接著上。";
    return model.chapters.length ? "課程準備中，第一堂課很快和你見面。" : "課程即將上線，第一堂課很快和你見面。";
  }
  const h = model.hero;
  if (h.resumeAt > 0) return `${h.ref} 看到一半，從上次停的地方接下去。`;
  if (h.chapterNew && h.positionInChapter === 1) return `${joinCn(h.chapterLabel, h.chapterNewLabel)}了，從 ${h.ref} 接下去就好。`;
  if (model.lastWatched && model.lastWatched.video.id !== model.nextVideo.id) return `上次看到 ${model.lastWatched.ref}，接著看 ${h.ref} 吧。`;
  if (model.watched === 0) return `從 ${h.ref} 開始，我們慢慢來。`;
  return `接著看 ${h.ref}，我們繼續吧。`;
}
