export interface FeedbackSubmitShortcutInput {
  key: string;
  isComposing: boolean;
  isPinned: boolean;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

export function shouldSubmitFeedbackOnKeyDown({
  key,
  isComposing,
  shiftKey,
}: FeedbackSubmitShortcutInput): boolean {
  if (key !== "Enter" || isComposing) return false;
  return !shiftKey;
}
