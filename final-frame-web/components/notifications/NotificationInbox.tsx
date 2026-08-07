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
  if (item.emailStatus === "SENT") return "Email delivered";
  if (item.emailStatus === "PENDING" || item.emailStatus === "PROCESSING") return "Email queued";
  if (item.emailStatus === "FAILED") return "Email retrying";
  if (item.emailStatus === "ABANDONED") return "Email delivery stopped";
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
        setItems(page.items);
        setUnreadCount(page.unreadCount);
        setNextCursor(page.pageInfo.nextCursor);
        setHasMore(page.pageInfo.hasMore);
      })
      .catch((caught) => setError(getUserFacingErrorMessage(normalizeApiError(caught), "Notifications could not be loaded.")))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  async function markRead(item: NotificationItem) {
    if (item.readAt) return;
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry));
    setUnreadCount((count) => Math.max(0, count - 1));
    try {
      await markNotificationRead(item.id);
    } catch {
      toast.error("This notification could not be marked as read.");
    }
  }

  async function markAll() {
    if (!unreadCount) return;
    const readAt = new Date().toISOString();
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? readAt })));
    setUnreadCount(0);
    try {
      await markAllNotificationsRead();
      toast.success("All notifications marked as read.");
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

  if (loading) return <div className="py-14 text-sm text-zinc-400" role="status">Loading notifications…</div>;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-400">{unreadCount ? `${unreadCount} unread update${unreadCount === 1 ? "" : "s"}` : "You are up to date."}</p>
        <Button type="button" variant="secondary" disabled={!unreadCount} onClick={() => void markAll()}>Mark all read</Button>
      </div>
      {error ? <InlineAlert tone="error" title="Notification action failed" className="mt-5">{error}</InlineAlert> : null}
      {items.length ? (
        <ol className="mt-6 space-y-3">
          {items.map((item) => {
            const delivery = deliveryLabel(item);
            return (
              <li key={item.id} className={`rounded-2xl border p-5 transition ${item.readAt ? "border-white/10 bg-[#111214]" : "border-emerald-300/25 bg-emerald-400/[0.045]"}`}>
                <Link href={safeHref(item.href)} onClick={() => void markRead(item)} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-black text-white">{item.title}</p>
                      <p className="mt-2 text-sm leading-6 text-zinc-400">{item.body}</p>
                    </div>
                    {!item.readAt ? <span className="rounded-full bg-emerald-300 px-2.5 py-1 text-xs font-black uppercase tracking-[0.12em] text-zinc-950">New</span> : null}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
                    <time dateTime={item.createdAt}>{formatDateTime(item.createdAt, preferences)}</time>
                    {item.project ? <span>{item.project.title}</span> : null}
                    {delivery ? <span>{delivery}</span> : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-white/12 bg-[#111214] p-8 text-center">
          <h2 className="text-lg font-black text-white">No notifications yet</h2>
          <p className="mt-2 text-sm text-zinc-500">Project invitations, feedback and review decisions will appear here.</p>
        </div>
      )}
      {hasMore ? <div className="mt-6 flex justify-center"><Button type="button" variant="secondary" loading={loadingMore} onClick={() => void loadMore()}>Load earlier updates</Button></div> : null}
    </div>
  );
}
