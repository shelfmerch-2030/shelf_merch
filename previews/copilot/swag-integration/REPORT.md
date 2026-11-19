# Swag design and store publishing integration

The supported lifecycle is implemented in the embedded Copilot: collection naming → verified catalog selection → optional artwork → save/editor handoff when needed → verified store selection → one explicit publication confirmation → recorded result. The no-artwork lifecycle is exercised through the real chat/tool/confirmation/publishing services against isolated MongoDB. The AI provider and file storage are mocked. This is readiness for controlled local testing, not a claim of live or fully browser-driven designer verification.

## Dashboard → MCP → Copilot mapping

| Dashboard operation | Existing backend / MCP support | Embedded integration |
| --- | --- | --- |
| Name and select products in `/swag/new` | Collection `name` and `productRefs`; `catalog_search`, `catalog_get_product`, category tools | `swag_configure` keeps versioned selections in the actor-owned conversation. It does not create a Collection. Naming, additions, deduplication, removal and replacement preserve exact catalog IDs. |
| Catalog cards and variants | `catalogProductMongoFilter`, `toCatalogProductDetail`; existing catalog cards | Active eligible catalog data, GST-inclusive stored selling prices, official images and enabled variants are reused. No synthetic products, stock or prices. |
| Upload artwork | Dashboard `validateArtworkUpload` → `validateArtworkBytes` → `uploadFile(kind: artwork)` | A distinct **Swag design artwork** option in the existing `+` menu uses that same PNG/size/DPI validator and storage service. Attachment authorization includes tenant, actor, conversation, kind, status and expiry. Store-logo upload behavior remains separate. |
| Place/resize artwork and generate mockups | Existing visual designer, `bakeCollectionDesignMockups`, collection artwork/mockup routes, saved `placement`, `placements`, `printSpec`, mockup and print asset references | Confirmed Save Design associates the uploaded artwork. The result links to the existing editor, hydrated from the saved Collection. Copilot reloads that Collection to verify actual product-specific saved references. Saved mockups can be displayed in review/results. Copilot does not generate a replacement canvas or pretend an upload is an applied design. |
| Save Design | Collection create/update routes; existing MCP `shops.collection_draft` requires a store and has narrower artwork reuse rules | Shared `createCollectionDesign` / `updateCollectionDesign` persistence is extracted from the dashboard path. `swag.collection` with `action: save` saves without linking any store. It does not require store selection. |
| Publish to selected stores | Dashboard uses `publishCollectionToShop` / `syncCollectionPublishTargets`; existing MCP collection publisher supports one store and requires a design | The embedded `action: publish` path uses the same additive `publishCollectionToShop` service for each approved store in one MongoDB transaction, with optional artwork. Existing public MCP semantics remain unchanged. Draft stores remain draft; collection listings become active in the selected stores. |
| Explicit approval / outcome recovery | MCP PREPARE / confirmation / idempotency and server-authoritative Copilot WRITE-state services | Embedded PREPARE and UI-only EXECUTE bind the conversation revision, collection content, exact products/variants, artwork references, saved placements, target stores and their current state. Completion receipts commit with the collection and listings. Reload/status reconciliation reads recorded outcomes and cannot automatically replay an uncertain write. |

There are still **67 public MCP tools**. Three embedded-only bindings were added: `swag_configure`, `swag_prepare_collection`, `swag_execute_collection`. Together with the existing Send Points pair, the embedded inventory contains 72 entries. All new bindings honor the existing collections rollout flag; the default read-only tool baseline remains 23 when domain writes are disabled. EXECUTE is unavailable to the model.

## Conversation behavior and safety

- A bare “I want to design swag” starts with only “What would you like to name your swag collection?” It creates conversation metadata, not a collection. An already supplied name is not discarded by that initial question.
- The model uses the recorded revision to change selections, asks for the next missing step, and can read the current state or list/load saved collections. Real catalog cards and existing store reads supply resource identities.
- Artwork is optional. A new uploaded logo must be saved and placed in the existing editor before Copilot publishes it as a customized design. Existing saved designs can include a mix of customized and uncustomized products. New products needing placement are handed back to the editor. `artwork: none` explicitly clears all saved artwork only on the subsequent confirmed write; a replacement upload invalidates old product mockups.
- Review includes actual names, product count, variant policy, artwork state, saved print-area labels, target stores, draft-store warnings and expected visibility. **Confirm & Save Design** and **Confirm & Publish** are distinct.
- Execution revalidates active actor/tenant/permissions and resource eligibility. Conversation revision writes, collection writes, store publication and a durable completion receipt share one transaction. Catalog/attachment version writes force transaction conflicts if those resources change concurrently. Manifest changes require a fresh preview.
- The shared MCP executor gains an **opt-in** execution-context parameter. Only the new swag workflow uses it to check owner/fence/lease atomically inside its transaction. Other workflows retain their existing one-argument execution calls and behavior. Stale owners cannot save or publish.
- A later-store failure aborts all changes in this operation. No partial multi-store success is reported. A crash or lost acknowledgement after commit is recoverable from the receipt; an unverified/absent receipt is never permission to replay automatically. A consumed/unverified result has a read-only status action.
- Retries use a confirmation-stable UI key. Concurrent requests/independently prepared approvals cannot duplicate a collection or listings for the same revision. Cancelled/expired confirmations remain terminal; subsequent “okay” and reload use authoritative outcomes.

## Verified capabilities and limitations

The Collection model persists catalog-product families, not a chosen subset of variant SKUs. All enabled variants remain available as in the dashboard. Copilot preserves those verified identities and does not promise to persist a color/size subset that the Collection model cannot represent.

Precise placement, size, print-area selection and product-specific artwork manipulation require the existing visual designer. There is no safe server-side canvas/mockup-generation operation to invoke from chat. Tests verify saved-design reload, preservation of per-product placement references, actual mockup URLs, global artwork removal and replacement association. They use saved-editor fixtures rather than pretending to run the visual canvas. Selective removal of already persisted print-area artwork is not added as a chat-only mutation: the existing dashboard PATCH intentionally preserves blank/omitted design fields. Save/reload in the visual designer must be checked for that operation; Copilot must report the state actually saved rather than claim removal from a chat request alone.

Publishing an already published Collection through this new editing workflow is deliberately rejected; existing dashboard/public MCP management remains available. Store creation is never implicit. An interrupted transaction without a committed receipt requires status review/fresh explicit approval, not automatic continuation.

Controlled local testing should include the real editor upload → place → Save Design → return to Copilot → reload saved Collection → Confirm & Publish sequence using disposable local data. No live publication or full interactive-browser customization verification was performed here. MongoDB transaction support is required; the current application already uses transactions for its financial workflows.

Use the existing `EMBEDDED_COPILOT_WRITE_COLLECTIONS=true` rollout setting in that disposable local environment, with the normal embedded Copilot/provider configuration. No environment files or deployment settings were changed by this task.

## Final test evidence

All reports below have matching actual assertion counts, zero failed assertions, zero pending assertions and no duplicate test-file counting:

| Final report | Passed | Failed | Pending |
| --- | ---: | ---: | ---: |
| `api-acceptance-final.json` — new swag workflow/chat acceptance | 40 | 0 | 0 |
| `api-dashboard-final.json` — collection/design merge/store visibility/MCP registry/discovery | 48 | 0 | 0 |
| `api-copilot-final.json` — WRITE-state, attachments, READs, domain writes and provider compatibility | 58 | 0 | 0 |
| `api-financial-final.json` — MCP safety, combined Send Points, ledger, wallet integrity | 84 | 0 | 0 |
| `web-final.json` — Copilot, swag, collection publication and media regressions | 255 | 0 | 0 |
| **Total: 42 distinct test files** | **485** | **0** | **0** |

The new focused coverage comprises 40 backend and 16 frontend cases. It includes name validation, real product/variant identities, multi-product removal, optional artwork, valid/invalid PNG and DPI, foreign/expired attachments, saved versus unsaved designs, editor handoff/reload, mixed designs, multiple stores, role revocation, tenant/actor isolation, cancellation/expiry, retries/concurrent execution, stale ownership, a catalog mutation racing inside the transaction, rollback after a later store fails, committed receipt recovery and authoritative conversation reload.

An initial larger API process produced no final report. Bounded single-worker groups completed verification. A rollout-gate regression was fixed so the conversation-only tool is hidden with the collections feature disabled. The read-only baseline runner explicitly disables domain flags, and tests enable their own domains. Inventory/discovery assertions were updated to explicitly verify the new embedded bindings; financial assertions were not weakened.

Repository-wide frontend typechecking still reports the **same 26 existing diagnostics** as the previous task, with **zero new diagnostics** (same file/code/message set). No unrelated type fixes were attempted. Diff whitespace checks pass. The previously observed unrelated SEO test failure was outside this selected regression run; no claim is made that the entire repository test suite is green.

`verify-final.mjs` validates report completeness, unique counting, preservation and diagnostic comparison. Of 118 previously dirty app files snapshotted for this task, **107 remain byte-for-byte unchanged**; changes to the other 11 are within the intended integration files below. Newly modified previously clean files and new files are also restricted to this manifest. Earlier Send Points implementation and tests, wallet/budget/ledger business code, kits and gifting implementation files remain unchanged.

## Exact application/test files changed (27)

- `apps/api/src/modules/collections/collectionDesign.service.js` — new shared design persistence helpers.
- `apps/api/src/modules/collections/collections.routes.js` — reuse those helpers; dashboard semantics retained.
- `apps/api/src/modules/shops/shopCatalogSync.js` — optional transaction session for the existing publisher; default callers retain their original query behavior.
- `apps/api/src/modules/copilot/swagDesignWorkflow.js` — versioned selections, verified resource planning, approval, atomic save/publication and receipt.
- `apps/api/src/modules/copilot/copilotChat.service.js` — name-first entry, conversation-bound swag tool context, workflow instructions and routing.
- `apps/api/src/modules/copilot/copilotToolBindings.js` — embedded bindings.
- `apps/api/src/modules/copilot/copilotMcpCatalog.js` — explicit embedded inventory metadata.
- `apps/api/src/modules/copilot/copilotTools.js` — collections rollout gate for conversation configuration.
- `apps/api/src/modules/copilot/copilotWrites.service.js` — register the confirmed workflow in existing HTTP WRITE handling.
- `apps/api/src/modules/copilot/copilotDiscovery.js` — existing collections discovery entry starts with naming.
- `apps/api/src/modules/copilot/copilotConversation.model.js` — conversation-only swag state and artwork attachment kind.
- `apps/api/src/modules/copilot/copilotAttachment.model.js` — swag artwork kind.
- `apps/api/src/modules/copilot/copilotAttachments.service.js` — existing designer validation/storage and scoped attachment references.
- `apps/api/src/modules/copilot/copilot.routes.js` — accept the new attachment purpose.
- `apps/api/src/modules/mcp/mcpWriteSafety.js` — opt-in execution owner/fence context; default execution calls unchanged.
- `apps/api/tests/copilot-swag-design.test.js` — isolated backend acceptance/fault injection.
- `apps/api/tests/copilot-swag-chat.test.js` — mocked-provider, real-tool conversational lifecycle and WRITE-state acceptance.
- `apps/api/tests/copilot-mcp-catalog.test.js` — explicit new embedded inventory and unchanged public registrations.
- `apps/api/tests/copilotDiscovery.test.js` — new embedded discovery mapping while retaining exact operation checks.
- `apps/web/src/features/copilot/CopilotConfirmationCard.tsx` — reuse confirmation/result cards with save/publish labels, verified details, links and status checking.
- `apps/web/src/features/copilot/SwagSavedPreviews.tsx` — persisted mockup previews only.
- `apps/web/src/features/copilot/swagPresentation.ts` — presentation from verified previews/outcomes.
- `apps/web/src/features/copilot/CopilotSwagDesign.test.tsx` — focused UI regression cases.
- `apps/web/src/features/copilot/CopilotComposer.tsx` — swag artwork in the existing attachment menu.
- `apps/web/src/features/copilot/CopilotUserMessage.tsx` — attachment label/transport suffix handling.
- `apps/web/src/features/copilot/attachments.ts` — typed upload purpose and frontend file checks; server remains authoritative.
- `apps/web/src/features/copilot/api.ts` — attachment kind and request typing for workflows without a name field.

Evidence-only files are confined to this report directory. No real collections, artwork uploads, store publications, invitations or wallet deductions were performed. No production/staging mutations, commits, pushes, resets, deployments or Git remote changes were made.
