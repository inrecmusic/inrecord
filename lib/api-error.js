import { NextResponse } from "next/server";

// 統一伺服器端錯誤回應：友善代碼回前端、原始細節只寫進 server log。
// Supabase error.message 常含欄位名／約束名等實作細節（甚至 PII），不應直接回前端。
// 用法：if (err) return serverError(err);  或帶語意代碼 serverError(err, "load_failed")。
export function serverError(detail, code = "server_error") {
  if (detail) console.error(`[api] ${code}:`, detail?.message || detail);
  return NextResponse.json({ error: code }, { status: 500 });
}
