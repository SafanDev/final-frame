export type NotificationDeliveryModeValue = 'IMMEDIATE' | 'DAILY_DIGEST' | 'IN_APP_ONLY';

export interface DigestSchedule {
  batchDate: string;
  nextAttemptAt: Date;
}

interface LocalDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const dateParts = (date: Date, timeZone: string): LocalDateParts => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const values = new Map(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)] as const),
  );

  const requiredPart = (type: keyof LocalDateParts): number => {
    const value = values.get(type);
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw new RangeError(`Unable to resolve ${type} for time zone ${timeZone}.`);
    }
    return value;
  };

  return {
    year: requiredPart('year'),
    month: requiredPart('month'),
    day: requiredPart('day'),
    hour: requiredPart('hour'),
    minute: requiredPart('minute'),
    second: requiredPart('second'),
  };
};

export const isSupportedTimeZone = (timeZone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
};

export const isSupportedLocale = (locale: string): boolean => {
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([locale]).length === 1;
  } catch {
    return false;
  }
};

const addCalendarDay = (year: number, month: number, day: number) => {
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
};

const localDateTimeToUtc = (
  input: { year: number; month: number; day: number; hour: number; minute?: number; second?: number },
  timeZone: string,
): Date => {
  const targetAsUtc = Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    input.hour,
    input.minute ?? 0,
    input.second ?? 0,
  );
  let candidate = targetAsUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = dateParts(new Date(candidate), timeZone);
    const representedAsUtc = Date.UTC(
      parts.year ?? input.year,
      (parts.month ?? input.month) - 1,
      parts.day ?? input.day,
      parts.hour ?? input.hour,
      parts.minute ?? 0,
      parts.second ?? 0,
    );
    const corrected = candidate + (targetAsUtc - representedAsUtc);
    if (corrected === candidate) break;
    candidate = corrected;
  }
  return new Date(candidate);
};

export const getNextDigestSchedule = (
  now: Date,
  timeZone: string,
  deliveryHour = 8,
): DigestSchedule => {
  if (!isSupportedTimeZone(timeZone)) throw new RangeError('Unsupported time zone.');
  if (!Number.isInteger(deliveryHour) || deliveryHour < 0 || deliveryHour > 23) {
    throw new RangeError('Digest delivery hour must be between 0 and 23.');
  }
  const local = dateParts(now, timeZone);
  let target = {
    year: local.year,
    month: local.month,
    day: local.day,
  };
  if ((local.hour ?? 0) >= deliveryHour) target = addCalendarDay(target.year, target.month, target.day);
  const nextAttemptAt = localDateTimeToUtc({ ...target, hour: deliveryHour }, timeZone);
  const batchDate = `${target.year.toString().padStart(4, '0')}-${target.month.toString().padStart(2, '0')}-${target.day.toString().padStart(2, '0')}`;
  return { batchDate, nextAttemptAt };
};

export const mergeNotificationIds = (
  current: readonly string[],
  incoming: readonly string[],
  maximum = 100,
): string[] => Array.from(new Set([...current, ...incoming])).slice(0, maximum);
