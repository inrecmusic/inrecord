// lib/score/mxl.js — 讀取上傳的樂譜檔：.musicxml／.xml 直接解碼；.mxl（zip）依 META-INF/container.xml 取主 XML
// 後台在瀏覽器端呼叫（選檔後立刻驗證），也可在伺服器端用；純函式、可測。

import { unzipSync, strFromU8 } from "fflate";
import { DOMParser } from "@xmldom/xmldom";
import { ScoreError } from "./musicxml.js";

const isScoreXml = (path) => /\.(musicxml|xml)$/i.test(path) && !/^META-INF\//i.test(path);

function rootfilePath(files) {
  const container = files["META-INF/container.xml"];
  if (!container) return null;
  try {
    const doc = new DOMParser({ onError: () => {} }).parseFromString(strFromU8(container), "text/xml");
    const rf = doc.getElementsByTagName("rootfile")[0];
    return rf?.getAttribute("full-path") || null;
  } catch {
    return null;
  }
}

export function extractMxl(bytes) {
  let files;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new ScoreError("not_musicxml", "這個 .mxl 檔打不開（不是有效的壓縮檔）");
  }
  const path = rootfilePath(files);
  const main = path && files[path] ? path : Object.keys(files).find(isScoreXml);
  if (!main) throw new ScoreError("not_musicxml", "這個 .mxl 檔裡找不到 MusicXML 樂譜");
  return strFromU8(files[main]);
}

export function readScoreFile(name, bytes) {
  const lower = String(name || "").toLowerCase();
  if (lower.endsWith(".mxl")) return extractMxl(bytes);
  if (lower.endsWith(".musicxml") || lower.endsWith(".xml")) return new TextDecoder("utf-8").decode(bytes);
  throw new ScoreError("not_musicxml", "只收 .musicxml 或 .mxl 檔");
}
