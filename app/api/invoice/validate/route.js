import { NextResponse } from "next/server";
import { verifyCarrier, verifyTaxId } from "@/lib/amego-verify";

// 前端即時驗證：{ type:"mobile"|"company", value } → { valid, name?, error? }
export async function POST(req) {
  try {
    const { type, value } = await req.json();
    const v = String(value || "").trim();
    if (!v) return NextResponse.json({ valid: false, error: "empty" }, { status: 400 });

    if (type === "mobile") {
      const r = await verifyCarrier(v.toUpperCase());
      return NextResponse.json(r);
    }
    if (type === "company") {
      const r = await verifyTaxId(v);
      return NextResponse.json(r);
    }
    return NextResponse.json({ valid: false, error: "invalid_type" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ valid: true, degraded: true, error: err.message });
  }
}
