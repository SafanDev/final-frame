import type { Metadata } from "next";
import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";

export const metadata: Metadata = {
  title: "Project workspace",
  robots: { index: false, follow: false, nocache: true },
};

export default async function ProjectWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  return (
    <WorkspaceProvider projectId={projectId}>
      <WorkspaceShell />
    </WorkspaceProvider>
  );
}
