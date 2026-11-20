# Interactive Swag Design in Copilot

The existing embedded Copilot now supports product selection and progression with both conversation and controls. The catalog identity defect is fixed. The supported no-artwork lifecycle has been verified in an actual Edge browser at `/ai-test/copilot`, using the real backend controllers/services and an isolated MongoMemoryReplSet. The provider was mocked and the catalog/store records were synthetic. No live workspace data or live publishing was used.

## Confirmed root cause and identity fix

Catalog search/detail already returned real product IDs, and product cards already used those IDs in their detail links. The defect was in `toolContentForModel`: when cards existed, it replaced search/detail JSON with prose summaries that omitted IDs and names. Those summaries were persisted in the provider transcript. Meanwhile, `swag_configure` accepted only product IDs and had no verified name/context resolution path. The user could see a card whose identity Claude could no longer use.

The formatter now retains a compact verified ID/name/SKU/price list and pagination alongside the existing card-rendering instruction. It continues to omit duplicate imagery/prose. Tests also pass that content through the Anthropic tool-result adapter and verify that the identity survives.

`swag_configure` now accepts exact product names, removals by name and an unambiguous contextual product reference. Exact names resolve against verified recent cards, then eligible catalog records using the shared existing catalog eligibility filters. Ambiguous matches request a card selection/refined name. Contextual references resolve only against recent verified card identities; unrelated kit/wallet/write results stop older product context from being reused. Every selected ID is revalidated before configuration and again by the existing confirmed publishing path. There is no hardcoded ID for the supplied hoodie example.

Natural selections such as `Sustainable Classic Hoodie: add this`, `Add Sustainable Classic Hoodie`, `Add this one` and removals call the existing `swag_configure` binding directly when unambiguous. No model-generated ID or user-pasted MongoDB ID is needed. Existing unrelated write intents are not intercepted. Conversation state supplied to the model also reflects selections made by buttons.

## Interactive lifecycle

| Stage | Implemented behavior |
| --- | --- |
| Name | Both “design swag” and “design a swag” start with the collection-name question. The compact panel also accepts a name. Renaming preserves selections. |
| Products | Existing catalog cards gain Select / Selected / Remove controls only in active Swag Design. They submit the actual rendered ID to the same actor-owned configuration binding used by conversation. The panel shows the authoritative selected count/list, Remove actions, Search products, Category, Back and Next. Next is disabled without eligible selections. |
| Catalog browsing | Initial active-swag searches use six results. Show More preserves the original query/category/page size, fetches supported backend pages and updates the actual page count. Overlapping page IDs are deduplicated. Selection survives category changes and pagination. Generic catalog cards remain unchanged outside active Swag Design. |
| Artwork | Upload Artwork opens the **existing** `copilot-attach-swag_artwork` picker; no second upload implementation was added. Successful uploads are associated with the current conversation through the existing scoped configuration path. Skip, replace, remove and Back are functional. Names/previews/status come from authorized backend records. Upload is explicitly distinct from applied artwork. |
| Design | Save Design prepares the existing explicit save confirmation. Once saved, Open Designer / Apply Artwork opens the existing saved-collection editor in another tab without another navigation confirmation. Recorded mockups remain the only design previews. Next is blocked while placement is missing. |
| Return from editor | Focus refresh reads the current saved Collection without executing writes. A changed saved design blocks advancement until **Reload saved design** adopts the current name, products and saved references. This also invalidates stale approvals. |
| Stores | Actual eligible workspace stores appear as checkbox options; multiple stores are supported. The backend verifies every selected ID. Draft-store semantics are explained and retained. Back preserves selections. |
| Review | Next persists the review step and prepares one server-persisted existing confirmation card. Back / Edit cancels the old approval before editing. Cancel and Confirm & Publish retain the established UI-only EXECUTE path. |
| Completion | The existing result card reports the committed collection name, product count, stores, status and returned links. It is brought into view. Completion, cancellation and uncertainty continue to use authoritative WRITE-state reconciliation. |

Literal Next, Back and Skip Artwork also use the same backend step/configuration path. A failed operation does not advance the client optimistically. Product selection/navigation create no Collection records. Save/publish continue to require their existing explicit approval.

## Safety and state

- One versioned, actor-owned conversation state supplies both the model and controls. There is no separate client-only selected-products list.
- Every metadata mutation carries the revision displayed by its originating controls. Delayed callbacks are bound to their originating conversation. A switched conversation cannot receive an old action or response.
- Rapid duplicate mutations are locked in the frontend; backend revision checks and set semantics reject stale retries without duplicate selections. A lost/stale response triggers a read-only refresh, not mutation replay.
- Server-side review preparation uses the existing `prepareCopilotWrite`/`swag_prepare_collection` behavior and persists the genuine artifact so reload/lost acknowledgements can recover it. Editing dismisses the previous approval. EXECUTE remains user-click-only.
- Unavailable selections remain visible as unavailable/repairable on reload, without invented prices or eligibility. They must be removed before progression. Persisted writes remain strict.
- Existing owner/fence checks, manifest binding, transaction safety, durable receipts, idempotency and no automatic replay of uncertain publishing are retained. No new public or embedded MCP tools were introduced.
- The conversation-only interaction endpoint has its own bounded rate limit, so selecting the supported number of products does not exhaust the existing expensive AI/confirmation quota. Existing AI and persisted-write limits are unchanged.
- No Send Points, wallet, budget, ledger, kits, gifting business service or dashboard designer implementation was changed. Existing public catalog lookup behavior is preserved; its eligibility predicates are now shared with name resolution.

## Verification

All final JSON reports have matching actual assertion counts and totals, zero failed/pending tests, and no duplicate test-file counting:

| Report | Passed | Failed | Pending |
| --- | ---: | ---: | ---: |
| `acceptance-final.json` — swag, HTTP interaction, identity/provider content | 62 | 0 | 0 |
| `catalog-final.json` — existing public catalog READ/search | 37 | 0 | 0 |
| `api-dashboard-final.json` — collections, design merge, store visibility, registry/discovery | 48 | 0 | 0 |
| `api-copilot-state-final.json` | 17 | 0 | 0 |
| `api-copilot-attachments-final.json` | 8 | 0 | 0 |
| `api-copilot-reads-final.json` | 4 | 0 | 0 |
| `api-copilot-domains-final.json` | 9 | 0 | 0 |
| `api-copilot-provider-final.json` | 20 | 0 | 0 |
| `api-financial-final.json` — MCP safety, Send Points, ledger, wallet integrity | 84 | 0 | 0 |
| `web-final.json` — Copilot, dashboard swag, collection publication and media | 269 | 0 | 0 |
| `browser-test.json` — actual Edge + isolated real backend | 1 | 0 | 0 |
| **Total — 48 distinct files** | **559** | **0** | **0** |

The original 485 targeted cases are covered, alongside new identity/navigation/interaction cases and additional existing catalog/formatter regressions. Tests cover exact/contextual/ambiguous selection, eligibility, click/text equivalence, duplicates/removal, filters/pages, revision races, conversation switches, step validity, upload/skip, editor reload, foreign stores, persisted review, confirmation/retry/recovery, and existing financial safeguards.

One multi-file Copilot process exited with native Windows code `3221226505` before producing a report. Its files were rerun individually with one worker and all completed. A transient isolated-browser startup failure was rerun with Vite logging/readiness checks; the final browser report and runtime-error list are clean. Earlier exploratory reports/logs are retained as evidence and are not counted as final passes.

Frontend typechecking retains the **same 26 pre-existing diagnostics**, with **zero new diagnostics** compared with the preceding Swag integration task. A native failure during one invocation was rerun through a captured child process to obtain the complete diagnostic set. No unrelated type errors were changed or concealed. Whitespace checks pass.

Of 134 previously dirty app files snapshotted at task start, **121 remain byte-for-byte unchanged**. The other 13 are intended integration edits. Additional new/previously clean files are restricted to the manifest below. `verify-final.mjs` verifies preservation, final report completeness, unique counting, browser evidence and diagnostic equality.

## Actual browser scope and remaining limits

`browser-evidence.json` records an actual headless Microsoft Edge session on `/ai-test/copilot`. It used real rendered controls, real application controllers/services and isolated MongoDB, with synthetic hoodie/store records and a mocked AI provider. Every browser API request was routed to the isolated test app; it could not reach the developer backend. The supplied production-style catalog ID was not hardcoded or accessed.

Verified in that browser: name-first entry, card Select controls, typed exact-name selection, deselection/reselection, pagination, conversation reload restoration, artwork skip, store selection, one review card, zero Collections before confirmation, one EXECUTE on a rapid double-click, one committed Collection/listing, unchanged draft-store status and a responsive mobile result with zero captured runtime errors. Screenshots: `browser-review.png`, `browser-completed-mobile.png`.

**The full visual-editor placement/upload/save round-trip was not performed in the browser.** Upload validation, scoped authorization, designer links, saved-reference reload and publication guards are covered by isolated automated regressions. Actual logo positioning/resizing remains in the existing visual designer. Selective removal of already saved print-area artwork retains the dashboard's existing merge-preserving behavior; use save/reload to verify what persisted. Copilot's Remove Artwork option clears all artwork only through the subsequent explicitly confirmed write. Variant subsets remain unsupported by the existing Collection model; catalog families retain enabled variants.

Accordingly, the supported skip-artwork lifecycle has browser verification and the implementation is ready for controlled local testing. This is **not** a claim of live `ai-test` publication, live Claude verification or fully verified visual customization.

## Manual local testing

Use disposable local data and a transaction-capable local MongoDB; do not point a verification run at production/staging. Use the existing enabled Copilot/provider setup and `EMBEDDED_COPILOT_WRITE_COLLECTIONS=true`.

1. Open `/ai-test/copilot` on the local frontend. Say “I want to design a swag,” then “Swag for winter.” Confirm that only the genuinely missing name is requested.
2. Browse verified products. Type “Sustainable Classic Hoodie: add this” if that item exists, or select another actual named product. No MongoDB ID should be requested. Select/remove another card, change Category, search again and use Show More. Verify the shared count and selected summary.
3. Reload and reopen the conversation; selections must remain. Switch to another conversation and verify no selection leaks. Return and choose Next. Back should retain products.
4. For the no-artwork branch, choose Skip Artwork → Next → select one or more actual stores → Next. Inspect the genuine confirmation card, including draft-store warnings. Back / Edit should dismiss that approval; re-review as needed. Cancel should create/publish nothing.
5. In a disposable local fixture only, Confirm & Publish once. Verify the returned Collection/listings, product count and target stores. Reload; no active confirmation should revive. Check that draft stores remained draft.
6. Separately exercise the artwork branch: Upload Artwork through the visible control or existing `+` menu. Try invalid/low-DPI PNG and unauthorized/expired references. A valid upload must still say placement is required.
7. Choose Save Design and explicitly confirm saving. Open Designer / Apply Artwork. In the existing editor, position the logo on the intended products/print areas and Save Design. Return to Copilot, refresh/reload the saved design, and inspect the actual previews/references. Next must remain disabled until that state is valid. This is the remaining manual visual-editor verification item.
8. Test replace/remove artwork, back navigation, multiple stores, final review and explicit publication with those disposable local records. Confirm that displayed results match the backend, and uncertain operations never automatically resend/re-execute.

Automated local-browser rerun on Windows with Edge installed: `node previews/copilot/swag-interactive/run-backend.mjs browser-test`. The browser check is excluded from ordinary test discovery and uses its explicit local verification config. Final evidence validation: `node previews/copilot/swag-interactive/verify-final.mjs`.

## Exact application/test files changed (22)

- `apps/api/src/modules/copilot/copilotResponseFormat.js` — preserve provider-visible catalog identities.
- `apps/api/src/modules/copilot/swagDesignWorkflow.js` — verified name/context resolution, step validation, read/repair state, catalog browsing and saved-design freshness.
- `apps/api/src/modules/copilot/copilotChat.service.js` — named/contextual selection and navigation, current backend context, active-only pagination and unrelated-domain isolation.
- `apps/api/src/modules/copilot/copilot.controller.js` — existing-binding-backed interaction/review endpoints.
- `apps/api/src/modules/copilot/copilot.routes.js` — scoped validated routes and interaction rate limit.
- `apps/api/src/modules/copilot/copilotConversation.model.js` — persisted catalog pagination metadata.
- `apps/api/src/modules/copilot/copilotToolBindings.js` — active-swag page sizing and verified pagination metadata.
- `apps/api/src/modules/mcp/catalogRead.js` — share unchanged eligibility predicates with exact-name resolution.
- `apps/api/tests/copilot-response-format.test.js` — provider/Anthropic identity retention assertions.
- `apps/api/tests/copilot-swag-chat.test.js` — real natural-name selection and unrelated-workflow preservation.
- `apps/api/tests/copilot-swag-design.test.js` — names, contextual ambiguity, eligibility and context isolation.
- `apps/api/tests/copilot-swag-interactive.test.js` — isolated HTTP/state/navigation/publishing acceptance.
- `apps/api/tests/copilot-swag.browser-check.js` — explicit real-browser verification against isolated real services.
- `apps/web/src/features/copilot/CopilotProductCards.tsx` — existing-card controls and filtered pagination.
- `apps/web/src/features/copilot/CopilotPage.tsx` — one shared state binding, picker/review/history integration and safe edit/navigation callbacks.
- `apps/web/src/features/copilot/CopilotConfirmationCard.tsx` — optional swag Back / Edit action.
- `apps/web/src/features/copilot/copilot.css` — compact responsive controls in the existing design language.
- `apps/web/src/features/copilot/api.ts` — catalog pagination artifact typing.
- `apps/web/src/features/copilot/swagApi.ts` — typed calls to existing-binding-backed interaction endpoints.
- `apps/web/src/features/copilot/useSwagConversation.ts` — authoritative state, originating revision/conversation checks and read-only recovery.
- `apps/web/src/features/copilot/SwagWorkflowPanel.tsx` — functional progression, selection summary, artwork/designer and store controls.
- `apps/web/src/features/copilot/CopilotSwagInteractive.test.tsx` — frontend control, pagination, stale-action and recovery regressions.

Evidence-only scripts, logs, reports and screenshots are under this report directory. No real emails, financial operations, external image APIs, live collections or production/staging mutations were performed. No commits, pushes, merges, deployments, resets or Git remote changes were made.
