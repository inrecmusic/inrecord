import { notFound } from "next/navigation";
import { publicGame } from "@/lib/public-games";
import PlayTrial from "@/components/PlayTrial";

// 公開試玩頁（免登入）：/play/do。白名單外的 slug 直接 404。
export const revalidate = 3600;

export function generateMetadata({ params }) {
  const g = publicGame(params?.slug);
  if (!g) return { title: "找不到頁面" };
  return {
    title: `${g.name}｜免費試玩 - InRecord 音樂刻`,
    description: g.blurb,
    alternates: { canonical: `/play/${String(params.slug).toLowerCase()}` },
  };
}

export default function PlayPage({ params }) {
  const g = publicGame(params?.slug);
  if (!g) notFound();
  return <PlayTrial slug={String(params.slug).toLowerCase()} name={g.name} blurb={g.blurb} />;
}
