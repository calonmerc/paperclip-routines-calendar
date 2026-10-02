/**
 * Minimal, dependency-free IANA timezone helpers built on `Intl`.
 *
 * Instants are epoch milliseconds (UTC). "Wall time" is the calendar date and
 * clock time someone in a given timezone would read. Minute precision only,
 * which is all cron needs.
 */

export interface WallTime {
  year: number;
  /** 1-12 */
  month: number;
  /** 1-31 */
  day: number;
  /** 0-23 */
  hour: number;
  /** 0-59 */
  minute: number;
}

export interface ZonedParts extends WallTime {
  /** 0-6, Sunday = 0 */
  weekday: number;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    // hourCycle h23 so midnight is "00". Older engines render `hour12: false`
    // midnight as "24".
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/** True when `timeZone` is an IANA zone this runtime understands. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    getFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** Weekday (0 = Sunday) of a calendar date, independent of any timezone. */
export function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Days in a month of the proleptic Gregorian calendar. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Calendar-date arithmetic: the date `days` after the given date. */
export function addDays(date: { year: number; month: number; day: number }, days: number) {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Wall-clock parts of `instant` in `timeZone`. */
export function zonedParts(instant: number, timeZone: string): ZonedParts {
  const parts = getFormatter(timeZone).formatToParts(new Date(instant));
  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  for (const part of parts) {
    switch (part.type) {
      case "year":
        year = Number(part.value);
        break;
      case "month":
        month = Number(part.value);
        break;
      case "day":
        day = Number(part.value);
        break;
      case "hour":
        hour = Number(part.value) % 24;
        break;
      case "minute":
        minute = Number(part.value);
        break;
    }
  }
  return { year, month, day, hour, minute, weekday: weekdayOf(year, month, day) };
}

function wallAsUtc(wall: WallTime): number {
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
}

/** UTC offset (ms, east positive) in effect at `instant`, minute precision. */
export function offsetAt(instant: number, timeZone: string): number {
  const floored = Math.floor(instant / MINUTE_MS) * MINUTE_MS;
  return wallAsUtc(zonedParts(floored, timeZone)) - floored;
}

function sameWall(a: WallTime, b: WallTime): boolean {
  return (
    a.year === b.year && a.month === b.month && a.day === b.day && a.hour === b.hour && a.minute === b.minute
  );
}

/**
 * Every instant at which clocks in `timeZone` read `wall`, ascending.
 *
 * - normally one instant
 * - none if `wall` falls in a spring-forward gap
 * - two if `wall` is repeated by a fall-back overlap
 *
 * Assumes at most one offset transition within ±36h of `wall`, which holds
 * for every real-world zone.
 */
export function wallTimeToInstants(wall: WallTime, timeZone: string): number[] {
  const naive = wallAsUtc(wall);
  const offsets = new Set([
    offsetAt(naive - 36 * HOUR_MS, timeZone),
    offsetAt(naive, timeZone),
    offsetAt(naive + 36 * HOUR_MS, timeZone),
  ]);
  const result: number[] = [];
  for (const offset of offsets) {
    const candidate = naive - offset;
    if (!result.includes(candidate) && sameWall(zonedParts(candidate, timeZone), wall)) {
      result.push(candidate);
    }
  }
  return result.sort((a, b) => a - b);
}

/**
 * The first instant of a local calendar day. Usually 00:00. When midnight
 * falls in a DST gap (e.g. America/Santiago), it's the instant the gap ends.
 */
export function startOfZonedDay(date: { year: number; month: number; day: number }, timeZone: string): number {
  const midnight = { ...date, hour: 0, minute: 0 };
  const exact = wallTimeToInstants(midnight, timeZone);
  if (exact.length > 0) return exact[0]!;
  // In a gap, the pre-transition offset maps the missing wall time onto the
  // instant where clocks jump forward.
  const naive = wallAsUtc(midnight);
  return naive - offsetAt(naive - 36 * HOUR_MS, timeZone);
}

/** The browser's or runtime's own IANA timezone. */
export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
