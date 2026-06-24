import HomeClient from "./HomeClient";
import { getSaleSettings, salePhase } from "@/lib/sale";

export const revalidate = 60;

export default async function Page() {
  const now = new Date();
  const settings = await getSaleSettings();
  const phase = salePhase(settings, now);

  const sale = {
    state: phase.state,
    onSale: phase.onSale,
    classroomOpen: phase.classroomOpen,
    salesStartAt: phase.salesStartAt,
    nextIncreaseAt: phase.nextIncreaseAt,
    plans: phase.plans,
    fanPlan: phase.fanPlan,
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
