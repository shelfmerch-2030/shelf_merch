import type { LucideIcon } from "lucide-react";
import {
  Award,
  Box,
  Briefcase,
  Cake,
  ChevronLeft,
  ChevronRight,
  Flower2,
  Gift,
  Heart,
  PackagePlus,
  PartyPopper,
  Search,
  Send,
  Sparkles,
  Star,
  Sun,
  Trees,
  Users,
} from "lucide-react";
import { COMPLETE_STATUSES, isIncompleteCampaign, isLiveCampaign, isPointsCampaign, isSentKitCampaign } from "../model";
import type { UiCampaign } from "../model";
import type {
  CampaignFilter,
  CampaignStats,
  CampaignTypeCounts,
  CampaignTypeTab,
} from "../controllers/useCampaignsController";
import { CAMPAIGN_FILTERS } from "../controllers/useCampaignsController";
import { CampaignsEmptyStateView } from "./CampaignsEmptyStateView";
import "../campaigns-page.css";

const TAB_LABELS: Record<CampaignFilter, string> = {
  all: "All",
  live: "Live",
  draft: "Draft",
  completed: "Completed",
};

const TYPE_TABS: { id: CampaignTypeTab; label: string }[] = [
  { id: "recent", label: "Recent" },
  { id: "kits", label: "Kit sends" },
  { id: "points", label: "Points" },
];

const POINTS_ICONS: LucideIcon[] = [
  Gift,
  Sparkles,
  PartyPopper,
  Star,
  Heart,
  Award,
  Users,
  Sun,
  Flower2,
  Cake,
  Briefcase,
  Trees,
];

const POINTS_TONES = ["indigo", "rose", "amber", "emerald", "sky", "violet"] as const;

const NAME_ICON_RULES: { match: RegExp; icon: LucideIcon; tone: (typeof POINTS_TONES)[number] }[] = [
  { match: /holi|festival|diwali|deepavali|navratri|eid|christmas|xmas/i, icon: PartyPopper, tone: "amber" },
  { match: /women|mother|valentine|love|heart/i, icon: Heart, tone: "rose" },
  { match: /birthday|annivers|cake|celebrate/i, icon: Cake, tone: "violet" },
  { match: /weekend|summer|sun|spring|picnic/i, icon: Sun, tone: "sky" },
  { match: /new\s*year|welcome|onboard|join/i, icon: Sparkles, tone: "indigo" },
  { match: /team|employee|staff|people|hr/i, icon: Users, tone: "emerald" },
  { match: /award|recogni|bonus|reward|points/i, icon: Award, tone: "amber" },
  { match: /work|office|biz|corp|business/i, icon: Briefcase, tone: "sky" },
  { match: /gift|swag|surprise|treat/i, icon: Gift, tone: "rose" },
  { match: /order|shop|merch|pack/i, icon: Box, tone: "indigo" },
];

function hashKey(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h;
}

function campaignVisual(c: UiCampaign): {
  Icon: LucideIcon;
  tone: (typeof POINTS_TONES)[number] | "kit";
} {
  if (!isPointsCampaign(c)) {
    return { Icon: Box, tone: "kit" };
  }

  const name = c.name ?? "";
  for (const rule of NAME_ICON_RULES) {
    if (rule.match.test(name)) return { Icon: rule.icon, tone: rule.tone };
  }

  const key = `${c.id}:${name}`;
  const h = hashKey(key);
  return {
    Icon: POINTS_ICONS[h % POINTS_ICONS.length],
    tone: POINTS_TONES[h % POINTS_TONES.length],
  };
}

function statusChip(c: UiCampaign) {
  if (isSentKitCampaign(c))
    return (
      <span className="camp-chip camp-chip--sent">
        <span className="camp-chip__dot" />
        Sent
      </span>
    );
  if (isLiveCampaign(c))
    return (
      <span className="camp-chip camp-chip--live">
        <span className="camp-chip__dot" />
        Live
      </span>
    );
  if (c.status === "scheduled")
    return (
      <span className="camp-chip camp-chip--sched">
        <span className="camp-chip__dot" />
        Scheduled
      </span>
    );
  if (isIncompleteCampaign(c))
    return (
      <span className="camp-chip camp-chip--draft">
        <span className="camp-chip__dot" />
        Draft
      </span>
    );
  if (COMPLETE_STATUSES.includes(c.status))
    return (
      <span className="camp-chip camp-chip--done">
        <span className="camp-chip__dot" />
        Completed
      </span>
    );
  return <span className="camp-chip">{c.status}</span>;
}

function campaignTitle(c: UiCampaign) {
  if (isPointsCampaign(c)) return c.name;
  return `Kit send: ${c.name}`;
}

function campaignSubtext(c: UiCampaign) {
  if (isPointsCampaign(c)) return null;
  return `From kit: ${c.name}`;
}

function typeLabel(c: UiCampaign) {
  return isPointsCampaign(c) ? "Send points" : "Kit send";
}

/** Campaigns list: hero, KPI strip, unified panel with filters and dense rows. */
export function CampaignsTableView({
  stats,
  typeTab,
  typeCounts,
  typeTabEmpty,
  filter,
  search,
  pageItems,
  page,
  totalPages,
  totalFiltered,
  showingStart,
  showingEnd,
  canSend,
  onTypeTab,
  onFilter,
  onSearch,
  onPage,
  onSendGift,
  onSendPointsCampaign,
  onSendKitCampaign,
  onResumeCampaign,
}: {
  stats: CampaignStats;
  typeTab: CampaignTypeTab;
  typeCounts: CampaignTypeCounts;
  typeTabEmpty: boolean;
  filter: CampaignFilter;
  search: string;
  pageItems: UiCampaign[];
  page: number;
  totalPages: number;
  totalFiltered: number;
  showingStart: number;
  showingEnd: number;
  canSend: boolean;
  onTypeTab: (tab: CampaignTypeTab) => void;
  onFilter: (filter: CampaignFilter) => void;
  onSearch: (search: string) => void;
  onPage: (page: number) => void;
  onSendGift: () => void;
  onSendPointsCampaign: () => void;
  onSendKitCampaign: () => void;
  onResumeCampaign: (campaign: UiCampaign) => void;
}) {
  const kpis = [
    {
      label: "Total campaigns",
      value: stats.total.toLocaleString("en-IN"),
      hint: "Across points and kits",
      tone: "slate",
      live: false,
    },
    {
      label: "Live",
      value: stats.live.toLocaleString("en-IN"),
      hint: "Currently running",
      tone: "blue",
      live: true,
    },
    {
      label: "Draft",
      value: stats.draft.toLocaleString("en-IN"),
      hint: "Ready to finish",
      tone: "amber",
      live: false,
    },
    {
      label: "Recipients",
      value: stats.recipients.toLocaleString("en-IN"),
      hint: "People reached",
      tone: "green",
      live: false,
    },
  ] as const;

  return (
    <div className="campaigns-page">
      <header className="camp-hero">
        <div className="camp-hero__copy">
          <h1>Campaigns</h1>
          <p className="camp-hero__sub">Track points campaigns and kit-send history.</p>
        </div>
        {canSend ? (
          <div className="camp-hero__actions">
            <button type="button" className="camp-hero__ghost" onClick={onSendPointsCampaign}>
              <Send size={16} aria-hidden="true" />
              Send points
            </button>
            <button type="button" className="camp-hero__ghost" onClick={onSendKitCampaign}>
              <PackagePlus size={16} aria-hidden="true" />
              Send kit
            </button>
            <button type="button" className="camp-hero__cta" onClick={onSendGift}>
              <Gift size={16} aria-hidden="true" />
              Send gift
            </button>
          </div>
        ) : null}
      </header>

      <div className="camp-kpi" aria-label="Campaign metrics">
        {kpis.map((item) => (
          <div key={item.label} className={`camp-kpi__item camp-kpi__item--${item.tone}`}>
            <span className="camp-kpi__content">
              <span className="camp-kpi__label">{item.label}</span>
              <span className="camp-kpi__line">
                {item.live ? <span className="camp-kpi__dot" aria-hidden="true" /> : null}
                <span className="camp-kpi__value">{item.value}</span>
              </span>
              <span className="camp-kpi__hint">{item.hint}</span>
            </span>
          </div>
        ))}
      </div>

      <section className="camp-panel">
        <div className="camp-panel__toolbar">
          <div className="camp-seg" role="tablist" aria-label="Campaign type">
            {TYPE_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={typeTab === tab.id}
                className={`camp-seg__btn${typeTab === tab.id ? " is-active" : ""}`}
                onClick={() => onTypeTab(tab.id)}
              >
                {tab.label}
                <span className="camp-seg__count">{typeCounts[tab.id]}</span>
              </button>
            ))}
          </div>

          {!typeTabEmpty ? (
            <>
              <label className="camp-panel__search">
                <Search size={15} aria-hidden="true" />
                <input
                  placeholder="Search campaigns"
                  value={search}
                  onChange={(e) => onSearch(e.target.value)}
                  aria-label="Search campaigns"
                />
              </label>

              <div className="camp-seg camp-status-seg" role="group" aria-label="Status filter">
                {CAMPAIGN_FILTERS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`camp-seg__btn${filter === t ? " is-active" : ""}`}
                    onClick={() => onFilter(t)}
                  >
                    {TAB_LABELS[t]}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>

        {typeTabEmpty ? (
          <CampaignsEmptyStateView
            embedded
            canSend={canSend}
            onSendGift={onSendGift}
          />
        ) : (
          <>
            <div className="camp-list-head" aria-hidden="true">
              <span>Campaign</span>
              <span className="camp-list-head__type">Type</span>
              <span className="camp-list-head__status">Status</span>
              <span className="camp-list-head__num">Recipients</span>
            </div>

            <div className="camp-list-body" role="list">
              {pageItems.length ? (
                pageItems.map((c) => {
                  const { Icon, tone } = campaignVisual(c);
                  const resumable =
                    canSend &&
                    isIncompleteCampaign(c) &&
                    (isPointsCampaign(c) ? Boolean(c.shopId) : Boolean(c.kitId));
                  return (
                    <div
                      key={c.id}
                      className={`camp-row${resumable ? " camp-row--resumable" : ""}`}
                      role="listitem"
                      tabIndex={resumable ? 0 : undefined}
                      aria-label={resumable ? `Continue draft ${campaignTitle(c)}` : undefined}
                      onClick={resumable ? () => onResumeCampaign(c) : undefined}
                      onKeyDown={
                        resumable
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onResumeCampaign(c);
                              }
                            }
                          : undefined
                      }
                    >
                      <div className="camp-row__main">
                        <div className={`camp-row__icon camp-row__icon--${tone}`} aria-hidden="true">
                          <Icon size={17} strokeWidth={2} />
                        </div>
                        <div className="camp-row__text">
                          <span className="camp-row__title">{campaignTitle(c)}</span>
                          {campaignSubtext(c) ? (
                            <span className="camp-row__sub">{campaignSubtext(c)}</span>
                          ) : null}
                          {resumable ? (
                            <span className="camp-row__resume">Continue sending</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="camp-row__type">
                        <span className="camp-chip">{typeLabel(c)}</span>
                      </div>
                      <div className="camp-row__status">{statusChip(c)}</div>
                      <div className="camp-row__num">{c.recipientCount.toLocaleString("en-IN")}</div>
                    </div>
                  );
                })
              ) : (
                <div className="camp-list-empty">No campaigns match your filters.</div>
              )}
            </div>

            <div className="camp-panel__footer">
              <span className="camp-panel__meta">
                Showing {showingStart} to {showingEnd} of {totalFiltered} campaigns
              </span>
              {totalPages > 1 ? (
                <div className="camp-pager">
                  <button
                    type="button"
                    className="camp-pager__btn"
                    disabled={page <= 1}
                    onClick={() => onPage(page - 1)}
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`camp-pager__btn${n === page ? " is-active" : ""}`}
                      onClick={() => onPage(n)}
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="camp-pager__btn"
                    disabled={page >= totalPages}
                    onClick={() => onPage(page + 1)}
                    aria-label="Next page"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
