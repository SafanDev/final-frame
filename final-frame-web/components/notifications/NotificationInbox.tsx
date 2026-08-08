"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "@/lib/api/notifications";
import { getUserFacingErrorMessage, normalizeApiError } from "@/lib/api/errors";
import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
import { useUserPreferences } from "@/contexts/UserPreferencesContext";
import { formatDateTime } from "@/lib/utils/format";

const safeHref = (href: string | null): string => href?.startsWith("/") && !href.startsWith("//") ? href : "/notifications";

const deliveryLabel = (item: NotificationItem): string | null => {
  if (item.emailStatus === "SENT") return "Email sent";
  if (item.emailStatus === "PENDING" || item.emailStatus === "PROCESSING") return "Email queued";
  if (item.emailStatus === "FAILED") return "Email retrying";
  if (item.emailStatus === "ABANDONED") return "Email stopped";
  return null;
};

export default function NotificationInbox() {
  const preferences = useUserPreferences();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getNotifications({}, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        setItems(page.items);
        setUnreadCount(page.unreadCount);
        setNextCursor(page.pageInfo.nextCursor);
        setHasMore(page.pageInfo.hasMore);
        setError(null);
      })
      .catch((caught) => {
        const normalized = normalizeApiError(caught);
        if (normalized.kind === "aborted") return;
        setError(getUserFacingErrorMessage(normalized, "Notifications could not be loaded."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function markRead(item: NotificationItem) {
    if (item.readAt) return;
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry));
    setUnreadCount((count) => Math.max(0, count - 1));
    try {
      await markNotificationRead(item.id);
    } catch {
      toast.error("Could not mark this update as read.");
    }
  }

  async function markAll() {
    if (!unreadCount) return;
    const readAt = new Date().toISOString();
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? readAt })));
    setUnreadCount(0);
    try {
      await markAllNotificationsRead();
      toast.success("Inbox cleared.");
    } catch (caught) {
      setError(getUserFacingErrorMessage(normalizeApiError(caught), "Notifications could not be updated."));
    }
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await getNotifications({ cursor: nextCursor });
      setItems((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...page.items.filter((item) => !known.has(item.id))];
      });
      setUnreadCount(page.unreadCount);
      setNextCursor(page.pageInfo.nextCursor);
      setHasMore(page.pageInfo.hasMore);
    } catch (caught) {
      setError(getUserFacingErrorMessage(normalizeApiError(caught), "More notifications could not be loaded."));
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) return <div className="ff-inbox-loading" role="status">Loading inbox…</div>;

  return (
    <div className="ff-inbox-content">
      <div className="ff-inbox-toolbar">
        <p>{unreadCount ? `${unreadCount} unread` : "All caught up"}</p>
        {unreadCount ? <Button type="button" variant="ghost" size="sm" onClick={() => void markAll()}>Mark all read</Button> : null}
      </div>

      {error ? <InlineAlert tone="error" title="Could not update Inbox" className="ff-inbox-alert">{error}</InlineAlert> : null}

      {items.length ? (
        <ol className="ff-inbox-list">
          {items.map((item) => {
            const delivery = deliveryLabel(item);
            return (
              <li key={item.id} className={`ff-inbox-item${item.readAt ? "" : " is-unread"}`}>
                <Link href={safeHref(item.href)} onClick={() => void markRead(item)} className="ff-inbox-link">
                  <span className="ff-inbox-dot" aria-hidden="true" />
                  <div className="ff-inbox-item-main">
                    <div className="ff-inbox-item-head">
                      <h2>{item.title}</h2>
                      <time dateTime={item.createdAt}>{formatDateTime(item.createdAt, preferences)}</time>
                    </div>
                    <p>{item.body}</p>
                    <div className="ff-inbox-meta">
                      {item.project ? <span>{item.project.title}</span> : null}
                      {delivery ? <span>{delivery}</span> : null}
                    </div>
                  </div>
                  <span className="ff-inbox-arrow" aria-hidden="true">↗</span>
                </Link>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="ff-inbox-empty">
          <span className="ff-inbox-empty-mark" aria-hidden="true">✓</span>
          <h2>Nothing new</h2>
          <p>New review activity will appear here.</p>
          <Link href="/app">Back to projects <span aria-hidden="true">↗</span></Link>
        </div>
      )}

      {hasMore ? <div className="ff-inbox-more"><Button type="button" variant="secondary" size="sm" loading={loadingMore} onClick={() => void loadMore()}>Load earlier</Button></div> : null}
    </div>
  );
}
