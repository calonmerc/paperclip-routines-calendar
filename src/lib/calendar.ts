/**
 * Month-view model: a 6-week grid in the viewer's timezone, with schedule
 * occurrences bucketed into local days.
 */

import { DEFAULT_LIMITS, expandCron, type ExpandLimits, type InstantRange } from "./occurrences.js";
import type { ScheduleEntry } from "./routines.js";
import { addDays, startOfZonedDay, weekdayOf, zonedParts } from "./zoned.js";

export interface CalendarDate {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
}

/** 0 = Sunday, 1 = Monday. */
export type WeekStart = 0 | 1;

export interface MonthGrid {
  /** The month being shown. */
  year: number;
  month: number;
  /** 42 consecutive dates, starting on `weekStartsOn`. */
  dates: CalendarDate[];
  /** Instants covered by the grid in the display timezone. */
  range: InstantRange;
}

export const GRID_DAYS = 42;

export function buildMonthGrid(year: number, month: number, displayTimeZone: string, weekStartsOn: WeekStart = 0): MonthGrid {
  const firstOfMonth = { year, month, day: 1 };
  const lead = (weekdayOf(year, month, 1) - weekStartsOn + 7) % 7;
  const gridStart = addDays(firstOfMonth, -lead);
  const dates = Array.from({ length: GRID_DAYS }, (_, i) => addDays(gridStart, i));
  return {
    year,
    month,
    dates,
    range: {
      startMs: startOfZonedDay(gridStart, displayTimeZone),
      endMs: startOfZonedDay(addDays(gridStart, GRID_DAYS), displayTimeZone),
    },
  };
}

export function dateKey(date: CalendarDate): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

export function sameDate(a: CalendarDate, b: CalendarDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

export interface Occurrence {
  instant: number;
  entry: ScheduleEntry;
}

/** One line in a day cell. Dense schedules collapse to a single counted item. */
export type DayItem =
  | { kind: "single"; instant: number; entry: ScheduleEntry }
  | { kind: "collapsed"; firstInstant: number; count: number; entry: ScheduleEntry };

export interface PlacedCalendar {
  /** Items per `dateKey`, sorted by time then title. */
  days: Map<string, DayItem[]>;
  /** Triggers that hit the expansion cap; the grid is incomplete for them. */
  truncated: ScheduleEntry[];
  /** Triggers that failed to expand (bad cron/timezone). */
  failed: { entry: ScheduleEntry; message: string }[];
}

export interface PlaceOptions {
  /** More than this many occurrences of one trigger in a day collapse to one item. */
  collapseAbove: number;
  limits: ExpandLimits;
}

export const DEFAULT_PLACE_OPTIONS: PlaceOptions = { collapseAbove: 3, limits: DEFAULT_LIMITS };

export function placeOccurrences(
  entries: readonly ScheduleEntry[],
  grid: MonthGrid,
  displayTimeZone: string,
  options: PlaceOptions = DEFAULT_PLACE_OPTIONS,
): PlacedCalendar {
  const days = new Map<string, DayItem[]>();
  const truncated: ScheduleEntry[] = [];
  const failed: PlacedCalendar["failed"] = [];

  for (const entry of entries) {
    let result;
    try {
      result = expandCron(entry.cronExpression, entry.timeZone, grid.range, options.limits);
    } catch (err) {
      failed.push({ entry, message: err instanceof Error ? err.message : String(err) });
      continue;
    }
    if (result.truncated) truncated.push(entry);

    const perDay = new Map<string, number[]>();
    for (const instant of result.instants) {
      const key = dateKey(zonedParts(instant, displayTimeZone));
      const list = perDay.get(key);
      if (list) list.push(instant);
      else perDay.set(key, [instant]);
    }

    for (const [key, instants] of perDay) {
      const items = days.get(key) ?? [];
      if (instants.length > options.collapseAbove) {
        items.push({ kind: "collapsed", firstInstant: instants[0]!, count: instants.length, entry });
      } else {
        for (const instant of instants) items.push({ kind: "single", instant, entry });
      }
      days.set(key, items);
    }
  }

  for (const items of days.values()) {
    items.sort(
      (a, b) =>
        itemInstant(a) - itemInstant(b) ||
        a.entry.routineTitle.localeCompare(b.entry.routineTitle) ||
        a.entry.triggerId.localeCompare(b.entry.triggerId),
    );
  }

  return { days, truncated, failed };
}

export function itemInstant(item: DayItem): number {
  return item.kind === "single" ? item.instant : item.firstInstant;
}

/** Calendar date `months` after the given year/month. */
export function addMonths(year: number, month: number, months: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + months;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}
