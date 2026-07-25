"use client";
import { groupBySource } from "@/lib/attribution-report";

export default function SourceAttributionTable({ orders }) {
  const rows = groupBySource(orders || []);
  const th = { textAlign: "left", padding: "8px 10px", fontSize: 12, color: "#64748b", borderBottom: "1px solid #e2e8f0" };
  const td = { padding: "8px 10px", fontSize: 14, borderBottom: "1px solid #f1f5f9" };
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, marginTop: 16, wordBreak: "keep-all", lineBreak: "strict" }}>
      <strong style={{ fontSize: 15 }}>廣告來源歸因（依訂單 UTM）</strong>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
        <thead><tr><th style={th}>來源 / 活動</th><th style={th}>訂單數</th><th style={th}>營收</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td style={td} colSpan={3}>尚無資料</td></tr>}
          {rows.map((r) => (
            <tr key={r.source}>
              <td style={td}>{r.source}</td>
              <td style={td}>{r.orders}</td>
              <td style={td}>${r.revenue.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>營收為訂單金額加總；Phase 2 接廣告花費後即可對接算 ROAS。</div>
    </div>
  );
}
