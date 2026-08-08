export interface RealtimeController {
  refreshWorkspace(projectId: string, reason: string): void;
  deleteProject(projectId: string): Promise<void>;
  removeProjectMember(projectId: string, userId: string): Promise<void>;
}
