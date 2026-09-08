import type { ComponentType } from "react";
import { createBrowserRouter, redirect, type RouteObject } from "react-router";
import { NotFound, RootLayout, RouteError } from "./RootLayout";
import { getStoredUser, isAuthenticated, isPlatformUser } from "@/services/api-bridge";
import { requireTenantArea } from "@/services/tenant-route-guards";

/** Lazy route: resolves a named (default) export to react-router's `{ Component }`. */
function page(loader: () => Promise<Record<string, unknown>>, name = "default") {
  return () => loader().then((m) => ({ Component: m[name] as ComponentType }));
}

/** Signed-in users never see landing/login — bounce them into their app. */
function redirectIfAuthed() {
  if (!isAuthenticated()) return null;
  if (isPlatformUser(getStoredUser())) return redirect("/platform/dashboard");
  return redirect("/app");
}

const tenantChildren: RouteObject[] = [
  { index: true, lazy: page(() => import("@/features/dashboard/DashboardPage"), "DashboardPage") },
  { path: "orders", lazy: page(() => import("@/features/orders/OrdersPage"), "OrdersPage") },
  { path: "wallets", lazy: page(() => import("@/features/wallets/WalletsPage"), "WalletsPage") },
  {
    path: "wallets/:walletId",
    loader: ({ params }) =>
      redirect(`/app/wallets?wallet=${encodeURIComponent(params.walletId || "")}`),
  },
  {
    path: "shops",
    children: [
      { index: true, lazy: page(() => import("@/features/shops/ShopsPage"), "ShopsPage") },
      {
        path: "new",
        loader: () => (requireTenantArea("shops", "write"), null),
        lazy: page(() => import("@/features/shops/CreateShopWizard"), "CreateShopWizard"),
      },
      {
        path: ":id",
        children: [
          {
            index: true,
            lazy: page(() => import("@/features/shops/ShopDetailPage"), "ShopDetailPage"),
          },
          {
            path: "publish",
            loader: () => (requireTenantArea("shops", "write"), null),
            lazy: page(() => import("@/features/shops/PublishShopWizard"), "PublishShopWizard"),
          },
          {
            path: "designs/:collectionId",
            lazy: page(
              () => import("@/features/shops/ShopDesignDetailPage"),
              "ShopDesignDetailPage",
            ),
          },
        ],
      },
    ],
  },
  {
    path: "swag",
    children: [
      { index: true, lazy: page(() => import("@/features/swag/SwagPage"), "SwagPage") },
      {
        path: "new",
        loader: () => (requireTenantArea("swag", "write"), null),
        lazy: page(() => import("@/features/swag/wizard/SwagWizard"), "SwagWizard"),
      },
      {
        path: ":collectionId/:pIdx",
        lazy: page(() => import("@/features/swag/SwagProductPage"), "SwagProductPage"),
      },
    ],
  },
  {
    path: "kits",
    children: [
      { index: true, lazy: page(() => import("@/features/kits/KitsPage"), "KitsPage") },
      {
        path: "new",
        loader: () => (requireTenantArea("kits", "write"), null),
        lazy: page(() => import("@/features/kits/wizard/KitWizard"), "KitWizard"),
      },
      {
        path: ":id",
        children: [
          {
            index: true,
            lazy: page(() => import("@/features/kits/KitDetailPage"), "KitDetailPage"),
          },
          {
            path: "edit",
            loader: () => (requireTenantArea("kits", "write"), null),
            lazy: page(() => import("@/features/kits/wizard/EditKitWizard"), "EditKitWizard"),
          },
          {
            path: "send",
            loader: () => (requireTenantArea("campaignOps", "write"), null),
            lazy: page(() => import("@/features/kits/send/SendKitWizard"), "SendKitWizard"),
          },
        ],
      },
    ],
  },
  {
    path: "campaigns",
    children: [
      {
        index: true,
        lazy: page(() => import("@/features/campaigns/CampaignsPage"), "CampaignsPage"),
      },
      {
        path: "send-points",
        loader: () => (requireTenantArea("campaignOps", "write"), null),
        lazy: page(() => import("@/features/campaigns/SendPointsPage"), "SendPointsPage"),
      },
    ],
  },
  {
    path: "contacts",
    lazy: page(() => import("@/features/contacts/ContactsPage"), "ContactsPage"),
  },
  {
    path: "support",
    lazy: page(() => import("@/features/support/SupportPage"), "SupportPage"),
  },
  {
    path: "integrations",
    children: [
      {
        index: true,
        lazy: page(() => import("@/features/integrations/IntegrationsPage"), "IntegrationsPage"),
      },
      {
        path: "hris-employees",
        loader: () => (requireTenantArea("integrations", "read"), null),
        lazy: page(
          () => import("@/features/integrations/hris-employees/HrisEmployeesPage"),
          "HrisEmployeesPage",
        ),
      },
    ],
  },
  {
    path: "settings",
    lazy: page(() => import("@/features/settings/SettingsPage"), "SettingsPage"),
  },
  { path: "billing", lazy: page(() => import("@/features/billing/BillingPage"), "BillingPage") },
  {
    path: "catalog",
    children: [
      { index: true, lazy: page(() => import("@/features/catalog/CatalogPage"), "CatalogPage") },
      {
        path: ":id",
        lazy: page(() => import("@/features/catalog/CatalogProductPage"), "CatalogProductPage"),
      },
    ],
  },
];

const platformPages = () => import("@/components/platform/PlatformPages");

const platformChildren: RouteObject[] = [
  { path: "dashboard", lazy: page(platformPages, "DashboardPage") },
  {
    path: "catalog",
    children: [
      { index: true, lazy: page(platformPages, "CatalogPage") },
      {
        path: "new",
        lazy: page(() => import("@/components/platform/pages/product-wizard"), "ProductWizard"),
      },
      {
        path: "import",
        lazy: page(() => import("@/components/platform/pages/shopify-import"), "ShopifyImport"),
      },
      {
        path: ":id",
        lazy: page(() => import("@/components/platform/pages/product-wizard"), "ProductWizard"),
      },
    ],
  },
  {
    path: "kits",
    children: [
      { index: true, lazy: page(platformPages, "KitsPage") },
      { path: "new", lazy: page(() => import("@/components/platform/pages/kit-wizard"), "KitWizard") },
      {
        path: "import",
        lazy: page(() => import("@/components/platform/pages/shopify-import"), "ShopifyImport"),
      },
      { path: ":id", lazy: page(() => import("@/components/platform/pages/kit-wizard"), "KitWizard") },
    ],
  },
  {
    path: "orders",
    children: [
      { index: true, lazy: page(platformPages, "OrdersPage") },
      { path: ":id", lazy: page(platformPages, "OrderFulfillmentPage") },
    ],
  },
  { path: "tenants", children: [
    { index: true, lazy: page(platformPages, "TenantsPage") },
    { path: ":tenantId", lazy: page(platformPages, "TenantDetailPage") },
  ]},
  { path: "finance", lazy: page(platformPages, "FinancePage") },
  { path: "inventory", lazy: page(platformPages, "InventoryPage") },
  { path: "production", lazy: page(platformPages, "ProductionPage") },
  { path: "shipments", lazy: page(platformPages, "ShipmentsPage") },
  { path: "sales", lazy: page(platformPages, "SalesPage") },
  { path: "support", lazy: page(platformPages, "SupportPage") },
  { path: "team", lazy: page(platformPages, "TeamPage") },
  { path: "audit", lazy: page(platformPages, "AuditPage") },
  { path: "settings", lazy: page(platformPages, "SettingsPage") },
];

export const appRouter = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      {
        index: true,
        loader: redirectIfAuthed,
        lazy: page(() => import("@/components/LandingPage")),
      },
      { path: "about", lazy: page(() => import("@/features/marketing/MarketingHtmlPage"), "AboutPage") },
      { path: "about/index.html", loader: () => redirect("/about") },
      { path: "careers", lazy: page(() => import("@/features/marketing/MarketingHtmlPage"), "CareersPage") },
      { path: "careers/index.html", loader: () => redirect("/careers") },
      { path: "privacy", lazy: page(() => import("@/features/marketing/MarketingHtmlPage"), "PrivacyPage") },
      { path: "privacy/index.html", loader: () => redirect("/privacy") },
      { path: "terms", lazy: page(() => import("@/features/marketing/MarketingHtmlPage"), "TermsPage") },
      { path: "terms/index.html", loader: () => redirect("/terms") },
      {
        path: "resources",
        lazy: page(() => import("@/components/resources/ResourcesHub")),
      },
      {
        path: "resources/:team",
        lazy: page(() => import("@/components/resources/ResourcesTeamPage"), "ResourcesTeamPage"),
      },
      {
        path: "request-demo",
        lazy: page(() => import("@/features/request-demo/RequestDemoPage"), "RequestDemoPage"),
      },
      { path: "contact-us", loader: () => redirect("/request-demo") },
      {
        path: "apps/catalog",
        lazy: page(() => import("@/features/catalog/PublicCatalogPage"), "PublicCatalogLayout"),
        children: [
          { index: true, lazy: page(() => import("@/features/catalog/CatalogPage"), "CatalogPage") },
          {
            path: "category/:category",
            lazy: page(() => import("@/features/catalog/CatalogCategoryPage"), "CatalogCategoryPage"),
          },
          {
            path: ":id",
            lazy: page(() => import("@/features/catalog/CatalogProductPage"), "CatalogProductPage"),
          },
        ],
      },
      {
        // Public alias: allow unauthenticated access to the catalog under `/app/*`
        // without the tenant auth redirect from `TenantLayout`.
        path: "app/catalog",
        lazy: page(() => import("@/features/catalog/PublicCatalogPage"), "PublicCatalogLayout"),
        children: [
          { index: true, lazy: page(() => import("@/features/catalog/CatalogPage"), "CatalogPage") },
          {
            path: "category/:category",
            lazy: page(() => import("@/features/catalog/CatalogCategoryPage"), "CatalogCategoryPage"),
          },
          {
            path: ":id",
            lazy: page(() => import("@/features/catalog/CatalogProductPage"), "CatalogProductPage"),
          },
        ],
      },
      { path: "catalog", loader: () => redirect("/apps/catalog") },
      {
        path: "login",
        loader: redirectIfAuthed,
        lazy: page(() => import("@/features/auth/LoginPage"), "LoginPage"),
      },
      {
        path: "forgot-password",
        loader: redirectIfAuthed,
        lazy: page(() => import("@/features/auth/ForgotPasswordPage"), "ForgotPasswordPage"),
      },
      {
        path: "reset-password",
        lazy: page(() => import("@/features/auth/ResetPasswordPage"), "ResetPasswordPage"),
      },
      { path: "signup", lazy: page(() => import("@/features/auth/SignupPage"), "SignupPage") },
      {
        path: "signup/verify",
        lazy: page(() => import("@/features/auth/VerifyEmailPage"), "VerifyEmailPage"),
      },
      {
        path: "legal/privacy-policy",
        lazy: page(() => import("@/features/legal/PrivacyPolicyPage"), "PrivacyPolicyPage"),
      },
      {
        path: "legal/terms-of-service",
        lazy: page(() => import("@/features/legal/TermsOfServicePage"), "TermsOfServicePage"),
      },
      {
        path: "docs/zoho-people",
        lazy: page(
          () => import("@/features/docs/zoho-people/ZohoPeopleDocsHomePage"),
          "ZohoPeopleDocsHomePage",
        ),
      },
      {
        path: "docs/zoho-people/user-guide",
        lazy: page(
          () => import("@/features/docs/zoho-people/ZohoPeopleUserGuidePage"),
          "ZohoPeopleUserGuidePage",
        ),
      },
      {
        path: "docs/zoho-people/admin-guide",
        lazy: page(
          () => import("@/features/docs/zoho-people/ZohoPeopleAdminGuidePage"),
          "ZohoPeopleAdminGuidePage",
        ),
      },
      {
        path: "case-studies/zoho-people",
        lazy: page(
          () => import("@/features/docs/case-studies/ZohoPeopleExampleWorkflowPage"),
          "ZohoPeopleExampleWorkflowPage",
        ),
      },
      {
        path: "auth/google",
        lazy: page(() => import("@/features/auth/GoogleAuthCallbackPage"), "GoogleAuthCallbackPage"),
      },
      {
        path: "accept-invite",
        lazy: page(() => import("./publicRoutes"), "AcceptInviteRoute"),
      },
      { path: "shop/:id", lazy: page(() => import("./publicRoutes"), "ShopRoute") },
      { path: "s/:slug", lazy: page(() => import("./publicRoutes"), "ShopRedeemRoute") },
      { path: "redeem/:token", lazy: page(() => import("./publicRoutes"), "RedeemRoute") },
      {
        path: "app",
        lazy: page(() => import("@/components/tenant/TenantLayout")),
        children: tenantChildren,
      },
      {
        // Spec alias — OAuth success lands on /dashboard/integrations?zoho=…
        path: "dashboard/integrations",
        loader: ({ request }) => {
          const url = new URL(request.url);
          return redirect(`/app/integrations${url.search}`);
        },
      },
      {
        path: "zoho/people",
        lazy: page(
          () =>
            import("@/features/integrations/zoho-people-connected-app/ZohoPeopleConnectedAppPage"),
          "ZohoPeopleConnectedAppPage",
        ),
      },
      {
        path: "zoho/people/sandbox",
        lazy: page(
          () =>
            import("@/features/integrations/zoho-people-connected-app/ZohoPeopleConnectedAppPage"),
          "ZohoPeopleConnectedAppSandboxPage",
        ),
      },
      {
        path: "zoho/people/embed-auth",
        lazy: page(
          () =>
            import("@/features/integrations/zoho-people-connected-app/ZohoPeopleEmbedAuthPage"),
          "ZohoPeopleEmbedAuthPage",
        ),
      },
      {
        path: "zoho/people/oauth-done",
        lazy: page(
          () =>
            import("@/features/integrations/zoho-people-connected-app/ZohoPeopleEmbedAuthPage"),
          "ZohoPeopleOAuthDonePage",
        ),
      },
      {
        path: "zoho/people/oauth-bridge",
        lazy: page(
          () =>
            import("@/features/integrations/zoho-people-connected-app/ZohoPeopleEmbedAuthPage"),
          "ZohoPeopleOAuthBridgePage",
        ),
      },
      {
        path: "platform",
        children: [
          {
            index: true,
            lazy: page(() => import("@/features/marketing/MarketingHtmlPage"), "PlatformMarketingPage"),
          },
          {
            lazy: page(() => import("@/components/platform/PlatformLayout")),
            children: platformChildren,
          },
        ],
      },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
