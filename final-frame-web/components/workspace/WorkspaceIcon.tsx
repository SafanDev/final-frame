import type { ReactNode } from "react";

export type WorkspaceIconName =
  | "back"
  | "files"
  | "feedback"
  | "review"
  | "focus"
  | "share"
  | "members"
  | "edit"
  | "archive"
  | "lock"
  | "ready"
  | "approve"
  | "revision"
  | "certificate"
  | "audit"
  | "sparkles"
  | "trash";

export default function WorkspaceIcon({ name }: { name: WorkspaceIconName }) {
  const paths: Record<WorkspaceIconName, ReactNode> = {
    back: <path d="m15 18-6-6 6-6" />,
    files: <><path d="M4 7h16M4 12h16M4 17h10" /></>,
    feedback: <><path d="M4 5h16v12H8l-4 3z" /><path d="M8 9h8M8 13h5" /></>,
    review: <><circle cx="12" cy="12" r="8" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>,
    focus: <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" /></>,
    share: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M5 13v7h14v-7" /></>,
    members: <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0M16 6a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4.6" /></>,
    edit: <><path d="m4 20 4.5-1 9.8-9.8-3.5-3.5L5 15.5z" /><path d="m13.8 6.7 3.5 3.5" /></>,
    archive: <><path d="M4 7h16v13H4zM3 4h18v3H3zM9 11h6" /></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    ready: <><path d="M4 12h13M13 8l4 4-4 4" /><path d="M20 5v14" /></>,
    approve: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16.5 8" /></>,
    revision: <><path d="M4 7h11a5 5 0 0 1 0 10H8" /><path d="m8 13-4 4 4 4" /></>,
    certificate: <><path d="M6 3h12v18H6z" /><path d="M9 8h6M9 12h6" /><path d="m10 17 2-1 2 1v4h-4z" /></>,
    audit: <><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    sparkles: <><path d="m12 3 1.1 3.1L16 7.2l-2.9 1.1L12 11.5l-1.1-3.2L8 7.2l2.9-1.1z" /><path d="m18.2 12.5.7 2 1.9.7-1.9.7-.7 2-.7-2-1.9-.7 1.9-.7zM6 13l.8 2.3L9 16l-2.2.8L6 19l-.8-2.2L3 16l2.2-.7z" /></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" /><path d="M10 11v5M14 11v5" /></>,
  };

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-[1.125rem] w-[1.125rem]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}
