// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { matchRoutes } from "react-router";
import { appRouter } from "./router";

// Inspect the real route definitions without starting browser loaders or auth.
vi.mock("react-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-router")>(),
  createBrowserRouter: (routes: unknown) => ({ routes }),
}));
vi.mock("./RootLayout", () => ({ RootLayout: () => null, RouteError: () => null, NotFound: () => null }));
vi.mock("@/services/api-bridge", () => ({
  getStoredUser: () => null, isAuthenticated: () => false, isPlatformUser: () => false,
}));
vi.mock("@/services/tenant-route-guards", () => ({ requireTenantArea: vi.fn() }));

describe("catalog routes", () => {
  it.each(["/husain/catalog", "/dashboard/catalog", "/app/catalog", "/apps/catalog"])(
    "resolves category, browse and product pages under %s",
    (home) => {
      for (const category of ["kits", "apparel", "all-products", "t-shirts"]) {
        const matches = matchRoutes(appRouter.routes, `${home}/category/${category}`);
        expect(matches?.at(-1)?.route.path).toBe("category/:category");
        expect(matches?.at(-1)?.params.category).toBe(category);
        expect(matches?.at(-1)?.route.lazy).toBeTypeOf("function");
      }
      expect(matchRoutes(appRouter.routes, `${home}/browse`)?.at(-1)?.route.path).toBe("browse");
      expect(matchRoutes(appRouter.routes, `${home}/product-123`)?.at(-1)?.route.path).toBe(":id");
    },
  );
});
