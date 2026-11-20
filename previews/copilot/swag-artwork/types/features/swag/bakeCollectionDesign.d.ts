import { type MockupUploadItem } from "./mockup-bake";
import type { SwagDraft } from "./swagDraft";
import type { UiProduct } from "./model";
export type BakeCollectionDesignInput = {
    draft: Pick<SwagDraft, "picked" | "placements" | "areaArts" | "art">;
    catalog: UiProduct[];
};
/**
 * Client-side mockup bake shared by Save Design and Publish.
 * Does not call the API — callers persist via create/update collection flows.
 */
export declare function bakeCollectionDesignMockups({ draft, catalog, }: BakeCollectionDesignInput): Promise<MockupUploadItem[]>;
