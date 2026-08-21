import { Link } from "react-router";
import {
  ChevronRight,
  Gift,
  LockKeyhole,
  Monitor,
  Play,
  Plus,
  ShoppingBag,
  Store,
  Users,
  Wallet,
} from "lucide-react";
import { LoadingState } from "@/components/LoadingState";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTenantAccess } from "@/hooks/useTenantAccess";
import { getLastShop } from "@/features/shops/types";
import { ShopBanner } from "@/features/shops/banner";
import { getStoredUser } from "@/services/api-bridge";
import { entityManagerBudgetRemaining } from "@/services/workspace-api";
import { walletUnallocated } from "@/lib/walletFormat";
import "./home.css";

function formatInr(amount: number) {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function formatRole(role: string) {
  const map: Record<string, string> = {
    owner: "Owner",
    admin: "Admin",
    company_admin: "Admin",
    entity_manager: "Manager",
    member: "Member",
  };
  return map[role] ?? role.replace(/_/g, " ");
}

const HELP_LINKS = [
  { label: "Welcome to Shelf Merch", icon: Play, href: "/app" },
  { label: "Create your first shop", icon: Store, href: "/app/shops" },
  { label: "Browse the swag catalog", icon: ShoppingBag, href: "/app/catalog" },
  { label: "Manage workspace contacts", icon: Users, href: "/app/contacts" },
] as const;

function LockedStepChip({ label }: { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="home-onboarding-step home-onboarding-step--locked" tabIndex={0}>
          <LockKeyhole size={13} strokeWidth={2.4} aria-hidden="true" />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent>Complete the previous step first</TooltipContent>
    </Tooltip>
  );
}

function GettingStartedOnboarding() {
  return (
    <TooltipProvider>
      <section className="home-onboarding card" aria-labelledby="home-onboarding-title">
        <div className="home-onboarding__header">
          <h2 id="home-onboarding-title">Getting started</h2>
          <span>0 of 3 complete</span>
        </div>

        <div className="home-onboarding__steps" aria-label="Onboarding progress">
          <span className="home-onboarding-step home-onboarding-step--current">
            <span className="home-onboarding-step__num">1</span>
            Create budget
          </span>
          <LockedStepChip label="Add funds" />
          <LockedStepChip label="Create shop" />
        </div>

        <div className="home-onboarding-card">
          <span className="home-onboarding-card__icon" aria-hidden="true">
            <Wallet size={22} strokeWidth={2} />
          </span>
          <div className="home-onboarding-card__copy">
            <h3>Set up your organization budget</h3>
            <p>Your budget is required before creating a shop or sending gifts.</p>
          </div>
          <Link to="/app/wallets" state={{ startCreateWallet: true }} className="btn btn-brand">
            Setup budget
          </Link>
        </div>
      </section>
    </TooltipProvider>
  );
}

export function HomePage() {
  const { data: workspace, isLoading, isError, error } = useWorkspace();
  const { canWrite, canManageContacts } = useTenantAccess();
  const canCreateShop = canWrite("shops");
  const canManageDirectory = canManageContacts();
  const sessionUser = getStoredUser();

  if (isLoading && !workspace) {
    return <LoadingState message="Loading home…" fullScreen={false} />;
  }
  if (isError || !workspace) {
    return (
      <div className="card" style={{ padding: 16, color: "var(--danger)" }}>
        {error instanceof Error ? error.message : "Could not load workspace"}
      </div>
    );
  }

  const userName = workspace.userPatch.name || sessionUser?.name || "User";
  const initials = workspace.userPatch.initials || "U";
  const account = workspace.account || "Workspace";
  const roleLabel = formatRole(workspace.userPatch.role);
  const contacts = workspace.contacts ?? [];
  const adminCount = Math.max(1, contacts.filter((c) => /admin|owner/i.test(c.role)).length);
  const memberCount = contacts.length;
  const senderCount = workspace.orders?.length ?? 0;

  const wallets = workspace.wallets ?? [];
  const showOnboarding = wallets.length === 0;
  const orgWallet = workspace.org?.wallet;
  // Match Wallets page: entity managers see remaining dept budget (allocated − spent);
  // company admins see unallocated wallet cash.
  const remainingBalance =
    workspace.userPatch.role === "entity_manager"
      ? entityManagerBudgetRemaining(workspace)
      : workspace.org.active && orgWallet?.unallocated != null
        ? orgWallet.unallocated
        : wallets[0]
          ? walletUnallocated(wallets[0])
          : 0;

  const pinnedShop = getLastShop(workspace.shops);
  const isEntityManager = workspace.userPatch.role === "entity_manager";

  return (
    <div className="home-page fade-in">
      <section className="home-hero card">
        <div className="home-hero__left">
          <div className="home-hero__avatar" aria-hidden="true">
            {initials}
          </div>
          <div>
            <div className="home-hero__name">{userName}</div>
            <div className="home-hero__meta">
              {account} | {roleLabel}
            </div>
          </div>
        </div>
        <div className="home-hero__actions">
          <Link to="/app/settings" className="btn btn-ghost btn-sm">
            Set up my profile
          </Link>
          <Link to="/request-demo" className="btn btn-dark btn-sm">
            Book a demo
          </Link>
        </div>
      </section>

      {showOnboarding ? <GettingStartedOnboarding /> : null}

      <div className={showOnboarding ? "home-layout home-layout--onboarding-muted" : "home-layout"}>
        <div className="home-layout__span-4 home-layout__stack">
          <div className="card home-stats">
            <div className="home-stat">
              <span className="home-stat__label">Admins</span>
              <span className="home-stat__value">{adminCount}</span>
            </div>
            <div className="home-stat">
              <span className="home-stat__label">Senders</span>
              <span className="home-stat__value">{senderCount}</span>
            </div>
            <div className="home-stat">
              <span className="home-stat__label">Members</span>
              <span className="home-stat__value">{memberCount}</span>
            </div>
            {canManageDirectory ? (
              <Link to="/app/contacts" className="home-stat__add" aria-label="Add contacts">
                <Plus size={14} strokeWidth={2.4} aria-hidden="true" />
              </Link>
            ) : null}
          </div>

          <div className="home-card card">
            <h2 className="home-card__title">Help center</h2>
            <ul className="home-help-list">
              {HELP_LINKS.filter(
                (item) => item.href !== "/app/contacts" || canManageDirectory,
              ).map((item) => (
                <li key={item.label}>
                  <Link to={item.href} className="home-help-item">
                    <span className="home-help-item__icon">
                      <item.icon size={16} strokeWidth={2} aria-hidden="true" />
                    </span>
                    {item.label}
                    <ChevronRight
                      className="home-help-item__arrow"
                      size={16}
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="home-layout__span-5">
          <div className="home-card card">
            <h2 className="home-card__title">Getting started</h2>
            <div className="home-video">
              <div className="home-video__play" aria-hidden="true">
                <Play size={22} fill="currentColor" strokeWidth={0} />
              </div>
              <div className="home-video__title">Welcome to Shelf Merch</div>
              <div className="home-video__meta">Your corporate gifting workspace · 2 min overview</div>
            </div>
          </div>
        </div>

        <div className="home-layout__span-3 home-layout__stack--split">
          <Link to="/app/settings" className="home-mini-card card">
            <span className="home-mini-card__icon">
              <Monitor size={20} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span className="home-mini-card__label">Workspace settings</span>
            <span className="home-mini-card__cta">Customize workspace</span>
          </Link>
          {canManageDirectory ? (
            <Link to="/app/contacts" className="home-mini-card card">
              <span className="home-mini-card__icon">
                <Users size={20} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <span className="home-mini-card__label">Contacts</span>
              <span className="home-mini-card__cta">Add members</span>
            </Link>
          ) : null}
        </div>

        <div className="home-layout__span-9">
          <div className="home-card card">
            <h2 className="home-card__title">
              {isEntityManager ? "My budget" : "Budget"}
            </h2>
            <div className="home-wallet-grid">
              <div className="home-wallet-tile">
                <div className="home-wallet-tile__label">
                  {isEntityManager ? "My allocated budget" : `${account} budget`}
                </div>
                <div className="home-wallet-tile__balance">{formatInr(remainingBalance)}</div>
                <div className="home-wallet-tile__sub">Available to spend</div>
              </div>
              {/* {wallets[0] ? (
                // <div className="home-wallet-tile">
                //   <div className="home-wallet-tile__label">{wallets[0].name}</div>
                //   <div className="home-wallet-tile__balance">{formatInr(wallets[0].balance)}</div>
                //   <div className="home-wallet-tile__sub">Allocated funds</div>
                // </div>
              ) : (
                <div className="home-wallet-tile">
                  <div className="home-wallet-tile__label">Points wallet</div>
                  <div className="home-wallet-tile__balance">{formatInr(0)}</div>
                  <div className="home-wallet-tile__sub">Send kits &amp; gifts at scale</div>
                </div>
              )} */}
            </div>
            <div className="home-card__footer">
              <Link to="/app/wallets" className="lnk">
                View budget
              </Link>
            </div>
          </div>
        </div>

        <div className="home-layout__span-5">
          <div className="home-card card">
            <h2 className="home-card__title">Pinned shop</h2>
            {pinnedShop ? (
              <>
                <Link to={`/app/shops/${pinnedShop.id}`} className="home-pinned-shop">
                  <div className="home-pinned-shop__banner">
                    <ShopBanner source={pinnedShop} height={140} layout="center" logoSize={52} />
                  </div>
                  <div className="home-pinned-shop__meta">
                    <h3 className="home-pinned-shop__name">{pinnedShop.name}</h3>
                    {pinnedShop.live ? (
                      <span className="tag tag-live tag-live-outline">
                        <span className="dot" />
                        Live
                      </span>
                    ) : (
                      <span className="tag tag-draft">Draft</span>
                    )}
                  </div>
                </Link>
                <div className="home-card__footer">
                  <Link to={`/app/shops/${pinnedShop.id}`} className="lnk">
                    Open shop
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p className="home-empty-note">
                  Launch a branded shop so recipients can redeem swag on their own schedule.
                </p>
                <div className="home-card__footer">
                  {canCreateShop ? (
                    <Link to="/app/shops/new" className="btn btn-brand btn-sm">
                      <Store size={15} aria-hidden="true" />
                      Create a shop
                    </Link>
                  ) : (
                    <Link to="/app/shops" className="lnk">
                      Browse shops
                    </Link>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <Link to="/app/orders" className="home-layout__span-4 home-mini-card card">
          <span className="home-mini-card__icon">
            <ShoppingBag size={20} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <span className="home-mini-card__label">Orders</span>
          <span className="home-mini-card__cta">{workspace.orders.length} total</span>
        </Link>
        <Link to="/app/catalog" className="home-layout__span-4 home-mini-card card">
          <span className="home-mini-card__icon">
            <Gift size={20} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <span className="home-mini-card__label">Catalog</span>
          <span className="home-mini-card__cta">{workspace.catalogTotal} products</span>
        </Link>
        <Link to="/app/wallets" className="home-layout__span-4 home-mini-card card">
          <span className="home-mini-card__icon">
            <Wallet size={20} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <span className="home-mini-card__label">Budget</span>
          <span className="home-mini-card__cta">Manage funding</span>
        </Link>
      </div>
    </div>
  );
}
