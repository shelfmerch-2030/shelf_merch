# One-confirmation Send Points: architecture preflight

**Decision: do not implement the combined workflow yet.** The current services do not provide sufficient recovery proofs for the requested composition. Two isolated fault-injection diagnostics reproduced concrete blockers. Application code, UI, tools, confirmation security and the Send Points feature flag were not changed in this inspection.

Observed local configuration: `EMBEDDED_COPILOT_WRITE_SEND_POINTS=true`. This audit did not enable or disable it; the existing staged workflow remains in place.

## Existing architecture

- Dashboard `launchPointsCampaignApi` in `apps/web/src/services/mutations-api.ts` sequences separate campaign creation/update, recipient import, allocation and launch HTTP calls. It is a browser-side sequence, not a durable backend operation.
- MCP/Copilot wrap the shared `savePointsDraft`, `allocateCredits` and `launchCampaign` services in separate PREPARE/EXECUTE workflows. Each has an independent confirmation and idempotency receipt.
- Launch already uses a per-campaign spend key (`campaign_spend:<campaignId>`), launch leases and recipient invitation claims. These are useful protections and should remain unchanged.
- Current Copilot outcome persistence records a successful handler return as `completed`; exceptions become failed/expired outcomes. There is no combined operation journal linking one confirmation to a stable campaign identity and verified stage receipts.

## Reproduced blockers

| Blocker | Evidence | Consequence for a combined send |
| --- | --- | --- |
| Draft recovery can falsely prove completion | Injected a transient failure during the second of two recipient upserts. One campaign and one recipient remained. Retrying the original draft key returned a result and changed the MCP idempotency receipt to `completed`, although the second confirmed recipient was still missing. | An orchestrator trusting that result could allocate and launch for an incomplete recipient manifest. A completion receipt alone is insufficient proof here. |
| An absent failed allocation cannot resume with its existing key | Injected a failure at recipient credit stamping. Campaign stayed `recipients_uploaded`; no campaign debit existed. Both allocation receipts were failed. Retrying the same MCP key returned the original failure without executing again. | Chaining the current EXECUTE handlers does not provide resumable progress between stages. Replacing keys, clearing failed receipts or bypassing confirmations would not be an acceptable fix. |

The draft problem follows from `matchingDraft` matching tenant/entity/store/normalized name and incomplete status, while the recovery callback treats any such match as completed. It does not verify the full confirmed recipient list, amounts and delivery settings. `savePointsDraft` saves campaign and recipient records across separate writes, so a partial state is possible.

Relevant source locations:

- `apps/api/src/modules/mcp/campaignsDraftWrite.js`: `matchingDraft`, `saveLinkedDraft`, `executePointsDraft` reconciliation.
- `apps/api/src/modules/campaigns/campaigns.service.js`: `savePointsDraft`, `upsertRecipientsFromList`.
- `apps/api/src/modules/mcp/mcpWriteSafety.js`: `recoverFailed` returns a stored failure for an absent failed operation; it does not rerun it.
- `apps/api/src/modules/campaigns/campaignOperation.js`: an existing failed operation key remains failed.

These diagnostics characterize current behavior; they are **not acceptance tests endorsing it**.

## Additional recovery requirements

1. **Stable creation identity.** The existing draft claim is keyed by tenant and a logical name/store/funding anchor. It is not a combined-send intent receipt bound to one actor and an exact manifest. A new send must not accidentally adopt another same-name draft or create a duplicate after losing a response.
2. **Authoritative partial state.** A result such as `draft_saved` or `debit_recorded_delivery_unverified` cannot be passed through the generic success path and described as the entire send being completed. Progress must survive process failure and conversation reload.
3. **Invitation uncertainty.** The existing service claims delivery before calling notification delivery. If delivery becomes uncertain, it intentionally avoids resending and reports unresolved invitations. A combined operation must preserve that behavior and never equate wallet debit or launch completion with all invitations being sent. This does not require rewriting invitation delivery; it requires truthful progress/recovery handling around it.

## Smallest safe design, after prerequisites

This is a proposal, not implemented code.

### One approved intent

Introduce a backend-owned combined Send Points operation under the existing feature gate, while retaining the three standalone workflows for explicitly requested staged management. Only its PREPARE tool is model-visible; execution remains an authenticated confirmation endpoint.

PREPARE resolves existing contacts, store, effective INR amount and displayed units, actual store/saved scope, delivery schedule and role-scoped funding through existing services. It asks only for missing or ambiguous required information. Bind the confirmation to:

- tenant, actor, authorization/funding scope and exact normalized recipient manifest;
- selected store and effective redemption scope;
- per-recipient INR amount, recipient count and total;
- wallet/department identity, eligibility and approved financial snapshot;
- delivery mode, UTC send time and timezone.

The final compact preview shows these verified facts and one **Confirm & Send Points** action. A conversational reply can never call execution or launch.

### Durable stage journal

Use one tenant/actor-scoped operation identity and canonical manifest hash, with a fenced execution lease, stable campaign linkage and stage receipts. Reserve/link the campaign identity durably as part of idempotent draft creation, rather than relying on name matching after a failure.

After explicit confirmation, invoke the existing business services in order. Revalidate authorization, wallet eligibility and the approved manifest at each relevant boundary. Prove each stage's actual result before advancing; checkpoint it durably. Recognize the operation's own changes rather than treating them as unrelated resource changes.

The missing prerequisite contracts are:

- exact-manifest verification for completed/partial draft recovery, including recipients and settings;
- a fenced, same-operation recovery path that can resume **proven absent** stage work without replacing keys or weakening existing safeguards;
- unambiguous campaign ownership by the combined intent, including the creation/receipt-write crash window.

Do not remove terminal-failure safeguards globally. Unknown or partially applied work must stop for review; it must not be retried speculatively.

### Honest outcomes and recovery

Persist actual phase, campaign ID, recorded debit and invitation evidence. Examples are `draft_saved`, `credits_allocated`, `launched`, `scheduled`, and `requires_review`; track delivery uncertainty separately from financial completion.

Extend conversation outcome presentation/context handling for the new workflow so a partial send is never rendered or supplied to Claude as completed or as a fresh pending send. Resolve remains read-only. If resumed financial work requires renewed approval after expiry or changed funding/recipients/settings, show a fresh preview linked to the same intent/campaign rather than creating another campaign.

Keep existing ledger keys, launch leases, invitation claims, redemption semantics and standalone management operations. Never perform frontend auto-confirmation, clear idempotency receipts or generate a new campaign as a recovery shortcut.

The normal success message can then be short and factual; scheduled or unresolved delivery must be named explicitly instead of saying all Points/invitations were sent.

## Validation and artifacts

- **2 fault-injection diagnostics passed**, reproducing the two gaps above: `send-points-orchestration-audit-results.json`.
- **54 existing staged safety/readiness/recovery regressions passed**: `send-points-orchestration-baseline-tests.json`. Passing the existing staged suites does not establish combined-operation safety.
- Diagnostic source: `previews/copilot/send-points-orchestration-audit.test.js`.
- Diagnostic config: `previews/copilot/vitest-send-points-orchestration-audit.config.mjs`. It inherits the API test transport stubs and isolated MongoMemoryReplSet setup. It is separate from normal application regression discovery.

No combined-flow acceptance suite, new tool, endpoint or UI action was implemented. The proposed implementation would need the requested single/multiple recipient, concurrent click, cancellation, all inter-stage failure windows, changed funding/permissions, scheduled delivery, expiry, replay and conversation-reload acceptance tests after the prerequisite contracts are resolved.

All records created during diagnostics/regressions were synthetic records in isolated in-memory databases. No live campaign, invitation or financial operation was executed. No existing records, application configuration or feature flags were changed. No deployment, commit, push or Git remote changes.
