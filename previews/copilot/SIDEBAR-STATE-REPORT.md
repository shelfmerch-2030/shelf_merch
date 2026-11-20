# Copilot sidebar loading and streaming state

Verified locally on 11 November 2026. This task changes only the Copilot page, history component, wallet-card display fallback and frontend regression tests. No backend Claude orchestration, financial business logic, MCP tools, WRITE confirmations, gifting recommendations, deployment configuration or Git remotes were changed. No financial operations or live provider calls were executed for this task.

## Findings

The current `sendPrompt` already inserts newly created conversations locally and updates titles from the SSE completion event. It does **not** call the conversation-list endpoint after every message. The history-fetch effect depends only on the primitive enabled flag and a stable callback. No repeated per-message list fetch was found in this working tree.

The actual UI coupling was:

- The page passed `locked = busy || opening || deleting` to history. Streaming therefore disabled every saved-conversation button and New chat. An existing test explicitly expected this behavior.
- `openConversation` shared the send lock, so merely enabling those buttons would not make navigation work. SSE updates also targeted the last assistant message of whichever transcript was currently displayed, making navigation unsafe without scoping updates.
- Completion removed the active entry and prepended it, moving the sidebar's contents on every answer.
- `CopilotHistory` replaced all rows with a loading/error branch, even when a loaded list was already available. The loader always activated when `loadHistory` ran.
- A delayed initial history response could overwrite a newly inserted conversation or its updated title.
- The saved wallet-card renderer directly dereferenced `artifact.wallet`. Missing payloads in older saved artifacts could crash opening the conversation. This was reproduced by a frontend regression using a saved `wallet_balance` artifact without its wallet payload.

## Changes

`CopilotPage.tsx` retains the existing state and sidebar architecture:

- History is locked only during an actual conversation-open or delete request, not during message streaming.
- In-flight transcript buffers and abort controllers are scoped to their conversation in a component-local ref. Navigation can leave a stream running and return to its buffered transcript. Deltas, artifacts, tool status, errors and completion cleanup cannot overwrite another selected conversation's transcript or busy state.
- New, not-yet-created chats use a local view key until the server returns the conversation ID. A late creation response does not take selection away from a subsequently opened conversation.
- Unmount aborts all outstanding message requests.
- Titles update the affected row in place; the list is not reordered on completion. Newly created conversations are inserted once without fetching the entire list.
- History requests are deduplicated, and the full loader is reserved for initial history loading. Incoming history is merged with newer local summaries so a delayed fetch does not erase a just-created or renamed entry.

`CopilotHistory.tsx` keeps existing rows mounted during loading and refresh errors. Existing search state and scroll containers remain intact; a refresh error appears alongside accessible rows and the existing retry control. Initial empty-history loading still displays the normal loader.

`CopilotBalanceCard.tsx` provides a display-only fallback when a saved artifact has no wallet payload, and tolerates missing department rows. It does not invent a zero balance, recompute financial figures, change persisted data or alter backend schemas.

## Verification

**All 71 Copilot frontend tests passed**, including existing gifting, confirmation, product-card, history, composer and page regressions. See `sidebar-web-tests.json` for the machine-readable results.

New or updated coverage verifies:

- Sending and completing a reply makes no additional list request: one initial list call.
- Streaming text and the active-chat indicator continue normally while history remains interactive.
- Sidebar DOM nodes, search state, scroll position and selection survive streaming and title changes.
- The affected title changes without moving the row or changing other entries.
- A created conversation appears once, including when initial history loading finishes late.
- Switching away and back preserves the in-flight reply, does not abort it, and does not leak deltas into another conversation.
- Failed messages retain saved history, and page remount fetches history again.
- Mobile history opens during streaming and can select a saved conversation.
- Loaded history survives refresh loading and failures with its search and scroll state intact.
- Saved conversations with missing wallet payloads render a fallback without crashing or showing an invented balance.

Command from `apps/web`:

```powershell
npx.cmd vitest run src/features/copilot --reporter=json --outputFile=../../previews/copilot/sidebar-web-tests.json
```

The React review checked stable component placement/keys, primitive effect dependencies, event-scoped refs, functional state updates, request cleanup and accessible busy/disabled states. No new library or UI redesign was introduced.

`tsc --noEmit` still reports errors outside Copilot, in kit, swag, service and Vite files. It reports no errors in the changed Copilot files. Full output is saved in `sidebar-typecheck.txt`. Those unrelated errors were left untouched. Mobile/desktop behavior was verified with component tests, not a live responsive-browser or real-Claude session.
