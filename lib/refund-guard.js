// 退款撤存取的判定純函式（route 只做 DB I/O，決策邏輯抽出便於測試）。

// 訂單的「實際開通 email」：優先 grant_email（買家指定的開通信箱），否則購買 email。
// 與 grantAccess 開通時用的 email 一致，退款撤存取才會對到同一列 enrollment。
export function effectiveEmail(order) {
  return order?.grant_email || order?.email || null;
}

// 該訂單的 email 名下，除了自己之外是否還有其他「有效(paid) 的 course/bundle」訂單。
// 有 → 別的單還撐著課程存取，退款時不可撤 enrollment；沒有 → 可安全撤。
// （enrollments 用 upsert onConflict(email,course_id)，同 email 只有一列，故不能靠 order_id 判斷。）
export function hasOtherPaidCourseAccess(currentOrder, paidCourseOrders) {
  const email = effectiveEmail(currentOrder);
  if (!email) return false;
  return (paidCourseOrders || []).some(
    (o) => o.id !== currentOrder?.id && effectiveEmail(o) === email
  );
}
