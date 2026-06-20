import HomeClient from "./HomeClient";
import { getSaleSettings, salePhase, currentPrice } from "@/lib/sale";
import { PLAN_CATALOG } from "@/lib/plans";

export const revalidate = 60;

export default async function Page() {
  const now = new Date();
  const settings = await getSaleSettings();
  const phase = salePhase(settings, now);

  const plans = {};
  for (const key of Object.keys(PLAN_CATALOG)) {
    const price = currentPrice(key, settings, now);
    const original = settings?.plan_pricing?.[key]?.original ?? PLAN_CATALOG[key].price;
    plans[key] = { price, originalPrice: original, isEarlyBird: phase.earlyBird && price < original };
  }

  const sale = {
    classroomOpen: phase.classroomOpen,
    earlyBird: phase.earlyBird,
    openAt: settings?.open_at ?? null,
    earlyBirdEndsAt: settings?.early_bird_ends_at ?? null,
    plans,
  };

  // 開課通知 lazy trigger（免費方案無 sub-daily cron）：開課後首位訪客觸發，CAS 去重。
  if (phase.classroomOpen && settings && !settings.launch_notified_at) {
    const site = process.env.NEXT_PUBLIC_SITE_URL || "https://inrecordmusic.com";
    const secret = process.env.CRON_SECRET;
    if (secret) {
      fetch(`${site}/api/cron/sale-launch-notify`, { headers: { Authorization: `Bearer ${secret}` } }).catch(() => {});
    }
  }

  return <HomeClient sale={sale} />;
}
