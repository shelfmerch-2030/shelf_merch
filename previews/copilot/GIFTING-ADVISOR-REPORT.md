# Existing Copilot gifting advisor — implementation report

Date: 11 November 2026. Local changes only; no deployment, commit or push.

The existing Copilot chat now handles catalog gifting advice, follow-up refinements and validated combinations. It renders the existing product and kit cards inline. There is no new screen, canvas, gallery, model, database or public MCP contract.

## 1. Confirmed audit findings

- Normal chat bypassed the reusable curator planning logic, so its structured gifting brief was unavailable for ordinary gifting conversations.
- Existing public catalog search used literal name/SKU/brand matching. Occasion-relevant text in product descriptions and taxonomy did not participate in that search.
- The old curator requested a few small result sets, retained at most 24 candidates and used a fixed second page for alternatives. It could not reliably supply 20 ideas followed by 10 unseen ideas.
- The old planning path required occasion, recipients and budget before proceeding. Useful requests such as executive gifting without a budget stalled unnecessarily.
- Catalog records have usable descriptions, taxonomy, variants and existing GST-inclusive price mapping, but no dependable occasion taxonomy or popularity/trending data. Matching must use actual metadata and acknowledge uncertainty.
- Existing authenticated kit readers, price mapping, product cards, conversation storage, SSE and Claude adapter were reusable. Business WRITE handlers did not need changes.

## 2. Exact implementation files

New files:

- `apps/api/src/modules/copilot/giftingAdvisor.js`: routing guard, brief handling, ranking, eligibility, validated grouping and deterministic arithmetic.
- `apps/api/src/modules/copilot/giftingCatalogRead.js`: bounded internal catalog READ and reuse of both kit readers.
- `apps/api/src/modules/copilot/giftingAdvisor.service.js`: orchestration through the existing provider adapters, persistence, usage/audit and existing SSE events.
- `apps/api/tests/copilot-gifting-advisor.test.js`: 21 automated cases, including parameterized roles and occasions.
- `apps/api/tests/copilot-gifting-advisor-live.test.js`: opt-in real Claude conversation using isolated synthetic records.
- `apps/web/src/features/copilot/CopilotGiftingChat.test.tsx`: four inline rendering and pricing tests.
- `previews/run-gifting-advisor-api-checks.mjs`: isolated regression runner with one worker and optional targeted batch rechecks.

Existing files changed in this task:

- `apps/api/src/modules/copilot/copilotChat.service.js`: route eligible text-only gifting advice into the advisor after existing authentication/quota checks; ordinary business requests retain the existing flow.
- `apps/api/src/modules/copilot/copilotCurator.service.js`: export the existing candidate normalizer for reuse.
- `apps/api/src/modules/copilot/curator.js`: extend existing apparel/bag exclusion aliases to plural names.
- `apps/web/src/features/copilot/curatorTypes.ts`: optional inline chat-group payload and group type.
- `apps/web/src/features/copilot/CopilotProductCards.tsx`: inline group headings/cost notes, existing product/kit cards, actual variants/contents and the existing curated-kit listing link.
- `apps/web/src/features/copilot/copilot.css`: small styles for inline groups using the existing chat layout.
- `previews/copilot-browser.mjs`: optional advisor SSE fixtures and responsive/history assertions.

Evidence files are alongside this report: `gifting-advisor-api-tests.txt`, `gifting-advisor-web-tests.txt`, `gifting-advisor-build.txt`, `gifting-advisor-typecheck.txt`, `gifting-advisor-live-results.json`, `gifting-advisor-browser-results.json`, and the desktop/mobile screenshots.

The working tree already contained curator UI removal, marketing/homepage work and earlier curator hardening. Those changes were preserved. The complete Git diff includes that earlier work; the list above identifies this task's additions and incremental edits.

## 3. Existing services reused

- `streamAssistantTurn`, existing authenticated routes and conversation ownership checks.
- Existing Anthropic/OpenAI adapters and configured provider/model selection; no replacement provider.
- Existing catalog visibility filter, enabled variants and `toCatalogSearchItem` selling-price mapping.
- Existing `runCopilotTool`, `kits_list_curated` and tenant-scoped `kits_list` bindings.
- Existing curator candidate normalization, exclusion expansion, brief merging and bounded history helper.
- Existing conversation Mixed state/artifact storage, usage service and Copilot audit model.
- Existing SSE event contract, product/kit cards, image fallbacks, details navigation and confirmation components.

## 4. Catalog search and bounds

An internal recommendation READ searches actual name, description, category, subcategory, child category and brand. It uses the existing catalog visibility/price rules and verifies caller context and catalog READ permission. No MCP input or output schema was changed.

Exact occasion hints are queried before broader merchandise hints. These are retrieval policy terms, not invented product tags. Excluded categories, previously shown product IDs and requests for other categories are applied before paging. Ranking uses actual metadata, explicit preferences and bounded real-price ordering. Unrelated items cannot acquire relevance solely because they are expensive.

Limits: 25 cards per response; up to six product pages of 25 scored rows, with one lookahead row per query; three pages per search tier; three-second database query time limit. At most 150 product rows are scored per turn, with duplicate rows across tiers possible. Up to four bounded kit calls are made, consuming at most 50 summaries per call. The underlying kit reader retains its own limits.

Previously shown IDs are excluded on follow-ups, retaining the most recent 500 keys per conversation. Explicit revisit requests can show earlier items. Search is always described as bounded; it does not claim catalog exhaustion.

## 5. Recommendation behavior and memory

The saved brief retains occasion, recipients, company/team, exclusions, preferences, source and per-person/total budget. Existing total-budget handling derives a per-person limit when recipient count is known. Idea count is separate from employee count.

Supported refinements include more/different ideas, premium/affordable options, other categories, occasion changes, budget changes and explicit budget removal. Missing essentials do not prevent suggestions. Budget removal also suppresses the optional budget prompt. Reopened conversations use the persisted brief and shown-item keys.

Business operation terms take precedence over gifting routing. Wallets, stores, campaigns, collections, orders, employee operations and WRITE requests continue through the ordinary Copilot. Attachment-bearing turns retain the existing attachment path.

## 6. Kits and combinations

Real curated and tenant-customized kits come from their existing READ services. Available images, stored prices and actual content quantities are displayed. Existing kits are labeled separately from AI-suggested combinations. No recommendation creates or saves a kit.

Claude can propose up to three disjoint combinations of two to five supplied products. The server rejects invented IDs, repeated references and over-budget combinations. Unused selected products remain individual alternatives, avoiding duplicate cards. Individual-option groups do not show a misleading combined purchase total.

If Claude omits or returns an invalid combination plan, verified cards remain available as individual options alongside real kits, with an explicit explanation. This fallback uses no extra model call. An invalid initial brief response still returns a retry error rather than guessing the user's constraints.

A repeat live run exposed an onboarding kit matching a Diwali request through generic gift contents. The eligibility filter now rejects records explicitly tied to another occasion when their metadata does not match the requested occasion. The regression case verifies that the onboarding kit stays available for the later onboarding turn.

## 7. Product, stock and price validation

- Product IDs must resolve to selected real catalog records; Claude cannot supply a new price, image URL or inventory value.
- Existing selling prices remain GST-inclusive INR. GST is not added again.
- Per-person subtotal, recipient total and budget difference are calculated server-side, rounded to two decimal places.
- Missing/invalid prices remain unknown; zero summary prices are conservatively treated as unknown rather than free. Incomplete groups show a partial subtotal and no complete total/budget comparison.
- Missing images use the existing fallback. Known out-of-stock items are removed; unknown availability is labeled and bulk quantity availability requires confirmation.
- Kits with unverifiable contents are rejected when exclusions cannot safely be checked.
- Packaging, branding, customization and shipping are not invented or added. Amounts are item estimates rather than final quotes.
- Foreign-currency budgets request INR clarification rather than using an invented exchange rate. External shopping and image generation remain unavailable.
- Model-generated headings/rationales are filtered for unsupported price, stock, shipping and popularity claims.

## 8. Automated and browser verification

Frontend: 57 tests across 11 Copilot files passed, including the four new inline rendering tests. The frontend production build passed. The existing bundle-size warning remains.

TypeScript: the repository-wide check still reports the same 25 errors as the pre-task baseline, with no new diagnostics and no Copilot diagnostics. This check is not reported as passing.

Browser: normal chat, decoded card images, correct subtotal, composer/history and reopening were checked at widths 1440, 1024, 768, 390 and 320. No horizontal overflow or separate curator UI was found. These are explicitly mocked SSE fixtures; the unauthenticated real application route redirects to login. They do not prove a production tenant's end-to-end catalog access.

Backend: 132 tests passed across 19 files; two opt-in live files were skipped in the offline regression run. Counts use the latest completed result for each batch, not duplicated retry runs. Regression coverage includes ordinary READs, authenticated catalog/kit permissions, wallet reconciliation, store creation/update/publishing, WRITE registry/domain behavior, attachments, confirmations and conversation access.

Two aggregate attempts encountered native Windows process exits (`3221226505`) without an assertion result in the affected batch. Those batches passed when rerun; the runner cause was not established. This is recorded separately from application test failures. A real Claude retry also exposed the occasion mismatch and invalid grouping response described above; both resulted in code fixes and regression coverage.

## 9. Real Claude evidence

The opt-in test uses the configured Claude adapter in ordinary `mode: chat`, an isolated MongoDB test database, 100 synthetic catalog records, a real test platform-kit record and a tenant-customized test-kit record. It does not access or mutate live business records.

The six-turn sequence requests 20 Diwali ideas for 100 Toast employees under INR 2,000 excluding mugs/bottles/apparel, then 10 more, five premium options, onboarding kits for 50 under INR 2,500, appreciation gifts, and executive gifts after removing the budget. Assertions check 20/10/5/5/5/5 cards, no repeated IDs, persisted constraints, actual fixture images/prices, real kit retrieval, deterministic totals and no business writes. Results and usage are in `gifting-advisor-live-results.json`.

Final live run: passed on the final implementation in 52.29 seconds, with evidence timestamp `2026-11-11T05:30:49.057Z`.

| Turn | Cards | Observed result |
| --- | ---: | --- |
| Diwali, 100 recipients, INR 2,000 limit | 20 | Three validated combinations at INR 1,400 / 1,450 / 1,280 per person, an existing Diwali kit at INR 1,500 and individual alternatives |
| Ten more | 10 | Unseen products; validated combinations remain within the retained budget |
| Premium refinement | 5 | Individual product options; original budget and exclusions retained |
| Onboarding, 50 recipients, INR 2,500 limit | 5 | Two combinations at INR 2,200 each and the existing customized onboarding kit at INR 1,000 |
| Appreciation | 5 | Occasion updated; 50 recipients, budget and exclusions retained |
| Executive, forget budget | 5 | Budget removed; two validated combinations at INR 3,090 and INR 2,060 |

The final six turns used 28,156 tokens. The application's configured usage estimate totals USD 0.100656; this is not a provider billing statement. Earlier live attempts and their failure causes are disclosed above rather than included in this final-run estimate.

Claude uses at most two planning calls per turn, each with one small tool schema. The combination prompt receives at most 25 compact product summaries. Recent conversation history is capped at six entries/7,200 characters. No full database or public business-tool schema set is sent to the advisor. No shared cross-tenant recommendation cache was introduced.

## 10. Remaining limits

- Occasion matching depends on actual catalog text, using lexical retrieval plus Claude planning. Catalog enrichment with reliable occasion/recipient metadata remains a future improvement; no popularity or trend dataset exists.
- Search and seen-item memory are bounded. Very large relevant inventories and kit-reader limits can produce a shortfall; the assistant says so.
- Preferences and variant suggestions use available metadata; they do not reserve a variant or guarantee recipient-level stock, MOQ fulfilment or a final quote.
- Real Claude verification uses synthetic records; authenticated production data and purchase execution were deliberately outside this verification.
- Attachment-bearing gifting requests continue through the original chat behavior. Foreign currencies require clarification. Curated-kit details link to the existing kit listing.
- Existing repository TypeScript failures, bundle-size warnings and Mongoose warnings remain outside this change.
