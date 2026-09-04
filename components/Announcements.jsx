"use client";
// 教室公告：儀表板「最新公告」區、播放頁鈴鐺／提示條／抽屜、重要公告卡片。
// 狀態集中在 useAnnouncements（排序、未讀、重要、已讀記憶），各元件只負責畫。
// 沒有公告 → 所有元件都回 null，畫面上什麼都不出現。
import { useEffect, useMemo, useState } from "react";
import { sortAnnouncements, countUnread, pickImportant, pickStrip, isUnread } from "@/lib/announcements-view";
import { announcementHtml } from "@/lib/announcement-md";
import { readAnnouncementState, writeSeen, writeAck, writeStripDismissed } from "@/lib/announcement-state";

const F = "var(--type-body)";
const WD = "日一二三四五六";
const asDate = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : d; };
const fmtDate = (iso) => { const d = asDate(iso); return d ? `${d.getMonth() + 1}/${d.getDate()}` : ""; };
const fmtWd = (iso) => { const d = asDate(iso); return d ? WD[d.getDay()] : ""; };
const firstLine = (s) => String(s ?? "").split(/\r?\n/).find((l) => l.trim()) || "";

// 內容 HTML 已由 announcementHtml 跳脫（只允許受限 Markdown 與 http(s) 連結）
const Md = ({ body, className = "" }) => (
  <div className={`ann-md ${className}`} dangerouslySetInnerHTML={{ __html: announcementHtml(body) }} />
);

export function useAnnouncements(items, { storage } = {}) {
  const store = storage !== undefined ? storage : (typeof window !== "undefined" ? window.localStorage : null);
  const sorted = useMemo(() => sortAnnouncements(items || []), [items]);
  const [state, setState] = useState({ seenAt: null, acked: [], stripDismissed: null });
  const [ready, setReady] = useState(false); // 讀完裝置記憶前不顯示未讀數／提示條，避免閃一下
  const [open, setOpen] = useState(false);

  useEffect(() => { setState(readAnnouncementState(store)); setReady(true); }, [store]);

  const unread = ready ? countUnread(sorted, state.seenAt) : 0;
  const important = ready ? pickImportant(sorted, state.acked) : null;
  const strip = ready ? pickStrip(sorted, state.seenAt, state.stripDismissed) : null;

  const markSeen = () => { const iso = new Date().toISOString(); writeSeen(store, iso); setState((s) => ({ ...s, seenAt: iso })); };
  const ack = (id) => { writeAck(store, id); setState((s) => ({ ...s, acked: [...s.acked, id] })); };
  const dismissStrip = (id) => { writeStripDismissed(store, id); setState((s) => ({ ...s, stripDismissed: id })); };
  const openDrawer = () => setOpen(true);
  const closeDrawer = () => { setOpen(false); markSeen(); };

  return { sorted, unread, important, strip, open, openDrawer, closeDrawer, markSeen, ack, dismissStrip, seenAt: state.seenAt };
}

/* ── 播放頁：頁首鈴鐺 ─────────────────────────────────────────────────────── */
export function AnnouncementsBell({ ann }) {
  if (!ann.sorted.length) return null;
  const n = ann.unread;
  return (
    <button
      type="button" onClick={ann.openDrawer}
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
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 20px", background: "#eff6ff", borderBottom: "1px solid #bfdbfe", fontSize: 13, fontFamily: F }}>
      <span aria-hidden="true">📢</span>
      <span style={{ color: "#1d4ed8", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtDate(a.created_at)}</span>
      <span style={{ color: "#1e3a8a", fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</span>
      <button type="button" onClick={ann.openDrawer} style={{ color: "#1d4ed8", fontWeight: 600, background: "none", border: "none", cursor: "pointer", fontFamily: F, fontSize: 12.5 }}>查看</button>
      <button type="button" onClick={() => ann.dismissStrip(a.id)} aria-label="關閉提示" style={{ color: "#64748b", background: "none", border: "none", fontSize: 18, lineHeight: 1, cursor: "pointer" }}>×</button>
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

/* ── 播放頁：右側抽屜（全部公告） ───────────────────────────────────────────── */
export function AnnouncementsDrawer({ ann }) {
  if (!ann.open || !ann.sorted.length) return null;
  return (
    <div onClick={ann.closeDrawer} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.35)", zIndex: 1000 }}>
      <style>{MD_CSS}</style>
      <aside
        role="dialog" aria-label="課程公告" onClick={(e) => e.stopPropagation()}
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "min(380px, 100%)", background: "#fff", boxShadow: "-12px 0 40px -18px rgba(15,23,42,0.35)", display: "flex", flexDirection: "column", fontFamily: F, color: "#0f172a" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #e2e8f0" }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>課程公告</h3>
          <button type="button" onClick={ann.closeDrawer} aria-label="關閉公告清單" style={{ background: "none", border: "none", fontSize: 20, color: "#64748b", cursor: "pointer" }}>×</button>
        </div>
        <div style={{ overflow: "auto", padding: "6px 0" }}>
          {ann.sorted.map((a) => {
            const unread = isUnread(a, ann.seenAt);
            return (
              <div key={a.id} style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", position: "relative", background: unread ? "#f8fbff" : "transparent" }}>
                {unread && <span aria-hidden="true" style={{ position: "absolute", left: 8, top: 20, width: 6, height: 6, borderRadius: "50%", background: "#2563eb" }} />}
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#64748b", marginBottom: 4, fontVariantNumeric: "tabular-nums" }}>
                  <span>{fmtDate(a.created_at)}（{fmtWd(a.created_at)}）</span>
                  {a.important && <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 100, background: "#fef3c7", color: "#92400e" }}>重要</span>}
                  {a.pinned && <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 100, background: "#eff6ff", color: "#1d4ed8" }}>置頂</span>}
                </div>
                <strong style={{ fontSize: 14 }}>{a.title}</strong>
                <Md body={a.body} className="light" />
              </div>
            );
          })}
        </div>
      </aside>
    </div>
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
        <Md body={a.body} className={hub ? "hub" : "light"} />
        <button type="button" onClick={() => ann.ack(a.id)} style={{ marginTop: 16, width: "100%", background: hub ? "var(--cta-bg)" : "#1d4ed8", color: hub ? "var(--cta-ink)" : "#fff", border: "none", borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: F }}>知道了</button>
        <div style={{ textAlign: "center", fontSize: 11.5, color: hub ? "var(--ink-faint)" : "#94a3b8", marginTop: 8 }}>按下後不會再彈出，之後可在公告清單回看</div>
      </div>
    </div>
  );
}

/* ── 儀表板（音樂廳）：「最新公告」區。樣式在 HUB_CSS（.nt 等），這裡只出結構 ─── */
export function HubAnnouncements({ ann }) {
  const [showAll, setShowAll] = useState(false);
  const [openId, setOpenId] = useState(null);
  if (!ann.sorted.length) return null;
  const list = showAll ? ann.sorted : ann.sorted.slice(0, 3);
  const toggle = (id) => { setOpenId((cur) => (cur === id ? null : id)); ann.markSeen(); };
  return (
    <>
      <div className="sect-t">最新公告
        {ann.sorted.length > 3 && (
          <button type="button" className="more" onClick={() => { setShowAll((v) => !v); ann.markSeen(); }}>
            {showAll ? "收起" : `全部公告（${ann.sorted.length}）→`}
          </button>
        )}
      </div>
      <div className="notices">
        {list.map((a) => {
          const expanded = openId === a.id;
          return (
            <button type="button" key={a.id} className={`nt${a.pinned ? " pinned" : ""}${expanded ? " open" : ""}`} onClick={() => toggle(a.id)} aria-expanded={expanded}>
              <div className="d"><b>{fmtDate(a.created_at)}</b><small>週{fmtWd(a.created_at)}</small></div>
              <div className="body">
                <div className="ttl">
                  {isUnread(a, ann.seenAt) && <span className="dot" aria-label="未讀" />}
                  {a.title}
                  {a.important && <span className="tag imp">重要</span>}
                  {a.pinned && <span className="tag">置頂</span>}
                </div>
                {expanded
                  ? <Md body={a.body} className="hub" />
                  : <div className="ex" dangerouslySetInnerHTML={{ __html: announcementHtml(firstLine(a.body)) }} />}
              </div>
              <div className="go">{expanded ? "收起" : "查看 →"}</div>
            </button>
          );
        })}
      </div>
    </>
  );
}
