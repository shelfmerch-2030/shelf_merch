import type { Placement } from "./mockup-bake";

export type ArtFile = { preview: string; name: string; file?: File };

export type SwagDraft = {
  step: 0 | 1 | 2 | 3;
  name: string;
  picked: number[];
  /** Last library selection (also used as fallback / collection artworkUrl). */
  art: ArtFile | null;
  /** Artwork assigned per product print area — key = `productId::areaKey`. */
  areaArts: Record<string, ArtFile>;
  placements: Record<string, Placement>;
  placementEpoch: number;
};

export const INITIAL_SWAG_DRAFT: SwagDraft = {
  step: 0,
  name: "New Employee Swag",
  picked: [],
  art: null,
  areaArts: {},
  placements: {},
  placementEpoch: 0,
};

export type SwagAction =
  | { type: "setStep"; step: 0 | 1 | 2 | 3 }
  | { type: "setName"; name: string }
  | { type: "togglePick"; index: number }
  | { type: "setArt"; art: ArtFile }
  | { type: "clearArt" }
  | { type: "setAreaArt"; key: string; art: ArtFile }
  | { type: "setAreaArts"; keys: string[]; art: ArtFile }
  | { type: "clearAreaArt"; key: string }
  | { type: "setPlacement"; key: string; placement: Placement }
  | { type: "resetPlacements" }
  | { type: "hydrate"; draft: SwagDraft };

export function swagDraftReducer(state: SwagDraft, action: SwagAction): SwagDraft {
  switch (action.type) {
    case "setStep":
      return { ...state, step: action.step };
    case "setName":
      return { ...state, name: action.name };
    case "togglePick": {
      const has = state.picked.includes(action.index);
      return {
        ...state,
        picked: has
          ? state.picked.filter((i) => i !== action.index)
          : [...state.picked, action.index],
      };
    }
    case "setArt":
      return { ...state, art: action.art };
    case "clearArt":
      return {
        ...state,
        art: null,
        areaArts: {},
        placements: {},
        placementEpoch: (state.placementEpoch ?? 0) + 1,
      };
    case "setAreaArt":
      return {
        ...state,
        art: action.art,
        areaArts: { ...state.areaArts, [action.key]: action.art },
      };
    case "setAreaArts": {
      const next = { ...state.areaArts };
      for (const key of action.keys) next[key] = action.art;
      return { ...state, art: action.art, areaArts: next };
    }
    case "clearAreaArt": {
      const next = { ...state.areaArts };
      delete next[action.key];
      return {
        ...state,
        areaArts: next,
        // Keep staged library `art` — clearing one placeholder must not wipe the upload panel.
        placementEpoch: (state.placementEpoch ?? 0) + 1,
      };
    }
    case "setPlacement":
      return { ...state, placements: { ...state.placements, [action.key]: action.placement } };
    case "resetPlacements":
      return {
        ...state,
        placements: {},
        placementEpoch: (state.placementEpoch ?? 0) + 1,
      };
    case "hydrate":
      return {
        ...INITIAL_SWAG_DRAFT,
        ...action.draft,
        areaArts: action.draft.areaArts ?? {},
      };
    default:
      return state;
  }
}

/** True when at least one print area has artwork assigned. */
export function draftHasAreaArtwork(draft: SwagDraft): boolean {
  return Object.keys(draft.areaArts || {}).length > 0 || Boolean(draft.art);
}
