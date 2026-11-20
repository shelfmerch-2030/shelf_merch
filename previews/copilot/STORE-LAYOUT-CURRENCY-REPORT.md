# Store currency and banner guidance

## Currency contradiction: intended product behavior versus current code

The requirement that users should be able to change a store's INR/Points mode **contradicts the current implementation**. No currency-editing feature was implemented and no business rule was silently changed.

| Setting | Current verified behavior |
| --- | --- |
| `currencyMode` (`inr` / `points`) | Selectable during creation. Not editable afterward, including for draft stores. The Settings field is read-only/disabled, the dashboard PATCH schema omits it, the service explicitly ignores it, and the strict MCP update schema rejects it. |
| `pointsConversionEnabled` | A separate boolean accepted and saved by existing backend/API/MCP updates. The current Send Points controller uses it to initialize `pointsScope` to `stadium` versus `shop`. It does not change INR/Points mode or the conversion rate. No control for editing this flag was found in the current General Settings screen. |
| `UiShop.currency` / creation `draft.currency` | UI label/input mapped to/from `currencyMode`. It is not a second independently writable backend store-currency setting. |
| Display conversion rates | Fixed constants in `storeCurrency.ts`: INR 1 = 2 Points; INR 1 = 1 Credit. No editable rate setting was found in these store flows. |

The frontend `UpdateShopInput`, API bridge and API request types still list `currencyMode`, and the request helper can send it. That type allowance is not implemented backend support: request validation strips it, and the service independently ignores it. Copilot must follow the verified backend behavior, not infer support from the client type.

Verified paths:

- `apps/web/src/features/shops/views/CreateShopView.tsx` — INR/Points selection and permanence note.
- `apps/web/src/features/shops/tabs/GeneralSettingsTab.tsx` — disabled currency field; save submits name/domain.
- `apps/web/src/features/shops/model.ts`, `apps/web/src/services/api-bridge.ts`, `apps/web/src/services/workspace-api.ts` — request flow and permissive client types.
- `apps/web/src/services/mappers.ts` — currency label derived from mode.
- `apps/api/src/modules/shops/shops.validation.js` — creation accepts mode; update omits it.
- `apps/api/src/modules/shops/shops.service.js` — update removes `currencyMode` from the patch.
- `apps/api/src/modules/mcp/shopsWrite.js` — create accepts currency; strict update rejects it and separately accepts point conversion.
- `apps/web/src/features/campaigns/controllers/useSendPointsController.ts` — flag controls default points scope.

A separate explicit product/implementation decision is needed to make `currencyMode` editable. This task does not claim that the desired behavior is already supported.

## Exact Store Layout banner workflow

For a user with store-edit permission (company admins in the Copilot flow):

1. Open the existing store.
2. Select its **Layout** tab—the store's layout settings, referred to as Store Layout in the guidance.
3. Under **Top banner**, select the pencil control labelled **Edit banner**.
4. Choose a **Banner library** preset, a **Solid colour**, or a **Custom banner** image. Choosing changes the local preview.
5. Click **Save changes** to persist it.

`ShopDetailView` renders Layout only when `canEditShop` is true. `ShopLayoutTab` opens the inline banner panel, and `useShopLookEditor.onSave` calls the existing `useUpdateShop` mutation with `logoUrl` and `bannerConfig`. The normal API bridge persists media if needed and PATCHes the existing store. This does not create a new store, change currency/status, or call publish again.

The separately available `BannerEditorDialog` uses the same banner configuration/update path; it is not the inline control reached through the Layout tab. The guidance names the actual Layout controls rather than substituting that separate dialog.

Banner selection is **optional before creation**. Existing Copilot creation materialization seeds the default dark `solid-pattern` banner when none is supplied. No banner choice, library visit or custom upload should block PREPARE or confirmation. A user can create/publish first and personalize the banner later.

## Changes made

Only two production guidance locations changed:

- `apps/api/src/modules/copilot/copilotChat.service.js`: added the verified Store Layout path, optional/default-banner behavior and no-recreate/no-republish clarification. Currency wording now explicitly describes the **current implementation**. Existing count-only guidance, logo attachments, confirmation and Live-publication instructions remain intact.
- `apps/api/src/modules/mcp/shopsWrite.js`: added the same optional/later-selection guidance to the creation tool description. No schema, materialization, upload, execution or publishing logic changed.

Focused tests changed/added:

- `apps/api/tests/copilot-store-currency-guidance.test.js`: verifies existing service updates can toggle the point-conversion flag without switching currency; omitted banner remains valid; default banner is retained; guidance names the actual Layout steps and never requires a banner before creation.
- `apps/web/src/features/shops/tabs/ShopLayoutTab.test.tsx`: uses the actual Layout component and look-editor hook with a mocked update mutation. Verifies preset preview before explicit save, solid-colour save without currency/status updates, and the actual disabled General Settings currency control.

No store creation/publishing implementation, logo upload behavior, financial workflow, unrelated UI or existing data was changed. Earlier working-tree changes were preserved.

## Tests and execution limits

- **25/25 database-free backend tests passed**: 15 currency/banner guidance cases, 6 existing response-format cases and 4 existing write-registry cases.
- **13/13 frontend tests passed**: 3 new Layout/settings cases, 3 existing creation-confirmation cases, 4 existing store UX cases and 3 existing display-currency cases.
- `git diff --check` passed for the changed tracked source/test files.

Machine-readable evidence:

- `store-layout-guidance-api-tests.json`
- `store-layout-guidance-web-tests.json`

The backend tests use the existing database-free guidance configuration, which omits MongoDB global setup. The guidance suite rejects MongoDB connections and actual model saves. Update-service checks use plain fake objects; frontend Save calls a mock. No database mutations, live store creation, banner upload, live Claude call, deployment, commit, push or Git remote change occurred.

Suggested user-facing creation guidance: **“You can choose a banner later: open your store → Layout → Top banner → Edit banner, then Save changes. You can create the store now using the default banner.”**
