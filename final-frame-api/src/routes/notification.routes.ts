import { Router, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { AppError, NotFoundError } from '../errors/app-error.js';
import { getAuthenticatedUser, requireAuth, type AuthRequest } from '../middleware/auth.js';
import { disableResponseCaching } from '../utils/http.js';

const router = Router();
const cuid = z.string().cuid();
const queryInteger = z.preprocess(
  (raw) => raw === undefined || raw === '' ? 25 : Number(raw),
  z.number().int().min(1).max(100),
);
const cursorSchema = z.object({ createdAt: z.string().datetime({ offset: true }), id: cuid }).strict();

const encodeCursor = (input: { createdAt: Date; id: string }): string => Buffer.from(JSON.stringify({
  createdAt: input.createdAt.toISOString(),
  id: input.id,
}), 'utf8').toString('base64url');

const decodeCursor = (value: string | undefined) => {
  if (!value) return null;
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
  } catch {
    throw new AppError({ statusCode: 400, code: 'INVALID_CURSOR', message: 'Invalid notification cursor.', clientMessage: 'The notification page link is invalid. Refresh and try again.' });
  }
};

router.get('/', requireAuth, async (request: AuthRequest, response: Response): Promise<void> => {
  const user = getAuthenticatedUser(request);
  const query = z.object({ cursor: z.string().max(512).optional(), limit: queryInteger }).strict().parse(request.query);
  const cursor = decodeCursor(query.cursor);
  const where = {
    recipientId: user.id,
    ...(cursor ? {
      OR: [
        { createdAt: { lt: new Date(cursor.createdAt) } },
        { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
      ],
    } : {}),
  };
  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        href: true,
        readAt: true,
        emailStatus: true,
        emailedAt: true,
        createdAt: true,
        actor: { select: { id: true, name: true } },
        project: { select: { id: true, title: true } },
      },
    }),
    prisma.notification.count({ where: { recipientId: user.id, readAt: null } }),
  ]);
  const hasMore = rows.length > query.limit;
  const items = rows.slice(0, query.limit);
  const last = items.at(-1);
  disableResponseCaching(response);
  response.status(200).json({
    items,
    unreadCount,
    pageInfo: {
      hasMore,
      nextCursor: hasMore && last ? encodeCursor(last) : null,
    },
  });
});

router.patch('/:notificationId/read', requireAuth, async (request: AuthRequest, response: Response): Promise<void> => {
  const user = getAuthenticatedUser(request);
  const { notificationId } = z.object({ notificationId: cuid }).strict().parse(request.params);
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, recipientId: user.id },
    data: { readAt: new Date() },
  });
  if (result.count !== 1) throw new NotFoundError('Notification not found.');
  response.status(200).json({ message: 'Notification marked as read.' });
});

router.post('/read-all', requireAuth, async (request: AuthRequest, response: Response): Promise<void> => {
  const user = getAuthenticatedUser(request);
  const result = await prisma.notification.updateMany({
    where: { recipientId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  response.status(200).json({ message: 'All notifications marked as read.', updated: result.count });
});

export default router;
