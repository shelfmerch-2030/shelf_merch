# Send Points recovery prerequisites

## Result

Both targeted safety contracts are implemented and covered by isolated regressions. No combined Send Points workflow, UI change, new MCP tool, live database change, deployment, Git remote change, commit or push was performed.

This is not an automatic repair of historical partial drafts or legacy allocation receipts. Those remain blocked unless a complete, versioned outcome can be proved. No existing financial document was restored, overwritten or deleted.

## Root causes

1. `savePointsDraft` persists a campaign before sequential recipient upserts. An interruption can leave a campaign and a subset of the recipients. MCP recovery previously treated a matching incomplete campaign name as completion without proving the confirmed manifest or configuration. It could therefore promote a failed receipt to completed after only one of two recipients was saved.
2. Credit allocation stamped recipients and saved the campaign separately from its `CampaignOperation` receipt. Failures could leave ambiguous partial state. Both the campaign-operation and MCP idempotency layers treated failed receipts as terminal, even when no changes had been applied. Conversely, allocation reconciliation based on status/count/totals did not prove every recipient stamp or the exact configuration.

## Changes and safeguards

### Draft

- PREPARE stores versioned hashes of the complete expected recipient union and campaign configuration, including the actual model defaults, scope, message, schedule, amount and cached recipient count. Parent entity/wallet and creator/target bindings are also recorded. Recipient content is not copied into recovery receipts.
- Recovery prefers the canonical linked campaign over a same-name sibling. Completion requires exact recipient identities, names, phone/contact bindings, credits and delivery/redemption markers, plus the full campaign configuration and funding binding.
- Completion proof reads the campaign, parent and recipient manifest from one MongoDB snapshot. A name/count match alone is insufficient.
- Partial or mismatched drafts return `IDEMPOTENCY_RECONCILIATION_REQUIRED`; payload drift may be rejected earlier as `IDEMPOTENCY_PAYLOAD_MISMATCH`. They are not re-upserted or reported completed during recovery.
- Unverified legacy pending confirmations require a fresh preview before a normal save. Completed cached outcomes retain their existing replay behavior.

### Allocation

- Only keyed Points/wallet allocation opts into the atomic contract. Existing standalone draft, allocation and launch operations remain available. Unkeyed and external-payment paths retain their existing behavior.
- Campaign state, recipient credit stamps and the fenced `CampaignOperation` completion now commit in one MongoDB transaction. Existing business validation and spending services still run; no ledger, launch, invitation or redemption implementation was rewritten.
- A versioned receipt binds actor authorization context and full durable before/after hashes for the campaign, recipients and funding documents. The confirmed PREPARE hash is checked at reservation, then the transaction checks durable state again.
- A failed operation can resume only under its original MCP key, original `credits:<confirmationId>` child key and original consumed confirmation. The confirmation must remain unexpired and its payload/resource hash must match; active actor, tenant, RBAC, wallet and spending checks are repeated.
- Both receipts are retained and reacquired through compare-and-swap ownership/fence increments. The transaction holds the child receipt fence along with its domain writes. A stale worker cannot subsequently commit.
- Explicit transient, aborted failures with exact unchanged pre-state may resume. Live leases, permanent failures, unknown commit outcomes, mismatched state and unversioned receipts do not authorize replay. Proven completed atomic receipts recover the actual recorded allocation result without repeating writes.
- The existing "same allocation" fast path now checks recipient credit stamps and cached count for approved/allocated campaigns; it cannot hide a partial allocation.
- Server-authoritative Copilot outcome persistence, provider-context projection and execution recovery in `copilotWriteState.service.js` were not modified.

## Files changed for this task

- `apps/api/src/utils/recoveryHash.js` — deterministic recovery hashing.
- `apps/api/src/modules/mcp/pointsDraftRecovery.js` — expected draft state and snapshot completion proof.
- `apps/api/src/modules/mcp/campaignsDraftWrite.js` — PREPARE proof, recipient resource binding, canonical target and strict recovery checks.
- `apps/api/src/modules/mcp/mcpWriteConfirmation.model.js` — optional versioned recovery proof.
- `apps/api/src/modules/mcp/mcpWriteSafety.js` — proof capture and opt-in fenced, reauthorized same-key resume. Other workflows retain their default failure contract.
- `apps/api/src/modules/campaigns/allocationRecovery.js` — allocation state hashes and before/after evidence.
- `apps/api/src/modules/campaigns/campaignOperation.js` — allocation-only transactional execution and fenced receipt recovery.
- `apps/api/src/modules/campaigns/campaigns.service.js` — pass the transaction session through allocation writes and expose authoritative allocation recovery inspection.
- `apps/api/src/modules/mcp/campaignsSendWrite.js` — confirmed state binding, allocation recovery mapping and exact stamp validation.
- `apps/api/tests/send-points-recovery-prerequisites.test.js` — 41 fault-injection and regression cases.

The workspace already contained unrelated modifications from earlier tasks; those were preserved.

## Verification

All mutation tests used the API test configuration and MongoMemoryReplSet. Notification/storage test stubs were retained; no real campaigns, wallet deductions or invitations were executed.

Final Send Points batch: **87 passed, 0 failed, 0 pending**, five files:

- Recovery prerequisites: 41.
- MCP draft: 8.
- MCP allocation/launch: 9.
- Copilot Send Points readiness: 17.
- Existing write recovery: 12.

Final safety batch: **79 passed, 0 failed, 0 pending**, seven files:

- MCP WRITE safety: 8.
- Copilot WRITE state: 17.
- Copilot workflow registry: 4.
- Copilot WRITE domains: 9.
- MCP budget allocation: 7.
- Financial wallet integrity: 23.
- Campaign lifecycle: 11.

Total: **166 passed**. Node syntax checks and targeted `git diff --check` passed.

Evidence:

- `recovery-prereq-final-send-points.json` and `.txt`.
- `recovery-prereq-final-safety.json` and `.txt`.

Earlier diagnostic and intermediate reports are not acceptance evidence: one initial test exposed the old count-only recovery assumption, and an oversized intermediate batch generated an incomplete Vitest report. The final bounded batches above have every test completed and no pending cases.

The focused tests cover partial upserts; missing/extra/replaced recipients; name, phone, contact and credit mismatches; configuration/scope/message/count/schedule/timezone/funding changes; lost completion results; transient failures before and after recipient stamps; atomic-receipt completion failure; crashed reservations; concurrent resumes; stale executors; uncertain commits; minimum validation; legacy receipts; expired confirmations; permission changes; new-key substitution; scheduled zero-credit staging; and preserved no-debit/no-invitation behavior. Existing suites cover staged launch, conversion, department-manager funding and authoritative conversation reconciliation.

## Remaining recovery requirements

- Historical partial drafts need an authorized, record-specific reconciliation against their confirmed manifest. This change deliberately leaves the durable partial records intact and does not mark them completed.
- Legacy failed/pending allocation receipts without transactional proof cannot be safely converted into retryable receipts. Review campaign, recipients, operation receipts and ledger evidence before any separately approved repair. Do not clear receipts or substitute keys.
- Unknown commit results remain blocked unless the atomic completed receipt can be read. Do not infer rollback or success from an HTTP failure alone.
- Atomic allocation recovery requires transaction-capable MongoDB, as the existing ledger already does. There is no nontransactional fallback.
- A future combined workflow still needs its own orchestration, binding and partial-progress review; it was not implemented here.
