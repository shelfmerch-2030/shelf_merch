# ShelfMerch Gifting Curator — implementation and verification report

Date: 10 November 2026. Scope: the gifting curator inside the existing embedded Copilot. Local changes only; no commit, push or deployment.

## Result and milestones

The curator is implemented within the existing React/Express/MongoDB application. It uses the configured Claude provider, existing Copilot conversations and SSE, and existing authenticated catalog/kit READ bindings. A live Claude smoke test passed for the Toast brief, catalog recommendations, switching to external inspiration, and preserving external preference on a further refinement. The live test used an isolated database with synthetic catalog records, not production inventory.

| Stage | Status |
| --- | --- |
| A: repository audit and UX architecture | Complete; reuse map below |
| B: conversational brief and visual workspace | Implemented and tested |
| C: ShelfMerch catalog and kit READ integration | Implemented and tested |
| D: selection, comparison, shortlist and refinement | Implemented and tested; shortlist lives in component memory |
| E: external inspiration | Implemented; explicitly unverified, no shopping data |
| F: verified external product research | Dependency missing; not implemented or advertised as available |
| G: future image generation | Interface defined; no runtime generator connected |

## Architecture findings and reuse

| Concern | Existing implementation reused |
| --- | --- |
| Workspace, history and layout | `apps/web/src/features/copilot/CopilotPage.tsx`, `CopilotHistory.tsx`, existing dashboard shell |
| Welcome and capability discovery | `CopilotWelcome.tsx`, server `copilotDiscovery.js`; six category system retained |
| Composer and attachments | `CopilotComposer.tsx`, existing `api.ts`, `copilotAttachments.service.js` ownership and upload validation |
| Conversation state and SSE | Web `api.ts` sends `mode: curator` through the existing message endpoint; `copilot.controller.js` streams tool/delta/artifacts/done events |
| Conversation persistence | `copilotChat.service.js` scopes conversations by tenant and user; `copilotConversation.model.js` stores curator brief and recommendation artifacts |
| AI provider abstraction | `copilotAiProvider.js`, `providers/anthropicChatAdapter.js`, existing OpenAI adapter compatibility; no separate chatbot or new AI client architecture |
| Catalog reads | `copilotTools.js` → `copilotToolBindings.js` → MCP `catalogSearch.js` / `catalogRead.js` |
| Catalog data | Real ID/name, `primaryImageUrl`, GST-inclusive `sellingPriceInr`, categories and variants; availability derived from returned variant stock |
| Filtering and pagination | Existing literal query/category filters, price bounds, page and limit; curator requests at most 12 items per search |
| Curated/customized kits | Existing `kits_list_curated` and `kits_list` bindings to `kitsRead.js`; kit image, contents, status and `priceInr` reused |
| Cards and media | Existing card conventions, `resolveMediaUrl`, tenant paths; dedicated curator cards add selection without changing ordinary product/kit cards |
| Authorization | Existing authenticate/tenant middleware, `buildCopilotToolCtx`, role checks in `runCopilotTool`, scoped kit services |
| Quotas, flags and audit | Existing enabled/provider checks, HTTP limits, daily token quotas and `recordUsage`; curator audit entry adds model/read call and token metrics |
| Existing gifting behavior | Ordinary gifting suggestions and `gifts_search` remain available in normal Copilot; curator has a separate recommendation-only branch |

Registered tool presence was not treated as proof of product discovery. The actual catalog/kit schemas and mapping functions were inspected. The SEO module has Semrush/Windsor research integrations, but these return SEO/analytics data and do not satisfy verified merchant product discovery with product imagery, prices and availability.

## Features and source separation

- Discoverable **Curate Gifts** action, six starter prompts, existing editable composer, desktop conversation/recommendation columns and mobile tabs.
- Persistent company, occasion, recipients, budget, exclusions, style and source preference across turns. Missing essentials are requested together. Toast is retained as the company name.
- ShelfMerch concepts resolve only IDs returned by existing READ handlers. Unknown model-generated IDs are discarded. Images and prices come from those records, not model prose.
- Gift themes, concise rationale, packaging ideas, per-person item estimate, recipient total and over-budget flag. Existing kits and suggested combinations have distinct labels.
- Select/deselect, remove, clear, compare, shortlist totals and suggested refinements. Currency groups stay separate and missing prices produce partial estimates.
- External-only mode exits catalog retrieval before any catalog or kit READ call. It stays external until explicitly switched. Inspiration has no verified price, merchant, product URL or image.
- External cards and assistant text clearly state that pricing and availability are unverified. Current trends are not claimed as verified facts.
- Normal Copilot remains available through **Normal Copilot**. Existing history, composer, upload handling and confirmation components remain in place.

No business writes are invoked during recommendations or shortlisting. Conversation, usage and audit persistence still occur as required. No kit, store, order, campaign, payment, wallet transfer or invitation is created by the curator.

## Corrections completed in this continuation

1. Accept active platform curated kits while retaining live-only customized kit recommendations.
2. Reserve candidate capacity for kits so full product searches cannot crowd out both kit readers.
3. Reject unavailable kits and kits with unknown contents when exclusions need checking.
4. Keep absent kit prices unverified: the shared READ summary uses zero as its missing-price fallback, which must not become a free gift claim.
5. Project customer-facing recommendation fields instead of persisting raw stock counts and internal SKUs. Bound descriptions and model-facing product metadata.
6. Recalculate per-person cost when the recipient count changes under a total budget. An explicit new per-person budget clears the previous total-budget basis.
7. Honor explicit exclusion removal without adding the removed category back during deterministic parsing.
8. Give external ideas content-based selection keys so different recommendations in the same card position cannot collide with a previous shortlist.
9. Recognize additional external/source-reset phrases, including “outside of ShelfMerch” and “no external products”.
10. Update an obsolete discovery-test assertion: it capped each category at six actions although the existing registry has more. The test now verifies six nonempty categories with unique action IDs. Discovery behavior and registered READ/WRITE handlers were not changed.

The configured Claude model rejected forced tool selection during verification. The final implementation retains the existing adapter behavior and validates the returned structured planning call. Neither provider adapter has a final source change.

## Verification

| Check | Result and evidence |
| --- | --- |
| Focused curator API tests | **17 passed** across two files; [log](curator-focused-tests.txt) |
| Full Copilot API regression | **110 passed** across 18 files, using isolated provider/write defaults, local test storage and thread workers; [log](curator-api-tests.txt) |
| Frontend Copilot regression | **53 passed** across 10 files; [log](curator-web-tests.txt) |
| Real configured Claude | **Passed**, three conversational turns: catalog curation → outside ShelfMerch → more unique ideas; [results](curator-live-results.json) |
| Production frontend build | **Passed**; existing shared-bundle size warning remains; [log](curator-build.txt) |
| Repository-wide TypeScript check | **Failed** on existing kit/swag/service/Vite types; no Copilot diagnostics; [log](curator-typecheck.txt) |
| Browser authentication boundary | Unauthenticated real route redirects to login before browser fixtures are installed |
| Desktop/mobile UI | Real Edge rendering; widths 320, 390, 768, 1024 and 1440 px; no horizontal overflow, correct tab/grid transitions, no uncaught exceptions; [results](curator-browser-results.json) |

The API regressions cover ordinary READs, enabled WRITE confirmations, attachments, quota behavior, wallet reconciliation, store workflows and role access. Curator integration tests cover Company Admin and Entity Manager, cross-tenant conversation denial, genuine fetched IDs/images/prices, discarded invented IDs, and unchanged business-record counts.

The first broad test run inherited local rollout/storage settings and had fork-worker exits. The reproducible runner supplies process-local test defaults and uses thread workers. It does not edit application environment files or change production flags.

### Flow boundaries

| Boundary | Evidence |
| --- | --- |
| UI entry → curator layout | Component tests and Edge screenshots |
| Composer → authenticated message endpoint | Existing client/route contract retained; frontend stream tests and authenticated API integration |
| Orchestration → catalog/kit data | Real existing READ bindings exercised against isolated MongoDB records |
| Orchestration → Claude | Live smoke test using configured Anthropic provider |
| Structured artifacts → cards and shortlist | Component tests and real-browser fixture rendering |
| External refinement → preserved source | Mocked integration and live Claude follow-ups, with zero catalog reads on external turns |

Browser screenshots use isolated authenticated fixtures and intentionally unavailable product images to exercise the fallback. They demonstrate layout and controls, not live production photos or availability. The live Claude smoke test and browser fixture check are separate checks; an authenticated production-tenant browser journey was not run.

## Screenshots

- [Desktop curator welcome](curator-desktop-welcome.png)
- [Desktop recommendations](curator-desktop-recommendations.png)
- [Desktop shortlist](curator-desktop-shortlist.png)
- [Desktop external inspiration](curator-desktop-external.png)
- [Mobile conversation](curator-mobile-conversation.png)
- [Mobile recommendations](curator-mobile-recommendations.png)
- [Mobile external inspiration](curator-mobile-external.png)

## Token and cost controls

- At most two model calls per complete turn, or one when essentials are missing. No model-driven tool loop.
- One planning-tool schema per completion; the full MCP registry is not sent.
- At most three product searches plus two kit reads. Twelve products per search, four kits per kit reader, and at most 24 eligible candidates reach planning.
- Recent history: at most six messages, 1,200 characters each and 7,200 characters total. Current request and model-facing metadata are also bounded.
- Existing provider output cap, quota accounting, rate limiting and audit patterns are reused.
- Live smoke measurements: **2,902 / 3,597 / 3,762 tokens** for the three turns; **10,261 total**. The existing configured estimator recorded about **USD 0.041** combined. This is an application estimate, not a verified provider bill or a prediction for larger catalogs.

## External research and image readiness

`apps/web/src/features/copilot/curatorTypes.ts` defines the future `ExternalGiftResearchProvider` contract: product name, original source, product URL, optional permitted image, price/currency, availability, merchant and retrieval timestamp. No corresponding production product-search adapter is configured. Implementing verified external products requires an approved runtime provider, server-side credentials, a merchant/product response normalizer, provenance validation, allowed image use and provider quotas/timeouts. Connected tools available to this coding session are not automatically runtime capabilities of the ShelfMerch application.

The same file defines `GiftConceptImageProvider`, including theme, company, official image references and `generated-concept` provenance. No authorized runtime image-generation provider was found for this flow. Generated concept media must remain separate from official catalog imagery when one is connected. Both availability flags correctly remain false today.

## Remaining limitations

- Verified external shopping research and generated packaging images are unavailable, as permitted by the brief's dependency boundary.
- Production tenant catalog imagery, real kit variety and production browser authentication still need a manual acceptance pass. No production business records were modified for verification.
- The shortlist is client-side memory; it survives recommendation refinements while mounted, but resets on reload, conversation changes or exiting the curator. Server-side shortlist persistence was not added.
- Attachments retain the existing upload/ownership flow; the curator does not analyze image attachments or turn a logo upload into generated packaging.
- Catalog prices remain INR. Foreign-currency briefs do not trigger an invented exchange rate; costs are displayed in their source currency and comparison requires matching currencies.
- Catalog alternatives are bounded searches, not an exhaustive catalog scan. Unknown kit contents are omitted when exclusions cannot be checked safely.
- Repository-wide TypeScript errors outside Copilot remain. The successful Vite build does not replace a successful TypeScript check.

## Files changed

Existing saved curator implementation is in `CopilotPage.tsx`, `CopilotWelcome.tsx`, `CopilotCurator.tsx`, `curatorTypes.ts`, `curator.css`, web `api.ts`, `copilotChat.service.js`, the conversation model/controller/routes, curator service and focused tests.

This continuation changes:

- `apps/api/src/modules/copilot/curator.js`
- `apps/api/src/modules/copilot/copilotCurator.service.js`
- `apps/api/tests/copilot-curator.test.js`
- `apps/api/tests/copilotDiscovery.test.js` — test assertions only
- `apps/api/tests/curator-live-smoke.test.js` — new opt-in real-provider test
- `previews/copilot-browser.mjs` — additional responsive checks
- `previews/run-curator-api-checks.mjs` — repeatable isolated regression runner
- This report, verification logs/results and refreshed preview artifacts under `previews/copilot/`.

No shared MCP business READ/WRITE logic, store/wallet/budget/campaign implementation, runtime write flags, provider credentials or dependencies were changed.

## Exact next testing steps

From the repository root in PowerShell:

```powershell
node previews/run-curator-api-checks.mjs
npm.cmd run test -w @shelfmerch/web -- src/features/copilot
npm.cmd run build:web
```

For browser QA, start Vite from `apps/web` with `npx.cmd vite --host 127.0.0.1 --port 8080`, then run `node previews/copilot-browser.mjs --curator` from the root. These browser checks use fixtures.

For the opt-in live Claude smoke test, run from `apps/api` with outbound Anthropic access and the existing provider configuration:

```powershell
$env:CURATOR_LIVE_SMOKE='1'
npx.cmd vitest run tests/curator-live-smoke.test.js
Remove-Item Env:CURATOR_LIVE_SMOKE
```

This test sends synthetic gifting data to the configured provider and incurs provider usage; its MongoDB data is isolated.

For production-data acceptance, sign in normally as Company Admin, open Copilot → Curate Gifts and submit: “Unique welcome gifts for 10 Toast employees, ₹3,000 each. Avoid mugs, bottles, apparel and bags.” Check official imagery, real product details, exclusions, item totals and shortlist controls. Refine with “show different products”, then “outside ShelfMerch”, then “more unique ideas”; verify source and brief persist. Repeat as Entity Manager, check mobile tabs, and return to Normal Copilot. Keep any business WRITE workflow behind its existing explicit confirmation.
