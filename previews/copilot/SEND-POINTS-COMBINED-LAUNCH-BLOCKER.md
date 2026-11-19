# One-confirmation Send Points: launch safety blocker

Implementation stopped at the requested safety gate. No combined workflow, new MCP tool, UI change, application-code change or feature-flag change was made in this turn.

The updated draft proof and atomic allocation contracts were reinspected. They address the previous two defects. They do not establish a fenced, exact-manifest launch contract.

## Verified remaining defects 

Two isolated fault-injection diagnostics reproduce the current behavior through the real staged MCP `prepareLaunch` / `executeLaunch` path and shared launch/ledger services. All records are synthetic in MongoMemoryReplSet. `notify` is mocked; there is no real delivery or wallet operation.

### 1. Lost launch ownership does not stop side effects

`acquireCampaignLaunch` increments `launchLease.fence`, but returns only the owner. `launchCampaign` does not pass a required owner/fence to the financial side-effect boundary, and later campaign saves do not enforce that ownership. The heartbeat/release owner filters alone do not prevent a stale executor from continuing.

The diagnostic substitutes a successor owner and increments the fence immediately before `ledger.createTransaction` performs the campaign spend. The old executor still records one synthetic debit, advances the campaign and calls the mocked invitation service. This is a simulated lease-loss boundary, not a claim that two real production workers were run.

Relevant source: `apps/api/src/modules/campaigns/campaigns.service.js`, `acquireCampaignLaunch` (line 687), `launchCampaign` (line 1072), spend call (line 1189), campaign save (line 1210).

The existing per-campaign ledger idempotency key prevents repeating the same debit. It does not prove that an executor still owns the approved operation when it starts side effects. No claim of a duplicate debit is made by this diagnostic.

### 2. The confirmed recipient manifest is not enforced at invitation delivery

`sendCampaignInvites` loads the campaign's current recipients instead of receiving and enforcing a frozen, confirmed manifest. Its per-recipient claim prevents duplicate sending for that current row, but does not bind the row's identity to the original approved recipient. The standalone launch snapshot also omits the full recipient manifest.

The diagnostic changes a recipient name/email after MCP validation, at the spend boundary. Launch records the synthetic debit and calls the mocked invitation service for the replacement address, not the originally confirmed address. Recipient count and INR total remain unchanged.

Relevant source: `apps/api/src/modules/campaigns/campaigns.service.js`, `sendCampaignInvites` (line 741), current-recipient lookup (line 780); `apps/api/src/modules/mcp/campaignsSendWrite.js`, `launchSnapshot` and `executeLaunch`.

## Why composition alone is insufficient

An outer operation journal can record one intent, exact manifest and stage progress. It cannot make an already-running `launchCampaign` stop after losing ownership, or ensure that its later current-recipient lookup uses the approved identities. Checking a hash immediately before invoking launch leaves the demonstrated change window inside launch itself.

Stopping on an error is also insufficient here: the demonstrated calls return successful launch results after the side effects have happened. A generic retry wrapper or a new idempotency key would not repair the contract.

## Required launch contract before proceeding

- Bind a stable intent identity and exact approved manifest, campaign/store configuration, delivery settings and funding scope to launch execution.
- Enforce ownership/fencing at the irreversible financial boundary and subsequent campaign transitions; a stale executor must not continue side effects after takeover.
- Ensure shared campaign/recipient writers cannot retarget an approved launch while it is executing. Invitation claims must be bound to the confirmed recipient identities, using the existing notification mechanism and preserving its no-resend behavior for uncertain delivery.
- Preserve ledger spend keys, actor/tenant authorization, funding validation, scheduled delivery and existing redemption rules. Do not introduce a generic retry of uncertain invitation delivery.
- Add acceptance tests proving rejected stale executors and changed manifests, including recovery around debit, campaign persistence and invitation claims. The diagnostics in this report deliberately assert the unsafe current behavior and are not acceptance tests.

These are changes to the shared launch recovery contract. They were not implemented as an orchestration shortcut under the instruction to stop when a remaining recovery contract is insufficient.

## Evidence and files added

- `send-points-launch-boundary-audit.test.js`: two capability diagnostics.
- `vitest-send-points-launch-boundary.config.mjs`: inherits API test isolation, MongoMemoryReplSet setup and notification/storage credential stubs.
- `send-points-launch-boundary-results.json`: 2 passed, reproducing both unsafe behaviors.
- `send-points-launch-audit-prerequisite-recheck.json`: recheck of the 41 existing draft/allocation recovery regressions.
- This report.

Run the diagnostics from the workspace root:

```powershell
npx.cmd vitest run --config previews/copilot/vitest-send-points-launch-boundary.config.mjs --reporter=json --outputFile=previews/copilot/send-points-launch-boundary-results.json
```

The earlier 166-test result remains evidence for the earlier task, not proof that a combined workflow is safe. Only the 41-test recovery file was rerun during this audit; the full 166-test batch was not rerun.

## Local-testing readiness

The combined one-confirmation experience is **not implemented and not ready to enable**. Existing staged workflows and their configuration remain unchanged. There were no live database mutations, real campaigns, wallet deductions or invitations, deployment, commit, push or Git remote changes.
