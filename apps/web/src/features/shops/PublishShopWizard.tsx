import { usePublishShopController } from "./controllers/usePublishShopController";
import { PublishShopView } from "./views/PublishShopView";

export function PublishShopWizard() {
  const vm = usePublishShopController();
  return <PublishShopView {...vm} />;
}
