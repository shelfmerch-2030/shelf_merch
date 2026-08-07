import { useState, type ReactNode } from "react";
import "./landing-page.css";
import { Link } from "react-router";
import { ShelfMerchLogo } from "@/components/brand/ShelfMerchLogo";
import type { LucideIcon } from "lucide-react";
import {
  Award,
  BarChart3,
  Backpack,
  Briefcase,
  Cake,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Coffee,
  CreditCard,
  CupSoda,
  Dumbbell,
  Eye,
  Factory,
  Gem,
  Gift,
  Globe,
  Hand,
  Handshake,
  Headphones,
  Heart,
  HeartHandshake,
  IdCard,
  Laptop,
  Map,
  Megaphone,
  Menu,
  MessageCircle,
  Monitor,
  Package,
  PartyPopper,
  Pencil,
  Plane,
  Plus,
  Popcorn,
  Printer,
  Puzzle,
  RefreshCw,
  Rocket,
  Scissors,
  Search,
  Settings,
  Shirt,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Star,
  Store,
  Target,
  Tent,
  TrendingUp,
  Truck,
  User,
  UserCircle,
  Users,
  Wallet,
} from "lucide-react";
import consolidateImg from "../../assets/consolidate.png";
import { Instagram, Linkedin, Youtube } from "@/components/brand/SocialIcons";

const LP_ICONS = {
  monitor: Monitor,
  package: Package,
  star: Star,
  backpack: Backpack,
  "shopping-bag": ShoppingBag,
  factory: Factory,
  puzzle: Puzzle,
  gift: Gift,
  party: PartyPopper,
  coffee: Coffee,
} as const satisfies Record<string, LucideIcon>;

type CardIconKey = keyof typeof LP_ICONS;

function LpIcon({
  icon: Icon,
  size = 20,
  className,
  strokeWidth = 2,
}: {
  icon: LucideIcon;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return <Icon size={size} className={className} strokeWidth={strokeWidth} aria-hidden />;
}

function LpSectionHeader({
  badge,
  title,
  sub,
  align = "center",
}: {
  badge: string;
  title: ReactNode;
  sub?: string;
  align?: "center" | "left";
}) {
  return (
    <header className={`lp-section-header${align === "left" ? " lp-section-header--left" : ""}`}>
      <span className="lp-hero__badge">{badge}</span>
      <h2 className="lp-section-header__title">{title}</h2>
      {sub ? <p className="lp-section-header__sub">{sub}</p> : null}
    </header>
  );
}

const HERO_NAV_LINKS = [
  { label: "Platform", href: "#platform" },
  { label: "Solutions", href: "#solutions" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Use Cases", href: "#use-cases" },
  { label: "Company", href: "#company" },
] as const;

const HERO_TRUST_ITEMS: { icon: LucideIcon; label: string }[] = [
  { icon: CheckCircle2, label: "100% risk-free" },
  { icon: Truck, label: "No inventory" },
  { icon: Globe, label: "Global fulfillment" },
  { icon: Headphones, label: "Expert support" },
];

const HERO_BANNER_IMAGE = "/images/landing/corporate-gifting-hero.png?v=2";

const CONSOLIDATE_ICONS: { icon: LucideIcon; color: string }[] = [
  { icon: Gift, color: "#7C3AED" },
  { icon: Award, color: "#2563EB" },
  { icon: Package, color: "#0D9488" },
  { icon: Heart, color: "#F59E0B" },
  { icon: Calendar, color: "#F97316" },
  { icon: Megaphone, color: "#EC4899" },
  { icon: Star, color: "#6366F1" },
];

const GIFTING_HERO_IMAGE = "/images/offerings/gifting/gifting-journey-hq.png?v=3";

const GIFTING_FEATURES = [
  "Clients & Prospects",
  "Holidays & Celebrations",
  "Employee Appreciation",
  "Birthdays",
] as const;

const FOOTER_COLUMNS = [
  {
    title: "Products",
    links: [
      { label: "Shops", href: "#products" },
      { label: "Gifting", href: "#products" },
      { label: "Swag", href: "#products" },
      { label: "Snacks", href: "#products" },
      { label: "Gift Cards", href: "#products" },
      { label: "Send Points", href: "#products" },
    ],
  },
  {
    title: "Platform",
    links: [
      { label: "Integrations", href: "#" },
      { label: "API", href: "#" },
      { label: "Kudos Program", href: "#" },
      { label: "Custom Shops", href: "#" },
      { label: "Analytics", href: "#" },
      { label: "Wallet", href: "#" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Help Center", href: "#" },
      { label: "Documentation", href: "/docs/zoho-people" },
      { label: "Blog", href: "#" },
      { label: "Case Studies", href: "/case-studies/zoho-people" },
      { label: "Partnerships", href: "#" },
      { label: "Videos", href: "#" },
      { label: "Contact Us", href: "mailto:support@shelfmerch.com" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Press", href: "#" },
      { label: "Reviews", href: "#" },
      { label: "Partner With Us", href: "#" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/legal/privacy-policy" },
      { label: "Terms of Service", href: "/legal/terms-of-service" },
      { label: "Security", href: "#" },
      { label: "Cookie Preferences", href: "#" },
    ],
  },
] as const;

const FOOTER_OFFERINGS: { label: string; icon: LucideIcon }[] = [
  { label: "Shops", icon: Store },
  { label: "Gifting", icon: Gift },
  { label: "Kudos", icon: Heart },
];

/* ─── offerings tabs (ShelfMerch) ─── */
const OFFERING_TABS = [
  {
    id: "shops",
    label: "Shops",
    icon: "/images/offering-icons/shops.svg",
    color: "#7c3aed",
    bg: "#f3e8ff",
    bgDark: "#5b21b6",
    title: "Do it all with your shop",
    sub: "Launch a branded storefront with customizable swag, flexible rewards, and thousands of catalog options.",
    layout: "shop" as const,
    perfectFor: [
      "Company Storefront",
      "Swag & Uniform Shops",
      "Corporate Gifts",
      "Rewards Redemption",
      "Retail",
      "Recognition & Incentives",
      "Fundraising",
    ],
    features: ["Add your branding", "Curated catalog", "Points or currency", "5K+ product options"],
  },
  {
    id: "anniversaries",
    label: "Service Anniversaries",
    icon: "/images/offering-icons/anniversaries.svg",
    color: "#2563eb",
    bg: "#eef4fc",
    bgDark: "#1e40af",
    title: "Celebrate milestones across your team",
    layout: "anniversaries" as const,
    features: ["Service Anniversaries", "Employee Appreciation", "Rewards Redemption", "Sales Incentives"],
  },
  {
    id: "events",
    label: "In-Person & Events",
    icon: "/images/offering-icons/events.svg",
    color: "#B8872E",
    bg: "#faf6ee",
    bgDark: "#8a6520",
    title: "Elevate your in-person experience",
    layout: "cards" as const,
    cards: [
      { iconKey: "monitor", title: "Virtual Swag Bar", desc: "Let attendees pick their favorites." },
      { iconKey: "package", title: "Bulk Swag", desc: "Ship branded gear to any venue." },
      { iconKey: "star", title: "VIP Gifts", desc: "Premium gifts for key guests." },
      { iconKey: "backpack", title: "Goodie Bags & Cases", desc: "Ready-to-hand event kits." },
    ],
    features: ["Upload Your Booth", "Capture Leads", "Room Drops", "Pre- & Post-Event Engagement"],
  },
  {
    id: "kudos",
    label: "Employee Kudos",
    icon: "/images/offering-icons/kudos.svg",
    color: "#C45C6A",
    bg: "#faf4f5",
    bgDark: "#a84855",
    title: "Empower recognition with top incentives",
    layout: "kudos" as const,
    bullets: [
      "Employee-to-employee recognition",
      "Assign monetary value to kudos or keep them free",
      "Integrate with Teams, Slack, or use our platform",
      "Thousands of gifts from top brands + customizable swag",
      "Enable kudos to flow freely across your org chart",
    ],
    features: ["Peer Recognition", "Manager Awards", "Budget Controls", "Redemption Tracking"],
  },
  {
    id: "swag",
    label: "Swag",
    icon: "/images/offering-icons/swag.svg",
    color: "#00C036",
    bg: "#f0fdfa",
    bgDark: "#0f766e",
    title: "The only swag partner you need",
    layout: "brands" as const,
    cards: [
      { iconKey: "star", title: "VIP Gifts", desc: "Premium branded items." },
      { iconKey: "monitor", title: "Virtual Swag Bar", desc: "Online pick-and-pack." },
      { iconKey: "package", title: "Kits", desc: "Onboarding & celebration kits." },
      { iconKey: "shopping-bag", title: "On-Demand Shops", desc: "Launch stores in minutes." },
      { iconKey: "factory", title: "Bulk Swag", desc: "Volume orders, one platform." },
    ],
    features: ["Global Fulfillment", "Endless Customization", "Storage", "Sustainable Practices", "5K+ Items"],
    brands: ["Nike", "Carhartt", "North Face", "BELLA+CANVAS", "Columbia", "Adidas", "Port Authority"],
  },
  {
    id: "snacks",
    label: "Snacks",
    icon: "/images/offering-icons/snacks.svg",
    color: "#2D7A5F",
    bg: "#eef5f2",
    bgDark: "#1a5c47",
    title: "Snacks and sips in all the ways",
    layout: "brands" as const,
    cards: [
      { iconKey: "puzzle", title: "Build-Your-Own", desc: "Customize every box." },
      { iconKey: "gift", title: "Curated Boxes", desc: "Expertly assembled selections." },
      { iconKey: "shopping-bag", title: "Goodie Bags", desc: "Individual treats at scale." },
      { iconKey: "party", title: "Surprise Boxes", desc: "Delight with the unexpected." },
      { iconKey: "coffee", title: "Pantry Refills", desc: "Keep offices stocked." },
    ],
    features: ["Global Fulfillment", "Box Customizations", "Add Branding", "Add Swag", "Sustainable Practices"],
    brands: ["Hippeas", "Pipcorn", "Hu", "Siete", "Kettle Brand"],
  },
] as const;

type OfferingId = (typeof OFFERING_TABS)[number]["id"];

const ANNIVERSARY_CARDS = [
  {
    title: "Spot & Recurring",
    desc: "Give once or set ongoing recognition.",
    image: "/images/offerings/anniversaries/spot-recurring.png",
  },
  {
    title: "Feedback & Reporting",
    desc: "Guardrails, analytics, and insights.",
    image: "/images/offerings/anniversaries/feedback-reporting.png",
  },
  {
    title: "Integrations",
    desc: "HRIS, CRM, Slack, Teams, and more.",
    image: "/images/offerings/anniversaries/integrations.png",
  },
] as const;

const SHOP_HERO_IMAGE = "/images/shops/shop-preview-happy-summer.png";

const SHOP_CALLOUTS = [
  { id: "branding", label: "ADD YOUR BRANDING", side: "left" as const, pos: "top" as const },
  { id: "swag", label: "CUSTOMIZABLE SWAG FROM TOP BRANDS", side: "left" as const, pos: "bottom" as const },
  { id: "points", label: "POINTS OR INR", side: "right" as const, pos: "top" as const },
  { id: "catalog", label: "5K+ CATALOG OPTIONS", side: "right" as const, pos: "bottom" as const },
];

function ShopCalloutArrow({ flip }: { flip?: boolean }) {
  return (
    <svg
      className={`lp-shop-callout__arrow${flip ? " lp-shop-callout__arrow--flip" : ""}`}
      viewBox="0 0 48 32"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2 16 C12 4, 28 6, 44 14"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M36 10 L44 14 L38 20"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const PROCESS_ISSUES = [
  {
    title: "Manual coordination",
    description: "HR teams spend time collecting sizes, addresses and product preferences.",
    icon: Users,
    tone: "orange",
  },
  {
    title: "Multiple vendors",
    description: "Marketing and Admin teams coordinate separately with suppliers, printers and delivery partners.",
    icon: Truck,
    tone: "navy",
  },
  {
    title: "Unused inventory",
    description: "Bulk merchandise often remains in storage or becomes outdated.",
    icon: Package,
    tone: "mint",
  },
  {
    title: "Limited visibility",
    description: "Teams struggle to track budgets, approvals, orders and deliveries.",
    icon: Eye,
    tone: "salmon",
  },
] as const;

const PLATFORM_FEATURES = [
  { label: "Employee wallets", icon: Wallet, tone: "teal" },
  { label: "Department budgets", icon: SlidersHorizontal, tone: "coral" },
  { label: "Approved catalogue", icon: Store, tone: "navy" },
  { label: "Campaign management", icon: Megaphone, tone: "teal" },
  { label: "Order tracking", icon: Truck, tone: "coral" },
  { label: "Reports and analytics", icon: BarChart3, tone: "navy" },
] as const;

const PLATFORM_STATS = [
  { label: "Total wallet allocated", value: "1,18,42,000" },
  { label: "Active campaigns", value: "6" },
  { label: "Orders this month", value: "1,284" },
  { label: "Pending approvals", value: "3" },
] as const;

const AUDIENCE_SOLUTIONS = [
  {
    id: "hr",
    tone: "teal",
    title: "Make employee gifting effortless.",
    sub: "Create better employee experiences without adding more operational work.",
    items: [
      "Employee onboarding",
      "Rewards and recognition",
      "Work anniversaries",
      "Annual employee swag",
      "Remote employee gifting",
    ],
    cta: "Explore HR Solutions",
    href: "#products",
  },
  {
    id: "marketing",
    tone: "coral",
    title: "Launch branded campaigns faster.",
    sub: "Manage merchandise for events, brand programmes, customers and communities from one platform.",
    items: [
      "Events and conferences",
      "Brand campaigns",
      "Client and partner gifting",
      "Product launches",
      "Community merchandise",
      "Sales-team campaigns",
    ],
    cta: "Explore Marketing Solutions",
    href: "#products",
  },
] as const;

/* ─── data ─── */
const HOW_IT_STEPS = [
  {
    id: "store",
    step: "01",
    label: "Create your store",
    icon: Store,
    title: "Create your store",
    desc: "Shelf Merch sets up your private branded store with approved products and company branding.",
    benefits: [
      "Private company-branded storefront",
      "Approved products ready to launch",
      "Brand guidelines applied across the catalogue",
    ],
    theme: { bg: "#5B4589", card: "#F3EEF8", tabBg: "#F3EEF8", tabBorder: "#7C5CBF", cardText: "#3D2E5C" },
  },
  {
    id: "audiences",
    step: "02",
    label: "Add employees or audiences",
    icon: Users,
    title: "Add employees or audiences",
    desc: "Upload employees, create teams or share campaign access links.",
    benefits: [
      "Bulk upload employees and contacts",
      "Create teams and audience segments",
      "Share secure campaign access links",
    ],
    theme: { bg: "#1B4F72", card: "#EAF3FA", tabBg: "#EAF3FA", tabBorder: "#3D8FBF", cardText: "#143652" },
  },
  {
    id: "budgets",
    step: "03",
    label: "Allocate budgets or credits",
    icon: Wallet,
    title: "Allocate budgets or credits",
    desc: "Set employee wallets, department budgets or campaign limits.",
    benefits: [
      "Fund employee wallets with credits",
      "Set department spending budgets",
      "Control campaign limits and approvals",
    ],
    theme: { bg: "#5B4589", card: "#F3EEF8", tabBg: "#F3EEF8", tabBorder: "#7C5CBF", cardText: "#3D2E5C" },
  },
  {
    id: "deliver",
    step: "04",
    label: "We produce and deliver",
    icon: Truck,
    title: "We produce and deliver",
    desc: "Shelf Merch manages customisation, packaging, shipping and support.",
    benefits: [
      "Customisation and production handled for you",
      "Packaging and India-wide shipping",
      "Dedicated support through delivery",
    ],
    theme: { bg: "#7A2D3E", card: "#FDE8EC", tabBg: "#FDE8EC", tabBorder: "#E85D7A", cardText: "#5C2030" },
  },
] as const;

const PILOT_OPTIONS = [
  { label: "Employee onboarding pilot", icon: Backpack, tone: "teal" },
  { label: "Rewards store pilot", icon: Star, tone: "orange" },
  { label: "Event merchandise pilot", icon: Gift, tone: "green" },
  { label: "Annual swag programme", icon: Calendar, tone: "coral" },
] as const;

const FAQ_ITEMS = [
  {
    q: "What is Shelf Merch?",
    a: "Shelf Merch is a merchandise platform that helps companies run branded stores, employee wallets, campaigns, and gifting from one place — with production and delivery handled for you.",
  },
  {
    q: "Who can use the platform?",
    a: "HR, People Ops, Marketing, Admin, and team leaders can launch programmes. Employees and audiences redeem through a private branded store with approved products.",
  },
  {
    q: "Can employees choose their own products?",
    a: "Yes. You control the approved catalogue, and employees pick items they will actually use within the budgets or credits you allocate.",
  },
  {
    q: "Can we allocate different budgets to employees?",
    a: "Yes. Set employee wallets, department budgets, or campaign limits so different teams and individuals get the right amount of spend.",
  },
  {
    q: "Does Shelf Merch manage production and delivery?",
    a: "Yes. Shelf Merch handles customisation, packaging, shipping, and support so your team does not chase multiple vendors.",
  },
  {
    q: "Can we use the platform for events and client gifting?",
    a: "Absolutely. Run event merchandise, client and partner gifting, brand campaigns, and community programmes alongside employee recognition.",
  },
  {
    q: "Can Shelf Merch integrate with our HRMS?",
    a: "Yes. Shelf Merch supports HRIS and workplace integrations so you can sync employees, automate milestones, and reduce manual uploads.",
  },
  {
    q: "Can we start with a pilot?",
    a: "Yes. Start with one programme, department, or employee group, then expand across teams and offices once it is working.",
  },
] as const;

const FEATURES = [
  {
    title: "Branded company store",
    description: "Launch a private store designed around your company identity.",
    img: "/images/landing/features/branded-company-store.png",
  },
  {
    title: "Department budgets",
    description: "Give teams controlled access to approved budgets.",
    img: "/images/landing/features/department-budgets.png",
  },
  {
    title: "Employee wallets",
    description: "Allocate merchandise credits to employees or teams.",
    img: "/images/landing/features/employee-wallets.png",
  },
  {
    title: "Order tracking",
    description: "Track every order and shipment from one dashboard.",
    img: "/images/landing/features/order-tracking.png",
  },
  {
    title: "Approval controls",
    description: "Control who can launch campaigns or use budgets.",
    img: "/images/landing/features/approval-controls.png",
  },
  {
    title: "Campaign management",
    description: "Run onboarding, rewards, event and gifting programmes.",
    img: "/images/landing/features/campaign-management.png",
  },
  {
    title: "Reports",
    description: "Monitor budgets, redemptions and programme utilisation.",
    img: "/images/landing/features/reports.png",
  },
  {
    title: "Employee choice",
    description: "Employees select products, sizes and delivery addresses.",
    img: "/images/landing/features/employee-choice.png",
  },
] as const;

/** Fulfilment ops grid. */
const FULFILMENT_ITEMS = [
  {
    label: "Product sourcing",
    img: "/images/landing/fulfilment/product-sourcing.png",
  },
  {
    label: "Design and customisation",
    icon: Scissors,
  },
  {
    label: "Printing and production",
    icon: Printer,
  },
  {
    label: "Quality checks",
    img: "/images/landing/fulfilment/quality-checks.png",
  },
  {
    label: "Packaging",
    img: "/images/landing/fulfilment/packaging.png",
  },
  {
    label: "Individual and bulk delivery",
    img: "/images/landing/fulfilment/bulk-delivery.png",
  },
  {
    label: "Returns and replacements",
    img: "/images/landing/fulfilment/returns.png",
  },
  {
    label: "Customer support",
    img: "/images/landing/fulfilment/customer-support.png",
  },
] as const;

const WHY_SHELF_MERCH = [
  {
    title: "Easy for employees",
    description: "A simple store experience with clear product choices.",
    icon: Hand,
    tone: "teal",
  },
  {
    title: "Easy for administrators",
    description: "Manage users, budgets, campaigns and orders from one place.",
    icon: SlidersHorizontal,
    tone: "peach",
  },
  {
    title: "On-demand production",
    description: "Reduce unnecessary inventory and produce merchandise when required.",
    icon: Package,
    tone: "navy",
  },
  {
    title: "India-wide fulfilment",
    description: "Deliver to offices and individual employee addresses.",
    icon: Map,
    tone: "coral",
  },
  {
    title: "Flexible programmes",
    description: "Run one campaign or manage merchandise throughout the year.",
    icon: RefreshCw,
    tone: "mint",
  },
  {
    title: "Dedicated support",
    description: "Get help with products, setup, production and fulfilment.",
    icon: Headphones,
    tone: "navy",
  },
] as const;

const MERCH_PROGRAMMES = [
  "Employee onboarding",
  "Rewards and recognition",
  "Annual employee store",
  "Events and conferences",
  "Work anniversaries",
  "Client gifting",
  "Department campaigns",
  "Remote employee gifting",
] as const;

const USE_CASES: { label: string; icon: LucideIcon }[] = [
  { label: "Employee Appreciation", icon: Star },
  { label: "Incentives", icon: Target },
  { label: "Work Anniversaries", icon: Calendar },
  { label: "Awards", icon: Award },
  { label: "Work From Home Stipend", icon: Laptop },
  { label: "Rewards Redemption", icon: Award },
  { label: "Employee Birthday Treats", icon: Cake },
  { label: "Swag Store Redemption", icon: ShoppingBag },
  { label: "Boosting Morale", icon: Rocket },
  { label: "Kudos Program", icon: Users },
  { label: "Swag Distribution", icon: Package },
  { label: "Snack Perks", icon: Popcorn },
  { label: "Recurring Perks", icon: Calendar },
  { label: "Boosting Attendance", icon: TrendingUp },
  { label: "New Hire Welcome", icon: Hand },
  { label: "Client Gifting", icon: Gift },
  { label: "Prospecting", icon: Search },
  { label: "Celebration Shops", icon: Store },
  { label: "Boosting Response Rates", icon: MessageCircle },
  { label: "Recognizing DEI Events", icon: HeartHandshake },
];

const TRUSTED_LOGOS = [
  { name: "Google", src: "/images/logos/google-wordmark.svg", width: 120, height: 42 },
  { name: "Coca-Cola", src: "/images/logos/coca-cola-wordmark.svg", width: 140, height: 42 },
  { name: "JPMorgan", src: "/images/logos/jpmorgan-wordmark.svg", width: 154, height: 42 },
  { name: "Datadog", src: "/images/logos/datadog-wordmark.svg", width: 146, height: 42 },
  { name: "Informatica", src: "/images/logos/informatica-wordmark.svg", width: 166, height: 42 },
  { name: "Apollo Hospitals", src: "/images/logos/apollo-hospitals-wordmark.svg", width: 190, height: 42 },
] as const;

const KUDOS_FEED = [
  { initials: "PS", name: "Priya S.", action: "sent kudos", message: "Great work on the launch!", points: 15, tone: "#C45C6A" },
  { initials: "MK", name: "Marcus K.", action: "shout-out", message: "Thanks for going the extra mile.", points: 10, tone: "#A84855" },
  { initials: "AL", name: "Alex L.", action: "recognized", message: "Crushed the client demo today.", points: 20, tone: "#B85A68" },
] as const;

/* ─── component ─── */
export default function LandingPage() {
  const [offering, setOffering] = useState<OfferingId>("shops");
  const [howStep, setHowStep] = useState<(typeof HOW_IT_STEPS)[number]["id"]>("store");
  const activeHowStep = HOW_IT_STEPS.find((t) => t.id === howStep)!;
  const activeOffering = OFFERING_TABS.find((t) => t.id === offering)!;

  return (
    <div className="lp">
      {/* ── NAV ── */}
      <header className="lp-nav lp-nav--merch">
        <div className="lp-container lp-nav__inner lp-nav__inner--merch">
          <a href="/" className="lp-logo">
            <ShelfMerchLogo height={28} className="lp-logo__img lp-logo__img--merch" />
          </a>

          <nav className="lp-nav__links lp-nav__links--merch">
            {HERO_NAV_LINKS.map((item) => (
              <a key={item.label} href={item.href}>
                {item.label}
              </a>
            ))}
          </nav>

          <div className="lp-nav__actions lp-nav__actions--merch">
            <Link to="/login" className="lp-btn-primary lp-btn-primary-sm lp-btn-pill">
              Log in
            </Link>
            <Link to="/signup" className="lp-btn-primary lp-btn-primary-sm lp-btn-pill">
              Get started
            </Link>
          </div>

          <button type="button" className="lp-nav__menu" aria-label="Open navigation">
            <Menu className="lp-nav__menu-icon" aria-hidden />
          </button>
        </div>
      </header>

      {/* ── HERO ── */}
      <div className="lp-hero-zone lp-hero-zone--merch lp-hero-zone--banner">
        <section className="lp-hero lp-hero--merch lp-hero--banner">
          <img
            src={HERO_BANNER_IMAGE}
            alt=""
            className="lp-hero-banner__img"
            width={8688}
            height={2896}
            aria-hidden="true"
            loading="eager"
            decoding="async"
            fetchPriority="high"
          />
          <div className="lp-hero--merch__inner">
            <div className="lp-hero__content lp-hero__content--merch lp-hero__content--banner">
              <p className="lp-hero__eyebrow">Recognition · Swag · Gifting</p>

              <h1 className="lp-hero__headline">
                <span className="lp-hero__tone-orange">Celebrate your people.</span>
                <br />
                <span className="lp-hero__tone-blue">One platform.</span>
              </h1>

              <p className="lp-hero__lede">
                <span className="lp-hero__tone-orange">
                  Launch branded shops, send corporate gifts, and reward teams
                </span>
                <br className="lp-hero__lede-br" />
                <span className="lp-hero__tone-blue">
                  with premium swag—all from one gifting workspace.
                </span>
              </p>

              <div className="lp-hero__ctas lp-hero__ctas--merch lp-hero__ctas--banner">
                <Link to="/signup" className="lp-btn-primary lp-btn-pill">
                  Get started for free
                </Link>
                <a href="#gifting" className="lp-btn-outline-green">
                  Book a demo
                </a>
              </div>

              <ul className="lp-hero__trust">
                {HERO_TRUST_ITEMS.map((item, index) => (
                  <li key={item.label}>
                    {index > 0 ? <span className="lp-hero__trust-sep" aria-hidden /> : null}
                    <LpIcon icon={item.icon} size={14} className="lp-hero__trust-icon" strokeWidth={2} />
                    <span>{item.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>

      {/* ── OFFERINGS TABS ── */}
      <section className="lp-section lp-offerings" id="products">
        <div className="lp-container">
          <header className="lp-offerings__header">
            <p className="lp-offerings__eyebrow">Our Offerings</p>
            <h2 className="lp-offerings__title">Supercharge Your Engagement</h2>
            <p className="lp-offerings__sub">
              Our offerings and curated swag catalog will take your engagement to new heights.
            </p>
          </header>

          <div className="lp-offerings__shell">
          <div className="lp-offerings-tabs" role="tablist" aria-label="ShelfMerch offerings">
            {OFFERING_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={offering === tab.id}
                className={`lp-offerings-tab${offering === tab.id ? " is-active" : ""}`}
                onClick={() => setOffering(tab.id)}
                style={{ "--tab-accent": tab.color } as React.CSSProperties}
              >
                <img
                  src={tab.icon}
                  alt=""
                  className="lp-offerings-tab__icon"
                  width={38}
                  height={38}
                  loading="eager"
                  decoding="async"
                />
                <span className="lp-offerings-tab__label">{tab.label}</span>
              </button>
            ))}
          </div>

          <div
            className="lp-offerings-panel"
            role="tabpanel"
            style={{ "--panel-bg": activeOffering.bg, "--panel-accent": activeOffering.bgDark } as React.CSSProperties}
          >
            <h3 className="lp-offerings-panel__title">{activeOffering.title}</h3>
            {"sub" in activeOffering && activeOffering.sub ? (
              <p className="lp-offerings-panel__sub">{activeOffering.sub}</p>
            ) : null}

            {activeOffering.layout === "shop" && (
              <div className="lp-offerings-shop">
                <div className="lp-shop-showcase">
                  {SHOP_CALLOUTS.map((callout) => (
                    <div
                      key={callout.id}
                      className={`lp-shop-callout lp-shop-callout--${callout.side} lp-shop-callout--${callout.pos}`}
                    >
                      {callout.side === "left" && <ShopCalloutArrow />}
                      <span className="lp-shop-callout__label">{callout.label}</span>
                      {callout.side === "right" && <ShopCalloutArrow flip />}
                    </div>
                  ))}
                  <div className="lp-shop-hero">
                    <img
                      src={SHOP_HERO_IMAGE}
                      alt="Shelf Merch company shop with Happy Summer rewards banner, points, and featured products"
                      width={2149}
                      height={1031}
                      className="lp-shop-hero__img"
                      loading="eager"
                      decoding="async"
                    />
                  </div>
                </div>

                <aside className="lp-offerings-perfect lp-offerings-perfect--shop">
                  <h4>Perfect for:</h4>
                  <ul>
                    {activeOffering.perfectFor?.map((item) => (
                      <li key={item}>
                        <span className="lp-offerings-perfect__check" aria-hidden="true">
                          <Check size={10} strokeWidth={3} />
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                  <Link to="/app/shops" className="lp-offerings-learn">Learn More</Link>
                </aside>
              </div>
            )}

            {activeOffering.layout === "anniversaries" && (
              <div className="lp-anniv" aria-label="Service anniversaries features">
                <div className="lp-anniv__grid">
                  {ANNIVERSARY_CARDS.map((card) => (
                    <article key={card.title} className="lp-anniv__card">
                      <h4 className="lp-anniv__card-title">{card.title}</h4>
                      <div className="lp-anniv__visual">
                        <img
                          src={card.image}
                          alt=""
                          width={400}
                          height={320}
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                      <p className="lp-anniv__card-desc">{card.desc}</p>
                    </article>
                  ))}
                </div>
              </div>
            )}

            {activeOffering.layout === "cards" && activeOffering.cards && (
              <div className="lp-offerings-cards">
                {activeOffering.cards.map((card) => (
                  <div key={card.title} className="lp-offerings-card">
                    <div className="lp-offerings-card__visual">
                      {"iconKey" in card && (
                        <LpIcon icon={LP_ICONS[card.iconKey as CardIconKey]} size={28} strokeWidth={1.75} />
                      )}
                    </div>
                    <h4>{card.title}</h4>
                    {card.desc && <p>{card.desc}</p>}
                  </div>
                ))}
              </div>
            )}

            {activeOffering.layout === "kudos" && activeOffering.bullets && (
              <div className="lp-offerings-kudos">
                <ul className="lp-offerings-kudos__list">
                  {activeOffering.bullets.map((b) => (
                    <li key={b}>
                      <span className="lp-offerings-kudos__check">
                        <Check size={12} strokeWidth={2.75} />
                      </span>
                      {b}
                    </li>
                  ))}
                </ul>

                <div className="lp-kudos-preview" aria-label="Kudos activity preview">
                  <div className="lp-kudos-preview__head">
                    <div className="lp-kudos-preview__title">
                      <span className="lp-kudos-preview__title-icon"><Heart size={16} fill="currentColor" strokeWidth={0} /></span>
                      Team Kudos
                    </div>
                    <span className="lp-kudos-preview__live">Live</span>
                  </div>

                  <div className="lp-kudos-preview__feed">
                    {KUDOS_FEED.map((item) => (
                      <article key={item.initials} className="lp-kudos-preview__item">
                        <span className="lp-kudos-preview__avatar" style={{ background: `${item.tone}18`, color: item.tone }}>
                          {item.initials}
                        </span>
                        <div className="lp-kudos-preview__body">
                          <p className="lp-kudos-preview__meta">
                            <strong>{item.name}</strong> {item.action}
                          </p>
                          <p className="lp-kudos-preview__msg">{item.message}</p>
                        </div>
                        <span className="lp-kudos-preview__pts">+{item.points}</span>
                      </article>
                    ))}
                  </div>

                  <div className="lp-kudos-preview__footer">
                    <div>
                      <strong>2.4k</strong>
                      <span>kudos this month</span>
                    </div>
                    <div>
                      <strong>89%</strong>
                      <span>team participation</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeOffering.layout === "brands" && activeOffering.cards && (
              <>
                <div className="lp-offerings-cards lp-offerings-cards--5">
                  {activeOffering.cards.map((card) => (
                    <div key={card.title} className="lp-offerings-card">
                      <div className="lp-offerings-card__visual">
                        {"iconKey" in card && (
                          <LpIcon icon={LP_ICONS[card.iconKey as CardIconKey]} size={28} strokeWidth={1.75} />
                        )}
                      </div>
                      <h4>{card.title}</h4>
                      {card.desc && <p>{card.desc}</p>}
                    </div>
                  ))}
                </div>
                {activeOffering.brands && (
                  <div className="lp-offerings-brands">
                    {activeOffering.brands.map((b) => (
                      <span key={b}>{b}</span>
                    ))}
                    <span className="lp-offerings-brands__more">+ Many more</span>
                  </div>
                )}
              </>
            )}

            {activeOffering.layout !== "shop" && (
              <div className="lp-offerings-panel__cta">
                <Link to="/app" className="lp-offerings-learn">Learn More →</Link>
              </div>
            )}
          </div>

          {activeOffering.features && activeOffering.layout !== "shop" && (
            <ul className={`lp-offerings-footer${activeOffering.layout === "anniversaries" ? " lp-offerings-footer--anniversaries" : ""}${activeOffering.layout === "kudos" ? " lp-offerings-footer--kudos" : ""}`}>
              {activeOffering.features.map((f) => (
                <li key={f}>
                  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <circle cx="8" cy="8" r="8" fill="currentColor" fillOpacity=".12" />
                    <path d="M5 8.2 7 10.2 11 6.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
          )}
          </div>
        </div>
      </section>

      {/* ── CURRENT PROCESS ── */}
      <section className="lp-section lp-process" aria-labelledby="lp-process-title">
        <div className="lp-container">
          <header className="lp-process__header">
            <p className="lp-process__eyebrow">The current process</p>
            <h2 id="lp-process-title" className="lp-process__title">
              Company merchandise should not be this difficult.
            </h2>
            <p className="lp-process__sub">
              Most companies still manage employee merchandise through spreadsheets, emails,
              WhatsApp messages and multiple vendors.
            </p>
          </header>
          <div className="lp-process__grid">
            {PROCESS_ISSUES.map((issue) => (
              <article key={issue.title} className={`lp-process__card lp-process__card--${issue.tone}`}>
                <span className="lp-process__card-icon" aria-hidden>
                  <LpIcon icon={issue.icon} size={22} strokeWidth={1.8} />
                </span>
                <h3 className="lp-process__card-title">{issue.title}</h3>
                <p className="lp-process__card-desc">{issue.description}</p>
              </article>
            ))}
          </div>
          <p className="lp-process__footer">
            Shelf Merch brings the complete process into one platform.
          </p>
        </div>
      </section>

      {/* ── PLATFORM OVERVIEW ── */}
      <section className="lp-section lp-platform" id="platform" aria-labelledby="lp-platform-title">
        <div className="lp-container">
          <header className="lp-platform__header">
            <p className="lp-platform__eyebrow">Platform overview</p>
            <h2 id="lp-platform-title" className="lp-platform__title">
              One store for all your company merchandise.
            </h2>
            <p className="lp-platform__sub">
              Launch a private company-branded store where employees and teams can choose approved
              merchandise while your organisation controls budgets, campaigns and access.
            </p>
          </header>

          <div className="lp-platform__shell">
            <div className="lp-platform__mock" aria-label="Admin overview preview">
              <div className="lp-platform__mock-chrome" aria-hidden>
                <span /><span /><span />
              </div>
              <p className="lp-platform__mock-label">Admin · Overview</p>
              <dl className="lp-platform__stats">
                {PLATFORM_STATS.map((stat) => (
                  <div key={stat.label} className="lp-platform__stat">
                    <dt>{stat.label}</dt>
                    <dd>{stat.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <ul className="lp-platform__features">
              {PLATFORM_FEATURES.map((feature) => (
                <li key={feature.label} className={`lp-platform__feature lp-platform__feature--${feature.tone}`}>
                  <span className="lp-platform__feature-icon" aria-hidden>
                    <LpIcon icon={feature.icon} size={18} strokeWidth={1.9} />
                  </span>
                  <span className="lp-platform__feature-label">{feature.label}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="lp-platform__cta">
            <Link to="/app" className="lp-platform__link">
              Explore the Platform
              <ChevronRight size={18} aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* ── GIFTING ── */}
      {/* <section className="lp-section lp-gifting" id="gifting">
        <div className="lp-container">
          <header className="lp-gifting__header">
            <p className="lp-gifting__eyebrow">Gifting</p>
            <h2 className="lp-gifting__title">All your gifting operations in one place</h2>
          </header>

          <div className="lp-gifting__panel">
            <div className="lp-gifting__hero">
              <img
                src={GIFTING_HERO_IMAGE}
                alt="Corporate gifting journey — choose gift, add branding, pack, ship, and happy delivery"
                width={6688}
                height={3764}
                className="lp-gifting__hero-img"
                loading="lazy"
                decoding="async"
                fetchPriority="low"
              />
            </div>

            <ul className="lp-gifting__features">
              {GIFTING_FEATURES.map((feature) => (
                <li key={feature}>
                  <Check size={14} strokeWidth={2.5} aria-hidden />
                  {feature}
                </li>
              ))}
            </ul>

            <div className="lp-gifting__cta">
              <Link to="/app" className="lp-btn-primary">
                Explore gifting
                <ChevronRight size={18} aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </section> */}

      {/* ── SOCIAL PROOF ── */}
      <section className="lp-section lp-social">
        <div className="lp-container">
          <div className="lp-social__layout">
            <div className="lp-social__copy">
              <h2 className="lp-social__title">
                Trusted to deliver merchandise for leading organisations
              </h2>
            </div>
            <div className="lp-social__logos" aria-label="Companies using Shelf Merch">
              {TRUSTED_LOGOS.map((logo) => (
                <span key={logo.name} className="lp-social__logo" title={logo.name}>
                  <img
                    src={logo.src}
                    alt={logo.name}
                    width={logo.width}
                    height={logo.height}
                    loading="lazy"
                    decoding="async"
                  />
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="lp-section lp-features-section" id="features">
        <div className="lp-container">
          <header className="lp-features-header">
            <p className="lp-features-eyebrow">Our platform</p>
            <h2 className="lp-features-title">
              Everything you need.
              <br />
              Nothing complicated.
            </h2>
            <p className="lp-features-sub">
              From company stores and wallets to campaigns, approvals, and reports, built to run smoothly.
            </p>
          </header>

          <div className="lp-features">
            {FEATURES.map((feature) => (
              <article key={feature.title} className="lp-feature-card">
                <img
                  src={feature.img}
                  alt={`${feature.title}. ${feature.description}`}
                  width={800}
                  height={800}
                  loading="lazy"
                  decoding="async"
                />
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── EMPLOYEE EXPERIENCE ── */}
      <section className="lp-section lp-employee-exp" id="employee-experience" aria-labelledby="lp-employee-exp-title">
        <div className="lp-container">
          <div className="lp-employee-exp__layout">
            <div className="lp-employee-exp__visual">
              <img
                src="/images/landing/employee-experience.png"
                alt="Employee store: balance, product choices, and redeem flow"
                width={1024}
                height={1024}
                loading="lazy"
                decoding="async"
              />
            </div>

            <div className="lp-employee-exp__copy">
              <p className="lp-employee-exp__eyebrow">Employee experience</p>
              <h2 id="lp-employee-exp-title" className="lp-employee-exp__title">
                Give employees merchandise they will actually use.
              </h2>
              <p className="lp-employee-exp__sub">
                Instead of giving everyone the same product, let employees choose from an approved collection.
              </p>
              <ul className="lp-employee-exp__list">
                {[
                  "Better employee choice",
                  "Higher participation",
                  "Fewer size-related issues",
                  "Less merchandise waste",
                ].map((item) => (
                  <li key={item}>
                    <Check size={16} strokeWidth={2.5} aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── FULFILMENT ── */}
      <section className="lp-section lp-fulfilment" id="fulfilment" aria-labelledby="lp-fulfilment-title">
        <div className="lp-container">
          <header className="lp-fulfilment__header">
            <p className="lp-fulfilment__eyebrow">Fulfilment</p>
            <h2 id="lp-fulfilment-title" className="lp-fulfilment__title">
              The platform is only half the solution.
            </h2>
            <p className="lp-fulfilment__sub">
              Shelf Merch also manages the complete merchandise operation behind every order.
            </p>
          </header>

          <div className="lp-fulfilment__grid">
            {FULFILMENT_ITEMS.map((item) => {
              const Icon = "icon" in item ? item.icon : null;
              return (
                <article key={item.label} className="lp-fulfilment-item">
                  <div className="lp-fulfilment-item__icon" aria-hidden>
                    {"img" in item && item.img ? (
                      <img src={item.img} alt="" width={160} height={160} loading="lazy" decoding="async" />
                    ) : Icon ? (
                      <span className="lp-fulfilment-item__lucide">
                        <Icon size={36} strokeWidth={1.75} />
                      </span>
                    ) : null}
                  </div>
                  <p className="lp-fulfilment-item__label">{item.label}</p>
                </article>
              );
            })}
          </div>

          <p className="lp-fulfilment__banner">One platform. One merchandise partner.</p>
        </div>
      </section>

      {/* ── WHY SHELF MERCH ── */}
      <section className="lp-section lp-why" id="why-shelf-merch" aria-labelledby="lp-why-title">
        <div className="lp-container">
          <header className="lp-why__header">
            <p className="lp-why__eyebrow">Why Shelf Merch</p>
            <h2 id="lp-why-title" className="lp-why__title">
              Built for companies that want better control and less coordination.
            </h2>
          </header>

          <div className="lp-why__grid">
            {WHY_SHELF_MERCH.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="lp-why-card">
                  <h3 className="lp-why-card__title">{item.title}</h3>
                  <p className="lp-why-card__desc">{item.description}</p>
                  <div className="lp-why-card__visual" aria-hidden>
                    <Icon size={36} strokeWidth={1.6} />
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── MERCH PROGRAMMES ── */}
      <section className="lp-section lp-programmes" id="programmes" aria-labelledby="lp-programmes-title">
        <div className="lp-container lp-programmes__inner">
          <h2 id="lp-programmes-title" className="lp-programmes__title">
            One platform for every merchandise programme.
          </h2>
          <ul className="lp-programmes__list">
            {MERCH_PROGRAMMES.map((label) => (
              <li key={label}>
                <span className="lp-programmes__chip">{label}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="lp-programmes__stripe" aria-hidden="true" />
      </section>

      {/* ── VENDOR CONSOLIDATION ── */}
      <section className="lp-consolidate" id="integrations" aria-label="Vendor consolidation">
        <img
          src={consolidateImg}
          alt="Consolidate all your gifting, swag, and recognition vendors"
          className="lp-consolidate__img"
          width={7932}
          height={3172}
          loading="lazy"
          decoding="async"
        />
      </section>

      {/* ── HOW IT WORKS (teams shell) ── */}
      <section className="lp-section lp-teams-section" id="how-it-works" aria-labelledby="lp-howto-title">
        <div className="lp-container">
          <header className="lp-teams-header">
            <p className="lp-howto-eyebrow">How it works</p>
            <h2 id="lp-howto-title" className="lp-teams-title">
              From idea to delivery in four simple steps.
            </h2>
          </header>

          <div className="lp-teams-shell">
            <nav className="lp-teams-nav" aria-label="How it works steps">
              {HOW_IT_STEPS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`lp-teams-nav__item${howStep === t.id ? " is-active" : ""}`}
                  onClick={() => setHowStep(t.id)}
                  aria-pressed={howStep === t.id}
                  style={
                    howStep === t.id
                      ? ({
                          background: t.theme.tabBg,
                          borderLeftColor: t.theme.tabBorder,
                          borderBottomColor: t.theme.tabBorder,
                          color: t.theme.cardText,
                        } as React.CSSProperties)
                      : undefined
                  }
                >
                  <span className="lp-howto-nav__step">{t.step}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </nav>

            <div
              className="lp-teams-stage"
              key={activeHowStep.id}
              style={{ background: activeHowStep.theme.bg }}
            >
              <div className="lp-teams-stage__copy">
                <div className="lp-teams-stage__icon" aria-hidden>
                  <LpIcon icon={activeHowStep.icon} size={44} strokeWidth={1.5} />
                </div>
                <p className="lp-howto-stage__num">{activeHowStep.step}</p>
                <h3 className="lp-teams-stage__title">{activeHowStep.title}</h3>
                <p className="lp-teams-stage__desc">{activeHowStep.desc}</p>
                <Link to="/signup" className="lp-teams-stage__link">
                  Book a Platform Walkthrough
                </Link>
              </div>

              <div
                className="lp-teams-stage__card"
                style={{ background: activeHowStep.theme.card, color: activeHowStep.theme.cardText }}
              >
                <ul className="lp-teams-stage__list">
                  {activeHowStep.benefits.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── USE CASES ── */}
      <section className="lp-section lp-usecases" id="use-cases">
        <div className="lp-container">
          <header className="lp-usecases-header">
            <p className="lp-usecases-eyebrow">Unlimited use cases</p>
            <h2 className="lp-usecases-title">Shelf Merch for every occasion</h2>
          </header>

          <div className="lp-usecases-grid">
            {USE_CASES.map((uc) => (
              <div key={uc.label} className="lp-usecase-card">
                <span className="lp-usecase-card__icon">
                  <LpIcon icon={uc.icon} size={20} strokeWidth={1.75} />
                </span>
                <span className="lp-usecase-card__label">{uc.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FLEXIBILITY ── */}
      {/* <section className="lp-section lp-flex-section" id="pricing">
        <div className="lp-container">
          <LpSectionHeader
            badge="Total Flexibility"
            title={<>You choose <span className="c-gold">what to give</span> (or not!)</>}
            sub="Selecting gift or reward items doesn't have to be up to you—unless you want it to be."
          />
          <div className="lp-flex-grid">
            <div className="lp-flex-card lp-shell">
              <div className="lp-flex-card__icon" style={{ background: "rgba(204,231,201,.65)", color: "var(--lp-green)" }}><LpIcon icon={Gift} size={24} /></div>
              <h3>Recipient's Choice</h3>
              <p>Give recipients points or a budget, and let them choose the reward they want.</p>
              <div className="lp-diagram">
                <div className="lp-diagram__avatar"><User size={18} /></div>
                <div className="lp-diagram__arrow">→</div>
                <div className="lp-diagram__badge"><Star size={12} fill="currentColor" strokeWidth={0} /> 2,500 PTS TO SPEND</div>
                <div className="lp-diagram__branch">
                  <span><ShoppingBag size={14} /></span><span><Gift size={14} /></span><span><CreditCard size={14} /></span>
                </div>
              </div>
            </div>
            <div className="lp-flex-card lp-shell">
              <div className="lp-flex-card__icon" style={{ background: "rgba(212,162,76,.18)", color: "var(--lp-gold-strong)" }}><LpIcon icon={ShoppingBag} size={24} /></div>
              <h3>Sender's Choice</h3>
              <p>Give recipients specific items of your choosing from our catalog.</p>
              <div className="lp-diagram">
                <div className="lp-diagram__avatar"><User size={18} /></div>
                <div className="lp-diagram__arrow">→</div>
                <div className="lp-diagram__box">
                  <span><Backpack size={14} /></span><span><Coffee size={14} /></span><span><CupSoda size={14} /></span>
                </div>
                <div className="lp-diagram__branch">
                  <span><User size={14} /></span><span><User size={14} /></span><span><User size={14} /></span>
                </div>
              </div>
            </div>
            <div className="lp-flex-card lp-shell">
              <div className="lp-flex-card__icon" style={{ background: "rgba(21,128,61,.12)", color: "var(--lp-green-mid)" }}><LpIcon icon={Users} size={24} /></div>
              <h3>Employee-to-Employee</h3>
              <p>Let employees reward one another with points or a budget they can redeem for cool stuff.</p>
              <div className="lp-diagram lp-diagram--circle">
                <div className="lp-diagram__kudos"><Star size={12} fill="currentColor" strokeWidth={0} /> 10 KUDOS TO SHARE</div>
                <div className="lp-diagram__avatars">
                  <span><User size={14} /></span><span><User size={14} /></span><span><User size={14} /></span><span><User size={14} /></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section> */}

      {/* ── AUDIENCE SOLUTIONS (replaces testimonials) ── */}
      <section className="lp-section lp-audience" id="solutions" aria-label="Solutions by team">
        <div className="lp-container">
          <header className="lp-audience__header">
            <p className="lp-audience__eyebrow">Solutions by team</p>
            <h2 className="lp-audience__heading">Built for HR and Marketing</h2>
          </header>
          <div className="lp-audience__grid">
            {AUDIENCE_SOLUTIONS.map((card) => (
              <article key={card.id} className={`lp-audience__card lp-audience__card--${card.tone}`}>
                <h2 className="lp-audience__title">{card.title}</h2>
                <p className="lp-audience__sub">{card.sub}</p>
                <ul className="lp-audience__list">
                  {card.items.map((item) => (
                    <li key={item}>
                      <Check size={16} strokeWidth={2.5} aria-hidden />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <a href={card.href} className="lp-audience__cta">
                  {card.cta}
                  <ChevronRight size={18} aria-hidden />
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── GET STARTED / PILOT ── */}
      <section className="lp-section lp-pilot" id="pilot" aria-labelledby="lp-pilot-title">
        <div className="lp-container lp-pilot__inner">
          <p className="lp-pilot__eyebrow">Get started</p>
          <h2 id="lp-pilot-title" className="lp-pilot__title">
            Start small. Expand when ready.
          </h2>
          <p className="lp-pilot__sub">
            Launch Shelf Merch with one programme, department or employee group. Once successful,
            expand across teams, offices and use cases.
          </p>
          <ul className="lp-pilot__options">
            {PILOT_OPTIONS.map((option) => (
              <li key={option.label} className={`lp-pilot__option lp-pilot__option--${option.tone}`}>
                <LpIcon icon={option.icon} size={18} strokeWidth={1.9} className="lp-pilot__option-icon" />
                <span>{option.label}</span>
              </li>
            ))}
          </ul>
          <Link to="/signup" className="lp-pilot__cta">
            Start a Pilot
          </Link>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="lp-section lp-faq" id="faq" aria-labelledby="lp-faq-title">
        <div className="lp-container lp-faq__inner">
          <header className="lp-faq__header">
            <p className="lp-faq__eyebrow">FAQ</p>
            <h2 id="lp-faq-title" className="lp-faq__title">
              Questions, answered.
            </h2>
          </header>
          <div className="lp-faq__list">
            {FAQ_ITEMS.map((item) => (
              <details key={item.q} className="lp-faq__item">
                <summary className="lp-faq__question">
                  <span>{item.q}</span>
                  <Plus className="lp-faq__icon" size={18} strokeWidth={2.2} aria-hidden />
                </summary>
                <p className="lp-faq__answer">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── CLOSING CTA ── */}
      <section className="lp-section lp-close-cta" id="get-started" aria-labelledby="lp-close-cta-title">
        <div className="lp-container lp-close-cta__content">
          <p className="lp-close-cta__eyebrow">Next step</p>
          <h2 id="lp-close-cta-title" className="lp-close-cta__title">
            Ready to simplify company merchandise?
          </h2>
          <p className="lp-close-cta__sub">
            See how Shelf Merch can help your HR and Marketing teams manage stores,
            campaigns, budgets and fulfilment from one platform.
          </p>
          <div className="lp-close-cta__actions">
            <Link to="/signup" className="lp-close-cta__btn lp-close-cta__btn--primary">
              Book a Demo
              <ChevronRight size={18} strokeWidth={2.4} aria-hidden />
            </Link>
            <Link to="/signup" className="lp-close-cta__btn lp-close-cta__btn--secondary">
              Request a Branded Store Preview
            </Link>
          </div>
          <p className="lp-close-cta__note">
            No complicated setup. Start with one programme and expand when ready.
          </p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="lp-footer" id="company">
        <div className="lp-container">
          <div className="lp-footer__grid">
            <div className="lp-footer__brand">
              <a href="/" className="lp-logo lp-logo--footer">
                <ShelfMerchLogo theme="light" height={32} className="lp-logo__img" />
              </a>
              <p className="lp-footer__tagline">
                Gifting, swag &amp; recognition. One platform.
              </p>
              <div className="lp-footer__social">
                <a href="#" aria-label="LinkedIn">
                  <Linkedin size={17} strokeWidth={2} />
                </a>
                <a href="#" aria-label="YouTube">
                  <Youtube size={17} strokeWidth={2} />
                </a>
                <a href="#" aria-label="Instagram">
                  <Instagram size={17} strokeWidth={2} />
                </a>
              </div>
              <div className="lp-footer__offerings">
                <p className="lp-footer__offerings-label">
                  <span>Our offerings</span>
                </p>
                <div className="lp-footer__offerings-list">
                  {FOOTER_OFFERINGS.map((item) => (
                    <a key={item.label} href="#products" className="lp-footer__offering">
                      <LpIcon icon={item.icon} size={14} strokeWidth={2} />
                      {item.label}
                    </a>
                  ))}
                </div>
              </div>
            </div>

            {FOOTER_COLUMNS.map((col) => (
              <div key={col.title} className="lp-footer__col">
                <h4 className="lp-footer__col-title">{col.title}</h4>
                <ul className="lp-footer__links">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <a href={link.href}>{link.label}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="lp-footer__bottom">
          <div className="lp-container lp-footer__bottom-inner">
            <span className="lp-footer__copy">© 2026 ShelfMerch. All rights reserved.</span>
            <div className="lp-footer__bottom-links">
              <a href="/legal/privacy-policy">Privacy Policy</a>
              <a href="/legal/terms-of-service">Terms of Service</a>
              <a href="#">Security</a>
              <a href="mailto:support@shelfmerch.com">Need Help?</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

