import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  ArrowRight,
  Backpack,
  BarChart3,
  Box,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Coffee,
  CreditCard,
  Gift,
  GlassWater,
  Headphones,
  Lightbulb,
  LockKeyhole,
  Megaphone,
  NotebookPen,
  PackageCheck,
  Play,
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
import { DashboardLoadingSkeleton } from "@/components/LoadingState";
import { ShopBanner } from "@/features/shops/banner";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTenantAccess } from "@/hooks/useTenantAccess";
import { getStoredUser } from "@/services/api-bridge";
import { entityManagerBudgetRemaining } from "@/services/workspace-api";
import { walletUnallocated } from "@/lib/walletFormat";
import workspaceSettingsImg from "../../../assets/workspace-setting-tab.png";
import setupHeroImg from "../../../assets/dash-setup-hero.png";
import metricGiftsIcon from "../../../assets/dash-metric-gifts.png";
import metricPeopleIcon from "../../../assets/dash-metric-people.png";
import metricShopsIcon from "../../../assets/dash-metric-shops.png";
import metricBudgetIcon from "../../../assets/dash-metric-budget.png";
import metricArtGifts from "../../../assets/dash-metric-art-gifts.png";
import metricArtPeople from "../../../assets/dash-metric-art-people.png";
import metricArtShops from "../../../assets/dash-metric-art-shops.png";
import metricArtBudget from "../../../assets/dash-metric-art-budget.png";
import hoodieImg from "../../../assets/hoodie.png";
import bottleImg from "../../../assets/bottle.png";
import toteImg from "../../../assets/tote.png";
import diaryImg from "../../../assets/diary.png";
import capImg from "../../../assets/cap.png";
import swagProductsImg from "../../../assets/dash-swag-products.png";
import campaignArtImg from "../../../assets/dash-campaign-art.png";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import type { UiProduct } from "@/services/mappers";
import { EntityManagerKitsSection } from "./EntityManagerKitsSection";
import "./dashboard.css";

function formatInr(amount: number) {
  return `Rs ${Math.round(amount).toLocaleString("en-IN")}`;
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

const ONBOARDING_HELP_LINKS = [
  { label: "Welcome to Shelf Merch", icon: Play, href: "/app" },
  { label: "Create your first shop", icon: Store, href: "/app/shops" },
  { label: "Browse the swag catalog", icon: ShoppingBag, href: "/app/catalog" },
] as const;

const HELP_LINKS = [
  { label: "Setup Guide", icon: Box, href: "/app" },
  { label: "Watch Demo", icon: Play, href: "/app" },
  { label: "Contact Support", icon: Headphones, href: "/request-demo" },
  { label: "Book Demo", icon: CalendarDays, href: "/request-demo" },
] as const;

const WHY_CARDS = [
  { label: "Gift Employees", body: "Celebrate, reward & motivate your team", icon: Gift },
  { label: "Create Shops", body: "Build beautiful shops for teams & events", icon: Store },
  { label: "Track & Manage", body: "Track orders, budgets and approvals", icon: BarChart3 },
] as const;

const SHORTCUTS = [
  { label: "Budget", body: "Manage organization budget & funding", href: "/app/wallets", icon: Landmark, tone: "blue" },
  { label: "Shops", body: "Create & manage your shops", href: "/app/shops", icon: Store, tone: "green" },
  { label: "Catalog", body: "Browse 5,000+ products", href: "/app/catalog", icon: Gift, tone: "orange" },
  { label: "Orders", body: "Track orders & deliveries", href: "/app/orders", icon: Box, tone: "purple" },
  { label: "Kits", body: "Pre-built kits for every occasion", href: "/app/kits", icon: PackageCheck, tone: "rose" },
] as const;

const FALLBACK_SEND_ITEMS = [
  { id: "hoodie", name: "Classic Fleece Hoodie", price: "From ₹899", image: hoodieImg, href: "/app/catalog" },
  { id: "bottle", name: "Insulated Water Bottle", price: "From ₹499", image: bottleImg, href: "/app/catalog" },
  { id: "tote", name: "Everyday Canvas Tote", price: "From ₹399", image: toteImg, href: "/app/catalog" },
  { id: "diary", name: "Softcover Notebook", price: "From ₹299", image: diaryImg, href: "/app/catalog" },
  { id: "cap", name: "Structured Cap", price: "From ₹349", image: capImg, href: "/app/catalog" },
] as const;

const QUICK_TIPS = [
  {
    title: "Quick tip",
    body: "Your organization has one budget — allocate portions to departments as needed.",
    icon: Lightbulb,
    tone: "peach",
  },
  {
    title: "Security first",
    body: "All transactions are secure and require admin approval before processing.",
    icon: ShieldCheck,
    tone: "mint",
  },
  {
    title: "Admin control",
    body: "Only admins can manage the organization budget, members and approvals.",
    icon: Users,
    tone: "sky",
  },
  {
    title: "Track effortlessly",
    body: "Monitor your gifting activity, budgets and sent gifts all in one place.",
    icon: Gift,
    tone: "lemon",
  },
  {
    title: "No hidden fees",
    body: "There are no setup or transaction fees. What you see is what you get.",
    icon: CreditCard,
    tone: "rose",
  },
] as const;

function productThumb(p: UiProduct): string | undefined {
  return resolveMediaUrl(p.mockupUrl) || resolveMediaUrl(p.photoUrl) || resolveMediaUrl(p.imgUrl);
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
  const className = [
    "dash-video",
    wide ? "dash-video--wide" : "",
    centered ? "dash-video--centered" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={className}>
      {wide && !centered ? <span className="dash-video__badge">2 min overview</span> : null}
      <button className="dash-video__play" type="button" aria-label="Play welcome video">
        <Play size={centered ? 28 : wide ? 15 : 24} fill="currentColor" strokeWidth={0} />
      </button>
      <div className="dash-video__copy">
        <h3>Welcome to Shelf Merch</h3>
        <p>
          {centered || !wide
            ? "Your corporate gifting workspace - 2 min overview"
            : "See how your corporate gifting workspace works"}
        </p>
      </div>
      {(wide || centered) ? (
        <div className="dash-video__controls" aria-hidden="true">
          <span>0:00</span>
          <i><b /></i>
          <span>2:00</span>
        </div>
      ) : null}
    </div>
  );
}

function HelpCenter({ onboarding = false }: { onboarding?: boolean }) {
  const links = onboarding ? ONBOARDING_HELP_LINKS : HELP_LINKS;
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

function WorkspaceSettingsCard({ preview = false, art = false }: { preview?: boolean; art?: boolean }) {
  if (preview || art) {
    return (
      <Link
        to="/app/settings"
        className="dash-settings-card dash-settings-card--preview card"
        aria-label="Customize workspace settings"
      >
        <img
          className="dash-settings-card__image"
          src={art ? workspaceSettingsImg : workspaceSettingsImg}
          alt="Workspace settings preview"
        />
      </Link>
    );
  }

  return (
    <Link to="/app/settings" className="dash-settings-card card">
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
        {SHORTCUTS.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.label} to={item.href} className={`dash-shortcut dash-shortcut--${item.tone}`}>
              <span className="dash-shortcut__icon"><Icon size={28} strokeWidth={2.2} aria-hidden="true" /></span>
              <strong>{item.label}</strong>
              <span>{item.body}</span>
              <i><ArrowRight size={18} aria-hidden="true" /></i>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function SetupVisual() {
  return (
    <div className="dash-setup-visual" aria-hidden="true">
      <img className="dash-setup-visual__img" src={setupHeroImg} alt="" />
    </div>
  );
}

function QuickTipsCard() {
  const [index, setIndex] = useState(0);
  const [hovering, setHovering] = useState(false);
  const tip = QUICK_TIPS[index];
  const Icon = tip.icon;

  useEffect(() => {
    if (!hovering) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % QUICK_TIPS.length);
    }, 2200);
    return () => window.clearInterval(id);
  }, [hovering]);

  return (
    <section
      className={`dash-tip-card card dash-tip-card--${tip.tone}`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      aria-label="Quick tips. Hover to cycle tips."
    >
      <div key={tip.title} className="dash-tip-card__slide">
        <div className="dash-tip-card__head">
          <span className="dash-tip-card__icon" aria-hidden="true"><Icon size={18} /></span>
          <h2>{tip.title}</h2>
        </div>
        <p>{tip.body}</p>
      </div>
      <div className="dash-tip-dots" aria-hidden="true">
        {QUICK_TIPS.map((item, i) => (
          <i key={item.title} className={i === index ? "is-active" : undefined} />
        ))}
      </div>
    </section>
  );
}

function CatalogSendCard({ products }: { products: UiProduct[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const items = products
    .map((p) => {
      const image = productThumb(p);
      if (!image) return null;
      return {
        id: p.id || p.nm,
        name: p.nm,
        price: p.price || p.brand || "Catalog item",
        image,
        href: p.id ? `/app/catalog/${p.id}` : "/app/catalog",
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
        action={<Link to="/app/catalog" className="dash-inline-action">Browse catalog <ArrowRight size={14} /></Link>}
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

function OnboardingDashboard({ catalogProducts }: { catalogProducts: UiProduct[] }) {
  return (
    <div className="dash-onboard">
      <section className="dash-setup card">
        <div className="dash-setup__glow" aria-hidden="true" />
        <div className="dash-setup__copy">
          <span className="dash-setup__eyebrow"><Sparkles size={14} /> Let's get started</span>
          <h1>Set up your gifting workspace</h1>
          <p>Set up your organization budget to unlock your gifting journey.</p>
          <Link to="/app/wallets" state={{ startCreateWallet: true }} className="dash-setup__cta">
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
            {WHY_CARDS.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.label}>
                  <span className="dash-why-list__icon"><Icon size={18} aria-hidden="true" /></span>
                  <span>
                    <strong>{item.label}</strong>
                    <p>{item.body}</p>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="dash-onboard-video">
          <VideoCard centered />
        </div>

        <div className="dash-onboard-side">
          <HelpCenter onboarding />
          <WorkspaceSettingsCard art />
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

function MetricCard({
  label,
  value,
  iconSrc,
  artSrc,
  tone,
  href,
  cta,
}: {
  label: string;
  value: string | number;
  iconSrc: string;
  artSrc: string;
  tone: "violet" | "blue" | "green" | "amber";
  href: string;
  cta: string;
}) {
  return (
    <div className={`dash-metric dash-metric--${tone} card`}>
      <div className="dash-metric__top">
        <span className="dash-metric__icon" aria-hidden="true">
          <span
            className="dash-metric__icon-img"
            style={{ ["--metric-icon" as string]: `url(${iconSrc})` }}
          />
        </span>
        <span className="dash-metric__label">{label}</span>
      </div>
      <div className="dash-metric__mid">
        <strong className="dash-metric__value">{value}</strong>
        <img className="dash-metric__art" src={artSrc} alt="" aria-hidden="true" />
      </div>
      <Link to={href} className="dash-metric__cta">
        {cta} <ChevronRight size={14} aria-hidden="true" />
      </Link>
    </div>
  );
}

type SwagStripCategory = {
  label: string;
  icon: LucideIcon;
  count: number;
};

function productHaystack(p: UiProduct) {
  return `${p.category || ""} ${p.nm || ""} ${p.g || ""}`.toLowerCase();
}

function buildSwagStripCategories(products: UiProduct[]): SwagStripCategory[] {
  const defs: { label: string; icon: LucideIcon; match: (p: UiProduct) => boolean }[] = [
    {
      label: "Hoodies",
      icon: Shirt,
      match: (p) =>
        p.category === "Apparel" || /hoodie|sweatshirt|apparel|tee|shirt/.test(productHaystack(p)),
    },
    {
      label: "Drinkware",
      icon: GlassWater,
      match: (p) =>
        (p.category === "Drinkware" || /bottle|tumbler|flask|drinkware/.test(productHaystack(p))) &&
        !/mug|cup/.test(productHaystack(p)),
    },
    {
      label: "Office Supplies",
      icon: NotebookPen,
      match: (p) =>
        p.category === "Office" || /note|pen|diary|journal|stationery|office/.test(productHaystack(p)),
    },
    {
      label: "Bags",
      icon: Backpack,
      match: (p) => p.category === "Bags" || /bag|tote|backpack/.test(productHaystack(p)),
    },
    {
      label: "Mugs",
      icon: Coffee,
      match: (p) => /mug|cup/.test(productHaystack(p)) || p.g === "mug",
    },
  ];

  return defs.map((def) => ({
    label: def.label,
    icon: def.icon,
    count: products.filter(def.match).length,
  }));
}

function CampaignPromoCard() {
  return (
    <section className="dash-campaign-card card" aria-labelledby="dash-campaign-title">
      <div className="dash-campaign-card__copy">
        <span className="dash-campaign-card__icon" aria-hidden="true">
          <Megaphone size={19} strokeWidth={2} />
        </span>
        <h3 id="dash-campaign-title">Campaigns</h3>
        <p>Track points campaigns and kit-send history.</p>
        <Link to="/app/campaigns" className="dash-campaign-card__cta">
          View All Campaigns
          <ArrowRight size={15} strokeWidth={2.4} aria-hidden="true" />
        </Link>
      </div>
      <div className="dash-campaign-card__art" aria-hidden="true">
        <img src={campaignArtImg} alt="" />
      </div>
    </section>
  );
}
function SwagPromoCard({ products }: { products: UiProduct[] }) {
  const stripRef = useRef<HTMLDivElement>(null);
  const categories = buildSwagStripCategories(products);

  function scrollCategories() {
    stripRef.current?.scrollBy({ left: 168, behavior: "smooth" });
  }

  return (
    <section className="dash-swag-card card" aria-labelledby="dash-swag-title">
      <div className="dash-swag-card__main">
        <div className="dash-swag-card__copy">
          <span className="dash-swag-card__icon" aria-hidden="true">
            <ShoppingBag size={18} strokeWidth={2} />
          </span>
          <h3 id="dash-swag-title">Swag</h3>
          <p>Explore branded swag and merchandise for your team and recipients.</p>
          <Link to="/app/swag" className="dash-swag-card__cta">
            Browse Swag
            <ArrowRight size={16} strokeWidth={2.4} aria-hidden="true" />
          </Link>
        </div>

        <div className="dash-swag-card__showcase" aria-hidden="true">
          <span className="dash-swag-card__glow" />
          <span className="dash-swag-card__dots" />
          <span className="dash-swag-card__leaf">
            <svg viewBox="0 0 64 72" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M32 68C32 68 8 52 8 28C8 14 18 4 32 4C46 4 56 14 56 28C56 52 32 68 32 68Z"
                fill="url(#swagLeafGrad)"
                opacity="0.55"
              />
              <path d="M32 66V10" stroke="#e8a078" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
              <path
                d="M32 24C24 28 18 34 14 42M32 36C38 40 44 46 48 54"
                stroke="#f0b892"
                strokeWidth="1.2"
                strokeLinecap="round"
                opacity="0.65"
              />
              <defs>
                <linearGradient id="swagLeafGrad" x1="8" y1="4" x2="56" y2="68" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#ffd4b8" />
                  <stop offset="1" stopColor="#f4a574" />
                </linearGradient>
              </defs>
            </svg>
          </span>
          <span className="dash-swag-card__podium" />
          <img className="dash-swag-card__showcase-img" src={swagProductsImg} alt="" />
        </div>
      </div>

      <div className="dash-swag-card__strip">
        <div className="dash-swag-card__cats" ref={stripRef} role="list">
          {categories.map((cat) => {
            const Icon = cat.icon;
            return (
              <div key={cat.label} className="dash-swag-card__cat" role="listitem">
                <span className="dash-swag-card__cat-icon" aria-hidden="true">
                  <Icon size={16} strokeWidth={2} />
                </span>
                <span className="dash-swag-card__cat-copy">
                  <strong>{cat.label}</strong>
                  <small>
                    {cat.count} {cat.count === 1 ? "Item" : "Items"}
                  </small>
                </span>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className="dash-swag-card__scroll"
          aria-label="Scroll categories"
          onClick={scrollCategories}
        >
          <ChevronRight size={16} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

function BudgetSection({
  account,
  mainBalance,
  hasBudget,
  isEntityManager,
}: {
  account: string;
  mainBalance: number;
  hasBudget: boolean;
  isEntityManager: boolean;
}) {
  const title = isEntityManager ? "My budget" : "Organization budget";
  const tileName = isEntityManager ? "My allocated budget" : `${account} budget`;
  return (
    <section className="dash-card card dash-wallets-card">
      <SectionHead
        title={title}
        action={
          <Link to="/app/wallets" className="dash-inline-action">
            View budget <ArrowRight size={14} />
          </Link>
        }
      />
      <div className="dash-wallet-preview-grid">
        <Link
          to="/app/wallets"
          className="dash-wallet-mini"
          aria-label={`${tileName} ${formatInr(mainBalance)}`}
        >
          <span className="dash-wallet-mini__icon">
            <Landmark size={18} aria-hidden="true" />
          </span>
          <span className="dash-wallet-mini__name">
            {tileName} <ChevronRight size={14} aria-hidden="true" />
          </span>
          <strong>{formatInr(mainBalance)}</strong>
          <small>Available to spend</small>
          <i />
        </Link>
        {isEntityManager ? null : !hasBudget ? (
          <Link to="/app/wallets" state={{ startCreateWallet: true }} className="dash-wallet-create">
            <span>+</span>
            Setup budget
          </Link>
        ) : (
          <Link to="/app/wallets?addFunds=1" className="dash-wallet-create">
            <span>+</span>
            Request top-up
          </Link>
        )}
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
      <SectionHead title="Pinned shop" action={<Link to="/app/shops" className="dash-inline-action">Manage shop <ArrowRight size={14} /></Link>} />
      {pinnedShop ? (
        <>
          <Link to={`/app/shops/${pinnedShop.id}`} className="dash-shop-banner-link">
            <ShopBanner source={pinnedShop} height={126} layout="center" logoSize={58} radius={10} />
            <span className="dash-shop-status">{pinnedShop.live ? "Active" : "Draft"}</span>
            <span className="dash-shop-copy">
              <strong>{pinnedShop.name}</strong>
              <small>{pinnedShop.slug ? `shelfmerch.com/${pinnedShop.slug}` : "Shelf Merch shop"}</small>
            </span>
          </Link>
          <Link to={`/app/shops/${pinnedShop.id}`} className="dash-open-shop">Open Shop <ArrowRight size={15} /></Link>
        </>
      ) : (
        <>
          <p className="dash-empty-note">Launch a branded shop so recipients can redeem swag on their own schedule.</p>
          <Link to={canCreateShop ? "/app/shops/new" : "/app/shops"} className="dash-open-shop">
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
  hasBudget,
  pinnedShop,
  canCreateShop,
  isEntityManager,
  catalogProducts,
}: {
  account: string;
  memberCount: number;
  senderCount: number;
  activeShopCount: number;
  mainBalance: number;
  hasBudget: boolean;
  pinnedShop: DashboardShop | null;
  canCreateShop: boolean;
  isEntityManager: boolean;
  catalogProducts: UiProduct[];
}) {
  return (
    <>
      <section className="dash-existing-top">
        <div className="dash-metrics-grid">
          <MetricCard label="Gifts Sent" value={senderCount} iconSrc={metricGiftsIcon} artSrc={metricArtGifts} tone="violet" href="/app/kits" cta="Go to kits" />
          <MetricCard label="People Reached" value={memberCount} iconSrc={metricPeopleIcon} artSrc={metricArtPeople} tone="blue" href="/app/orders" cta="Go to orders" />
          <MetricCard label="Active Shops" value={activeShopCount} iconSrc={metricShopsIcon} artSrc={metricArtShops} tone="green" href="/app/shops" cta="Go to shops" />
          <MetricCard label="Available budget" value={formatInr(mainBalance)} iconSrc={metricBudgetIcon} artSrc={metricArtBudget} tone="amber" href="/app/wallets" cta="Go to budget" />
        </div>
        <WorkspaceSettingsCard preview />
      </section>

  

      <section className="dash-existing-main">
        <div className="dash-existing-main__wallets">
          <BudgetSection
            account={account}
            mainBalance={mainBalance}
            hasBudget={hasBudget}
            isEntityManager={isEntityManager}
          />
        </div>
        <div className="dash-existing-main__video"><div className="dash-promo-pair"><CampaignPromoCard /><SwagPromoCard products={catalogProducts} /></div></div>
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
  const { data: workspace, isLoading, isError, error } = useWorkspace();
  const { canWrite } = useTenantAccess();
  const canCreateShop = canWrite("shops");
  const sessionUser = getStoredUser();

  if (isLoading && !workspace) {
    return <DashboardLoadingSkeleton />;
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
  const isEntityManager = workspace.userPatch.role === "entity_manager";

  return (
    <div className="dash-page fade-in">
      <section className="dash-welcome card">
        <div className="dash-welcome__left">
          <div className="dash-welcome__avatar" aria-hidden="true">{initials}</div>
          <div>
            <div className="dash-welcome__name">Welcome, {userName} 👋</div>
            <div className="dash-welcome__meta">{account} | {roleLabel}</div>
          </div>
        </div>
        <div className="dash-welcome__actions">
          <Link to="/app/settings" className="btn btn-ghost btn-sm">Set up my profile</Link>
          <Link to="/request-demo" className="btn btn-dark btn-sm">Book a demo</Link>
        </div>
      </section>

      {showOnboarding ? (
        <OnboardingDashboard catalogProducts={workspace.catalogProducts ?? []} />
      ) : (
        <ExistingDashboard
          account={account}
          memberCount={memberCount}
          activeShopCount={activeShopCount}
          senderCount={senderCount}
          mainBalance={mainBalance}
          hasBudget={wallets.length > 0}
          pinnedShop={pinnedShop}
          canCreateShop={canCreateShop}
          isEntityManager={isEntityManager}
          catalogProducts={workspace.catalogProducts ?? []}
        />
      )}
    </div>
  );
}
