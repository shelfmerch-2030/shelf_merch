import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTenantAccess } from "@/hooks/useTenantAccess";
import { getCuratedKitMeta } from "@/features/kits/controllers/useSendKitController";
import {
  getSendFlowBlockReason,
  sendFlowBlockMessage,
} from "@/features/send/fundsGate";
import {
  isCompletedCampaign,
  isIncompleteCampaign,
  isLiveCampaign,
  isPointsCampaign,
} from "../model";
import type { UiCampaign, UiKit, UiShop } from "../model";

const PER_PAGE = 5;

export const CAMPAIGN_FILTERS = ["all", "live", "draft", "completed"] as const;
export type CampaignFilter = (typeof CAMPAIGN_FILTERS)[number];

export const CAMPAIGN_TYPE_TABS = ["recent", "kits", "points"] as const;
export type CampaignTypeTab = (typeof CAMPAIGN_TYPE_TABS)[number];

export type CampaignStats = {
  total: number;
  live: number;
  draft: number;
  recipients: number;
};

export type CampaignTypeCounts = {
  recent: number;
  kits: number;
  points: number;
};

export type SendGiftView = "choose" | "points" | "kit";

export type SendGiftVm = {
  open: boolean;
  view: SendGiftView;
  availableKits: UiKit[];
  availableShops: UiShop[];
  onOpenChange: (open: boolean) => void;
  onPickKitView: () => void;
  onStartSendPoints: () => void;
  onSelectShopForPoints: (shopId: string) => void;
  onBackToChoose: () => void;
  onSelectKit: (kitId: string) => void;
  onCreateKit: () => void;
  onCreateShop: () => void;
  canCreateKit: boolean;
  canCreateShop: boolean;
};

export type CampaignsVm = {
  isLoading: boolean;
  errorMessage: string | null;
  hasCampaigns: boolean;
  canSend: boolean;
  stats: CampaignStats;
  typeTab: CampaignTypeTab;
  typeCounts: CampaignTypeCounts;
  typeTabEmpty: boolean;
  filter: CampaignFilter;
  search: string;
  pageItems: UiCampaign[];
  page: number;
  totalPages: number;
  totalFiltered: number;
  showingStart: number;
  showingEnd: number;
  onTypeTab: (tab: CampaignTypeTab) => void;
  onFilter: (filter: CampaignFilter) => void;
  onSearch: (search: string) => void;
  onPage: (page: number) => void;
  onSendGift: () => void;
  onSendPointsCampaign: () => void;
  onSendKitCampaign: () => void;
  onResumeCampaign: (campaign: UiCampaign) => void;
  gift: SendGiftVm;
};

function isKitCampaign(c: UiCampaign) {
  return !isPointsCampaign(c);
}

function campaignsForTypeTab(campaigns: UiCampaign[], tab: CampaignTypeTab) {
  if (tab === "kits") return campaigns.filter(isKitCampaign);
  if (tab === "points") return campaigns.filter(isPointsCampaign);
  return campaigns;
}

/** Controller for the campaigns list screen: workspace slice, table state, Send Gift dialog. */
export function useCampaignsController(): CampaignsVm {
  const { data: workspace, isLoading, isError, error } = useWorkspace();
  const navigate = useNavigate();
  const { canOperateCampaigns, canWrite } = useTenantAccess();

  const [giftOpen, setGiftOpen] = useState(false);
  const [giftView, setGiftView] = useState<SendGiftView>("choose");
  const [typeTab, setTypeTab] = useState<CampaignTypeTab>("recent");
  const [filter, setFilter] = useState<CampaignFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const campaigns = workspace?.campaigns ?? [];
  const shops = workspace?.shops ?? [];
  const stats: CampaignStats = {
    total: campaigns.length,
    live: campaigns.filter(isLiveCampaign).length,
    draft: campaigns.filter(isIncompleteCampaign).length,
    recipients: campaigns.reduce((s, c) => s + (c.recipientCount || 0), 0),
  };

  const typeCounts: CampaignTypeCounts = {
    recent: campaigns.length,
    kits: campaigns.filter(isKitCampaign).length,
    points: campaigns.filter(isPointsCampaign).length,
  };

  const typed = campaignsForTypeTab(campaigns, typeTab);
  const typeTabEmpty = typed.length === 0;

  let filtered = typed;
  if (filter === "live") filtered = filtered.filter(isLiveCampaign);
  else if (filter === "draft") filtered = filtered.filter(isIncompleteCampaign);
  else if (filter === "completed") filtered = filtered.filter(isCompletedCampaign);
  const q = search.toLowerCase();
  if (q) filtered = filtered.filter((c) => c.name.toLowerCase().includes(q));

  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PER_PAGE;
  const pageItems = filtered.slice(start, start + PER_PAGE);

  const availableShops = shops.filter((s) => s.id);

  function closeGift() {
    setGiftOpen(false);
    setGiftView("choose");
  }

  function assertCanStartSend(): boolean {
    const reason = getSendFlowBlockReason(workspace);
    if (!reason) return true;
    toast.error(sendFlowBlockMessage(reason));
    return false;
  }

  function goToSendPoints(shopId: string) {
    if (!assertCanStartSend()) return;
    closeGift();
    navigate(`/app/campaigns/send-points?shop=${encodeURIComponent(shopId)}`);
  }

  function onResumeCampaign(campaign: UiCampaign) {
    if (!isIncompleteCampaign(campaign)) return;

    if (isPointsCampaign(campaign)) {
      if (!assertCanStartSend()) return;
      if (!campaign.shopId) return;
      const params = new URLSearchParams({
        shop: campaign.shopId,
        campaign: campaign.id,
      });
      navigate(`/app/campaigns/send-points?${params}`);
      return;
    }

    if (campaign.kitId) {
      navigate(`/app/kits/${encodeURIComponent(campaign.kitId)}/send`);
    }
  }

  return {
    isLoading: isLoading && !workspace,
    errorMessage:
      isError || !workspace
        ? error instanceof Error
          ? error.message
          : "Could not load campaigns"
        : null,
    hasCampaigns: campaigns.length > 0,
    canSend: canOperateCampaigns(),
    stats,
    typeTab,
    typeCounts,
    typeTabEmpty,
    filter,
    search,
    pageItems,
    page: safePage,
    totalPages,
    totalFiltered,
    showingStart: totalFiltered ? start + 1 : 0,
    showingEnd: Math.min(start + PER_PAGE, totalFiltered),
    onTypeTab: (tab) => {
      setTypeTab(tab);
      setPage(1);
    },
    onFilter: (f) => {
      setFilter(f);
      setPage(1);
    },
    onSearch: (s) => {
      setSearch(s);
      setPage(1);
    },
    onPage: setPage,
    onSendGift: () => {
      setGiftOpen(true);
    },
    onSendPointsCampaign: () => {
      if (!assertCanStartSend()) return;
      setGiftOpen(true);
      if (availableShops.length === 1) {
        goToSendPoints(availableShops[0].id);
        return;
      }
      setGiftView("points");
    },
    onSendKitCampaign: () => {
      // Kit checkout allows UPI/card when wallet is pending or underfunded.
      setGiftOpen(true);
      setGiftView("kit");
    },
    onResumeCampaign,
    gift: {
      open: giftOpen,
      view: giftView,
      availableKits: (workspace?.kits ?? []).filter((k) => k.id && !getCuratedKitMeta(k)),
      availableShops,
      onOpenChange: (o) => {
        setGiftOpen(o);
        if (!o) setGiftView("choose");
      },
      onPickKitView: () => {
        setGiftView("kit");
      },
      onStartSendPoints: () => {
        if (!assertCanStartSend()) return;
        if (availableShops.length === 1) {
          goToSendPoints(availableShops[0].id);
          return;
        }
        setGiftView("points");
      },
      onSelectShopForPoints: goToSendPoints,
      onBackToChoose: () => setGiftView("choose"),
      onSelectKit: (kitId) => {
        closeGift();
        navigate(`/app/kits/${kitId}/send`);
      },
      onCreateKit: () => {
        closeGift();
        navigate("/app/kits/new");
      },
      onCreateShop: () => {
        closeGift();
        navigate("/app/shops/new");
      },
      canCreateKit: canWrite("kits"),
      canCreateShop: canWrite("shops"),
    },
  };
}
