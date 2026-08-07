import { type ComponentType, type CSSProperties, type ReactNode, useEffect, useState, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  ArrowRight,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  Gift,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Star,
  Users,
  Box,
  Package,
} from "lucide-react";
import { toast } from "sonner";
import { LoadingState } from "@/components/LoadingState";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useUpdateKit, useCreateKit, useEnsureCuratedKit, usePlatformKits, type PlatformKitTemplate, type UiKit } from "../model";
import { kitPickedIndices } from "../wizard/kitDraft";
import {
  KitPreviewDialog,
  buildKitPreviewFromPlatform,
  buildKitPreviewFromWorkspace,
  type KitPreviewData,
} from "../KitPreviewDialog";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import type { KitsVm } from "../controllers/useKitsController";
import { KitsEmptyState } from "./KitsEmptyState";
import kitPreviewImg from "../../../../assets/kit-preview.png";
import noKitsYetImg from "../../../../assets/no-kits-yet.png";
import "../kits-page.css";

type KitsSection = "recent" | "customized" | "curated";

function parseKitsTab(value: string | null): KitsSection | null {
  if (value === "recent" || value === "customized" || value === "curated") return value;
  return null;
}

function KitsSectionEmptyState({
  title,
  description,
  secondary,
  illustration = true,
  action,
}: {
  title: string;
  description: string;
  secondary?: string;
  illustration?: boolean;
  action?: ReactNode;
}) {
  return (
    <div
      className="card"
      style={{
        padding: "48px 32px",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-card)",
        border: "1px solid var(--line)",
        borderRadius: 12,
        minHeight: 280,
      }}
    >
      {illustration ? (
        <img
          src={noKitsYetImg}
          alt=""
          style={{ maxHeight: 140, marginBottom: 20, objectFit: "contain" }}
        />
      ) : null}
      <h3 style={{ fontSize: 18, fontWeight: 800, color: "var(--ink)", margin: "0 0 8px" }}>
        {title}
      </h3>
      <p className="muted" style={{ fontSize: 14, lineHeight: 1.55, margin: 0, maxWidth: 420 }}>
        {description}
      </p>
      {secondary ? (
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, margin: "10px 0 0", maxWidth: 420 }}>
          {secondary}
        </p>
      ) : null}
      {action ? <div style={{ marginTop: 18 }}>{action}</div> : null}
    </div>
  );
}

const previewBtnStyle: CSSProperties = {
  flex: 1,
  border: "1px solid var(--line)",
  height: 32,
  fontSize: 13,
  fontWeight: 700,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 6,
  color: "var(--ink)",
  background: "transparent",
  cursor: "pointer",
};

const sendBtnStyle: CSSProperties = {
  flex: 1,
  height: 32,
  fontSize: 13,
  fontWeight: 700,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 6,
};

type StatCardProps = {
  label: string;
  value: string;
  delta: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
};

type KitRow = {
  id: string;
  name: string;
  description: string;
  audience: string;
  image: string;
  items: number;
  status: "live" | "draft" | "archived";
  lastSent: string;
  sentDate: string;
  featured?: boolean;
  /** Present only for real workspace kits; absent for default sample rows. */
  kit?: UiKit;
  platformKit?: PlatformKitTemplate;
};

// Helper for formatting date strings
function formatDateString(dateStr?: string) {
  if (!dateStr || dateStr === "Never sent" || dateStr === "Recent") return dateStr || "Never sent";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function formatRelativeSent(iso?: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return formatDateString(iso);
}

function getCuratedKitMeta(kit: any) {
  try {
    if (!kit.designNotes) return null;
    const parsed = JSON.parse(kit.designNotes);
    if (parsed && parsed.curated) {
      return parsed;
    }
  } catch (e) { }
  return null;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ label, value, delta, icon: Icon }: StatCardProps) {
  return (
    <article
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--line)",
        borderRadius: 16,
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        flex: 1,
        minWidth: 200,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-500)" }}>{label}</span>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "var(--brand-50)",
            color: "var(--brand)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <Icon size={20} />
        </div>
      </div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--disp)", color: "var(--ink)", lineHeight: 1 }}>
          {value}
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            marginTop: 10,
            background: "var(--brand-50)",
            color: "var(--brand)",
            fontSize: 11,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 12,
            border: "1px solid var(--brand-100)",
          }}
        >
          <span style={{ fontSize: 9 }}>▲</span> {delta}
        </div>
      </div>
    </article>
  );
}

// function ProgressBanner() {
//   return (
//     <div
//       style={{
//         background: "var(--gray-50)",
//         border: "1px solid var(--line)",
//         borderRadius: 12,
//         padding: "16px 24px",
//         display: "flex",
//         alignItems: "center",
//         justifyContent: "space-between",
//         gap: 16,
//         marginBottom: 24,
//         flexWrap: "wrap",
//       }}
//     >
{/* <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 220 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "#eef7f2",
            color: "var(--brand)",
            display: "grid",
            placeItems: "center",
            fontWeight: 700,
            fontSize: 14,
            flexShrink: 0,
          }}
        >
          1
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <Box size={18} color="var(--brand)" />
        </div> */}
{/* <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#101a15" }}>Create a kit</div>
          <div style={{ fontSize: 11, color: "#5b665f", lineHeight: 1.3 }}>
            Choose products from catalog and name kit.
          </div>
        </div>
      </div>
      <div style={{ color: "#d9e0dc", fontSize: 20, fontWeight: 300, userSelect: "none" }}>›</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 220 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "#eef7f2",
            color: "var(--brand)",
            display: "grid",
            placeItems: "center",
            fontWeight: 700,
            fontSize: 14,
            flexShrink: 0,
          }}
        >
          2
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <Users size={18} color="var(--brand)" />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#101a15" }}>Add recipients</div>
          <div style={{ fontSize: 11, color: "#5b665f", lineHeight: 1.3 }}>
            Select employees or import contacts.
          </div>
        </div>
      </div>
      <div style={{ color: "#d9e0dc", fontSize: 20, fontWeight: 300, userSelect: "none" }}>›</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 220 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "#eef7f2",
            color: "var(--brand)",
            display: "grid",
            placeItems: "center",
            fontWeight: 700,
            fontSize: 14,
            flexShrink: 0,
          }}
        >
          3
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <Send size={18} color="var(--brand)" />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#101a15" }}>Send &amp; track</div>
          <div style={{ fontSize: 11, color: "#5b665f", lineHeight: 1.3 }}>
            Launch your kit and monitor delivery status.
          </div>
        </div> */}
{/* </div>
    </div> */}
// );
// }

// ─── Main view ───────────────────────────────────────────────────────────────

export function KitsView(vm: KitsVm) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: workspace } = useWorkspace();
  const updateKit = useUpdateKit();
  const createKit = useCreateKit();
  const ensureCuratedKit = useEnsureCuratedKit();
  const { data: platformKits } = usePlatformKits();
  const catalog = workspace?.catalogProducts ?? [];

  const [activeSection, setActiveSection] = useState<KitsSection>(
    () => parseKitsTab(searchParams.get("tab")) ?? "recent",
  );
  const [kitPreview, setKitPreview] = useState<KitPreviewData | null>(null);

  useEffect(() => {
    const tab = parseKitsTab(searchParams.get("tab"));
    if (tab) setActiveSection(tab);
  }, [searchParams]);

  const selectSection = (section: KitsSection) => {
    setActiveSection(section);
    const next = new URLSearchParams(searchParams);
    if (section === "recent") next.delete("tab");
    else next.set("tab", section);
    setSearchParams(next, { replace: true });
  };

  // Recent Activity section states
  const [recentTab, setRecentTab] = useState<"all" | "live" | "draft" | "archived">("all");
  const [recentSearch, setRecentSearch] = useState("");
  const [recentSort, setRecentSort] = useState<"name" | "items" | "newest">("newest");
  const [recentPage, setRecentPage] = useState(1);

  // Customized Kits section states
  const [customTab, setCustomTab] = useState<"all" | "live" | "draft" | "archived">("all");
  const [customSearch, setCustomSearch] = useState("");
  const [customSort, setCustomSort] = useState<"name" | "items" | "newest">("newest");
  const [customPage, setCustomPage] = useState(1);

  // Curated Kits section states
  const [curatedTab, setCuratedTab] = useState<"all" | "live" | "draft" | "archived">("all");
  const [curatedSearch, setCuratedSearch] = useState("");
  const [curatedSort, setCuratedSort] = useState<"name" | "items" | "newest">("newest");
  const [curatedPage, setCuratedPage] = useState(1);

  const { canCreateKits, canSendKits } = vm;

  /** Map real workspace kits into KitRow shape */
  const workspaceRows = useMemo<KitRow[]>(() => {
    return vm.kits
      .filter((kit) => !getCuratedKitMeta(kit))
      .map((kit): KitRow => ({
        id: kit.id,
        name: kit.name,
        description: kit.description?.trim() || "Custom kit created in your workspace.",
        audience: "Workspace",
        image: kit.artworkUrl ? resolveMediaUrl(kit.artworkUrl) : kitPreviewImg,
        items: kit.items,
        status: kit.status === "live" ? "live" : kit.status === "archived" ? "archived" : "draft",
        lastSent: kit.sent ? "Recently" : "-",
        sentDate: kit.sent ? "Recent" : "Never sent",
        kit,
      }));
  }, [vm.kits]);

  /** Map platform curated kits into KitRow shape */
  const curatedKitsRows = useMemo<KitRow[]>(() => {
    if (!platformKits) return [];
    return platformKits.map((kit): KitRow => {
      const coverImg = kit.heroImage
        ? resolveMediaUrl(kit.heroImage)
        : kit.imageUrls?.[0]
          ? resolveMediaUrl(kit.imageUrls[0])
          : kitPreviewImg;
      const matchedWk = vm.kits.find((wk) => {
        const meta = getCuratedKitMeta(wk);
        return meta?.originalId === kit._id;
      });

      // Prefer explicit itemImages; fall back to workspace clone / legacy gallery count.
      const imageItemCount = Array.isArray(kit.itemImages) && kit.itemImages.length
        ? kit.itemImages.length
        : (kit.imageUrls?.length ?? 0) > 1
          ? (kit.imageUrls!.length - 1)
          : (kit.imageUrls?.length ?? 0) === 1
            ? 1
            : 0;
      const itemCount =
        (kit.items?.length && kit.items.length > 0
          ? kit.items.length
          : matchedWk?.items && matchedWk.items > 0
            ? matchedWk.items
            : imageItemCount) || 0;

      return {
        id: matchedWk ? matchedWk.id : kit._id,
        name: matchedWk ? matchedWk.name : kit.name,
        description: kit.description || "",
        audience: "Platform",
        image: coverImg,
        items: itemCount,
        status: matchedWk
          ? (matchedWk.status === "live" ? "live" : matchedWk.status === "archived" ? "archived" : "draft")
          : "live",
        lastSent: matchedWk?.sent ? "Recently" : "-",
        sentDate: matchedWk?.sent ? "Recent" : "Never sent",
        platformKit: kit,
        kit: matchedWk,
      };
    });
  }, [platformKits, vm.kits]);

  /** Workspace kits first, then the curated templates. */
  const allKits = useMemo<KitRow[]>(
    () => [...workspaceRows, ...curatedKitsRows],
    [workspaceRows, curatedKitsRows],
  );

  const stats = useMemo(() => {
    const live = allKits.filter((k) => k.status === "live").length;
    const drafts = allKits.filter((k) => k.status === "draft").length;
    const archived = allKits.filter((k) => k.status === "archived").length;
    return { total: live + drafts + archived, live, drafts, archived };
  }, [allKits]);

  // Recent Activity: only kits that have actually been sent (customised + curated clones).
  // Workspace kits are tenant-scoped, so this includes sends by the company admin and invited users.
  const recentActivityRows = useMemo<KitRow[]>(() => {
    return vm.kits
      .filter((kit) => kit.sent && Boolean(kit.lastSentAt) && kit.status !== "archived")
      .map((kit): KitRow => {
        const curated = getCuratedKitMeta(kit);
        return {
          id: kit.id,
          name: kit.name,
          description:
            kit.description?.trim() ||
            (curated ? "Curated kit sent from your workspace." : "Custom kit sent from your workspace."),
          audience: curated ? "Curated" : "Customised",
          image: kit.artworkUrl ? resolveMediaUrl(kit.artworkUrl) : kitPreviewImg,
          items: kit.items,
          status: kit.status === "live" ? "live" : kit.status === "archived" ? "archived" : "draft",
          lastSent: formatRelativeSent(kit.lastSentAt),
          sentDate: formatDateString(kit.lastSentAt),
          kit,
        };
      })
      .sort((a, b) => {
        const ta = a.kit?.lastSentAt ? new Date(a.kit.lastSentAt).getTime() : 0;
        const tb = b.kit?.lastSentAt ? new Date(b.kit.lastSentAt).getTime() : 0;
        return tb - ta;
      });
  }, [vm.kits]);

  // Filtered & Sorted Recent Activity
  const processedRecentRows = useMemo(() => {
    let list = [...recentActivityRows];
    if (recentTab === "all") {
      list = list.filter((r) => r.status !== "archived");
    } else {
      list = list.filter((r) => r.status === recentTab);
    }
    if (recentSearch.trim()) {
      const q = recentSearch.toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q));
    }
    if (recentSort === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (recentSort === "items") {
      list.sort((a, b) => b.items - a.items);
    } else {
      // newest — sent date descending
      list.sort((a, b) => {
        const ta = a.kit?.lastSentAt ? new Date(a.kit.lastSentAt).getTime() : 0;
        const tb = b.kit?.lastSentAt ? new Date(b.kit.lastSentAt).getTime() : 0;
        return tb - ta;
      });
    }
    return list;
  }, [recentActivityRows, recentTab, recentSearch, recentSort]);

  // Filtered & Sorted Customized Kits
  const processedCustomRows = useMemo(() => {
    let list = [...workspaceRows];
    if (customTab === "all") {
      list = list.filter((r) => r.status !== "archived");
    } else {
      list = list.filter((r) => r.status === customTab);
    }
    if (customSearch.trim()) {
      const q = customSearch.toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q));
    }
    if (customSort === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (customSort === "items") {
      list.sort((a, b) => b.items - a.items);
    }
    return list;
  }, [workspaceRows, customTab, customSearch, customSort]);

  // Filtered & Sorted Curated Kits
  const processedCuratedRows = useMemo(() => {
    let list = [...curatedKitsRows];
    if (curatedTab === "all") {
      list = list.filter((r) => r.status !== "archived");
    } else {
      list = list.filter((r) => r.status === curatedTab);
    }
    if (curatedSearch.trim()) {
      const q = curatedSearch.toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q));
    }
    if (curatedSort === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (curatedSort === "items") {
      list.sort((a, b) => b.items - a.items);
    }
    return list;
  }, [curatedKitsRows, curatedTab, curatedSearch, curatedSort]);

  const RECENT_ITEMS_PER_PAGE = 8;
  const GRID_ITEMS_PER_PAGE = 8;

  // Pagination bounds
  const recentTotalPages = Math.max(1, Math.ceil(processedRecentRows.length / RECENT_ITEMS_PER_PAGE));
  const paginatedRecentRows = useMemo(() => {
    const start = (recentPage - 1) * RECENT_ITEMS_PER_PAGE;
    return processedRecentRows.slice(start, start + RECENT_ITEMS_PER_PAGE);
  }, [processedRecentRows, recentPage]);

  const customTotalPages = Math.max(1, Math.ceil(processedCustomRows.length / GRID_ITEMS_PER_PAGE));
  const paginatedCustomRows = useMemo(() => {
    const start = (customPage - 1) * GRID_ITEMS_PER_PAGE;
    return processedCustomRows.slice(start, start + GRID_ITEMS_PER_PAGE);
  }, [processedCustomRows, customPage]);

  const curatedTotalPages = Math.max(1, Math.ceil(processedCuratedRows.length / GRID_ITEMS_PER_PAGE));
  const paginatedCuratedRows = useMemo(() => {
    const start = (curatedPage - 1) * GRID_ITEMS_PER_PAGE;
    return processedCuratedRows.slice(start, start + GRID_ITEMS_PER_PAGE);
  }, [processedCuratedRows, curatedPage]);

  const firstLiveKitId = useMemo(
    () => vm.kits.find((k) => k.status === "live")?.id,
    [vm.kits],
  );

  // ── Handlers for Curated Action & Send ──

  const openRowPreview = (row: KitRow) => {
    const curatedMeta = row.kit ? getCuratedKitMeta(row.kit) : null;
    const resolvedPlatformKit =
      row.platformKit ||
      (curatedMeta?.originalId && platformKits
        ? platformKits.find((k) => String(k._id) === String(curatedMeta.originalId))
        : undefined);

    if (resolvedPlatformKit) {
      setKitPreview(buildKitPreviewFromPlatform(resolvedPlatformKit, catalog, row.image));
      return;
    }
    if (row.kit) {
      setKitPreview(buildKitPreviewFromWorkspace(row.kit, catalog, row.image, platformKits));
      return;
    }
    setKitPreview({
      name: row.name,
      description: row.description || "No description available.",
      coverImage: row.image,
      products: [],
    });
  };

  const handleSendWorkspaceKit = (kit: UiKit | undefined) => {
    if (!kit?.id) {
      toast.error("This kit is no longer available to send.");
      return;
    }
    navigate(`/app/kits/${kit.id}/send`);
  };

  const handleSendCuratedKit = async (kit: PlatformKitTemplate, existing?: UiKit) => {
    if (existing?.id) {
      navigate(`/app/kits/${existing.id}/send`);
      return;
    }

    const catalogProducts = workspace?.catalogProducts ?? [];
    const productRefs: Array<{
      catalogProductId: string;
      brand?: string;
      name: string;
      group?: string;
    }> = [];

    for (const item of kit.items || []) {
      const pid = String(item.catalogProductId ?? "");
      if (!pid) continue;
      const product = catalogProducts.find((p) => p.id === pid);
      if (!product?.id) continue;
      if (productRefs.some((r) => r.catalogProductId === product.id)) continue;
      productRefs.push({
        catalogProductId: product.id,
        brand: product.brand || "",
        name: product.nm || "Product",
        group: product.g || product.category || "",
      });
    }

    // Curated templates may have no catalog items — keep productRefs empty so
    // fulfillment uses curated designNotes (itemImages / approxValueInr).

    try {
      const ensured = await ensureCuratedKit.mutateAsync({
        platformKitId: kit._id,
        productRefs: productRefs.length ? productRefs : undefined,
      });
      navigate(`/app/kits/${ensured.id}/send`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to prepare curated kit for send");
    }
  };

  const handleCuratedAction = async (kit: PlatformKitTemplate, status: "archived" | "draft" | "live") => {
    const catalogProducts = workspace?.catalogProducts ?? [];
    const pickedIndices: number[] = [];
    if (kit.items) {
      for (const item of kit.items) {
        const pid = String(item.catalogProductId ?? "");
        if (!pid) continue;
        const idx = catalogProducts.findIndex((p) => p.id === pid);
        if (idx >= 0 && !pickedIndices.includes(idx)) pickedIndices.push(idx);
      }
    }
    if (pickedIndices.length === 0 && catalogProducts.length > 0) {
      pickedIndices.push(0);
    }
    const packaging = kit.packaging === "none" ? "none" : "box";
    const designNotes = JSON.stringify({
      curated: true,
      originalId: kit._id,
      description: kit.description || "",
      approxValueInr: Math.round(Number(kit.approxValueInr) || 0),
      imageUrls: kit.imageUrls || [],
      heroImage: kit.heroImage || kit.imageUrls?.[0] || "",
      itemImages: kit.itemImages || [],
      variantImages: kit.variantImages || [],
    });

    try {
      const created = await createKit.mutateAsync({
        name: kit.name,
        pickedIndices,
        catalog: catalogProducts,
        packaging,
        designNotes,
      });
      await updateKit.mutateAsync({
        id: created.id,
        pickedIndices,
        catalog: catalogProducts,
        status,
      });
      toast.success(`Kit updated to ${status}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update kit status");
    }
  };

  // ── Early returns ──
  if (vm.isLoading) return <LoadingState message="Loading kits..." fullScreen={false} />;
  if (vm.errorMessage) {
    return (
      <div className="card" style={{ padding: 16, color: "var(--danger)" }}>
        {vm.errorMessage}
      </div>
    );
  }

  if (vm.isEmpty && canCreateKits) {
    return <KitsEmptyState contactCount={vm.contactCount} canCreateKits={vm.canCreateKits} />;
  }

  // Nested actions component for row options (manage actions require kits write)
  function ThreeDotMenu({ kitRow }: { kitRow: KitRow }) {
    const [open, setOpen] = useState(false);

    const handleAction = async (status: "archived" | "draft" | "live") => {
      if (!canCreateKits) {
        toast.info("Kit management requires a company admin.");
        return;
      }
      setOpen(false);

      if (kitRow.platformKit && !kitRow.kit) {
        handleCuratedAction(kitRow.platformKit, status);
        return;
      }

      const activeKit = kitRow.kit;
      if (!activeKit) {
        toast.info("Actions only available for custom workspace kits.");
        return;
      }
      try {
        const catalogProducts = workspace?.catalogProducts ?? [];
        const pickedIndices = kitPickedIndices(activeKit, catalogProducts);
        await updateKit.mutateAsync({
          id: activeKit.id,
          pickedIndices,
          catalog: catalogProducts,
          status,
        });
        toast.success(`Kit updated to ${status}`);
      } catch (err) {
        toast.error("Failed to update kit status");
      }
    };

    return (
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => {
            if (!canCreateKits) {
              toast.info("Kit management requires a company admin.");
              return;
            }
            setOpen(!open);
          }}
          style={{
            background: "transparent",
            border: "1px solid var(--line)",
            width: 32,
            height: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 6,
            cursor: "pointer",
          }}
          aria-label="Kit options"
        >
          <MoreVertical size={16} />
        </button>
        {open && (
          <>
            <div
              style={{ position: "fixed", inset: 0, zIndex: 90 }}
              onClick={() => setOpen(false)}
            />
            <div
              style={{
                position: "absolute",
                right: 0,
                bottom: "100%",
                marginBottom: 4,
                background: "var(--bg-card)",
                border: "1px solid var(--line)",
                borderRadius: 6,
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                zIndex: 100,
                minWidth: 140,
                display: "flex",
                flexDirection: "column",
                padding: 4,
              }}
            >
              {kitRow.kit && !kitRow.platformKit && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    navigate(`/app/kits/${kitRow.kit!.id}/edit`);
                  }}
                  style={{
                    padding: "8px 12px",
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    fontSize: 13,
                    cursor: "pointer",
                    borderRadius: 4,
                  }}
                >
                  Edit kit
                </button>
              )}
              {kitRow.status !== "archived" && (
                <button
                  type="button"
                  onClick={() => handleAction("archived")}
                  style={{
                    padding: "8px 12px",
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    fontSize: 13,
                    cursor: "pointer",
                    borderRadius: 4,
                  }}
                >
                  Archive
                </button>
              )}
              {kitRow.status !== "draft" && (
                <button
                  type="button"
                  onClick={() => handleAction("draft")}
                  style={{
                    padding: "8px 12px",
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    fontSize: 13,
                    cursor: "pointer",
                    borderRadius: 4,
                  }}
                >
                  Mark as Draft
                </button>
              )}
              {kitRow.status !== "live" && (
                <button
                  type="button"
                  onClick={() => handleAction("live")}
                  style={{
                    padding: "8px 12px",
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    fontSize: 13,
                    cursor: "pointer",
                    borderRadius: 4,
                  }}
                >
                  Mark as Live
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <section className="kits-dashboard" aria-label="Kits and Items dashboard">
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Hero Row */}
        <div className="kits-hero-row" style={{ margin: "0 0 10px" }}>
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 800, color: "var(--ink)" }}>Kits &amp; Items</h1>
            <p style={{ margin: "8px 0 0", color: "var(--gray-500)" }}>
              {canCreateKits
                ? "Create reusable gift kits with your products and send them at scale."
                : "Browse custom and curated kits, then send them to your team."}
            </p>
          </div>
          {canCreateKits && (
            <Link to="/app/kits/new" className="kits-create-btn" style={{ height: 40 }}>
              <Plus size={16} strokeWidth={2.4} />
              Create a kit
            </Link>
          )}
        </div>

        {/* Progress Banner */}
        {/* <ProgressBanner /> */}

        {/* Stats Grid */}
        <div className="kits-stats-grid" style={{ margin: "0 0 12px" }}>
          <StatCard label="Total kits" value={String(stats.total)} delta="18% vs last month" icon={Gift} />
          <StatCard label="Live kits" value={String(stats.live)} delta="22% vs last month" icon={Sparkles} />
          <StatCard label="Sent this month" value="312" delta="29% vs last month" icon={Send} />
          <StatCard label="Recipients reached" value="1,842" delta="35% vs last month" icon={Users} />
        </div>

        {/* Top-Level Section Navigation Switcher */}
        <div
          style={{
            display: "flex",
            gap: 32,
            borderBottom: "1px solid var(--line)",
            margin: "12px 0 0",
            paddingBottom: 0,
          }}
        >
          <button
            type="button"
            style={{
              background: "none",
              border: "none",
              padding: "12px 0",
              fontSize: 16,
              fontWeight: 700,
              color: activeSection === "recent" ? "var(--brand)" : "var(--gray-500)",
              borderBottom: activeSection === "recent" ? "3px solid var(--brand)" : "3px solid transparent",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onClick={() => selectSection("recent")}
          >
            Recent Activity
          </button>
          <button
            type="button"
            style={{
              background: "none",
              border: "none",
              padding: "12px 0",
              fontSize: 16,
              fontWeight: 700,
              color: activeSection === "customized" ? "var(--brand)" : "var(--gray-500)",
              borderBottom: activeSection === "customized" ? "3px solid var(--brand)" : "3px solid transparent",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onClick={() => selectSection("customized")}
          >
            Customised Kits
          </button>
          <button
            type="button"
            style={{
              background: "none",
              border: "none",
              padding: "12px 0",
              fontSize: 16,
              fontWeight: 700,
              color: activeSection === "curated" ? "var(--brand)" : "var(--gray-500)",
              borderBottom: activeSection === "curated" ? "3px solid var(--brand)" : "3px solid transparent",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onClick={() => selectSection("curated")}
          >
            Curated Kits
          </button>
        </div>

        {/* Section Heading */}
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--ink)", margin: "12px 0 0" }}>
          {activeSection === "recent"
            ? "Recent activity"
            : activeSection === "customized"
              ? "Customised Kits"
              : "Curated Kits"}
        </h2>

        {/* ── SECTION 1: RECENT ACTIVITY ── */}
        {activeSection === "recent" && (
          recentActivityRows.length === 0 ? (
            <KitsSectionEmptyState
              title="No recent activity"
              description="Kits that you or your team send will appear here once they have been sent."
              action={
                canSendKits || canCreateKits ? (
                  <Link
                    to={firstLiveKitId ? `/app/kits/${firstLiveKitId}/send` : "/app/kits/new"}
                    className="btn btn-brand"
                  >
                    Send Your First Kit
                  </Link>
                ) : null
              }
            />
          ) : (
          <div className="kits-list-card">
            {/* Toolbar */}
            <div className="kits-list-toolbar">
              <div className="kits-tabs" aria-label="Kit filters">
                {(["all", "live", "draft", "archived"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`kits-tab${recentTab === tab ? " kits-tab--active" : ""}`}
                    onClick={() => {
                      setRecentTab(tab);
                      setRecentPage(1);
                    }}
                  >
                    {tab === "all" ? "All kits" : tab === "draft" ? "Drafts" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                    <span>
                      {tab === "all"
                        ? recentActivityRows.filter((r) => r.status !== "archived").length
                        : recentActivityRows.filter((r) => r.status === tab).length}
                    </span>
                  </button>
                ))}
              </div>

              <div className="kits-tools">
                <div className="kits-search">
                  <Search size={16} aria-hidden="true" />
                  <input
                    placeholder="Search kits"
                    value={recentSearch}
                    onChange={(e) => {
                      setRecentSearch(e.target.value);
                      setRecentPage(1);
                    }}
                  />
                </div>
                <button type="button" className="kits-tool-btn">
                  <SlidersHorizontal size={16} /> Filters
                </button>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <select
                    value={recentSort}
                    onChange={(e) => {
                      setRecentSort(e.target.value as any);
                      setRecentPage(1);
                    }}
                    style={{
                      padding: "0 28px 0 12px",
                      borderRadius: 8,
                      border: "1px solid var(--line)",
                      background: "var(--bg-card)",
                      fontSize: 13,
                      fontWeight: 800,
                      height: 40,
                      appearance: "none",
                      cursor: "pointer",
                    }}
                  >
                    <option value="newest">Sort: Newest</option>
                    <option value="name">Sort: Name</option>
                    <option value="items">Sort: Items</option>
                  </select>
                  <ChevronDown
                    size={14}
                    style={{
                      position: "absolute",
                      right: 10,
                      pointerEvents: "none",
                      color: "var(--ink-2)",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="kits-table" role="table" aria-label="Recent activity list">
              {paginatedRecentRows.length > 0 ? (
                paginatedRecentRows.map((row) => (
                  <div className="kits-table__row" role="row" key={row.id}>
                    <div className="kits-kit-cell">
                      {row.kit ? (
                        <Link to={`/app/kits/${row.id}`}>
                          <img src={row.image} alt="" />
                        </Link>
                      ) : (
                        <img src={row.image} alt="" />
                      )}
                      <div>
                        <div className="kits-kit-title">
                          {row.kit ? (
                            <Link to={`/app/kits/${row.id}`} className="lnk">
                              {row.name}
                            </Link>
                          ) : (
                            <span>{row.name}</span>
                          )}
                          {row.featured && (
                            <span className="kits-featured">
                              <Star size={11} fill="currentColor" /> Featured
                            </span>
                          )}
                        </div>
                        <span className="kits-audience">{row.audience}</span>
                      </div>
                    </div>

                    <div className="kits-metric-cell">
                      <span>Items</span>
                      <strong>{row.items}</strong>
                    </div>

                    <div className="kits-metric-cell">
                      <span>Status</span>
                      <strong className={`kits-status kits-status--${row.status}`}>
                        <i />
                        {row.status === "live" ? "Live" : row.status === "archived" ? "Archived" : "Draft"}
                      </strong>
                    </div>

                    <div className="kits-sent-cell">
                      <span>Last sent</span>
                      <strong>{row.lastSent}</strong>
                      <em>{row.sentDate}</em>
                    </div>

                    <div className="kits-row-actions">
                      <button
                        type="button"
                        className="kits-row-btn"
                        onClick={() => openRowPreview(row)}
                      >
                        Preview
                      </button>

                      {canSendKits && (
                        <button
                          type="button"
                          className="kits-send-btn"
                          onClick={() => handleSendWorkspaceKit(row.kit)}
                          style={{ height: 36, padding: "0 16px", fontSize: 13 }}
                        >
                          Send
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: 40, textAlign: "center", color: "var(--gray-500)" }}>
                  No recent activity matches the current filters.
                </div>
              )}
            </div>

            {/* Pagination footer */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 20px",
                borderTop: "1px solid var(--line)",
              }}
            >
              <span style={{ fontSize: 13, color: "var(--gray-500)" }}>
                Showing {processedRecentRows.length > 0 ? (recentPage - 1) * RECENT_ITEMS_PER_PAGE + 1 : 0} to{" "}
                {Math.min(processedRecentRows.length, recentPage * RECENT_ITEMS_PER_PAGE)} of{" "}
                {processedRecentRows.length} records
              </span>
              {recentTotalPages > 1 && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    disabled={recentPage === 1}
                    onClick={() => setRecentPage(recentPage - 1)}
                    style={{
                      padding: "6px 12px",
                      border: "1px solid var(--line)",
                      background: "transparent",
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: recentPage === 1 ? "not-allowed" : "pointer",
                      opacity: recentPage === 1 ? 0.5 : 1,
                    }}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={recentPage === recentTotalPages}
                    onClick={() => setRecentPage(recentPage + 1)}
                    style={{
                      padding: "6px 12px",
                      border: "1px solid var(--line)",
                      background: "transparent",
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: recentPage === recentTotalPages ? "not-allowed" : "pointer",
                      opacity: recentPage === recentTotalPages ? 0.5 : 1,
                    }}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
          )
        )}

        {/* ── SECTION 2: CUSTOMIZED KITS ── */}
        {activeSection === "customized" && (
          workspaceRows.length === 0 ? (
            <KitsSectionEmptyState
              title="No custom kits have been created yet"
              description={
                canCreateKits
                  ? "Create a custom kit to bundle products for your organization."
                  : "Your Company Admin hasn't created any custom kits for your organization yet."
              }
              secondary={
                canCreateKits
                  ? undefined
                  : "You can still send professionally curated gift kits from the Curated Kits tab."
              }
            />
          ) : (
          <div>
            {/* Toolbar */}
            <div
              className="kits-list-toolbar"
              style={{ border: "1px solid var(--line)", borderRadius: "12px 12px 0 0", background: "var(--bg-card)" }}
            >
              <div className="kits-tabs" aria-label="Kit filters">
                {(["all", "live", "draft", "archived"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`kits-tab${customTab === tab ? " kits-tab--active" : ""}`}
                    onClick={() => {
                      setCustomTab(tab);
                      setCustomPage(1);
                    }}
                  >
                    {tab === "all" ? "All kits" : tab === "draft" ? "Drafts" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                    <span>
                      {tab === "all"
                        ? workspaceRows.filter((r) => r.status !== "archived").length
                        : workspaceRows.filter((r) => r.status === tab).length}
                    </span>
                  </button>
                ))}
              </div>

              <div className="kits-tools">
                <div className="kits-search">
                  <Search size={16} aria-hidden="true" />
                  <input
                    placeholder="Search kits"
                    value={customSearch}
                    onChange={(e) => {
                      setCustomSearch(e.target.value);
                      setCustomPage(1);
                    }}
                  />
                </div>
                <button type="button" className="kits-tool-btn">
                  <SlidersHorizontal size={16} /> Filters
                </button>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <select
                    value={customSort}
                    onChange={(e) => {
                      setCustomSort(e.target.value as any);
                      setCustomPage(1);
                    }}
                    style={{
                      padding: "0 28px 0 12px",
                      borderRadius: 8,
                      border: "1px solid var(--line)",
                      background: "var(--bg-card)",
                      fontSize: 13,
                      fontWeight: 800,
                      height: 40,
                      appearance: "none",
                      cursor: "pointer",
                    }}
                  >
                    <option value="newest">Sort: Newest</option>
                    <option value="name">Sort: Name</option>
                    <option value="items">Sort: Items</option>
                  </select>
                  <ChevronDown
                    size={14}
                    style={{
                      position: "absolute",
                      right: 10,
                      pointerEvents: "none",
                      color: "var(--ink)",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Grid */}
            <div
              style={{
                background: "var(--bg-card)",
                borderLeft: "1px solid var(--line)",
                borderRight: "1px solid var(--line)",
                borderBottom: "1px solid var(--line)",
                padding: 24,
                borderRadius: "0 0 12px 12px",
              }}
            >
              {paginatedCustomRows.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
                  {paginatedCustomRows.map((row) => (
                    <div
                      key={row.id}
                      className="card"
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        padding: 0,
                        overflow: "hidden",
                        borderRadius: 12,
                        border: "1px solid var(--line)",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                      }}
                    >
                      <div
                        style={{
                          position: "relative",
                          height: 180,
                          background: "var(--gray-50)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: 16,
                        }}
                      >
                        {row.kit ? (
                          <Link
                            to={`/app/kits/${row.id}`}
                            style={{
                              width: "100%",
                              height: "100%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <img
                              src={row.image}
                              alt=""
                              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                            />
                          </Link>
                        ) : (
                          <img
                            src={row.image}
                            alt=""
                            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                          />
                        )}
                      </div>
                      <div
                        style={{
                          padding: 16,
                          flex: 1,
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                        }}
                      >
                        <div>
                          <h4 style={{ fontSize: 15, fontWeight: 800, color: "var(--ink)", margin: "0 0 6px 0" }}>
                            {row.name}
                          </h4>
                          <div
                            className="muted"
                            style={{
                              fontSize: 11,
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 12,
                              marginBottom: 16,
                              color: "var(--gray-500)",
                            }}
                          >
                            <span>
                              <b>ITEMS:</b> {row.items}
                            </span>
                            <span>
                              <b>STATUS:</b>{" "}
                              <span
                                className={`kits-status kits-status--${row.status}`}
                                style={{ display: "inline-flex", alignItems: "center", height: 18, fontSize: 10, padding: "0 6px" }}
                              >
                                <i style={{ marginRight: 4 }} />
                                {row.status === "live" ? "Live" : row.status === "archived" ? "Archived" : "Draft"}
                              </span>
                            </span>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => openRowPreview(row)}
                            style={previewBtnStyle}
                          >
                            Preview
                          </button>
                          {canSendKits && (
                            <button
                              type="button"
                              className="btn btn-brand btn-sm"
                              onClick={() => handleSendWorkspaceKit(row.kit)}
                              style={sendBtnStyle}
                            >
                              Send
                            </button>
                          )}
                          {canCreateKits ? <ThreeDotMenu kitRow={row} /> : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: 40, textAlign: "center", color: "var(--gray-500)" }}>
                  No customized kits match your filters.
                </div>
              )}

              {/* Pagination controls */}
              {customTotalPages > 1 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 24,
                    paddingTop: 16,
                    borderTop: "1px solid var(--line)",
                  }}
                >
                  <span style={{ fontSize: 13, color: "var(--gray-500)" }}>
                    Showing {processedCustomRows.length > 0 ? (customPage - 1) * GRID_ITEMS_PER_PAGE + 1 : 0} to{" "}
                    {Math.min(processedCustomRows.length, customPage * GRID_ITEMS_PER_PAGE)} of{" "}
                    {processedCustomRows.length} kits
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      disabled={customPage === 1}
                      onClick={() => setCustomPage(customPage - 1)}
                      style={{
                        padding: "6px 12px",
                        border: "1px solid var(--line)",
                        background: "transparent",
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: customPage === 1 ? "not-allowed" : "pointer",
                        opacity: customPage === 1 ? 0.5 : 1,
                      }}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={customPage === customTotalPages}
                      onClick={() => setCustomPage(customPage + 1)}
                      style={{
                        padding: "6px 12px",
                        border: "1px solid var(--line)",
                        background: "transparent",
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: customPage === customTotalPages ? "not-allowed" : "pointer",
                        opacity: customPage === customTotalPages ? 0.5 : 1,
                      }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          )
        )}

        {/* ── SECTION 3: CURATED KITS ── */}
        {activeSection === "curated" && (
          <div>
            {/* Toolbar */}
            <div
              className="kits-list-toolbar"
              style={{ border: "1px solid var(--line)", borderRadius: "12px 12px 0 0", background: "var(--bg-card)" }}
            >
              <div className="kits-tabs" aria-label="Kit filters">
                {(["all", "live", "draft", "archived"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`kits-tab${curatedTab === tab ? " kits-tab--active" : ""}`}
                    onClick={() => {
                      setCuratedTab(tab);
                      setCuratedPage(1);
                    }}
                  >
                    {tab === "all" ? "All kits" : tab === "draft" ? "Drafts" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                    <span>
                      {tab === "all"
                        ? curatedKitsRows.filter((r) => r.status !== "archived").length
                        : curatedKitsRows.filter((r) => r.status === tab).length}
                    </span>
                  </button>
                ))}
              </div>

              <div className="kits-tools">
                <div className="kits-search">
                  <Search size={16} aria-hidden="true" />
                  <input
                    placeholder="Search kits"
                    value={curatedSearch}
                    onChange={(e) => {
                      setCuratedSearch(e.target.value);
                      setCuratedPage(1);
                    }}
                  />
                </div>
                <button type="button" className="kits-tool-btn">
                  <SlidersHorizontal size={16} /> Filters
                </button>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <select
                    value={curatedSort}
                    onChange={(e) => {
                      setCuratedSort(e.target.value as any);
                      setCuratedPage(1);
                    }}
                    style={{
                      padding: "0 28px 0 12px",
                      borderRadius: 8,
                      border: "1px solid var(--line)",
                      background: "var(--bg-card)",
                      fontSize: 13,
                      fontWeight: 800,
                      height: 40,
                      appearance: "none",
                      cursor: "pointer",
                    }}
                  >
                    <option value="newest">Sort: Newest</option>
                    <option value="name">Sort: Name</option>
                    <option value="items">Sort: Items</option>
                  </select>
                  <ChevronDown
                    size={14}
                    style={{
                      position: "absolute",
                      right: 10,
                      pointerEvents: "none",
                      color: "var(--ink)",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Grid */}
            <div
              style={{
                background: "var(--bg-card)",
                borderLeft: "1px solid var(--line)",
                borderRight: "1px solid var(--line)",
                borderBottom: "1px solid var(--line)",
                padding: 24,
                borderRadius: "0 0 12px 12px",
              }}
            >
              {paginatedCuratedRows.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
                  {paginatedCuratedRows.map((row) => (
                    <div
                      key={row.id}
                      className="card"
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        padding: 0,
                        overflow: "hidden",
                        borderRadius: 12,
                        border: "1px solid var(--line)",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                      }}
                    >
                      <div
                        style={{
                          position: "relative",
                          height: 180,
                          background: "var(--gray-50)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: 16,
                        }}
                      >
                        <img
                          src={row.image}
                          alt=""
                          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                        />
                      </div>
                      <div
                        style={{
                          padding: 16,
                          flex: 1,
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                        }}
                      >
                        <div>
                          <h4 style={{ fontSize: 15, fontWeight: 800, color: "var(--ink)", margin: "0 0 6px 0" }}>
                            {row.name}
                          </h4>
                          <div
                            className="muted"
                            style={{
                              fontSize: 11,
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 12,
                              marginBottom: 16,
                              color: "var(--gray-500)",
                            }}
                          >
                            <span>
                              <b>ITEMS:</b> {row.items}
                            </span>
                            <span>
                              <b>STATUS:</b>{" "}
                              <span
                                className={`kits-status kits-status--${row.status}`}
                                style={{ display: "inline-flex", alignItems: "center", height: 18, fontSize: 10, padding: "0 6px" }}
                              >
                                <i style={{ marginRight: 4 }} />
                                {row.status === "live" ? "Live" : row.status === "archived" ? "Archived" : "Draft"}
                              </span>
                            </span>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => openRowPreview(row)}
                            style={previewBtnStyle}
                          >
                            Preview
                          </button>
                          {canSendKits && (
                            <button
                              type="button"
                              className="btn btn-brand btn-sm"
                              onClick={() => {
                                if (row.platformKit) {
                                  handleSendCuratedKit(row.platformKit, row.kit);
                                }
                              }}
                              style={sendBtnStyle}
                              disabled={ensureCuratedKit.isPending}
                            >
                              Send
                            </button>
                          )}
                          {canCreateKits ? <ThreeDotMenu kitRow={row} /> : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: 40, textAlign: "center", color: "var(--gray-500)" }}>
                  No curated kits match your filters.
                </div>
              )}

              {/* Pagination controls */}
              {curatedTotalPages > 1 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 24,
                    paddingTop: 16,
                    borderTop: "1px solid var(--line)",
                  }}
                >
                  <span style={{ fontSize: 13, color: "var(--gray-500)" }}>
                    Showing {processedCuratedRows.length > 0 ? (curatedPage - 1) * GRID_ITEMS_PER_PAGE + 1 : 0} to{" "}
                    {Math.min(processedCuratedRows.length, curatedPage * GRID_ITEMS_PER_PAGE)} of{" "}
                    {processedCuratedRows.length} kits
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      disabled={curatedPage === 1}
                      onClick={() => setCuratedPage(curatedPage - 1)}
                      style={{
                        padding: "6px 12px",
                        border: "1px solid var(--line)",
                        background: "transparent",
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: curatedPage === 1 ? "not-allowed" : "pointer",
                        opacity: curatedPage === 1 ? 0.5 : 1,
                      }}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={curatedPage === curatedTotalPages}
                      onClick={() => setCuratedPage(curatedPage + 1)}
                      style={{
                        padding: "6px 12px",
                        border: "1px solid var(--line)",
                        background: "transparent",
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: curatedPage === curatedTotalPages ? "not-allowed" : "pointer",
                        opacity: curatedPage === curatedTotalPages ? 0.5 : 1,
                      }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <KitPreviewDialog
        data={kitPreview}
        open={kitPreview !== null}
        onOpenChange={(open) => {
          if (!open) setKitPreview(null);
        }}
      />
    </section>
  );
}
