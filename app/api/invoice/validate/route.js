import { NextResponse } from "next/server";
import { verifyCarrier, verifyTaxId } from "@/lib/amego-verify";
import { isValidTaxId, isValidMobileBarcode } from "@/lib/invoice-fields";
import { createDistributedLimiter, clientIp } from "@/lib/rate-limit";

// 公開端點：每 IP 每分鐘 20 次，擋匿名枚舉 / 上游 API 配額濫用。
// 有 Upstash env → 全域精準限流；否則自動退回單機記憶體限流。
const limiter = createDistributedLimiter({ limit: 20, windowMs: 60_000, prefix: "rl:invoice-validate" });

// 前端即時驗證：{ type:"mobile"|"company", value } → { valid, name?, error? }
export async function POST(req) {
  try {
    const rl = await limiter(clientIp(req));
    if (!rl.allowed) {
      return NextResponse.json(
        { valid: false, error: "rate_limited" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
      );
    }

    const { type, value } = await req.json();
    const v = String(value || "").trim();
    if (!v) return NextResponse.json({ valid: false, error: "empty" }, { status: 400 });

    if (type === "mobile") {
      const barcode = v.toUpperCase();
      // 格式預檢：不符就直接回，不外呼 Amego
      if (!isValidMobileBarcode(barcode)) {
        return NextResponse.json({ valid: false, error: "invalid_format" });
      }
      const r = await verifyCarrier(barcode);
      return NextResponse.json(r);
    }
    if (type === "company") {
      // 格式 + 檢查碼預檢：不符就直接回，不外呼 g0v
      if (!isValidTaxId(v)) {
        return NextResponse.json({ valid: false, error: "invalid_format" });
      }
      const r = await verifyTaxId(v);
      return NextResponse.json(r);
    }
    return NextResponse.json({ valid: false, error: "invalid_type" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ valid: true, degraded: true, error: err.message });
  }
}
