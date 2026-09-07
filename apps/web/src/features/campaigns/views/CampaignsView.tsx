import { LoadingState } from "@/components/LoadingState";
import type { CampaignsVm } from "../controllers/useCampaignsController";
import { CampaignsEmptyStateView } from "./CampaignsEmptyStateView";
import { CampaignsTableView } from "./CampaignsTableView";
import { SendGiftDialogView } from "./SendGiftDialogView";
import "../campaigns-page.css";

/** Campaigns list screen: loading/error states, empty state or table, Send Gift dialog. */
export function CampaignsView(vm: CampaignsVm) {
  if (vm.isLoading) {
    return <LoadingState message="Loading campaigns..." fullScreen={false} variant="page" />;
  }
  if (vm.errorMessage) {
    return (
      <div className="card" style={{ padding: 16, color: "var(--danger)" }}>
        {vm.errorMessage}
      </div>
    );
  }

  return (
    <>
      {vm.hasCampaigns ? (
        <CampaignsTableView
          stats={vm.stats}
          typeTab={vm.typeTab}
          typeCounts={vm.typeCounts}
          typeTabEmpty={vm.typeTabEmpty}
          filter={vm.filter}
          search={vm.search}
          pageItems={vm.pageItems}
          page={vm.page}
          totalPages={vm.totalPages}
          totalFiltered={vm.totalFiltered}
          showingStart={vm.showingStart}
          showingEnd={vm.showingEnd}
          canSend={vm.canSend}
          onTypeTab={vm.onTypeTab}
          onFilter={vm.onFilter}
          onSearch={vm.onSearch}
          onPage={vm.onPage}
          onSendGift={vm.onSendGift}
          onSendPointsCampaign={vm.onSendPointsCampaign}
          onSendKitCampaign={vm.onSendKitCampaign}
          onResumeCampaign={vm.onResumeCampaign}
        />
      ) : (
        <CampaignsEmptyStateView
          canSend={vm.canSend}
          onSendGift={vm.onSendGift}
          onSendPointsCampaign={vm.onSendPointsCampaign}
          onSendKitCampaign={vm.onSendKitCampaign}
        />
      )}
      <SendGiftDialogView {...vm.gift} />
    </>
  );
}
