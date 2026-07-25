"use client";
import { useEffect } from "react";
import { trackEvent, trackGoogleAdsConversion, trackLineConversion } from "@/lib/track-event";

export default function PurchaseTracking({ transactionId, value, currency = "TWD", contentIds, googleAdsSendTo, lineTagId }) {
  useEffect(() => {
    if (!transactionId || value == null) return;
    const key = `ir_purchase_fired:${transactionId}`;
    try { if (localStorage.getItem(key)) return; } catch {}
    trackEvent("Purchase", { value, currency, contentIds, transactionId });
    if (googleAdsSendTo) trackGoogleAdsConversion({ sendTo: googleAdsSendTo, value, currency, transactionId });
    if (lineTagId) trackLineConversion(lineTagId);
    try { localStorage.setItem(key, "1"); } catch {}
  }, [transactionId, value, currency, contentIds, googleAdsSendTo, lineTagId]);
  return null;
}
