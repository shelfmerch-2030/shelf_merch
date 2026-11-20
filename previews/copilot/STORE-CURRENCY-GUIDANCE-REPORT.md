# Copilot store currency guidance

## Verified behavior

The statement that INR/Points store currency cannot change after creation is **correct in the current dashboard and backend**. The problem was repeating that restriction in an unrelated store-count answer.

- `apps/web/src/features/shops/views/CreateShopView.tsx:187` explicitly says the selected currency is permanent.
- `apps/web/src/features/shops/tabs/GeneralSettingsTab.tsx:110` renders currency as a read-only, disabled field; its save handler sends only the supported name/domain changes. The accompanying text says currency is locked after creation.
- `apps/api/src/modules/shops/shops.validation.js` allows `currencyMode` at creation but omits it from the dashboard update schema. Unknown currency fields are stripped during update validation.
- `apps/api/src/modules/shops/shops.service.js:59` independently removes `currencyMode` from update patches, even if a caller bypasses request-schema filtering.
- `apps/api/src/modules/mcp/shopsWrite.js` accepts currency at creation, rejects it through the strict update schema, and accurately describes the restriction. There is no draft-store exception: both draft and Live stores retain their original currency mode.
- `pointsConversionEnabled` is a separate supported setting. Editing it does not switch `currencyMode` between INR and Points.

No store business rule or currency-editing capability was changed.

## Root cause and minimal fix

The system prompt embedded “permanent after creation” directly in the general store-creation-fields instruction. All store tool descriptions are also available to the model, including accurate creation/update restrictions. There was no instruction limiting count/listing answers to the requested facts. This made the correct restriction easy to append as irrelevant creation advice.

The inspected store READ text and response formatter do not manufacture the restriction. Store-list results contain store data, and the empty result says “No stores found.” The wording originates in prompt/tool guidance rather than a count result or formatter.

Only the production system prompt in `apps/api/src/modules/copilot/copilotChat.service.js` changed:

1. Listing/count questions must answer from `shops_list`; an empty list means zero stores. Do not append creation steps, currency restrictions or an unsolicited creation offer.
2. The general creation-fields line retains name, INR/Points currency, optional logo and supported optional banner selection, without an unscoped permanence aside.
3. Currency immutability is explicitly scoped to an actual creation request or currency-editing question. The instruction matches both dashboard and MCP limitations, includes draft stores, distinguishes point conversion, and prohibits offering unsupported currency-editing operations.

The existing store creation instructions remain intact: name and currency, optional logo through chat attachments, supported preset banners, PREPARE → explicit Confirm → create and publish Live. Only report Live after a successful backend result. The existing tool instruction to explain currency permanence before creation confirmation remains accurate and unchanged.

## Files changed

- **Production:** `apps/api/src/modules/copilot/copilotChat.service.js` — scoped store guidance only. Other pre-existing working-tree changes were preserved.
- **Regression tests:** `apps/api/tests/copilot-store-currency-guidance.test.js` — 12 pure/mocked cases covering listing/count contracts, creation inputs, draft/Live currency updates in both directions, dashboard/MCP update schema differences, point conversion and the existing creation guidance.
- **Test harness artifact:** `previews/copilot/vitest-guidance.config.mjs` — deliberately omits the API suite's MongoDB global setup so this task runs without creating or mutating a database.
- This report and the JSON test results under `previews/copilot` are local evidence artifacts.

No dashboard/UI code, store service/schema/tool rules, financial workflows, MCP behavior or unrelated Copilot features were changed for this task.

## Verification

**22/22 database-free backend tests passed:**

- `copilot-store-currency-guidance.test.js` — 12.
- Existing `copilot-response-format.test.js` — 6.
- Existing `copilot-writes-registry.test.js` — 4.

The new suite forbids Mongoose connections and real model saves. Store listing authorization and service calls use mocks. Service currency-preservation checks use a plain object with a fake save method; no store is created or updated in any database. Creation checks parse schemas only and do not call PREPARE/EXECUTE.

**7/7 existing mocked frontend tests passed:**

- `CopilotStoreCreateConfirm.test.tsx` — 3.
- `CopilotStoreUx.test.tsx` — 4.

Result files: `store-currency-guidance-tests.json` and `store-currency-guidance-web-tests.json`. `git diff --check` passed for the changed production file.

No database connection, mutation, live Claude call or live store creation was performed. No deployment, commit, push or Git remote change occurred. The response-guidance regression is a prompt/schema/tool contract test; no claim is made that a live stochastic Claude response was tested.

Expected count-only behavior: **“There are currently 0 stores.”** Currency limitations should be explained when relevant to creation or when the user asks whether an existing store can switch between INR and Points.
