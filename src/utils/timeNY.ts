const NY_TZ = "America/New_York";

/** Generic TZ helpers **/
export function currentDateInTz(now = new Date(), timezone = NY_TZ): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Returns the current date in America/New_York timezone as YYYY-MM-DD.
 * Backwards-compatible wrapper around currentDateInTz.
 */
export function currentDateNY(now = new Date()): string {
  return currentDateInTz(now, NY_TZ);
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

export type Horizon = "today" | "tomorrow" | "day2";

export function targetDateForHorizonInTz(
  horizon: Horizon,
  now = new Date(),
  timezone = NY_TZ,
): string {
  const today = currentDateInTz(now, timezone);
  const offsets: Record<string, number> = { today: 0, tomorrow: 1, day2: 2 };
  return addDays(today, offsets[horizon] ?? 0);
}

/** NY-specific wrapper kept for backwards compatibility. */
export function targetDateForHorizon(
  horizon: Horizon,
  now = new Date(),
): string {
  return targetDateForHorizonInTz(horizon, now, NY_TZ);
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
