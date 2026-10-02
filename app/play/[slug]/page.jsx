import { notFound } from "next/navigation";
import { publicGame } from "@/lib/public-games";
import { getSaleSettings, salePhase } from "@/lib/sale";
import { trialOffer } from "@/lib/trial-offer";
import PlayTrial from "@/components/PlayTrial";

// 公開試玩頁（免登入）：/play/do。白名單外的 slug 直接 404。
// 導購視窗的價格與倒數跟試看頁同一套（trialOffer）；快取比照首頁 60 秒，波段換價時不會報舊價太久——
// 就算剛好卡在截止前算的頁，過了截止 UpsellPanel 也會自己降級成不報價。
export const revalidate = 60;

async function readOffer() {
  try {
    const settings = await getSaleSettings();
    return settings ? trialOffer(salePhase(settings)) : { mode: "none" };
  } catch {
    return { mode: "none" };
  }
}

export function generateMetadata({ params }) {
  const g = publicGame(params?.slug);
  if (!g) return { title: "找不到頁面" };
  return {
    title: `${g.name}｜免費試玩 - InRecord 音樂刻`,
    description: g.blurb,
    alternates: { canonical: `/play/${String(params.slug).toLowerCase()}` },
  };
}

export default async function PlayPage({ params }) {
  const g = publicGame(params?.slug);
  if (!g) notFound();
  const offer = await readOffer();
  return <PlayTrial slug={String(params.slug).toLowerCase()} name={g.name} blurb={g.blurb} game={g} offer={offer} />;
}
