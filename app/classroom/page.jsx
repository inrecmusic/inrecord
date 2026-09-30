import HubLegacy from "./HubLegacy";
import HubV3 from "./HubV3";

// 學員中心兩版並存：新版「音樂廳夜場」還在調整，先只在 Preview 開。
// HUB_V3 未設＝正式站維持改版前的儀表板；Preview 設 on 才看到新版。
// 伺服器端讀 env（非 NEXT_PUBLIC_），所以切換只要改 Vercel 環境變數＋重新部署，不用改程式。
export default function ClassroomPage() {
  return process.env.HUB_V3 === "on" ? <HubV3 /> : <HubLegacy />;
}
