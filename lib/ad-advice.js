// lib/ad-advice.js — 廣告建議：由程式依規則產生（純函式，可測），不交給模型「判斷」。
//
// 為什麼規則寫在程式裡：預算是真金白銀，建議的門檻與算式要看得見、可被質疑、可被測試。
// 模型只負責把這些結論寫成人話（週報），日報則完全不經過模型。
//
// 口徑一律用 trueRoas（真實訂單營收 ÷ 花費），不用 Meta 自報的 metaRoas——後者會把
// 「看過廣告後自己搜尋進來」也算成廣告轉換，通常比實際樂觀。

const round = (n, d = 2) => Number((Number(n) || 0).toFixed(d));

// 末端連續「當日 ROAS < 1」的天數（trend 是最近 7 天的每日 ROAS，舊→新）。
// 只看末端連續，避免「上週爛、這兩天已回穩」的活動被誤判。
export function losingStreak(trend = []) {
  let n = 0;
  for (let i = trend.length - 1; i >= 0; i--) {
    const v = Number(trend[i]);
    if (!Number.isFinite(v) || v >= 1) break;
    n += 1;
  }
  return n;
}

// 冷啟動停損門檻（2026-09 定案）：素材測試期成交數太少，用 ROAS 判斷會誤殺。
// 這階段改看「有沒有帶來名單（留信箱）」，規則與對外講的一致：
//   花到 KILL_SPEND_NO_LEAD 元還 0 個名單 → 關掉
//   有名單但每個成本超過 LEAD_COST_CEILING → 落地頁或受眾要調
// leads 由呼叫端提供（Meta 的 Lead 轉換數）；沒有這個數字時整段不套用，不亂猜。
export const KILL_SPEND_NO_LEAD = 1000;
export const LEAD_COST_CEILING = 150;

// 單一活動的建議。minSpend：花費太少時樣本不足，不下結論（免得剛開跑就被叫停）。
// coldStart=true：期間內總成交數太少（見 adAdvice），改用名單門檻判斷而非 ROAS。
export function campaignAdvice(c, { targetRoas = 3, minSpend = 300, coldStart = false } = {}) {
  const spend = Number(c?.spend) || 0;
  const revenue = Number(c?.revenue) || 0;
  const orders = Number(c?.orders) || 0;
  const roas = Number(c?.trueRoas) || 0;
  const name = c?.campaign_name || c?.campaign_id || "未命名活動";
  const net = round(revenue - spend, 0);
  const streak = losingStreak(c?.trend);

  if (spend < minSpend) {
    return { campaign_id: c?.campaign_id, name, level: "low", action: "observe",
      text: `花費 NT$${round(spend, 0)} 樣本還不夠，先觀察不調整。` };
  }
  // 冷啟動：成交數還太少，用名單（Meta Lead 轉換）判斷素材行不行
  const leads = Number(c?.metaConversions) || 0;
  if (coldStart) {
    if (leads === 0 && spend >= KILL_SPEND_NO_LEAD) {
      return { campaign_id: c?.campaign_id, name, level: "high", action: "pause",
        text: `花了 NT$${round(spend, 0)} 但 0 個名單，已超過 NT$${KILL_SPEND_NO_LEAD} 停損線，建議關閉這組素材。` };
    }
    const costPerLead = leads ? spend / leads : 0;
    if (leads > 0 && costPerLead > LEAD_COST_CEILING) {
      return { campaign_id: c?.campaign_id, name, level: "medium", action: "reduce",
        text: `每個名單 NT$${round(costPerLead, 0)}，高於 NT$${LEAD_COST_CEILING} 上限（${leads} 個名單、花 NT$${round(spend, 0)}），建議換素材或縮受眾。` };
    }
    if (leads > 0) {
      return { campaign_id: c?.campaign_id, name, level: "low", action: "keep",
        text: `每個名單 NT$${round(costPerLead, 0)} 在門檻內（${leads} 個名單），成交數還不足以看 ROAS，先維持。` };
    }
    return { campaign_id: c?.campaign_id, name, level: "low", action: "observe",
      text: `花 NT$${round(spend, 0)}、還沒有名單，未達 NT$${KILL_SPEND_NO_LEAD} 停損線，再觀察。` };
  }
  if (orders === 0) {
    return { campaign_id: c?.campaign_id, name, level: "high", action: "pause",
      text: `花了 NT$${round(spend, 0)} 但 0 筆成交，建議先暫停，檢查受眾與素材，或確認廣告網址的 utm_campaign 有對到活動名稱。` };
  }
  if (roas < 1) {
    return { campaign_id: c?.campaign_id, name, level: "high", action: "pause",
      text: `ROAS ${round(roas)}（花 NT$${round(spend, 0)}、收 NT$${round(revenue, 0)}，淨損 NT$${Math.abs(net)}）${streak >= 3 ? `，且已連續 ${streak} 天低於 1` : ""}，建議暫停或大幅降預算。` };
  }
  if (roas < targetRoas) {
    return { campaign_id: c?.campaign_id, name, level: "medium", action: "reduce",
      text: `ROAS ${round(roas)} 低於目標 ${targetRoas}，每筆成交成本 NT$${round(c?.cpa, 0)}，建議降預算或換素材再觀察。` };
  }
  if (roas >= targetRoas * 1.5) {
    return { campaign_id: c?.campaign_id, name, level: "low", action: "scale",
      text: `ROAS ${round(roas)} 明顯高於目標 ${targetRoas}，每筆成交成本 NT$${round(c?.cpa, 0)}，可考慮加碼預算。` };
  }
  return { campaign_id: c?.campaign_id, name, level: "low", action: "keep",
    text: `ROAS ${round(roas)} 達標，維持現況即可。` };
}

// 預算配置建議：把「該減碼的花費」挪到表現最好的活動，能多帶多少營收（同 ROAS 的粗估）。
// 只是估算，用來說明「值不值得搬」，不是保證值——搬過去的預算不一定維持同樣效率。
export function reallocation(campaigns = [], advices = [], { minSpend = 300 } = {}) {
  const byId = new Map(campaigns.map((c) => [c.campaign_id, c]));
  const cut = advices.filter((a) => a.action === "pause" || a.action === "reduce");
  const freed = cut.reduce((s, a) => s + (Number(byId.get(a.campaign_id)?.spend) || 0), 0);
  const winners = campaigns.filter((c) => (Number(c.spend) || 0) >= minSpend && (Number(c.trueRoas) || 0) > 0)
    .sort((a, b) => b.trueRoas - a.trueRoas);
  const best = winners[0] || null;
  if (!best || freed <= 0) return null;
  return {
    freed: round(freed, 0),
    to: best.campaign_name || best.campaign_id,
    toRoas: round(best.trueRoas),
    estRevenue: round(freed * best.trueRoas, 0),
    from: cut.map((a) => a.name),
  };
}

// 判斷是否還在冷啟動：期間內總成交少於這個數，ROAS 的樣本不足、容易誤殺好素材。
export const COLD_START_ORDERS = 5;

// 整份建議（日報與週報共用）。report 為 buildAdReport 的輸出。
export function adAdvice(report, { targetRoas = 3, minSpend = 300 } = {}) {
  const campaigns = (report?.campaigns || []).filter((c) => (Number(c.spend) || 0) > 0);
  if (!campaigns.length) return null;
  const totalOrders = Number(report?.totals?.orders) || 0;
  const coldStart = totalOrders < COLD_START_ORDERS;
  const items = campaigns.map((c) => campaignAdvice(c, { targetRoas, minSpend, coldStart }));
  const order = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => order[a.level] - order[b.level]);
  return {
    target_roas: targetRoas,
    // cold_start：告訴讀者「這些建議是用名單成本而不是 ROAS 判斷的」，免得誤會標準寬鬆
    cold_start: coldStart,
    cold_start_note: coldStart
      ? `期間內成交 ${totalOrders} 筆（少於 ${COLD_START_ORDERS} 筆），ROAS 樣本不足，改用名單成本判斷：花到 NT$${KILL_SPEND_NO_LEAD} 還 0 名單就關、每個名單超過 NT$${LEAD_COST_CEILING} 要調整。`
      : null,
    items,
    reallocation: reallocation(campaigns, items, { minSpend }),
    counts: {
      pause: items.filter((i) => i.action === "pause").length,
      reduce: items.filter((i) => i.action === "reduce").length,
      scale: items.filter((i) => i.action === "scale").length,
    },
  };
}
