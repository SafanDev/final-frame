export interface FormattingPreferences {
  locale?: string;
  timeZone?: string;
}

function validDate(value: string | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatShortDate(value: string | Date, preferences: FormattingPreferences = {}): string {
  const date = validDate(value);
  if (!date) return "Unknown date";
  return new Intl.DateTimeFormat(preferences.locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: preferences.timeZone,
  }).format(date);
}

export function formatDateTime(value: string | Date, preferences: FormattingPreferences = {}): string {
  const date = validDate(value);
  if (!date) return "Unknown date";
  return new Intl.DateTimeFormat(preferences.locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: preferences.timeZone,
  }).format(date);
}

export function formatRelativeDate(value: string | Date, preferences: FormattingPreferences = {}): string {
  const date = validDate(value);
  if (!date) return "Unknown date";

  const relativeFormatter = new Intl.RelativeTimeFormat(preferences.locale, { numeric: "auto" });
  const deltaSeconds = Math.round((date.getTime() - Date.now()) / 1_000);
  const absoluteSeconds = Math.abs(deltaSeconds);

  if (absoluteSeconds < 60) return relativeFormatter.format(deltaSeconds, "second");
  const deltaMinutes = Math.round(deltaSeconds / 60);
  if (Math.abs(deltaMinutes) < 60) return relativeFormatter.format(deltaMinutes, "minute");
  const deltaHours = Math.round(deltaMinutes / 60);
  if (Math.abs(deltaHours) < 24) return relativeFormatter.format(deltaHours, "hour");
  const deltaDays = Math.round(deltaHours / 24);
  if (Math.abs(deltaDays) < 30) return relativeFormatter.format(deltaDays, "day");

  return formatShortDate(date, preferences);
}

export function statusLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
