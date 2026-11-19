# Financial data integrity safety fix

Completed locally on 11 November 2026. Existing financial records were not deleted, restored, recreated, reparented or modified. No user accounts, Entity Manager assignments or campaign history were changed in the configured test database. No production/staging mutations, Git remote changes, commits, pushes or deployments were performed.

Mutation tests used the isolated in-memory MongoDB replica set. The only direct access to the configured `shelfmerch_test` Atlas database used native-driver reads for recovery assessment and preservation checks. Application startup, cache-repair endpoints and assignment-backfilling read handlers were not invoked against that database.

## Verified problems

- `resolveSpendWalletForEntity` explicitly included soft-deleted parent wallets and, if the original wallet was absent, selected another tenant wallet by balance. This could charge a different wallet for an orphaned department.
- The ledger's low-level transaction writer also explicitly included deleted wallets. It did not independently enforce that a related entity belonged to the transaction wallet.
- Campaign credit distribution, external-payment flows, scheduled sends and redemption credit/order paths could make side effects before confirming that the original parent wallet remained available.
- MCP department and points-summary READs reported cached orphan allocations under available-budget fields. The organization wallet list returned an empty list without explicit unavailable-versus-zero semantics.
- Draft deletion guarded balance/allocation/ledger activity, but did not check linked departments, creation claims, payments or pending funding dependencies. Automatic draft cleanup had the same dependency gap.

## Exact safeguards

### Financial writes

The ledger now owns a reusable tenant-scoped wallet eligibility check:

- Parent must exist in the requested tenant and must not be soft-deleted.
- Parent must have a recognized existing Wallet lifecycle status. Unsupported raw states, such as a historical `closed` record outside the declared lifecycle, are rejected with `WALLET_UNAVAILABLE`.
- Existing legitimate setup statuses remain eligible. No active-only rule or new funding/period policy was introduced, since allocations are part of the current setup flow.
- Entity-tied operations must use that entity's exact parent wallet. No fallback, automatic wallet replacement or reparenting occurs.
- Low-level ledger writes and allocation batches validate the entity/tenant/wallet binding inside their existing transaction/session, including idempotent allocation paths. A mismatch returns `ENTITY_WALLET_MISMATCH`; missing/deleted/foreign parents return scoped `NOT_FOUND`.
- Missing/deleted/ineligible wallets are not cache-repaired by the wallet cache repair helper.

The same ledger validation is reused before campaign/draft creation, recipient import that can calculate budgets, credit allocation, launch lease acquisition, scheduled credit distribution, redemption checkout, pooled-credit debits, surprise/single fulfillment order creation and new payment-order creation. The pooled-credit path validates all contributing campaign parents before changing the first credit. This prevents a valid unrelated wallet or campaign from being used to bypass an orphaned source.

Existing ledger calculations, signed allocation/deallocation semantics, tenant/RBAC services, MCP confirmation safety and idempotency mechanisms were retained. Pure historical/idempotent reads remain distinct from performing a new financial operation.

### Department and wallet reads

- MCP `entities_list.departments` contains only entities whose same-tenant parent wallet is eligible.
- Orphan/ineligible entities are retained in a separate optional `unavailableDepartments` result, containing IDs, reason and explicitly historical allocated/spent amounts. It has no `remainingAmount` or spendable amount.
- Points summaries similarly exclude those entities from `availableAllocationInr` and retain separate `unavailableEntities` history. Recipient credit totals remain historical accounting information and do not establish current spendability.
- Organization wallet responses with no eligible wallet explicitly return `availability: unavailable` and explain that this is not a verified zero balance. A real existing wallet with a zero balance still returns its normal wallet item and numeric zero.
- Copilot's prompt explicitly forbids treating unavailable results as zero cash or spendable department budget. Its existing department artifact builder receives only eligible department rows, so orphan history is not rendered as an available-budget card.
- The dashboard's active department list also filters to eligible existing parent wallets; entity/ledger records themselves are retained.
- A saved department artifact with missing/empty financial data renders an unavailable-data message rather than inventing an available zero balance. This is a display fallback, not a data migration or financial recalculation.

### Draft wallet deletion

The official draft rollback keeps its existing draft/zero balance/zero allocation/no transactions restrictions and additionally refuses deletion when any of these dependencies exists:

- A linked Entity, including soft-deleted department history. This also protects the department's manager and campaign dependency graph.
- A wallet-funding Payment, including soft-deleted payment history.
- An MCP wallet creation claim pointing to the wallet.
- Pending funding approval, a positive requested amount or planned allocations.

The official deletion checks and parent soft-delete run in a MongoDB transaction and do not repair cached balances as a side effect of rejecting deletion. Automatic orphan-draft cleanup invokes the same dependency check. Truly empty, unused drafts can still be rolled back. No dependent records are cascaded or removed.

## Files changed in this task

Existing unrelated/uncommitted changes from earlier tasks were preserved. This task changed these 17 source/config/test files:

| File | Change |
| --- | --- |
| `apps/api/src/services/ledger.service.js` | Shared eligibility check; exact parent resolution; transaction/entity binding; read-only view/cache eligibility. |
| `apps/api/src/modules/wallets/wallets.service.js` | Guard wallet operations and allocation replay inputs; filter balance reads; transactional draft dependency checks and automatic-cleanup protection. |
| `apps/api/src/modules/entities/entities.service.js` | Parent eligibility before entity creation; eligible-parent filtering for active department lists. |
| `apps/api/src/modules/campaigns/campaigns.service.js` | Validate parent before campaign financial side effects, including external-payment and scheduled-credit paths. |
| `apps/api/src/modules/redemptions/redemptions.service.js` | Validate exact parents before pooled credit debits and checkout/fulfillment writes. |
| `apps/api/src/modules/payments/payments.service.js` | Validate funding wallet or recipient campaign parent before creating payment orders. |
| `apps/api/src/modules/mcp/entitiesRead.js` | Separate unavailable department history from current spendable departments. |
| `apps/api/src/modules/mcp/entitiesWrite.js` | Reuse eligibility before department setup can create users/assignments or allocate. |
| `apps/api/src/modules/mcp/walletsRead.js` | Explicit unavailable wallet metadata and text; no fabricated zero. |
| `apps/api/src/modules/mcp/walletVisibility.js` | Validate parent before exposing a department's current budget. |
| `apps/api/src/modules/mcp/pointsGiftsRead.js` | Separate unavailable entity history from available allocations. |
| `apps/api/src/modules/mcp/campaignsDraftWrite.js` | Apply the shared parent guard during financial-draft authorization. |
| `apps/api/src/modules/copilot/copilotChat.service.js` | One financial-integrity instruction distinguishing unavailable history from spendable funds. |
| `apps/api/tests/financial-wallet-integrity.test.js` | 23 new in-memory integrity regressions. |
| `apps/api/vitest.config.js` | Force SMS stub and local synthetic uploads, avoiding developer SMS/cloud-storage credentials during tests. Production configuration is unaffected. |
| `apps/web/src/features/copilot/CopilotBalanceCard.tsx` | Unavailable-data fallback for missing saved department-budget payloads. |
| `apps/web/src/features/copilot/CopilotProductCards.test.tsx` | Regression preventing missing saved budget data from becoming an available zero. |

Local report/evidence files were also written under `previews/copilot`; these are not application or database changes.

## Test results

**230/230 backend tests passed across 21 files**, with no skipped/pending cases in the final report. This includes all 23 new integrity cases and existing ledger, wallet, allocation safety, balance history, entity, MCP budget/setup/top-up/READ/campaign WRITE, campaign lifecycle/redemption, payment and Copilot WRITE regressions.

The new cases cover missing, deleted, cross-tenant and unsupported-state parents; no fallback to another healthy wallet; ledger/entity mismatch; immutable financial snapshots on rejected writes; historical-only orphan READs; zero balance versus unavailable data; unchanged valid allocation idempotency; manager scope; parent deletion between PREPARE and EXECUTE; external-pay credit/launch/checkout rejection; scheduled credits; draft dependencies; automatic cleanup; truly empty draft rollback; zero-net wallets with ledger history; and rejection before department setup can create users or assignments.

**24/24 targeted frontend tests passed** for product/budget cards and Copilot page/history behavior.

Machine-readable final reports:

- `financial-integrity-final-tests.json`
- `financial-integrity-web-tests.json`

Early broad runs exposed SMS and cloud-upload tests reading developer credentials from `.env`. The test-only configuration now forces the SMS stub and local storage. The final run is fully green. Earlier intermediate reports are retained but are not the final validation result.

`git diff --check` passed for the changed tracked files. No live Claude or financial WRITE verification was performed.

## Read-only recovery assessment

Target database: `shelfmerch_test`; tenant `husain`, ID `6ab6449e0df63061043c930f`.

| Missing wallet ID | Historical name | Existing parent documents | Surviving ledger rows | Ledger cash |
| --- | --- | ---: | ---: | ---: |
| `6ae49954d028910e7f6ee68f` | ABCD | 0 | 2 | 100,000 |
| `6ae9affeaf292bf5447ad8d8` | MCP QA Budget Test | 0 | 9 | 698,500 |

All four orphaned entities remain present:

- `6ae87442e3da4ced9c7b7019` — Marketing, first wallet.
- `6ae9beb02abda3a9c9aa9399` — Marketing, second wallet.
- `6ae9d908e6ce5ead376a5283` — Sales, second wallet.
- `6ae9d90de6ce5ead376a5287` — Engineering, second wallet.

The read-only preservation comparison after implementation found unchanged selected financial/access/state fields for **4 entities, all 11 ledger records, 4 manager role assignments, 4 manager accounts and 2 campaigns**. Both wallet documents are still absent. The detailed field comparison and timestamps are in `financial-integrity-recovery-assessment.json`.

**No verified current original wallet backup document was found in the inspected repository or database audit evidence.** Available evidence is:

- Audit `6ae49956d028910e7f6ee690`: early ABCD setup snapshot from 30 October, before later funding/allocation events. It retains many wallet fields but is not a verified current backup.
- Audit `6ae9b000af292bf5447ad8d9`: compact 3 November MCP setup summary with name/funding method/approval status; not a complete wallet document.

The database has general reporting/category/SEO snapshot collections; their presence does not establish a wallet backup. Atlas snapshots/PITR have **not** been verified because provider backup access was not available through this task. No restore, recreation or automated reconstruction was attempted.

### Remaining recovery requirements and limits

1. Obtain and verify the original wallet documents from a trusted export or Atlas backup/PITR point before deletion. Confirm exact `_id`, tenant, currency, ownership, funding metadata and lifecycle state; do not infer a complete wallet from a setup summary.
2. Prepare a separately approved recovery manifest for the original two IDs. Reconcile caches to the existing ledger rather than replaying funding or allocation transactions or copying setup-time zero balances.
3. Preserve users, manager assignments, departments, the two open campaigns/three recipients, ledger, audit and idempotency/notification history. Do not merge the Marketing entities or silently reparent historical records.
4. No wallet closure feature was added. Known existing setup statuses remain supported; a new active-only/period-expiry/funding lifecycle policy would require a separate business decision.
5. Application guards do not create MongoDB foreign-key constraints or prevent an administrator from making out-of-band raw database deletions. Restrict direct database writes and verify provider backups as separate approved operational work. The official deletion path and guarded ledger transactions now enforce the application-side checks.

Recovery remains blocked on verified backup material and explicit approval for any later data repair. The safeguards do not restore current spendability to the orphaned departments.
