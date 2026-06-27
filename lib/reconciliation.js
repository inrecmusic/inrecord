import { LEAD_SOURCES } from "./admin-leads.js";

// 期間財務彙整（純函式）。訂單為單一狀態：退款後 status 變 refunded、已不在 paid，
// 故「有效收款 = paid 金額合計」，不做 paid−refund 相減。failed/cancelled 不計。
// 發票統計只算「自家來源」：外部名單(wordpress 碩樂 / concert) 由各站自行開發票，
// InRecord 不負責，故不計入 issued/missing（但營收/課程銷售仍計）。
export function summarizeOrders(orders = [], catalog = {}) {
  const r = {
    paid:      { count: 0, amount: 0 },
    refunded:  { count: 0, amount: 0 },
    pending:   { count: 0 },
    byPayType: {},
    invoice:   { issued: 0, missing: 0 },
    coupon:    { count: 0, discount: 0 },
  };

  for (const o of orders) {
    // 手動開通(source='manual', amount=0) 非真實收款，排除以免混淆有效收款統計
    if (o.source === "manual") continue;

    const status = o.status || "pending";
    const amount = Number(o.amount) || 0;

    if (status === "paid") {
      r.paid.count++;
      r.paid.amount += amount;

      const pt = o.pay_type || "未知";
      if (!r.byPayType[pt]) r.byPayType[pt] = { count: 0, amount: 0 };
      r.byPayType[pt].count++;
      r.byPayType[pt].amount += amount;

      // 外部來源(wordpress/concert) 的單由各站自行開發票，不計入 InRecord 發票統計
      if (!LEAD_SOURCES.includes(o.source)) {
        if (o.invoice_no) r.invoice.issued++;
        else r.invoice.missing++;
      }

      if (o.coupon_code) {
        r.coupon.count++;
        const orig = catalog[o.plan]?.price ?? amount;
        r.coupon.discount += Math.max(0, orig - amount);
      }
    } else if (status === "refunded") {
      r.refunded.count++;
      r.refunded.amount += amount;
    } else if (status === "pending") {
      r.pending.count++;
    }
  }

  return r;
}
