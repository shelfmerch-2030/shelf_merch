import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { isPlaceholderColorHex, resolveColorHex } from "@/lib/colorMap";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import {
  addVariant,
  createProduct,
  emptyProductDetails,
  emptyVariant,
  getPlatformProduct,
  MANUAL_CATEGORIES,
  PRODUCT_WIZARD_STEPS,
  SUBCATEGORIES_BY_CATEGORY,
  publishProduct,
  setPrintAreas,
  setProductRoleImageByUrl,
  type PhysicalDimensions,
  type PlatformProduct,
  type PrintArea,
  type ProductInput,
  type ProductVariant,
  updateProduct,
  updateVariant,
  uploadProductImage,
  type ProductImageRole,
} from "../model";
import { DEFAULT_DPI, DEFAULT_PHYSICAL, resolvePhysical } from "@/lib/printCoords";

export type ProductWizardVm = ReturnType<typeof useProductWizardController>;
export type ProductImageView = "front" | "back" | "left" | "right";

const IMAGE_VIEWS: Array<{ key: ProductImageView; label: string }> = [
  { key: "front", label: "Front view" },
  { key: "back", label: "Back view" },
  { key: "left", label: "Left side" },
  { key: "right", label: "Right side" },
];

const VIEW_ROLES: Record<ProductImageView, { base: ProductImageRole; mask: ProductImageRole }> = {
  front: { base: "base", mask: "mask" },
  back: { base: "base_back", mask: "mask_back" },
  left: { base: "base_left", mask: "mask_left" },
  right: { base: "base_right", mask: "mask_right" },
};

/** Controller for the platform product create/edit wizard. */
export function useProductWizardController(mode: "create" | "edit", productId?: string) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [problems, setProblems] = useState<string[]>([]);

  const [id, setId] = useState<string | undefined>(productId);
  const [details, setDetails] = useState<ProductInput>(emptyProductDetails);
  const [variant, setVariant] = useState<ProductVariant>(emptyVariant);
  const [product, setProduct] = useState<PlatformProduct | null>(null);
  const [printAreas, setAreas] = useState<PrintArea[]>([]);
  const [physicalDimensions, setPhysicalDimensions] = useState<PhysicalDimensions>({
    ...DEFAULT_PHYSICAL,
  });
  const [dpi, setDpi] = useState(DEFAULT_DPI);
  const [previewColor, setPreviewColor] = useState<string>("");
  const [imageView, setImageView] = useState<ProductImageView>("front");
  const [marketingIndex, setMarketingIndex] = useState(0);

  const categoryOptions = useMemo(
    () =>
      Array.from(new Set([...MANUAL_CATEGORIES, ...(details.category ? [details.category] : [])])).sort((a, b) =>
        a.localeCompare(b),
      ),
    [details.category],
  );
  const subcategoryOptions = useMemo(() => {
    const mapped = SUBCATEGORIES_BY_CATEGORY[details.category as keyof typeof SUBCATEGORIES_BY_CATEGORY] ?? [];
    return Array.from(new Set([...mapped, ...(details.subcategory ? [details.subcategory] : [])]));
  }, [details.category, details.subcategory]);

  useEffect(() => {
    if (mode !== "edit" || !productId) return;
    getPlatformProduct(productId)
      .then((p) => {
        const categoryRequiresAdminChoice =
          p.source?.provider === "shopify" && p.status === "draft" && !p.source?.categoryAssignedByAdmin;
        setProduct(p);
        setAreas(p.printAreas ?? []);
        setPhysicalDimensions(resolvePhysical(p.physicalDimensions));
        setDpi(p.dpi && p.dpi > 0 ? p.dpi : DEFAULT_DPI);
        setDetails({
          name: p.name,
          category: categoryRequiresAdminChoice ? "" : p.category,
          subcategory: categoryRequiresAdminChoice ? "" : (p.subcategory ?? ""),
          sellingPriceInr: p.sellingPriceInr,
          costPriceInr: p.costPriceInr,
          brand: p.brand ?? "",
          description: p.description ?? "",
          keyFeatures: p.keyFeatures ?? "",
          sizeGuide: p.sizeGuide ?? "",
          gstRate: p.gstRate ?? 18,
          hsnCode: p.hsnCode ?? "",
          moq: p.moq ?? 1,
          material: p.material ?? "",
          productionDays: p.productionDays ?? 7,
        });
      })
      .catch((e) => setError(e.message));
  }, [mode, productId]);

  const set = <K extends keyof ProductInput>(k: K, v: ProductInput[K]) =>
    setDetails((d) => {
      const next = { ...d, [k]: v };
      if (k === "category") {
        const mapped = SUBCATEGORIES_BY_CATEGORY[String(v) as keyof typeof SUBCATEGORIES_BY_CATEGORY] ?? [];
        if (!mapped.includes(String(d.subcategory || ""))) next.subcategory = "";
      }
      return next;
    });

  const colorSwatches = useMemo(() => {
    const seen = new Map<string, { name: string; hex: string }>();
    for (const v of product?.variants ?? []) {
      const name = (v.color || "").trim();
      const hex = resolveColorHex(name, v.colorHex);
      if (!name && isPlaceholderColorHex(v.colorHex)) continue;
      const key = (name || hex).toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.set(key, { name: name || hex, hex });
    }
    return [...seen.values()];
  }, [product?.variants]);

  useEffect(() => {
    if (step !== 2 || !id) return;
    refresh().catch((e) => setError(e instanceof Error ? e.message : "Failed to load variants"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, id]);

  useEffect(() => {
    if (!colorSwatches.length) {
      setPreviewColor("");
      return;
    }
    setPreviewColor((cur) => (colorSwatches.some((c) => c.name === cur) ? cur : colorSwatches[0].name));
  }, [colorSwatches]);

  const activeSwatch = colorSwatches.find((c) => c.name === previewColor) ?? colorSwatches[0];
  const firstHex = activeSwatch?.hex;
  const legacyShopifyImageInMask =
    product?.source?.provider === "shopify" &&
    !product.primaryImageUrl &&
    !product.imageUrls?.length &&
    /^https?:\/\//i.test(product.maskImageUrl || "");
  /** All Shopify / marketing gallery URLs (deduped), not just front+back. */
  const marketingImageUrls = useMemo(() => {
    const raw = [
      product?.primaryImageUrl,
      ...(product?.imageUrls ?? []),
      legacyShopifyImageInMask ? product?.maskImageUrl : undefined,
    ].filter((u): u is string => Boolean(u && String(u).trim()));
    const seen = new Set<string>();
    const out: string[] = [];
    for (const url of raw) {
      const resolved = resolveMediaUrl(url);
      if (!resolved || seen.has(resolved)) continue;
      seen.add(resolved);
      out.push(resolved);
    }
    return out;
  }, [
    legacyShopifyImageInMask,
    product?.primaryImageUrl,
    product?.imageUrls,
    product?.maskImageUrl,
  ]);
  const marketingImageUrl = marketingImageUrls[0];
  // Selected Shopify marketing image used as fallback "mask" for the front view
  // when the admin skips uploading a transparent mask image.
  const activeMarketingImageUrl =
    marketingImageUrls[Math.min(marketingIndex, Math.max(marketingImageUrls.length - 1, 0))];

  useEffect(() => {
    setMarketingIndex(0);
  }, [product?._id, marketingImageUrls.length]);
  const stageByView = useMemo(
    () => ({
      front: product?.baseImageUrl ? resolveMediaUrl(product.baseImageUrl) : undefined,
      back: product?.baseBackImageUrl ? resolveMediaUrl(product.baseBackImageUrl) : undefined,
      left: product?.baseLeftImageUrl ? resolveMediaUrl(product.baseLeftImageUrl) : undefined,
      right: product?.baseRightImageUrl ? resolveMediaUrl(product.baseRightImageUrl) : undefined,
    }),
    [
      product?.baseImageUrl,
      product?.baseBackImageUrl,
      product?.baseLeftImageUrl,
      product?.baseRightImageUrl,
    ],
  );
  const maskByView = useMemo(
    () => ({
      front:
        product?.maskImageUrl && !legacyShopifyImageInMask ? product.maskImageUrl : undefined,
      back: product?.maskBackImageUrl || undefined,
      left: product?.maskLeftImageUrl || undefined,
      right: product?.maskRightImageUrl || undefined,
    }),
    [
      legacyShopifyImageInMask,
      product?.maskImageUrl,
      product?.maskBackImageUrl,
      product?.maskLeftImageUrl,
      product?.maskRightImageUrl,
    ],
  );
  /** Uploaded mask, or Shopify primary for front when admin skips the mask upload. */
  const effectiveMaskByView = useMemo(
    () => ({
      front: maskByView.front || activeMarketingImageUrl || undefined,
      back: maskByView.back,
      left: maskByView.left,
      right: maskByView.right,
    }),
    [maskByView.front, maskByView.back, maskByView.left, maskByView.right, activeMarketingImageUrl],
  );
  const baseStageImageUrl = stageByView.front;
  const productionMaskImageUrl = effectiveMaskByView.front;
  const baseBackStageImageUrl = stageByView.back;
  const productionMaskBackImageUrl = effectiveMaskByView.back;
  const baseLeftStageImageUrl = stageByView.left;
  const productionMaskLeftImageUrl = effectiveMaskByView.left;
  const baseRightStageImageUrl = stageByView.right;
  const productionMaskRightImageUrl = effectiveMaskByView.right;
  const activeStageUrl = stageByView[imageView];
  const activeMaskUrl = effectiveMaskByView[imageView];
  const frontMaskIsShopifyFallback = !maskByView.front && Boolean(activeMarketingImageUrl);
  const activeMaskIsShopifyFallback = imageView === "front" && frontMaskIsShopifyFallback;
  const printAreaImages = useMemo(
    () =>
      [
        productionMaskImageUrl,
        productionMaskBackImageUrl,
        productionMaskLeftImageUrl,
        productionMaskRightImageUrl,
      ].filter(Boolean) as string[],
    [
      productionMaskImageUrl,
      productionMaskBackImageUrl,
      productionMaskLeftImageUrl,
      productionMaskRightImageUrl,
    ],
  );
  const printAreaImageViews = useMemo(() => {
    const views: Array<{ url: string; key: string; label: string }> = [];
    if (productionMaskImageUrl) views.push({ url: productionMaskImageUrl, key: "front", label: "Front" });
    if (productionMaskBackImageUrl) {
      views.push({ url: productionMaskBackImageUrl, key: "back", label: "Back" });
    }
    if (productionMaskLeftImageUrl) {
      views.push({ url: productionMaskLeftImageUrl, key: "left", label: "Left" });
    }
    if (productionMaskRightImageUrl) {
      views.push({ url: productionMaskRightImageUrl, key: "right", label: "Right" });
    }
    return views;
  }, [
    productionMaskImageUrl,
    productionMaskBackImageUrl,
    productionMaskLeftImageUrl,
    productionMaskRightImageUrl,
  ]);

  async function refresh() {
    if (!id) return;
    const p = await getPlatformProduct(id);
    setProduct(p);
    return p;
  }

  async function saveDetails() {
    setBusy(true);
    setError("");
    try {
      if (id) {
        await updateProduct(id, { ...details, reason: mode === "edit" ? "edit via wizard" : undefined });
        await refresh();
      } else {
        const created = await createProduct(details);
        setId(created._id);
        setProduct(created);
      }
      setStep(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function addOneVariant() {
    if (!id || !variant.sku) return;
    const color = (variant.color ?? "").trim() || variant.colorHex || "";
    const colorHex = variant.colorHex || resolveColorHex(color);
    setBusy(true);
    setError("");
    try {
      await addVariant(id, { ...variant, color, colorHex, enabled: true });
      setVariant(emptyVariant);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add variant");
    } finally {
      setBusy(false);
    }
  }

  async function toggleVariantEnabled(variantId: string | undefined, enabled: boolean) {
    if (!id || !variantId) return;
    setBusy(true);
    setError("");
    try {
      await updateVariant(id, variantId, { enabled });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update variant");
    } finally {
      setBusy(false);
    }
  }

  async function uploadActiveMask(file: File | undefined) {
    if (!id || !file) return;
    setBusy(true);
    setError("");
    try {
      await uploadProductImage(id, file, VIEW_ROLES[imageView].mask);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function uploadActiveBase(file: File | undefined) {
    if (!id || !file) return;
    if (!file.type.startsWith("image/")) {
      setError("Product stage image must be an image file.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await uploadProductImage(id, file, VIEW_ROLES[imageView].base);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function applyPrintAreasSave() {
    const res = await setPrintAreas(id!, printAreas, { physicalDimensions, dpi });
    setAreas(res.printAreas ?? []);
    if (res.physicalDimensions) setPhysicalDimensions(resolvePhysical(res.physicalDimensions));
    if (res.dpi != null) setDpi(res.dpi);
    await refresh();
  }

  async function saveAreas() {
    if (!id) return;
    setBusy(true);
    setError("");
    try {
      await applyPrintAreasSave();
      setStep(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save print areas");
    } finally {
      setBusy(false);
    }
  }

  async function goToStep(i: number) {
    if (!id) return;
    if (i === 4 && step === 3 && printAreas.length) {
      setBusy(true);
      setError("");
      try {
        await applyPrintAreasSave();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save print areas");
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    if (i === 2) {
      setBusy(true);
      setError("");
      try {
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load variants");
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    setStep(i);
  }

  async function continueFromVariants() {
    setBusy(true);
    setError("");
    try {
      await refresh();
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load variants");
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
      await updateProduct(id, { ...details, reason: "save details before publish" });
      if (printAreas.length) {
        await applyPrintAreasSave();
      }
      // Persist admin-selected Shopify image as the front mask fallback
      // when no transparent mask image was uploaded.
      const needsFrontMaskFallback = !maskByView.front && Boolean(activeMarketingImageUrl);
      if (needsFrontMaskFallback) {
        await setProductRoleImageByUrl(id, VIEW_ROLES.front.mask, activeMarketingImageUrl);
        await refresh();
      }
      await publishProduct(id);
      navigate("/platform/catalog");
    } catch (e) {
      const body = (e as { details?: { error?: { details?: unknown } } }).details;
      const list = body?.error?.details;
      if (Array.isArray(list)) setProblems(list as string[]);
      setError(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  return {
    mode,
    steps: PRODUCT_WIZARD_STEPS,
    step,
    busy,
    error,
    problems,
    id,
    details,
    variant,
    product,
    printAreas,
    physicalDimensions,
    dpi,
    previewColor,
    imageView,
    categoryOptions,
    subcategoryOptions,
    colorSwatches,
    activeSwatch,
    firstHex,
    marketingImageUrls,
    marketingImageUrl,
    marketingIndex,
    imageViews: IMAGE_VIEWS,
    activeStageUrl,
    activeMaskUrl,
    activeMaskIsShopifyFallback,
    frontMaskIsShopifyFallback,
    baseStageImageUrl,
    productionMaskImageUrl,
    baseBackStageImageUrl,
    productionMaskBackImageUrl,
    baseLeftStageImageUrl,
    productionMaskLeftImageUrl,
    baseRightStageImageUrl,
    productionMaskRightImageUrl,
    printAreaImages,
    printAreaImageViews,
    onBack: () => navigate("/platform/catalog"),
    onStep: goToStep,
    onSet: set,
    onVariant: setVariant,
    onPrintAreas: setAreas,
    onPhysicalDimensions: setPhysicalDimensions,
    onDpi: setDpi,
    onPreviewColor: setPreviewColor,
    onImageView: setImageView,
    onSaveDetails: saveDetails,
    onAddVariant: addOneVariant,
    onToggleVariantEnabled: toggleVariantEnabled,
    onSetMarketingIndex: setMarketingIndex,
    onUploadActiveMask: uploadActiveMask,
    onUploadActiveBase: uploadActiveBase,
    onSaveAreas: saveAreas,
    onContinueFromVariants: continueFromVariants,
    onGoToStep: setStep,
    onPublish: doPublish,
    onSaveDraft: () => navigate("/platform/catalog"),
  };
}
