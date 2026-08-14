import zohoPeopleIcon from "../../../assets/integrations/zoho-people.png";
import googleChatIcon from "../../../assets/integrations/google-chat.svg";
import microsoftTeamsIcon from "../../../assets/integrations/microsoft-teams.svg";
import zapierIcon from "../../../assets/integrations/zapier.png";
import darwinboxIcon from "../../../assets/integrations/darwinbox.jpg";
import kekaIcon from "../../../assets/integrations/keka-logo.png";
import bamboohrIcon from "../../../assets/integrations/bamboohr-logo.png";
import workdayIcon from "../../../assets/integrations/workday-logo.png";
import gustoIcon from "../../../assets/integrations/gusto-logo.png";
import deelIcon from "../../../assets/integrations/deel-logo.png";
import ukgProIcon from "../../../assets/integrations/ukg-pro-logo.png";
import hibobIcon from "../../../assets/integrations/hibob-logo.png";
import razorpayIcon from "../../../assets/integrations/razorpay.svg";
import shiprocketIcon from "../../../assets/integrations/shiprocket.png";
import slackIcon from "../../../assets/integrations/slack.svg";
import googleWorkspaceIcon from "../../../assets/integrations/google-workspace.svg";
import oktaIcon from "../../../assets/integrations/okta.svg";
import microsoftEntraIcon from "../../../assets/integrations/microsoft-entra.svg";
import auth0Icon from "../../../assets/integrations/auth0.svg";
import oneloginIcon from "../../../assets/integrations/onelogin.svg";

export type Integration = {
  id: string;
  name: string;
  category: string;
  desc: string;
  connected: boolean;
  icon: string;
};

export const INTEGRATIONS: Integration[] = [
  {
    id: "zoho-people",
    name: "Zoho People",
    category: "HRIS",
    desc: "Connect your Zoho People account to import employees and manage onboarding kit orders.",
    connected: false,
    icon: zohoPeopleIcon,
  },
  {
    id: "darwinbox",
    name: "Darwinbox",
    category: "HRIS",
    desc: "Sync employees, birthdays & start dates",
    connected: true,
    icon: darwinboxIcon,
  },
  {
    id: "keka",
    name: "Keka",
    category: "HRIS",
    desc: "People data & org chart for automated gifting triggers",
    connected: false,
    icon: kekaIcon,
  },
  {
    id: "bamboohr",
    name: "BambooHR",
    category: "HRIS",
    desc: "Import employee records, departments & hire dates",
    connected: false,
    icon: bamboohrIcon,
  },
  {
    id: "workday",
    name: "Workday",
    category: "HRIS",
    desc: "Sync workforce data from Workday HCM for gifting and recognition",
    connected: false,
    icon: workdayIcon,
  },
  {
    id: "okta",
    name: "Okta",
    category: "Identity",
    desc: "Single sign-on and user provisioning via Okta",
    connected: false,
    icon: oktaIcon,
  },
  {
    id: "microsoft-entra",
    name: "Microsoft Entra ID",
    category: "Identity",
    desc: "Sync users and groups from Azure AD / Entra",
    connected: false,
    icon: microsoftEntraIcon,
  },
  {
    id: "auth0",
    name: "Auth0",
    category: "Identity",
    desc: "Authenticate recipients and manage access policies",
    connected: false,
    icon: auth0Icon,
  },
  {
    id: "onelogin",
    name: "OneLogin",
    category: "Identity",
    desc: "SSO and directory sync for enterprise logins",
    connected: false,
    icon: oneloginIcon,
  },
  {
    id: "razorpay",
    name: "Razorpay",
    category: "Payments",
    desc: "Collect funds via UPI, cards, and netbanking",
    connected: true,
    icon: razorpayIcon,
  },
  {
    id: "shiprocket",
    name: "Shiprocket",
    category: "Logistics",
    desc: "Domestic & global fulfilment with live tracking",
    connected: true,
    icon: shiprocketIcon,
  },
  {
    id: "slack",
    name: "Slack",
    category: "Comms",
    desc: "Celebrate milestones and share redemption updates in channels",
    connected: false,
    icon: slackIcon,
  },
  {
    id: "google-workspace",
    name: "Google Workspace",
    category: "Directory",
    desc: "Provision recipients and sync org directory from Google",
    connected: false,
    icon: googleWorkspaceIcon,
  },
];

export type IntegrationCategory = { key: string; label: string; desc: string };

export const INTEG_CATEGORIES: IntegrationCategory[] = [
  { key: "HRIS", label: "HRIS", desc: "Employee records, hire dates & org structure" },
  {
    key: "Identity",
    label: "Identity Provider (SSO)",
    desc: "Single sign-on, provisioning & access control",
  },
  { key: "Payments", label: "Payments", desc: "Collect funds via UPI, cards & netbanking" },
  { key: "Logistics", label: "Logistics", desc: "Domestic & global fulfilment with tracking" },
  { key: "Comms", label: "Comms", desc: "Celebrate milestones in Slack & team channels" },
  { key: "Directory", label: "Directory", desc: "Provision recipients from company directory" },
];

export function categoryMeta(key: string): { total: number; connected: number } {
  const apps = INTEGRATIONS.filter((i) => i.category === key);
  return { total: apps.length, connected: apps.filter((i) => i.connected).length };
}

/* ── Tile catalog for the integrations screen ─────────────────────── */

export type Tile = {
  id: string;
  name: string;
  desc?: string;
  icon?: string;
  mark?: string;
  tone?: string;
  recommended?: boolean;
  /** Provider kept in catalog but not connectable until Merge/org setup is ready. */
  requiresSetup?: boolean;
};

const app = (id: string) => INTEGRATIONS.find((item) => item.id === id);

export function asTile(item: Integration | Tile): Tile {
  return {
    id: item.id,
    name: item.name,
    desc: "desc" in item ? item.desc : undefined,
    icon: "icon" in item ? item.icon : undefined,
    mark: "mark" in item ? item.mark : undefined,
    tone: "tone" in item ? item.tone : undefined,
    recommended: "recommended" in item ? item.recommended : undefined,
    requiresSetup: "requiresSetup" in item ? item.requiresSetup : undefined,
  };
}

export const COLLABORATION_TOOLS: Tile[] = [
  app("slack"),
  { id: "microsoft-teams", name: "Microsoft Teams", icon: microsoftTeamsIcon },
  { id: "google-chat", name: "Google Chat", icon: googleChatIcon },
  { id: "zapier", name: "Zapier", icon: zapierIcon },
  { id: "jostle", name: "Jostle", mark: "J", tone: "#242424" },
].filter(Boolean) as Tile[];

/** Merge.dev HRIS providers — ids match Merge integration slugs. */
export const MERGE_HRIS_TOOLS: Tile[] = [
  {
    id: "workday",
    name: "Workday",
    desc: "Sync workforce data from Workday HCM for gifting and recognition.",
    icon: workdayIcon,
  },
  {
    id: "bamboohr",
    name: "BambooHR",
    desc: "Import employee records, departments & hire dates.",
    icon: bamboohrIcon,
  },
  {
    id: "gusto",
    name: "Gusto",
    desc: "Import employee profiles and employment details from Gusto.",
    icon: gustoIcon,
    requiresSetup: true,
  },
  {
    id: "keka",
    name: "Keka",
    desc: "People data & org chart for automated gifting triggers.",
    icon: kekaIcon,
  },
  {
    id: "deel",
    name: "Deel",
    desc: "Sync global contractor and employee records from Deel.",
    icon: deelIcon,
  },
  {
    id: "ukg-pro",
    name: "UKG Pro",
    desc: "Connect UKG Pro to keep employee and org data up to date.",
    icon: ukgProIcon,
  },
  {
    id: "hibob",
    name: "HiBob",
    desc: "Sync people data and lifecycle events from HiBob.",
    icon: hibobIcon,
  },
];

/** Logo-card grid for User management (HRIS / HRMS providers). */
export const USER_MANAGEMENT_TOOLS: Tile[] = [
  ...MERGE_HRIS_TOOLS,
  app("zoho-people"),
  app("darwinbox"),
].filter(Boolean) as Tile[];

export const DISPLAY_TOOLS: Tile[] = [
  app("google-workspace"),
  app("razorpay"),
  app("shiprocket"),
].filter(Boolean) as Tile[];
