# Copilot browser tab title fix

## Root cause

React Router correctly matches `/ai-test/copilot` through `:slug` → the shared `copilot` tenant child. The independent SEO resolver's `WORKSPACE_CHILD_PATHS` omits `copilot`, so it classifies that valid URL as unknown and supplies `Page not found | ShelfMerch`. Vite uses this resolver for its HTML shell, and `RootLayout` runs `usePublicSeo` on navigation. Copilot had no route-owned title to correct the classification. Additionally, the hook's private branch previously never assigned a title.

## Changes

- `apps/web/src/app/router.tsx`: add `handle.privateTitle = "ShelfMerch Copilot | ShelfMerch"` to the existing shared Copilot child route. Route paths, loaders and authentication are unchanged; tenant-specific routes and existing `/app`/`/dashboard` aliases share the metadata.
- `apps/web/src/seo/usePublicSeo.ts`: honor private title metadata from actual React Router matches before the generic path-based SEO fallback. Apply the existing private-page robots/canonical policy. Restore the previous title when leaving this route, provided another title owner has not already replaced it.
- `apps/web/src/seo/usePublicSeo.test.tsx`: add 20 focused metadata, routing and navigation tests.

This avoids a broad `endsWith('/copilot')` rule or a duplicated tenant-slug regex. Storefront head ownership and the shop-subdomain guard remain intact. Unmatched nested Copilot URLs still receive the genuine 404 title. Public canonical behavior and other private pages' existing title policy are unchanged.

No backend code or shared server resolver was changed, as requested. This is a client document-head correction based on the matched route; it does not change raw server HTML shells, server routing/status behavior or metadata before JavaScript runs.

## Verification

- **41 tests passed**: 20 new `usePublicSeo` tests, 3 existing catalog-head tests and 18 Copilot page tests (`tab-title-tests.json`).
- Actual local React Router/RootLayout in Edge, with read-only API fixtures (`tab-title-browser-results.json`):
  - Direct `/ai-test/copilot`: `ShelfMerch Copilot | ShelfMerch`.
  - Refresh: same correct title.
  - Client navigation from About to `/another-tenant/copilot`: same correct title.
  - Copilot pages: `noindex, nofollow`, no canonical.
  - About retains `https://shelfmerch.io/about` as canonical.
  - `/ai-test/copilot/not-a-route`: `Page not found | ShelfMerch`.
  - No browser runtime exceptions.
- Tests also protect `/s/copilot`, `/shop/copilot`, storefront subdomains, query/trailing-slash variants, private-page title cleanup and another component taking ownership of the title.
- `git diff --check` passed for the changed production files.
- Whole-web TypeScript checking still reports unrelated existing errors; none reference the changed files (`tab-title-typecheck.txt`).

Browser verification script: `previews/verify-copilot-tab-title.mjs`. No live backend mutations, Copilot UI changes, authentication changes, deployment, commit, push or Git remote changes. Existing unrelated workspace changes were preserved.
