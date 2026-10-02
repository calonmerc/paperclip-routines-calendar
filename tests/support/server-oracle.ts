/**
 * Test oracle: Paperclip's scheduler algorithm, ported near-verbatim from
 * `server/src/services/routines.ts` (`nextCronTickInTimeZone` and helpers,
 * Paperclip 2026.1001.0). It walks forward one UTC minute at a time and
 * matches wall-clock fields in the trigger's timezone.
 *
 * Deliberately slow and simple. Used only to check that the fast expander in
 * src/lib/occurrences.ts produces exactly the same instants. Only change it to
 * track upstream.
 *
 * Differences from upstream: the cron is parsed once instead of per minute,
 * and `limit` is a parameter (upstream: 366 * 24 * 60 * 5). Neither changes
 * results.
 */

import { parseCron, type ParsedCron } from "../../src/lib/cron.js";

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getZonedMinuteFormatter(timeZone: string) {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      weekday: "short",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

function getZonedMinuteParts(date: Date, timeZone: string) {
  const parts = getZonedMinuteFormatter(timeZone).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekday = WEEKDAY_INDEX[map.weekday ?? ""];
  if (weekday == null) throw new Error(`Unable to resolve weekday for timezone ${timeZone}`);
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    weekday,
  };
}

function matchesCronMinute(cron: ParsedCron, timeZone: string, date: Date) {
  const parts = getZonedMinuteParts(date, timeZone);
  return (
    cron.minutes.includes(parts.minute) &&
    cron.hours.includes(parts.hour) &&
    cron.daysOfMonth.includes(parts.day) &&
    cron.months.includes(parts.month) &&
    cron.daysOfWeek.includes(parts.weekday)
  );
}

function floorToMinute(date: Date) {
  const copy = new Date(date.getTime());
  copy.setUTCSeconds(0, 0);
  return copy;
}

export function nextCronTickInTimeZone(
  cron: ParsedCron,
  timeZone: string,
  after: Date,
  limit = 366 * 24 * 60 * 5,
): Date | null {
  const cursor = floorToMinute(after);
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  for (let i = 0; i < limit; i += 1) {
    if (matchesCronMinute(cron, timeZone, cursor)) return new Date(cursor.getTime());
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  return null;
}

/** All instants in `[startMs, endMs)` the server would fire at, by repeated next-tick. */
export function oracleInstants(expression: string, timeZone: string, startMs: number, endMs: number): number[] {
  const cron = parseCron(expression);
  const out: number[] = [];
  let cursor = new Date(startMs - 60_000);
  for (;;) {
    const remainingMinutes = Math.ceil((endMs - cursor.getTime()) / 60_000) + 1;
    const next = nextCronTickInTimeZone(cron, timeZone, cursor, remainingMinutes);
    if (!next || next.getTime() >= endMs) return out;
    out.push(next.getTime());
    cursor = next;
  }
}
