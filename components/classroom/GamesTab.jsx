"use client";
import { useState, useEffect } from "react";
import { freshToken, getDeviceId, F } from "./shared";

/* ── GamesTab ────────────────────────────────────────────────────────────────── */
export default function GamesTab({ token, hasSubscription, video, gameCache, pendingGameId, onPendingConsumed }) {
  const [games, setGames]               = useState([]);
  const [selectedGame, setSelectedGame] = useState(null);
  const [gameContent, setGameContent]   = useState(null);
  const [gameLoading, setGameLoading]   = useState(false);
  const [gameError, setGameError]       = useState("");
  const [listLoading, setListLoading]   = useState(false);

  const videoId = video?.id;

  useEffect(() => {
    setSelectedGame(null); setGameContent(null); setGames([]);
    if (!hasSubscription || !token || !videoId) return;
    const cacheKey = `list:${videoId}`;
    if (gameCache?.current[cacheKey]) {
      setGames(gameCache.current[cacheKey]);
      return;
    }
    let cancelled = false;
    setListLoading(true);
    (async () => {
      try {
        const tk = await freshToken(token); // 取當下最新 token，避免頁面開久後 401 導致誤判「此單元暫無遊戲」
        const r = await fetch(`/api/classroom/games?video_id=${videoId}`, { headers: { Authorization: `Bearer ${tk}` } });
        if (!r.ok) return; // 失敗不快取、不覆蓋，避免一次 500 把空清單快取成「此單元暫無遊戲」
        const { games } = await r.json();
        const list = games || [];
        if (gameCache) gameCache.current[cacheKey] = list;
        if (!cancelled) setGames(list);
      } catch {}
      finally { if (!cancelled) setListLoading(false); }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 刻意只依 id／token 等穩定值觸發，避免物件參考變動造成重跑（2026-08-25 影片每小時重載的教訓）
  }, [hasSubscription, token, videoId]);

  // 從側欄點特定遊戲進來：等清單載好再選中。
  // 只有命中才消耗 pending——切換單元的那一輪 games 還是舊單元的清單，
  // 這時無條件消耗會把 pending 清掉，等新清單載入時就永遠選不到了。
  useEffect(() => {
    if (!pendingGameId || !games.length) return;
    const hit = games.find(g => g.id === pendingGameId);
    if (!hit) return;
    setSelectedGame(hit);
    onPendingConsumed?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 刻意只依 id／token 等穩定值觸發，避免物件參考變動造成重跑（2026-08-25 影片每小時重載的教訓）
  }, [pendingGameId, games]);

  useEffect(() => {
    if (!selectedGame) return;
    if (selectedGame.game_type === "url") { setGameError(""); setGameContent(selectedGame); return; }
    if (gameCache?.current[selectedGame.id]) {
      setGameError("");
      setGameContent(gameCache.current[selectedGame.id]);
      return;
    }
    let cancelled = false; // 避免快速切換遊戲時，較慢回來的舊請求覆蓋新選遊戲的內容
    setGameLoading(true);
    setGameContent(null);
    setGameError("");
    freshToken(token).then(tk => fetch(`/api/classroom/games?id=${selectedGame.id}&device_id=${getDeviceId()}`, {
      headers: { Authorization: `Bearer ${tk}` },
    }))
      .then(async r => {
        if (r.status === 403) {
          const d = await r.json().catch(() => ({}));
          if (d.error === "device_limit") {
            if (!cancelled) setGameError(`已達裝置上限（${d.limit} 台）。請在其他常用裝置登出遊戲，或聯繫客服。`);
          }
          return null;
        }
        return r.json();
      })
      .then(data => {
        if (!data) return;
        const game = data.game;
        if (game && gameCache) gameCache.current[selectedGame.id] = game;
        if (!cancelled) setGameContent(game || null);
      })
      .catch(() => { if (!cancelled) setGameContent(null); })
      .finally(() => { if (!cancelled) setGameLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 刻意只依 id／token 等穩定值觸發，避免物件參考變動造成重跑（2026-08-25 影片每小時重載的教訓）
  }, [selectedGame, token]);

  if (!hasSubscription) {
    // 所有在賣方案皆含遊戲 → 已購課者理論上必有存取；會走到這裡多半是資料未同步或載入異常。
    // 不再顯示「前往購買」死 CTA（會導去重買整包），改為誠實的引導。
    return (
      <div style={{ textAlign: "center", padding: "40px 20px" }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>🔒</div>
        <h3 style={{ margin: "0 0 8px", fontFamily: "var(--type-display)", fontSize: 22, fontWeight: 500, color: "#0f172a", letterSpacing: "-.01em" }}>
          遊戲存取尚未生效
        </h3>
        <p style={{ color: "#475569", margin: "0 0 20px", fontSize: 14, lineHeight: 1.7 }}>
          你的方案包含互動遊戲。若看到此畫面，請先重新整理頁面；<br />仍未開通的話，聯繫我們幫你處理。
        </p>
        <button onClick={() => window.location.reload()} style={{
          background: "#2563eb", color: "#fff", padding: "10px 22px", border: 0,
          borderRadius: 980, fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: F,
        }}>重新整理</button>
      </div>
    );
  }

  if (selectedGame) {
    const isUrlGame = selectedGame.game_type === "url";
    const closeGame = () => { setSelectedGame(null); setGameContent(null); };
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "#000", display: "flex", flexDirection: "column",
      }}>
        {/* Title bar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
          padding: "10px 16px", background: "#1c1c1e",
        }}>
          <button
            onClick={closeGame}
            style={{
              background: "rgba(255,255,255,0.12)", border: 0, cursor: "pointer",
              color: "#fff", fontSize: 13, fontWeight: 500, padding: "6px 14px",
              borderRadius: 980, fontFamily: F, lineHeight: 1,
            }}
          >
            ← 返回
          </button>
          <span style={{ color: "#f5f5f7", fontSize: 14, fontWeight: 600, fontFamily: F }}>
            🎮 {selectedGame.title}
          </span>
          {selectedGame.game_type === "url" && (
            <span style={{ marginLeft: 8, fontSize: 11, background: "#dbeafe", color: "#1d4ed8", padding: "2px 8px", borderRadius: 980, fontWeight: 600 }}>試玩</span>
          )}
        </div>
        {/* Game content */}
        {gameError ? (
          <div style={{ flex: 1, display: "grid", placeItems: "center", padding: "40px 20px", textAlign: "center" }}>
            <div>
              <div style={{ fontSize: 52, marginBottom: 16 }}>🔒</div>
              <p style={{ color: "#e2e8f0", fontSize: 15, lineHeight: 1.7, margin: 0, maxWidth: 320 }}>{gameError}</p>
            </div>
          </div>
        ) : isUrlGame ? (
          /* 外部遊戲頁一律沙箱隔離：不給 allow-same-origin（避免存取本站同源資料）、
             不給 allow-top-navigation（避免把學員導去外部頁面）。 */
          <iframe
            src={selectedGame.external_url}
            allow="autoplay; fullscreen"
            sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="no-referrer"
            style={{ flex: 1, border: 0, display: "block", width: "100%" }}
            title={selectedGame.title}
          />
        ) : gameLoading ? (
          <div style={{ flex: 1, display: "grid", placeItems: "center" }}>
            <div style={{
              width: 28, height: 28, border: "2.5px solid rgba(255,255,255,0.15)",
              borderTopColor: "#2563eb", borderRadius: "50%",
              animation: "spin .7s linear infinite",
            }} />
          </div>
        ) : (
          <iframe
            srcDoc={gameContent?.html_content || "<div style='display:grid;place-items:center;height:100vh;font-family:system-ui;color:#64748b'>遊戲內容即將上線</div>"}
            sandbox="allow-scripts allow-forms"
            style={{ flex: 1, border: 0, display: "block", width: "100%" }}
            title={selectedGame.title}
          />
        )}
      </div>
    );
  }

  if (listLoading) {
    return (
      <div style={{ display: "grid", placeItems: "center", padding: 48 }}>
        <div style={{
          width: 24, height: 24, border: "2.5px solid rgba(0,0,0,0.08)",
          borderTopColor: "#2563eb", borderRadius: "50%",
          animation: "spin .7s linear infinite",
        }} />
      </div>
    );
  }

  if (!games.length) {
    return (
      <div style={{ textAlign: "center", padding: "40px 20px" }}>
        <div style={{ fontSize: 52, marginBottom: 14 }}>🎮</div>
        <p style={{ fontWeight: 600, color: "#0f172a", fontSize: 16, margin: "0 0 6px" }}>此單元暫無遊戲</p>
        <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>已開通，更多遊戲陸續上線中</p>
      </div>
    );
  }

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
      gap: 12,
    }}>
      {games.map(game => (
        <button key={game.id} onClick={() => setSelectedGame(game)}
          style={{
            border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: "18px 12px",
            background: "#f1f5f9", cursor: "pointer", textAlign: "center", fontFamily: F,
            transition: "background .12s, box-shadow .12s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(37,99,235,0.06)"; e.currentTarget.style.boxShadow = "0 2px 12px rgba(37,99,235,0.12)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#f1f5f9"; e.currentTarget.style.boxShadow = "none"; }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎮</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", lineHeight: 1.4 }}>{game.title}</div>
          {game.game_type === "url" && (
            <span style={{ display: "inline-block", marginTop: 6, fontSize: 11, background: "#dbeafe", color: "#1d4ed8", padding: "2px 8px", borderRadius: 980, fontWeight: 600 }}>試玩</span>
          )}
        </button>
      ))}
    </div>
  );
}
