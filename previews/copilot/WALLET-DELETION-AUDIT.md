# Wallet deletion and department consistency audit

Read-only inspection completed on **11 November 2026, 15:22?15:24 IST**. Database: **shelfmerch_test**, reached through the local API configuration but hosted on MongoDB Atlas. Target tenant: **husain**, ID `6ab6449e0df63061043c930f`. Other tenants were not included in this cleanup assessment.

Only native-driver reads were used (find, aggregate, counts, collection/index inspection). Application startup and HTTP read handlers were deliberately avoided because some run index synchronization, cache repairs or manager-link synchronization. No database records, application/business logic, Git configuration or deployment configuration were changed. Local report files are the only artifacts written.

## Findings and exact affected records

**Two wallet parents are absent, not merely soft-deleted. All four active departments are orphaned. No department in this tenant is linked to another existing wallet.** The two wallet IDs were checked against the raw wallets collection, including deleted records and other tenant ownership; neither exists. Wallet setup audit entries prove both IDs previously existed.

- `6ae49954d028910e7f6ee68f`: historical name **ABCD**. One Marketing department. Two ledger entries; net cash **100,000**, outstanding allocation **500**.
- `6ae9affeaf292bf5447ad8d8`: historical name **MCP QA Budget Test**. Marketing, Sales and Engineering. Nine ledger entries; net cash **698,500**, outstanding allocation **26,600**.

| Department | Entity ID | Missing wallet ID | Cached allocated | Cached spent | Remaining |
| --- | --- | --- | ---: | ---: | ---: |
| Marketing | `6ae87442e3da4ced9c7b7019` | `6ae49954d028910e7f6ee68f` | 500 | 0 | 500 |
| Marketing | `6ae9beb02abda3a9c9aa9399` | `6ae9affeaf292bf5447ad8d8` | 7,100 | 500 | 6,600 |
| Sales | `6ae9d908e6ce5ead376a5283` | `6ae9affeaf292bf5447ad8d8` | 10,000 | 0 | 10,000 |
| Engineering | `6ae9d90de6ce5ead376a5287` | `6ae9affeaf292bf5447ad8d8` | 10,000 | 0 | 10,000 |

The cached department amounts agree with the surviving allocation/spend ledger for every entity. Total gross allocation is **27,600**, department-tied spend **500**, and remaining earmarks **27,100**. Net cash across the two missing parents is **798,500**. These are historical amounts reconstructed from ledger rows, not available balances from an existing wallet. The first wallet's audit snapshot explicitly records INR; the second was created through the INR-only MCP wallet setup path, although its compact audit snapshot does not itself retain currency.

The two Marketing records have **different wallet IDs, entity IDs and manager accounts**. They are not a same-wallet duplicate. Entity names have no uniqueness constraint in either the model or actual collection indexes. MCP's logical claim deduplicates by wallet ID plus normalized department name; it does not impose tenant-wide department-name uniqueness. Do not merge or delete a Marketing record based on its name alone.

### Entity-manager access

Four affected role assignments remain, each scoped to exactly one orphaned entity:

| Role assignment ID | User ID ? preserve account | scopeId / sole assignedEntityId | Role |
| --- | --- | --- | --- |
| `6ae87443e3da4ced9c7b701b` | `6ae87443e3da4ced9c7b701a` | `6ae87442e3da4ced9c7b7019` | entity_manager |
| `6ae9beb12abda3a9c9aa939b` | `6ae9beb12abda3a9c9aa939a` | `6ae9beb02abda3a9c9aa9399` | entity_manager |
| `6ae9d909e6ce5ead376a5285` | `6ae9d909e6ce5ead376a5284` | `6ae9d908e6ce5ead376a5283` | entity_manager |
| `6ae9d90ee6ce5ead376a5289` | `6ae9d90ee6ce5ead376a5288` | `6ae9d90de6ce5ead376a5287` | entity_manager |

All four manager User documents still exist and are not soft-deleted. The manager for Marketing entity `6ae9beb02abda3a9c9aa9399` is active; the other three accounts are invited. No user account needs deletion. Manager access is represented by both Entity.managerUserId and RoleAssignment.scopeId/assignedEntityIds. The synchronization helper adds managed IDs and does not automatically remove orphan links when a wallet disappears.

### Ledger: 11 records to preserve

Allocations are stored in WalletTransaction, not a separate allocation collection: **3 fund_in**, **6 allocation_to_entity**, and **2 campaign_spend** entries. Funding sums to **800,000**; cash spend sums to **1,500**. Of that spend, **500** is tied to a department and **1,000** has no relatedEntityId, so only 500 releases a department earmark under the existing ledger semantics.

| Transaction ID | Wallet ID | Type | Signed amount | relatedEntityId |
| --- | --- | --- | ---: | --- |
| `6ae49972d028910e7f6ee697` | `6ae49954d028910e7f6ee68f` | fund_in | 1,00,000 | none |
| `6ae87448e3da4ced9c7b701c` | `6ae49954d028910e7f6ee68f` | allocation_to_entity | 500 | `6ae87442e3da4ced9c7b7019` |
| `6ae9b0a1af292bf5447ad8e3` | `6ae9affeaf292bf5447ad8d8` | fund_in | 5,00,000 | none |
| `6ae9beb62abda3a9c9aa939c` | `6ae9affeaf292bf5447ad8d8` | allocation_to_entity | 5,000 | `6ae9beb02abda3a9c9aa9399` |
| `6ae9d77de6ce5ead376a5263` | `6ae9affeaf292bf5447ad8d8` | allocation_to_entity | 2,000 | `6ae9beb02abda3a9c9aa9399` |
| `6ae9d913e6ce5ead376a528a` | `6ae9affeaf292bf5447ad8d8` | allocation_to_entity | 10,000 | `6ae9d908e6ce5ead376a5283` |
| `6ae9d913e6ce5ead376a528b` | `6ae9affeaf292bf5447ad8d8` | allocation_to_entity | 10,000 | `6ae9d90de6ce5ead376a5287` |
| `6aeb01d7fbe611a1583a3035` | `6ae9affeaf292bf5447ad8d8` | fund_in | 2,00,000 | none |
| `6aec52dd60c03788532a1c0d` | `6ae9affeaf292bf5447ad8d8` | campaign_spend | -1,000 | none |
| `6aec5d8360c03788532a1c5b` | `6ae9affeaf292bf5447ad8d8` | campaign_spend | -500 | `6ae9beb02abda3a9c9aa9399` |
| `6af42bd6e4f7696b7b53b37d` | `6ae9affeaf292bf5447ad8d8` | allocation_to_entity | 100 | `6ae9beb02abda3a9c9aa9399` |

### Additional linked records

- **campaigns: 2** ? `6aec510260c03788532a1bfd`, `6aec5cc960c03788532a1c4d`.
- **mcpentityclaims: 4** ? `6ae87441e3da4ced9c7b7018`, `6ae9beaf2abda3a9c9aa9398`, `6ae9d908e6ce5ead376a5282`, `6ae9d90de6ce5ead376a5286`.
- **mcpwalletclaims: 1** ? `6ae9affdaf292bf5447ad8d7`.
- **mcpwalletdocumenttickets: 0**.
- **budgetallocationnotices: 6** ? `6ae87449e3da4ced9c7b701d`, `6ae9beb72abda3a9c9aa939d`, `6ae9d77ee6ce5ead376a5264`, `6ae9d914e6ce5ead376a528c`, `6ae9d914e6ce5ead376a528d`, `6af42bd7e4f7696b7b53b37e`.
- **auditlogs: 8** ? `6ae49956d028910e7f6ee690`, `6ae87449e3da4ced9c7b701e`, `6ae9b000af292bf5447ad8d9`, `6ae9beb82abda3a9c9aa939e`, `6ae9d77ee6ce5ead376a5265`, `6ae9d915e6ce5ead376a528e`, `6aeb01abfbe611a1583a3031`, `6af42bd7e4f7696b7b53b37f`.
- **copilotconversations: 2** ? `6af4274096751fceb2ceb5be`, `6af42b61e4f7696b7b53b366`.
- **orders: 0**.
- **recipients: 3** ? `6aec5103bb26d9511103f951`, `6aec5103bb26d9511103f952`, `6aec5cc9bb26d9511103fa8b`.
- **payments: 0**.

Both campaigns (`6aec510260c03788532a1bfd`, `6aec5cc960c03788532a1c4d`) have status **redemption_open** and reference Marketing entity `6ae9beb02abda3a9c9aa9399`. They have three recipient records, and no linked orders were found. The zero payment count refers only to Payment.relatedId matches to these two wallets or two campaigns, not a database-wide claim.

The **8 auditlogs** above are direct wallet/entity ID references found by the inspected predicates; this is not a claim that they exhaust all related business or MCP audit history. Preserve the entire audit trail. The six allocation-notice records are notification deduplication history and should also be preserved.

The tenant additionally has **14** setup/allocation/top-up confirmations: **6** still marked pending, all already expired at inspection. Their operation and hashed payload do not alone establish which wallet they target, so they are listed separately in the JSON evidence and are **not** classified as proven wallet-specific orphans. Do not bulk-delete confirmation or idempotency history.

## Actual schemas and consistency constraints

- **Wallet:** tenant-scoped, soft-deletable; currency INR/USD; cached totalAmount/balance/allocatedAmount; funding metadata, validity and setup status. No database foreign-key enforcement or cascade deletion.
- **Entity/Department:** requires walletId and tenantId; soft-deletable; cached allocatedAmount/spentAmount; manager user pointer plus invitation metadata. Wallet refs are Mongoose references, not enforced relational foreign keys.
- **RoleAssignment:** tenant/user role and scopeType; scopeId plus assignedEntityIds. No automatic cascade from Wallet or Entity deletion.
- **User:** separate account lifecycle and soft deletion. Removing a budget is not a reason to delete the manager's identity.
- **WalletTransaction:** required walletId, type, signed amount, cash balanceAfter, optional relatedEntityId and actor/idempotency fields. Append-only at the Mongoose layer; update/delete hooks reject mutation. Native/manual database edits can bypass application enforcement.
- **BudgetAllocationNotice:** tenant-scoped transactionId with unique tenant/transaction pair; not the allocation balance itself.
- **MCP claims:** wallet and entity pointers used for logical creation deduplication. Four entity claims and one wallet claim point into the affected graph.
- **Campaign:** requires entityId; orders and recipients reference campaigns. This graph must be considered before any test-data retirement.

Primary source files: apps/api/src/modules/wallets/wallet.model.js, walletTransaction.model.js, budgetAllocationNotice.model.js; modules/entities/entity.model.js; modules/roles/roleAssignment.model.js; modules/mcp/mcpEntityClaim.model.js and mcpWalletClaim.model.js; services/ledger.service.js.

## Why dashboard and Copilot disagree

1. Dashboard/Home determines onboarding from `wallets.length === 0` (HomePage.tsx and DashboardPage.tsx). The wallet HTTP service lists existing non-deleted Wallet documents. With zero wallets, the setup screen is consistent with that query.
2. MCP `wallet_list_balances` calls the read-only wallet list, which also queries existing Wallet documents. Here it returns **an empty item list**, not an actual wallet record with zero cash. The zero shown by Copilot must not be interpreted as a surviving wallet's authoritative financial balance.
3. MCP `entities_list` filters Entity by tenant and optional wallet ID, then looks up wallet names separately. It **does not exclude entities whose wallet lookup fails**; those entities are returned with an empty walletName and their cached budgets.
4. Copilot serializes those results into department-budget artifacts. Its wallet reconciliation only runs when an actual wallet artifact is present; an empty wallet list cannot reconcile the orphan department totals.
5. Dashboard department service similarly does not require a successful wallet join when listing entities. Its read path may repair valid wallet caches and backfill manager links, so it was not called for this no-mutation audit.
6. Transactions endpoints require an existing wallet first; the surviving ledger for a missing wallet may therefore be inaccessible through ordinary wallet APIs even though the rows still exist.

Relevant paths: modules/mcp/entitiesRead.js:listDepartments; modules/mcp/walletsRead.js:listBalancesForCaller; modules/wallets/wallets.service.js:listWalletBalancesRead/listWallets/listWalletTransactionsRead; modules/entities/entities.service.js:listEntities; modules/copilot/copilotToolBindings.js; modules/copilot/copilotWalletReconcile.js.

## Official deletion and lifecycle

There is an official **DELETE /api/v1/wallets/:id**, routed to **deleteIncompleteWallet**. It is wizard rollback, not a funded-wallet closure operation. It requires all of:

- status is draft;
- repaired balance is zero;
- repaired allocatedAmount is zero;
- **no ledger transactions of any kind**.

It soft-deletes the wallet and records wallet.delete_incomplete. It does not cascade through departments or role assignments. removeOrphanDraft is another guarded draft-cleanup path, also checking no transactions. Neither path explicitly checks for linked zero-budget departments or manager assignments, leaving a possible orphan gap for empty drafts.

The declared lifecycle is draft ? wallet_created ? entities_added ? budget_allocated ? managers_assigned ? review_pending ? active. No wallet closed/archived lifecycle or general funded-wallet closure implementation was found.

**Wallet deletion should be blocked when allocations or transactions exist; the official path already implements that restriction.** Even a zero net balance with historical transactions is not eligible. Both missing wallets had ledger activity and outstanding allocations, so neither would qualify now. Their hard absence bypasses the intended lifecycle. A future closure design would additionally need checks for linked departments, manager access, open campaigns, funding/payment work and concurrent financial writes; no business changes were made here.

Entity deletion also normally refuses positive remaining budget. All four entities currently have positive remaining budget, so ordinary department deletion is not a safe cleanup shortcut.

## Proposed plan for approval ? no execution performed

**Recommended recovery:** restore referential integrity by recovering the two parent Wallet documents under their original IDs from a verified backup/export, rather than deleting financially referenced departments.

1. Confirm this tenant and the exact two wallet IDs are the intended test scope. Take a protected, restorable backup of the affected graph before any later write; the current sanitized audit file is not a full backup. Keep unrelated tenants untouched.
2. Locate the original wallet records in a backup. The retained wallet.setup snapshots establish names, IDs and some original fields, but are not complete current wallet backups. The older snapshot's zero balances are from setup, before subsequent ledger events. Do not copy those zeros into a restored funded wallet, guess status/funding metadata, or create replacement wallets under new IDs.
3. Prepare a reviewed restore manifest for the exact two original IDs. Reconcile cached financial figures to the surviving append-only ledger: 100,000 cash / 500 outstanding for the first; 698,500 cash / 26,600 outstanding for the second. Any cache repair would be a separately approved write, with no new funding/allocation transactions generated to reproduce existing history.
4. Preserve all four Entity records, all four manager User accounts and RoleAssignments, all 11 ledger rows, 8 identified direct audit rows plus other audit history, 6 allocation notices, 4 entity claims, 1 wallet claim, both campaigns and all 3 recipients. Restoring the correct parents resolves the dangling links without rewriting these histories. Keep the two Marketing departments distinct because they belong to separate original wallets.
5. Review the two redemption_open campaigns before any later retirement or budget reset. If the goal is a blank test setup, prefer a fresh isolated test tenant/database while retaining this historical graph. Do not bulk-delete or soft-delete these funded entities to force the onboarding screen; do not silently reparent them or their ledger entries to a new wallet.
6. After approved recovery, verify tenant/wallet joins, manager scope, unchanged ledger/audit counts and ledger sums, and dashboard/MCP consistency. These verification steps should use non-mutating reads unless a specific cache repair has been approved.

If no verified wallet backup can be found, stop before restoring financial parents. A reviewed reconstruction would need explicit decisions for missing metadata and lifecycle state; the audit snapshots alone are insufficient for an automatic full restore. Cleanup remains pending approval; no executable cleanup or financial mutation was run.

Complete sanitized document IDs and counts are retained in **wallet-deletion-audit-evidence.json**. Reads were made over a short interval rather than an atomic snapshot, so recheck the affected IDs/counts immediately before any future approved write.
