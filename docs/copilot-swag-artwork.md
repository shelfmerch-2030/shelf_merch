# Copilot automatic artwork application

The embedded Copilot can apply an uploaded company PNG to supported catalog products, save actual designs and mockups, and then offer a separate final Publish confirmation. No image-generation service is involved. The source logo is copied byte for byte to regular tenant artwork storage.

## Enable for controlled local testing

Use a dedicated local/test database. Do not point this exercise at production, staging or a customer workspace.

Build the private renderer from the existing dashboard sources:

```powershell
node scripts/build-swag-renderer.mjs
```

Set the API process's `SWAG_RENDERER_EXECUTABLE` to an approved installed Chromium browser, for example:

```powershell
$env:SWAG_RENDERER_EXECUTABLE = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
```

The existing `EMBEDDED_COPILOT_ENABLED` and `EMBEDDED_COPILOT_WRITE_COLLECTIONS` flags and normal role/tenant permissions must also permit the workflow. Restart the local API after setting its environment. No actual `.env` file was changed by this implementation. Without the renderer setting, the existing manual Save Design → designer → reload flow remains available and automatic Apply is not offered.

For repeatable automated verification with a newly created MongoMemoryReplSet and synthetic fixtures:

```powershell
node previews/copilot/swag-auto/run-backend.mjs artwork-final
node previews/copilot/swag-auto/run-backend.mjs artwork-browser-final
node previews/copilot/swag-auto/verify-final.mjs
```

The browser runner defaults to the existing Windows Edge installation; set `SWAG_RENDERER_EXECUTABLE` explicitly to use another approved browser. Run in a normal local execution context that permits the browser's own sandbox. In the Codex restricted command sandbox, the nested GPU process could not start; verification used authorized execution outside that tool sandbox, with Edge's sandbox still enabled. Neither `--no-sandbox` nor OS-security changes are used by the renderer.

## Customer path

1. Name the collection and select products through cards or conversation.
2. Upload a PNG through the existing attachment picker.
3. Review the proposed product/default-print-area targets. **Apply to All** is the explicit execution approval; there is no extra Save confirmation afterward.
4. Use **Choose Products** for a subset. Existing customized products are preserved unless replacement is deliberately selected and approved. Replacement affects the entire design of each selected product, including other print areas; the approval states this.
5. Review actual saved product mockups and choose **Looks Good / Continue**. **Edit Placement** opens the existing designer; **Change Logo**, Back and optional Save Design remain available.
6. Select eligible stores by controls or an exact instruction such as “Select AI Store.” Ambiguous names require clarification.
7. Review and click **Confirm & Publish**. Applying artwork is never publication approval.

Cancelled, expired or failed Apply reviews are not automatically recreated on reload. An unverified Apply remains blocked pending a status check. Neither uncertainty nor an expired lease authorizes a speculative replay.

## What is reused

The private browser bundle imports the actual `mapCatalogProduct`, `preferredDefaultAreaKey`, `bakeCollectionDesignMockups` and `mockup-bake` code. It builds the same Add Artwork draft: one default placeholder per chosen product and no invented placement coordinates. It uses the dashboard's image priority, physical-coordinate calculations, compositing and print export. The existing placement geometry, compositing implementation and saved-mockup preference fix are retained. Shared fallback and mixed-design saving now honor explicit per-product artwork intent.

The API owns an isolated headless browser, with a fresh temporary profile and no customer login/session. It calls rendering functions directly; it never clicks application controls. Images are fetched and bounded by the API, checked against the media allowlist, hashed into approval, and supplied to the browser as raster bytes. Browser network access is blocked. The existing fabric-texture randomness receives a fixed seed inside this private context so identical inputs can be rendered reproducibly; the dashboard algorithm itself is unchanged.

## Supported automatic targets

Automatic application requires a real rectangular catalog print area, valid physical dimensions and inch coordinates inside the product frame, a supported front/back view and an accessible raster product base. The selected default is the dashboard default, including left-chest areas explicitly associated with the front image. Graphic printing methods (`dtf`, `screen_print`, `sublimation`, `uv_print`) are supported; an empty method list retains the dashboard's default behavior.

Polygon areas, dedicated side-view defaults, embroidery/engraving-only areas, missing/invalid geometry, inaccessible images and oversized raster/export dimensions require the existing editor. Logo input retains the existing PNG/300-DPI/5-MB validation, with an additional 16-million-decoded-pixel bound for this rendering path. Product reads are capped at 10 MB; print exports at 16 million pixels.

Unsupported products are named in the proposal. Continuing with supported products requires an explicitly labelled partial-application click. Unsupported and unselected products are not silently branded. New explicit product refs carry `inheritArtwork: false`, so collection cards, the designer baker, storefront and order snapshots cannot borrow the collection-wide logo for an excluded product. Historical refs without this field retain their existing shared-logo fallback. Applying to a subset preserves any legacy shared logo still used by unchanged products; new targets use their own saved artwork URLs. If no targets are supported, the API identifies the manual-design requirement and does not expose a decorative Apply action.

## Persistence and recovery

The existing `swag.collection` WRITE workflow now accepts the embedded-only `apply` action. It binds actor, tenant, conversation revision, exact products/catalog configuration, original logo bytes, product-base bytes, existing saved design, chosen subset/replacement policy and renderer fingerprint. The fingerprint includes the bundle, browser engine and configured executable. Model-callable execution remains unavailable.

Rendering and immutable asset uploads occur before the Mongo transaction. Ownership is checked before staging and each upload. The existing owner/fence check, revalidated approval, catalog/attachment conflict writes and conversation compare-and-set protect the transaction. Actual saved refs are reread inside that transaction before writing the committed outcome receipt. No browser, external fetch or storage upload runs while that transaction is open.

Duplicate requests recover the committed receipt without another render. An unchanged pending review is reused. The service refuses a new approval while a matching consumed application is unverified. Partial rendering/upload failures never expose a partially customized Collection. Unreferenced staging assets can remain after failures/crashes; this change does not add an asset-GC service.

Save for Later keeps an unapplied upload pending and preserves existing customized products. It can resume through a fresh Apply approval without creating another collection. Older saved/unapplied conversation states can use Apply uploaded logo while their original actor-owned attachment remains valid; expired uploads require re-upload or the manual editor.

Ordinary editor placement changes can be adopted through revision-checked conversation metadata when collection identity, name, product manifest and shared artwork identity remain unchanged. Name/product/shared-artwork identity changes require deliberate review. Historical designs lacking the new metadata use that conservative path. Publishing still uses the existing transactional publishing services and separate explicit confirmation.

## Linux deployment prerequisite

The API supports Node 20+ and uses the existing Chromium Canvas implementation rather than a Windows-native Canvas module. The Docker build now builds and copies the platform-neutral private renderer, including the API sources imported by the dashboard build.

The existing Alpine runtime image does **not** automatically install a browser. Provision an approved Chromium/Chrome package for the target Linux image, configure its executable path, and verify it can run with its sandbox enabled under the intended non-root account and host policy. Do not add a `--no-sandbox` fallback. The application fails closed if the configured browser cannot start. The Windows verification is not a Linux-container smoke test; run that check before enabling this capability in production. No container build, deployment or production configuration change was performed here.

Detailed verification and exact changed files: `previews/copilot/swag-auto/REPORT.md`.
