# Final Swag Design conversational timeline

Implemented in the existing Copilot and verified in an actual local browser with isolated application data and a mocked AI provider. No live Claude behavior, customer publication or deployment is claimed.

## Root cause and replacement

The old page rendered persisted conversation messages followed by a separate persistent `SwagWorkflowPanel`. Button actions generally changed `conversation.swag` without adding a conversational acknowledgement. WRITE reconciliation replaced an approval artifact where it originally appeared, so a completed result could remain above newer activity. Internal tool-only assistant turns could render empty avatars. The resize observer watched the viewport rather than the transcript content.

The page now renders one chronological transcript. Small Products, Logo, Design and Stores components attach controls to persisted assistant events. There is no runtime Current Design panel or second selection state. The old panel module remains unused by CopilotPage to preserve its existing compatibility tests.

The supported journey is:

**Start → name acknowledgement → explicit browsing for an ordinary name → verified product cards → selection acknowledgement → logo request → uploaded-logo acknowledgement → Apply review → explicit Apply approval → persisted mockups → stores → one final publish approval → committed result.**

Requests that already contain merchandise preferences retain their context and can browse without a redundant question. Claude still interprets contextual references, category changes, budgets and ambiguous requests. The ordinary bare-start/name case gets a backend-confirmed acknowledgement even if the provider produces no prose; it does not display an unsolicited catalog result before the browsing choice.

## Persistence and ordering

- Existing actor-owned `conversation.swag` remains authoritative. No workflow database, new business service, MCP binding or financial operation was introduced.
- Existing messages gain a stable `uiEventId`; a small `swag_step` artifact binds an interaction to its conversation, revision, stage and optional presentation mode.
- UI configuration atomically appends an action turn and truthful assistant acknowledgement in the same revision-checked document update as the state change. A rejected mutation appends no success message.
- Catalog requests append the verified page below previous activity, preserve filters and selections, fence against a changed revision, and deduplicate concurrent/retried page handoffs.
- Swag user turns persist before asynchronous tools. A delayed response cannot move the earlier user turn below a later UI action. Response append is revision-fenced; obsolete recommendations are suppressed when choices changed.
- Completed Swag results append once using the confirmation ID. Earlier approvals become read-only completed history; their original proposed values remain expandable. The actual receipt is displayed once.
- Recovery reads authoritative receipts and reconstructs missing presentation metadata. It never calls PREPARE, EXECUTE, rendering, publishing or delivery. A late receipt retains newer choices and binds the bottom controls to the current revision.
- Reload merges canonical messages with stable identities; it does not regenerate prior prose or replay actions. Legacy conversations get one metadata-only compatibility interaction when necessary.

Only the latest eligible interaction exposes mutation controls. Older product sets are collapsed read-only history; duplicate pending approval presentations are suppressed. Another conversation or revision cannot activate an old step. Typed commands and buttons converge on the same backend state.

## Conversation and presentation

- Empty internal assistant turns are hidden in rendering; provider tool-call/result records remain intact. Streaming work still has a loading indicator.
- Names and searches use the bottom composer. Ordinary naming shows Show products and Search for something specific, without an unrelated form or Next control.
- Product cards use real returned identities/media/prices, GST labels, availability, polished Details access, Add/Added state and a proper secondary pagination button. Missing media retains the existing honest unavailable-image fallback; no fabricated production imagery is introduced.
- Selection summaries are small removable chips. Backend acknowledgement determines success.
- Logo upload reuses the existing + input. A restored source preview appears only when the composer is not already showing it.
- Apply to all/Choose products prepare the existing review; only its explicit approval executes. Subset and replacement choices retain their original backend safeguards.
- Successful automatic application shows persisted product-specific previews and Looks good/Edit placement/Change logo. Save/Reload is not a mandatory step in this path.
- Save for Later appends a compact draft result and Continue designing. Resume uses metadata only. Unsupported or precise placement remains in the existing designer; advanced saved-design review remains available.
- Store options remain authorized and support multiple choices. Natural exact-name selection can prepare the final verified approval; button-based multiple selection uses Review publication.
- Save/Apply/Publish cards remain compact, with draft visibility, unsupported-target and replacement warnings visible and receipt details expandable. Draft-store results link to management and do not claim the store is publicly live.

## Scrolling, focus and mobile

The existing composer and Latest message control remain in place. Auto-scroll follows actual transcript resizing while near the bottom, including delayed image height changes. Reading older history preserves the scroll position. Acknowledgements do not forcibly reset the user’s near-bottom preference. Product-selection keyboard focus follows the acknowledged current interaction without scrolling the viewport; Space and subsequent Tab were exercised in Edge.

Desktop verification used 1440px width and mobile verification 390px width. Product cards use responsive columns and native controls; there is no nested wizard scroll container or horizontal page overflow. Native operating-system mobile keyboard behavior and screen-reader testing remain manual checks; the browser run was headless Edge, not a physical mobile device.

## Verification

**704 passed, 0 failed, 0 pending across 61 distinct test files.** This preserves the previous 670-test inventory and adds 34 focused tests. Repeated runs are not double-counted.

| Final group | Passed |
|---|---:|
| Frontend Copilot/Swag/related regression files | 334 |
| Swag workflow/chat/interactive/response formatting | 81 |
| Artwork/renderer acceptance | 31 |
| Actual browser workflows | 2 |
| Mockup consistency | 6 |
| Catalog | 37 |
| Collection/dashboard/publishing/discovery | 48 |
| Copilot WRITE-state | 17 |
| Attachments | 8 |
| Copilot reads | 4 |
| Copilot write domains | 9 |
| Provider adapter | 20 |
| Financial/ledger/Send Points/integrity | 84 |
| Redemption | 23 |

New focused coverage includes truthful naming before browsing, preference retention, empty-row suppression, concurrent UI state changes, catalog deduplication/staleness, failed mutations, fabricated-event rejection, legacy reload compatibility, delayed model response ordering, late receipt recovery with newer choices, current-revision controls, conversation isolation, duplicate pending review projection, no hydration execution, subset/replacement review, saved draft resume and genuine media/price/detail routing.

The actual browser exercised name → browse → natural selection → remove/re-add by keyboard → pagination → reload → upload → Apply → saved mockups → Save for Later → reload/resume → named store → final publication. Duplicate Apply/Publish clicks produced one execution each. The explicit Save was a third execution. Exactly one collection/listing remained, and the store stayed draft. The skip-logo browser and two-version image-consistency fixture also passed.

TypeScript still reports the same **26 pre-existing diagnostics, zero new diagnostics**. Diff whitespace checks pass. `verification.json` checks complete assertion inventories, distinct test files, source preservation, untouched Swag approval/execution code, unchanged renderer bundle/source hashes and browser evidence.

Some Windows/Node test workers exited natively, sometimes before a final report or before all tests completed. Those attempts were not counted as passing. Only interrupted files were rerun where possible. The dashboard aggregate combines six completed files (45 assertions) with its independently rerun visibility file (3 assertions). The acceptance aggregate combines three completed files (63 assertions) with the independently rerun interactive file (18 assertions). The aggregate scripts retain source reports and validate exact test names and every assertion; no failed assertion was discarded. Failed/partial attempt artifacts remain available separately. The isolated interactive rerun required permission outside the restrictive command sandbox; no Windows security policy or browser sandbox was disabled.

## Browser checkpoints and observations

These are actual Edge screenshots of the existing UI and real application controllers/services, MongoMemoryReplSet, multipart upload, local storage and API-owned renderer. AI responses, product data and raster inputs were synthetic fixtures. This proves the UI integration and persisted outcomes, not live Claude recommendation quality or real customer asset appearance.

| Checkpoint | Screenshot |
|---|---|
| Start | [01-start.png](browser/01-start.png) |
| Name question | [02-name-question.png](browser/02-name-question.png) |
| Name acknowledged before browsing | [03-name-acknowledged.png](browser/03-name-acknowledged.png) |
| Recommendations | [04-products.png](browser/04-products.png) |
| Products added | [05-products-added.png](browser/05-products-added.png) |
| Upload request | [06-upload-prompt.png](browser/06-upload-prompt.png) |
| Logo received | [07-logo-received.png](browser/07-logo-received.png) |
| Apply approval | [08-apply-approval.png](browser/08-apply-approval.png) |
| Persisted mockups | [09-saved-mockups.png](browser/09-saved-mockups.png) |
| Store choices | [10-stores.png](browser/10-stores.png) |
| Publish approval | [11-publish-approval.png](browser/11-publish-approval.png) |
| Committed publication | [12-published.png](browser/12-published.png) |
| Save for Later | [13-saved-for-later.png](browser/13-saved-for-later.png) |
| Resume after reload | [14-resumed.png](browser/14-resumed.png) |
| Mobile conversation | [15-mobile-conversation.png](browser/15-mobile-conversation.png) |
| Mobile product cards | [products-mobile.png](browser/products-mobile.png) |

Visual inspection confirmed chronological downward progression, assistant-associated controls, no persistent panel or blank assistant rows, current controls at the newest interaction, an accessible composer, compact desktop/mobile cards and visible decision warnings. Browser assertions also cover read-only older controls, scroll preservation through image resize, Latest message navigation, source-preview uniqueness and no horizontal overflow.

## Exact application files changed

New:

- `apps/api/src/modules/copilot/swagTimeline.js` — metadata-only timeline formatting and idempotent receipt handoff.
- `apps/web/src/features/copilot/swagTimeline.ts` — immutable presentation projection, current-step binding and duplicate-review suppression.
- `apps/web/src/features/copilot/SwagStepMessage.tsx` — small contextual message components.
- `apps/web/src/features/copilot/CopilotSwagTimeline.test.tsx` — focused timeline/control regressions.

Modified:

- `apps/api/src/modules/copilot/copilotConversation.model.js`
- `apps/api/src/modules/copilot/copilot.controller.js`
- `apps/api/src/modules/copilot/copilot.routes.js`
- `apps/api/src/modules/copilot/copilotChat.service.js`
- `apps/api/src/modules/copilot/copilotWriteState.service.js`
- `apps/api/src/modules/copilot/swagDesignWorkflow.js` — instructions and conversation configuration/browsing only; planning, approval and execution implementation unchanged.
- `apps/web/src/features/copilot/CopilotPage.tsx`
- `apps/web/src/features/copilot/CopilotProductCards.tsx`
- `apps/web/src/features/copilot/CopilotConfirmationCard.tsx`
- `apps/web/src/features/copilot/api.ts`
- `apps/web/src/features/copilot/swagApi.ts`
- `apps/web/src/features/copilot/copilot.css`
- `apps/web/src/features/copilot/CopilotSwagInteractive.test.tsx`
- `apps/api/tests/copilot-swag-chat.test.js`
- `apps/api/tests/copilot-swag-interactive.test.js`
- `apps/api/tests/copilot-swag-design.test.js`
- `apps/api/tests/copilot-swag-artwork.browser-check.js`
- `apps/api/tests/copilot-swag.browser-check.js`

That is **18 modified files and 4 new application/test files**. The task-start snapshot contains 2,504 application files; **2,486 remain byte-for-byte unchanged**. All earlier uncommitted work outside this focused set is preserved. Renderer, placement geometry, source assets, collection/publishing transactions, financial implementations and public MCP contracts were not rewritten. Evidence and runners are under `previews/copilot/swag-timeline/`.

## Remaining limitations and local testing

- Live Claude phrasing, relevance and ambiguous-language quality were not tested against the real provider. Test them manually using the existing local provider setup.
- Synthetic image/data fixtures do not prove real catalog photography or customer artwork appearance. No placeholder product asset was introduced into production code.
- Precise logo placement remains in the existing visual designer. This task does not alter its geometry or renderer infrastructure requirements.
- Physical mobile keyboard, assistive technology and production/container verification remain outside the browser evidence. Existing TypeScript errors and intermittent local native test-worker exits remain documented limitations.

For manual testing, use a disposable local database and test workspace with the existing configured renderer; keep any final publication confined to those fixtures:

1. Open `/ai-test/copilot`, type `I want to design swag`, then `Team Swag`. Check the acknowledgement and browse choice without product cards appearing prematurely.
2. Click Show products or type Yes. Add/remove by card and by natural language, browse more and change category. Verify the newest controls stay below history.
3. Continue, attach a PNG using +, choose all/subset targets and confirm the Apply review. Check actual saved previews and optional designer access.
4. Save for Later, reload and Continue designing. Verify the same collection and choices remain.
5. Say Looks good, select stores by name or controls, review actual warnings and explicitly publish in the isolated fixture workspace. Reload and verify one result and no executable old approval.
6. Repeat skipping artwork. Try a stale/expired/cancelled review and use status/review recovery without automatic execution.
7. Read older history while results/images arrive, then use Latest message. Repeat at mobile width, with keyboard navigation and on a real mobile device.

No production/staging writes, real customer campaigns/publications, financial data changes, external sends, commits, pushes, merges, resets, deployments or Git remote changes were performed.
