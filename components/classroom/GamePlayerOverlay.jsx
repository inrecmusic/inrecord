"use client";
import { useState, useEffect } from "react";
import { freshToken, getDeviceId, F } from "./shared";

// 全螢幕遊戲視窗。播放頁的遊戲分頁與學員中心「遊戲間」共用，
// 學員從哪裡點進來都是同一套載入、裝置上限與沙箱設定。
export default function GamePlayerOverlay({ game, token, onClose, cache }) {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const gameId = game?.id;
  const isUrlGame = game?.game_type === "url";

  useEffect(() => {
    if (!gameId) return;
    if (isUrlGame) { setError(""); setContent(game); return; }
    if (cache?.current[gameId]) { setError(""); setContent(cache.current[gameId]); return; }

    let cancelled = false; // 避免快速切換遊戲時，較慢回來的舊請求覆蓋新選遊戲的內容
    setLoading(true);
    setContent(null);
    setError("");
    freshToken(token).then(tk => fetch(`/api/classroom/games?id=${gameId}&device_id=${getDeviceId()}`, {
      headers: { Authorization: `Bearer ${tk}` },
    }))
      .then(async r => {
        if (r.status === 403) {
          const d = await r.json().catch(() => ({}));
          if (d.error === "device_limit" && !cancelled) setError(`已達裝置上限（${d.limit} 台）。請在其他常用裝置登出遊戲，或聯繫客服。`);
          return null;
        }
        return r.json();
      })
      .then(data => {
        if (!data) return;
        if (data.game && cache) cache.current[gameId] = data.game;
        if (!cancelled) setContent(data.game || null);
      })
      .catch(() => { if (!cancelled) setContent(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 刻意只依 id／token 等穩定值觸發，避免物件參考變動造成重跑（2026-08-25 影片每小時重載的教訓）
  }, [gameId, isUrlGame, token]);

  if (!game) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#000", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0, padding: "10px 16px", background: "#1c1c1e" }}>
        <button
          onClick={onClose}
          style={{
            background: "rgba(255,255,255,0.12)", border: 0, cursor: "pointer",
            color: "#fff", fontSize: 13, fontWeight: 500, padding: "6px 14px",
            borderRadius: 980, fontFamily: F, lineHeight: 1,
          }}
        >
          ← 返回
        </button>
        <span style={{ color: "#f5f5f7", fontSize: 14, fontWeight: 600, fontFamily: F }}>🎮 {game.title}</span>
        {isUrlGame && (
          <span style={{ marginLeft: 8, fontSize: 11, background: "#dbeafe", color: "#1d4ed8", padding: "2px 8px", borderRadius: 980, fontWeight: 600 }}>試玩</span>
        )}
      </div>
      {error ? (
        <div style={{ flex: 1, display: "grid", placeItems: "center", padding: "40px 20px", textAlign: "center" }}>
          <div>
            <div style={{ fontSize: 52, marginBottom: 16 }}>🔒</div>
            <p style={{ color: "#e2e8f0", fontSize: 15, lineHeight: 1.7, margin: 0, maxWidth: 320 }}>{error}</p>
          </div>
        </div>
      ) : isUrlGame ? (
        /* 外部遊戲頁一律沙箱隔離：不給 allow-same-origin（避免存取本站同源資料）、
           不給 allow-top-navigation（避免把學員導去外部頁面）。 */
        <iframe
          src={game.external_url}
          allow="autoplay; fullscreen"
          sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          style={{ flex: 1, border: 0, display: "block", width: "100%" }}
          title={game.title}
        />
      ) : loading ? (
        <div style={{ flex: 1, display: "grid", placeItems: "center" }}>
          <div style={{
            width: 28, height: 28, border: "2.5px solid rgba(255,255,255,0.15)",
            borderTopColor: "#2563eb", borderRadius: "50%", animation: "spin .7s linear infinite",
          }} />
        </div>
      ) : (
        <iframe
          srcDoc={content?.html_content || "<div style='display:grid;place-items:center;height:100vh;font-family:system-ui;color:#64748b'>遊戲內容即將上線</div>"}
          sandbox="allow-scripts allow-forms"
          style={{ flex: 1, border: 0, display: "block", width: "100%" }}
          title={game.title}
        />
      )}
    </div>
  );
}
