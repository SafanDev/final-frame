const id = (value: string): string => encodeURIComponent(value);

export const apiRoutes = Object.freeze({
  auth: {
    capabilities: "/api/auth/capabilities",
    register: "/api/auth/register",
    login: "/api/auth/login",
    verifyEmail: "/api/auth/verify-email",
    requestEmailVerification: "/api/auth/verify-email/request",
    requestPasswordReset: "/api/auth/password-reset/request",
    confirmPasswordReset: "/api/auth/password-reset/confirm",
  },
  account: {
    profile: "/api/account",
    export: "/api/account/export",
    mfaSetup: "/api/account/mfa/setup",
    mfaEnable: "/api/account/mfa/enable",
    mfaDisable: "/api/account/mfa/disable",
    revokeSessions: "/api/account/sessions/revoke",
    delete: "/api/account",
    preferences: "/api/account/preferences",
  },
  projects: {
    list: "/api/projects",
    create: "/api/projects",
    workspace: (projectId: string) => `/api/projects/workspace/${id(projectId)}`,
    update: (projectId: string) => `/api/projects/${id(projectId)}`,
    delete: (projectId: string) => `/api/projects/${id(projectId)}`,
    activity: (projectId: string) => `/api/projects/${id(projectId)}/activity`,
    auditExport: (projectId: string) => `/api/projects/${id(projectId)}/audit-export`,
    approvalCertificate: (projectId: string, approvalEventId: string) =>
      `/api/projects/${id(projectId)}/approval-events/${id(approvalEventId)}/certificate`,
    review: (projectId: string) => `/api/projects/${id(projectId)}/review`,
    finalAsset: (projectId: string) => `/api/projects/${id(projectId)}/final-asset`,
    invitations: (projectId: string) => `/api/projects/${id(projectId)}/invitations`,
    invitation: (projectId: string, invitationId: string) =>
      `/api/projects/${id(projectId)}/invitations/${id(invitationId)}`,
    joinInvite: "/api/projects/invitations/accept",
    member: (projectId: string, userId: string) =>
      `/api/projects/${id(projectId)}/members/${id(userId)}`,
    memberApprover: (projectId: string, userId: string) =>
      `/api/projects/${id(projectId)}/members/${id(userId)}/approver`,
  },
  assets: {
    list: (projectId: string) => `/api/projects/${id(projectId)}/assets`,
    uploadStart: (projectId: string) => `/api/projects/${id(projectId)}/assets/upload/start`,
    uploadComplete: (projectId: string) => `/api/projects/${id(projectId)}/assets/upload/complete`,
    multipartRefresh: (projectId: string) => `/api/projects/${id(projectId)}/assets/upload/multipart/refresh`,
    multipartAbort: (projectId: string) => `/api/projects/${id(projectId)}/assets/upload/multipart`,
    voiceUpload: (projectId: string) => `/api/projects/${id(projectId)}/assets/upload-audio`,
    update: (projectId: string, assetId: string) =>
      `/api/projects/${id(projectId)}/assets/${id(assetId)}`,
    retryProcessing: (projectId: string, assetId: string) =>
      `/api/projects/${id(projectId)}/assets/${id(assetId)}/retry-processing`,
    delete: (projectId: string, assetId: string) =>
      `/api/projects/${id(projectId)}/assets/${id(assetId)}`,
    preview: (projectId: string, assetId: string) =>
      `/api/projects/${id(projectId)}/assets/${id(assetId)}/preview`,
    download: (projectId: string, assetId: string) =>
      `/api/projects/${id(projectId)}/assets/${id(assetId)}/download`,
    summary: (projectId: string, assetId: string) =>
      `/api/projects/${id(projectId)}/assets/${id(assetId)}/summary`,
  },
  comments: {
    list: (projectId: string, assetId: string) =>
      `/api/projects/${id(projectId)}/assets/${id(assetId)}/comments`,
    create: (projectId: string, assetId: string) =>
      `/api/projects/${id(projectId)}/assets/${id(assetId)}/comments`,
    update: (projectId: string, assetId: string, commentId: string) =>
      `/api/projects/${id(projectId)}/assets/${id(assetId)}/comments/${id(commentId)}`,
    resolve: (projectId: string, assetId: string, commentId: string) =>
      `/api/projects/${id(projectId)}/assets/${id(assetId)}/comments/${id(commentId)}/resolve`,
    delete: (projectId: string, assetId: string, commentId: string) =>
      `/api/projects/${id(projectId)}/assets/${id(assetId)}/comments/${id(commentId)}`,
    audio: (projectId: string, assetId: string, commentId: string) =>
      `/api/projects/${id(projectId)}/assets/${id(assetId)}/comments/${id(commentId)}/audio`,
  },
  notifications: {
    list: "/api/notifications",
    markRead: (notificationId: string) =>
      `/api/notifications/${id(notificationId)}/read`,
    readAll: "/api/notifications/read-all",
  },  media: {
    secureUrl: "/api/secure-url",
    asset: (assetId: string, purpose: 'preview' | 'download') =>
      `/api/media/assets/${id(assetId)}/${purpose}`,
  },
});
