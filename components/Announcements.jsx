"use client";
// 教室公告：儀表板「最新公告」區、播放頁鈴鐺／提示條／抽屜、重要公告卡片。
// 列表（一則一列）與彈出視窗（完整內容＋上一則／下一則）兩邊共用同一組元件。
// 狀態集中在 useAnnouncements（排序、逐則已讀、重要），各元件只負責畫。
// 沒有公告 → 所有元件都回 null，畫面上什麼都不出現。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { sortAnnouncements, countUnread, pickImportant, pickStrip, isUnread, legacyReadIds } from "@/lib/announcements-view";
import { announcementHtml, announcementSummary } from "@/lib/announcement-md";
import { readAnnouncementState, writeRead, writeAck, writeStripDismissed } from "@/lib/announcement-state";

const F = "var(--type-body)";
const WD = "日一二三四五六";
const asDate = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : d; };
const fmtDate = (iso) => { const d = asDate(iso); return d ? `${d.getMonth() + 1}/${d.getDate()}` : ""; };
const fmtWd = (iso) => { const d = asDate(iso); return d ? WD[d.getDay()] : ""; };

// 內容 HTML 已由 announcementHtml 跳脫（只允許受限 Markdown 與 http(s) 連結）
const Md = ({ body, className = "" }) => (
  <div className={`ann-md ${className}`} dangerouslySetInnerHTML={{ __html: announcementHtml(body) }} />
);

export function useAnnouncements(items, { storage } = {}) {
  const store = storage !== undefined ? storage : (typeof window !== "undefined" ? window.localStorage : null);
  const sorted = useMemo(() => sortAnnouncements(items || []), [items]);
  const [state, setState] = useState({ seenAt: null, read: null, acked: [], stripDismissed: null });
  const [ready, setReady] = useState(false); // 讀完裝置記憶前一律當已讀，避免未讀數／提示條閃一下
  const [open, setOpen] = useState(false);   // 播放頁右側抽屜
  const [openId, setOpenId] = useState(null); // 彈出視窗中的那一則

  useEffect(() => { setState(readAnnouncementState(store)); setReady(true); }, [store]);

  // 舊資料遷移（每台裝置一次）：這台還沒有逐則已讀清單時，把 seenAt 之前的公告一次記成已讀。
  useEffect(() => {
    if (!ready || state.read !== null || !sorted.length) return;
    const read = writeRead(store, legacyReadIds(sorted, state.seenAt));
    setState((s) => ({ ...s, read: [...new Set([...(s.read || []), ...(read || [])])] }));
  }, [ready, state.read, state.seenAt, sorted, store]);

  // 讀完裝置記憶前一律當「已讀」，避免首次渲染閃一下紅點與提示條
  const readState = ready ? state : { read: sorted.map((a) => a.id) };
  const unread = countUnread(sorted, readState);
  const important = ready ? pickImportant(sorted, state.acked) : null;
  const strip = pickStrip(sorted, readState, state.stripDismissed);

  const markRead = useCallback((id) => {
    const read = writeRead(store, [id]);
    setState((s) => ({ ...s, read: [...new Set([...(s.read || []), ...(read || [])])] }));
  }, [store]);

  const openItem = useCallback((id) => { setOpenId(id); markRead(id); }, [markRead]);
  const closeItem = useCallback(() => setOpenId(null), []);
  // 卡片已經把全文顯示出來，按「知道了」就一併記成已讀（否則鈴鐺數字、清單粗體、提示條藍底都還當它未讀）
  const ack = (id) => { writeAck(store, id); markRead(id); setState((s) => ({ ...s, acked: [...s.acked, id] })); };
  const dismissStrip = (id) => { writeStripDismissed(store, id); setState((s) => ({ ...s, stripDismissed: id })); };
  const openDrawer = () => setOpen(true);
  const closeDrawer = () => { setOpen(false); setOpenId(null); };

  return { sorted, unread, important, strip, readState, open, openDrawer, closeDrawer, openId, openItem, closeItem, ack, dismissStrip };
}

/* ── 播放頁：頁首鈴鐺 ─────────────────────────────────────────────────────── */
export function AnnouncementsBell({ ann }) {
  if (!ann.sorted.length) return null;
  const n = ann.unread;
  return (
    <button
      type="button" data-ann-bell onClick={() => (ann.open ? ann.closeDrawer() : ann.openDrawer())}
      aria-label={n ? `公告，${n} 則未讀` : "公告"}
      style={{ position: "relative", width: 34, height: 34, borderRadius: "50%", border: "1px solid rgba(0,0,0,0.13)", background: "#fff", display: "grid", placeItems: "center", cursor: "pointer", color: "#334155", flexShrink: 0 }}
    >
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </svg>
      {n > 0 && (
        <span style={{ position: "absolute", top: -5, right: -5, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 100, background: "#dc2626", color: "#fff", fontSize: 11, fontWeight: 700, display: "grid", placeItems: "center", fontVariantNumeric: "tabular-nums", border: "2px solid #fff", fontFamily: F }}>
          {n}
        </span>
      )}
    </button>
  );
}

/* ── 播放頁：未讀提示條（頁首下方一行） ───────────────────────────────────── */
export function AnnouncementsStrip({ ann }) {
  const a = ann.strip;
  if (!a) return null;
  // 未讀＝藍底強調；已讀＝安靜的灰底，讓最新公告一直看得到但不搶戲
  const on = a.unread;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 20px", background: on ? "#eff6ff" : "#f8fafc", borderBottom: `1px solid ${on ? "#bfdbfe" : "#e2e8f0"}`, fontSize: 13, fontFamily: F }}>
      <span aria-hidden="true">📢</span>
      {a.persistent && <span style={{ fontSize: 11, fontWeight: 700, color: on ? "#1d4ed8" : "#475569", border: `1px solid ${on ? "#93c5fd" : "#cbd5e1"}`, borderRadius: 999, padding: "1px 7px", lineHeight: 1.5 }}>置頂</span>}
      <span style={{ color: on ? "#1d4ed8" : "#64748b", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtDate(a.created_at)}</span>
      <span style={{ color: on ? "#1e3a8a" : "#334155", fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</span>
      <button type="button" onClick={() => ann.openItem(a.id)} style={{ color: on ? "#1d4ed8" : "#475569", fontWeight: 600, background: "none", border: "none", cursor: "pointer", fontFamily: F, fontSize: 12.5 }}>查看</button>
      {/* 置頂公告常駐：不給關 */}
      {!a.persistent && <button type="button" onClick={() => ann.dismissStrip(a.id)} aria-label="關閉提示" style={{ color: "#64748b", background: "none", border: "none", fontSize: 18, lineHeight: 1, cursor: "pointer" }}>×</button>}
    </div>
  );
}

const MD_CSS = `
.ann-md p{margin:0 0 8px}.ann-md p:last-child{margin-bottom:0}
.ann-md ul{margin:4px 0 8px 18px;padding:0}.ann-md li{margin:0 0 3px}
.ann-md a{text-decoration:underline;text-underline-offset:3px;word-break:break-all}
.ann-md.light a{color:#1d4ed8}.ann-md.light strong{color:#0f172a}
.ann-md h1,.ann-md h2,.ann-md h3{font-size:1em;margin:8px 0 4px}
`;

// 列表＋彈出視窗共用色票：預設淺色（播放頁）；在儀表板（.hub）改吃音樂廳主題變數，深／淺切換自動跟著走。
const ANN_CSS = MD_CSS + `
.ann-dd{position:absolute;top:calc(100% + 8px);right:0;z-index:1000;width:min(360px,calc(100vw - 24px));max-height:min(60vh,420px);overflow:auto;
  background:#fff;color:#0f172a;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 24px 60px -24px rgba(15,23,42,.45)}
/* 手機：鈴鐺右邊還有帳號／登出，absolute 靠右錨定會讓 360px 的下拉左半邊掉出畫面外 → 改固定在視窗內 */
@media (max-width:640px){.ann-dd{position:fixed;top:60px;left:12px;right:12px;width:auto;max-height:70vh}}
.ann-list,.ann-modal-bd{
  --ann-card:#fff;--ann-ink:#0f172a;--ann-soft:#334155;--ann-muted:#64748b;
  --ann-line:#e2e8f0;--ann-hover:#f8fafc;--ann-accent:#2563eb;
  --ann-tag-bg:#eff6ff;--ann-tag-ink:#1d4ed8;--ann-tag-line:transparent;
}
.hub .ann-list,.hub .ann-modal-bd,.ann-modal-bd[data-variant="hub"]{
  --ann-card:var(--card);--ann-ink:var(--ink);--ann-soft:var(--ink-soft);--ann-muted:var(--ink-faint);
  --ann-line:var(--line-soft);--ann-hover:var(--card-a);--ann-accent:var(--gold);
  --ann-tag-bg:transparent;--ann-tag-ink:var(--gold);--ann-tag-line:var(--gold-line);
  --ann-modal-bg:var(--bg2);
}
.hub .ann-list{margin-bottom:40px}
.ann-list{display:flex;flex-direction:column;gap:8px}
.ann-row{display:grid;grid-template-columns:8px auto minmax(0,1fr) auto;gap:10px;align-items:center;
  width:100%;min-height:44px;padding:10px 14px;text-align:left;cursor:pointer;font:inherit;
  color:var(--ann-ink);background:var(--ann-card);border:1px solid var(--ann-line);border-radius:10px;
  transition:border-color .18s,background .18s}
.ann-row:hover{border-color:var(--ann-accent);background:var(--ann-hover)}
.ann-row:focus-visible{outline:2px solid var(--ann-accent);outline-offset:2px}
.ann-row .ann-dot{width:8px;height:8px;border-radius:50%;background:var(--ann-accent);visibility:hidden}
.ann-row.unread .ann-dot{visibility:visible}
.ann-row.unread .ann-t{font-weight:700}
.ann-date{font-size:12px;color:var(--ann-muted);white-space:nowrap;font-variant-numeric:tabular-nums}
.ann-main{min-width:0}
.ann-hl{display:flex;align-items:center;gap:6px;min-width:0}
.ann-t{font-size:14.5px;font-weight:600;line-height:1.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ann-ex{display:block;margin-top:1px;font-size:12.5px;color:var(--ann-muted);line-height:1.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ann-go{font-size:12.5px;color:var(--ann-muted);white-space:nowrap}
.ann-tag{flex:none;font-size:11px;font-weight:700;padding:1px 7px;border-radius:100px;
  background:var(--ann-tag-bg);color:var(--ann-tag-ink);border:1px solid var(--ann-tag-line)}
/* 「重要」要比「置頂」更有份量：實心底色，否則兩顆長得一樣、重要公告失去視覺權重 */
.ann-tag.imp{background:var(--ann-accent);color:#fff;border-color:transparent}
.ann-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.ann-modal-bd{position:fixed;inset:0;z-index:1050;background:rgba(15,23,42,.55);display:grid;place-items:center;padding:20px}
.ann-modal{width:min(520px,100%);max-height:min(78vh,700px);display:flex;flex-direction:column;
  background:var(--ann-modal-bg,var(--ann-card,#fff));color:var(--ann-ink);border:1px solid var(--ann-line);
  border-radius:16px;box-shadow:0 30px 80px -30px rgba(15,23,42,.6);animation:ann-pop .16s ease-out}
.ann-modal:focus{outline:none}
@keyframes ann-pop{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.ann-hd{position:relative;padding:18px 54px 12px 22px;border-bottom:1px solid var(--ann-line)}
.ann-meta{display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12px;color:var(--ann-muted);font-variant-numeric:tabular-nums}
.ann-hd h3{margin:0;font-size:18px;line-height:1.45;text-wrap:balance}
.ann-x{position:absolute;top:12px;right:12px;width:34px;height:34px;border:0;border-radius:10px;
  background:none;color:var(--ann-muted);font-size:20px;line-height:1;cursor:pointer}
.ann-x:hover{background:var(--ann-hover);color:var(--ann-ink)}
.ann-bd{flex:1;overflow:auto;padding:16px 22px;color:var(--ann-soft);font-size:14px;line-height:1.8}
.ann-ft{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border-top:1px solid var(--ann-line)}
.ann-ft button{min-height:40px;padding:8px 14px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;
  color:var(--ann-accent);background:none;border:1px solid var(--ann-line);border-radius:10px}
.ann-ft button:hover:not(:disabled){border-color:var(--ann-accent)}
.ann-ft button:disabled{color:var(--ann-muted);opacity:.5;cursor:default}
.ann-idx{font-size:12px;color:var(--ann-muted);font-variant-numeric:tabular-nums}
@media(max-width:700px){
  .ann-row{grid-template-columns:8px auto minmax(0,1fr);min-height:52px;padding:11px 12px;gap:10px}
  .ann-go{display:none}
  .ann-modal-bd{padding:12px}
  .ann-modal{width:100%;max-height:86vh}
  .ann-hd{padding:16px 50px 10px 18px}
  .ann-bd{padding:14px 18px}
}
@media (prefers-reduced-motion:reduce){.ann-row,.ann-modal{transition:none!important;animation:none!important}}
`;

/* ── 公告列表（儀表板與播放頁抽屜共用）：一則一列，點下去開彈出視窗 ───────── */
// withModal=false：由外層自己掛 AnnouncementModal（播放頁下拉用，讓彈窗不隨下拉收起而消失）
export function AnnouncementList({ ann, items, variant = "light", withModal = true }) {
  const list = items || ann.sorted;
  const rows = useRef({});
  const last = useRef(null);

  // 關掉視窗後把焦點還給觸發的那一列
  useEffect(() => {
    if (ann.openId) { last.current = ann.openId; return; }
    if (!last.current) return;
    const el = rows.current[last.current];
    last.current = null;
    el?.focus?.();
  }, [ann.openId]);

  if (!list.length) return null;
  return (
    <>
      <style>{ANN_CSS}</style>
      <div className="ann-list">
        {list.map((a) => {
          const unread = isUnread(a, ann.readState);
          return (
            <button
              type="button" key={a.id} ref={(el) => { rows.current[a.id] = el; }}
              className={`ann-row${unread ? " unread" : ""}`} onClick={() => ann.openItem(a.id)}
            >
              <span className="ann-dot" aria-hidden="true" />
              <span className="ann-date">{fmtDate(a.created_at)}</span>
              <span className="ann-main">
                <span className="ann-hl">
                  {unread && <span className="ann-sr">未讀</span>}
                  {a.pinned && <span className="ann-tag">置頂</span>}
                  {a.important && <span className="ann-tag imp">重要</span>}
                  <span className="ann-t">{a.title}</span>
                </span>
                <span className="ann-ex">{announcementSummary(a.body)}</span>
              </span>
              <span className="ann-go" aria-hidden="true">查看 →</span>
            </button>
          );
        })}
      </div>
      {withModal && <AnnouncementModal ann={ann} items={list} variant={variant} />}
    </>
  );
}

/* ── 置中彈出視窗：完整內容＋上一則／下一則 ───────────────────────────────── */
function AnnouncementModal({ ann, items, variant }) {
  const list = items || ann.sorted;
  const i = list.findIndex((a) => a.id === ann.openId);
  if (i < 0) return null;
  return <AnnouncementModalBox ann={ann} list={list} index={i} variant={variant} />;
}

function AnnouncementModalBox({ ann, list, index, variant }) {
  const a = list[index];
  const prev = list[index - 1] || null;
  const next = list[index + 1] || null;
  const box = useRef(null);

  // 開啟時鎖住背景捲動、焦點移進視窗；關閉時還原
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    box.current?.focus();
    return () => { document.body.style.overflow = before; };
  }, []);

  // Esc 關閉；Tab 鎖在視窗內
  const onKeyDown = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); ann.closeItem(); return; }
    if (e.key !== "Tab" || !box.current) return;
    const f = [...box.current.querySelectorAll("button:not([disabled]),a[href]")];
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0], lastEl = f[f.length - 1], cur = document.activeElement;
    if (e.shiftKey && (cur === first || cur === box.current)) { e.preventDefault(); lastEl.focus(); }
    else if (!e.shiftKey && cur === lastEl) { e.preventDefault(); first.focus(); }
  };

  // ⚠️ 要跳出 .wrap 的堆疊環境（position:relative + z-index），否則視窗的 z-index 只在那層裡比大小，
  // 右下角固定的「登出」按鈕會浮在遮罩之上還點得到 —— 學員讀公告時誤按就直接登出。
  // 但**不能 portal 到 body**：儀表板的主題變數（--card／--bg2／--gold）定義在 .hub 上，
  // 搬出去就全部解析不到，視窗底色會變透明。所以掛在 .hub 本身，兩個問題一起解決。
  if (typeof document === "undefined") return null;
  const host = document.querySelector(".hub") || document.body;
  return createPortal(
    <div className="ann-modal-bd" data-variant={variant} onClick={ann.closeItem}>
      <div
        className="ann-modal" role="dialog" aria-modal="true" aria-labelledby={`ann-ttl-${a.id}`}
        tabIndex={-1} ref={box} onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}
      >
        <div className="ann-hd">
          <div className="ann-meta">
            <span>{fmtDate(a.created_at)}（{fmtWd(a.created_at)}）</span>
            {a.pinned && <span className="ann-tag">置頂</span>}
            {a.important && <span className="ann-tag imp">重要</span>}
          </div>
          <h3 id={`ann-ttl-${a.id}`}>{a.title}</h3>
          <button type="button" className="ann-x" aria-label="關閉公告" onClick={ann.closeItem}>×</button>
        </div>
        <div className="ann-bd"><Md body={a.body} className={variant === "hub" ? "" : "light"} /></div>
        <div className="ann-ft">
          <button type="button" disabled={!prev} onClick={() => prev && ann.openItem(prev.id)}>← 上一則</button>
          <span className="ann-idx">{index + 1} / {list.length}</span>
          <button type="button" disabled={!next} onClick={() => next && ann.openItem(next.id)}>下一則 →</button>
        </div>
      </div>
    </div>,
    host
  );
}

/* ── 播放頁：右側抽屜（全部公告清單） ─────────────────────────────────────── */
export function AnnouncementsDrawer({ ann }) {
  const ref = useRef(null);
  // 點外面或按 Esc 就收起來（下拉選單的慣例；沒有遮罩，不擋住底下的操作）
  // 彈窗開著時不處理外點／Esc：視窗 portal 在 .hub／body 上，點視窗裡面會被誤判成「點到下拉外面」，
  // 把下拉連同視窗一起關掉（讀到一半就消失）。Esc 交給視窗自己關。
  useEffect(() => {
    if (!ann.open) return;
    const onDown = (e) => { if (ann.openId) return; if (!ref.current?.contains(e.target) && !e.target.closest?.("[data-ann-bell]")) ann.closeDrawer(); };
    const onKey = (e) => { if (e.key === "Escape" && !ann.openId) ann.closeDrawer(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [ann.open, ann.openId, ann]);

  if (!ann.sorted.length) return null;
  return (
    <>
    {/* 樣式在這層注入：提示條「查看」開彈窗時下拉可能收著（AnnouncementList 沒掛），彈窗也要有樣式 */}
    <style>{ANN_CSS}</style>
    {ann.open && (
    <div ref={ref} role="dialog" aria-label="課程公告" className="ann-dd" style={{ fontFamily: F }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #f1f5f9", position: "sticky", top: 0, background: "#fff" }}>
        <h3 style={{ margin: 0, fontSize: 14.5 }}>課程公告</h3>
        <button type="button" onClick={ann.closeDrawer} aria-label="關閉公告清單" style={{ background: "none", border: "none", fontSize: 18, color: "#94a3b8", cursor: "pointer", lineHeight: 1 }}>×</button>
      </div>
      <div style={{ padding: "10px 12px 14px" }}>
        <AnnouncementList ann={ann} withModal={false} />
      </div>
    </div>
    )}
    {/* 彈窗獨立於下拉：提示條「查看」在下拉收著時也開得了；下拉收起也不會把視窗一起關掉 */}
    <AnnouncementModal ann={ann} />
    </>
  );
}

/* ── 重要公告卡片：進教室先彈，按「知道了」才關；variant="hub" 用音樂廳色票 ───── */
export function ImportantDialog({ ann, variant = "light" }) {
  const a = ann.important;
  if (!a) return null;
  const hub = variant === "hub";
  const card = hub
    ? { background: "var(--card-a)", color: "var(--ink)", border: "1px solid var(--line)" }
    : { background: "#fff", color: "#0f172a" };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", display: "grid", placeItems: "center", padding: 20, zIndex: 1100, fontFamily: F }}>
      <style>{MD_CSS}</style>
      <div role="alertdialog" aria-label={a.title} style={{ ...card, borderRadius: 16, maxWidth: 440, width: "100%", padding: "26px 28px 22px", boxShadow: "0 30px 80px -30px rgba(15,23,42,0.6)" }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: hub ? "var(--cta-ink)" : "#b45309", background: hub ? "var(--gold)" : "#fef3c7", display: "inline-block", padding: "3px 9px", borderRadius: 100 }}>重要公告</span>
        <h3 style={{ margin: "12px 0 4px", fontSize: 19, lineHeight: 1.35, textWrap: "balance" }}>{a.title}</h3>
        <div style={{ fontSize: 12, color: hub ? "var(--ink-faint)" : "#64748b", fontVariantNumeric: "tabular-nums" }}>{fmtDate(a.created_at)}（{fmtWd(a.created_at)}）· InRecord 音樂教室</div>
        <Md body={a.body} className={hub ? "" : "light"} />
        <button type="button" onClick={() => ann.ack(a.id)} style={{ marginTop: 16, width: "100%", background: hub ? "var(--cta-bg)" : "#1d4ed8", color: hub ? "var(--cta-ink)" : "#fff", border: "none", borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: F }}>知道了</button>
        <div style={{ textAlign: "center", fontSize: 11.5, color: hub ? "var(--ink-faint)" : "#94a3b8", marginTop: 8 }}>按下後不會再彈出，之後可在公告清單回看</div>
      </div>
    </div>
  );
}

/* ── 儀表板（音樂廳）：「最新公告」區，最多 3 則，點下去開同一個視窗 ───────── */
export function HubAnnouncements({ ann }) {
  const [showAll, setShowAll] = useState(false);
  if (!ann.sorted.length) return null;
  const list = showAll ? ann.sorted : ann.sorted.slice(0, 3);
  return (
    <>
      <div className="sect-t">最新公告
        {ann.sorted.length > 3 && (
          <button type="button" className="more" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "收起" : `全部公告（${ann.sorted.length}）→`}
          </button>
        )}
      </div>
      <AnnouncementList ann={ann} items={list} variant="hub" />
    </>
  );
}
