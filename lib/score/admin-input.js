// lib/score/admin-input.js — 後台曲目 API 的輸入正規化與驗證（純函式可測）
// 白名單：title, subtitle, difficulty, musicxml, file_name, published, sort_order；unitIds 另外回傳。
// musicxml 有給就跑 parseMusicXml：成功時附上 meta 摘要，失敗把 ScoreError.code 放進 errors。

import { parseMusicXml, ScoreError } from "./musicxml.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const trimTo = (v, max) => String(v ?? "").trim().slice(0, max);

export function scoreMeta(model) {
  const firstFull = model.measures.find((m) => !m.implicit) || model.measures[0];
  return {
    title: model.title || null,
    tempo: model.tempo,
    key: model.measures[0]?.key || null,
    time: firstFull?.time || null,
    measureCount: model.measures.length,
    hasChords: model.hasChords,
    hasLeftHand: model.hasLeftHand,
    warnings: model.warnings,
  };
}

export function normalizeScoreInput(body, { partial = false } = {}) {
  const b = body && typeof body === "object" ? body : {};
  const fields = {};
  const errors = [];

  if (has(b, "title") || !partial) {
    const title = trimTo(b.title, 200);
    if (!title) errors.push("missing_title");
    else fields.title = title;
  }
  if (has(b, "subtitle")) fields.subtitle = trimTo(b.subtitle, 200) || null;
  if (has(b, "difficulty")) {
    const d = b.difficulty;
    if (d === null || d === "") fields.difficulty = null;
    else if ([1, 2, 3].includes(Number(d)) && Number.isInteger(Number(d))) fields.difficulty = Number(d);
    else errors.push("bad_difficulty");
  }
  if (has(b, "musicxml") || !partial) {
    if (typeof b.musicxml !== "string" || !b.musicxml.trim()) errors.push("missing_musicxml");
    else {
      try {
        fields.meta = scoreMeta(parseMusicXml(b.musicxml));
        fields.musicxml = b.musicxml;
      } catch (e) {
        errors.push(e instanceof ScoreError ? e.code : "not_musicxml");
      }
    }
  }
  if (has(b, "file_name")) fields.file_name = trimTo(b.file_name, 200) || null;
  if (has(b, "published")) {
    if (typeof b.published === "boolean") fields.published = b.published;
    else errors.push("bad_published");
  }
  if (has(b, "sort_order")) {
    const n = Number(b.sort_order);
    if (Number.isInteger(n)) fields.sort_order = n;
    else errors.push("bad_sort_order");
  }

  let unitIds;
  if (has(b, "unitIds")) {
    if (Array.isArray(b.unitIds) && b.unitIds.every((x) => typeof x === "string" && UUID.test(x))) unitIds = [...new Set(b.unitIds)];
    else errors.push("bad_unit_ids");
  }
  return { fields, unitIds, errors };
}
