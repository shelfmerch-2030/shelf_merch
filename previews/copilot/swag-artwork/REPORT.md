# Saved mockup consistency: verified fix; artwork automation blocked

The saved-image mismatch is fixed and verified with isolated fixtures and a real Edge browser. The requested automatic Apply Artwork operation and simplified customer journey are **not implemented**. The existing confirmed Save Design → visual editor → reload → Publish workflow remains available. This task is partially completed.

## Root cause and exact fix

`savedDesignPreview` deliberately returned `preferBakedMockup: false` for products with per-area artwork, and for products with multiple print areas. `CollectionInlineCard` passed that value to `DesignedProductThumb`. That caused collection listings and the Published Collections management tab to composite artwork again over current catalog images instead of displaying the saved product-specific PNG. The storefront and Copilot saved-preview card already used saved references. Recomposition can look different from the saved bake, even with identical placement references.

The helper now prefers a persisted `product.mockupUrl` / `mockupBackUrl` before applying legacy fallback rules. It retains individual artwork references for intentional variant tinting, never maps a front image onto a back view, and preserves the existing fallback for designs without saved mockups. No collection data is rewritten or regenerated.

| Surface | Authoritative source / behavior |
|---|---|
| Collection listing and Published Collections | Collection product ref → mapper → `savedDesignPreview` → saved default mockup; this is the corrected path |
| Shop collection dialog / branded product thumbnail | Already preferred the product ref's saved mockup |
| Copilot saved previews | `designs[].mockupUrl`, hydrated from the actor-authorized saved Collection; historical receipts remain historical snapshots |
| Storefront | `mapBrandedListing` resolves the exact collection ID × catalog product ID pair and carries its saved mockup and placements |
| Storefront home preview | `toFeaturedPreviewProduct` prefers the mapped product's saved mockup |
| Manual designer | Existing editable per-product artwork and placement state is unchanged; an unsaved edit can intentionally differ from a saved PNG |
| Explicit colour / angle previews | Continue to use saved per-area artwork, placements and view-specific sources |

`publishCollectionToShop` and `syncCollectionPublishTargets` already preserve productRefs and activate collection/product listing keys. Isolated tests confirm their behavior for two shops, updated images after unpublish/edit/republish, and the same catalog family in different collections. No publishing-service change was needed. Existing upload storage generates new random asset URLs; the UI rerender test verifies newly returned URLs replace old ones. These checks do not establish the behavior of a particular production CDN or prove that every historical saved asset is correct.

## Exact application/test files changed

1. `apps/web/src/features/swag/mockup-bake.ts` — the saved-mockup preference described above; the only retained production-code change.
2. `apps/web/src/features/swag/savedMockupConsistency.test.tsx` — 10 focused tests using actual UI components/mappers; only intentional tint rendering is mocked.
3. `apps/api/tests/swag-mockup-consistency.test.js` — 6 isolated MongoMemoryReplSet tests exercising actual Collection, publishing, Copilot hydration and storefront services.
4. `apps/api/tests/copilot-swag.browser-check.js` — optional `SWAG_IMAGE_CHECK=true` branch renders the real components against synthetic image fixtures after the existing isolated browser publish test. The ordinary test does not require this branch. The synthetic PNG was corrected to contain valid PNG checksums.

Supporting evidence and repeatable runners are in this directory, including `browser-fixture.tsx`, `run-backend.mjs`, `verify-final.mjs`, JSON reports, browser screenshots and the source-preservation snapshot.

## Automatic artwork application: exact blocker

The dashboard's existing `bakeCollectionDesignMockups` and `mockup-bake` implementation use browser Image and Canvas APIs. The backend's `mockupComposite` supplies geometry helpers, not a functioning image renderer. A server adapter using that same pipeline requires a supported Canvas runtime.

The available native Canvas package installed, but Windows Application Control refused to load:

```text
An Application Control policy has blocked this file.
node_modules/@napi-rs/canvas-win32-x64-msvc/skia.win32-x64-msvc.node
ERR_DLOPEN_FAILED
```

See `renderer-blocker.txt`. The package's outer error misleadingly suggests an npm optional-dependency problem; the nested OS policy denial is the actual cause observed here. No policy bypass was attempted.

The experimental adapter, shared rendering extraction, apply schema/UI changes and active dependency/lockfile changes were removed. Preservation checks confirm all existing backend/application workflow files were restored byte for byte. No unverified Apply button or backend operation remains. Downloaded ignored dependency files may remain in node_modules; neither package manifest nor lockfile references the experiment.

The missing capability is a permitted, verified backend Canvas renderer with equivalent support for the dashboard's drawing/compositing operations. Until it is available and tested, automatic placement is supported for **no product types through Copilot**. The manual designer remains the supported artwork path. Apply All/subset, automatic confirmed persistence, replacement protection for that new operation, simplified Save/Reload orchestration and its full browser acceptance journey remain outstanding. Those capabilities are not represented by the passing regression total below.

## Verification

**575 passed; 0 failed; 0 pending, across 50 distinct test files.** The final verification script checks every listed JSON report, individual assertion status, suite status, completeness and duplicate test-file counting.

| Final report | Passed |
|---|---:|
| New backend mockup consistency | 6 |
| Existing Swag acceptance / chat / interaction | 62 |
| Catalog | 37 |
| Collections / dashboard / publishing | 48 |
| Copilot WRITE-state | 17 |
| Attachments | 8 |
| Copilot reads | 4 |
| Copilot write domains | 9 |
| Provider binding/schema regression | 20 |
| Ledger / financial integrity / combined Send Points / write safety | 84 |
| Frontend Copilot / Swag / media / publishing, including 10 new image tests | 279 |
| Actual Edge isolated publishing + image component check | 1 |

The pre-fix diagnostic reproduced **4 failures** in the new image suite; all 10 pass with the fix. `reproduced-before-fix.json` is intentionally failing historical evidence, not a final result. Early fixture/runner failures were corrected and superseded by the final reports; none is counted as passing.

TypeScript still reports the same **26 pre-existing diagnostics**, with zero added diagnostics. Typecheck is not green. Its first run exhausted Windows memory; the bounded rerun (`GOMAXPROCS=2`, `GOMEMLIMIT=2GiB`) completed and matched the prior diagnostic set exactly.

The real Edge check used the actual `/ai-test/copilot` route, an ephemeral real API server, an isolated MongoMemoryReplSet and a mocked AI provider. All API traffic was redirected to that isolated server and unrelated network requests were blocked. It verified product selection, reload, Skip Artwork, store selection, confirmation and duplicate-click publishing. Its additional component fixture verified that collection, saved design review, management and Copilot components actually loaded 12 image elements for three saved products, then switched to version-two URLs; the storefront-home resolver agreed. The images are synthetic PNG pixels: this proves URL selection and loading, **not the visual quality of real customized products**. The requested customer collection and full upload/automatic-apply/editor journey were not exercised in a live workspace.

`verification.json` records 2,492 original app files preserved byte for byte, with only the intended existing helper and browser test altered and two new tests added. Send Points, wallets, ledger, budgets, kits, gifting and publishing business code are unchanged by this task. No live data, email, financial operation, production/staging publication, deployment or Git commit/push/reset/remote operation was performed.

## Controlled local checks

From the repository root, with dependencies available:

```powershell
node previews/copilot/swag-artwork/run-backend.mjs image-consistency
node previews/copilot/swag-artwork/run-backend.mjs browser-test
node previews/copilot/swag-artwork/verify-final.mjs
```

The browser runner requires Microsoft Edge at the path used in the existing browser check; it sets `SWAG_IMAGE_CHECK=true`, forces its own replica set and creates only synthetic collection/store fixtures in the test database. It never uses the existing customer `ai-test` database. The verification script expects the other final regression reports already present in this directory.

For a read-only visual review in an authorized local workspace, open an existing customized collection in Swag and Published Collections / shop management, then compare each saved default product image with its storefront image. Check an intentional back view separately and select a colour variant separately. Do not publish or alter an existing customer collection for this check. Any historical asset that is itself incorrect needs deliberate regeneration in the manual designer; this display fix does not rewrite historical artwork.

Ready for controlled local testing of the saved-image fix and the existing manual workflow. **Not ready to declare the requested automatic, beginner-friendly end-to-end journey complete.**
