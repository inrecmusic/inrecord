// lib/score/staff-xml.js — 給 OSMD 畫五線譜前的 XML 前處理，以及 OSMD 音符 ↔ 模型 id 的對照（純函式可測）
//
// 和弦標示一律由這裡改寫成 staff 1 上方的 <words> 文字（和弦名／級數／「G7 (V7)」），三種模式走同一條路，
// 不依賴 OSMD 自己畫和弦記號。「只看右手」時把左手（staff 2）的音符、記號、譜號刪掉，改成一行譜。
// 多 part 的檔只留第一個 part（與模型一致）。

import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { romanOf } from "./chords.js";

const kids = (el, tag) => {
  const out = [];
  for (let c = el?.firstChild; c; c = c.nextSibling) if (c.nodeType === 1 && (!tag || c.nodeName === tag)) out.push(c);
  return out;
};
const kidText = (el, tag) => kids(el, tag)[0]?.textContent.trim() ?? null;
const staffOf = (el) => kidText(el, "staff");

// ── 自動補連桿 ──
// 打譜軟體匯出的檔通常已寫好 <beam>，那就照原檔（以「行」為單位：右手寫了就右手照原檔）；沒寫的（例如手寫或某些軟體匯出的檔）由這裡依樂理補上：
// 單拍子每拍一組（4/4 兩個八分連一組）、複拍子（6/8、9/8、12/8、3/8）每附點四分一組、2/2 每二分一組；
// 弱起小節照它在整小節裡的實際拍位分組。休止符、四分以上的音、組外的音都會打斷連桿。
// （OSMD 內建的 autoBeam 把拍號分母當「一拍」，6/8 的八分音符永遠連不起來，所以不用它。）
const BEAM_LEVELS = { eighth: 1, "16th": 2, "32nd": 3, "64th": 4 };
function beamUnit(time) {
  if (time.beatType === 8 && time.beats % 3 === 0) return 1.5;
  if (time.beatType === 2) return 2;
  return 1;
}
function makeBeam(doc, number, value) {
  const b = doc.createElement("beam");
  b.setAttribute("number", String(number));
  b.appendChild(doc.createTextNode(value));
  return b;
}
function insertBeam(doc, noteEl, beamEl) {
  // MusicXML 順序：… <staff> <beam> <notations> <lyric> …
  const after = kids(noteEl).find((c) => c.nodeName === "notations" || c.nodeName === "lyric" || c.nodeName === "play");
  if (after) noteEl.insertBefore(beamEl, after);
  else noteEl.appendChild(beamEl);
}
function addBeams(doc, part, model) {
  // 原檔寫過連桿的那一行（staff）整行照原檔，其餘補上（例如自動產生的左手）
  const beamedStaves = new Set();
  const all = part.getElementsByTagName("beam");
  for (let i = 0; i < all.length; i++) beamedStaves.add(staffOf(all[i].parentNode) || "1");
  let divisions = 1;
  kids(part, "measure").forEach((mEl, mi) => {
    const m = model.measures[mi];
    if (!m) return;
    const unit = beamUnit(m.time);
    const nominal = (m.time.beats * 4) / m.time.beatType;
    const offset = m.implicit ? Math.max(0, nominal - m.length) : 0;
    const lanes = new Map(); // staff|voice → [{ el, onset, dur, level }]
    let cursor = 0;
    for (const el of kids(mEl)) {
      const tag = el.nodeName;
      if (tag === "attributes") {
        const d = Number(kidText(el, "divisions"));
        if (d) divisions = d;
      } else if (tag === "backup") cursor = Math.max(0, cursor - Number(kidText(el, "duration") || 0) / divisions);
      else if (tag === "forward") cursor += Number(kidText(el, "duration") || 0) / divisions;
      else if (tag === "note") {
        if (kids(el, "grace").length || kids(el, "cue").length) continue;
        if (kids(el, "chord").length) continue; // 和弦音跟著主音，不另外標
        const dur = Number(kidText(el, "duration") || 0) / divisions;
        const key = `${staffOf(el) || "1"}|${kidText(el, "voice") || "1"}`;
        if (!lanes.has(key)) lanes.set(key, []);
        lanes.get(key).push({
          el,
          onset: cursor,
          dur,
          level: kids(el, "rest").length ? 0 : BEAM_LEVELS[kidText(el, "type")] || 0,
        });
        cursor += dur;
      }
    }
    for (const notes of lanes.values()) {
      if (beamedStaves.has(staffOf(notes[0].el) || "1")) continue;
      const group = (n) => Math.floor((n.onset + offset) / unit + 1e-6);
      const runs = [];
      let run = [];
      notes.forEach((n, i) => {
        const prev = notes[i - 1];
        const joins = run.length && n.level && group(n) === group(run[0]) && prev && Math.abs(prev.onset + prev.dur - n.onset) < 1e-6;
        if (!joins) {
          if (run.length >= 2) runs.push(run);
          run = n.level ? [n] : [];
        } else run.push(n);
      });
      if (run.length >= 2) runs.push(run);
      for (const r of runs) {
        r.forEach((n, i) => {
          insertBeam(doc, n.el, makeBeam(doc, 1, i === 0 ? "begin" : i === r.length - 1 ? "end" : "continue"));
          for (let lv = 2; lv <= n.level; lv++) {
            const prevHas = i > 0 && r[i - 1].level >= lv;
            const nextHas = i < r.length - 1 && r[i + 1].level >= lv;
            const value = prevHas && nextHas ? "continue" : prevHas ? "end" : nextHas ? "begin" : i === 0 ? "forward hook" : "backward hook";
            insertBeam(doc, n.el, makeBeam(doc, lv, value));
          }
        });
      }
    }
  });
}

function chordLabel(chord, key, mode) {
  if (chord.kind === "none") return "N.C.";
  if (mode === "roman") return romanOf(chord, key);
  if (mode === "both") return `${chord.name} ${romanOf(chord, key)}`; // 原型寫法「G7 V7」
  return chord.name;
}

// 節奏斜線（照原型）：只看右手時，左手那一行不刪，改畫成單線譜上的斜線符頭——位置與時值照左手（原譜或自動伴奏），
// 學員看得到伴奏節奏但不看音高。和弦音只留一個；打擊樂譜號下用 <unpitched> B4，OSMD 才會畫在單線上
// （寫 <pitch> 會照音高畫到譜外）。
function toSlashNote(doc, el) {
  for (const c of kids(el)) if (["pitch", "accidental", "stem", "notehead", "lyric"].includes(c.nodeName)) el.removeChild(c);
  const pitch = doc.createElement("unpitched");
  for (const [tag, text] of [["display-step", "B"], ["display-octave", "4"]]) {
    const t = doc.createElement(tag);
    t.appendChild(doc.createTextNode(text));
    pitch.appendChild(t);
  }
  el.insertBefore(pitch, kids(el).find((c) => c.nodeName === "duration") || null);
  const stem = doc.createElement("stem");
  stem.appendChild(doc.createTextNode("up"));
  const head = doc.createElement("notehead");
  head.appendChild(doc.createTextNode("slash"));
  const staff = kids(el, "staff")[0];
  el.insertBefore(stem, staff || null);
  el.insertBefore(head, staff || null);
}
function toSlashAttributes(doc, el) {
  for (const a of kids(el)) {
    if (a.nodeName === "clef" && a.getAttribute("number") === "2") {
      for (const c of kids(a)) a.removeChild(c);
      for (const [tag, text] of [["sign", "percussion"]]) {
        const t = doc.createElement(tag);
        t.appendChild(doc.createTextNode(text));
        a.appendChild(t);
      }
      a.setAttribute("print-object", "no");
    }
    if (a.nodeName === "staff-details" && a.getAttribute("number") === "2") el.removeChild(a);
  }
  if (kids(el, "clef").some((c) => c.getAttribute("number") === "2")) {
    const sd = doc.createElement("staff-details");
    sd.setAttribute("number", "2");
    const lines = doc.createElement("staff-lines");
    lines.appendChild(doc.createTextNode("1"));
    sd.appendChild(lines);
    // OSMD 每個 <attributes> 只讀第一個 staff-details，所以放在右手那個前面
    const after = kids(el).find((x) => ["staff-details", "transpose", "directive", "measure-style"].includes(x.nodeName));
    el.insertBefore(sd, after || null);
  }
}

export function prepareStaffXml(xmlText, model, { rightHandOnly = false, chordMode = "name", showChords = true, slashes = false } = {}) {
  const doc = new DOMParser({ onError: () => {} }).parseFromString(xmlText, "text/xml");
  const root = doc.documentElement;

  // 只留第一個 part
  const parts = kids(root, "part");
  for (const p of parts.slice(1)) root.removeChild(p);
  const partList = kids(root, "part-list")[0];
  if (partList && parts[0]) {
    const keep = parts[0].getAttribute("id");
    for (const sp of kids(partList, "score-part")) if (sp.getAttribute("id") !== keep) partList.removeChild(sp);
  }
  const part = parts[0];
  if (!part) return new XMLSerializer().serializeToString(doc);
  addBeams(doc, part, model);
  const slashMode = rightHandOnly && slashes && model.notes.some((n) => n.staff === 2 && !n.rest);
  const dropLeft = rightHandOnly && !slashMode;

  let chordIdx = 0;
  kids(part, "measure").forEach((mEl, mi) => {
    const key = model.measures[mi]?.key;
    for (const el of kids(mEl)) {
      const tag = el.nodeName;
      if (tag === "harmony") {
        const hasRoot = !!kids(kids(el, "root")[0], "root-step")[0];
        const chord = hasRoot ? model.chords[chordIdx++] : null;
        if (!chord || !showChords) {
          mEl.removeChild(el);
          continue;
        }
        const dir = doc.createElement("direction");
        dir.setAttribute("placement", "above");
        const dt = doc.createElement("direction-type");
        const words = doc.createElement("words");
        words.appendChild(doc.createTextNode(chordLabel(chord, key, chordMode)));
        dt.appendChild(words);
        dir.appendChild(dt);
        const offset = kids(el, "offset")[0];
        if (offset) {
          const o = doc.createElement("offset");
          o.appendChild(doc.createTextNode(offset.textContent.trim()));
          dir.appendChild(o);
        }
        const st = doc.createElement("staff");
        st.appendChild(doc.createTextNode("1"));
        dir.appendChild(st);
        mEl.replaceChild(dir, el);
      } else if (slashMode) {
        if (staffOf(el) !== "2") {
          if (tag === "attributes") toSlashAttributes(doc, el);
        } else if (tag === "direction" || (tag === "note" && kids(el, "chord").length)) mEl.removeChild(el);
        else if (tag === "note" && !kids(el, "rest").length && !kids(el, "grace").length) toSlashNote(doc, el);
        else if (tag === "note" && kids(el, "grace").length) mEl.removeChild(el);
      } else if (dropLeft) {
        if ((tag === "note" || tag === "forward" || tag === "direction" || tag === "harmony") && staffOf(el) === "2") mEl.removeChild(el);
        else if (tag === "attributes") {
          for (const a of kids(el)) {
            if (a.getAttribute("number") === "2") el.removeChild(a);
            else if (a.nodeName === "staves") a.textContent = "1";
          }
        }
      }
    }
    if (dropLeft) {
      // 左手刪掉後，小節尾巴留下的 <backup> 沒有意義，一併拿掉
      let last = kids(mEl).pop();
      while (last && last.nodeName === "backup") {
        mEl.removeChild(last);
        last = kids(mEl).pop();
      }
    }
  });
  return new XMLSerializer().serializeToString(doc);
}

// OSMD 畫出的音符 → 模型 id：以 (小節, staff, onset 取到 1/96 拍, midi) 配對；同 key 多個依序分配。
// 回傳 Map<id, Element[]>，配不到的筆數放在 map.unmatched。
// slashes：左手畫成節奏斜線時音高都是 B4，staff 2 改以 (小節, 拍位) 配對，一個斜線對到該拍所有左手音。
export function matchStaffNotes(model, rendered, { slashes = false } = {}) {
  const keyOf = (measure, staff, onset, midi) =>
    `${measure}|${staff}|${Math.round(onset * 96)}|${slashes && staff === 2 ? (midi == null ? "r" : "s") : midi ?? "r"}`;
  const ids = new Map();
  for (const n of model.notes) {
    const k = keyOf(n.measure, n.staff, n.onset, n.midi);
    if (!ids.has(k)) ids.set(k, []);
    ids.get(k).push(n.id);
  }
  const used = new Map();
  const map = new Map();
  let unmatched = 0;
  for (const r of rendered) {
    const k = keyOf(r.measure, r.staff, r.onset, r.midi);
    const list = ids.get(k);
    if (!list) {
      unmatched++;
      continue;
    }
    const i = used.get(k) || 0;
    used.set(k, i + 1);
    for (const id of slashes && r.staff === 2 ? list : [list[Math.min(i, list.length - 1)]]) {
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(r.el);
    }
  }
  map.unmatched = unmatched;
  return map;
}
