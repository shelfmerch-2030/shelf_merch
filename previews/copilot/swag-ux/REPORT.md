# Conversational Swag Design UX

Implemented in the existing Copilot. Verified for controlled local testing with isolated data and a mocked AI provider. This is not evidence of live Claude recommendation quality or production readiness.

## What changed

| Before | Now |
|---|---|
| Separate collection-name and permanent catalog-search forms | Names, searches, categories and budgets use the existing chat composer |
| Title-based automatic winter search | Discovery instructions use the original request and later preferences; no client-side title heuristic |
| Six initial cards and a long removal list | Four initial cards, two columns on mobile, visible Show more products and compact removable selection chips |
| Repeated upload/logo presentation | Existing + picker and upload shortcut share the same input; one current source preview, restored from verified backend state after reload |
| Large persistent form panel | Small current-design heading, current question and contextual actions |
| Verbose Save/Apply/Publish cards | Compact decision facts, relevant warnings and optional detailed immutable receipt |
| Save/Reload controls in the normal automatic path | Successful automatic application leads straight to saved mockups and store selection; manual artwork options remain available |

The journey is: name in chat → discover/select products → Continue → upload or skip logo → explicit Apply approval → actual saved mockups → Looks good → select store → one explicit Confirm & Publish → committed result.

Button actions still call the existing revision-checked backend operations directly. Natural language and buttons share the same actor-owned state. Selection chips and cards change only after backend acknowledgement. Catalog pagination retains query/category/page size and does not permanently cap results. Generic catalog cards retain their prior behavior.

## Conversation handling

- `Add both polos` and ordinal removals now reach the existing model/tool loop instead of being incorrectly treated as literal catalog names. Backend identity and eligibility checks remain authoritative.
- Model instructions retain the original occasion/category/budget intent across naming, request relevant real catalog results, and allow later category changes. No product, price, identity or inventory is invented.
- `Looks good. Publish it.` moves a design to store selection; it does not execute publication.
- An exact eligible store name such as `AI Store`, or `Publish to AI Store`, uses the existing authorized name-resolution path. Ambiguity and tenant checks remain in that path.
- Typed Apply/Publish requests still require the existing explicit click approval. Precise placement changes still use the existing designer.
- Historical messages and receipts are not rewritten. The editable context is labeled Current design; saved operation details and previews remain inspectable snapshots.

## Artwork, saved designs and safety

The existing attachment upload, renderer, geometry, asset persistence, collection publishing transactions, RBAC and WRITE-state implementation were preserved. The workflow service changed only in its model instruction string; the preservation script verifies that restriction.

The active gallery uses actual persisted product-specific mockups. Replacement, unsupported/manual products, preserved designs and draft-store warnings remain visible when relevant. No preview is fabricated for an uncustomized product. Save outcomes do not infer an uploaded logo from a generic Not applied status.

A browser screenshot caught a reload race: after a restored Apply card completed, the panel could PREPARE the old revision before the refreshed state arrived. The backend rejected it, but the user saw a stale-design error. The panel now records the restored pending review's revision as observed. A focused regression and the real browser check verify that completion does not prepare it again. No EXECUTE or retry safeguard was weakened.

Save for Later was checked through an explicit Save approval, conversation reload and Continue designing, retaining the collection and saved mockup. The existing isolated renderer regression also verifies saving an unapplied upload, later applying it with fresh approval, and retaining the same collection ID.

## Final automated verification

**670 passed, 0 failed, 0 pending, across 60 distinct test files.** This preserves the prior 659-test inventory and adds 11 focused tests. Repeated runs are not double-counted.

| Group | Passed |
|---|---:|
| Frontend Copilot/Swag/related regressions | 310 |
| Artwork and renderer acceptance | 31 |
| Actual browser workflows | 2 |
| Mockup consistency | 6 |
| Swag workflow/chat/interactive/response formatting | 71 |
| Catalog | 37 |
| Collection/dashboard/publishing/discovery | 48 |
| Copilot WRITE-state | 17 |
| Attachments | 8 |
| Copilot reads | 4 |
| Copilot write domains | 9 |
| Provider adapter | 20 |
| Financial/ledger/Send Points/integrity | 84 |
| Redemption | 23 |

`verification.json` validates every final test assertion, zero failed/pending suites/tests, distinct test-file counting, source preservation, the unchanged renderer bundle/source manifest and browser evidence. `web-focused.json` is an earlier passing subset and is not added to the total.

The TypeScript check still exits unsuccessfully with the same **26 pre-existing diagnostics; zero new diagnostics**. The exact normalized diagnostic set matches the prior report. No unrelated type fixes were made.

During verification, three thread-based Node processes exited with Windows status `3221226505` without final reports. They were not counted as passing. Serial reruns completed the renderer and catalog groups; a single forked worker completed all 84 financial tests. Browser tests initially exposed old labels/pagination expectations and an assertion that ran before current state loaded; these were corrected to verify the new UI while retaining real database/publication/idempotency checks. All final reports pass.

## Actual browser evidence

Microsoft Edge headless ran the existing `/ai-test/copilot` UI through real application controllers/services, real multipart upload, a MongoMemoryReplSet, local storage and the actual API-owned sandboxed renderer. AI provider responses and catalog/image fixtures were explicitly synthetic; no live Claude call, real customer publication or external send occurred.

The automatic-artwork browser check covers composer naming, relevant catalog tools, exact-name selection, keyboard Space selection, deselect/reselect, pagination, reload restoration, upload, one restored source-logo preview, one pending Apply approval, double-click suppression, actual rendered PNG persistence, saved mockup loading, Save for Later/resume, natural-language store selection, separate final publishing approval, one collection/listing and preserved draft-store status.

The skip-artwork browser check covers publication without a designer handoff, duplicate-click protection, and two versions of saved mockup fixtures across the actual collection, management, Copilot and storefront image-resolution components.

Screenshots were visually inspected at 1440px desktop and 390px mobile widths. The browser checks assert no horizontal page overflow. Product controls were exercised using keyboard activation.

- `browser/products-desktop.png`
- `browser/products-mobile.png`
- `browser/browser-applied.png`
- `browser/browser-review.png`
- `browser/browser-completed-mobile.png`
- `legacy-browser/browser-review.png`
- `legacy-browser-images.png`

## Exact application files changed in this task

1. `apps/web/src/features/copilot/SwagWorkflowPanel.tsx` — composer-first current step, selection chips, artwork review/gallery, compact stores and advanced manual controls.
2. `apps/web/src/features/copilot/CopilotProductCards.tsx` — four-card Swag sets, pagination label, current-collection result actions.
3. `apps/web/src/features/copilot/CopilotConfirmationCard.tsx` — compact Swag approval/results, warnings, expandable receipts and current-draft continuation.
4. `apps/web/src/features/copilot/SwagSavedPreviews.tsx` — compact inline gallery plus historical snapshot expansion.
5. `apps/web/src/features/copilot/swagPresentation.ts` — concise titles, verified decision facts, customer-facing artwork label and warnings.
6. `apps/web/src/features/copilot/CopilotPage.tsx` — binds result actions to the current saved collection and existing conversation operations.
7. `apps/web/src/features/copilot/copilot.css` — scoped compact/responsive Swag styles and focus indicators.
8. `apps/api/src/modules/copilot/copilotChat.service.js` — contextual group/ordinal routing, safe review navigation and exact store-name interaction aliases.
9. `apps/api/src/modules/copilot/swagDesignWorkflow.js` — model instructions only; business-service code unchanged.
10. `apps/web/src/features/copilot/CopilotSwagInteractive.test.tsx`
11. `apps/web/src/features/copilot/CopilotSwagArtwork.test.tsx`
12. `apps/web/src/features/copilot/CopilotSwagDesign.test.tsx`
13. `apps/api/tests/copilot-swag-chat.test.js`
14. `apps/api/tests/copilot-swag-artwork.browser-check.js`
15. `apps/api/tests/copilot-swag.browser-check.js`

Evidence, source snapshots and runners are under `previews/copilot/swag-ux/`. Source hashes confirm **2,489 of 2,504 baseline application files unchanged**, with changes confined to the 15 listed files. No new application source files, business services, MCP tools or dependencies were introduced. Financial/Send Points/renderer/geometry implementations match the task-start snapshot. Diff whitespace checks pass. Git may print its existing LF-to-CRLF notice for CopilotPage; it reports no whitespace defect.

## Remaining limits

- Live Claude phrasing, recommendation relevance and ambiguous-language quality require controlled manual testing. Mocked tool-loop tests prove state/identity behavior and context retention, not model quality.
- Browser catalog images and artwork were synthetic fixtures. Real catalog asset appearance remains a manual visual check.
- Precise resizing/placement remains in the existing designer. Collection links use the routes already returned by the backend; View collection opens the collection list.
- Earlier tool-only conversation turns can show an empty author row during initial discovery; reopening already filters empty turns. This is cosmetic and has no selection or write-state effect.
- The prior renderer's Linux/container runtime verification remains outside this UX task. No deployment readiness claim is made.

## Manual local testing

Use a disposable local test database/workspace and the existing renderer setup in `docs/copilot-swag-artwork.md`. Keep any final publication confined to those test fixtures.

1. Open `/ai-test/copilot`; type `I want to design summer swag for men`, then a collection name.
2. Check relevant real products and verified prices. Select by card and by exact name; try `Add both`, remove a selection and change category. Use Show more products.
3. Continue; upload a PNG through + or Upload logo. Check that only one current source preview is visible, including after reload.
4. Review all/subset targets and any replacement/manual warnings. Apply using its explicit approval. Verify saved previews; use Edit Placement for precise adjustments.
5. Use Save for later → explicit save approval. Reload the conversation and Continue designing. Verify the same selection/design remains.
6. Say `Looks good. Publish it.`; select an eligible store by name or checkbox. Review the compact summary and draft visibility warning.
7. In the disposable fixture workspace, click Confirm & Publish. Check the committed result, one collection/listing and reload recovery. Repeat the skip-logo path.
8. Repeat at mobile width and with keyboard navigation. Inspect long product names, unavailable images, partial application, cancellation and uncertain-operation status controls.

Repeatable isolated checks from the repository root:

```powershell
node previews/copilot/swag-ux/run-web.mjs
node previews/copilot/swag-ux/run-backend.mjs
node previews/copilot/swag-ux/run-typecheck.mjs
node previews/copilot/swag-ux/verify-final.mjs
```

The backend runner uses bounded workers, its own test database and stub notification credentials. Its Edge checks require permission to launch the browser with its own sandbox enabled. No sandbox bypass is used. The typecheck command's existing nonzero exit is documented above.

No commit, push, merge, reset, deployment, remote change, production/staging mutation or live customer operation was performed.
