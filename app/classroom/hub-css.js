// app/classroom/hub-css.js — 學員中心儀表板樣式（音樂廳夜場；深色預設、淺色由 data-theme／系統偏好切換）
//
// 文字排版原則（2026-09-26 定案）：
// - 中文一律 keep-all＋line-break:strict，標題 text-wrap:balance、段落 text-wrap:pretty。
// - 標題／大數字用 --type-display（Cormorant＋Noto Serif TC），字重 600，開 palt 讓中文標點收緊；內文 --type-body 16px、行高 1.65。
// - 字級階層固定：問候 30／海報標題 30／區塊標題 22／卡片標題 17／內文 15–16／輔助 13／標籤 12，手機各降一級。
// - 章節標題拆成主標＋副標兩行（原本一行帶破折號太長）；單元卡標題最多兩行、固定兩行高，卡片才對得齊。
// - 數字全部 tabular-nums；分隔一律用全形「／」與頓號，不用中點。
export const HUB_CSS = `
.hub{
  --bg:#0c0f16; --s1:#141924; --s2:#1a2030; --s3:#222a3b;
  --line:rgba(255,255,255,.09); --line-2:rgba(255,255,255,.16);
  --ink:#f3efe6; --ink-2:#cfc9bb; --ink-3:#9c978a;
  --gold:#e8c583; --gold-2:#f3d9a3; --gold-deep:#b8894a; --gold-ink:#2a1e08; --gold-line:rgba(232,197,131,.55);
  --blue-bg:rgba(122,162,255,.2); --blue-ink:#cbd9ff;
  --chip-bg:rgba(255,255,255,.1); --chip-ink:#d8d3c6;
  --shade-a:rgba(8,10,16,.96); --shade-b:rgba(8,10,16,.55); --shade-c:rgba(8,10,16,.06);
  --glow-a:rgba(232,197,131,.16); --glow-b:rgba(37,99,235,.14);
  --shadow:0 24px 48px -28px rgba(0,0,0,.75), inset 0 1px 0 rgba(255,255,255,.04);
  --key-w:#f4f1ea; --key-b:#05070b; --key-line:#8a8a8a; --keys-op:.9;
  --nav-bg:rgba(12,15,22,.72);
  /* 公告元件（components/Announcements）在 .hub 內吃的變數名 */
  --card:var(--s1); --card-a:var(--s2); --card-b:var(--s1); --ink-soft:var(--ink-2); --ink-faint:var(--ink-3); --line-soft:var(--line); --bg2:var(--s1);
  --cta-bg:var(--gold); --cta-ink:var(--gold-ink);
  --serif:var(--type-display); --sans:var(--type-body);
  min-height:100vh; position:relative; overflow-x:clip; /* clip 不會像 hidden 一樣讓 sticky nav 失效 */
  color:var(--ink); background:
    radial-gradient(1100px 520px at 8% -6%, var(--glow-a), transparent 60%),
    radial-gradient(900px 640px at 104% 96%, var(--glow-b), transparent 60%),
    var(--bg);
  font-family:var(--sans); font-size:16px; line-height:1.65;
  word-break:keep-all; line-break:strict; overflow-wrap:anywhere;
  -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;
  transition:background .5s ease,color .35s ease;
}
.hub[data-theme="light"], .hub.light-tokens{
  --bg:#f5f7fb; --s1:#ffffff; --s2:#f2f5fb; --s3:#e6ebf5;
  --line:rgba(30,50,95,.12); --line-2:rgba(30,50,95,.22);
  --ink:#15233f; --ink-2:#4d5a72; --ink-3:#66738c;
  --gold:#2563eb; --gold-2:#3574f0; --gold-deep:#1d4ed8; --gold-ink:#ffffff; --gold-line:rgba(37,99,235,.42);
  --blue-bg:rgba(37,99,235,.1); --blue-ink:#1e40af;
  --chip-bg:rgba(21,35,63,.07); --chip-ink:#3a4a68;
  --shade-a:rgba(10,14,24,.94); --shade-b:rgba(10,14,24,.5); --shade-c:rgba(10,14,24,.05);
  --glow-a:rgba(37,99,235,.10); --glow-b:rgba(232,197,131,.12);
  --shadow:0 18px 40px -26px rgba(21,35,63,.35), inset 0 1px 0 rgba(255,255,255,.6);
  --key-w:#ffffff; --key-b:#1a2b4d; --key-line:#c9d3e6; --keys-op:.9;
  --nav-bg:rgba(245,247,251,.78);
}
@media (prefers-color-scheme:light){ .hub:not([data-theme]){
  --bg:#f5f7fb; --s1:#ffffff; --s2:#f2f5fb; --s3:#e6ebf5;
  --line:rgba(30,50,95,.12); --line-2:rgba(30,50,95,.22);
  --ink:#15233f; --ink-2:#4d5a72; --ink-3:#66738c;
  --gold:#2563eb; --gold-2:#3574f0; --gold-deep:#1d4ed8; --gold-ink:#ffffff; --gold-line:rgba(37,99,235,.42);
  --blue-bg:rgba(37,99,235,.1); --blue-ink:#1e40af;
  --chip-bg:rgba(21,35,63,.07); --chip-ink:#3a4a68;
  --shade-a:rgba(10,14,24,.94); --shade-b:rgba(10,14,24,.5); --shade-c:rgba(10,14,24,.05);
  --glow-a:rgba(37,99,235,.10); --glow-b:rgba(232,197,131,.12);
  --shadow:0 18px 40px -26px rgba(21,35,63,.35), inset 0 1px 0 rgba(255,255,255,.6);
  --key-w:#ffffff; --key-b:#1a2b4d; --key-line:#c9d3e6; --keys-op:.9;
  --nav-bg:rgba(245,247,251,.78);
}}
.hub *{box-sizing:border-box}
.hub a{color:inherit;text-decoration:none}
.hub h1,.hub h2,.hub h3,.hub p{margin:0}
.hub h1,.hub h2,.hub h3{font-weight:600}
.hub .serif{font-family:var(--serif);font-weight:600;letter-spacing:.01em;font-feature-settings:"palt"}
.hub .num{font-family:var(--serif);font-weight:600;font-variant-numeric:tabular-nums lining-nums;letter-spacing:0}
.hub .wrap{max-width:1280px;margin:0 auto;padding:0 clamp(16px,3vw,28px)}
.hub button{font:inherit}
.hub .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.hub a:focus-visible,.hub button:focus-visible{outline:2px solid var(--gold);outline-offset:3px;border-radius:6px}

/* ── nav ── */
.hub .nav{position:sticky;top:0;z-index:20;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);background:var(--nav-bg);border-bottom:1px solid var(--line)}
.hub .nav .wrap{height:66px;display:flex;align-items:center;gap:28px}
.hub .nav .logo img{height:22px;width:auto;display:block}
.hub .nav .links{display:flex;gap:24px;margin-left:8px}
.hub .nav .links a{font-size:15px;color:var(--ink-2);padding:6px 0;position:relative}
.hub .nav .links a:hover{color:var(--ink)}
.hub .nav .links a.on{color:var(--ink)}
.hub .nav .links a.on::after{content:"";position:absolute;left:0;right:0;bottom:-3px;height:2px;background:var(--gold);border-radius:2px}
.hub .nav .sp{flex:1}
.hub .nav .icon{width:38px;height:38px;border-radius:50%;border:1px solid var(--line-2);background:transparent;color:var(--ink-2);display:grid;place-items:center;position:relative;cursor:pointer;transition:color .2s,border-color .2s}
.hub .nav .icon:hover{color:var(--ink);border-color:var(--gold-line)}
.hub .nav .icon .dot{position:absolute;top:6px;right:7px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:var(--gold);color:var(--gold-ink);font-size:10.5px;font-weight:800;line-height:16px;text-align:center;box-shadow:0 0 0 2px var(--bg)}
.hub .nav .me{display:flex;align-items:center;gap:10px;font-size:15px;color:var(--ink-2)}
.hub .nav .av{width:36px;height:36px;border-radius:50%;background:linear-gradient(140deg,var(--gold-2),var(--gold-deep));color:var(--gold-ink);font-weight:800;font-size:14px;display:grid;place-items:center}

/* ── greeting ── */
.hub .greet{display:flex;align-items:flex-end;gap:18px;padding:32px 0 22px}
.hub .greet img{width:74px;height:74px;object-fit:contain;filter:drop-shadow(0 10px 18px rgba(0,0,0,.4));flex:none}
.hub .greet h1{font-size:clamp(24px,2.6vw,30px);line-height:1.25;text-wrap:balance}
.hub .greet p{margin-top:6px;color:var(--ink-2);font-size:16px;max-width:40ch;text-wrap:pretty}
.hub .greet .date{margin-left:auto;color:var(--ink-3);font-size:14px;padding-bottom:6px;white-space:nowrap;font-variant-numeric:tabular-nums}

/* ── hero ── */
.hub .hero{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(320px,1fr);gap:22px;align-items:stretch}
.hub .poster{position:relative;display:flex;flex-direction:column;justify-content:flex-end;min-height:420px;border-radius:22px;overflow:hidden;
  background:#0a0c12 url("/rick-piano.jpg") center 30%/cover no-repeat;border:1px solid var(--line-2);box-shadow:var(--shadow);color:#fff}
.hub .poster::before{content:"";position:absolute;inset:0;background:linear-gradient(to top,var(--shade-a) 0%,var(--shade-b) 44%,var(--shade-c) 78%)}
.hub .poster .top{position:absolute;top:18px;left:18px;display:flex;gap:8px;z-index:1}
.hub .poster .play{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);width:84px;height:84px;border-radius:50%;background:#e8c583;color:#2a1e08;display:grid;place-items:center;
  box-shadow:0 0 0 10px rgba(232,197,131,.18),0 20px 50px -10px rgba(232,197,131,.6);transition:transform .2s}
.hub .poster:hover .play{transform:translate(-50%,-50%) scale(1.06)}
.hub .poster .play svg{width:36px;height:36px;margin-left:4px}
.hub .poster .txt{position:relative;z-index:1;padding:26px 28px 28px}
.hub .poster .eyebrow{color:#f3d9a3;font-size:14px;font-weight:600;letter-spacing:.02em;margin-bottom:8px}
.hub .poster h2{font-size:clamp(22px,2.2vw,28px);line-height:1.32;text-wrap:balance;color:#fff;text-shadow:0 2px 18px rgba(0,0,0,.5);max-width:28ch}
.hub .poster h2 .no{color:#f3d9a3;margin-right:.35em}
.hub .poster .meta{margin-top:10px;color:rgba(243,239,230,.82);font-size:15px;display:flex;gap:16px;flex-wrap:wrap}
.hub .poster .meta b{color:#fff;font-weight:500}
.hub .poster .row{display:flex;align-items:center;gap:14px;margin-top:18px;flex-wrap:wrap}
.hub .poster.locked{cursor:default}
.hub .poster.locked .txt p{color:rgba(243,239,230,.85);font-size:16px;margin-top:8px;max-width:36ch;text-wrap:pretty}
.hub .btn{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:12px 22px;font-size:15px;font-weight:700;border:0;cursor:pointer;transition:transform .15s;white-space:nowrap}
.hub .btn svg{width:18px;height:18px;flex:none}
.hub .btn.gold{background:linear-gradient(180deg,var(--gold-2),var(--gold));color:var(--gold-ink);box-shadow:0 12px 30px -10px rgba(232,197,131,.7)}
.hub .btn.gold:hover{transform:translateY(-1px)}
.hub .poster .btn.gold{background:linear-gradient(180deg,#f3d9a3,#e8c583);color:#2a1e08}
.hub .poster .chip.gold{background:#e8c583;color:#2a1e08}
.hub .btn.ghost{border:1px solid rgba(255,255,255,.3);color:#fff;background:rgba(255,255,255,.08);font-weight:500}
.hub .poster .prog{flex:1;min-width:150px;display:flex;align-items:center;gap:10px;color:rgba(243,239,230,.7);font-size:13px;font-variant-numeric:tabular-nums}
.hub .poster .prog .bar{flex:1}

/* chips */
.hub .chip{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;line-height:1;padding:7px 10px;border-radius:999px;background:var(--chip-bg);color:var(--chip-ink);letter-spacing:.02em;white-space:nowrap}
.hub .chip.gold{background:var(--gold);color:var(--gold-ink)}
.hub .chip.new{background:var(--blue-bg);color:var(--blue-ink)}
.hub .chip.lock{background:var(--chip-bg);color:var(--ink-3)}
.hub .chip.dark{background:rgba(8,10,16,.62);color:#f3efe6;backdrop-filter:blur(6px)}
.hub .chip svg{width:13px;height:13px}
/* 封面（海報／單元卡／章節卡）永遠是深底：標籤用固定色，不跟主題換 */
.hub .cover .chip{background:rgba(255,255,255,.12);color:#d8d3c6}
.hub .cover .chip.gold{background:#e8c583;color:#2a1e08}
.hub .cover .chip.new{background:rgba(122,162,255,.3);color:#e3ebff}
.hub .cover .chip.lock{background:rgba(255,255,255,.12);color:#cfc9bb}

/* side cards */
.hub .side{display:grid;grid-template-rows:auto 1fr;gap:22px;min-width:0}
.hub .card{background:linear-gradient(180deg,var(--s2),var(--s1));border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);padding:22px 22px 20px;position:relative;overflow:hidden}
.hub .card h3{font-size:17px}
.hub .card .cap{color:var(--ink-3);font-size:13px;margin-top:2px}
.hub .progress .top{display:flex;align-items:center;gap:18px;margin-top:16px}
.hub .ring{width:104px;height:104px;position:relative;flex:none}
.hub .ring svg{width:100%;height:100%;transform:rotate(-90deg)}
.hub .ring .t{fill:none;stroke:var(--chip-bg);stroke-width:9}
.hub .ring .v{fill:none;stroke:var(--gold);stroke-width:9;stroke-linecap:round;transition:stroke-dashoffset .6s ease}
.hub .ring .mid{position:absolute;inset:0;display:grid;place-items:center;text-align:center;line-height:1}
.hub .ring .mid b{font-size:26px;color:var(--ink)}
.hub .ring .mid small{display:block;color:var(--ink-3);font-size:11px;margin-top:5px}
.hub .progress .big{font-size:34px;line-height:1}
.hub .progress .big small{font-size:18px;color:var(--ink-3);margin-left:2px}
.hub .progress .lbl{color:var(--ink-2);font-size:14px;margin-top:6px}
.hub .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:18px}
.hub .stats div{background:var(--chip-bg);border:1px solid var(--line);border-radius:12px;padding:10px 12px;min-width:0}
.hub .stats b{display:block;font-size:22px;line-height:1.1}
.hub .stats b small{font-size:13px;color:var(--ink-3);margin-left:2px;font-family:var(--sans);font-weight:500}
.hub .stats span{color:var(--ink-3);font-size:12.5px;display:block;margin-top:3px;line-height:1.3}
.hub .nextopen{display:flex;align-items:center;gap:8px;margin-top:14px;padding-top:14px;border-top:1px solid var(--line);color:var(--ink-2);font-size:14px}
.hub .nextopen svg{color:var(--gold);flex:none}
.hub .nextopen b{color:var(--ink);font-weight:600}
.hub .anncard{padding-right:118px;display:flex;flex-direction:column;align-items:flex-start;text-align:left;cursor:pointer;width:100%;color:var(--ink);transition:border-color .15s}
.hub .anncard:hover{border-color:var(--gold-line)}
.hub .anncard .tag{display:inline-flex;align-items:center;gap:6px;color:var(--gold);font-size:13px;font-weight:700;margin-bottom:10px}
.hub .anncard .tag svg{width:14px;height:14px}
.hub .anncard .tag .unread{width:7px;height:7px;border-radius:50%;background:var(--gold)}
.hub .anncard h3{font-size:17px;line-height:1.45;text-wrap:balance}
.hub .anncard p{margin-top:8px;color:var(--ink-2);font-size:14.5px;line-height:1.7;max-width:38ch;text-wrap:pretty}
.hub .anncard .more{display:inline-flex;align-items:center;gap:6px;margin-top:14px;color:var(--gold);font-size:14px;font-weight:700}
.hub .anncard img{position:absolute;right:-4px;bottom:-4px;width:118px;height:118px;object-fit:contain;filter:drop-shadow(0 8px 16px rgba(0,0,0,.45));pointer-events:none}
.hub .card.plain p{margin-top:8px;color:var(--ink-2);font-size:14.5px;line-height:1.7;max-width:38ch}
.hub .card.plain .more{display:inline-flex;align-items:center;gap:6px;margin-top:14px;color:var(--gold);font-size:14px;font-weight:700}

/* ── sections ── */
.hub .sec{margin-top:44px}
.hub .sec-h{display:flex;align-items:baseline;gap:14px;margin-bottom:16px;flex-wrap:wrap}
.hub .sec-h h2{font-size:22px;line-height:1.3}
.hub .sec-h .cap{color:var(--ink-3);font-size:14px}
.hub .sec-h .more{margin-left:auto;color:var(--gold);font-size:14px;font-weight:700;display:inline-flex;align-items:center;gap:6px;background:none;border:0;padding:0;cursor:pointer}
.hub .sect-t{font-family:var(--serif);font-weight:600;font-feature-settings:"palt";font-size:22px;line-height:1.3;color:var(--ink);margin:44px 0 16px;display:flex;align-items:baseline;gap:12px}
.hub .sect-t .more{font-family:var(--sans);font-size:14px;color:var(--gold);font-weight:700;background:none;border:0;cursor:pointer;margin-left:auto;padding:0}
.hub .ann-list{margin-bottom:0}

/* 琴鍵紋理（封面底部） */
.hub .keys-tex{position:absolute;left:0;right:0;bottom:0;height:22%;pointer-events:none;opacity:.5;
  background:repeating-linear-gradient(90deg,transparent 0 8.6%,rgba(6,8,12,.9) 8.6% 14.3%) top/100% 60% no-repeat,
             repeating-linear-gradient(90deg,rgba(255,255,255,.14) 0 13.8%,rgba(0,0,0,.6) 13.8% 14.3%)}
.hub .keys-tex::before{content:"";position:absolute;inset:0;background:linear-gradient(to top,transparent,rgba(20,25,36,.2))}

/* 單元卡 */
.hub .lessons{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:16px}
.hub .lesson{background:var(--s1);border:1px solid var(--line);border-radius:14px;overflow:hidden;box-shadow:var(--shadow);transition:transform .15s,border-color .15s;display:flex;flex-direction:column}
.hub .lesson:hover{transform:translateY(-3px);border-color:var(--line-2)}
.hub .lesson.next{border-color:var(--gold-line);box-shadow:0 0 0 1px var(--gold-line),var(--shadow)}
.hub .lesson .cover{position:relative;aspect-ratio:16/10;background:linear-gradient(140deg,#25304a,#141a26 60%,#0f131c);overflow:hidden}
.hub .lesson.next .cover{background:linear-gradient(140deg,#4a3a1e,#1c1913 55%,#0f131c)}
.hub .lesson.done .cover{background:linear-gradient(140deg,#1f3a30,#131b18 60%,#0f131c)}
.hub .lesson.locked .cover{background:linear-gradient(140deg,#20242f,#12151d 70%)}
.hub .lesson .no{position:absolute;left:14px;bottom:12px;font-size:36px;line-height:1;color:#f3d9a3;text-shadow:0 2px 12px rgba(0,0,0,.6);z-index:1}
.hub .lesson.locked .no,.hub .lesson.done .no{color:#cfc9bb}
.hub .lesson .dur{position:absolute;top:10px;right:10px;font-size:12px;font-weight:700;background:rgba(8,10,16,.7);color:#f3efe6;padding:4px 8px;border-radius:6px;z-index:1;font-variant-numeric:tabular-nums}
.hub .lesson .pm{position:absolute;right:12px;bottom:12px;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.14);color:#fff;display:grid;place-items:center;z-index:1;border:1px solid rgba(255,255,255,.25)}
.hub .lesson .pm svg{width:18px;height:18px}
.hub .lesson.next .pm{background:var(--gold);color:var(--gold-ink);border-color:transparent}
.hub .lesson.done .pm{background:rgba(143,217,177,.22);color:#c8f0da;border-color:transparent}
.hub .lesson .body{padding:12px 14px 14px;display:flex;flex-direction:column;flex:1}
.hub .lesson h3{font-size:15px;line-height:1.45;font-weight:600;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:calc(15px * 1.45 * 2)}
.hub .lesson .meta{display:flex;align-items:center;justify-content:space-between;margin-top:auto;padding-top:10px;color:var(--ink-3);font-size:13px;font-variant-numeric:tabular-nums}

/* 章節卡 */
.hub .chapters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
.hub .chapter{background:var(--s1);border:1px solid var(--line);border-radius:16px;overflow:hidden;box-shadow:var(--shadow);display:flex;flex-direction:column;transition:transform .15s,border-color .15s}
.hub .chapter:hover{transform:translateY(-3px);border-color:var(--line-2)}
.hub .chapter .cover{position:relative;height:104px;background:linear-gradient(140deg,#2a3450,#161c2a 70%);padding:16px 18px;display:flex;justify-content:space-between;align-items:flex-start}
.hub .chapter.progress .cover{background:linear-gradient(140deg,#5a4620,#221c12 70%)}
.hub .chapter.new .cover{background:linear-gradient(140deg,#28407a,#161c2c 70%)}
.hub .chapter.done .cover{background:linear-gradient(140deg,#1f3a30,#131b18 70%)}
.hub .chapter.locked .cover{background:linear-gradient(140deg,#20242f,#12151d 70%)}
.hub .chapter .roman{font-size:44px;line-height:1;color:#f3d9a3;text-shadow:0 2px 14px rgba(0,0,0,.5);position:relative;z-index:1}
.hub .chapter .roman.sm{font-size:20px;padding-top:6px;letter-spacing:.04em}
.hub .chapter.locked .roman{color:#9c978a}
.hub .chapter .cover .chip{position:relative;z-index:1}
.hub .chapter .body{padding:16px 18px;display:flex;flex-direction:column;gap:12px;flex:1}
.hub .chapter h3{font-size:17px;line-height:1.4;text-wrap:balance}
.hub .chapter h3 small{display:block;font-size:13.5px;font-weight:500;color:var(--ink-2);margin-top:3px;letter-spacing:.01em}
.hub .chapter.locked h3{color:var(--ink-2)}
.hub .chapter.locked h3 small{color:var(--ink-3)}
.hub .bar{height:6px;border-radius:999px;background:var(--chip-bg);overflow:hidden}
.hub .bar i{display:block;height:100%;background:linear-gradient(90deg,var(--gold-deep),var(--gold));border-radius:999px}
.hub .chapter .foot{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:14px;color:var(--ink-2);margin-top:auto;font-variant-numeric:tabular-nums}
.hub .chapter .foot .go{display:inline-flex;align-items:center;gap:4px;color:var(--gold);font-weight:700}
.hub .chapter .foot .go svg{width:15px;height:15px}
.hub .chapter .foot .muted{color:var(--ink-3)}
.hub .chapter.appx .cover{height:64px;padding:10px 18px;align-items:center}

/* 練功房 */
.hub .games-wrap{display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:22px;align-items:center}
.hub .games{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.hub .game{background:var(--s1);border:1px solid var(--line);border-radius:14px;padding:16px;display:flex;gap:14px;align-items:center;box-shadow:var(--shadow);transition:transform .15s}
.hub .game:hover{transform:translateY(-3px)}
.hub .game .tile{width:60px;height:60px;border-radius:14px;flex:none;display:grid;place-items:center;font-size:26px;color:var(--gold-ink);background:linear-gradient(140deg,var(--gold-2),var(--gold-deep));font-family:var(--serif)}
.hub .game.soon .tile{background:linear-gradient(140deg,var(--s3),var(--s2));color:var(--ink-2)}
.hub .game h3{font-size:16px;line-height:1.4}
.hub .game p{margin:2px 0 8px;color:var(--ink-3);font-size:13px}
.hub .game .body{min-width:0}
.hub .mascot-stage{position:relative;height:238px;display:flex;align-items:flex-end;justify-content:flex-end;padding-right:6px}
.hub .mascot-stage img{height:176px;width:auto;object-fit:contain;filter:drop-shadow(0 18px 24px rgba(0,0,0,.5))}
.hub .mascot-stage .bubble{position:absolute;left:0;top:0;background:#fff;color:#1c1d22;font-size:13.5px;font-weight:700;padding:10px 14px;border-radius:14px 14px 14px 4px;box-shadow:0 10px 24px -10px rgba(0,0,0,.5);max-width:196px;line-height:1.5}
.hub .mascot-stage .bubble::after{content:"";position:absolute;left:22px;bottom:-8px;border:8px solid transparent;border-top-color:#fff;border-bottom:0}

/* ── footer：真實比例鋼琴鍵 ── */
.hub .keys{margin-top:56px;border-top:1px solid var(--line);height:88px;display:flex;opacity:var(--keys-op);pointer-events:none;overflow:hidden}
.hub .keys i{position:relative;flex:1;background:var(--key-w);border-right:1px solid var(--key-line);box-shadow:inset 0 -3px 4px -3px rgba(0,0,0,.25)}
.hub .keys i.bk::after{content:"";position:absolute;top:0;right:-29%;width:58%;height:63%;z-index:2;background:linear-gradient(#2b2b2b,var(--key-b));border-radius:0 0 2px 2px;box-shadow:0 2px 2px rgba(0,0,0,.4)}
.hub .foot{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;color:var(--ink-3);font-size:13px;padding:14px 0 28px}
.hub .foot .links{display:flex;gap:18px}
.hub .foot a,.hub .foot button{color:var(--ink-3);background:none;border:0;padding:0;cursor:pointer;font-size:13px}
.hub .foot a:hover,.hub .foot button:hover{color:var(--ink)}

/* ── RWD ── */
@media (max-width:1100px){
  .hub .lessons{grid-template-columns:repeat(3,minmax(0,1fr))}
  .hub .chapters{grid-template-columns:repeat(2,minmax(0,1fr))}
  .hub .games-wrap{grid-template-columns:1fr} .hub .mascot-stage{display:none}
}
@media (max-width:900px){
  .hub .hero{grid-template-columns:1fr}
  .hub .side{grid-template-rows:none}
}
@media (max-width:720px){
  .hub{font-size:15px}
  .hub .nav .wrap{height:60px;gap:14px}
  .hub .nav .links,.hub .nav .me .nm{display:none}
  .hub .greet{padding:22px 0 16px;gap:12px}
  .hub .greet img{width:56px;height:56px}
  .hub .greet h1{font-size:24px}
  .hub .greet .date{display:none}
  .hub .poster{min-height:0;aspect-ratio:4/5;border-radius:18px}
  .hub .poster .txt{padding:18px}
  .hub .poster h2{font-size:22px}
  .hub .poster .meta{font-size:14px;gap:12px}
  .hub .poster .play{width:68px;height:68px;top:38%}
  .hub .poster .row{gap:10px}
  .hub .poster .prog{flex-basis:100%}
  .hub .lessons{display:flex;overflow-x:auto;gap:12px;scroll-snap-type:x mandatory;padding:4px clamp(16px,3vw,28px) 10px;margin:0 calc(-1 * clamp(16px,3vw,28px));scrollbar-width:none}
  .hub .lesson:hover{transform:none}
  .hub .lessons::-webkit-scrollbar{display:none}
  .hub .lesson{flex:0 0 72%;scroll-snap-align:start}
  .hub .chapters,.hub .games{grid-template-columns:1fr}
  .hub .sec{margin-top:36px}
  .hub .sec-h h2{font-size:20px}
  .hub .sec-h .cap{flex-basis:100%;order:3;margin-top:-6px}
  .hub .card{padding:18px}
  .hub .stats{gap:8px}
  .hub .stats div{padding:9px 10px}
  .hub .anncard{padding-right:96px}
  .hub .anncard img{width:96px;height:96px}
  .hub .keys{height:64px} .hub .keys i{flex:0 0 calc(100%/21)}
}
@media (prefers-reduced-motion:reduce){ .hub *{transition:none!important} }
`;
