# Anthropic Copilot failure investigation

Verified on 11 November 2026 using synthetic prompts and an isolated MongoDB test database. No customer conversations or credentials were captured. No financial or store write handlers were executed. No Redis configuration, Git remotes, commits, pushes, or deployments were changed.

## Exact provider failure

Replaying the actual committed schema builder, Anthropic adapter, and system prompt from HEAD `eaf8fc75`, with all model-visible READ/PREPARE definitions enabled and a synthetic `Hello`, returned:

- SDK class: `BadRequestError`
- HTTP status: `400`
- Provider type: `invalid_request_error`
- Provider `param`: absent (recorded as `null`); the error identifies `tools.32.custom.input_schema` in its message.
- Anthropic request ID: `req_011CgvpPHihtYTVuP9Urqnnx`
- Tool at index 32: `wallets_prepare_topup`

Exact message:

> tools.32.custom.input_schema: JSON schema is invalid. It must match JSON Schema draft 2020-12 (https://json-schema.org/draft/2020-12). Learn more about tool use at https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview.

Raw error objects, headers, request bodies and full conversations are not logged. See `anthropic-schema-failure-evidence.json` for the restricted reproduction record.

## Root cause and request inspection

The committed `zodParams` uses `z.toJSONSchema(schema, { target: 'openapi-3.0' })`. For positive numbers, this emits `minimum: 0, exclusiveMinimum: true`. Claude requires Draft 2020-12, whose `exclusiveMinimum` is numeric. The committed adapter forwards those incompatible nested schemas unchanged. Every ordinary chat request includes tool definitions, so even Hello fails before any tool needs to run.

Three schema fields have this incompatibility when all write rollout domains are enabled:

1. `wallets_prepare_topup.properties.amount`
2. `wallets_prepare_payment_order.properties.amount`
3. `entities_prepare_setup.properties.departments.items.properties.budget`

The working tree already contained the minimal schema-builder fix (`jsonSchema2020-12`) and an adapter normalization safeguard when this investigation began. Both were preserved and verified. Normalization turns the old positive bound into `exclusiveMinimum: 0`, retaining the strict positive constraint. No tools were removed or disabled to fix the provider error.

The verified model is `claude-sonnet-5-5`, API version `2023-06-01`, and max output tokens `4096`. The ordinary Claude request sends no `temperature`, `top_p`, or `top_k`. The system prompt is a separate top-level string. User turns and assistant/tool-result history are translated by the existing adapter; a real tool-use/result continuation passed. No model, sampling, system-prompt, message-history, or authorization changes were needed. The HTTP 200 is the established SSE response; provider failures occur after streaming headers have been sent.

Local Git history contains only one commit touching the Claude adapter (`eaf8fc75`), which reproduces the failure. There is no separately identifiable last-working Claude revision in available local history. No remote access or Git changes were performed. Current prompt, gifting and budget additions were reviewed and preserved.

## Changes made during this investigation

- Added safe Anthropic diagnostic extraction in `anthropicChatAdapter.js`. The installed SDK nests its provider error under `err.error.error`, uses `requestID`, and stores headers as `Headers`. Diagnostics preserve the known generic schema-validation message, provider type and request ID; arbitrary provider text is omitted because it may echo request data.
- Connected that extraction to the existing Copilot provider-error log. User-facing provider errors remain generic.
- Added three regression cases in `copilot-anthropic-provider.test.js`: OpenAPI positive bounds versus Draft 2020-12, all three affected PREPARE schemas with write flags enabled, and real SDK error-shape extraction plus sensitive-text omission.
- Added opt-in `copilot-anthropic-schema-live.test.js`: real Claude through the authenticated messages SSE endpoint, with all 46 model-visible definitions present. A fail-closed execution guard permits only `catalog_list_categories`.

No business handlers, budget mappings, confirmation gates, gifting behavior, store creation behavior, or UI were changed by this investigation. Existing uncommitted work was preserved.

## Verification evidence

Real Claude endpoint test passed:

- Hello: HTTP 200, streamed text, `done`, no tool execution. Anthropic request `req_011CgvpHrPps3rXao1WKsC1o`.
- Read-only catalog categories: HTTP 200, `catalog_list_categories` running then done, streamed final text and `done`. Anthropic requests `req_011CgvpHzw2Gu5xrHmD5ZM4y` and `req_011CgvpJ8Mkf4zM6uw2GpBDV`.
- Synthetic tenant and conversations used only the isolated test database. No production business data was accessed by the tool.

See `anthropic-schema-live-results.json` for the compact endpoint evidence.

Offline: 64 distinct tests passed across the targeted provider, read coverage, MCP catalog, discovery, gifting advisor, response formatting and wallet reconciliation files. The first broad run had 61 passes and three failures in read/discovery assertions that assume write rollout flags are false. Rerunning those two files with all write flags explicitly false passed all 11 tests. No source changes were made to address that test-environment assumption. The real-Claude smoke test passed separately. `git diff --check` passed for the touched tracked files.

Example commands from `apps/api`:

```powershell
npx.cmd vitest run tests/copilot-anthropic-provider.test.js
$env:COPILOT_ANTHROPIC_SCHEMA_LIVE='1'
npx.cmd vitest run tests/copilot-anthropic-schema-live.test.js
```

The live test requires network access to the configured Anthropic API. Initial sandboxed API calls failed locally with `APIConnectionError`; authorized network-enabled verification succeeded. Those connection errors were distinct from the reproduced Anthropic 400.

## Redis, separately

A single bounded connect/PING probe of the configured Redis connection failed with `AggregateError`, `ECONNREFUSED` (two nested connection-refused errors). Connection retry was disabled for the probe; the client was disconnected afterward. No Redis writes or infrastructure changes were made.

The shared Redis client has an error listener and a reconnect strategy, explaining repeated log entries when connection attempts are refused. No server-side cause beyond connection refusal was established. The Anthropic schema error was reproduced without a Redis connection, and the repaired Claude endpoint succeeded without Redis. There is no verified causal link between Redis connection refusal and this provider 400.
