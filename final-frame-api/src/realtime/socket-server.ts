import { randomUUID } from 'node:crypto';
import type { Server as HttpServer, IncomingMessage } from 'node:http';
import { createAdapter } from '@socket.io/redis-streams-adapter';
import proxyaddr from 'proxy-addr';
import { Server, type Socket } from 'socket.io';
import { z } from 'zod';
import { decodeSessionCookieHeader, type AuthenticatedUser } from '../auth/session.js';
import { env, frontendOrigin } from '../config/env.js';
import { connectRedis } from '../config/redis.js';
import { prisma } from '../config/prisma.js';
import {
  acquireDistributedLease,
  consumeDistributedAttempt,
  releaseDistributedLease,
  renewDistributedLease,
} from '../services/distributed-guards.js';
import { metrics } from '../services/metrics.js';
import { canPublishWorkspaceEvent } from '../services/realtime-authorization.js';
import type { RealtimeController } from './types.js';
import { logger } from '../utils/logger.js';

interface ClientToServerEvents {
  'join-workspace': (payload: unknown) => void;
  'cursor-move': (payload: unknown) => void;
}

type ProjectRole = 'DESIGNER' | 'CLIENT';

interface ActiveUser {
  id: string;
  name: string;
  role: ProjectRole;
  socketId: string;
  socketIds: string[];
  connectionCount: number;
}

interface ServerToClientEvents {
  'active-users': (users: ActiveUser[]) => void;
  'cursor-update': (payload: {
    socketId: string;
    projectId: string;
    assetId: string;
    x: number;
    y: number;
  }) => void;
  'cursor-remove': (socketId: string) => void;
  'refresh-workspace': (payload: { reason: string }) => void;
  'workspace-error': (payload: { code: string; message: string }) => void;
  'project-deleted': (payload: { projectId: string }) => void;
  'project-member-removed': (payload: { projectId: string; userId: string }) => void;
}

interface InterServerEvents {
  ping: () => void;
}

interface SocketData {
  user: AuthenticatedUser;
  projectId?: string;
  projectRole?: ProjectRole;
  lastCursorAt?: number;
  guardIp?: string;
  guardLeaseMember?: string;
}

type FinalFrameServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

type FinalFrameSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

const joinWorkspaceSchema = z.union([
  z.string().cuid(),
  z.object({ projectId: z.string().cuid() }).strict(),
]);

const cursorSchema = z.object({
  projectId: z.string().cuid(),
  assetId: z.string().cuid(),
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
}).strict();

const userRoom = (userId: string): string => `user:${userId}`;

const createSocketError = (code: string): Error & { data: { code: string } } => {
  const error = new Error('Socket authentication failed.') as Error & { data: { code: string } };
  error.data = { code };
  return error;
};

const clientIp = (request: IncomingMessage): string => {
  try {
    return proxyaddr(request, (_address, index) => index < env.TRUST_PROXY_HOPS);
  } catch {
    return request.socket.remoteAddress ?? 'unknown';
  }
};

export interface SocketRuntime {
  io: FinalFrameServer;
  controller: RealtimeController;
  close(): Promise<void>;
}

/**
 * Creates the authenticated collaboration channel. Redis Streams distributes
 * packets, room operations and recovered sessions across API replicas. The
 * runtime stays usable in local development without Redis, while production
 * configuration requires the shared dependency.
 */
export const createSocketRuntime = async (httpServer: HttpServer): Promise<SocketRuntime> => {
  const io: FinalFrameServer = new Server(httpServer, {
    cors: {
      origin: frontendOrigin,
      credentials: true,
      methods: ['GET', 'POST'],
      allowedHeaders: ['X-Request-Id'],
    },
    allowRequest: (request, callback) => {
      const origin = request.headers.origin;
      callback(origin === frontendOrigin ? null : 'Origin not allowed.', origin === frontendOrigin);
    },
    maxHttpBufferSize: env.SOCKET_MAX_HTTP_BUFFER_BYTES,
    pingInterval: env.SOCKET_PING_INTERVAL_MS,
    pingTimeout: env.SOCKET_PING_TIMEOUT_MS,
    transports: ['websocket', 'polling'],
    connectionStateRecovery: {
      maxDisconnectionDuration: env.SOCKET_RECOVERY_MAX_DISCONNECTION_MS,
      skipMiddlewares: false,
    },
  });

  const redis = await connectRedis();
  if (redis) {
    io.adapter(createAdapter(redis, {
      streamName: `${env.REDIS_KEY_PREFIX}socket-stream`,
      channelPrefix: `${env.REDIS_KEY_PREFIX}socket-channel`,
      sessionKeyPrefix: `${env.REDIS_KEY_PREFIX}socket-session:`,
      maxLen: 20_000,
      onlyPlaintext: true,
    }));
  }

  const instanceId = randomUUID();

  const broadcastPresence = async (projectId: string): Promise<void> => {
    try {
      const sockets = await io.in(projectId).fetchSockets();
      const users = new Map<string, ActiveUser>();
      for (const connected of sockets) {
        const user = connected.data.user;
        if (!user) continue;
        const current = users.get(user.id);
        if (current) {
          current.connectionCount += 1;
          current.socketIds.push(connected.id);
        } else {
          users.set(user.id, {
            id: user.id,
            name: user.name ?? 'User',
            role: connected.data.projectRole ?? 'CLIENT',
            socketId: connected.id,
            socketIds: [connected.id],
            connectionCount: 1,
          });
        }
      }
      io.to(projectId).emit('active-users', [...users.values()]);
    } catch (error) {
      logger.warn('Realtime presence broadcast failed', { projectId, error });
    }
  };

  const leaveCurrentProject = async (socket: FinalFrameSocket): Promise<void> => {
    const projectId = socket.data.projectId;
    if (!projectId) return;

    delete socket.data.projectId;
    delete socket.data.projectRole;
    await socket.leave(projectId);
    socket.to(projectId).emit('cursor-remove', socket.id);
    await broadcastPresence(projectId);
  };

  io.use(async (socket, next) => {
    const ip = clientIp(socket.request);
    const leaseMember = `${instanceId}:${socket.id}`;
    let ipLeaseHeld = false;
    let userLeaseHeld = false;
    let released = false;
    let userId: string | undefined;

    const releaseLeases = async (): Promise<void> => {
      if (released) return;
      released = true;
      const releases: Promise<void>[] = [];
      if (ipLeaseHeld) releases.push(releaseDistributedLease('connection-ip', ip, leaseMember));
      if (userLeaseHeld && userId) releases.push(releaseDistributedLease('connection-user', userId, leaseMember));
      await Promise.allSettled(releases);
    };

    socket.conn.once('close', () => { void releaseLeases(); });
    socket.once('disconnect', () => { void releaseLeases(); });

    try {
      const ipAttemptAllowed = await consumeDistributedAttempt(
        'auth-ip',
        ip,
        env.SOCKET_AUTH_IP_ATTEMPTS_PER_MINUTE,
        60_000,
      );
      if (!ipAttemptAllowed) throw createSocketError('SOCKET_IP_RATE_LIMITED');

      ipLeaseHeld = await acquireDistributedLease(
        'connection-ip',
        ip,
        leaseMember,
        env.SOCKET_MAX_CONNECTIONS_PER_IP,
        env.SOCKET_CONNECTION_LEASE_TTL_MS,
      );
      if (!ipLeaseHeld) throw createSocketError('SOCKET_IP_CONNECTION_LIMIT');

      const user = await decodeSessionCookieHeader(socket.handshake.headers.cookie);
      userId = user.id;

      const userAttemptAllowed = await consumeDistributedAttempt(
        'auth-user',
        user.id,
        env.SOCKET_AUTH_USER_ATTEMPTS_PER_MINUTE,
        60_000,
      );
      if (!userAttemptAllowed) throw createSocketError('SOCKET_USER_RATE_LIMITED');

      userLeaseHeld = await acquireDistributedLease(
        'connection-user',
        user.id,
        leaseMember,
        env.SOCKET_MAX_CONNECTIONS_PER_USER,
        env.SOCKET_CONNECTION_LEASE_TTL_MS,
      );
      if (!userLeaseHeld) throw createSocketError('SOCKET_USER_CONNECTION_LIMIT');

      if (!socket.conn.transport || socket.conn.readyState === 'closed') {
        throw createSocketError('SOCKET_CLOSED_DURING_AUTH');
      }

      socket.data.user = user;
      socket.data.guardIp = ip;
      socket.data.guardLeaseMember = leaseMember;
      next();
    } catch (error) {
      await releaseLeases();
      const code = error instanceof Error && 'data' in error
        ? String((error as { data?: { code?: string } }).data?.code ?? 'SOCKET_AUTHENTICATION_FAILED')
        : 'SOCKET_AUTHENTICATION_FAILED';
      metrics.socketAuthenticationFailed(code);
      logger.warn('Socket connection rejected', { ip, code, error });
      next(error instanceof Error ? error : createSocketError(code));
    }
  });

  io.on('connection', (socket) => {
    metrics.socketConnected();
    let joinSequence = 0;
    let pendingJoinTimer: NodeJS.Timeout | undefined;

    void Promise.resolve(socket.join(userRoom(socket.data.user.id))).catch((error: unknown) => {
      logger.error('Socket personal-room join failed', {
        socketId: socket.id,
        userId: socket.data.user.id,
        error,
      });
      socket.disconnect(true);
    });

    const executeJoin = async (projectId: string, sequence: number): Promise<void> => {
      try {
        if (!socket.connected || sequence !== joinSequence) return;
        if (socket.data.projectId === projectId) return;

        const project = await prisma.project.findFirst({
          where: {
            id: projectId,
            deletionStatus: 'ACTIVE',
            OR: [
              { ownerId: socket.data.user.id },
              { members: { some: { userId: socket.data.user.id } } },
            ],
          },
          select: { id: true, ownerId: true },
        });

        if (!socket.connected || sequence !== joinSequence) return;
        if (!project) {
          socket.emit('workspace-error', {
            code: 'PROJECT_ACCESS_DENIED',
            message: 'Project access is no longer available.',
          });
          socket.disconnect(true);
          return;
        }

        await leaveCurrentProject(socket);
        await socket.join(projectId);
        socket.data.projectId = projectId;
        socket.data.projectRole = project.ownerId === socket.data.user.id ? 'DESIGNER' : 'CLIENT';
        await broadcastPresence(projectId);
      } catch (error) {
        logger.error('Socket workspace join failed', {
          socketId: socket.id,
          userId: socket.data.user.id,
          projectId,
          error,
        });
        if (socket.connected) {
          socket.emit('workspace-error', {
            code: 'WORKSPACE_JOIN_FAILED',
            message: 'The workspace could not be joined.',
          });
        }
      }
    };

    socket.on('join-workspace', (rawPayload) => {
      const parsed = joinWorkspaceSchema.safeParse(rawPayload);
      if (!parsed.success) {
        socket.emit('workspace-error', {
          code: 'INVALID_WORKSPACE_REQUEST',
          message: 'The workspace request is invalid.',
        });
        return;
      }

      joinSequence += 1;
      const sequence = joinSequence;
      const projectId = typeof parsed.data === 'string' ? parsed.data : parsed.data.projectId;
      if (pendingJoinTimer) clearTimeout(pendingJoinTimer);
      if (socket.data.projectId === projectId) return;

      pendingJoinTimer = setTimeout(() => {
        pendingJoinTimer = undefined;
        void executeJoin(projectId, sequence);
      }, env.SOCKET_JOIN_DEBOUNCE_MS);
      pendingJoinTimer.unref();
    });

    socket.on('cursor-move', (rawPayload) => {
      const now = Date.now();
      if (socket.data.lastCursorAt && now - socket.data.lastCursorAt < env.SOCKET_CURSOR_INTERVAL_MS) return;

      const parsed = cursorSchema.safeParse(rawPayload);
      if (!parsed.success || !canPublishWorkspaceEvent(socket.data.projectId, parsed.data.projectId)) return;

      socket.data.lastCursorAt = now;
      socket.to(parsed.data.projectId).volatile.emit('cursor-update', {
        socketId: socket.id,
        projectId: parsed.data.projectId,
        assetId: parsed.data.assetId,
        x: parsed.data.x,
        y: parsed.data.y,
      });
    });

    socket.once('disconnect', () => {
      metrics.socketDisconnected();
      joinSequence += 1;
      if (pendingJoinTimer) clearTimeout(pendingJoinTimer);
      const projectId = socket.data.projectId;
      delete socket.data.projectId;
      delete socket.data.projectRole;
      if (!projectId) return;
      socket.to(projectId).emit('cursor-remove', socket.id);
      queueMicrotask(() => { void broadcastPresence(projectId); });
    });
  });

  const leaseRefreshTimer = setInterval(() => {
    for (const socket of io.sockets.sockets.values()) {
      const leaseMember = socket.data.guardLeaseMember;
      const ip = socket.data.guardIp;
      const userId = socket.data.user?.id;
      if (!leaseMember || !ip || !userId) continue;
      void Promise.all([
        renewDistributedLease('connection-ip', ip, leaseMember, env.SOCKET_CONNECTION_LEASE_TTL_MS),
        renewDistributedLease('connection-user', userId, leaseMember, env.SOCKET_CONNECTION_LEASE_TTL_MS),
      ]).then(([ipRenewed, userRenewed]) => {
        if (ipRenewed && userRenewed) return;
        socket.emit('workspace-error', {
          code: 'SOCKET_CONNECTION_LEASE_LOST',
          message: 'The realtime session must reconnect.',
        });
        socket.disconnect(true);
      }).catch((error: unknown) => {
        logger.warn('Socket connection lease refresh failed', { socketId: socket.id, error });
      });
    }
  }, env.SOCKET_CONNECTION_LEASE_REFRESH_MS);
  leaseRefreshTimer.unref();

  let sessionRevalidationInFlight = false;
  const sessionRevalidationTimer = setInterval(() => {
    if (sessionRevalidationInFlight) return;
    const sockets = [...io.sockets.sockets.values()];
    if (sockets.length === 0) return;
    const userIds = [...new Set(sockets.map((socket) => socket.data.user.id))];
    const projectIds = [...new Set(
      sockets
        .map((socket) => socket.data.projectId)
        .filter((projectId): projectId is string => typeof projectId === 'string'),
    )];

    sessionRevalidationInFlight = true;
    void Promise.all([
      prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, status: true, sessionVersion: true },
      }),
      projectIds.length === 0
        ? Promise.resolve([])
        : prisma.project.findMany({
            where: { id: { in: projectIds }, deletionStatus: 'ACTIVE' },
            select: {
              id: true,
              ownerId: true,
              members: {
                where: { userId: { in: userIds } },
                select: { userId: true },
              },
            },
          }),
    ]).then(async ([accounts, projects]) => {
      const byId = new Map(accounts.map((account) => [account.id, account]));
      const permittedWorkspaceUsers = new Set<string>();
      for (const project of projects) {
        permittedWorkspaceUsers.add(`${project.id}:${project.ownerId}`);
        for (const member of project.members) {
          permittedWorkspaceUsers.add(`${project.id}:${member.userId}`);
        }
      }

      for (const socket of sockets) {
        const account = byId.get(socket.data.user.id);
        if (!account || account.status !== 'ACTIVE' || account.sessionVersion !== socket.data.user.sessionVersion) {
          socket.emit('workspace-error', {
            code: 'SESSION_REVOKED',
            message: 'Your session is no longer active.',
          });
          socket.disconnect(true);
          continue;
        }

        const projectId = socket.data.projectId;
        if (projectId && !permittedWorkspaceUsers.has(`${projectId}:${socket.data.user.id}`)) {
          await socket.leave(projectId);
          delete socket.data.projectId;
          delete socket.data.projectRole;
          socket.emit('project-member-removed', { projectId, userId: socket.data.user.id });
          socket.emit('workspace-error', {
            code: 'PROJECT_ACCESS_DENIED',
            message: 'Project access is no longer available.',
          });
          await broadcastPresence(projectId);
        }
      }
    }).catch((error: unknown) => {
      logger.warn('Socket session revalidation failed', { error });
    }).finally(() => {
      sessionRevalidationInFlight = false;
    });
  }, env.SESSION_REVALIDATION_INTERVAL_MS);
  sessionRevalidationTimer.unref();

  const controller: RealtimeController = {
    refreshWorkspace: (projectId, reason) => {
      io.to(projectId).emit('refresh-workspace', { reason });
    },

    deleteProject: async (projectId) => {
      io.to(projectId).emit('project-deleted', { projectId });
      io.in(projectId).disconnectSockets(true);
    },

    removeProjectMember: async (projectId, userId) => {
      const sockets = await io.in(userRoom(userId)).fetchSockets();
      let removedConnection = false;

      for (const socket of sockets) {
        if (socket.data.projectId !== projectId) continue;

        await socket.leave(projectId);
        delete socket.data.projectId;
        delete socket.data.projectRole;
        socket.emit('project-member-removed', { projectId, userId });
        removedConnection = true;
      }

      if (removedConnection) await broadcastPresence(projectId);
    },
  };

  return {
    io,
    controller,
    close: async () => {
      clearInterval(leaseRefreshTimer);
      clearInterval(sessionRevalidationTimer);
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
};
