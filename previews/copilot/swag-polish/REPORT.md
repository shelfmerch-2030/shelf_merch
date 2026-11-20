# Focused Swag product-selection and logo-prompt polish

Completed the three requested presentation changes in the existing Copilot timeline. Runtime changes are confined to four frontend files. Existing selection, upload, approval, persistence and execution contracts are unchanged.

## UI changes

- **Selection summary:** backend-derived “N products selected”, compact wrapping name chips with individually labelled remove buttons, and a compact left-aligned **Continue** directly beneath them. Pending operations retain the confirmed selection and disable conflicting controls. Continue uses the existing artwork-stage transition and remains disabled without eligible products.
- **Swag catalog cards:** neutral thin borders, subtle selected tint, restrained 180ms pointer-hover feedback, one keyboard focus indicator and reduced-motion support. **Details** has no arrow; Details and Add/Added have matching sizes. Existing product identities, media, prices, routes, selection semantics and pagination remain intact. Long names wrap within the existing two-line treatment; a single result retains a compact card width.
- **Logo prompt:** displays “Would you like to add your company logo? You can upload it using the + button below, or continue without one.” with only **Skip for now**. The frontend maps the old canonical prompt for display at the artwork step; stored messages and custom assistant wording are unchanged. The existing composer **+ → Swag design artwork** upload and explicit Apply approval remain available. Skip uses the existing no-artwork action.

## Before/after screenshots

Captured with actual Microsoft Edge against isolated fixtures, using identical synthetic catalog images before and after. These images are test fixtures; production catalog-media handling was not replaced.

| Checkpoint | Before | After |
|---|---|---|
| Unselected card | [Before](before/01-unselected.png) | [After](after/01-unselected.png) |
| Selected card | [Before](before/02-selected.png) | [After](after/02-selected.png) |
| Hovered card | [Before](before/03-hovered.png) | [After](after/03-hovered.png) |
| Selected summary | [Before](before/04-selected-summary.png) | [After](after/04-selected-summary.png) |
| Logo prompt | [Before](before/05-logo-prompt.png) | [After](after/05-logo-prompt.png) |
| Mobile cards and summary | [Before](before/06-mobile-cards-summary.png) | [After](after/06-mobile-cards-summary.png) |

Additional evidence: [keyboard focus](after/keyboard-focus.png), [long mobile name](after/long-name-mobile.png), [long desktop name](after/long-name-desktop.png), [uploaded artwork](after/uploaded-logo.png), [retained Apply approval](after/apply-approval.png).

Desktop was inspected at 1440px, mobile at 390px and 320px. The four desktop cards remain aligned in one row; mobile uses readable two-column cards and wrapping chips. Continue measures approximately 80px and shares the summary's left edge. Selected and unselected cards retain the same neutral border. Hover adds a restrained shadow without movement. Keyboard controls have one 2px outline without an additional shadow; reduced motion disables card and control transitions.

## Exact application/test files changed in this task

| File | Change |
|---|---|
| `apps/web/src/features/copilot/SwagStepMessage.tsx` | Compact selection markup, Continue label, one-button logo prompt and display-only canonical prompt formatter. |
| `apps/web/src/features/copilot/CopilotProductCards.tsx` | Swag-specific styling hooks and plain Details label. |
| `apps/web/src/features/copilot/CopilotPage.tsx` | Applies the display-only prompt formatter to the existing message body. |
| `apps/web/src/features/copilot/copilot.css` | Scoped summary, card, action, responsive, hover, focus and reduced-motion styles. |
| `apps/web/src/features/copilot/CopilotSwagTimeline.test.tsx` | Updated presentation expectations and simplified-logo action coverage. |
| `apps/web/src/features/copilot/CopilotSwagPolish.test.tsx` | New focused summary, pending-state, prompt and catalog-control regressions. |
| `apps/api/tests/copilot-swag-polish.browser-check.js` | New opt-in isolated actual-browser verification; no backend runtime changes. |

Supporting snapshots, runners, reports and screenshots are under this report's directory. The preservation check compared all 2,508 previously snapshotted application files: 2,503 remained byte-identical, five intended existing files changed, and two new test files were added. No preexisting file was removed or unrelated application change introduced by this task.

## Verification results

| Final verification | Passed | Failed | Pending |
|---|---:|---:|---:|
| Focused frontend/Copilot regression set | 338 | 0 | 0 |
| Final actual Edge browser acceptance test | 1 | 0 | 0 |
| **Total** | **339** | **0** | **0** |

The baseline browser reference also passed once and is excluded from the final total. Earlier browser-attempt reports are retained for traceability; the final report above is the completed run against the final changes.

Frontend coverage includes selection removal by matching identity, disabled/retained pending state, no optimistic mutation, eligible-selection progression, unchanged Details routes/media/prices, Add/Added acknowledgement, exact display-only prompt handling, existing chronological timeline, attachment and WRITE-state behavior, and existing Send Points frontend regressions.

The browser test uses real controllers, MongoMemoryReplSet and local multipart storage, with mocked AI and synthetic actors/catalog data. It verifies four acknowledged selections despite duplicate clicks, selection preservation through pagination, natural-language removal, Skip, composer upload acknowledgement and preparation of the existing Apply approval. It issued **zero execute requests** and created **zero collections**. It used no live customer data or external notification delivery.

TypeScript reports the same **26 existing diagnostics** as the previous verified baseline, with **zero new diagnostics**. The overall typecheck therefore remains nonzero. Scoped `git diff --check` and application-file preservation checks passed.

Machine-readable evidence: [final verification](verification.json), [frontend results](web-final.json), [final browser results](after/artwork-browser-final.json), [browser observations](after/browser-evidence.json), [typecheck output](typecheck.txt).

## Preserved behavior and limits

Backend runtime files are byte-identical to the task snapshot. Claude routing, product resolution, actor-owned state, timeline ordering, attachment validation, renderer, saved mockups, stores, publishing, financial workflows and public MCP tools were not edited. Existing behavior is covered by the relevant frontend regression set; broad backend suites were not rerun for this presentation-only task.

Actual browser verification used mocked AI and synthetic catalog media. It does not establish behavior against live Claude responses or real customer catalog photography. No live publishing or Apply execution was performed, consistent with the task's safety constraints. Existing unrelated TypeScript errors remain. No new blocker was identified for controlled local review of these UI changes.

No commit, push, merge, reset, deployment or Git remote change was performed.

## Manual local review

1. Open an authorized local test conversation and start Swag Design. Browse real catalog products, select four and confirm the count/names update only after backend acknowledgement.
2. Check Details routes, Add/Added removal, individual chip removal and pagination. Hover a card, Tab through controls, enable reduced motion, and repeat at narrow mobile widths.
3. Select at least one eligible product and click Continue. Confirm the requested logo sentence and only Skip for now appear in that prompt.
4. Use the existing + picker to upload Swag Artwork. Check one acknowledged preview and the existing explicit Apply approval. Do not execute or publish unless separately authorized in the isolated local environment.
5. In a separate test conversation, use Skip for now and verify the existing no-artwork path. Ask to change a product and confirm the same conversation retains its authoritative state and chronological messages.
