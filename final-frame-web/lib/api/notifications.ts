import { apiClient } from "./client";
import { apiRoutes } from "./routes";
import { messageResponseSchema, notificationPageSchema } from "./schemas";
import type { z } from "zod";

export type NotificationPage = z.infer<typeof notificationPageSchema>;
export type NotificationItem = NotificationPage["items"][number];

export async function getNotifications(input: { cursor?: string; limit?: number } = {}, signal?: AbortSignal): Promise<NotificationPage> {
  const params = new URLSearchParams();
  if (input.cursor) params.set("cursor", input.cursor);
  if (input.limit) params.set("limit", String(input.limit));
  const suffix = params.size ? `?${params.toString()}` : "";
  return (await apiClient.request(`${apiRoutes.notifications.list}${suffix}`, { schema: notificationPageSchema, signal })).data;
}

export async function markNotificationRead(notificationId: string, signal?: AbortSignal): Promise<void> {
  await apiClient.request(apiRoutes.notifications.markRead(notificationId), {
    method: "PATCH",
    schema: messageResponseSchema,
    signal,
  });
}

export async function markAllNotificationsRead(signal?: AbortSignal): Promise<void> {
  await apiClient.request(apiRoutes.notifications.readAll, {
    method: "POST",
    schema: messageResponseSchema.passthrough(),
    signal,
  });
}
