# Send Points conversational outcome

Presentation-only update to the existing combined Send Points result. A short assistant paragraph appears above the unchanged detailed result card. It is derived synchronously from the persisted backend result, without appending or persisting another chat message. Rerenders and conversation reloads therefore render the same single paragraph per result.

## Exact application files changed

- `apps/web/src/features/copilot/CopilotConfirmationCard.tsx`: render the summary above completed results and recorded partial progress. Execution, confirmation, reconciliation, recovery and idempotency code are unchanged.
- `apps/web/src/features/copilot/sendPointsOutcomeMessage.ts`: pure formatting of recorded units, recipient count, verified debit and funding name; separate acknowledged, scheduled, self-share, pending, unresolved, processing and review-required wording. Unknown invitation states remain unverified.
- `apps/web/src/features/copilot/copilot.css`: give the paragraph the full results-grid width.
- `apps/web/src/features/copilot/CopilotSendPointsOutcome.test.tsx`: 20 focused frontend cases, including card order, multiple recipients, Credits conversion, invitation states, stale preview avoidance, partial progress and persisted-artifact reload without writes or duplicate summaries.

Recipient names are absent from the current authoritative completed result, so the paragraph uses the recorded recipient count. It never borrows names or financial values from PREPARE, the request, or artifact prose. A debit is stated only when the result explicitly verifies a debit and contains a finite positive INR amount. Invitation acknowledgement is explicitly distinct from guaranteed mailbox delivery.

## Verification

- Final Copilot regression run: **176 passed, 0 failed, 0 pending**, including all 20 new focused tests. Actual assertion counts and statuses match JSON totals (`copilot-final.json`).
- Initial focused run: 31 passed; the final Copilot run also covers the subsequently added processing case.
- Broader frontend run: 611 passed, 1 failed, 0 pending (`web-final.json`). The unrelated `SeoGrowthPage.test.tsx` test expecting an `Approve current version` button fails; it also fails in isolation (`seo-recheck.json`). Its page and tests are unchanged. The final Copilot run covers the final presentation changes made after the broad run.
- Typecheck: 26 diagnostics, with the exact same file/code/message set as `../one-confirmation/typecheck.txt`; no new diagnostics.
- Diff whitespace check passed. Of 116 previously dirty app files snapshotted for this task, 114 are byte-for-byte unchanged; only the intended component and stylesheet changed. Two application files are new. See `before.json` and `verification-summary.json`.

No backend, MCP, financial or delivery implementation changed. No real sends, wallet deductions, deployment, commits, pushes or remote changes were performed.
