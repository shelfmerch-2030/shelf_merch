import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Coins,
  Gift,
  Package,
  Star,
  Store,
  Truck,
  Wallet,
} from "lucide-react";
import type { SlackNotificationPreferences } from "@/services/slack-api";
import {
  groupSlackNotificationOptions,
  resolveSlackNotificationPrefs,
  type SlackNotificationToggleKey,
} from "../slackDetailUi";
import { SlackClayToggle } from "./SlackClayToggle";

const NOTIFY_ICONS: Record<SlackNotificationToggleKey, LucideIcon> = {
  walletApproved: Coins,
  budgetAssigned: Wallet,
  lowBudget: BarChart3,
  pointsDistributed: Star,
  kitsAssigned: Gift,
  orderDispatched: Package,
  deliveryFailed: Truck,
  shopLaunched: Store,
};

type SlackConnectionLike = {
  notifications?: Partial<Record<SlackNotificationToggleKey, boolean>> | null;
  notifyOrderDispatched?: boolean;
};

export function SlackNotificationPrefsList({
  connection,
  disabled,
  onUpdate,
}: {
  connection: SlackConnectionLike | null;
  disabled?: boolean;
  onUpdate: (patch: Partial<SlackNotificationPreferences>) => void;
}) {
  const prefs = resolveSlackNotificationPrefs(connection);
  const groups = groupSlackNotificationOptions();

  return (
    <div className="bonus-integ-slack-pref-list">
      {groups.map((group) => (
        <div key={group.category} className="bonus-integ-slack-pref-group">
          <div className="bonus-integ-slack-pref-group__title">{group.category}</div>
          <div className="bonus-integ-slack-pref-group__items">
            {group.items.map((item) => {
              const Icon = NOTIFY_ICONS[item.key];
              const checked = prefs[item.key];

              return (
                <div key={item.key} className="bonus-integ-slack-pref-row">
                  <span className="bonus-integ-slack-pref-row__icon" aria-hidden="true">
                    <Icon size={14} strokeWidth={2} />
                  </span>
                  <span className="bonus-integ-slack-pref-row__copy">
                    <span className="bonus-integ-slack-pref-row__label">{item.label}</span>
                    <span className="bonus-integ-slack-pref-row__description">
                      {item.description}
                    </span>
                  </span>
                  <SlackClayToggle
                    checked={checked}
                    disabled={disabled}
                    label={`${item.label} notifications`}
                    onCheckedChange={(next) =>
                      onUpdate({
                        [item.key]: next,
                      })
                    }
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
