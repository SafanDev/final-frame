"use client";

// ============================================================================
// WORKSPACE SHELL
// ============================================================================
// This component replaces the old 1,400-line monolith. It synchronously
// unpacks the URL parameter to eliminate rendering delays, initializes the 
// WorkspaceProvider (the central brain) and stacks the isolated UI components.
// ============================================================================

import { use } from "react";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";

import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import AssetSidebar from "@/components/workspace/AssetSidebar";
import CanvasArea from "@/components/workspace/CanvasArea";
import FeedbackSidebar from "@/components/workspace/FeedbackSidebar";

export default function ProjectWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  // Synchronously resolve the URL promise to eliminate the mounting waterfall delay
  const { id: projectId } = use(params);

  return (
    <WorkspaceProvider projectId={projectId}>
      <div className="fixed inset-0 z-50 flex flex-col bg-[#050505] text-white overflow-hidden touch-none">
        
        {/* The Top Navigation & Tool Bar */}
        <WorkspaceHeader />

        {/* The Main Three-Column Layout */}
        <main className="flex-1 flex min-h-0 relative">
          <AssetSidebar />
          <CanvasArea />
          <FeedbackSidebar />
        </main>
        
      </div>
    </WorkspaceProvider>
  );
}