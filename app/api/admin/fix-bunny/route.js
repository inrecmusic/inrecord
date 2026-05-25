import { NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/adminAuth";

// One-time endpoint to fix Bunny Stream allowed referrers
export async function POST(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const libraryId = process.env.NEXT_PUBLIC_BUNNY_LIBRARY_ID;
  const apiKey    = process.env.BUNNY_API_KEY;

  if (!libraryId || !apiKey) {
    return NextResponse.json({ error: "missing env vars", libraryId: !!libraryId, apiKey: !!apiKey }, { status: 500 });
  }

  // Get current settings
  const getRes = await fetch(`https://video.bunnycdn.com/library/${libraryId}`, {
    headers: { AccessKey: apiKey },
  });
  const library = await getRes.json();

  const current = library.AllowedReferrers || [];
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://inrecord-swart.vercel.app";
  const domain  = new URL(siteUrl).hostname;

  if (current.includes(domain)) {
    return NextResponse.json({ ok: true, message: "already_set", current });
  }

  const updated = [...current, domain];
  const patchRes = await fetch(`https://video.bunnycdn.com/library/${libraryId}`, {
    method: "POST",
    headers: { AccessKey: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ AllowedReferrers: updated }),
  });

  if (!patchRes.ok) {
    const err = await patchRes.text();
    return NextResponse.json({ error: "bunny_api_failed", detail: err }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "fixed", previous: current, now: updated });
}
