/**
 * High-frequency realtime events may publish only to the exact workspace that
 * the authenticated socket successfully joined. A client-supplied projectId
 * can never switch the authorization scope of an existing connection.
 */
export const canPublishWorkspaceEvent = (
  joinedProjectId: string | undefined,
  requestedProjectId: string,
): boolean => Boolean(joinedProjectId && joinedProjectId === requestedProjectId);
