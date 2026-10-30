// lib/score/chord-edit.js — 後台「改和弦」：上傳的 MusicXML 不動音符、只換和弦（純函式可測）
//
// 文字框寫法同「直接打簡譜」的和弦欄：| 分小節，每小節 1／2／4 個（平均分配拍數），空白＝沿用前一個。
// 只有文字改過的小節才重寫 <harmony>；沒動到的小節保留原檔的和弦（文字框寫不出的型態如 7sus4、
// 不在平均拍位上的和弦都原樣留著）。新和弦插在它落到的右手音符前面，用 <offset> 對到拍位。
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { ScoreError } from "./musicxml.js";
import { parseChordBar, chordToken } from "./jianpu-input.js";

const EPS = 1e-6;
const kids = (el, tag) => {
  const out = [];
  for (let c = el?.firstChild; c; c = c.nextSibling) if (c.nodeType === 1 && (!tag || c.nodeName === tag)) out.push(c);
  return out;
};
const kidText = (el, tag) => kids(el, tag)[0]?.textContent.trim() ?? null;
const ascii = (s) => s.replace(/♯/g, "#").replace(/♭/g, "b");

// 模型 → 每小節一段文字（陣列，index＝小節）
export function chordBars(model) {
  return model.measures.map((m) =>
    model.chords
      .filter((c) => c.measure === m.index)
      .sort((a, b) => a.onset - b.onset)
      .map((c) => (c.kind === "none" ? "N.C." : chordToken(c) || ascii(c.name)))
      .join(" "),
  );
}
export const chordText = (model) => chordBars(model).join(" | ");

const norm = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).join(" ");

function harmonyEl(doc, c, offset) {
  const h = doc.createElement("harmony");
  const add = (parent, tag, text) => {
    const e = doc.createElement(tag);
    if (text !== undefined) e.appendChild(doc.createTextNode(String(text)));
    parent.appendChild(e);
    return e;
  };
  const root = add(h, "root");
  add(root, "root-step", c.step);
  if (c.alter) add(root, "root-alter", c.alter);
  const kind = add(h, "kind", c.kind);
  if (c.kind === "none") kind.setAttribute("text", "N.C.");
  if (c.bass) {
    const b = add(h, "bass");
    add(b, "bass-step", c.bass.step);
    if (c.bass.alter) add(b, "bass-alter", c.bass.alter);
  }
  if (offset) add(h, "offset", offset);
  add(h, "staff", 1);
  return h;
}

// 回傳新的 MusicXML 文字；文字和原本一樣就原樣回傳。寫錯丟 ScoreError（訊息指出第幾小節）。
export function applyChordText(xmlText, model, text) {
  const before = chordBars(model);
  const bars = String(text || "").split("|");
  if (bars.length > before.length) throw new ScoreError("bad_jianpu", `和弦有 ${bars.length} 小節，比樂譜的 ${before.length} 小節多`);
  const changed = before.map((b, i) => norm(bars[i]) !== norm(b));
  if (!changed.some(Boolean)) return xmlText;
  const parsed = before.map((_, i) => (changed[i] ? parseChordBar(bars[i], i) : null));

  const doc = new DOMParser({ onError: () => {} }).parseFromString(xmlText, "text/xml");
  const part = kids(doc.documentElement, "part")[0];
  if (!part) return xmlText;
  let divisions = 1;
  kids(part, "measure").forEach((mEl, mi) => {
    // divisions 要照順序讀，不論這小節有沒有改
    for (const a of kids(mEl, "attributes")) if (kidText(a, "divisions")) divisions = Number(kidText(a, "divisions"));
    if (!parsed[mi]) return;
    for (const h of kids(mEl, "harmony")) mEl.removeChild(h);
    const cs = parsed[mi];
    if (!cs.length) return;
    const len = model.measures[mi]?.length ?? 0;

    // 右手音符的起點（同一行第一個聲部的游標）
    const slots = [];
    let cursor = 0;
    for (const e of kids(mEl)) {
      const dur = Number(kidText(e, "duration") || 0) / divisions;
      if (e.nodeName === "backup") cursor = Math.max(0, cursor - dur);
      else if (e.nodeName === "forward") cursor += dur;
      else if (e.nodeName === "note") {
        if (kids(e, "grace").length || kids(e, "chord").length) continue;
        if ((kidText(e, "staff") || "1") === "1") slots.push({ el: e, onset: cursor, dur });
        cursor += dur;
      }
    }
    const firstMusic = kids(mEl).find((e) => ["note", "backup", "forward", "direction"].includes(e.nodeName)) || null;
    cs.forEach((c, i) => {
      const at = (len * i) / cs.length;
      const slot = slots.find((s) => s.onset <= at + EPS && at < s.onset + s.dur - EPS);
      const ref = slot ? slot.el : firstMusic;
      const offset = Math.round((at - (slot ? slot.onset : 0)) * divisions);
      mEl.insertBefore(harmonyEl(doc, c, offset), ref);
    });
  });
  return new XMLSerializer().serializeToString(doc);
}
