// components/classroom/score/osmd-notes.js — 從 OSMD 畫好的 GraphicSheet 收集每個音符的 (小節, staff, onset, midi, SVG 元素)
// 交給 lib/score/staff-xml.js 的 matchStaffNotes 對回模型 id。純函式（只讀物件屬性），可用假物件測試。
//
// OSMD 的 Note.halfTone ＝ Pitch.getHalfTone()，以 OSMD 的八度記法（中央 C 所在八度＝1）計，
// 換成 MIDI 要加 48：小蜜蜂第一個音 G4 → halfTone 19 → MIDI 67（在瀏覽器實測校正）。
export const OSMD_HALFTONE_TO_MIDI = 48;

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
