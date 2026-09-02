import { useMemo, useReducer, useState, type Dispatch } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { useWorkspace } from "@/hooks/useWorkspace";
import { sumKitProductPrices } from "@/features/send/money";
import { bakeMockupsForProducts } from "@/features/swag/mockup-bake";
import { kitPreferredPrintAreaKey } from "../kitPrintArea";
import { usePlatformKits, useCreateKit } from "../model";
import type { UiProduct } from "../model";
import { kitReducer, type KitAction, type KitDraft } from "../wizard/kitDraft";

export type KitWizardStep = 0 | 1 | 2 | 3;

const INITIAL: KitDraft = {
  name: "Welcome Kit",
  desc: "",
  picked: [],
  art: null,
  placements: {},
  placementEpoch: 0,
  notes: "",
  packaging: "box",
};

export type KitWizardVm = {
  isLoading: boolean;
  isPublishing: boolean;
  publishedKit: { id: string; name: string } | null;
  step: KitWizardStep;
  draft: KitDraft;
  dispatch: Dispatch<KitAction>;
  catalog: UiProduct[];
  pickedProducts: UiProduct[];
  onExit: () => void;
  onNext: () => void;
  onStep: (step: KitWizardStep) => void;
  onPublish: () => void;
  onSendPublishedKit: () => void;
  onGoToKits: () => void;
};

/** Map a platform template's product list onto catalog indices. */
function templateIndices(items: Array<{ catalogProductId: string }>, catalog: UiProduct[]) {
  const indices: number[] = [];
  for (const item of items) {
    const pid = String(item.catalogProductId ?? "");
    if (!pid) continue;
    const idx = catalog.findIndex((p) => p.id === pid);
    if (idx >= 0 && !indices.includes(idx)) indices.push(idx);
  }
  return indices;
}

/** Controller for the create-kit wizard: template seeding, draft reducer, publish flow. */
export function useKitWizardController(): KitWizardVm {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const template = searchParams.get("template") ?? undefined;
  const { data: workspace, isLoading } = useWorkspace();
  const { data: platformKits } = usePlatformKits();
  const createKit = useCreateKit();
  const [step, setStep] = useState<KitWizardStep>(0);
  const [publishing, setPublishing] = useState(false);
  const [publishedKit, setPublishedKit] = useState<{ id: string; name: string } | null>(null);

  const catalog: UiProduct[] = useMemo(() => workspace?.catalogProducts ?? [], [workspace]);

  // Seed the draft from a pre-designed template when one is selected.
  const seeded = useMemo<KitDraft>(() => {
    const tpl = template
      ? platformKits?.find((k) => String(k._id) === String(template))
      : undefined;
    if (!tpl || !catalog.length) return INITIAL;
    const picked = templateIndices(tpl.items ?? [], catalog);
    return {
      ...INITIAL,
      name: tpl.name || INITIAL.name,
      desc: tpl.description || "",
      picked: picked.length ? picked : INITIAL.picked,
      packaging: tpl.packaging === "none" ? "none" : "box",
    };
  }, [template, platformKits, catalog]);

  const [draft, dispatch] = useReducer(kitReducer, seeded);

  const pickedProducts = draft.picked.map((i) => catalog[i]).filter(Boolean) as UiProduct[];

  function onNext() {
    if (step === 0) {
      if (draft.name.trim().length < 4) {
        toast.error("Kit name must be at least 4 characters");
        return;
      }
      setStep(1);
    } else if (step === 1) {
      if (!draft.picked.length) {
        toast.error("Select at least one product");
        return;
      }
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  }

  async function onPublish() {
    setPublishing(true);
    try {
      const kitPrice = sumKitProductPrices(pickedProducts);
      let mockups: Awaited<ReturnType<typeof bakeMockupsForProducts>> | undefined;

      if (draft.art?.preview) {
        mockups = await bakeMockupsForProducts(
          draft.picked,
          catalog,
          draft.art.preview,
          draft.placements,
          { resolveAreaKey: kitPreferredPrintAreaKey },
        );
        if (mockups.length < draft.picked.length) {
          throw new Error("Failed to generate mockups for all kit products — try again");
        }
      }

      const created = await createKit.mutateAsync({
        name: draft.name || "New Kit",
        description: draft.desc || "",
        pickedIndices: draft.picked,
        catalog,
        packaging: "box",
        designNotes: draft.notes,
        kitPrice,
        artwork: draft.art
          ? { file: draft.art.file, preview: draft.art.preview, name: draft.art.name }
          : undefined,
        mockups,
      });
      toast.success(`Kit "${created.name}" saved to your workspace`);
      setPublishedKit({ id: created.id, name: created.name });
      setPublishing(false);
    } catch (err) {
      setPublishing(false);
      toast.error(err instanceof Error ? err.message : "Failed to save kit");
    }
  }

  return {
    isLoading: isLoading && !workspace,
    isPublishing: publishing || createKit.isPending,
    publishedKit,
    step,
    draft,
    dispatch,
    catalog,
    pickedProducts,
    onExit: () => navigate("/app/kits"),
    onNext,
    onStep: setStep,
    onPublish,
    onSendPublishedKit: () => {
      if (publishedKit) navigate(`/app/kits/${publishedKit.id}/send`);
    },
    onGoToKits: () => navigate("/app/kits"),
  };
}
