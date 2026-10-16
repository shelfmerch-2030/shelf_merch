import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import {
  ArrowRight,
  Box,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  GlassWater,
  Globe2,
  Gift,
  Headphones,
  Lightbulb,
  LockKeyhole,
  Megaphone,
  Play,
  Plus,
  Settings,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  Sparkles,
  Store,
  Users,
  Landmark,
  type LucideIcon,
} from "lucide-react";
import { LoadingState } from "@/components/LoadingState";
import shelfmerchVideoBanner from "@/assets/shelfmerch-video-banner-16x9.jpg";
import { ShopBanner } from "@/features/shops/banner";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTenantAccess } from "@/hooks/useTenantAccess";
import { getStoredUser } from "@/services/api-bridge";
import { entityManagerBudgetRemaining } from "@/services/workspace-api";
import { walletUnallocated } from "@/lib/walletFormat";
import hoodieImg from "../../../assets/hoodie.png";
import bottleImg from "../../../assets/bottle.png";
import toteImg from "../../../assets/tote.png";
import diaryImg from "../../../assets/diary.png";
import capImg from "../../../assets/cap.png";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { tenantPath } from "@/lib/workspaceSlug";
import type { UiOrgDept, UiProduct } from "@/services/mappers";
import { EntityManagerKitsSection } from "./EntityManagerKitsSection";
import { NewUserWelcomeDialog } from "./NewUserWelcomeDialog";
import "./dashboard.css";

/** Cleared on logout in auth-store so the popup returns on the next login. */
const NEW_USER_WELCOME_DISMISS_KEY = "sm-new-user-welcome-dismissed";

function wasNewUserWelcomeDismissed() {
  try {
    return sessionStorage.getItem(NEW_USER_WELCOME_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function dismissNewUserWelcome() {
  try {
    sessionStorage.setItem(NEW_USER_WELCOME_DISMISS_KEY, "1");
  } catch {
    /* ignore storage failures */
  }
}

function formatInr(amount: number) {
  return `₹ ${Math.round(amount).toLocaleString("en-IN")}`;
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



function onboardingHelpLinks() {
  return [
    { label: "Welcome to Shelf Merch", icon: Play, href: tenantPath() },
    { label: "Create your first shop", icon: Store, href: tenantPath("/shops") },
    { label: "Browse the swag catalog", icon: ShoppingBag, href: tenantPath("/catalog") },
  ];
}

function helpLinks() {
  return [
    { label: "Setup Guide", icon: Box, href: tenantPath() },
    { label: "Watch Demo", icon: Play, href: tenantPath() },
    { label: "Contact Support", icon: Headphones, href: "/request-demo" },
    { label: "Book Demo", icon: CalendarDays, href: "/request-demo" },
  ];
}

const WHY_CARDS = [
  { label: "Gift Employees", body: "Celebrate, reward & motivate your team", icon: "/images/landing/why-gift-employees.png" },
  { label: "Create Shops", body: "Build beautiful shops for teams & events", icon: "/images/landing/why-create-shops.png" },
  { label: "Track & Manage", body: "Track orders, budgets and approvals", icon: "/images/landing/why-track-manage.png" },
] as const;

function shortcuts() {
  return [
    {
      label: "Kits",
      body: "Bundle apparel, drinkware and stationery into ready-to-ship kits.",
      feature: "Curated combos. Zero hassle.",
      href: tenantPath("/kits"),
      icon: "/images/landing/gifting.png",
      tone: "coral",
    },
    {
      label: "Wallet",
      body: "Let teams spend an approved budget, fully tracked and controlled.",
      feature: "Real-time balance. Total visibility.",
      href: tenantPath("/wallets"),
      icon: "/images/landing/wallet-db.png",
      tone: "blue",
    },
    {
      label: "Spot gifting",
      body: "Send a gift the moment it matters. No operational back-and-forth.",
      feature: "Quick, thoughtful & on-brand.",
      href: tenantPath("/campaigns"),
      icon: "/images/landing/on-spot.png",
      tone: "yellow",
    },
    {
      label: "Automated gifting",
      body: "Set the rule once. Birthdays and milestones run automatically.",
      feature: "Always on. Always personal.",
      href: tenantPath("/integrations"),
      icon: "/images/landing/spot-gifting.png",
      tone: "lilac",
    },
  ];
}

const FALLBACK_SEND_ITEMS = [
  { id: "hoodie", name: "Classic Fleece Hoodie", price: "From ₹899", image: hoodieImg, href: tenantPath("/catalog") },
  { id: "bottle", name: "Insulated Water Bottle", price: "From ₹499", image: bottleImg, href: tenantPath("/catalog") },
  { id: "tote", name: "Everyday Canvas Tote", price: "From ₹399", image: toteImg, href: tenantPath("/catalog") },
  { id: "diary", name: "Softcover Notebook", price: "From ₹299", image: diaryImg, href: tenantPath("/catalog") },
  { id: "cap", name: "Structured Cap", price: "From ₹349", image: capImg, href: tenantPath("/catalog") },
] as const;

function quickActions() {
  return [
    { label: "Quick tip", icon: Lightbulb, tone: "blue", href: tenantPath() },
    { label: "Budget controls", icon: Landmark, tone: "amber", href: tenantPath("/wallets") },
    { label: "Order tracking", icon: ShoppingBag, tone: "green", href: tenantPath("/orders") },
  ];
}

function productThumb(p: UiProduct): string | undefined {
  return resolveMediaUrl(p.mockupUrl) || resolveMediaUrl(p.photoUrl) || resolveMediaUrl(p.imgUrl);
}

function productSearchText(p: UiProduct) {
  return `${p.nm || ""} ${p.brand || ""} ${p.category || ""} ${p.subcategory || ""} ${p.g || ""}`.toLowerCase();
}

function pickCatalogPreviewProducts(products: UiProduct[]) {
  const blocked = /foldable wireless|activedry polo|activewear crew|anti-theft laptop|bamboo bluetooth/i;
  const available = products.filter((product) => productThumb(product) && !blocked.test(product.nm));
  const used = new Set<string>();

  const pickOne = (match: RegExp) => {
    const found = available.find((product) => {
      const key = product.id || product.nm;
      return key && !used.has(key) && match.test(productSearchText(product));
    });
    if (found) used.add(found.id || found.nm);
    return found;
  };

  const curated = [
    pickOne(/bottle|tumbler|mug|flask|drinkware/),
    pickOne(/notebook|diary|journal|planner|pen|office|stationery/),
    pickOne(/tote|duffle|sling|bag|backpack/),
    pickOne(/cap|hat|keychain|key chain|accessor/),
    pickOne(/hoodie|jacket|sweatshirt|apparel|shirt|tee/),
  ].filter((product): product is UiProduct => Boolean(product));

  const rest = available.filter((product) => !used.has(product.id || product.nm));
  return [...curated, ...rest].slice(0, 10);
}

function SectionHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="dash-section-head">
      <h2>{title}</h2>
      {action}
    </div>
  );
}

function VideoCard({ wide = false, centered = false }: { wide?: boolean; centered?: boolean }) {
  const [open, setOpen] = useState(false);
  const embedUrl = "https://www.youtube.com/embed/NfoBjC8R7MM?autoplay=1&rel=0&modestbranding=1";
  const className = [
    "dash-video",
    wide ? "dash-video--wide" : "",
    centered ? "dash-video--centered" : "",
  ].filter(Boolean).join(" ");

  return (
    <>
      <section className="dash-video-card card">
        <div className="dash-video-card__head">
          <h2>Getting Started</h2>
          <span aria-hidden="true">-</span>
        </div>
        <button
          type="button"
          className={className}
          aria-label="Watch Shelf Merch overview video"
          onClick={() => setOpen(true)}
        >
          <img className="dash-video__poster" src={shelfmerchVideoBanner} alt="" />
          <span className="dash-video__overlay" aria-hidden="true" />
          <span className="dash-video__play" aria-hidden="true">
            <Play size={22} fill="currentColor" strokeWidth={0} />
          </span>
          <span className="dash-video__hover-copy" aria-hidden="true">
            Watch a quick Shelf Merch overview
          </span>
        </button>
        <div className="dash-video-card__meta">
          <span>Welcome to Shelfmerch</span>
          <i aria-hidden="true" />
          <span>2:26 Min</span>
        </div>
      </section>
      {open ? (
        <div className="dash-video-modal-backdrop" role="presentation">
          <div
            className="dash-video-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Shelf Merch overview video"
          >
            <div className="dash-video-modal__frame">
              <iframe
                src={embedUrl}
                title="Shelf Merch overview video"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
            <button type="button" className="dash-video-modal__done" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function HelpCenter({ onboarding = false }: { onboarding?: boolean }) {
  const links = onboarding ? onboardingHelpLinks() : helpLinks();
  return (
    <section className="dash-card card">
      <SectionHead title={onboarding ? "Help center" : "Need help?"} />
      <ul className="dash-help-list">
        {links.map((item) => {
          const Icon = item.icon;
          const content = (
            <>
              <span className="dash-help-list__icon"><Icon size={15} aria-hidden="true" /></span>
              <span>{item.label}</span>
              <ChevronRight size={16} className="dash-help-list__arrow" aria-hidden="true" />
            </>
          );
          return (
            <li key={item.label}>
              {item.href.startsWith("mailto:") ? (
                <a href={item.href} className="dash-help-list__item">{content}</a>
              ) : (
                <Link to={item.href} className="dash-help-list__item">{content}</Link>
              )}
            </li>
          );
        })}
      </ul>
      {!onboarding ? <p className="dash-help-foot">We're here to help you succeed.</p> : null}
    </section>
  );
}

function WorkspaceSettingsCard({
  preview = false,
  art = false,
  account = "Workspace",
  ownerName = "Owner",
  workspaceSlug = "",
}: {
  preview?: boolean;
  art?: boolean;
  account?: string;
  ownerName?: string;
  workspaceSlug?: string;
}) {
  const slug = workspaceSlug || "workspace";

  if (preview || art) {
    return (
      <Link
        to={tenantPath("/settings")}
        className="dash-settings-card dash-settings-card--preview card"
        aria-label="Customize workspace settings"
      >
        <span className="dash-settings-card__icon"><Settings size={18} aria-hidden="true" /></span>
        <span className="dash-settings-card__copy">
          <strong>Workspace settings</strong>
          <span>Update company profile, owner and workspace URL.</span>
        </span>
        <span className="dash-settings-card__rows" aria-hidden="true">
          <span><Store size={15} /> Workspace name <b>{account}</b></span>
          <span><Users size={15} /> Owner <b>{ownerName}</b></span>
          <span><Globe2 size={15} /> Workspace URL <b>/{slug}</b></span>
        </span>
        <span className="dash-settings-card__cta">Customize workspace <ArrowRight size={15} /></span>
      </Link>
    );
  }

  return (
    <Link to={tenantPath("/settings")} className="dash-settings-card card">
      <span className="dash-settings-card__icon"><Settings size={22} aria-hidden="true" /></span>
      <span className="dash-settings-card__copy">
        <strong>Workspace settings</strong>
        <span>Manage members, approvals, budgets & more.</span>
      </span>
      <span className="dash-settings-card__art" aria-hidden="true"><i /><b /></span>
      <span className="dash-settings-card__cta">Customize workspace <ArrowRight size={16} /></span>
    </Link>
  );
}

function ShortcutGrid() {
  return (
    <section className="dash-shortcuts card">
      <SectionHead title="Everything you can do" />
      <div className="dash-shortcut-grid">
        {shortcuts().map((item) => (
          <Link
            key={item.label}
            to={item.href}
            className={`dash-shortcut dash-shortcut--${item.tone}`}
          >
            <span className="dash-shortcut__icon" aria-hidden="true">
              <img src={item.icon} alt="" />
            </span>
            <strong className="dash-shortcut__title">{item.label}</strong>
            <span className="dash-shortcut__body">{item.body}</span>
            <span className="dash-shortcut__foot">
              <span className="dash-shortcut__go" aria-hidden="true">
                <ArrowRight size={15} strokeWidth={2.2} />
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function SetupVisual() {
  return (
    <div className="dash-setup-visual" aria-hidden="true">
      <img className="dash-setup-visual__img" src="/images/dashboard-setup-3d.png" alt="" />
    </div>
  );
}

function QuickTipsCard() {
  return (
    <section className="dash-tip-card" aria-label="Quick actions and tips">
      <header className="dash-tip-card__title">
        <span className="dash-tip-card__title-icon" aria-hidden="true">
          <Lightbulb size={16} />
        </span>
        <h2>Quick actions & tips</h2>
        {/* <Sparkles className="dash-tip-card__spark" size={18} aria-hidden="true" /> */}
      </header>
      <ul className="dash-tip-card__list">
        {quickActions().map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.label}>
              <Link to={item.href} className="dash-tip-card__row">
                <span className={`dash-tip-card__row-icon dash-tip-card__row-icon--${item.tone}`} aria-hidden="true">
                  <Icon size={15} />
                </span>
                <span>{item.label}</span>
                <ChevronRight size={16} aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CatalogSendCard({ products }: { products: UiProduct[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const items = pickCatalogPreviewProducts(products)
    .map((p) => {
      const image = productThumb(p);
      if (!image) return null;
      return {
        id: p.id || p.nm,
        name: p.nm,
        price: p.price || p.brand || "Catalog item",
        image,
        href: p.id ? `${tenantPath("/catalog")}/${p.id}` : tenantPath("/catalog"),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 10);

  const sendItems = items.length > 0 ? items : FALLBACK_SEND_ITEMS;

  const scrollBy = (dir: -1 | 1) => {
    scrollerRef.current?.scrollBy({ left: dir * 220, behavior: "smooth" });
  };

  return (
    <section className="dash-send-card card">
      <SectionHead
        title="What can you send?"
        action={<Link to={tenantPath("/catalog")} className="dash-inline-action">Browse catalog <ArrowRight size={14} /></Link>}
      />
      <div className="dash-send-rail">
        <button type="button" className="dash-send-nav" aria-label="Previous products" onClick={() => scrollBy(-1)}>
          <ChevronLeft size={18} />
        </button>
        <div className="dash-send-track" ref={scrollerRef}>
          {sendItems.map((item) => (
            <Link key={item.id} to={item.href} className="dash-send-item">
              <span className="dash-send-item__media">
                <img src={item.image} alt="" />
              </span>
              <strong>{item.name}</strong>
              <small>{item.price}</small>
            </Link>
          ))}
        </div>
        <button type="button" className="dash-send-nav" aria-label="Next products" onClick={() => scrollBy(1)}>
          <ChevronRight size={18} />
        </button>
      </div>
    </section>
  );
}

function OnboardingDashboard({
  catalogProducts,
  account,
  ownerName,
  workspaceSlug,
}: {
  catalogProducts: UiProduct[];
  account: string;
  ownerName: string;
  workspaceSlug: string;
}) {
  return (
    <div className="dash-onboard">
      <section className="dash-setup card">
        <div className="dash-setup__glow" aria-hidden="true" />
        <div className="dash-setup__copy">
          <span className="dash-setup__eyebrow"><Sparkles size={14} /> Let's get started</span>
          <h1>Set up your gifting workspace</h1>
          <p>Set up your organization budget to unlock your gifting journey.</p>
          <Link to={tenantPath("/wallets")} state={{ startCreateWallet: true }} className="dash-setup__cta">
            <span className="dash-setup__cta-shine" aria-hidden="true" />
            <Landmark size={20} aria-hidden="true" />
            Setup budget
            <ArrowRight size={20} aria-hidden="true" />
          </Link>
          <div className="dash-setup__trust">
            <span><ShieldCheck size={15} /> No credit card required</span>
            <span><Users size={15} /> Admin only</span>
            <span><LockKeyhole size={15} /> Secure approval flow</span>
          </div>
        </div>
        <SetupVisual />
      </section>

      <section className="dash-onboard-mid">
        <section className="dash-why-panel card">
          <SectionHead title="Why Shelf Merch?" />
          <ul className="dash-why-list">
            {WHY_CARDS.map((item) => (
              <li key={item.label}>
                <span className="dash-why-list__icon" aria-hidden="true">
                  <img src={item.icon} alt="" />
                </span>
                <span>
                  <strong>{item.label}</strong>
                  <p>{item.body}</p>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="dash-onboard-video">
          <VideoCard centered />
        </div>

        <div className="dash-onboard-side">
          <HelpCenter onboarding />
          <WorkspaceSettingsCard art account={account} ownerName={ownerName} workspaceSlug={workspaceSlug} />
        </div>
      </section>

      <section className="dash-onboard-lower">
        <QuickTipsCard />
        <CatalogSendCard products={catalogProducts} />
      </section>

      <ShortcutGrid />
    </div>
  );
}

function MetricSummaryPanel({ items }: {
  items: {
    label: string;
    value: string | number;
    subcopy: string;
    href: string;
    cta: string;
    tone: "violet" | "blue" | "green" | "amber";
    icon: LucideIcon;
  }[];
}) {
  return (
    <section className="dash-metrics-panel card">
      <div className="dash-metrics-panel__head">
        <h2>Overview ({items.length})</h2>
        <button type="button" aria-label="More overview options">...</button>
      </div>
      <div className="dash-metrics-panel__grid">
        {items.map((item) => (
          <article key={item.label} className={`dash-metric-summary dash-metric-summary--${item.tone}`}>
            <span className="dash-metric-summary__icon" aria-hidden="true">
              <item.icon size={22} strokeWidth={2.2} />
            </span>
            <div className="dash-metric-summary__top">
              <span>{item.label}</span>
            </div>
            <div className="dash-metric-summary__body">
              <strong>{item.value}</strong>
              <span>{item.subcopy}</span>
            </div>
            <div className="dash-metric-summary__rule" />
            <Link to={item.href} className="dash-metric-summary__cta">
              {item.cta}
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

function CampaignPromoCard() {
  return (
    <section className="dash-campaign-card dash-feature-card dash-feature-card--campaign card" aria-labelledby="dash-campaign-title">
      <header className="dash-feature-card__header">
        <span className="dash-feature-card__header-icon" aria-hidden="true"><Megaphone size={17} /></span>
        <div>
          <h3 id="dash-campaign-title">Campaigns</h3>
          <p>Create and track sends</p>
        </div>
      </header>
      <ul className="dash-feature-card__list">
        <li><Link to={tenantPath("/campaigns")}><Sparkles size={14} /><span>Points campaigns</span><ChevronRight size={14} /></Link></li>
        <li><Link to={tenantPath("/kits")}><Box size={14} /><span>Kits for teams</span><ChevronRight size={14} /></Link></li>
        <li><Link to={tenantPath("/orders")}><Globe2 size={14} /><span>Delivery visibility</span><ChevronRight size={14} /></Link></li>
      </ul>
      <div className="dash-feature-card__art" aria-hidden="true">
        <img src="/images/dashboard-campaigns-corner.png" alt="" />
      </div>
      <footer className="dash-feature-card__footer">
        <Link to={tenantPath("/campaigns")} className="dash-feature-card__link">
          View Campaigns
          <ArrowRight size={13} strokeWidth={2.4} aria-hidden="true" />
        </Link>
        <Link to={tenantPath("/campaigns")} className="dash-feature-card__button"><Plus size={14} />New campaign</Link>
      </footer>
    </section>
  );
}
function SwagPromoCard() {
  return (
    <section className="dash-swag-card dash-feature-card dash-feature-card--swag card" aria-labelledby="dash-swag-title">
      <div className="dash-swag-card__main dash-feature-card__surface">
        <header className="dash-feature-card__header">
          <span className="dash-feature-card__header-icon" aria-hidden="true"><Shirt size={17} /></span>
          <div>
          <h3 id="dash-swag-title">Swag</h3>
            <p>Explore team merch</p>
          </div>
        </header>
        <ul className="dash-feature-card__list">
          <li><Link to={tenantPath("/swag")}><Shirt size={14} /><span>Apparel and bags</span><ChevronRight size={14} /></Link></li>
          <li><Link to={tenantPath("/swag")}><GlassWater size={14} /><span>Bottles and notebooks</span><ChevronRight size={14} /></Link></li>
          <li><Link to={tenantPath("/kits")}><Gift size={14} /><span>Ready-to-send gifts</span><ChevronRight size={14} /></Link></li>
        </ul>
        <div className="dash-feature-card__art" aria-hidden="true">
          <img src="/images/dashboard-swag-corner.png" alt="" />
        </div>
        <footer className="dash-feature-card__footer">
          <Link to={tenantPath("/swag")} className="dash-feature-card__link">
            Browse Swag
            <ArrowRight size={13} strokeWidth={2.4} aria-hidden="true" />
          </Link>
          <Link to={tenantPath("/kits/new")} className="dash-feature-card__button"><Plus size={14} />Build a kit</Link>
        </footer>
      </div>
    </section>
  );
}

function BudgetSection({
  mainBalance,
  departments,
}: {
  mainBalance: number;
  departments: UiOrgDept[];
}) {
  const colors = ["#35b5e5", "#df4545", "#ffc329", "#30b87a", "#7657d6"];
  const allocatedDepartments = departments.filter((dept) => (dept.allocated ?? 0) > 0);
  const departmentSegments = allocatedDepartments.map((dept, index) => ({
    name: dept.name,
    value: Math.max(0, dept.allocated ?? 0),
    color: colors[index % colors.length],
  }));
  const allocatedToDepartments = departmentSegments.reduce((sum, item) => sum + item.value, 0);
  const visibleDepartments = departmentSegments.slice(0, 5);
  const distributionItems = visibleDepartments.length
    ? visibleDepartments
    : [
        {
          name: "No department allocations",
          value: 0,
          color: colors[0],
        },
      ];
  const chartBase = allocatedToDepartments + Math.max(0, mainBalance);
  const chartPercent = chartBase > 0 ? Math.max(0, Math.min(100, Math.round((allocatedToDepartments / chartBase) * 100))) : 0;
  let segmentStart = 0;
  const allocatedStops = departmentSegments.map((item) => {
    const segmentEnd = segmentStart + (chartBase > 0 ? (item.value / chartBase) * 100 : 0);
    const stop = `${item.color} ${segmentStart}% ${segmentEnd}%`;
    segmentStart = segmentEnd;
    return stop;
  });
  const gaugeGradient = [
    ...allocatedStops,
    `#edf1f7 ${segmentStart}% 100%`,
  ].join(", ");

  return (
    <section className="dash-card card dash-wallets-card">
      <SectionHead
        title="Budget distribution"
        action={
          <Link to={tenantPath("/wallets")} className="dash-inline-action">
            View budget <ArrowRight size={14} />
          </Link>
        }
      />
      <div className="dash-budget-distribution">
        <div className="dash-budget-distribution__chart" aria-hidden="true">
          <span style={{ background: `conic-gradient(from -130deg, ${gaugeGradient})` }}>
            <b>{chartPercent}%</b>
            <small>Allocated</small>
          </span>
        </div>
        <div className="dash-budget-distribution__details">
          <div className="dash-budget-distribution__summary">
            <span>Allocated to departments</span>
            <strong>{formatInr(allocatedToDepartments)}</strong>
            <small>Earmarked for department budgets</small>
          </div>
          <div className="dash-budget-distribution__list">
            {distributionItems.map((item) => {
              const percent = allocatedToDepartments > 0
                ? Math.round((item.value / allocatedToDepartments) * 100)
                : 0;
              return (
                <Link to={tenantPath("/wallets")} key={item.name} className="dash-budget-distribution__row">
                  <span>
                    <i style={{ background: item.color }} />
                    {item.name}
                  </span>
                  <b>{percent}%</b>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

type DashboardShop = {
  id: string;
  name: string;
  slug?: string;
  live: boolean;
  logoUrl?: string;
  bannerConfig?: Record<string, unknown>;
};

function PinnedShopCard({ pinnedShop, canCreateShop }: { pinnedShop: DashboardShop | null; canCreateShop: boolean }) {
  return (
    <section className="dash-card card dash-pinned-shop">
      <SectionHead title="Pinned shop" action={<Link to={tenantPath("/shops")} className="dash-inline-action">Manage shop <ArrowRight size={14} /></Link>} />
      {pinnedShop ? (
        <>
          <Link to={`${tenantPath("/shops")}/${pinnedShop.id}`} className="dash-shop-banner-link">
            <ShopBanner source={pinnedShop} height={126} layout="center" logoSize={58} radius={10} />
          </Link>
          <div className="dash-shop-meta">
            <span className={`dash-shop-status${pinnedShop.live ? " is-live" : ""}`}>
              {pinnedShop.live ? "Active" : "Draft"}
            </span>
            <strong className="dash-shop-name">{pinnedShop.name}</strong>
            <small className="dash-shop-url">
              {pinnedShop.slug ? `shelfmerch.com/${pinnedShop.slug}` : "Shelf Merch shop"}
            </small>
          </div>
          <Link to={`${tenantPath("/shops")}/${pinnedShop.id}`} className="dash-open-shop">Open Shop <ArrowRight size={15} /></Link>
        </>
      ) : (
        <>
          <p className="dash-empty-note">Launch a branded shop so recipients can redeem swag on their own schedule.</p>
          <Link to={canCreateShop ? tenantPath("/shops/new") : tenantPath("/shops")} className="dash-open-shop">
            {canCreateShop ? "Create a shop" : "Browse shops"} <ArrowRight size={15} />
          </Link>
        </>
      )}
    </section>
  );
}

function ExistingDashboard({
  account,
  memberCount,
  senderCount,
  activeShopCount,
  mainBalance,
  departments,
  pinnedShop,
  canCreateShop,
  ownerName,
  workspaceSlug,
}: {
  account: string;
  memberCount: number;
  senderCount: number;
  activeShopCount: number;
  mainBalance: number;
  departments: UiOrgDept[];
  pinnedShop: DashboardShop | null;
  canCreateShop: boolean;
  ownerName: string;
  workspaceSlug: string;
}) {
  const overviewItems = [
    { label: "Gifts sent", value: senderCount, subcopy: "Total gifts sent", tone: "violet" as const, icon: Gift, href: tenantPath("/kits"), cta: "Go to kits" },
    { label: "People reached", value: memberCount, subcopy: "Recipients reached", tone: "blue" as const, icon: Users, href: tenantPath("/orders"), cta: "Go to orders" },
    { label: "Active shops", value: activeShopCount, subcopy: "Live shops", tone: "green" as const, icon: Store, href: tenantPath("/shops"), cta: "Go to shops" },
    { label: "Available budget", value: formatInr(mainBalance), subcopy: "Available to spend", tone: "amber" as const, icon: Landmark, href: tenantPath("/wallets"), cta: "Go to budget" },
  ];

  return (
    <>
      <section className="dash-existing-top">
        <MetricSummaryPanel items={overviewItems} />
        <WorkspaceSettingsCard preview account={account} ownerName={ownerName} workspaceSlug={workspaceSlug} />
      </section>

  

      <section className="dash-existing-main">
        <div className="dash-existing-main__wallets">
          <BudgetSection
            mainBalance={mainBalance}
            departments={departments}
          />
        </div>
        <div className="dash-existing-main__video"><div className="dash-promo-pair"><CampaignPromoCard /><SwagPromoCard /></div></div>
      </section>

      <section className="dash-existing-grid dash-existing-grid--balanced">
        <div className="dash-existing-grid__shop"><PinnedShopCard pinnedShop={pinnedShop} canCreateShop={canCreateShop} /></div>
        <div className="dash-existing-grid__settings"><VideoCard wide /></div>
        <div className="dash-existing-grid__help"><HelpCenter /></div>
      </section>
      <ShortcutGrid />
    </>
  );
}

export function DashboardPage() {
  const location = useLocation();
  const { data: workspace, isLoading, isError, error } = useWorkspace();
  const { canWrite } = useTenantAccess();
  const canCreateShop = canWrite("shops");
  const sessionUser = getStoredUser();
  const [welcomeOpen, setWelcomeOpen] = useState(true);

  useEffect(() => {
    document.title = "Dashboard | Shelf Merch";
  }, []);

  if (isLoading && !workspace) {
    return <LoadingState message="Loading dashboard..." fullScreen={false} />;
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
  const ownerName = workspace.owner?.name || userName;
  const workspaceSlug = workspace.slug || "workspace";
  const roleLabel = formatRole(workspace.userPatch.role);
  const contacts = workspace.contacts ?? [];
  const memberCount = contacts.length;
  const senderCount = workspace.orders?.length ?? 0;
  const wallets = workspace.wallets ?? [];
  const orgWallet = workspace.org?.wallet;
  // Match Wallets page: entity managers see remaining dept budget (allocated − spent);
  // company admins see unallocated wallet cash.
  const mainBalance =
    workspace.userPatch.role === "entity_manager"
      ? entityManagerBudgetRemaining(workspace)
      : workspace.org.active && orgWallet?.unallocated != null
        ? orgWallet.unallocated
        : wallets[0]
          ? walletUnallocated(wallets[0])
          : 0;
  const pinnedShop = workspace.shops.find((s) => s.live) ?? workspace.shops[0] ?? null;
  const activeShopCount = workspace.shops.filter((s) => s.live).length || workspace.shops.length;
  const showOnboarding = wallets.length === 0;
  const previewWelcome = new URLSearchParams(location.search).get("previewWelcome") === "1";
  const showWelcome =
    welcomeOpen && (previewWelcome || (showOnboarding && !wasNewUserWelcomeDismissed()));

  function closeWelcome() {
    if (!previewWelcome) dismissNewUserWelcome();
    setWelcomeOpen(false);
  }

  return (
    <div className="dash-page fade-in">
      {showWelcome ? (
        <NewUserWelcomeDialog
          open
          firstName={userName.trim().split(/\s+/)[0]}
          onClose={closeWelcome}
        />
      ) : null}

      <section className="dash-welcome card">
        <div className="dash-welcome__left">
          <div className="dash-welcome__avatar" aria-hidden="true">{initials}</div>
          <div>
            <div className="dash-welcome__name">Welcome, {userName} 👋</div>
            <div className="dash-welcome__meta">{account} | {roleLabel}</div>
          </div>
        </div>
        <div className="dash-welcome__actions">
          <Link to={tenantPath("/settings")} className="btn btn-ghost btn-sm">Set up my profile</Link>
          <Link to="/request-demo" className="btn btn-dark btn-sm">Book a demo</Link>
        </div>
      </section>

      {showOnboarding ? (
        <OnboardingDashboard
          catalogProducts={workspace.catalogProducts ?? []}
          account={account}
          ownerName={ownerName}
          workspaceSlug={workspaceSlug}
        />
      ) : (
        <ExistingDashboard
          account={account}
          memberCount={memberCount}
          activeShopCount={activeShopCount}
          senderCount={senderCount}
          mainBalance={mainBalance}
          departments={workspace.org.departments ?? []}
          pinnedShop={pinnedShop}
          canCreateShop={canCreateShop}
          ownerName={ownerName}
          workspaceSlug={workspaceSlug}
        />
      )}
    </div>
  );
}
