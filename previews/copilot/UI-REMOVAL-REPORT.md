# Separate Curate Gifts UI removal

10 November 2026. Local work only. No commit, push or deployment.

## Outcome

ShelfMerch now uses its existing Copilot chat layout throughout. The Curate Gifts entry, dedicated navigation, split-screen canvas, mobile curator tabs and curator-only selection/comparison UI are removed. The existing sidebar, history, composer, attachments, product/kit cards and confirmation components are retained.

Reusable gifting orchestration, catalog/kit READ integration, exclusions, budget calculations, saved briefs, source preferences and external inspiration logic remain available in their existing services. Integrating that logic into ordinary conversation is deliberately left for the next task; no replacement interface or automatic gifting router was added.

## Inspection and scope

`git status`, `git diff`, `git log` and `git show --stat eaf8fc75` were inspected before editing. That commit introduced the wider Copilot implementation together with the curator UI, so reverting the commit would also remove unrelated working features. Only the identified UI additions were removed.

The workspace already contained the prior curator-service fixes, tests and verification artifacts. Those changes were retained. This task makes no production backend service, provider adapter, database schema, business workflow, runtime feature-flag, credential or MCP contract changes.

## Files changed for this task

| File | Change |
| --- | --- |
| `apps/web/src/features/copilot/CopilotPage.tsx` | Removed curator imports, mode/tab state, artifact selection, draft handler, entry buttons, navigation and split-view wrappers. Restored the existing chat section and explicitly sends `mode: "chat"`. |
| `apps/web/src/features/copilot/CopilotWelcome.tsx` | Removed the dedicated entry button and `onCurate` prop; existing capability discovery remains. |
| `apps/web/src/features/copilot/CopilotCurator.tsx` | Deleted dedicated intro, toolbar, gifting brief/canvas, curator cards, selection, shortlist and comparison UI. |
| `apps/web/src/features/copilot/curator.css` | Deleted unused curator styles, including the wrapper rule no longer needed after removing those wrappers. |
| `apps/web/src/features/copilot/CopilotCurator.test.tsx` | Deleted tests tied to removed UI controls. |
| `apps/web/src/features/copilot/CopilotPage.test.tsx` | Replaced curator-entry test with normal-layout checks; added saved-curator history and explicit normal-chat mode regression. |
| `apps/web/src/features/copilot/curatorTypes.test.ts` | Retained pure budget-helper coverage independently of the deleted UI. |
| `apps/api/tests/copilot-curator-integration.test.js` | Added coverage for continuing a saved curator conversation through normal chat while preserving its brief and history. |
| `apps/api/tests/copilot-ui-removal-live.test.js` | Added an opt-in live Claude regression using synthetic prompts and an isolated test database. |
| `previews/copilot-browser.mjs` | Removed obsolete curator fixtures/checks; added focused normal-chat removal checks. |
| `previews/copilot/ui-removal-*` and this report | Verification results, logs and screenshots. The existing API test log was also refreshed by its regression runner. |

Shared `CopilotProductCards`, `CopilotComposer`, `CopilotHistory`, confirmation cards, dashboard styles and routing were not changed.

## Functionality preserved

- `copilotCurator.service.js`: existing Claude orchestration, authenticated catalog and kit READ calls, structured concepts, usage/audit accounting and bounded planning.
- `curator.js`: requirement extraction/merging, exclusions, budget logic, source preference, candidate filtering and concept processing.
- `curatorTypes.ts`: saved recommendation types, pure shortlist arithmetic and future provider contracts. The API still references the saved artifact types.
- Existing Copilot chat service, SSE controller/client, provider adapters, MCP bindings, tenant/RBAC checks, confirmations and idempotency.
- Existing conversation schema and stored messages, recommendation artifacts and gifting preferences. No data migration or deletion was performed.
- Existing attachments and ordinary product/kit image, price and details rendering.

An old conversation may still contain `curator.enabled: true`. The UI no longer restores a curator screen from that value. It explicitly sends `mode: "chat"`; the existing backend branch disables the old mode while retaining the brief and previous artifacts. Both frontend and backend regressions verify this behavior.

No curator-specific rollout flag was found. Existing Copilot enablement, provider, quotas and business WRITE flags remain unchanged. The optional API curator mode remains supported for reuse; it is no longer exposed by the UI.

## Verification results and evidence

| Requirement | Result |
| --- | --- |
| Normal Copilot interface | Real Edge screenshots show the original six capability categories, sidebar and full-width conversation. Runtime source scan found no remaining dedicated curator imports, styles or entry points. |
| Claude conversations and SSE | Live configured Claude test passed: two normal-chat turns produced streamed deltas and completed responses. |
| Chat history and persistence | Component tests and backend integration passed; live Claude recalled Toast, 10 recipients and INR 3,000 from the preceding turn after a database reload. |
| Saved gifting preferences | Backend regression and live test retained the old saved brief while switching to normal chat. |
| Product/kit READ operations | Existing API catalog, kit and ordinary Copilot READ regression suites passed. |
| Product images and prices | Existing shared card tests passed for upstream image URLs, kit images, displayed prices, links and missing-image behavior; the shared renderer was not modified. |
| WRITE confirmation UI | Existing frontend confirmation/store tests and backend WRITE registry/domain/store/idempotency regressions passed. These use test data, not production transactions. |
| Attachments | Existing frontend composer and backend attachment/vision regressions passed. |
| RBAC and tenant isolation | Existing regressions passed, including role access and cross-tenant denial. |
| Imports and build | Production frontend build passed; removed component/style paths have no runtime references. |
| Responsive behavior | Passed at 320, 390, 768, 1024 and 1440 px: composer visible, no horizontal overflow, no curator controls/canvas and no uncaught browser exceptions. Mobile history drawer opens and closes. |

Automated totals:

- **111 backend regression tests passed**, across 18 files. [API log](ui-removal-api-tests.txt)
- **53 frontend Copilot tests passed**, across 10 files. [Frontend log](ui-removal-web-tests.txt)
- **1 opt-in live Claude test passed**, covering two ordinary chat turns. [Live results](ui-removal-live-results.json)
- **Frontend build passed**, with the existing shared-bundle size warning. [Build log](ui-removal-build.txt)
- **Browser checks passed**, with captured fixture scope and viewport results. [Browser results](ui-removal-browser-results.json)
- **Repository-wide TypeScript check still fails** on pre-existing kit/swag/service/Vite errors; no new Copilot diagnostics. [Typecheck log](ui-removal-typecheck.txt)

The first frontend run caught an incorrect new test expectation: the small unit-test fixture contains two categories rather than six. The test now checks the configured fixture categories. The browser test separately verifies all six real discovery categories. No production code was changed to accommodate that assertion.

## Screenshots

- [Desktop welcome](ui-removal-desktop-welcome.png)
- [Desktop conversation](ui-removal-desktop-chat.png)
- [Mobile conversation](ui-removal-mobile-chat.png)
- [Mobile history](ui-removal-mobile-history.png)

Browser checks use isolated authentication/API fixtures after first checking that the actual unauthenticated route redirects to login. The live Claude check separately exercises the unchanged backend chat service against an isolated MongoDB database. These are not an authenticated production-tenant browser journey, and no production product-image download or business transaction was performed.

## Remaining issues and intentional boundaries

No regression was found in the tested removal flows. Existing repository-wide TypeScript failures and the build size warning remain outside this task.

Historical curator artifacts stay in saved conversations, but their dedicated canvas is intentionally no longer rendered. Ordinary product and kit artifacts continue to use the existing chat cards. The preserved curator orchestration is not newly wired into normal chat in this task; that integration is the stated next task. External inspiration logic and source preferences are retained, while verified external shopping and image-generation integrations remain unavailable as before.

## Reproduce

From the repository root:

```powershell
node previews/run-curator-api-checks.mjs
npm.cmd run test -w @shelfmerch/web -- src/features/copilot
npm.cmd run build:web
node previews/copilot-browser.mjs --ui-removal
```

The browser command expects Vite on port 8080 and uses fixtures. The API runner isolates provider/write defaults and local test storage; the opt-in live test is skipped during an ordinary run.

For live Claude verification, from `apps/api`, with the existing Anthropic configuration and outbound network access:

```powershell
$env:COPILOT_LIVE_SMOKE='1'
npx.cmd vitest run tests/copilot-ui-removal-live.test.js
Remove-Item Env:COPILOT_LIVE_SMOKE
```

This sends synthetic prompts to the configured provider and incurs normal provider usage. It does not use production conversation or inventory records.
