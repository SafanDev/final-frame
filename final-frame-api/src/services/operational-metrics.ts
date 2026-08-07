import { prisma } from '../config/prisma.js';
import { renderOperationalMetricSnapshot, type OperationalStatusCount } from './operational-metrics-core.js';

const statusCounts = <T extends { status: string; _count: { _all: number } }>(rows: readonly T[]): OperationalStatusCount[] => (
  rows.map((row) => ({ status: row.status, count: row._count._all }))
);

export const collectOperationalMetrics = async (): Promise<string> => {
  const [storageDeletionTasks, projectDeletions, emailOutbox] = await Promise.all([
    prisma.storageDeletionTask.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.project.groupBy({ by: ['deletionStatus'], _count: { _all: true } }),
    prisma.emailOutbox.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  return renderOperationalMetricSnapshot({
    storageDeletionTasks: statusCounts(storageDeletionTasks),
    projectDeletions: projectDeletions.map((row) => ({ status: row.deletionStatus, count: row._count._all })),
    emailOutbox: statusCounts(emailOutbox),
  });
};
