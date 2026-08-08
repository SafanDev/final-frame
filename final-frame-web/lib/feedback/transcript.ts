export const feedbackTranscriptMarker = "Transcript:\n";

export interface FeedbackTextParts {
  note: string;
  transcript: string;
}

export function composeFeedbackText(note: string, transcript: string, hasAudio: boolean): string {
  const cleanNote = note.trim();
  const cleanTranscript = transcript.trim();
  if (!hasAudio || !cleanTranscript) return cleanNote;
  return cleanNote
    ? `${cleanNote}\n\n${feedbackTranscriptMarker}${cleanTranscript}`
    : `${feedbackTranscriptMarker}${cleanTranscript}`;
}

export function splitFeedbackText(value: string): FeedbackTextParts {
  const markerIndex = value.indexOf(feedbackTranscriptMarker);
  if (markerIndex < 0) return { note: value.trim(), transcript: "" };
  return {
    note: value.slice(0, markerIndex).trim(),
    transcript: value.slice(markerIndex + feedbackTranscriptMarker.length).trim(),
  };
}

export function updateFeedbackNote(value: string, nextNote: string): string {
  const { transcript } = splitFeedbackText(value);
  return composeFeedbackText(nextNote, transcript, Boolean(transcript));
}
