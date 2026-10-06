import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import {
  formatNotificationTime,
  resolveNotificationLink,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useRecentNotifications,
  useUnreadNotificationCount,
  type AppNotification,
} from "@/features/notifications/model";
import { clearFundingSuccess } from "@/features/wallets/fundingSuccess";
import { WORKSPACE_QUERY_KEY } from "@/hooks/useWorkspace";

function NotificationItem({
  item,
  onSelect,
}: {
  item: AppNotification;
  onSelect: (item: AppNotification) => void;
}) {
  return (
    <button
      type="button"
      className={`notif-item${item.read ? "" : " unread"}`}
      onClick={() => onSelect(item)}
    >
      <span className="notif-item-dot" aria-hidden="true" />
      <span className="notif-item-copy">
        <span className="notif-item-title">{item.title}</span>
        {item.body ? <span className="notif-item-body">{item.body}</span> : null}
        <span className="notif-item-time">{formatNotificationTime(item.createdAt)}</span>
      </span>
    </button>
  );
}

/** Shared inbox bell for tenant + platform topbars. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const unread = useUnreadNotificationCount();
  const recent = useRecentNotifications({ page: 1, limit: 20 });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Close when clicking outside. The fixed scrim can be clipped by shell overflow,
  // so also listen on the document.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const wrap = wrapRef.current;
      if (!wrap) return;
      if (wrap.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  useEffect(() => {
    if (open) void recent.refetch();
  }, [open, recent.refetch]);

  const unreadCount = unread.data ?? 0;
  const items = recent.data?.items ?? [];
  const badgeLabel = unreadCount > 99 ? "99+" : String(unreadCount);

  function close() {
    setOpen(false);
  }

  async function onSelect(item: AppNotification) {
    if (!item.read) {
      try {
        await markRead.mutateAsync(item._id);
      } catch {
        // Still allow navigation if mark-read fails.
      }
    }
    close();
    const href = resolveNotificationLink(item.link);
    if (!href) return;

    // Funded / wallet deep-links should open the live dashboard, not the
    // post-submit "Funding request submitted" screen kept in sessionStorage.
    const isWalletLink = href.includes("/wallets");
    if (item.type === "wallet_funded" || isWalletLink) {
      clearFundingSuccess();
      void queryClient.invalidateQueries({ queryKey: WORKSPACE_QUERY_KEY });
    }

    if (/^https?:\/\//i.test(href)) {
      window.location.assign(href);
      return;
    }
    void navigate(href);
  }

  async function onMarkAll() {
    if (unreadCount === 0 || markAll.isPending) return;
    try {
      await markAll.mutateAsync();
    } catch {
      // Keep panel open; list refetch will show current state.
    }
  }

  return (
    <div className="notif-bell-wrap" ref={wrapRef}>
      <button
        type="button"
        className="notif-bell-btn"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={20} strokeWidth={2} />
        {unreadCount > 0 ? (
          <span className="notif-bell-badge" aria-hidden="true">
            {badgeLabel}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="user-menu-scrim"
            aria-label="Close notifications"
            onClick={close}
          />
          <div className="notif-panel" role="menu" onClick={(e) => e.stopPropagation()}>
            <div className="notif-panel-head">
              <div className="notif-panel-title">Notifications</div>
              <button
                type="button"
                className="notif-mark-all"
                disabled={unreadCount === 0 || markAll.isPending}
                onClick={() => void onMarkAll()}
              >
                Mark all read
              </button>
            </div>

            <div className="notif-panel-body">
              {recent.isLoading ? (
                <div className="notif-state">Loading…</div>
              ) : recent.isError ? (
                <div className="notif-state notif-state-error">
                  Couldn&apos;t load notifications.
                  <button type="button" className="notif-retry" onClick={() => void recent.refetch()}>
                    Retry
                  </button>
                </div>
              ) : items.length === 0 ? (
                <div className="notif-state">You&apos;re all caught up.</div>
              ) : (
                items.map((item) => (
                  <NotificationItem key={item._id} item={item} onSelect={(n) => void onSelect(n)} />
                ))
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
