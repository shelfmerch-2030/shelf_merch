# Automatic artwork and per-product scoping ? final report

Implemented for supported catalog products and verified for controlled local testing. The subset/shared-logo fallback defect is fixed. Save for Later resumes through an Apply approval without creating another collection. No commit, push, deployment or production/staging mutation was performed.

## Root cause and scoping fix

Legacy collection-wide artwork was used as a fallback whenever a product lacked its own artwork. Consequently, a product excluded from Apply could still appear branded in collection cards, the designer or storefront despite having no saved customized mockup.

New explicit product refs carry `inheritArtwork: false`. The mapper, artwork-layer resolver, thumbnail, dashboard baker, storefront listing and order snapshot honor that intent. Excluded products stay unbranded; explicit per-area artwork on selected products still renders. An absent flag retains historical shared-logo behavior. An unchanged legacy product keeps its original shared logo when a different logo is applied elsewhere. Dashboard edits and confirmed artwork removal preserve the explicit policy.

The earlier saved-mockup preference fix is retained. Placement geometry, default-area selection and actual compositing/export implementations are reused; the verifier compares protected renderer functions with the task baseline. The mixed-design save check permits deliberately unbranded products rather than demanding a generated mockup for every brandable product.

## Renderer, approval and persistence

The API owns a headless Chromium/Edge context and calls a private bundle of the existing dashboard functions directly. It does not click UI controls or depend on the customer tab. The existing mapper, default-area selector, mockup baker and print exporter produce actual PNGs. A deterministic texture seed is used inside the private context; the source logo is copied byte for byte.

The Windows native-Canvas restriction remains intact. The selected browser path works with Edge?s sandbox enabled. Verification required authorized execution outside the Codex command sandbox; Windows Application Control and antivirus were not disabled, and no new browser executable was downloaded.

Apply reuses the existing embedded `swag.collection` WRITE confirmation and receipt machinery. Approval binds actor, tenant, conversation revision, catalog/design configuration, chosen subset, replacement policy, actual logo/base-image hashes and the renderer/engine fingerprint. Rendering and immutable uploads occur outside Mongo transactions. Fenced ownership checks precede staging/uploads; the transaction revalidates approval, conflicts with catalog/attachment edits, updates conversation state and rereads saved refs before committing the receipt. Applying artwork does not approve publication.

Existing customized products are preserved unless replacement is explicitly selected. The approval warns that replacement affects the entire selected product design, including other print areas. Unsupported products are named; partial application requires the explicitly labelled supported-products action. Unselected products and legacy shared artwork are preserved.

Duplicate clicks recover the committed receipt. Pending Apply reviews are reused across reload. Dismissed reviews are not automatically recreated. Unverified applications remain unresolved and block fresh preparation pending a status check; known failures can be reviewed explicitly. No speculative execution retry is introduced.

## Customer flow and Save for Later

Name ? Select products ? Upload logo ? Apply to All / Choose Products ? Review actual saved mockups ? Select store ? Confirm & Publish. The normal successful path requires neither a separate Save confirmation nor manual designer/reload steps. Precise placement remains available through the existing editor.

Save for Later preserves existing product designs, leaves an unapplied upload pending and resumes through a fresh Apply approval against the same Collection. Saving an upload alone does not visually apply it. Older saved/unapplied states can reauthorize the original attachment where still valid. Expired uploads require a fresh upload or the existing editor.

## Verification

**659 passed; 0 failed; 0 pending across 60 distinct test files.** Every listed final JSON report and individual assertion was checked for completeness, failures, pending/todo tests and duplicate file counting.

| Final report | Passed | Failed | Pending |
|---|---:|---:|---:|
| artwork-final | 31 | 0 | 0 |
| artwork-browser-final | 1 | 0 | 0 |
| image-consistency-final | 6 | 0 | 0 |
| acceptance-final | 66 | 0 | 0 |
| catalog-final | 37 | 0 | 0 |
| api-dashboard-final | 48 | 0 | 0 |
| api-copilot-state-final | 17 | 0 | 0 |
| api-copilot-attachments-final | 8 | 0 | 0 |
| api-copilot-reads-final | 4 | 0 | 0 |
| api-copilot-domains-final | 9 | 0 | 0 |
| api-copilot-provider-final | 20 | 0 | 0 |
| api-financial-final | 84 | 0 | 0 |
| api-redemption-final | 23 | 0 | 0 |
| web-final | 304 | 0 | 0 |
| browser-test | 1 | 0 | 0 |

Focused artwork coverage includes real generated logo pixels, product-specific print sizes/defaults, subsets, unsupported areas/methods, legacy fallback preservation, explicit unbranded views/order snapshots, replacement protection, source mutation, stale catalog/lease rejection, staged failure, durable receipt recovery, Save for Later resume/preservation and confirmed removal. Frontend coverage verifies controls, approval labels, uncertainty, restored progress and shared-state selection. Publishing, financial integrity, WRITE-state, redemption and kit regressions also pass.

Actual Edge verification used the existing `/ai-test/copilot` page, a real isolated API, MongoMemoryReplSet and local asset storage. It exercised a real file input and multipart upload, backend rendering, saved mockup loading, reload with one Apply review, duplicate-click protection and a separate Publish confirmation. The AI provider was mocked. These are synthetic catalog/logo fixtures, not live Claude or real-customer verification. The existing Skip Artwork and image-consistency browser checks also pass.

TypeScript still reports the same **26 pre-existing errors**, with **0 new errors**. Typecheck is not green. Earlier diagnostic/initial runs are superseded by the listed final reports; no failed regression test remains outstanding.

Source preservation checks confirmed 2473 captured baseline files unchanged byte for byte. Existing financial services, wallet/Send Points operations, public MCP tool implementations and placement geometry were preserved. Diff checks pass.

## Exact files changed

- `apps/api/src/modules/collections/collection.model.js`
- `apps/api/src/modules/collections/collectionQueries.js`
- `apps/api/src/modules/collections/collectionDesign.service.js`
- `apps/api/src/modules/storefront/brandedShopProducts.js`
- `apps/web/src/services/mappers.ts`
- `apps/web/src/features/swag/mockup-bake.ts`
- `apps/web/src/features/swag/bakeCollectionDesign.ts`
- `apps/web/src/features/swag/DesignedProductThumb.tsx`
- `apps/web/src/features/swag/artworkScope.test.tsx`
- `apps/api/src/modules/copilot/swagDesignWorkflow.js`
- `apps/api/src/modules/copilot/swagArtwork.service.js`
- `apps/api/src/modules/copilot/swagRenderer.service.js`
- `apps/api/src/modules/copilot/copilot.routes.js`
- `apps/api/src/modules/copilot/copilot.controller.js`
- `apps/api/src/modules/copilot/copilotChat.service.js`
- `apps/web/src/features/swag/rendererEntry.ts`
- `apps/web/src/features/copilot/CopilotPage.tsx`
- `apps/web/src/features/copilot/CopilotConfirmationCard.tsx`
- `apps/web/src/features/copilot/useSwagConversation.ts`
- `apps/web/src/features/copilot/SwagWorkflowPanel.tsx`
- `apps/web/src/features/copilot/SwagSavedPreviews.tsx`
- `apps/web/src/features/copilot/swagPresentation.ts`
- `apps/web/src/features/copilot/swagApi.ts`
- `apps/api/tests/copilot-swag-artwork.renderer-check.js`
- `apps/api/tests/copilot-swag-artwork.browser-check.js`
- `apps/api/tests/fixtures/swagArtwork.js`
- `apps/api/tests/copilot-swag-chat.test.js`
- `apps/api/tests/copilot-swag.browser-check.js`
- `apps/web/src/features/copilot/CopilotSwagArtwork.test.tsx`
- `scripts/build-swag-renderer.mjs`
- `apps/api/package.json`
- `package.json`
- `package-lock.json`
- `.gitignore`
- `apps/api/Dockerfile`
- `docs/copilot-swag-artwork.md`

Supporting snapshots, repeatable runners, compiled-renderer manifest verification, final JSON reports and screenshots are in `previews/copilot/swag-auto/`. Generated `apps/api/renderer/` assets are ignored build outputs.

## Remaining limitations and deferred findings

- Automatic placement is limited to supported rectangular front/back/default print areas, valid catalog physical geometry, graphic printing methods and accessible bounded raster bases. Polygon/dedicated-side/embroidery-only/engraving-only or invalid/oversized configurations require manual design. It does not support every catalog product.
- The approved browser must be installed/configured. The Linux Docker build includes the private bundle, but the existing Alpine runtime does not provision a browser automatically. A Linux browser/sandbox smoke test remains required before production enablement; no Linux container runtime was tested here.
- There is one bounded render job per API process, with a 60-second browser deadline. Failed/crashed staging can leave unreferenced immutable assets; asset garbage collection is deferred. No outbox or new background architecture was added.
- Historical missing/incorrect saved assets are not regenerated silently. Historical refs without the new flag keep their prior fallback behavior.
- Expired/private attachment reauthorization and the 26 existing TypeScript errors remain documented limitations. Non-blocking work is deferred rather than expanding this task.

## Controlled local testing

Use an isolated local/test database and an approved installed browser. Do not use production or staging credentials/data. From the repository root:

```powershell
node scripts/build-swag-renderer.mjs
$env:SWAG_RENDERER_EXECUTABLE = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
node previews/copilot/swag-auto/run-backend.mjs artwork-final
node previews/copilot/swag-auto/run-backend.mjs artwork-browser-final
node previews/copilot/swag-auto/verify-final.mjs
```

The runners force their own MongoMemoryReplSet and synthetic fixtures. Real-renderer acceptance is opt-in (`.renderer-check.js`) so ordinary API unit tests do not require a browser. See `docs/copilot-swag-artwork.md` for enabling the feature on a dedicated local app using the existing Copilot collection-write flags.

Manual local checklist: name a collection; select products; upload your own valid PNG; approve Apply; inspect saved previews; continue to a local store; approve Publish once. Repeat with Choose Products and verify excluded products remain unbranded in collection/store views. Check a legacy collection retains its original logo. Save an unapplied upload for later, reload and resume Apply; verify the same Collection is used. Use Edit Placement only for precise/unsupported work. Do not publish to a live customer store.

**Ready for controlled local testing with a configured approved browser. Production enablement still requires the Linux browser/sandbox check.**
