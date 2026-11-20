# Staged Send Points launch safety implementation

Verified 12 November 2026. The existing Draft → Allocate → Launch flow now has atomic launch fencing, exact approval manifests and durable post-commit invitation delivery. No combined one-confirmation workflow was implemented. The archived incomplete patch was not restored.

The new staged path passes its isolated acceptance and regression tests and is suitable for controlled local testing as the backend foundation for later orchestration. This is not a deployment approval: the repository-wide frontend typecheck remains red with 26 diagnostics outside the changed Send Points regions.

## What changed

The former lease acquisition/heartbeat did not constrain the ledger transaction or subsequent campaign writes. Confirmation snapshots also omitted exact recipient identities. Wrapping an external notification call in a MongoDB transaction could not cancel that call after abort.

Launch now checks owner, fence and unexpired lease through a campaign write inside the same majority-committed transaction as the existing ledger debit, launch state, recipient binding stamps and delivery intents. A second fence check precedes state persistence. Store and funding-parent writes serialize concurrent conversion/configuration and wallet-reassignment edits. Existing `campaign_spend:${campaignId}` keys are unchanged. Existing debits are checked for exact type, wallet, amount and department scope; an inconsistent or unverified historical launch is not adopted speculatively.

The approval hash covers durable campaign configuration, store identity/currency/conversion/status, normalized recipient email and identity, contact/token binding, wallet/entity/funding scope, INR amounts, redemption scope and schedule/message settings. Delivery/redemption progress does not invalidate it. MCP PREPARE stores this hash in its confirmation proof; EXECUTE and recovery verify it alongside the existing authorization, expiry and idempotency contract.

The ordinary REST Points route now requires `expectedLaunchHash`. GET/update/allocation responses provide `launchReviewHash`; the existing wizard forwards the reviewed value without a UI redesign. Missing evidence fails with `LAUNCH_APPROVAL_REQUIRED`; changed state fails before debit. Non-Points launch behavior is retained. Internal shared-service callers snapshot at invocation unless supplied an explicit review hash; both public Points entry paths supply or require the review binding.

Model guards reject ordinary approved campaign/recipient identity edits. Stale saves also carry a write predicate so a document read before approval cannot overwrite it afterward. Recipient import/upsert and all Points allocation writes serialize with the parent campaign in transactions, preventing stale allocation from refilling redeemed credit or adding recipients to an approved send. Identical schedule updates preserve delivery/credit markers.

## Durable delivery semantics

`PointsDelivery` stores one unique intent per tenant/campaign/recipient. Its payload and approval hash are persisted in the launch transaction; self-share creates no delivery jobs. Scheduled intents retain the approved due time. Scheduled credit distribution is stamped once and is not repeated on retries after redemption.

Only committed ready intents may be claimed. A claim transaction revalidates the campaign, exact live manifest, funding/debit evidence, approved recipient and saved payload hash. Launch callers must still own their launch fence at this boundary; the background delivery worker is independently authorized by the committed intent. Competing workers cannot claim the same job.

A delivery claim has a permanent random owner and is never leased out again. Before external I/O, a separate majority write consumes a one-use submission permit and marks the attempt unresolved. Submission runs after both financial and claim transactions have committed. The payload is reloaded from the saved job, not supplied by a caller. An old launch caller cannot create new claims after takeover. An already committed delivery permit authorizes its original immutable payload independently of later launch-lease ownership; it is not revoked/reassigned when a launch lease expires.

The existing notification service has a Points-only direct-delivery option that bypasses Redis enqueue and its uncertain-enqueue fallback. It propagates errors and treats the email helper's `{ success: false }` as unacknowledged, even though that helper normally catches SMTP exceptions. Outside tests, missing SMTP configuration cannot be reported as a sent stub. Other notifications retain their existing route.

Provider acknowledgement and the recipient's invited marker commit together in a later transaction. Provider/message-id receipt fields are retained when available. A failure or unknown acknowledgement remains unresolved; no automatic retry, claim takeover or resend is permitted. A process crash between claim and submission may therefore leave an unsent invitation unresolved. This conservative availability tradeoff prevents an uncertain job from authorizing another automatic attempt.

The existing scheduled worker polls durable immediate/scheduled intents, including after an API crash before queue wakeup or after acknowledgement but before campaign completion markers. Manager notices are written once after acknowledged submissions; existing Slack notification behavior is preserved and tested. Delivery markers and scheduled state transitions are persisted transactionally. No Redis/SMTP notification submission occurs within an uncommitted financial transaction.

This provides one automatic client submission attempt per intent, not exactly-once email delivery. SMTP/provider acceptance is not proof that a message reached a mailbox. The downstream provider has no exactly-once guarantee here.

## Exact source/test files changed

| File | Change |
| --- | --- |
| `apps/api/src/modules/campaigns/pointsLaunch.service.js` | New manifest, fenced financial commit, durable delivery model/claims/submission/recovery. |
| `apps/api/src/modules/campaigns/pointsApprovalGuard.js` | New focused model edit guards and shared approval configuration normalization. |
| `apps/api/src/modules/campaigns/campaign.model.js` | Hidden approval/revision and delivery/credit/notice progress markers; guard registration. |
| `apps/api/src/modules/campaigns/recipient.model.js` | Hidden binding stamp, normalized email and guard registration. |
| `apps/api/src/modules/campaigns/campaigns.service.js` | Integrate fenced Points launch/delivery; transactional Points edits; review hashes; retain business validation, usage and Slack handling. |
| `apps/api/src/modules/campaigns/campaigns.controller.js` | Require/pass the reviewed hash on the existing REST Points launch route. |
| `apps/api/src/modules/campaigns/campaigns.validation.js` | Validate optional hash syntax; controller enforces its presence for Points. |
| `apps/api/src/modules/mcp/campaignsSendWrite.js` | Bind launch confirmation/recovery, validate debit proof, expose truthful unresolved status. No new MCP tool. |
| `apps/api/src/modules/notifications/notifications.service.js` | Direct, strict-acknowledgement Points delivery; no uncertain Redis fallback for these jobs. |
| `apps/api/src/services/ledger.service.js` | Expose existing index readiness before the outer transaction; do not swallow an outer transaction's duplicate-key failure as an outside-session replay. |
| `apps/api/src/jobs/scheduledCampaign.worker.js` | Recover durable Points delivery in the existing worker poll. |
| `apps/web/src/services/mutations-api.ts` | Forward the allocation/review hash through the existing wizard's launch request; fail closed if absent. |
| `apps/api/tests/points-launch-acceptance.test.js` | 31 new isolated launch acceptance tests. |
| `apps/api/tests/points-invitation-notify.test.js` | 5 new direct-notification boundary tests. |
| `apps/api/tests/campaigns-redemption.test.js` | Supply reviewed hashes and advance the clock to the approved schedule instead of editing it. Existing outcome assertions retained. |
| `apps/api/tests/write-recovery.test.js` | Build real committed launch evidence, then inject a crash; retain existing debit/no-refund/no-resend and notice assertions. |
| `apps/api/tests/mcp-slack-notifications.test.js` | Exercise real verified post-commit recovery/preferences rather than fabricating launched records without approval/debit evidence. Assertions retained. |
| `apps/web/src/services/pointsLaunchApproval.test.ts` | 4 new wizard request-binding, missing-evidence and no-retry tests. |

Additional artifacts are confined to `previews/copilot/launch-safety-v2/`: the pre-task tracked diff, intermediate/final test JSON and stderr logs, `typecheck.txt`, `verify.mjs`, `verification-summary.json` and this report. `verify.mjs` rejects incomplete test reports or duplicate test-file counts. It also verifies that 70 unrelated tracked diffs still match the pre-task snapshot and 276 unrelated file hashes from the earlier workspace snapshot are unchanged. No other Copilot/UI implementation was edited.

## Acceptance evidence

The original unsafe behaviors are now rejected by assertions in `points-launch-acceptance.test.js`:

- A successor owner/fence prevents the original worker's debit and invitation claim (`LAUNCH_LEASE_LOST`).
- Lease expiry after ledger writes aborts money, launch state and intents together.
- Takeover waits behind an active financial transaction; after takeover the former launcher cannot dispatch new jobs.
- Recipient mutation at the debit boundary causes transaction conflict/revalidation and `LAUNCH_MANIFEST_MISMATCH`, leaving no debit/intents/submission.
- Confirmed recipient/store/funding/scope/schedule/amount changes fail the confirmation before financial effects.
- Ordinary identity/config edits are locked after launch. Raw identity or payload corruption is detected before delivery.
- Debit/persistence failure creates no externally dispatchable intent. Notification submission asserts no MongoDB transaction is open.
- Post-commit crash and lost financial commit acknowledgement preserve recoverable intent with one debit.
- Concurrent delivery claims, duplicate submit calls and concurrent Confirm clicks produce one client attempt/debit.
- Crashed claims, lost permit acknowledgement and uncertain SMTP acknowledgement are not automatically retried.
- Scheduled delivery waits until due, credits once, preserves credit markers across identical updates, and does not refill redeemed balances. Self-share makes no email intent.
- Historical unverified launches fail closed; the REST route rejects missing/stale review evidence.

The two old diagnostic files were left as historical characterization evidence. Their assertions deliberately expected unsafe behavior and are not current acceptance tests. The new tests assert rejection/rollback/serialization of those same failure boundaries.

## Final test results

| Final report | Passed | Failed | Pending |
| --- | ---: | ---: | ---: |
| `staged-final.json` — draft/allocation/launch/recovery/readiness/lifecycle/financial integrity | 109 | 0 | 0 |
| `ledger-wallet-verified.json` — ledger/wallets/allocation/history/reconciliation/budgets | 58 | 0 | 0 |
| `write-state-verified.json` — MCP safety/Copilot WRITE state/registry/domains | 38 | 0 | 0 |
| `acceptance-verified.json` — launch/direct-notify acceptance, campaign schema/read, notification/email regressions | 58 | 0 | 0 |
| `rest-redemption-verified.json` — existing HTTP lifecycle/redemption suite | 15 | 0 | 0 |
| `recovery-notices-verified.json` — write recovery and Slack regressions | 17 | 0 | 0 |
| `web-final.json` — all Copilot frontend tests plus wizard approval and shared collection mutation regressions | 152 | 0 | 0 |
| **Total, 40 unique files** | **447** | **0** | **0** |

All final reports have complete passed assertion counts, not just `success: true`. An intermediate Vitest run emitted a report while a suite still had pending assertions; it was excluded and the affected suites were rerun separately to completion. Other intermediate failures exposed and corrected integration/fixture issues, including index setup inside the financial transaction, draft proof defaults, manager notices, old unverified recovery fixtures and the REST test's missing required idempotency header.

Node syntax checks and scoped `git diff --check` passed. The workspace typecheck **failed with 26 diagnostics**, including duplicate declarations in `api-bridge.ts`, kit/product typing, artwork tests, Vite server typing and existing `inviteStatus` accesses outside the edited region in `mutations-api.ts`. No diagnostic points into the changed Send Points TS region or new approval test. These unrelated errors were not changed. A whole-project clean typecheck remains a release prerequisite; no baseline typecheck was run before implementation, so the result is reported explicitly rather than described as a successful check.

## Compatibility and remaining limits

- New launches from approved campaigns, including older still-unlaunched drafts/allocations, can obtain a fresh exact review hash and launch normally. Missing/expired legacy MCP confirmation proofs require fresh PREPARE.
- Already-launched historical campaigns without persisted approval evidence are readable and remain redeemable under the existing redemption rules, but automatic launch/delivery recovery is blocked with `LAUNCH_REVIEW_REQUIRED`. Their original approved identities cannot be inferred safely from today's mutable recipients. No migration, synthetic approval or replay was performed. A separate explicit review/migration policy is required before sending any remaining historical invitations.
- Existing integrations calling the REST Points route must forward `expectedLaunchHash` from a reviewed GET/update/allocation response. The included wizard is updated. Clients omitting it fail closed; no new route or tool was added.
- Claimed/submitting/unresolved deliveries require operational reconciliation; there is intentionally no automatic resend path or new manual-resend feature. A missing SMTP configuration outside tests also stays unresolved rather than reporting a successful stub.
- The existing worker process must run to recover committed intents after crashes. MongoDB replica-set transactions and majority writes are required, as with the existing ledger. Provider latency can leave a permanent unresolved attempt; it cannot authorize a replacement attempt.
- Supported service paths serialize recipient membership/configuration writes. Raw database administration can bypass model guards; the saved payload/hash and dispatch revalidation prevent ordinary raw identity changes from retargeting an invitation. This is not protection against an administrator rewriting approval proofs or submission permits.
- SMTP has no exactly-once capability. The implementation does not promise exactly-once provider delivery and never retries an uncertain attempt automatically.

No safety acceptance blocker remains for new staged launches under these semantics. The staged backend is a tested foundation for future one-confirmation orchestration, not that feature itself. The unrelated typecheck failures and any planned historical-delivery migration remain separate release concerns.

All financial mutations used isolated MongoMemoryReplSet fixtures (`MONGODB_TEST_URI` cleared before each run). Redis was directed to an unavailable loopback port; notification acceptance tests mocked delivery, and test email/SMS credentials were blank. No live campaign, real email, actual wallet deduction, production/staging operation, commit, push, deployment or Git remote change was performed.
