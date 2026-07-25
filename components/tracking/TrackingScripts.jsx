import Script from "next/script";
import { metaSnippet, googleConfigSnippet, lineSnippet } from "@/lib/tracking";

// platforms = getTrackingSettings() 的輸出（enabledPlatforms）
export default function TrackingScripts({ platforms }) {
  const { meta, ga4, googleAds, line } = platforms || {};
  const googleLoaderId = ga4?.id || googleAds?.id;
  return (
    <>
      {meta?.id && (
        <Script id="meta-pixel" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: metaSnippet(meta.id) }} />
      )}
      {googleLoaderId && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${googleLoaderId}`} strategy="afterInteractive" />
          <Script id="google-gtag" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: googleConfigSnippet({ ga4Id: ga4?.id, adsId: googleAds?.id }) }} />
        </>
      )}
      {line?.id && (
        <Script id="line-tag" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: lineSnippet(line.id) }} />
      )}
    </>
  );
}
