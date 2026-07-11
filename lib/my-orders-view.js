// lib/my-orders-view.js — 學員「我的訂單」呈現純邏輯。

const STATUS_MAP = {
  paid: "已付款",
  pending: "待付款",
  refunded: "已退款",
  expired: "已逾期",
  failed: "付款失敗",
};

export function statusLabel(status) {
  return STATUS_MAP[status] || "—";
}

export function invoiceText(invoiceNo) {
  return invoiceNo ? `發票號碼 ${invoiceNo}（已寄至你的信箱）` : "發票尚未開立";
}

export function sortOrdersDesc(list) {
  return (list || []).slice().sort((a, b) =>
    String(b.created_at || "").localeCompare(String(a.created_at || ""))
  );
}
