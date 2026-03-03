const NY_TZ = "America/New_York";

/**
 * Returns the current date in America/New_York timezone as YYYY-MM-DD.
 * This is the source of truth for targetDate/horizon calculations.
 * Handles DST automatically via Intl.DateTimeFormat.
 */
export function currentDateNY(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: NY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Adds N calendar days to a YYYY-MM-DD string.
 * Uses UTC noon to safely add days without DST boundary issues.
 */
export function addDays(ymd: string, n: number): string {
  if (n === 0) return ymd;
  const d = new Date(`${ymd}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Returns targetDate (YYYY-MM-DD) for the given forecast horizon in NY timezone.
 * today = current NY date, tomorrow = +1 day, day2 = +2 days.
 *
 * Fixes UTC-based horizon bug: e.g. at 23:50 NY (UTC already tomorrow),
 * the old UTC-based code returned wrong targetDate.
 */
export function targetDateForHorizon(
  horizon: "today" | "tomorrow" | "day2",
  now = new Date(),
): string {
  const today = currentDateNY(now);
  const offsets: Record<string, number> = { today: 0, tomorrow: 1, day2: 2 };
  return addDays(today, offsets[horizon] ?? 0);
}

/**
 * Parses a YYYY-MM-DD string into a Date at midnight UTC.
 * Used for DB storage (ForecastRun.targetDate).
 */
export function parseDateUTC(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

/**
 * Returns day bounds (start/end) as UTC Dates for a YYYY-MM-DD string.
 * Used for DB queries by date.
 */
export function dayBoundsUTC(ymd: string): { start: Date; end: Date } {
  return {
    start: new Date(`${ymd}T00:00:00.000Z`),
    end: new Date(`${ymd}T23:59:59.999Z`),
  };
}
