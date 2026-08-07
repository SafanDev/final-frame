import { prisma } from '../config/prisma.js';
import { ActivityAction } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';

interface ActivityClient {
    activityLog: Pick<typeof prisma.activityLog, 'create'>;
}

export interface RecordActivityInput {
    projectId: string;
    userId?: string | null;
    action: ActivityAction;
    message: string;
    metadata?: Prisma.InputJsonObject;
}

/**
 * Writes a consistent, structured audit record. Pass a Prisma transaction
 * client when the activity must commit atomically with a business mutation.
 */
export const recordActivity = async (
    input: RecordActivityInput,
    client: ActivityClient = prisma,
): Promise<void> => {
    const details: Prisma.InputJsonObject = {
        ...(input.metadata ?? {}),
        message: input.message,
    };

    await client.activityLog.create({
        data: {
            projectId: input.projectId,
            action: input.action,
            details,
            ...(input.userId !== undefined ? { userId: input.userId } : {}),
        },
        select: { id: true },
    });
};
