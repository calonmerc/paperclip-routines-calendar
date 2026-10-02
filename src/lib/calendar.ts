/**
 * Calendar models in the viewer's timezone: month grid, week and day spans,
 * with schedule occurrences bucketed into local days.
 */

import { DEFAULT_LIMITS, expandCron, type ExpandLimits, type InstantRange } from "./occurrences.js";
import type { ScheduleEntry } from "./routines.js";
import { addDays, daysInMonth, offsetAt, startOfZonedDay, weekdayOf, zonedParts } from "./zoned.js";

export interface CalendarDate {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
}

/** 0 = Sunday, 1 = Monday. */
export type WeekStart = 0 | 1;

/** Consecutive local dates and the instants they cover in the display timezone. */
export interface DateSpan {
  dates: CalendarDate[];
  range: InstantRange;
}

export interface MonthGrid extends DateSpan {
  /** The month being shown. */
  year: number;
  month: number;
  /** 42 consecutive dates, starting on `weekStartsOn`. */
  dates: CalendarDate[];
}

/** `agenda` is a day-by-day list of one month, readable at any width. */
export type CalendarView = "month" | "week" | "day" | "agenda";

export const GRID_DAYS = 42;

export function buildMonthGrid(year: number, month: number, displayTimeZone: string, weekStartsOn: WeekStart = 0): MonthGrid {
  const gridStart = startOfWeek({ year, month, day: 1 }, weekStartsOn);
  return { year, month, ...spanFrom(gridStart, GRID_DAYS, displayTimeZone) };
}

function spanFrom(start: CalendarDate, days: number, displayTimeZone: string): DateSpan {
  return {
    dates: Array.from({ length: days }, (_, i) => addDays(start, i)),
    range: {
      startMs: startOfZonedDay(start, displayTimeZone),
      endMs: startOfZonedDay(addDays(start, days), displayTimeZone),
    },
  };
}

/** First day of the week containing `date`. */
export function startOfWeek(date: CalendarDate, weekStartsOn: WeekStart = 0): CalendarDate {
  return addDays(date, -((weekdayOf(date.year, date.month, date.day) - weekStartsOn + 7) % 7));
}

/** The 7 days of the week containing `anchor`. */
export function buildWeekSpan(anchor: CalendarDate, displayTimeZone: string, weekStartsOn: WeekStart = 0): DateSpan {
  return spanFrom(startOfWeek(anchor, weekStartsOn), 7, displayTimeZone);
}

/** Just the days of one month (no leading/trailing grid days). */
export function buildMonthDaysSpan(year: number, month: number, displayTimeZone: string): DateSpan {
  return spanFrom({ year, month, day: 1 }, daysInMonth(year, month), displayTimeZone);
}

export function buildDaySpan(date: CalendarDate, displayTimeZone: string): DateSpan {
  return spanFrom(date, 1, displayTimeZone);
}

/**
 * The date `steps` views away: months for the month and agenda views, weeks
 * for the week view, days for the day view. Month steps keep the day of
 * month, clamped to the target month's length.
 */
export function shiftView(view: CalendarView, date: CalendarDate, steps: number): CalendarDate {
  switch (view) {
    case "month":
    case "agenda": {
      const { year, month } = addMonths(date.year, date.month, steps);
      return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
    }
    case "week":
      return addDays(date, steps * 7);
    case "day":
      return addDays(date, steps);
  }
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
  span: DateSpan,
  displayTimeZone: string,
  options: PlaceOptions = DEFAULT_PLACE_OPTIONS,
): PlacedCalendar {
  const days = new Map<string, DayItem[]>();
  const truncated: ScheduleEntry[] = [];
  const failed: PlacedCalendar["failed"] = [];

  for (const entry of entries) {
    let result;
    try {
      result = expandCron(entry.cronExpression, entry.timeZone, span.range, options.limits);
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

/**
 * `dateKey`s of span days on which the display timezone's UTC offset changes.
 * Times on those days can repeat or be skipped, so the UI labels them with a
 * zone abbreviation.
 */
export function offsetChangeDays(span: DateSpan, displayTimeZone: string): Set<string> {
  const result = new Set<string>();
  let dayStart = startOfZonedDay(span.dates[0]!, displayTimeZone);
  for (const date of span.dates) {
    const nextStart = startOfZonedDay(addDays(date, 1), displayTimeZone);
    if (offsetAt(dayStart, displayTimeZone) !== offsetAt(nextStart - 1, displayTimeZone)) {
      result.add(dateKey(date));
    }
    dayStart = nextStart;
  }
  return result;
}

export function itemInstant(item: DayItem): number {
  return item.kind === "single" ? item.instant : item.firstInstant;
}

/** Calendar date `months` after the given year/month. */
export function addMonths(year: number, month: number, months: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + months;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}
