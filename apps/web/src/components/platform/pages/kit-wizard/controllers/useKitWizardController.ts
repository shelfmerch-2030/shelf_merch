import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { formatErrorDetails } from "@/lib/errorMessage";
import {
  addKitItem,
  CAMPAIGN_TYPES,
  createKit,
  emptyKitDetails,
  fetchPlatformProducts,
  getPlatformKit,
  getPlatformProduct,
  KIT_WIZARD_STEPS,
  publishKit,
  removeKitImage,
  removeKitItem,
  type KitInput,
  type KitItem,
  type KitItemImage,
  type KitVariantImage,
  type PlatformKit,
  type ProductRow,
  type ProductVariant,
  updateKit,
  updateKitImageRoles,
  uploadKitImages,
} from "../model";
import { normalizeVariantImages } from "@/lib/kitVariantImages";

export type KitWizardVm = ReturnType<typeof useKitWizardController>;
export type KitImageUploadRole = "gallery" | "hero" | "item" | "variant";

/** Controller for the platform kit create/edit wizard. */
export function useKitWizardController(mode: "create" | "edit", kitId?: string) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [problems, setProblems] = useState<string[]>([]);

  const [id, setId] = useState<string | undefined>(kitId);
  const [details, setDetails] = useState<KitInput>(emptyKitDetails);
  const [kit, setKit] = useState<PlatformKit | null>(null);

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [pickProductId, setPickProductId] = useState("");
  const [pickVariants, setPickVariants] = useState<ProductVariant[]>([]);
  const [pickVariantSku, setPickVariantSku] = useState("");
  const [pickQty, setPickQty] = useState(1);

  const [heroImage, setHeroImage] = useState("");
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [itemImages, setItemImages] = useState<KitItemImage[]>([]);
  const [variantImages, setVariantImages] = useState<KitVariantImage[]>([]);

  useEffect(() => {
    fetchPlatformProducts({ status: "active", limit: 200 })
      .then((res) => setProducts(res.items as ProductRow[]))
      .catch(() => setProducts([]));
  }, []);

  useEffect(() => {
    if (mode !== "edit" || !kitId) return;
    getPlatformKit(kitId)
      .then((k) => {
        setKit(k);
        setDetails({
          name: k.name,
          description: k.description ?? "",
          packaging: k.packaging,
          eligibleCampaignTypes: k.eligibleCampaignTypes ?? [],
          approxValueInr: k.approxValueInr ?? 0,
          rules: {
            ...emptyKitDetails.rules,
            ...(k.rules || {}),
            // Existing kits without the field stay required until turned off.
            requireLogo: k.rules?.requireLogo !== false,
          },
        });
        setHeroImage(k.heroImage || "");
        setGalleryImages(k.galleryImages || []);
        setItemImages(
          (k.itemImages || []).map((it) => ({
            imageUrl: it.imageUrl,
            label: it.label || "",
          })),
        );
        setVariantImages(normalizeVariantImages(k.variantImages));
      })
      .catch((e) => setError(e.message));
  }, [mode, kitId]);

  const productName = (pid: string) => products.find((p) => p._id === pid)?.name ?? pid;
  const set = <K extends keyof KitInput>(k: K, v: KitInput[K]) =>
    setDetails((d) => ({ ...d, [k]: v }));
  const setRule = (k: keyof NonNullable<KitInput["rules"]>, v: boolean | number) =>
    setDetails((d) => ({
      ...d,
      rules: { ...emptyKitDetails.rules, ...d.rules, [k]: v },
    }));

  /** Always send an explicit requireLogo boolean so false is never dropped. */
  function rulesPayload() {
    const r = { ...emptyKitDetails.rules!, ...details.rules };
    return { ...r, requireLogo: r.requireLogo === true };
  }

  function syncImageRolesFromKit(k: PlatformKit) {
    setHeroImage(k.heroImage || "");
    setGalleryImages(k.galleryImages || []);
    setItemImages(
      (k.itemImages || []).map((it) => ({
        imageUrl: it.imageUrl,
        label: it.label || "",
      })),
    );
    setVariantImages(normalizeVariantImages(k.variantImages));
  }

  async function refresh() {
    if (!id) return;
    const k = await getPlatformKit(id);
    setKit(k);
    syncImageRolesFromKit(k);
  }

  async function saveDetails() {
    setBusy(true);
    setError("");
    try {
      const rules = rulesPayload();
      // Keep local state in sync with the explicit boolean we persist.
      setDetails((d) => ({ ...d, rules }));
      if (id) {
        // Only patch fields the details step edits — never send gallery/image defaults.
        await updateKit(id, {
          name: details.name,
          description: details.description,
          packaging: details.packaging,
          eligibleCampaignTypes: details.eligibleCampaignTypes,
          approxValueInr: details.approxValueInr,
          rules,
        });
        await refresh();
      } else {
        const created = await createKit({ ...details, rules });
        setId(created._id);
        setKit(created);
      }
      setStep(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function onPickProduct(pid: string) {
    setPickProductId(pid);
    setPickVariantSku("");
    setPickVariants([]);
    if (!pid) return;
    try {
      const full = await getPlatformProduct(pid);
      setPickVariants(full.variants ?? []);
    } catch {
      setPickVariants([]);
    }
  }

  async function addItem() {
    if (!id || !pickProductId) return;
    setBusy(true);
    setError("");
    try {
      const item: KitItem = { catalogProductId: pickProductId, variantSku: pickVariantSku, qty: pickQty };
      await addKitItem(id, item);
      setPickProductId("");
      setPickVariants([]);
      setPickVariantSku("");
      setPickQty(1);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add item");
    } finally {
      setBusy(false);
    }
  }

  async function dropItem(itemId?: string) {
    if (!id || !itemId) return;
    await removeKitItem(id, itemId);
    await refresh();
  }

  async function dropImage(imageUrl: string) {
    if (!id || !imageUrl) return;
    if (!window.confirm("Remove this image from the kit?")) return;
    setBusy(true);
    setError("");
    try {
      await removeKitImage(id, imageUrl);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove image");
    } finally {
      setBusy(false);
    }
  }

  async function uploadImagesForRole(files: FileList | null, role: KitImageUploadRole) {
    if (!id || !files?.length) return;
    setBusy(true);
    setError("");
    try {
      const beforeUrls = new Set(kit?.imageUrls ?? []);
      await uploadKitImages(id, Array.from(files));
      const k = await getPlatformKit(id);
      const newUrls = (k.imageUrls ?? []).filter((url) => !beforeUrls.has(url));

      let nextHero = heroImage;
      let nextItems = [...itemImages];
      let nextVariants = [...variantImages];

      if (role === "hero" && newUrls.length > 0) {
        nextHero = newUrls[0];
      } else if (role === "item") {
        for (const url of newUrls) {
          if (!nextItems.some((it) => it.imageUrl === url)) {
            nextItems.push({ imageUrl: url, label: "" });
          }
        }
      } else if (role === "variant") {
        for (const url of newUrls) {
          if (!nextVariants.some((v) => v.imageUrl === url)) {
            nextVariants.push({ imageUrl: url, label: "" });
          }
        }
      }

      if (role !== "gallery") {
        await updateKitImageRoles(id, {
          heroImage: nextHero || undefined,
          galleryImages,
          itemImages: nextItems,
          variantImages: nextVariants,
        });
        setHeroImage(nextHero);
        setItemImages(nextItems);
        setVariantImages(nextVariants);
      }

      setKit(k);
      if (role === "gallery") {
        syncImageRolesFromKit(k);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function uploadImages(files: FileList | null) {
    await uploadImagesForRole(files, "gallery");
  }

  function toggleGalleryImage(url: string) {
    setGalleryImages((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url],
    );
  }

  function toggleItemImage(url: string) {
    setItemImages((prev) => {
      const exists = prev.find((it) => it.imageUrl === url);
      if (exists) return prev.filter((it) => it.imageUrl !== url);
      return [...prev, { imageUrl: url, label: "" }];
    });
  }

  function setItemLabel(url: string, label: string) {
    setItemImages((prev) =>
      prev.map((it) => (it.imageUrl === url ? { ...it, label } : it)),
    );
  }

  function toggleVariantImage(url: string) {
    setVariantImages((prev) => {
      const exists = prev.find((v) => v.imageUrl === url);
      if (exists) return prev.filter((v) => v.imageUrl !== url);
      return [...prev, { imageUrl: url, label: "" }];
    });
  }

  function setVariantLabel(url: string, label: string) {
    setVariantImages((prev) =>
      prev.map((v) => (v.imageUrl === url ? { ...v, label } : v)),
    );
  }

  async function persistImageRoles() {
    if (!id) return;
    await updateKitImageRoles(id, {
      heroImage: heroImage || undefined,
      galleryImages,
      itemImages,
      variantImages,
    });
    await refresh();
  }

  async function saveImageRolesAndContinue() {
    if (!id) return;
    const urls = kit?.imageUrls ?? [];
    if (urls.length > 0 && !heroImage) {
      setError("Select exactly one hero image");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await persistImageRoles();
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save image roles");
    } finally {
      setBusy(false);
    }
  }

  async function doPublish() {
    if (!id) return;
    setBusy(true);
    setError("");
    setProblems([]);
    try {
      // Persist details/rules before publish — step chips can skip "Continue" on step 0,
      // which would otherwise leave toggles like requireLogo unsaved.
      const rules = rulesPayload();
      setDetails((d) => ({ ...d, rules }));
      await updateKit(id, {
        name: details.name,
        description: details.description,
        packaging: details.packaging,
        eligibleCampaignTypes: details.eligibleCampaignTypes,
        approxValueInr: details.approxValueInr,
        rules,
      });
      // Save image roles if user jumped to review without pressing Continue on step 2.
      const urls = kit?.imageUrls ?? [];
      if (urls.length > 0 && heroImage) {
        await persistImageRoles();
      }
      await publishKit(id);
      navigate("/platform/kits");
    } catch (e) {
      const body = (e as { details?: { error?: { details?: unknown } } }).details;
      setProblems(formatErrorDetails(body?.error?.details));
      setError(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  const rules = details.rules ?? emptyKitDetails.rules!;
  const imported = !!kit?.source?.provider && kit.source.provider !== "manual";

  return {
    mode,
    steps: KIT_WIZARD_STEPS,
    campaignTypes: CAMPAIGN_TYPES,
    step,
    busy,
    error,
    problems,
    id,
    details,
    kit,
    products,
    pickProductId,
    pickVariants,
    pickVariantSku,
    pickQty,
    rules,
    imported,
    heroImage,
    galleryImages,
    itemImages,
    variantImages,
    productName,
    onBack: () => navigate("/platform/kits"),
    onStep: setStep,
    onSet: set,
    onSetRule: setRule,
    onSaveDetails: saveDetails,
    onPickProduct,
    onPickVariantSku: setPickVariantSku,
    onPickQty: setPickQty,
    onAddItem: addItem,
    onDropItem: dropItem,
    onRemoveImage: dropImage,
    onUploadImages: uploadImages,
    onUploadImagesForRole: uploadImagesForRole,
    onSelectHero: setHeroImage,
    onToggleGalleryImage: toggleGalleryImage,
    onToggleItemImage: toggleItemImage,
    onSetItemLabel: setItemLabel,
    onToggleVariantImage: toggleVariantImage,
    onSetVariantLabel: setVariantLabel,
    onSaveImageRoles: saveImageRolesAndContinue,
    onPublish: doPublish,
    onSaveDraft: () => navigate("/platform/kits"),
  };
}
