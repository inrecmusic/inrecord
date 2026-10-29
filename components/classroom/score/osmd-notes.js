// components/classroom/score/osmd-notes.js — 從 OSMD 畫好的 GraphicSheet 收集每個音符的 (小節, staff, onset, midi, SVG 元素)
// 交給 lib/score/staff-xml.js 的 matchStaffNotes 對回模型 id。純函式（只讀物件屬性），可用假物件測試。
//
// OSMD 的 Note.halfTone 以 C4＝48 計（比 MIDI 少一個八度）。2026-10-29 在瀏覽器用小蜜蜂第一個音校正：
// G4 → halfTone 55 → MIDI 67，所以加 12。
export const OSMD_HALFTONE_TO_MIDI = 12;

export function collectOsmdNotes(graphic) {
  const out = [];
  const list = graphic?.MeasureList || [];
  list.forEach((staves, measure) => {
    (staves || []).forEach((gm, s) => {
      if (!gm) return;
      for (const se of gm.staffEntries || []) {
        const onset = (se.relInMeasureTimestamp?.RealValue ?? 0) * 4;
        for (const gve of se.graphicalVoiceEntries || []) {
          if (gve.parentVoiceEntry?.IsGrace) continue;
          for (const gn of gve.notes || []) {
            const sn = gn.sourceNote;
            if (!sn || sn.IsGraceNote) continue;
            const rest = typeof sn.isRest === "function" ? sn.isRest() : false;
            out.push({
              measure,
              staff: s + 1,
              onset,
              midi: rest ? null : sn.halfTone + OSMD_HALFTONE_TO_MIDI,
              el: typeof gn.getSVGGElement === "function" ? gn.getSVGGElement() : null,
            });
          }
        }
      }
    });
  });
  return out;
}
