// Bunny 帳單摘要純函式：GET https://api.bunny.net/billing 的回傳 → 後台「訂閱費用」Bunny 列要顯示的欄位。
// 金額為美元；MonthlyBandwidthUsed 為 bytes，Bunny 以十進位 GB 計價，故除以 1e9。
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function summarizeBilling(billing = {}, now = new Date()) {
  return {
    thisMonthCharges: num(billing.ThisMonthCharges),
    balance: num(billing.Balance),
    storageCharges: num(billing.MonthlyChargesStorage),
    bandwidthGB: Math.round((num(billing.MonthlyBandwidthUsed) / 1e9) * 100) / 100,
    fetchedAt: now.toISOString(),
  };
}
