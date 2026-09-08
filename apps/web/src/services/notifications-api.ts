import { apiFetch } from "./api";

export type AppNotification = {
  _id: string;
  tenantId?: string | null;
  userId: string;
  type: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  createdAt: string;
};

export type NotificationsPage = {
  items: AppNotification[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type ListNotificationsParams = {
  unread?: boolean;
  page?: number;
  limit?: number;
};

function toQuery(params: ListNotificationsParams = {}): string {
  const q = new URLSearchParams();
  if (params.unread) q.set("unread", "true");
  if (params.page != null) q.set("page", String(params.page));
  if (params.limit != null) q.set("limit", String(params.limit));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function listNotifications(params: ListNotificationsParams = {}) {
  return apiFetch<NotificationsPage>(`/notifications${toQuery(params)}`);
}

export function markAllNotificationsRead() {
  return apiFetch<{ success: true }>("/notifications/mark-all-read", {
    method: "PATCH",
  });
}

export function markNotificationRead(id: string) {
  return apiFetch<AppNotification>(`/notifications/${id}/read`, {
    method: "PATCH",
  });
}

/** Map API `link` values (including legacy short tenant paths) to an in-app href. */
export function resolveNotificationLink(link: string): string | null {
  const trimmed = link?.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const walletDeepLink = trimmed.match(/^(?:\/app)?\/wallets\/([a-fA-F0-9]{24})\/?$/);
  if (walletDeepLink) {
    return `/app/wallets?wallet=${walletDeepLink[1]}`;
  }

  if (
    trimmed.startsWith("/app") ||
    trimmed.startsWith("/platform") ||
    trimmed.startsWith("/redeem") ||
    trimmed.startsWith("/login")
  ) {
    return trimmed;
  }
  if (trimmed.startsWith("/")) return `/app${trimmed}`;
  return `/app/${trimmed}`;
}
