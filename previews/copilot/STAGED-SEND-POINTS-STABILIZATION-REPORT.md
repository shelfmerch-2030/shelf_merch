# Existing staged Send Points — restored and verified

12 November 2026. The original Draft → Allocate → Launch flow is stable under the isolated regressions listed below. The separate launch-safety project remains incomplete; this report does not certify resistance to the previously identified stale-worker and recipient-mutation races.

## Review findings

The unfinished patch coupled financial/state transactions to a new persisted launch manifest, Mongoose edit guards and transactional invitation dispatch. Holding a MongoDB transaction open across a notification service call cannot cancel external work after transaction abort; the previous abort diagnostic reproduced this gap.

It also introduced two compatibility regressions:

1. The campaign immutability plugin rejected the existing scheduled-delivery regression's update of `schedule.sendAt` with `CAMPAIGN_LAUNCH_LOCKED`.
2. The scheduled-delivery wrapper required a new manifest on historical campaigns. The missing-wallet financial-integrity regression received `LAUNCH_MANIFEST_UNVERIFIED` before reaching the established `NOT_FOUND` check.

## Exact changes in this stabilization

- `apps/api/src/modules/campaigns/campaigns.service.js`: removed the unfinished launch module import, manifest creation/checks, launch-specific edit guards, transaction wrapping of unkeyed allocation/import, transactional notification dispatch, and manifest-dependent scheduled-delivery wrapper. Restored the previous shared launch, invitation claim/delivery and scheduled delivery implementations. Preserved the earlier wallet eligibility checks on create/draft/import/allocation/launch/scheduled distribution, the session-aware allocation writes, atomic allocation receipts and recovery inspection. Kept filtering any historical `launchApproval` field from public campaign metadata. Existing lease acquisition/heartbeat/release and the ledger key `campaign_spend:${campaignId}` remain.
- `apps/api/src/modules/mcp/campaignsSendWrite.js`: removed the unfinished launch-manifest import, PREPARE proof hash, EXECUTE proof requirement, shared-service hash argument and manifest-specific recovery comparison. Preserved separate PREPARE/EXECUTE confirmation for allocation and launch, confirmation resource snapshots, schedule/scope/funding presentation, tenant/RBAC checks, allocation recovery and existing launch reconciliation. No tool registry or UI change.
- `apps/api/src/modules/campaigns/campaign.model.js` and `recipient.model.js`: reverted only the patch's plugin import/registration and new manifest fields. Both now match their pre-patch Git versions; no database migration or data mutation was run.
- Removed `pointsLaunchSafety.js`, `launchImmutability.plugin.js`, and `tests/send-points-launch-safety.test.js` from the active API tree after copying their exact original bytes to the archive below. The 26 tests for the withdrawn launch patch are archived, not counted as passing acceptance tests.
- Added the one-time, path-scoped isolation script `previews/copilot/isolate-launch-safety.mjs`, backups, verification evidence and this report. The script refuses to overwrite an existing backup.

Full pre-isolation copies of all seven affected files are stored under `previews/copilot/launch-safety-isolated/`, retaining their original relative paths with `.disabled` appended. `before.json` records the affected paths and SHA-256 hashes for unrelated pre-existing modified files. Final hash verification confirmed **277 unrelated files unchanged**, including earlier Copilot/UI work, ledger, payments, redemptions, wallet services, draft recovery and allocation recovery. No entire-tree reset or Git write was used.

The two previously failing test files and their assertions were not changed. Removing the incompatible unfinished integration restored their established behavior; both now pass.

## Verification results

| Batch | Tests passed | Failed | Pending |
| --- | ---: | ---: | ---: |
| Send Points, recovery, lifecycle, redemption, financial wallet integrity | 124 | 0 | 0 |
| Ledger, wallet, allocation safety, Copilot WRITE state and recovery | 108 | 0 | 0 |
| Existing Send Points, confirmation and presentation web tests | 79 | 0 | 0 |
| Total | **311** | **0** | **0** |

API batch 1 selected `mcp-campaigns-draft-write`, `mcp-campaigns-send-write`, `send-points-recovery-prerequisites`, `copilot-send-points-readiness`, `campaigns-lifecycle`, `campaigns-redemption`, and `financial-wallet-integrity` (all `.test.js`).

API batch 2 selected `ledger`, `wallets`, `wallets-allocate-safety`, `wallet-history-balances`, `copilot-wallet-reconcile`, `mcp-write-safety`, `copilot-write-state`, `copilot-writes-registry`, `copilot-writes-domains`, `write-recovery`, and `mcp-budget-allocation-write` (all `.test.js`).

Web batch selected `CopilotSendPoints.test.tsx`, `CopilotConfirmationCard.test.tsx`, and `CopilotPresentation.test.tsx`.

Each report records `success: true`; evidence is in `staged-send-points-stabilized.json`, `staged-send-points-safety.json`, and `staged-send-points-web.json` alongside their stderr logs. Existing Mongoose index/deprecation warnings remain. Node syntax checks for the four edited production files and scoped `git diff --check` passed. The final return-shape cleanup only removed an unused lease fence from the lease-acquisition result; syntax/diff checks followed it.

## Verified behavior

- Draft preview has no writes; confirmed save creates the draft and recipients. Partial-draft recovery remains fail-closed.
- Allocation has its own confirmation, stamps the approved amount and does not debit cash. Atomic allocation/recovery regressions remain green.
- Launch has its own confirmation, debits once using the existing ledger key, and handles repeated execution/recovery without a second debit or duplicate confirmed invitation.
- Immediate, self-share and scheduled sends retain their existing behavior. Scheduled sends debit on launch, defer credit/invitations, then deliver when due.
- Claimed invitations with uncertain outcomes remain unresolved and are not automatically resent.
- Tenant isolation, role/funding scope, stale confirmations, cancellation, missing/unavailable wallet checks, redemption and server-authoritative Copilot outcomes across reload/Resolve remain covered.

## Scope and limits

All mutations were synthetic MongoMemoryReplSet fixtures, with `MONGODB_TEST_URI` cleared before startup. Notification tests used their existing mocks or test-only stub delivery; test configuration blanked email/SMS credentials. The ledger/WRITE batch additionally forced Redis to an unavailable loopback port. No live campaigns, real emails, live wallet deductions, existing financial-data changes, commits, pushes, deployments or remote changes were performed.

This restores the original staged workflow and its established financial protections. The earlier audit's strict stale-worker fencing and exact recipient-identity confirmation guarantees are intentionally not claimed: the incomplete patch implementing those guarantees is isolated. No new architecture, outbox, MCP tools, combined confirmation or UI redesign was introduced. Historical audit configs/results describe the earlier patch and are not current acceptance evidence.
