# Copilot allocation confirmation workflow fix

Verified locally on 11 November 2026. All financial test effects occurred only in the test runner's isolated in-memory MongoDB replica set. No real allocations, shared staging financial data changes, deployments, commits, pushes, or Git remote changes were performed. Existing working-tree changes were preserved.

## Root cause and traced path

1. `budget_prepare_allocation` runs `prepareBudgetAllocationForCaller`, creating an MCP confirmation whose operation is correctly `wallets.allocate`.
2. `copilotMcpCatalog.js` already distinguishes `mcpOperation: wallets.allocate` from the canonical HTTP `workflow: budget.allocate`.
3. `prepareTool` in `copilotToolBindings.js` ignored that catalog mapping and passed its MCP operation to `confirmationArtifact`. The artifact's `operation` consequently became `wallets.allocate`.
4. Copilot chat emitted this artifact in SSE and persisted it inside the assistant message. Conversation reload returned it unchanged.
5. `CopilotConfirmationCard` uses `artifact.operation` as the workflow for its title and every Execute, Cancel and Resolve request.
6. `/copilot/writes/:workflow/*` looks up the workflow in `COPILOT_WRITE_WORKFLOWS`, which correctly registers `budget.allocate`. Therefore `wallets.allocate` was unknown.

The mismatch was between the MCP operation namespace and the Copilot workflow namespace. The MCP confirmation operation itself was not wrong and remains unchanged.

## Exact changes

- `apps/api/src/modules/copilot/copilotToolBindings.js`: PREPARE results expose the catalog's workflow, and confirmation artifacts obtain their executable identifier from `catalogByName(toolName).workflow`. This uses the existing canonical mapping for every PREPARE tool, rather than introducing aliases or scattered allocation replacements. A registry regression checks every catalog PREPARE artifact against the registered workflow and underlying MCP operation.
- The same module provides safe reload serialization: pending confirmations with unregistered identifiers become failed/non-executable, with a message requesting a fresh PREPARE. The serializer never upgrades a legacy operation into a workflow or alters financial state. `copilot.controller.js` applies it to conversation artifacts.
- `copilotWrites.service.js`: Execute rejects a confirmation that has a saved artifact with a different workflow, even if a caller manually substitutes the canonical route. The check is scoped to tenant, actor, confirmation, and the same nested artifact. No alias route was added.
- `budgetsWrite.js`: allocation previews now include the source wallet's trusted name, obtained from the existing ledger-backed wallet view. The output schema includes `walletName`. Department names, signed amounts, currency, net change, wallet availability, and department before/after allocated/unspent figures continue to come from the authorized backend preview.
- `CopilotConfirmationCard.tsx`: allocation cards render those preview fields explicitly, without falling back to request fields or assistant text for financial figures. Existing card structure and other workflows remain intact. An immediate ref lock prevents overlapping Confirm/Cancel clicks before React's busy state renders.
- `mcpWriteSafety.js`: added a read-only completion lookup that reauthorizes the actor and finds a completed idempotency record by the existing tenant/actor/operation/confirmation/payload fingerprint. It never reserves, reconciles, retries, or executes.
- `budgetsWrite.js` and the `budget.allocate` registry entry: allocation Resolve uses that read-only lookup. A consumed confirmation with no proven completion remains `consumed`; it cannot trigger a write during reload. Completed allocations can be recovered even when the reload supplies a different idempotency key.
- Generic Resolve reports expired pending confirmations as `expired`; the card disables expired/consumed previews and explains that status should be checked before preparing again. API types include this status and the failure message.
- Cancel uses an atomic pending-to-rejected update, so a concurrent Confirm cannot be overwritten with a false cancellation. Duplicate cancellation remains safe.

The actual allocation handler, MCP operation, signed-delta semantics, affordability checks, resource and payload hashes, ledger idempotency, role restrictions, and tenant/actor scoping were retained. Existing protection against executing a consumed confirmation with a fresh key was not relaxed.

## Regression evidence

Final focused API run: **30/30 passed** across:

- `copilot-budget-confirmation.test.js` — 10 new cases covering actual tool PREPARE and trusted preview, repeat Cancel, duplicate concurrent Confirm, completed read-only recovery, consumed recovery without Execute, Cancel/Confirm race, expired and stale state, mocked-provider chat SSE plus conversation reload, legacy artifact rejection including route substitution, and tenant/actor/RBAC isolation.
- `mcp-budget-allocation-write.test.js` — existing MCP budget regressions.
- `copilot-writes-registry.test.js` — existing registry tests plus the mapping regression for every PREPARE tool.
- `copilot-writes-domains.test.js` — existing domain WRITE regressions.

Frontend: **17/17 passed** across confirmation card, store-create confirmation, and store UX tests. Allocation cases cover trusted figures, canonical Cancel/Confirm/Resolve, duplicate clicks, persistence/reload, completed recovery without Execute, legacy failure rendering, and expired/consumed status handling.

Machine-readable reports:

- `budget-confirmation-focused-api-tests.json`
- `budget-confirmation-web-tests.json`

`git diff --check` passed for the changed files.

## Broader checks and remaining limitations

A broader eight-file API run including `mcp-write-safety.test.js`, `copilot-store-create.test.js`, `copilot-store-update-publish.test.js`, and `copilot-store-catalog-ux.test.js` passed **54/57** tests. The three failures expect a consumed confirmation to be accepted with a new idempotency key:

1. `MCP write safety foundation > executes once, replays the same key, and rejects a reused confirmation` (its later new-key reconciliation assertion).
2. `successful update remount with a new idempotency key reconciles without rewriting`.
3. `company admin can prepare/execute catalog show and remount reconcile`.

These assertions conflict with the pre-existing uncommitted safety change in `executeMcpWrite`, which only permits that reconciliation when the key already exists and rejects a fresh key with `CONFIRMATION_REUSED`. That condition was present before this task and was preserved. The new read-only helper does not alter that Execute path. The full broader run is recorded in `budget-confirmation-api-tests.json`; this report does not claim that run was fully green.

Web `tsc --noEmit` reports errors in untouched kit, swag, service and Vite files, including missing `UiProduct.price`, map key types, duplicate API-bridge identifiers and server timeout types. It reported no errors in the changed Copilot files. Those unrelated errors were not changed.

Legacy invalid artifacts intentionally require a fresh PREPARE; they are not migrated into executable confirmations. No live financial smoke test was run, in accordance with the request. Allocation behavior was exercised through the actual local API and ledger services only against isolated synthetic test data; the Claude response in the chat persistence regression was mocked.
