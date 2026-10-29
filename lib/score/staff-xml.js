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

function chordLabel(chord, key, mode) {
  if (mode === "roman") return romanOf(chord, key);
  if (mode === "both") return `${chord.name} (${romanOf(chord, key)})`;
  return chord.name;
}

export function prepareStaffXml(xmlText, model, { rightHandOnly = false, chordMode = "name", showChords = true } = {}) {
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
      } else if (rightHandOnly) {
        if ((tag === "note" || tag === "forward" || tag === "direction" || tag === "harmony") && staffOf(el) === "2") mEl.removeChild(el);
        else if (tag === "attributes") {
          for (const a of kids(el)) {
            if (a.getAttribute("number") === "2") el.removeChild(a);
            else if (a.nodeName === "staves") a.textContent = "1";
          }
        }
      }
    }
    if (rightHandOnly) {
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
export function matchStaffNotes(model, rendered) {
  const keyOf = (measure, staff, onset, midi) => `${measure}|${staff}|${Math.round(onset * 96)}|${midi ?? "r"}`;
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
    const id = list[Math.min(i, list.length - 1)];
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(r.el);
  }
  map.unmatched = unmatched;
  return map;
}
