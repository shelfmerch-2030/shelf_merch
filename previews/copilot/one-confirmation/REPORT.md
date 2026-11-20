# One-confirmation Send Points — final implementation and verification

Final verification: **13 November 2026, Asia/Calcutta**.

**Ready for controlled local testing with isolated data and mocked notification delivery.** The combined workflow is implemented on the existing launch-safety foundation. Existing staged workflows remain available. No application code was changed during the final verification/resumption turn.

## User flow

Ordinary new Send Points requests use `campaigns.send_points`: resolve missing details, show one compact preview, then **Cancel | Confirm & Send Points**. The preview includes the campaign/store, exact recipient names/emails, displayed units and INR amount, funding source, projected available funds, redemption scope and delivery configuration. The existing card/design is reused.

The backend converts displayed quantities using the existing store rules: a Points store uses 2 Points per INR; an INR store uses 1 Credit per INR. Existing whole-INR/minimum-INR250 allocation rules still apply. The preview resolves Contact identity before confirmation, including the existing draft service's implicit Contact linkage by email. Missing/duplicate recipient information is rejected rather than guessed.

Explicit draft-only, allocation-only, launch-existing and management requests retain their existing workflows. New combined preparation refuses an accessible existing named campaign instead of recreating or automatically launching it. The existing “Chatt Pooja” campaign was not accessed through a live service, modified or launched during development.

## Execution and recovery

PREPARE validates and stores one confirmation/proof; it does not create a campaign, spend entity or financial transaction. Confirmation binds exact identities, campaign/store configuration, INR amount, authorized funding, scope, delivery and relevant resource/authorization state.

After explicit confirmation, a durable `SendPointsOperation` journal reserves one campaign ID and logical operation identity. It calls the existing draft, allocation and launch domain services directly. It does **not** fabricate child confirmations or call the three confirmation endpoints. The allocation child key derives from the durable journal ID and remains unchanged on retries.

Recovery checks authoritative evidence:

- An existing draft must satisfy the existing complete draft proof. A partially saved draft is not treated as complete or replayed as a new campaign.
- Allocation advances only through the existing atomic receipt/pre-state recovery contract. A proven completion is read without allocating again.
- Launch retains the existing owner/fence checks, approval manifest and `campaign_spend:${campaignId}` key. An additional journal guard runs inside that same financial transaction, checking journal ownership/expiry, current authorization, approved resource projection and the approved pre-debit balances. A stale orchestration worker cannot bypass the launch fence.
- A proven financial commit is recognized through the recorded debit and matching persisted launch approval. Recovery does not repeat the debit or use a new campaign/key to escape an ambiguous outcome.
- Invitation handling remains the verified durable post-commit handoff. Uncertain submission is not automatically resent; provider acknowledgement is never described as guaranteed mailbox delivery.

Progress distinguishes an active operation, a safely resumable partial operation and one requiring review. It includes the real saved recipient count, campaign state and recorded debit/delivery evidence. Resume requires the original key and unexpired consumed approval, unchanged authorized resources and existing recovery proofs. The card offers **Resume confirmed send** only for server-proven cases; it does not ask for another confirmation or generate a replacement key. Active operations offer a read-only status check.

The existing server-authoritative WRITE-state reconciliation persists and recovers the outcome. Refresh, Resolve and subsequent messages do not execute business writes or resurrect a completed confirmation. Lost HTTP responses are resolved from backend evidence.

## Exact implementation/test files changed

These are the changes for the combined-flow task, distinct from earlier uncommitted launch-safety and unrelated work:

| File | Change |
| --- | --- |
| `apps/api/src/modules/copilot/sendPointsWorkflow.js` | New combined preparation/execution, durable journal, resource binding, progress and recovery. |
| `apps/api/src/modules/campaigns/campaigns.service.js` | Server-owned reserved draft ID and optional combined launch guard passed to the shared service. |
| `apps/api/src/modules/campaigns/pointsLaunch.service.js` | Run the optional orchestration guard within the existing fenced financial transaction. |
| `apps/api/src/modules/mcp/campaignsDraftWrite.js` | Expose validated planning and reserved-ID domain save capabilities; preserve existing staged endpoints. |
| `apps/api/src/modules/mcp/mcpWriteSafety.js` | Optional session-aware actor loading and read-only combined outcome reconciliation. |
| `apps/api/src/modules/copilot/copilotMcpCatalog.js` | Add the embedded-only combined prepare/execute pair. All 67 public MCP tools remain unchanged. |
| `apps/api/src/modules/copilot/copilotToolBindings.js` | Bind combined preparation and keep execution model-inaccessible. |
| `apps/api/src/modules/copilot/copilotWrites.service.js` | Register the combined confirmation workflow and return authoritative partial progress. |
| `apps/api/src/modules/copilot/copilotChat.service.js` | Default new ordinary sends to the combined workflow; keep explicit Points writes on the business path. |
| `apps/api/src/modules/copilot/copilotDiscovery.js` | Point the existing Send Points discovery action to the combined workflow. |
| `apps/api/src/modules/copilot/copilotWriteState.service.js` | Project combined completion, processing and recovery evidence through existing conversation reconciliation. |
| `apps/web/src/features/copilot/actionPresentation.ts` | Compact combined preview and truthful debit/acknowledgement/progress presentation. |
| `apps/web/src/features/copilot/api.ts` | Types for authoritative partial progress and safe-resume eligibility. |
| `apps/web/src/features/copilot/CopilotConfirmationCard.tsx` | One send button, verified recipient details, stable key, read-only recovery/status and explicit safe resume. |
| `apps/api/tests/combined-send-points.test.js` | 38 combined-flow acceptance tests. |
| `apps/api/tests/copilot-mcp-catalog.test.js` | Verify unchanged public MCP inventory plus exactly the two embedded orchestration entries. |
| `apps/api/tests/copilotDiscovery.test.js` | Verify embedded workflow binding and explicitly isolate rollout flags from local environment settings. |
| `apps/web/src/features/copilot/CopilotCombinedPoints.test.tsx` | Combined preview, cancellation, concurrency, lost response, reload, resume and truthful result tests. |

The remaining changes in the working tree predate this task. In particular, no gifting recommendation or store-publishing implementation was modified. The React best-practices skill was applied to the card review, including derived idempotency state, event concurrency guards, accessible status/actions and read-only recovery effects.

## Final results

| Final report | Passed | Failed | Pending |
| --- | ---: | ---: | ---: |
| `combined-final.json` | 52 | 0 | 0 |
| `staged-final.json` | 75 | 0 | 0 |
| `launch-ledger-final.json` | 85 | 0 | 0 |
| `wallet-final.json` | 43 | 0 | 0 |
| `write-state-final.json` | 34 | 0 | 0 |
| `notification-read-final.json` | 22 | 0 | 0 |
| `redemption-final.json` | 15 | 0 | 0 |
| `recovery-notices-final.json` | 17 | 0 | 0 |
| `web-final.json` | 160 | 0 | 0 |
| **Total: 43 unique test files** | **503** | **0** | **0** |

This is **343 API tests and 160 frontend tests**, with no duplicate test files counted. The combined batch includes its 38 acceptance tests plus catalogue/discovery/registry tests. Coverage includes single/multiple recipients, conversion/minimums, both funding scopes, redemption scopes, missing/duplicate information, cancel/expiry, concurrent confirmations, crashes at all three stages, recipient/funding/store/schedule changes, authorization revocation, lease takeover, uncertain notifications, all delivery modes and completed conversation recovery. Existing staged, launch-safety, wallet, ledger, campaign/redemption and WRITE-state regressions remain green.

The redemption fork-pool report was incomplete despite reporting `success: true`: its assertions were still pending. It is retained as `redemption-incomplete.json` and is **not** counted. The latest rerun used `--pool=threads` with the existing one-worker/sequential settings and both default/JSON reporters. It completed **15/15** tests; `redemption-final.json` contains every assertion as passed. No failed/incomplete final suite remains, so no test rerun was necessary during resumption.

`verify-final.mjs` validates all nine final reports: success, zero failure/pending counters, exact assertion totals, all assertions passed and unique test-file identities. The resulting `verification-summary.json` also records implementation hashes and preservation evidence. Earlier intermediate failures/incomplete reports are retained as diagnostics, not acceptance evidence.

### Preservation and checks

- Pre-implementation snapshot: 303 existing dirty files. **291 remain byte-for-byte unchanged**; all 12 changed snapshotted files are on the intended implementation list. The six other listed files were new or previously clean and absent from that dirty-file snapshot. No unexpected snapshotted changes or missing files were found.
- Scoped `git diff --check` passed. Node syntax checks passed for the changed backend implementation.
- The repository-wide frontend typecheck was rerun during final verification and **still fails with 26 diagnostics**. Their file/code/message set exactly matches the prior launch-safety verification. These include existing kit/product typing, duplicate declarations in `api-bridge.ts`, artwork tests, Vite typing and unchanged `inviteStatus` accesses. They were not fixed or concealed by this task.
- No implementation code was rewritten during resumption. Only final verification artifacts and this report were added/updated.

## Remaining issues and readiness

No new combined-flow safety blocker remains in the passing acceptance contracts. The workflow is ready for **controlled local testing using isolated fixtures and mocked delivery**.

The workspace is not a clean release candidate while its unrelated typecheck remains red. No deployment readiness or real-mail delivery guarantee is claimed.

Recovery intentionally stops for review when a partial draft, allocation receipt, changed resource or unknown outcome cannot be proved safe. Expired partial approvals cannot resume. Existing campaigns require their supported advanced workflow rather than being recreated. Historical launched campaigns without approval evidence retain the launch-safety foundation's explicit review policy. Uncertain invitation attempts require reconciliation and are never automatically resent. The existing worker must run to recover committed delivery intents; MongoDB replica-set transactions/majority writes remain required. SMTP acceptance does not guarantee delivery to a mailbox.

All mutation tests used isolated MongoMemoryReplSet fixtures, blank test email/SMS credentials and mocked/stubbed notification delivery. Redis was pointed at an unavailable loopback port. No live campaign, actual wallet deduction, real email, production/staging action, commit, push, deployment, reset or Git remote change was performed.
