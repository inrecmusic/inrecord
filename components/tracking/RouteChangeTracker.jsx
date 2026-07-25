"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { captureAttribution } from "@/lib/attribution";
import { trackEvent } from "@/lib/track-event";

// 首次載入由各 base snippet 自行送 PageView；此元件負責 SPA 換頁補送，並每次擷取 UTM
export default function RouteChangeTracker({ lineTagId }) {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    captureAttribution();
    if (first.current) {
      first.current = false;
      return; // 初次不重複送 PageView
    }
    trackEvent("PageView");
    if (lineTagId && typeof window._lt === "function") window._lt("send", "pv", [lineTagId]);
  }, [pathname, lineTagId]);
  return null;
}
