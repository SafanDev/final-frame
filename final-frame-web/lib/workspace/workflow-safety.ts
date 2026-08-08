export interface WorkspaceWorkflowBlocker {
  id: string;
  message: string;
}

type Listener = () => void;

const blockers = new Map<string, string>();
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function setWorkspaceWorkflowBlocker(id: string, message: string | null): void {
  const previous = blockers.get(id);
  if (message) {
    if (previous === message) return;
    blockers.set(id, message);
  } else if (!blockers.delete(id)) {
    return;
  }
  emit();
}

export function getWorkspaceWorkflowBlockers(): WorkspaceWorkflowBlocker[] {
  return [...blockers.entries()].map(([id, message]) => ({ id, message }));
}

export function subscribeWorkspaceWorkflowSafety(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
