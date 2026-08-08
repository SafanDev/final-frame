import { emailDeliveryEnabled } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  AccountStatus,
  EmailDeliveryStatus,
  EmailOutboxType,
  NotificationDeliveryMode,
  type NotificationType,
} from '../generated/prisma/enums.js';
import { getNextDigestSchedule } from './notification-delivery-core.js';

interface NotificationClient {
  user: Pick<Prisma.TransactionClient['user'], 'findUnique'>;
  notification: Pick<Prisma.TransactionClient['notification'], 'create' | 'update' | 'createMany'>;
  emailOutbox: Pick<Prisma.TransactionClient['emailOutbox'], 'create'>;
  project: Pick<Prisma.TransactionClient['project'], 'findUniqueOrThrow'>;
}

export interface CreateNotificationInput {
  recipientId: string;
  actorId?: string | null;
  projectId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  href?: string | null;
  traceparent?: string | null;
}

const queueNotificationEmail = async (
  client: NotificationClient,
  notification: { id: string; recipientId: string; title: string },
  traceparent?: string | null,
): Promise<void> => {
  if (!emailDeliveryEnabled) return;

  const recipient = await client.user.findUnique({
    where: { id: notification.recipientId },
    select: { email: true, status: true, notificationDelivery: true, timeZone: true },
  });
  if (!recipient || recipient.status === AccountStatus.DELETED || recipient.notificationDelivery === NotificationDeliveryMode.IN_APP_ONLY) {
    return;
  }

  const immediate = recipient.notificationDelivery === NotificationDeliveryMode.IMMEDIATE;
  const schedule = immediate ? null : getNextDigestSchedule(new Date(), recipient.timeZone);
  const batchKey = schedule ? `notification-digest:${notification.recipientId}:${schedule.batchDate}` : null;
  await client.emailOutbox.create({
    data: {
      type: EmailOutboxType.NOTIFICATION,
      recipient: recipient.email,
      subject: immediate ? notification.title.slice(0, 200) : 'Your FinalFrame notification digest',
      payload: {
        mode: immediate ? 'IMMEDIATE' : 'DAILY_DIGEST',
        notificationIds: [notification.id],
        ...(traceparent ? { traceparent } : {}),
      },
      userId: notification.recipientId,
      batchKey,
      ...(schedule ? { nextAttemptAt: schedule.nextAttemptAt } : {}),
    },
    select: { id: true },
  });
  await client.notification.update({
    where: { id: notification.id },
    data: { emailStatus: EmailDeliveryStatus.PENDING },
    select: { id: true },
  });
};

export async function createNotification(
  input: CreateNotificationInput,
  client: NotificationClient = prisma,
): Promise<string | null> {
  if (input.actorId && input.actorId === input.recipientId) return null;
  const notification = await client.notification.create({
    data: {
      recipientId: input.recipientId,
      type: input.type,
      title: input.title.slice(0, 120),
      body: input.body.slice(0, 500),
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      ...(input.href !== undefined ? { href: input.href } : {}),
    },
    select: { id: true, recipientId: true, title: true },
  });
  await queueNotificationEmail(client, notification, input.traceparent);
  return notification.id;
}

export async function notifyProjectParticipants(
  projectId: string,
  actorId: string,
  input: Omit<CreateNotificationInput, 'recipientId' | 'actorId' | 'projectId'>,
  transaction: Prisma.TransactionClient,
): Promise<void> {
  const project = await transaction.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { ownerId: true, members: { select: { userId: true } } },
  });
  const recipients = [project.ownerId, ...project.members.map((member) => member.userId)]
    .filter((id, index, values) => id !== actorId && values.indexOf(id) === index);
  for (const recipientId of recipients) {
    await createNotification({
      ...input,
      recipientId,
      actorId,
      projectId,
    }, transaction);
  }
}
