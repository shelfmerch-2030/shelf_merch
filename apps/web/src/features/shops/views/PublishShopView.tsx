import { LoadingState } from "@/components/LoadingState";
import { ShopBuilderStep } from "../ShopBuilderStep";
import type { PublishShopVm } from "../controllers/usePublishShopController";

/** Draft-shop publish shell: loads the shop, then opens the builder confirm step. */
export function PublishShopView(vm: PublishShopVm) {
  if (vm.isLoading || (!vm.ready && !vm.errorMessage && !vm.shopMissing)) {
    return <LoadingState message="Loading shop…" fullScreen={false} />;
  }

  if (vm.errorMessage) {
    return (
      <div className="card" style={{ padding: 16, color: "var(--danger)" }}>
        {vm.errorMessage}
      </div>
    );
  }

  if (vm.shopMissing || !vm.ready) {
    return (
      <div className="card empty" style={{ padding: 48 }}>
        <h3>Shop not found</h3>
        <p className="muted">This shop may have been archived or the link is invalid.</p>
      </div>
    );
  }

  return (
    <ShopBuilderStep
      draft={vm.draft}
      dispatch={vm.dispatch}
      onExit={vm.onExit}
      onPublish={vm.onPublish}
      publishing={vm.publishing}
      publishLabel="Publish"
    />
  );
}
