/**
 * Project cron schedules onto concrete instants within a bounded range.
 *
 * Semantics match Paperclip's scheduler (`nextCronTickInTimeZone`), which
 * fires at every UTC minute whose wall-clock fields in the trigger's timezone
 * match the cron. Consequences:
 *
 * - day-of-month AND day-of-week must both match (see ./cron.ts)
 * - a wall time inside a spring-forward gap never fires (that day is skipped)
 * - a wall time repeated by a fall-back overlap fires twice, an hour apart
 *
 * Instead of walking every minute like the server, this walks local days and
 * resolves each matching wall time to its instants, so the cost scales with
 * the number of occurrences rather than the number of minutes.
 */

import { parseCron, type ParsedCron } from "./cron.js";
import {
  DAY_MS,
  addDays,
  isValidTimeZone,
  offsetAt,
  wallTimeToInstants,
  weekdayOf,
  zonedParts,
} from "./zoned.js";

/** Half-open range of instants: `[startMs, endMs)`. */
export interface InstantRange {
  startMs: number;
  endMs: number;
}

export interface ExpandLimits {
  /** Ranges longer than this are rejected outright. */
  maxRangeDays: number;
  /** Stop expanding one trigger after this many occurrences. */
  maxPerTrigger: number;
}

export const DEFAULT_LIMITS: ExpandLimits = {
  // A 6-week month grid is 42 days; leave headroom for padding.
  maxRangeDays: 62,
  // Covers a */5 schedule across a 6-week grid (12,096); every-minute
  // schedules are truncated and flagged.
  maxPerTrigger: 15_000,
};

export interface ExpandResult {
  /** Ascending instants within the range. */
  instants: number[];
  /** True when `maxPerTrigger` cut the expansion short. */
  truncated: boolean;
}

const HOUR_MS = 3_600_000;

export class RangeTooLargeError extends RangeError {
  constructor(days: number, maxDays: number) {
    super(`Requested range of ${days.toFixed(1)} days exceeds the ${maxDays}-day limit`);
    this.name = "RangeTooLargeError";
  }
}

function assertRange(range: InstantRange, limits: ExpandLimits): void {
  if (!Number.isFinite(range.startMs) || !Number.isFinite(range.endMs) || range.endMs < range.startMs) {
    throw new RangeError("Invalid range");
  }
  const days = (range.endMs - range.startMs) / DAY_MS;
  if (days > limits.maxRangeDays) {
    throw new RangeTooLargeError(days, limits.maxRangeDays);
  }
}

/**
 * Every instant in `range` at which a schedule with `cron` in `timeZone`
 * would fire. Throws on an invalid timezone or an oversized range.
 */
export function expandParsedCron(
  cron: ParsedCron,
  timeZone: string,
  range: InstantRange,
  limits: ExpandLimits = DEFAULT_LIMITS,
): ExpandResult {
  assertRange(range, limits);
  if (!isValidTimeZone(timeZone)) {
    throw new RangeError(`Invalid timezone: ${timeZone}`);
  }

  const instants: number[] = [];
  if (range.endMs === range.startMs) return { instants, truncated: false };

  const months = new Set(cron.months);
  const daysOfMonth = new Set(cron.daysOfMonth);
  const daysOfWeek = new Set(cron.daysOfWeek);

  // Local dates from the range start's date to the range end's date. One day
  // of slack on each side is defensive: it only matters if a zone ever falls
  // back across midnight, which no current zone does.
  const first = zonedParts(range.startMs, timeZone);
  const last = zonedParts(range.endMs, timeZone);
  let date = addDays(first, -1);
  const stopAt = Date.UTC(last.year, last.month - 1, last.day + 1);

  while (Date.UTC(date.year, date.month - 1, date.day) <= stopAt) {
    if (
      months.has(date.month) &&
      daysOfMonth.has(date.day) &&
      daysOfWeek.has(weekdayOf(date.year, date.month, date.day))
    ) {
      const noon = Date.UTC(date.year, date.month - 1, date.day, 12, 0);
      const before = offsetAt(noon - 36 * HOUR_MS, timeZone);
      const stable = before === offsetAt(noon, timeZone) && before === offsetAt(noon + 36 * HOUR_MS, timeZone);

      for (const hour of cron.hours) {
        for (const minute of cron.minutes) {
          const wall = { ...date, hour, minute };
          const resolved = stable
            ? [Date.UTC(date.year, date.month - 1, date.day, hour, minute) - before]
            : wallTimeToInstants(wall, timeZone);
          for (const instant of resolved) {
            if (instant < range.startMs || instant >= range.endMs) continue;
            if (instants.length >= limits.maxPerTrigger) {
              return { instants: instants.sort((a, b) => a - b), truncated: true };
            }
            instants.push(instant);
          }
        }
      }
    }
    date = addDays(date, 1);
  }

  return { instants: instants.sort((a, b) => a - b), truncated: false };
}

/** Like {@link expandParsedCron} but parses `expression` first. */
export function expandCron(
  expression: string,
  timeZone: string,
  range: InstantRange,
  limits: ExpandLimits = DEFAULT_LIMITS,
): ExpandResult {
  return expandParsedCron(parseCron(expression), timeZone, range, limits);
}
