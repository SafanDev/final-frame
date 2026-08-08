import type { Request } from 'express';
import type { RealtimeController } from '../realtime/types.js';
import { logger } from '../utils/logger.js';

interface RoomEmitter {
    emit(event: string, ...arguments_: unknown[]): unknown;
}

interface RealtimeServer {
    to(room: string): RoomEmitter;
}

const getController = (request: Request): RealtimeController | null => {
    const candidate: unknown = request.app.get('realtimeController');
    if (!candidate || typeof candidate !== 'object') return null;

    const possible = candidate as Partial<RealtimeController>;
    return typeof possible.refreshWorkspace === 'function' &&
        typeof possible.deleteProject === 'function' &&
        typeof possible.removeProjectMember === 'function'
        ? candidate as RealtimeController
        : null;
};

const getRealtimeServer = (request: Request): RealtimeServer | null => {
    const candidate: unknown = request.app.get('io');
    if (!candidate || typeof candidate !== 'object' || !('to' in candidate)) return null;

    const to = (candidate as { to?: unknown }).to;
    return typeof to === 'function' ? candidate as RealtimeServer : null;
};

export const emitWorkspaceRefresh = (
    request: Request,
    projectId: string,
    reason: string,
): void => {
    try {
        const controller = getController(request);
        if (controller) controller.refreshWorkspace(projectId, reason);
        else getRealtimeServer(request)?.to(projectId).emit('refresh-workspace', { reason });
    } catch (error) {
        logger.warn('Workspace refresh event could not be emitted', {
            projectId,
            reason,
            error,
        });
    }
};

export const emitProjectDeleted = async (
    request: Request,
    projectId: string,
): Promise<void> => {
    try {
        const controller = getController(request);
        if (controller) await controller.deleteProject(projectId);
        else getRealtimeServer(request)?.to(projectId).emit('project-deleted', { projectId });
    } catch (error) {
        logger.warn('Project deletion event could not be emitted', { projectId, error });
    }
};

export const emitMemberRemoved = async (
    request: Request,
    projectId: string,
    userId: string,
): Promise<void> => {
    try {
        const controller = getController(request);
        if (controller) await controller.removeProjectMember(projectId, userId);
        else {
            const room = getRealtimeServer(request)?.to(projectId);
            room?.emit('project-member-removed', { projectId, userId });
            room?.emit('refresh-workspace', { reason: 'member-removed' });
        }
    } catch (error) {
        logger.warn('Member removal event could not be emitted', {
            projectId,
            userId,
            error,
        });
    }
};
