// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMemoryRouter, matchRoutes, Outlet, RouterProvider } from "react-router";
import { appRouter } from "@/app/router";
import { usePublicSeo } from "./usePublicSeo";
import * as storefront from "@/lib/shopRedeemUrl";
import catalog from "./publicPages.json";

// Inspect the real route declarations without starting browser routing/auth/loaders.
vi.mock("react-router", async () => ({
  ...await vi.importActual<typeof import("react-router")>("react-router"),
  createBrowserRouter: vi.fn(routes => ({ routes })),
}));
const title = "ShelfMerch Copilot | ShelfMerch";
function matchedTitle(path: string) {
  return (matchRoutes(appRouter.routes, path)?.at(-1)?.route.handle as { privateTitle?: string } | undefined)?.privateTitle;
}
function Head() { usePublicSeo(); return <Outlet />; }
function setup(path: string) {
  const router = createMemoryRouter([{ element: <Head />, children: [
    { path: "s/:slug", element: <div>Storefront</div> },
    { path: "shop/:id", element: <div>Storefront</div> },
    { path: ":slug/copilot", handle: { privateTitle: matchedTitle("/ai-test/copilot") }, element: <div>Copilot</div> },
    { path: ":slug/wallets", element: <div>Wallets</div> },
    { path: "about", element: <div>About</div> },
    { path: "*", element: <div>404</div> },
  ] }], { initialEntries: [path] });
  const view = render(<RouterProvider router={router} />);
  return { router, ...view };
}
beforeEach(() => { document.title = "Page not found | ShelfMerch"; document.head.querySelectorAll('link[rel="canonical"],meta[name="robots"],meta[property="og:url"],#seo-jsonld').forEach(el => el.remove()); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it.each(["/ai-test/copilot", "/other-company/copilot", "/ai-test/copilot/", "/ai-test/copilot?conversation=one#latest", "/app/copilot", "/dashboard/copilot"])("the actual router owns the Copilot title for %s", path => {
  expect(matchedTitle(path)).toBe(title);
});
it.each(["/s/copilot", "/shop/copilot", "/ai-test/copilot/missing", "/missing/deep/page", "/about", "/ai-test/wallets"])("does not assign Copilot metadata to %s", path => {
  expect(matchedTitle(path)).toBeUndefined();
});
it.each(["/ai-test/copilot", "/another-tenant/copilot/?conversation=one#latest"])("corrects a stale 404 title on direct navigation to %s", async path => {
  document.head.insertAdjacentHTML("beforeend", '<link rel="canonical" href="https://shelfmerch.io/about"><meta property="og:url" content="https://shelfmerch.io/about"><script id="seo-jsonld" type="application/ld+json">{}</script>');
  setup(path);
  await waitFor(() => expect(document.title).toBe(title));
  expect(document.querySelector('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  expect(document.querySelector('link[rel="canonical"]')).toBeNull(); expect(document.querySelector('meta[property="og:url"]')).toBeNull(); expect(document.querySelector("#seo-jsonld")).toBeNull();
});
it("sets the title again after a fresh mount/refresh", async () => {
  const first = setup("/ai-test/copilot"); await waitFor(() => expect(document.title).toBe(title));
  first.unmount(); document.title = "Page not found | ShelfMerch";
  setup("/ai-test/copilot"); await waitFor(() => expect(document.title).toBe(title));
});
it("does not overwrite a newer title owner during cleanup", async () => {
  const view = setup("/ai-test/copilot"); await waitFor(() => expect(document.title).toBe(title));
  document.title = "Store-owned title"; view.unmount(); expect(document.title).toBe("Store-owned title");
});
it("handles client navigation, public canonical metadata, genuine 404s and private title cleanup", async () => {
  const { router } = setup("/missing/deep/page");
  await waitFor(() => expect(document.title).toBe("Page not found | ShelfMerch"));
  await act(() => router.navigate("/ai-test/copilot")); expect(document.title).toBe(title);
  await act(() => router.navigate("/about"));
  const about = catalog.pages.find(page => page.path === "/about")!;
  expect(document.title).toBe(about.title); expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute("href", `${catalog.origin}/about`);
  await act(() => router.navigate("/other-company/copilot")); expect(document.title).toBe(title);
  await act(() => router.navigate("/other-company/wallets")); expect(document.title).toBe(about.title);
  expect(document.querySelector('link[rel="canonical"]')).toBeNull();
  await act(() => router.navigate("/ai-test/copilot/not-a-route")); expect(document.title).toBe("Page not found | ShelfMerch");
});
it.each(["/s/copilot", "/shop/copilot"])("preserves storefront head ownership for %s", async path => {
  document.title = "Custom store title";
  document.head.insertAdjacentHTML("beforeend", '<link rel="canonical" href="https://shop.example.test/">');
  setup(path);
  await waitFor(() => expect(document.title).toBe("Custom store title"));
  expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute("href", "https://shop.example.test/");
});
it("preserves shop subdomain head ownership even when the pathname resembles a workspace route", () => {
  vi.spyOn(storefront, "shopSlugFromHostname").mockReturnValue("copilot");
  document.title = "Vanity storefront"; setup("/ai-test/copilot"); expect(document.title).toBe("Vanity storefront");
});
