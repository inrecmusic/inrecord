// components/classroom/score/score-css.js — 互動樂譜 v2 樣式（照原型的 Apple 風格主題，全部限定在 .score-v2 底下）
// 控制列、鍵盤、提示框跟著系統深淺色；譜紙區維持白底黑字（樂譜跟紙本一樣白底較好讀）。
export const SCORE_V2_CSS = `
.score-v2{
  --bg:#F5F5F7; --paper:#FFFFFF; --ink:#1D1D1F; --muted:#6E6E73; --staff:#3A3A3C; --rule:#E5E5EA; --fill:#EFEFF4;
  --accent:#007AFF; --accent-soft:rgba(0,122,255,.12); --on-accent:#FFFFFF;
  --rh:#5856D6; --lh:#FF9500; --now:#007AFF; --cursor:#FFCC00;
  --key-w:#FFFFFF; --key-w-edge:#D1D1D6; --key-b:#1D1D1F; --key-label:#8E8E93;
  --shadow:0 1px 2px rgba(0,0,0,.04),0 6px 20px rgba(0,0,0,.05);
  --sans:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang TC","Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif;
  color:var(--ink);font-family:var(--sans);font-size:14px;line-height:1.5;display:grid;gap:14px;
  -webkit-font-smoothing:antialiased;letter-spacing:.01em
}
@media (prefers-color-scheme: dark){
  .score-v2{
    --bg:#000000; --paper:#1C1C1E; --ink:#F5F5F7; --muted:#98989D; --rule:#38383A; --fill:#2C2C2E;
    --accent:#0A84FF; --accent-soft:rgba(10,132,255,.2); --on-accent:#FFFFFF;
    --rh:#7D7AFF; --lh:#FF9F0A; --cursor:#FFD60A;
    --key-w:#E5E5EA; --key-w-edge:#8E8E93; --key-b:#000000; --key-label:#636366;
    --shadow:0 0 0 1px rgba(255,255,255,.06)
  }
}
.score-v2 *{box-sizing:border-box}
.score-v2 button,.score-v2 select,.score-v2 input{font:inherit;color:inherit}
.score-v2 button{cursor:pointer}
.score-v2 :focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.score-v2 .ic{width:17px;height:17px;flex:none;display:block}

/* 控制列 */
.score-v2 .sv2-controls{display:flex;flex-wrap:wrap;gap:12px 20px;align-items:flex-start;padding:14px 16px;background:var(--paper);border-radius:18px;box-shadow:var(--shadow)}
.score-v2 .group{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;min-width:0}
.score-v2 .glabel{font-size:11px;font-weight:600;letter-spacing:.04em;color:var(--muted);margin-right:2px}
.score-v2 .seg{display:inline-flex;background:var(--fill);border-radius:10px;padding:2px;gap:2px}
.score-v2 .seg button{display:inline-flex;align-items:center;gap:6px;border:0;background:transparent;border-radius:8px;padding:5px 11px;font-size:13px;font-weight:500;color:var(--ink);white-space:nowrap;transition:background .15s}
.score-v2 .seg button[aria-pressed="true"]{background:var(--paper);color:var(--accent);box-shadow:0 1px 3px rgba(0,0,0,.12),0 0 0 .5px rgba(0,0,0,.04)}
.score-v2 .tog,.score-v2 .btn{display:inline-flex;align-items:center;gap:6px;border:0;background:var(--fill);border-radius:999px;padding:6px 13px;font-size:13px;font-weight:500;color:var(--ink);white-space:nowrap;transition:background .15s,color .15s}
.score-v2 .tog[aria-pressed="true"]{background:var(--accent-soft);color:var(--accent)}
.score-v2 .tog.rh[aria-pressed="true"]{color:var(--rh)}
.score-v2 .tog.lh[aria-pressed="true"]{color:var(--lh)}
.score-v2 .play{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:0;border-radius:999px;padding:7px 18px;font-weight:600;font-size:14px;min-width:96px;background:var(--accent);color:var(--on-accent)}
.score-v2 .play .ic{width:14px;height:14px}
.score-v2 .tempo{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-variant-numeric:tabular-nums}
.score-v2 .tempo .ic{color:var(--muted)}
.score-v2 .tempo input{width:110px;accent-color:var(--accent)}
.score-v2 select{border:0;background:var(--fill);border-radius:8px;padding:5px 8px;font-size:13px}

/* 譜紙 */
.score-v2 .sv2-paper{background:#fff;color:#1D1D1F;border-radius:18px;box-shadow:var(--shadow);padding:22px 18px 10px;min-width:0}
.score-v2 .sv2-head{display:grid;grid-template-columns:1fr auto 1fr;align-items:end;gap:12px;padding:0 6px;margin-bottom:2px}
.score-v2 .sv2-head h2{font-size:26px;font-weight:600;letter-spacing:.06em;text-align:center;margin:0;grid-column:2}
.score-v2 .sh-left{grid-column:1;font-size:14px;line-height:1.45;font-variant-numeric:tabular-nums}
.score-v2 .sh-left .keysig{font-weight:600}
.score-v2 .sh-left .bpm{color:#6E6E73;font-size:13px}
.score-v2 .sh-right{grid-column:3;text-align:right;font-size:12px;color:#6E6E73;align-self:end}
.score-v2 .sv2-msg{text-align:center;font-size:12px;color:#0060DF;min-height:18px;margin:4px 0 2px}
.score-v2 .sv2-msg.err{color:#C4291F}
.score-v2 .sv2-section+.sv2-section{margin-top:14px}
.score-v2 .sv2-staff{min-height:60px}
.score-v2 .sv2-staff svg{display:block;max-width:100%;height:auto}
.score-v2 .sv2-staff g.is-now path,.score-v2 .sv2-staff g.is-now rect{fill:var(--rh);stroke:var(--rh)}
.score-v2 .sv2-staff g.is-now.lh path,.score-v2 .sv2-staff g.is-now.lh rect{fill:var(--lh);stroke:var(--lh)}
.score-v2 .sv2-status{font-size:13px;color:#6E6E73;padding:12px 4px}
.score-v2 .sv2-status.sv2-err{color:#C4291F}
.score-v2 .sv2-jianpu svg{display:block;max-width:100%;user-select:none;-webkit-user-select:none}
.score-v2 .sv2-jianpu .jp-note,.score-v2 .sv2-jianpu .jp-chord{cursor:pointer}
.score-v2 .sv2-jianpu .jp-chord text{fill:#007AFF}
.score-v2 .sv2-jianpu .jp-note.is-now text,.score-v2 .sv2-jianpu .jp-note.is-now circle{fill:var(--rh)}
.score-v2 .sv2-jianpu .jp-note.is-now.lh text,.score-v2 .sv2-jianpu .jp-note.is-now.lh circle{fill:var(--lh)}
.score-v2 .sv2-credit{font-size:11px;color:#8E8E93;text-align:right;margin:8px 4px 0}

/* 鍵盤＋和弦辨識 */
.score-v2 .sv2-kbdzone{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:12px;align-items:stretch}
.score-v2 .sv2-kbd-wrap{overflow-x:auto;background:var(--paper);border-radius:18px;box-shadow:var(--shadow);padding:12px}
.score-v2 .sv2-kbd{position:relative;height:130px;min-width:680px;touch-action:none;user-select:none;-webkit-user-select:none}
.score-v2 .sv2-key{position:absolute;top:0}
.score-v2 .sv2-key.w{height:100%;background:var(--key-w);border:1px solid var(--key-w-edge);border-radius:0 0 5px 5px;z-index:1}
.score-v2 .sv2-key.b{height:62%;background:var(--key-b);border-radius:0 0 4px 4px;z-index:2}
.score-v2 .sv2-key .lab{position:absolute;bottom:5px;left:0;right:0;text-align:center;font-size:10px;color:var(--key-label)}
.score-v2 .sv2-key.is-now{background:var(--rh)}
.score-v2 .sv2-key.is-now.lh{background:var(--lh)}
.score-v2 .sv2-key.press{background:var(--accent)!important}
.score-v2 .sv2-detect{background:var(--paper);border-radius:18px;box-shadow:var(--shadow);padding:14px 16px;display:grid;gap:6px;align-content:start}
.score-v2 .sv2-detect .lbl{font-size:11px;font-weight:600;letter-spacing:.04em;color:var(--muted)}
.score-v2 .sv2-detect .pk-big{font-size:30px;line-height:1.1;font-weight:700;min-height:34px}
.score-v2 .sv2-detect .sub{font-size:13px}
.score-v2 .sv2-detect .tones{font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums}
.score-v2 .sv2-detect .row{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}
.score-v2 .sv2-detect .row .tog,.score-v2 .sv2-detect .row .btn{font-size:12px;padding:5px 11px}

/* 游標、A-B 循環底色、小節號、列名（原型 .cursor／.loopband／.barno／.rowlab） */
.score-v2 .sv2-layer{position:relative}
.score-v2 .sv2-under{position:absolute;inset:0;pointer-events:none;overflow:visible}
.score-v2 .sv2-layer>.sv2-jianpu,.score-v2 .sv2-layer>.sv2-staff{position:relative}
.score-v2 .sv2-cur{fill:var(--cursor);background:var(--cursor);opacity:.38;border-radius:4px}
.score-v2 .sv2-band{fill:#007AFF;background:#007AFF;opacity:.06}
.score-v2 div.sv2-cur,.score-v2 div.sv2-band{position:absolute}
.score-v2 .sv2-over{position:absolute;inset:0;pointer-events:none}
.score-v2 .sv2-barno{position:absolute;pointer-events:auto;border:0;background:none;padding:0 2px;font-size:10px;line-height:1;color:#6E6E73;cursor:pointer}
.score-v2 .sv2-barno:hover,.score-v2 .sv2-jianpu .jp-barno:hover{color:#007AFF;fill:#007AFF}
.score-v2 .sv2-jianpu .jp-barno{cursor:pointer}
.score-v2 .sv2-chordhit{position:absolute;pointer-events:auto;cursor:pointer}
.score-v2 .sv2-staff .vf-stavenote{cursor:pointer}
.score-v2 .sv2-key.hov{box-shadow:inset 0 0 0 2px var(--accent)}
.score-v2 .sv2-tip .pair{display:flex;align-items:center;gap:10px;color:#1D1D1F;background:#fff;border-radius:8px;padding:2px 4px}
.score-v2 .sv2-tip .lbls{display:flex;gap:10px;font-size:10px;color:var(--muted)}
.score-v2 .sv2-tip .lbls span:last-child{margin-left:auto}

/* 提示框 */
.score-v2 .sv2-tip{position:fixed;z-index:60;pointer-events:none;background:var(--paper);color:var(--ink);border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.18),0 0 0 .5px rgba(0,0,0,.06);padding:8px 12px 10px;display:grid;gap:4px;min-width:150px;max-width:300px}
.score-v2 .sv2-tip .tn{font-weight:700;font-size:14px}
.score-v2 .sv2-tip .ts{font-size:12px;color:var(--muted)}
.score-v2 .sv2-tip svg{display:block}
.score-v2 .diag .wk{fill:#fff;stroke:#3A3A3C;stroke-width:.7}
.score-v2 .diag .bk{fill:#1D1D1F;stroke:#3A3A3C;stroke-width:.5}
.score-v2 .diag .on{fill:var(--accent)}
.score-v2 .diag .bs{fill:var(--lh)}

@media (max-width:820px){.score-v2 .sv2-kbdzone{grid-template-columns:minmax(0,1fr)}}
@media (max-width:640px){
  .score-v2 .sv2-controls{gap:10px 14px;padding:12px}
  .score-v2 .sv2-paper{padding:16px 8px 8px}
}
@media (max-width:560px){
  .score-v2 .sv2-head{grid-template-columns:1fr 1fr}
  .score-v2 .sv2-head h2{grid-column:1/-1;grid-row:1;font-size:22px}
  .score-v2 .sh-left{grid-row:2}
  .score-v2 .sh-right{grid-row:2;grid-column:2}
}
@media (prefers-reduced-motion: reduce){.score-v2 *{transition:none!important}}
@media print{
  body *{visibility:hidden}
  .score-v2 .sv2-paper,.score-v2 .sv2-paper *{visibility:visible}
  .score-v2 .sv2-paper{position:absolute;inset:0;box-shadow:none;padding:0}
  .score-v2 .sv2-msg,.score-v2 .sv2-credit{display:none}
}
`;
