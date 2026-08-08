import type {
  ActivityLog,
  PageInfo,
  ProjectComment,
  WorkspaceProject,
} from "@/lib/api/types";

function sortCommentsChronologically(comments: ProjectComment[]): ProjectComment[] {
  return [...comments].sort((left, right) => {
    const dateCompare = left.createdAt.localeCompare(right.createdAt);
    return dateCompare || left.id.localeCompare(right.id);
  });
}

export function upsertWorkspaceComment(
  project: WorkspaceProject,
  assetId: string,
  comment: ProjectComment,
): WorkspaceProject {
  return {
    ...project,
    assets: project.assets.map((asset) => {
      if (asset.id !== assetId) return asset;
      const byId = new Map(asset.comments.map((entry) => [entry.id, entry]));
      byId.set(comment.id, comment);
      return {
        ...asset,
        comments: sortCommentsChronologically(Array.from(byId.values())),
      };
    }),
  };
}

export function removeWorkspaceComment(
  project: WorkspaceProject,
  assetId: string,
  commentId: string,
): WorkspaceProject {
  return {
    ...project,
    assets: project.assets.map((asset) => asset.id === assetId
      ? { ...asset, comments: asset.comments.filter((comment) => comment.id !== commentId) }
      : asset),
  };
}

export function replaceWorkspaceComment(
  project: WorkspaceProject,
  assetId: string,
  temporaryId: string,
  comment: ProjectComment,
): WorkspaceProject {
  return upsertWorkspaceComment(
    removeWorkspaceComment(project, assetId, temporaryId),
    assetId,
    comment,
  );
}

export function setWorkspaceCommentResolved(
  project: WorkspaceProject,
  assetId: string,
  commentId: string,
  isResolved: boolean,
): WorkspaceProject {
  return {
    ...project,
    assets: project.assets.map((asset) => asset.id === assetId
      ? {
          ...asset,
          comments: asset.comments.map((comment) => comment.id === commentId
            ? { ...comment, isResolved }
            : comment),
        }
      : asset),
  };
}

export function prependOlderWorkspaceComments(
  project: WorkspaceProject,
  assetId: string,
  commentsNewestFirst: ProjectComment[],
  pageInfo: PageInfo,
): WorkspaceProject {
  return {
    ...project,
    assets: project.assets.map((asset) => {
      if (asset.id !== assetId) return asset;
      const byId = new Map(asset.comments.map((comment) => [comment.id, comment]));
      for (const comment of commentsNewestFirst) byId.set(comment.id, comment);
      return {
        ...asset,
        comments: sortCommentsChronologically(Array.from(byId.values())),
        commentPageInfo: pageInfo,
      };
    }),
  };
}

export function appendOlderActivity(
  project: WorkspaceProject,
  entriesNewestFirst: ActivityLog[],
  pageInfo: PageInfo,
): WorkspaceProject {
  const byId = new Map(project.activityLogs.map((entry) => [entry.id, entry]));
  for (const entry of entriesNewestFirst) byId.set(entry.id, entry);
  return {
    ...project,
    activityLogs: Array.from(byId.values()).sort((left, right) => (
      right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id)
    )),
    pageInfo: {
      ...project.pageInfo,
      activityLogs: pageInfo,
    },
  };
}
