import { describe, expect, it } from "vitest";
import { INITIAL_SWAG_DRAFT, swagDraftReducer } from "./swagDraft";

describe("swagDraft product picks", () => {
  it("does not add the same catalog product twice", () => {
    let state = swagDraftReducer(INITIAL_SWAG_DRAFT, { type: "togglePick", index: 3 });
    state = swagDraftReducer(state, { type: "togglePick", index: 3 });
    expect(state.picked).toEqual([]);
  });

  it("keeps distinct catalog picks", () => {
    let state = swagDraftReducer(INITIAL_SWAG_DRAFT, { type: "togglePick", index: 0 });
    state = swagDraftReducer(state, { type: "togglePick", index: 1 });
    expect(state.picked).toEqual([0, 1]);
  });
});