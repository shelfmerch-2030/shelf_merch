# Copilot UI polish

## Before / after

| Before | After |
| --- | --- |
| Wide, sparse completed cards with repeated store details | Bounded cards, compact fact grids, exact returned store name/status/currency and existing View/Manage links |
| Generic “Confirmed wallets topup” text | Readable request outcome, requested amount and returned wallet snapshot; finance approval and actual credit remain distinct |
| Technical workflow headings and raw identifiers in previews | Shared friendly workflow labels, labeled backend preview values, Indian number grouping and explicit unavailable values |
| Full original previews repeated after cancellation/failure/expiry | Compact terminal state and backend explanation, with the original proposed values available in a native disclosure |
| Inconsistent Markdown rhythm and minimally styled lists/code | Consistent headings, paragraphs, lists, emphasis, quotes, code and tables; keyboard-focusable table containers |
| Persisted user messages exposed generated attachment instructions/ticket references | Friendly filename/type/size chips; generated transport suffix hidden only in the view |

The existing success grid already used `auto/1fr`; this change bounds the card width, fixes the icon column, reduces inherited sizing and compacts the details. ShelfMerch theme variables, sidebar, composer and responsive page structure are retained.

## Safety and scope

All application changes are frontend presentation changes. No API/MCP, provider orchestration, business services, publishing, authorization or financial rules were changed.

`copilotWriteState.service.js`, confirmation outcome persistence, provider-context projection, execution recovery and idempotency behavior are unchanged. Confirmation handlers, request bodies, confirmation IDs, idempotency keys and duplicate-click guards are retained.

Only an explicit `status: pending` presents Confirm/Cancel. Completed, cancelled, failed, expired, consumed/unverified and unknown states never reconstruct a pending confirmation from PREPARE/request data. The backend currently also expresses some terminal conditions as `failed` plus an explanation; the view labels expiry/unverified explanations without rewriting the artifact state.

Completed cards derive facts from the returned `result`/`shop`, rather than outdated titles, messages, preview/request values or arbitrary JSON. A store is called Live and offered View Store only when the returned status is `live`. Existing returned names and balances are not mutated.

Wallet setup/top-up handlers return wallet and funding-approval snapshots. Pending approval and payment-required results are explicitly labeled. `active`, an approved funding document, a positive balance or `succeeded` alone never imply a new funding credit. A credited label requires an explicit returned credited status. Missing currency stays unavailable; missing/invalid numbers never become ₹0.

Attachment content, metadata and ticket references remain unchanged in state and backend/model requests. Only the generated suffix is removed from visible user-message rendering. User-written attachment sections are preserved. Markdown sanitization and image restrictions remain enabled.

## Files changed for this task

- `apps/web/src/features/copilot/actionPresentation.ts` — new shared presentation labels, safe field formatting, preview rows and backend-result summaries.
- `apps/web/src/features/copilot/CopilotUserMessage.tsx` — new attachment-aware user-message renderer.
- `apps/web/src/features/copilot/CopilotConfirmationCard.tsx` — compact shared action presentation and terminal-state hierarchy; existing execution/recovery/persistence handlers retained.
- `apps/web/src/features/copilot/CopilotMarkdown.tsx` — keyboard-accessible table region.
- `apps/web/src/features/copilot/CopilotPage.tsx` — render user-message text/attachments through the presentation component.
- `apps/web/src/features/copilot/api.ts` — include terminal confirmation statuses in frontend types; no API behavior change.
- `apps/web/src/features/copilot/copilot.css` — scoped typography, cards, states, facts, attachment chips, focus and narrow-screen rules.
- `apps/web/src/features/copilot/CopilotPresentation.test.tsx` — new presentation, terminal-state, financial accuracy, Markdown and attachment regressions.
- `apps/web/src/features/copilot/CopilotConfirmationCard.test.tsx` — readable heading/INR formatting expectations.
- `apps/web/src/features/copilot/CopilotPage.test.tsx` — saved attachment and completed-store reload integration tests.

Verification artifacts: `previews/verify-copilot-ui-polish.mjs`, JSON reports, this report and screenshots under `previews/copilot/`. Existing unrelated workspace changes were retained.

## Verification

- Existing Copilot WRITE-state / budget confirmation / store creation-update-publish-catalog / generic WRITE registry-domains / MCP safety / recovery suites: **80 passed**, isolated in-memory Mongo only (`ui-polish-write-state-tests.json`).
- Copilot frontend suites: **120 passed** (`ui-polish-web-tests.json`); covers confirmation states, duplicate actions, store outcomes, financial result accuracy, Markdown, attachments, reloads, history, composer and gifting.
- Vite production build: **passed**. Existing unset GTM placeholder and large-chunk warnings remain.
- Whole-web TypeScript checking remains blocked by unrelated kit, swag, ShopLayoutTab test-fixture and Vite server-type errors (`ui-polish-typecheck.txt`); no diagnostics reference the files changed here.
- `git diff --check` passed for Copilot files.
- Actual Edge component rendering with isolated fetch fixtures: **6 viewport/theme checks passed** at 1440, 390 and 320 pixels, light and dark. No document/card overflow, visible internal ticket IDs, executed WRITE requests or runtime exceptions. Confirm/Cancel tab navigation and Enter activation of preview disclosure passed (`ui-polish-browser-results.json`). These use real components/styles on the existing local Vite server, with all API calls intercepted.

Screenshots:

- [Desktop](ui-polish-1440.png), [desktop dark](ui-polish-1440-dark.png)
- [Mobile](ui-polish-390.png), [mobile dark](ui-polish-390-dark.png)

## Remaining live-browser verification

An authenticated read-only smoke check against existing saved conversations and real Claude streaming on target desktop/mobile browsers remains useful. Browser verification here used synthetic component fixtures; it did not exercise a live provider or perform a live WRITE. Physical-device/Safari and screen-reader checks remain manual.

No existing database records were mutated. No deployment, commit, push or Git remote changes.
