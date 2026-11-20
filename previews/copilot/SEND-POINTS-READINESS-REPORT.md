# Send Points readiness fix

The existing tools and three-stage workflow are retained. No new MCP tools, campaign/ledger business services, publishing rules or redemption algorithms were introduced. The on-disk `EMBEDDED_COPILOT_WRITE_SEND_POINTS` flag remains **false**.

## Exact changes

| File | Change |
| --- | --- |
| `apps/api/src/modules/campaigns/pointsScope.js` (new) | Pure shared implementation of the dashboard's existing default: `pointsConversionEnabled ? stadium : shop`. |
| `apps/api/src/modules/campaigns/pointsScope.d.ts` (new) | Frontend type declaration for that shared rule. |
| `apps/web/src/lib/storeCurrency.ts` | Re-export the shared default alongside the existing INR/Points/Credits conversion helpers. Conversion rates unchanged. |
| `apps/web/src/features/campaigns/controllers/useSendPointsController.ts` | Replace two existing default expressions with the shared helper; dashboard behavior unchanged. |
| `apps/api/src/modules/mcp/shopsRead.js` | Return actual `pointsConversionEnabled` in existing store READ responses. |
| `apps/api/src/modules/mcp/pointsPresentation.js` (new) | Shared additive output fields for verified currency, redemption scope, store/campaign and role-scoped funding metadata. Optional fields retain compatibility with recorded results. |
| `apps/api/src/modules/mcp/campaignsDraftWrite.js` | Resolve omitted scope from an existing campaign first, otherwise actual store configuration. Preserve explicit scopes. Return verified draft preview amounts, funding snapshot, resolved scope and schedule. Clarify INR input and scope guidance. |
| `apps/api/src/modules/mcp/campaignsSendWrite.js` | Enrich existing allocation/launch previews and results with store/funding/scope metadata, schedule, and recorded debit evidence. Bind preview resource snapshots to campaign scope, funding scope and delivery schedule. Correct unit and scope guidance. |
| `apps/api/src/modules/copilot/copilotToolBindings.js` | Reuse the MCP Points-summary description and explicitly distinguish campaign INR credit accounting from spendable funding. |
| `apps/web/src/features/copilot/actionPresentation.ts` | Send Points-specific preview/result rows using verified backend fields and existing conversion helpers. Show counts, per-person units and INR, total cost, funding, masked impact, scope, schedule and invitation outcomes. Missing metadata stays unavailable. |
| `apps/web/src/features/copilot/CopilotConfirmationCard.tsx` | Use those rows for the three existing workflows and explain what each confirmation does. Existing execution, Cancel, recovery, persistence and duplicate-click handlers retained. |
| `apps/api/tests/copilot-send-points-readiness.test.js` (new) | Isolated regression coverage for defaults, single/multiple recipients, funding, all stages, stale previews, launch outcomes, replay, Cancel, Claude tool visibility and conversation reconciliation. |
| `apps/web/src/features/copilot/CopilotSendPoints.test.tsx` (new) | Financial presentation, conversion, funding masking, missing metadata, delivery outcomes and terminal-state regressions. |

Existing unrelated workspace changes were preserved.

## Behavior and safeguards

- `creditsPerRecipient` remains INR. The existing display conversions remain ₹1 = 2 Points for Points stores and ₹1 = 1 Credit for INR stores. For example, 500 Points per person is ₹250; two recipients cost ₹500.
- New draft defaults match the dashboard's actual store setting. Explicit `shop`/`stadium` selections remain supported. Editing a saved draft without specifying scope preserves its saved scope, even if the store default changed.
- Scope defaults are materialized before confirmation hashing. An implicit default changed before a new draft executes is rejected. Same-key draft replay still works after launch and after store defaults change.
- `shop` continues selected-store pooling; `stadium` continues tenant-wide pooling. Redemption services were not changed.
- Funding data comes from existing ledger and wallet-visibility services. Managers receive department remaining-budget figures and department names, never organization wallet balances in the new metadata. Admin previews identify organization unallocated funding.
- Draft save and credit allocation remain separate confirmed actions with no wallet debit. Launch remains separately confirmed and uses the existing spending/launch services. Existing minimum amounts and permissions remain enforced.
- Launch previews show the verified projected debit and before/after funding values. Changed scope, funding context or schedule invalidates the preview rather than launching with different approved details.
- Completed launch cards use a recorded `campaign_spend` transaction for debit evidence. They distinguish scheduled delivery, self-share without email, and unresolved/partial immediate invitations. Launch completion is not described as guaranteed email delivery.
- Claude still receives READ/PREPARE only. EXECUTE remains confirmation-UI only; direct model invocation is rejected.
- `copilotWriteState.service.js`, provider-context projection, confirmation outcome persistence, Resolve recovery and core idempotency behavior were not changed by this work. Regression tests verify all three Send Points results survive reload, supersede old Confirm instructions and resolve without another execution.

## Verification

- **127 backend regressions passed** in `send-points-final-api-tests.json`: new readiness tests, existing MCP draft/send, Copilot WRITE-state, budget confirmations, registry/domains, Anthropic schema/provider, store and wallet-integrity tests.
- **20 existing MCP safety/recovery regressions passed** in `send-points-recovery-tests.json`.
- **157 frontend regressions passed** in `send-points-final-web-tests.json`: Copilot, dashboard campaigns and shared send helpers.
- Actual Edge component rendering with intercepted API fixtures: **six viewport/theme checks passed** at 1440, 390 and 320 pixels, light/dark. No card/document overflow, runtime exceptions or WRITE requests. Native keyboard navigation/disclosure checks passed. Evidence: `send-points-browser-results.json`; script: `previews/verify-send-points-readiness.mjs`.
- Production Vite build passed. Existing unset GTM placeholder warning remains.
- Whole-web TypeScript checking still has unrelated existing errors; none reference the files changed here (`send-points-typecheck.txt`).
- `git diff --check` passed for changed tracked files.
- Confirmed local configuration still has `EMBEDDED_COPILOT_WRITE_SEND_POINTS=false`. Enabled-path tests change only an isolated worker's in-memory flag and restore it; they do not enable the application or edit configuration files.

All mutation tests used the existing isolated MongoMemoryReplSet and test transport stubs. Browser checks intercepted API requests. No live campaigns, invitations, Points allocations or wallet deductions were performed.

Screenshots: [desktop](send-points-1440.png), [mobile](send-points-390.png), [desktop dark](send-points-1440-dark.png), [mobile dark](send-points-390-dark.png).

## Local-testing readiness

**Ready for controlled local testing after an explicit decision to enable the existing flag in a dedicated test environment. The flag remains disabled here.** Use disposable test data; these checks do not establish production readiness or prove a live Claude-to-send flow.

Regenerate any old unexecuted Send Points previews: the resolved-default and resource-snapshot contract now includes the displayed context. No existing confirmations or financial records were migrated. Previously completed outcomes retain their recorded results and recover through existing idempotency proof; missing newer presentation fields display as unavailable.

No deployment, commit, push or Git remote changes.
