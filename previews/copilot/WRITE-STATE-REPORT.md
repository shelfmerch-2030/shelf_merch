# Copilot WRITE confirmation state fix

## Root cause

The execution endpoint returned the successful business result without updating its conversation confirmation. The browser replaced its local card and separately attempted a best-effort artifact PATCH. That PATCH could fail or race with the next message. The old success-card builder also discarded confirmationId.

Even when the browser PATCH succeeded, both provider adapters serialized message text and tool calls/results, but omitted artifacts. Claude therefore saw the original PREPARE response and assistant instructions to click Confirm, without the successful execution result. This shared path affected store creation, wallet setup, department setup, allocation and other registered WRITE workflows.

The previous generic Resolve path also called the execution handler to attempt reconciliation. Recovery now reads existing proof exclusively.

## Changes

No publishing, financial, authorization or ledger handlers were changed for this task.

| File | Change |
| --- | --- |
| `apps/api/src/modules/copilot/copilotWriteState.service.js` (new) | Shared outcome reconciliation, tenant/actor/workflow-scoped persistence and provider-context projection. Atomic artifact updates preserve concurrently appended messages. |
| `apps/api/src/modules/copilot/copilotWrites.service.js` | Record successful/failed execution and explicit cancellation server-side. Resolve reads recorded outcomes without calling an execution handler. |
| `apps/api/src/modules/copilot/copilotChat.service.js` | Recover authoritative state on conversation load and before model context construction; supersede stale PREPARE results and associated pending assistant text; validate browser artifact persistence against backend proof. Reconcile again before saving a streamed turn. |
| `apps/api/src/modules/mcp/mcpWriteConfirmation.model.js` | Add optional `copilotOutcome` transport metadata; confirmation authorization/status semantics remain unchanged. |
| `apps/api/src/modules/mcp/mcpWriteSafety.js` | Add read-only outcome lookup using the existing confirmation's canonical payload hash and idempotency fingerprint. No change to execution/idempotency behavior for this task. |
| `apps/api/src/modules/copilot/copilotCurator.service.js` | Accept the reconciled model history for the existing bounded context. |
| `apps/api/src/modules/copilot/giftingAdvisor.service.js` | Accept the same reconciled model history for the existing bounded context. |
| `apps/web/src/features/copilot/CopilotConfirmationCard.tsx` | Retain confirmationId/completed status on success cards; distinguish failed, expired and consumed-but-unverified recovery. |
| `apps/web/src/features/copilot/api.ts` | Type completed success-card identity and failed Resolve status. |
| `apps/api/tests/copilot-write-state.test.js` (new) | 17 isolated outcome/context/recovery regressions. |
| `apps/api/tests/copilot-store-catalog-ux.test.js` | Recover through Resolve; reject client-supplied completion without proof. |
| `apps/api/tests/copilot-store-update-publish.test.js` | Verify remount recovery through Resolve without rewriting a store. |
| `apps/api/tests/mcp-write-safety.test.js` | Align an older reconciliation assertion with the existing consumed-confirmation rejection; ensure a reconciliation callback cannot permit execution with a new key. |
| `apps/web/src/features/copilot/CopilotConfirmationCard.test.tsx` | Check retained identity and distinct expired/consumed/failed recovery messages. |

Existing unrelated workspace changes were retained.

## State handling

- Completed: persist the exact backend-returned result in conversation artifacts and confirmation outcome metadata. Existing completed idempotency proof takes precedence. Claude receives the result, including store name, ID and `status: live`, in its next provider request. A same-key replay remains idempotent; a different key cannot execute a consumed confirmation.
- Cancelled: explicit server cancellation metadata, separate from generic safety rejection.
- Expired: disabled confirmation, with expiry communicated explicitly.
- Failed: no invented success or rollback; check authoritative state before preparing another change.
- Consumed without proof: disabled and reported as unverified; never recover by executing again.
- Missing confirmation: disable the card and communicate unavailable/unverified state.

Historical successful writes recover from existing idempotency records even when PREPARE applied defaults absent from the browser request. Older success cards missing confirmationId can be linked through saved PREPARE results and an unambiguous matching backend resource/workflow. Ambiguous legacy cards are not guessed.

Raw historical PREPARE text remains available in storage. The provider-context projection replaces its obsolete pending meaning with backend outcomes, preserving tool-call/result pairing. This is a state/context fix, not a system-prompt-only change.

## Verification

- New state regression suite: **17 passed**, mocked business callbacks and provider requests, isolated MongoMemoryReplSet.
- API regression selection: **158 passed** (`write-state-final-tests.json`). Includes store creation/update/publish/catalog, MCP write safety, budget allocation, Copilot budget confirmations, generic WRITE registry/domains, recovery, Anthropic adapter, currency guidance, gifting and curator regressions.
- Frontend confirmation/page/history suites: **31 passed** (`write-state-web-tests.json`).
- Store-followed-by-"okay" test inspects the actual mocked Claude request: exact backend result and Live state are present; stale "not created"/"Click Confirm" text is absent. No browser artifact PATCH is needed. Resolve and the next turn do not execute again.
- Also verified failure of conversation artifact persistence after successful execution, legacy proof recovery, cancellation, expiry, execution failure, consumed-without-proof, missing records, forged client completion, duplicate replay and tenant/actor isolation.
- `git diff --check` passed.
- Whole-web `tsc --noEmit` remains blocked by errors outside this change, including kit product types, the existing ShopLayoutTab test fixture, swag tests and Vite HTTP server typings. Exact diagnostics: `write-state-typecheck.txt`. No diagnostics reference the files changed for this fix.

## Limits and remaining risks

No live Claude request or live business WRITE was run. The original user's real store/history was not queried or modified; reproduction uses synthetic fixtures. Provider behavior is verified at its mocked request boundary, not by asserting that a nondeterministic live model can never contradict supplied evidence.

If business execution succeeds but subsequent conversation persistence fails, the HTTP request can report failure. Recovery reads existing durable idempotency proof and returns completion without another operation; this case has a regression test. If neither execution proof nor a server outcome exists, the system refuses to infer success or retry automatically.

No existing financial records, accounts, assignments or campaign history were changed. No deployment, commit, push or Git remote changes.
