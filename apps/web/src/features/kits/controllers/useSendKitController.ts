import { useMemo, useReducer, useState, useEffect, useRef, type Dispatch } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { useWorkspace, useInvalidateWorkspace } from "@/hooks/useWorkspace";
import { formatWalletAmount } from "@/lib/walletFormat";
import type { UiContact, UiProduct } from "@/services/mappers";
import type { UiWallet } from "@/services/mappers";
import { ensureSpendEntityForWalletApi } from "@/services/mutations-api";
import { entityIdForWallet, spendableForWallet, walletsForCheckout } from "@/services/workspace-api";
import {
  curatedKitSendTotals,
  customisedKitSendTotals,
  netPriceExGst,
  sumCustomisedKitNetPrices,
  type KitSendTotals,
} from "@/features/send/money";
import { toSchedulePayload } from "@/features/send/types";
import {
  addRecipientsUpToLimit,
  mergePickerContacts,
  parseCsvEmails,
  parseEmailInput,
  selectAllRecipientIds,
} from "@/features/send/recipientSelection";
import { kitPickedIndices } from "../wizard/kitDraft";
import { useLaunchKitCampaign, useUpdateKit, useUploadKitArtwork, usePlatformKits } from "../model";
import type { UiKit } from "../model";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import {
  initialSendKitDraft,
  sendKitReducer,
  type SendKitAction,
  type SendKitDraft,
} from "../send/sendDraft";

/** No hard cap on kit recipients — use a large ceiling for shared helpers. */
const KIT_RECIPIENT_CEILING = 50_000;

const NO_SIZE_GROUPS = new Set([
  'bottle',
  'mug',
  'tumbler',
  'drinkware',
  'pen',
  'notebook',
  'pack',
  'bag',
  'cap',
  'hat',
  'keychain',
  'sticker',
  'tech',
  'charger',
  'speaker',
]);

const APPAREL_GROUPS = new Set([
  'tee',
  'hoodie',
  'polo',
  'shirt',
  'sweatshirt',
  'jacket',
  'pant',
  'pants',
  'shorts',
  'apron',
  'tank',
  'crew',
]);

const DEFAULT_APPAREL_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const STANDARD_SIZES = new Set(['XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL', '5XL']);

const GROUP_BY_CATEGORY: Record<string, string> = {
  Apparel: 'tee',
  Drinkware: 'bottle',
  Bags: 'bag',
  Technology: 'power',
  Office: 'note',
  'Health & Wellness': 'pillow',
  'Food & Beverages': 'bottle',
};

const DRINKWARE_NAME = /\bbottle\b|\bmug\b|\btumbler\b|\bflask\b|\bdrinkware\b/i;

function distinctVariantValues(variants: any[] | undefined, key: string): string[] {
  return [...new Set((variants || []).map((v) => v[key]).filter(Boolean))] as string[];
}

function effectiveProductGroup(product: UiProduct, ref: any = {}) {
  const fromProduct = String(product.g || '').toLowerCase().trim();
  if (fromProduct) return fromProduct;
  const fromCategory = GROUP_BY_CATEGORY[product.category || ''];
  if (fromCategory) return fromCategory.toLowerCase();
  return String(ref.group || '').toLowerCase().trim();
}

function isDrinkwareProduct(product: UiProduct, ref: any = {}) {
  const group = effectiveProductGroup(product, ref);
  const category = String(product.category || '').toLowerCase();
  const name = String(ref.name || product.nm || '');

  if (NO_SIZE_GROUPS.has(group) && !['pack', 'bag'].includes(group)) return true;
  if (/drink|bottle|mug|tumbler|beverage/.test(category)) return true;
  if (DRINKWARE_NAME.test(name)) return true;
  return false;
}

/** Sentinel matching API CURATED_VARIANT_KEY for curated kit appearance picks. */
export const CURATED_VARIANT_KEY = "__curated__";

function isApparelProduct(product: UiProduct, ref: any = {}) {
  if (isDrinkwareProduct(product, ref)) return false;
  const group = effectiveProductGroup(product, ref);
  const category = String(product.category || '').toLowerCase();
  return APPAREL_GROUPS.has(group) || category === 'apparel';
}

function hasStandardSizes(sizes: string[]) {
  return sizes.some((s) => STANDARD_SIZES.has(String(s).toUpperCase()));
}

export function resolveKitItemOptions(product: UiProduct, ref: any = {}) {
  const rawSizes = distinctVariantValues(product.variants, 'size');
  const rawColors = distinctVariantValues(product.variants, 'color');

  if (isDrinkwareProduct(product, ref)) {
    return {
      sizes: [],
      colors: rawColors,
      requiresSize: false,
      requiresColor: rawColors.length > 0,
    };
  }

  if (isApparelProduct(product, ref)) {
    let sizes = hasStandardSizes(rawSizes) ? rawSizes.filter((s) => STANDARD_SIZES.has(String(s).toUpperCase())) : [];
    if (!sizes.length) sizes = DEFAULT_APPAREL_SIZES;
    return {
      sizes,
      colors: rawColors,
      requiresSize: sizes.length > 0,
      requiresColor: rawColors.length > 0,
    };
  }

  return {
    sizes: rawSizes,
    colors: rawColors,
    requiresSize: rawSizes.length > 0,
    requiresColor: rawColors.length > 0,
  };
}

export function getCuratedKitMeta(kit: UiKit | undefined) {
  if (!kit?.designNotes) return null;
  try {
    const parsed = JSON.parse(kit.designNotes);
    if (parsed && parsed.curated) {
      return parsed as {
        curated: boolean;
        originalId: string;
        description: string;
        approxValueInr?: number;
        imageUrls: string[];
        heroImage?: string;
        itemImages?: Array<{ imageUrl: string; label?: string }>;
        variantImages?: string[];
        brandLogoUploaded?: boolean;
        brandLogoUrl?: string;
      };
    }
  } catch {
    // ignore
  }
  return null;
}

/** True when the tenant has uploaded a brand logo (not just the platform hero image). */
export function curatedKitHasBrandLogo(kit: UiKit | undefined) {
  const meta = getCuratedKitMeta(kit);
  if (!meta) return false;
  if (meta.brandLogoUploaded && (kit?.artworkUrl || meta.brandLogoUrl)) return true;
  const hero = String(meta.heroImage || meta.imageUrls?.[0] || "").trim();
  const art = String(kit?.artworkUrl || "").trim();
  if (!art) return false;
  if (!hero) return true;
  return art !== hero;
}

export type SendKitStep = 0 | 1 | 2 | 3 | 4;

export type SendKitVm = {
  isLoading: boolean;
  isSending: boolean;
  notFound: boolean;
  kit: UiKit | undefined;
  account: string | undefined;
  shopName: string | undefined;
  step: SendKitStep;
  draft: SendKitDraft;
  dispatch: Dispatch<SendKitAction>;
  contacts: UiContact[];
  /** Workspace contacts plus any manually added email recipients. */
  pickerContacts: UiContact[];
  catalog: UiProduct[];
  /** Line items for checkout kit price breakdown. */
  pricedItems: Array<{ id: string; name: string; priceInr: number; mockupUrl?: string }>;
  kitUnitPrice: number;
  /** True when this workspace kit was cloned from a curated platform template. */
  isCuratedKit: boolean;
  totals: KitSendTotals;
  surpriseMissing: UiContact[];
  wallet: UiWallet | undefined;
  wallets: UiWallet[];
  selectedWalletId: string | undefined;
  onWalletSelect: (walletId: string) => void;
  walletAvailable: (wallet: UiWallet) => number;
  onSelectAllRecips: () => void;
  onAddRecipientEmails: (raw: string) => void;
  onImportRecipientCsv: (file: File) => void;
  onExit: () => void;
  onNext: () => void;
  onBack: () => void;
  onPayAndSend: () => void;
  kitName: string;
  setKitName: (name: string) => void;
  /** Curated kits: logo upload on Items step. */
  curatedLogoPreview: string;
  hasCuratedLogo: boolean;
  isUploadingCuratedLogo: boolean;
  onCuratedLogoFile: (file: File | null) => void;
};

function missingAddress(contacts: UiContact[], selected: string[]): UiContact[] {
  return contacts.filter(
    (c) => selected.includes(c.id) && (!c.address || !c.city || !c.state || !c.pincode),
  );
}

/** Controller for the send-kit wizard: recipient/experience/checkout state, pay flow. */
export function useSendKitController(): SendKitVm {
  const navigate = useNavigate();
  const { id } = useParams() as { id: string };
  const { data: workspace, isLoading } = useWorkspace();
  const refreshWorkspace = useInvalidateWorkspace();
  const launch = useLaunchKitCampaign();
  const updateKit = useUpdateKit();
  const uploadArtwork = useUploadKitArtwork();
  const [step, setStep] = useState<SendKitStep>(0);
  const [sending, setSending] = useState(false);
  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [curatedLogoPreview, setCuratedLogoPreview] = useState("");
  const logoObjectUrlRef = useRef<string | null>(null);

  const catalog: UiProduct[] = useMemo(() => workspace?.catalogProducts ?? [], [workspace]);
  const contacts: UiContact[] = useMemo(() => workspace?.contacts ?? [], [workspace]);
  const kit = workspace?.kits.find((k) => k.id === id);

  const [kitName, setKitName] = useState("");

  useEffect(() => {
    if (kit) {
      setKitName(kit.name);
    }
  }, [kit]);

  const initial = useMemo(() => {
    const picked = kit ? kitPickedIndices(kit, catalog) : [];
    // Premium packaging is the default at send time.
    const packaging: "none" | "box" = "box";
    const firstRecips = contacts.slice(0, 2).map((c) => c.id);
    return initialSendKitDraft(picked, packaging, firstRecips, workspace?.account ?? "Shelf Merch");
  }, [kit, catalog, contacts, workspace?.account]);

  const [draft, dispatch] = useReducer(sendKitReducer, initial);
  const seededKitId = useRef<string | null>(null);

  // Seed draft once kit data is available (workspace may load after first render).
  useEffect(() => {
    if (!kit?.id) return;
    if (seededKitId.current === kit.id) return;
    seededKitId.current = kit.id;
    const picked = kitPickedIndices(kit, catalog);
    const firstRecips = contacts.slice(0, 2).map((c) => c.id);
    dispatch({
      type: "hydrate",
      draft: initialSendKitDraft(
        picked,
        "box",
        firstRecips,
        workspace?.account ?? "Shelf Merch",
      ),
    });
  }, [kit, catalog, contacts, workspace?.account]);

  const pickerContacts = useMemo(
    () => mergePickerContacts(contacts, draft.selRecips),
    [contacts, draft.selRecips],
  );

  const pricedItems = useMemo(() => {
    if (!kit) return [];
    return draft.picked
      .map((idx) => {
        const product = catalog[idx];
        if (!product) return null;
        const ref = kit.productRefs?.find((r) => r.catalogProductId === product.id);
        return {
          id: product.id || product.nm,
          name: product.nm,
          priceInr: netPriceExGst(Number(product.basePriceInr) || 0, product.category),
          mockupUrl: ref?.mockupUrl || product.mockupUrl || "",
        };
      })
      .filter(Boolean) as Array<{ id: string; name: string; priceInr: number; mockupUrl?: string }>;
  }, [kit, draft.picked, catalog]);

  const { data: platformKits } = usePlatformKits();

  const isCuratedKit = !!getCuratedKitMeta(kit);

  useEffect(() => {
    if (!kit || !isCuratedKit) return;
    if (logoObjectUrlRef.current) return; // keep local blob preview while uploading
    const meta = getCuratedKitMeta(kit);
    const url = meta?.brandLogoUrl || (curatedKitHasBrandLogo(kit) ? kit.artworkUrl : "") || "";
    if (url) setCuratedLogoPreview(resolveMediaUrl(url) || url);
  }, [kit, isCuratedKit]);

  useEffect(() => {
    return () => {
      if (logoObjectUrlRef.current) URL.revokeObjectURL(logoObjectUrlRef.current);
    };
  }, []);

  const hasCuratedLogo = curatedKitHasBrandLogo(kit) || Boolean(curatedLogoPreview);

  const pickedProducts = useMemo(
    () => draft.picked.map((idx) => catalog[idx]).filter(Boolean) as UiProduct[],
    [draft.picked, catalog],
  );

  const curatedPricePerKit = useMemo(() => {
    if (!isCuratedKit) return 0;
    const meta = getCuratedKitMeta(kit);
    if (meta?.approxValueInr && meta.approxValueInr > 0) {
      return Math.round(meta.approxValueInr);
    }
    const platformKit = platformKits?.find(
      (k) => String(k._id) === String(meta?.originalId),
    );
    if (platformKit?.approxValueInr && platformKit.approxValueInr > 0) {
      return Math.round(platformKit.approxValueInr);
    }
    if (kit?.kitPrice && kit.kitPrice > 0) return Math.round(kit.kitPrice);
    return 0;
  }, [isCuratedKit, kit, platformKits]);

  const totals = useMemo(() => {
    if (!isCuratedKit) {
      return customisedKitSendTotals(draft.selRecips.length, draft.pkg, pickedProducts);
    }
    return curatedKitSendTotals(draft.selRecips.length, curatedPricePerKit, draft.pkg);
  }, [isCuratedKit, draft.selRecips.length, draft.pkg, pickedProducts, curatedPricePerKit]);

  const checkoutWallets = useMemo(
    () => (workspace ? walletsForCheckout(workspace) : []),
    [workspace],
  );
  const wallet =
    checkoutWallets.find((w) => w.id === selectedWalletId) ?? checkoutWallets[0];

  const kitUnitPrice = isCuratedKit
    ? curatedPricePerKit
    : sumCustomisedKitNetPrices(pickedProducts);
  const surpriseMissing =
    draft.mode === "surprise" ? missingAddress(pickerContacts, draft.selRecips) : [];

  function reportRecipientAddResult(result: {
    added: string[];
    invalid: string[];
    duplicates: string[];
    truncated: number;
  }) {
    if (result.invalid.length) {
      toast.error(
        `Skipped ${result.invalid.length} invalid email${result.invalid.length === 1 ? "" : "s"}`,
      );
    }
    if (result.duplicates.length) {
      toast.message(
        `Skipped ${result.duplicates.length} duplicate${result.duplicates.length === 1 ? "" : "s"}`,
      );
    }
    if (result.truncated > 0) {
      toast.error("Could not add all recipients");
    }
    if (result.added.length) {
      toast.success(
        `Added ${result.added.length} recipient${result.added.length === 1 ? "" : "s"}`,
      );
    } else if (!result.invalid.length && !result.duplicates.length && !result.truncated) {
      toast.error("No new recipients to add");
    }
  }

  function onSelectAllRecips() {
    if (!contacts.length) {
      toast.message("No contacts in your workspace yet — use Input emails or Add by CSV");
      return;
    }
    const ids = selectAllRecipientIds(contacts, draft.selRecips, KIT_RECIPIENT_CEILING);
    if (ids.length === draft.selRecips.length) {
      toast.message("All available contacts are already selected");
      return;
    }
    dispatch({ type: "setSelRecips", selRecips: ids });
  }

  function onAddRecipientEmails(raw: string) {
    const { ids, result } = addRecipientsUpToLimit(
      parseEmailInput(raw),
      draft.selRecips,
      contacts,
      KIT_RECIPIENT_CEILING,
    );
    dispatch({ type: "setSelRecips", selRecips: ids });
    reportRecipientAddResult(result);
  }

  function onImportRecipientCsv(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const { ids, result } = addRecipientsUpToLimit(
        parseCsvEmails(text),
        draft.selRecips,
        contacts,
        KIT_RECIPIENT_CEILING,
      );
      dispatch({ type: "setSelRecips", selRecips: ids });
      reportRecipientAddResult(result);
    };
    reader.onerror = () => toast.error("Could not read CSV file");
    reader.readAsText(file);
  }

  function onNext() {
    if (step === 0) {
      if (isCuratedKit && !hasCuratedLogo) {
        toast.error("Please upload a logo before continuing");
        return;
      }
      if (kit && kitName.trim() && kitName !== kit.name) {
        updateKit.mutateAsync({
          id: kit.id,
          name: kitName.trim(),
          pickedIndices: kitPickedIndices(kit, catalog),
          catalog,
        }).catch((err) => {
          console.error("Failed to rename kit:", err);
        });
      }
      setStep(1);
      return;
    }
    if (step === 1) {
      if (!draft.selRecips.length) {
        toast.error("Select at least one recipient");
        return;
      }
      if (draft.mode === "surprise" && surpriseMissing.length) {
        toast.error("Complete the shipping address for all surprise recipients");
        return;
      }
      if (draft.mode === "single") {
        const l = draft.singleLocation;
        if (!l.name || !l.email.includes("@") || !l.line1 || !l.city || !l.state || !l.pincode) {
          toast.error("Enter the location contact, email, and complete shipping address");
          return;
        }
      }
      const isCurated = !!getCuratedKitMeta(kit);
      if ((draft.mode === "surprise" || draft.mode === "single")) {
        const missingList: string[] = [];
        if (isCurated) {
          const meta = getCuratedKitMeta(kit);
          const variantImages =
            meta?.variantImages?.length
              ? meta.variantImages
              : platformKits?.find((k) => String(k._id) === String(meta?.originalId))?.variantImages ||
                [];
          if (variantImages.length) {
            for (const rid of draft.selRecips) {
              const contact = pickerContacts.find((c) => c.id === rid);
              const name = contact?.name || "Recipient";
              const sel = draft.recipVariants[rid]?.[CURATED_VARIANT_KEY];
              if (!sel?.variantImage) missingList.push(`${name}'s kit variant`);
            }
          }
        } else {
          const pickedProds = draft.picked.map((idx) => catalog[idx]).filter(Boolean);
          for (const rid of draft.selRecips) {
            const contact = pickerContacts.find((c) => c.id === rid);
            const name = contact?.name || "Recipient";
            const variants = draft.recipVariants[rid] || {};
            for (const prod of pickedProds) {
              const ref = kit?.productRefs?.find((r) => r.catalogProductId === prod.id) ?? {};
              const opts = resolveKitItemOptions(prod, ref);
              const sel = variants[prod.id || ""] || {};
              if (opts.requiresSize && !sel.size) missingList.push(`${name}'s size for ${prod.nm}`);
              if (opts.requiresColor && !sel.color) missingList.push(`${name}'s color for ${prod.nm}`);
            }
          }
        }
        if (missingList.length > 0) {
          toast.error(`Please select variants: missing ${missingList.slice(0, 3).join(", ")}${missingList.length > 3 ? ` and ${missingList.length - 3} more` : ""}`);
          return;
        }
      }
    }
    setStep((s) => Math.min(s + 1, 4) as SendKitStep);
  }

  async function resolveEntityId(walletId: string | undefined): Promise<string | undefined> {
    if (!walletId || !workspace) return undefined;

    const local = entityIdForWallet(workspace, walletId);
    if (local) return local;

    if (workspace.userPatch.role === "entity_manager") return undefined;

    return ensureSpendEntityForWalletApi(walletId);
  }

  async function onPayAndSend() {
    const walletId = selectedWalletId || checkoutWallets[0]?.id || workspace?.wallets[0]?.id;
    let entityId: string | undefined;
    try {
      entityId = await resolveEntityId(walletId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resolve wallet budget");
      return;
    }
    if (!entityId) {
      toast.error("No budget department found for this wallet — allocate funds first");
      return;
    }
    if (!draft.selRecips.length) {
      toast.error("Select at least one recipient");
      return;
    }
    const paymentTotal = Math.round(totals.total);
    if (draft.pay === "wallet") {
      const available = walletId && workspace ? spendableForWallet(workspace, walletId) : 0;
      const payWallet = walletId ? workspace?.wallets.find((w) => w.id === walletId) : undefined;
      if (available < paymentTotal) {
        toast.error(
          `Insufficient wallet balance — add more funds to continue. ${formatWalletAmount(available, payWallet?.cur)} available, ${formatWalletAmount(paymentTotal, payWallet?.cur)} required.`,
        );
        return;
      }
    }
    setSending(true);
    try {
      if (kit && kit.status !== "live") {
        await updateKit.mutateAsync({
          id: kit.id,
          pickedIndices: kitPickedIndices(kit, catalog),
          catalog,
          status: "live",
        });
      }
      await launch.mutateAsync({
        entityId: String(entityId),
        kitId: String(kit!.id),
        name: kit!.name,
        totalBudget: paymentTotal,
        packaging: draft.pkg,
        fulfillmentMode:
          draft.mode === "surprise" ? "surprise" : draft.mode === "single" ? "single" : "redeem",
        singleLocation: draft.mode === "single" ? draft.singleLocation : undefined,
        message: { from: draft.from, body: draft.msg },
        schedule: toSchedulePayload(draft.when, draft.schedule),
        contactIds: draft.selRecips,
        contacts: pickerContacts.map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
        })),
        recipVariants: draft.recipVariants,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send kit");
      return;
    } finally {
      setSending(false);
    }

    toast.success(
      draft.when === "sched"
        ? `Kit scheduled — wallet debited. Recipients will be notified at the scheduled time.`
        : `Order placed for ${draft.selRecips.length} recipients! 📦`,
    );
    navigate("/app/orders");
    void refreshWorkspace().catch(() => undefined);
  }

  async function onCuratedLogoFile(file: File | null) {
    if (!kit || !file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file (PNG, JPG, or SVG)");
      return;
    }
    if (logoObjectUrlRef.current) URL.revokeObjectURL(logoObjectUrlRef.current);
    const localUrl = URL.createObjectURL(file);
    logoObjectUrlRef.current = localUrl;
    setCuratedLogoPreview(localUrl);
    try {
      const updated = await uploadArtwork.mutateAsync({
        kitId: kit.id,
        artwork: { file, preview: localUrl, name: file.name },
      });
      const saved = updated.artworkUrl ? resolveMediaUrl(updated.artworkUrl) || updated.artworkUrl : localUrl;
      if (logoObjectUrlRef.current) {
        URL.revokeObjectURL(logoObjectUrlRef.current);
        logoObjectUrlRef.current = null;
      }
      setCuratedLogoPreview(saved);
      toast.success("Logo uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload logo");
      setCuratedLogoPreview("");
      if (logoObjectUrlRef.current) {
        URL.revokeObjectURL(logoObjectUrlRef.current);
        logoObjectUrlRef.current = null;
      }
    }
  }

  return {
    isLoading: isLoading && !workspace,
    isSending: sending || launch.isPending,
    notFound: !isLoading && !!workspace && !kit,
    kit,
    account: workspace?.account,
    shopName: workspace?.shops[0]?.name,
    step,
    draft,
    dispatch,
    contacts,
    pickerContacts,
    catalog,
    pricedItems,
    kitUnitPrice,
    isCuratedKit,
    totals,
    surpriseMissing,
    wallet,
    wallets: checkoutWallets,
    selectedWalletId: selectedWalletId || checkoutWallets[0]?.id,
    onWalletSelect: setSelectedWalletId,
    walletAvailable: (w) => (workspace ? spendableForWallet(workspace, w.id) : 0),
    onSelectAllRecips,
    onAddRecipientEmails,
    onImportRecipientCsv,
    onExit: () => navigate("/app/kits"),
    onNext,
    onBack: () => setStep((s) => Math.max(s - 1, 0) as SendKitStep),
    onPayAndSend,
    kitName,
    setKitName,
    curatedLogoPreview,
    hasCuratedLogo,
    isUploadingCuratedLogo: uploadArtwork.isPending,
    onCuratedLogoFile,
  };
}
