# Send Points launch safety — incomplete, blocked

Verified on 12 November 2026. No deployment, commit, push, remote changes, live deductions or real invitation delivery were performed in this verification. No production implementation was changed during this resumed turn.

## Root causes and existing changes

The original workflow did not serialize lease ownership with the financial debit and campaign state persistence. Confirmation also did not bind the exact recipient identities and launch configuration.

The workspace already contains these uncommitted changes from the earlier work:

- `apps/api/src/modules/campaigns/pointsLaunchSafety.js`: owner/fence/expiry checks, a campaign write in the same MongoDB transaction as debit/state persistence, manifest hashing, existing-debit validation, manifest-aware invitation claims, and notification dispatch wrapped in a manually managed transaction.
- `apps/api/src/modules/campaigns/campaigns.service.js`: fenced launch lease acquisition, heartbeat, shared ledger session, frozen manifest checks, guarded invitation flow and scheduled delivery.
- `apps/api/src/modules/campaigns/campaign.model.js` and `recipient.model.js`: launch approval, fencing and recipient binding persistence.
- `apps/api/src/modules/campaigns/launchImmutability.plugin.js`: save/query guards against approved campaign configuration and recipient identity changes.
- `apps/api/src/modules/mcp/campaignsSendWrite.js`: existing prepare/execute confirmation binds a manifest hash; recovery compares it. No new tool was added in this resumed turn.
- `apps/api/tests/send-points-launch-safety.test.js`: fault injection for stale owners, debit rollback, crashes, recipient changes, invitation uncertainty, concurrency and scheduled sends.

The existing ledger key remains `campaign_spend:${campaignId}`. Claimed invitations remain unresolved rather than being automatically resent following uncertain acknowledgement.

## Remaining fencing blocker

`dispatchPointsInvitation` writes the campaign under a MongoDB transaction, then calls `await send()` before committing. A transaction write lock normally serializes takeover, but transaction abort or server-side expiry can release that lock while the awaited external operation is still pending. MongoDB rollback cannot cancel Redis/SMTP work.

The existing `notify` service awaits Redis readiness/queue submission and can fall back to asynchronous inline delivery. It does not accept a launch fence, participate in the MongoDB transaction, or offer cancellation tied to transaction ownership. Its queue connection permits indefinite request retries. A post-send ownership check detects lost ownership too late to prevent submission.

An isolated diagnostic explicitly aborted the open dispatch transaction while a mocked notification submission was pending, changed ownership to a successor, then allowed the mock submission to proceed. It observed submission with `ownerAtSubmission: successor-worker`. The caller subsequently returned `LAUNCH_LEASE_LOST`, the invitation remained claimed/unacknowledged, and exactly one synthetic campaign debit existed. This demonstrates the remaining defect; it does not validate launch acceptance.

Safe completion needs a durable, manifest-bound dispatch handoff with explicit ownership/idempotency semantics at the notification boundary, or a downstream service that enforces fencing. Merely adding another ownership check or extending transaction duration does not close this gap. Implementation stops here under the task's blocker restriction; no replacement delivery architecture was introduced.

## Verification

All database fixtures used MongoMemoryReplSet with `MONGODB_TEST_URI` cleared before startup. Email/SMS credentials were blanked by the test configuration; the diagnostic and launch safety suite mocked notifications.

The regression command selected these 12 API files:

`send-points-launch-safety`, `send-points-recovery-prerequisites`, `mcp-campaigns-send-write`, `copilot-send-points-readiness`, `ledger`, `copilot-write-state`, `copilot-writes-registry`, `mcp-write-safety`, `financial-wallet-integrity`, `campaigns-lifecycle`, `campaigns-redemption`, `wallets-allocate-safety` (each with `.test.js`).

Result: **189 tests; 187 passed; 2 failed**. Evidence: `launch-safety-verified-regressions.json` and its stderr file in this directory.

Failures:

1. `campaigns-redemption.test.js`, scheduled points send: the test changes `schedule.sendAt` after launch to force delivery due. The new immutability guard rejects this mutation with `CAMPAIGN_LAUNCH_LOCKED`. The test needs clock advancement or a schedule configured before approval; this run therefore does not establish the entire existing scheduled-send regression as passing.
2. `financial-wallet-integrity.test.js`, missing-parent scheduled distribution: a synthetic historical launched campaign has no manifest. The service now rejects with `LAUNCH_MANIFEST_UNVERIFIED` before the expected missing-parent `NOT_FOUND` error. No credits were distributed, but the regression's expected error contract fails.

The additional diagnostic `launch-safety-abort-audit.test.js` passed its single characterization assertion, reproducing unsafe submission after takeover. Evidence: `launch-safety-abort-audit-results.json`. Run with `npx vitest run --config previews/copilot/vitest-launch-safety-abort-audit.config.mjs` from the repository root. It is outside the acceptance suite intentionally.

## Remaining risks

- Strict stale-worker invitation fencing is not satisfied; do not proceed to combined one-confirmation orchestration on the strength of this patch.
- Existing scheduled campaigns without persisted launch manifests fail closed and require an explicit migration/review policy.
- An unresolved invitation claim intentionally prevents automatic resend and needs operational reconciliation.
- Raw MongoDB writes bypass Mongoose middleware. Service-level locking is not a substitute for database access controls.
- The two regression failures remain unresolved. Passing tests do not establish end-to-end production notification fencing.

This turn added only the diagnostic, its isolated Vitest configuration, test evidence and this report. Existing unrelated workspace changes were left intact.
