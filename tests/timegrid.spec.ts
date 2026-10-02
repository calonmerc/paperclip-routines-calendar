import { describe, expect, it } from "vitest";
import {
  buildDaySpan,
  buildMonthDaysSpan,
  buildWeekSpan,
  dateKey,
  offsetChangeDays,
  placeOccurrences,
  shiftView,
  type DayItem,
} from "../src/lib/calendar.js";
import { extractSchedules, type RoutineListItemDto } from "../src/lib/routines.js";
import { layoutDay, timeGridPlaceOptions } from "../src/lib/timegrid.js";
import { DEFAULT_SETTINGS } from "../src/lib/settings.js";
import routines from "./fixtures/seed-routines.json" with { type: "json" };

// Captured from a dev instance seeded by scripts/seed-dev.mjs (Paperclip 2026.1001.0).
const { entries } = extractSchedules(routines as RoutineListItemDto[]);
const tz = "America/Chicago";
const iso = (ms: number) => new Date(ms).toISOString();
const d = (year: number, month: number, day: number) => ({ year, month, day });

describe("buildWeekSpan / buildDaySpan", () => {
  it("covers the Sunday-start week containing the anchor", () => {
    // 2026-10-02 is a Friday.
    const week = buildWeekSpan(d(2026, 10, 2), tz);
    expect(week.dates.map(dateKey)).toEqual([
      "2026-09-27",
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ]);
    expect(iso(week.range.startMs)).toBe("2026-09-27T05:00:00.000Z");
    expect(iso(week.range.endMs)).toBe("2026-10-04T05:00:00.000Z");
  });

  it("can start weeks on Monday", () => {
    expect(dateKey(buildWeekSpan(d(2026, 10, 4), tz, 1).dates[0]!)).toBe("2026-09-28");
  });

  it("spans 169 hours across the fall-back change", () => {
    const week = buildWeekSpan(d(2026, 11, 3), tz);
    expect(week.range.endMs - week.range.startMs).toBe(169 * 3_600_000);
    expect([...offsetChangeDays(week, tz)]).toEqual(["2026-11-01"]);
  });

  it("spans 23 hours on spring-forward day", () => {
    const day = buildDaySpan(d(2026, 3, 8), tz);
    expect(day.dates.map(dateKey)).toEqual(["2026-03-08"]);
    expect(day.range.endMs - day.range.startMs).toBe(23 * 3_600_000);
  });
});

describe("buildMonthDaysSpan", () => {
  it("covers exactly the month's days", () => {
    const span = buildMonthDaysSpan(2026, 2, tz);
    expect(span.dates.map(dateKey)).toHaveLength(28);
    expect(dateKey(span.dates[0]!)).toBe("2026-02-01");
    expect(iso(span.range.startMs)).toBe("2026-02-01T06:00:00.000Z");
    expect(iso(span.range.endMs)).toBe("2026-03-01T06:00:00.000Z");
  });
});

describe("shiftView", () => {
  it("steps by month, week or day", () => {
    expect(shiftView("month", d(2026, 12, 15), 1)).toEqual(d(2027, 1, 15));
    expect(shiftView("week", d(2026, 12, 29), 1)).toEqual(d(2027, 1, 5));
    expect(shiftView("day", d(2027, 1, 1), -1)).toEqual(d(2026, 12, 31));
  });

  it("steps the agenda by month", () => {
    expect(shiftView("agenda", d(2026, 10, 31), 1)).toEqual(d(2026, 11, 30));
  });

  it("clamps the day when the target month is shorter", () => {
    expect(shiftView("month", d(2026, 1, 31), 1)).toEqual(d(2026, 2, 28));
    expect(shiftView("month", d(2026, 3, 31), -13)).toEqual(d(2025, 2, 28));
  });
});

describe("layoutDay (seed data, viewed from Chicago)", () => {
  const dayItems = (date: { year: number; month: number; day: number }) => {
    const span = buildDaySpan(date, tz);
    return placeOccurrences(entries, span, tz, timeGridPlaceOptions(DEFAULT_SETTINGS.timeGridCollapseAbove)).days.get(dateKey(date)) ?? [];
  };
  const titled = (title: string) => (b: { item: DayItem }) => b.item.entry.routineTitle === title;

  it("places blocks at their wall-clock minute", () => {
    const { timed } = layoutDay(dayItems(d(2026, 10, 14)), tz);
    expect(timed.find(titled("Daily research brief"))?.startMinute).toBe(60);
    expect(timed.find(titled("Nightly backup 01:30 (DST edge)"))?.startMinute).toBe(90);
    // New York 08:30 is Chicago 07:30.
    expect(timed.find(titled("Standup prep (weekdays)"))?.startMinute).toBe(450);
  });

  it("shows hourly-or-sparser schedules as blocks, and denser ones in the strip", () => {
    const items = dayItems(d(2026, 10, 14));
    expect(layoutDay(items, tz).timed.filter(titled("Health check every 4h (routine paused)"))).toHaveLength(6);

    const span = buildDaySpan(d(2026, 10, 14), tz);
    const tight = placeOccurrences(entries, span, tz, timeGridPlaceOptions(3)).days.get("2026-10-14")!;
    const { dense } = layoutDay(tight, tz);
    expect(dense.map((i) => `${i.entry.routineTitle} ×${i.count}`)).toEqual(["Health check every 4h (routine paused) ×6"]);
  });

  it("puts both fall-back runs on the same row, side by side", () => {
    const { timed } = layoutDay(dayItems(d(2026, 11, 1)), tz);
    const backups = timed.filter(titled("Nightly backup 01:30 (DST edge)"));
    expect(backups.map((b) => b.startMinute)).toEqual([90, 90]);
    expect(new Set(backups.map((b) => b.lane)).size).toBe(2);
    expect(backups[0]!.item.instant).toBeLessThan(backups[1]!.item.instant);
    // The daily brief also fires twice at 01:00; those and the backups form one 2-lane cluster.
    const at1am = timed.filter((b) => b.startMinute === 60);
    expect(at1am.map((b) => b.item.entry.routineTitle)).toEqual(["Daily research brief", "Daily research brief"]);
    expect([...at1am, ...backups].every((b) => b.laneCount === 2)).toBe(true);
  });

  it("leaves the spring-forward gap empty", () => {
    const { timed } = layoutDay(dayItems(d(2026, 3, 8)), tz);
    expect(timed.filter(titled("Spring-forward gap 02:30 (DST edge)"))).toEqual([]);
    expect(timed.some((b) => b.startMinute >= 120 && b.startMinute < 180)).toBe(false);
  });

  it("gives non-overlapping blocks a full-width lane", () => {
    const { timed } = layoutDay(dayItems(d(2026, 10, 14)), tz);
    const standup = timed.find(titled("Standup prep (weekdays)"))!;
    expect(standup).toMatchObject({ lane: 0, laneCount: 1 });
  });

  it("packs overlapping blocks into the first free lane", () => {
    const entry = entries[0]!;
    const at = (h: number, m: number) => ({ kind: "single" as const, instant: Date.UTC(2026, 9, 14, h + 5, m), entry });
    // 10:00, 10:10, 10:20 overlap pairwise as a chain; 10:30 reuses lane 0.
    const { timed } = layoutDay([at(10, 0), at(10, 10), at(10, 20), at(10, 30), at(12, 0)], tz);
    expect(timed.map((b) => [b.lane, b.laneCount])).toEqual([
      [0, 3],
      [1, 3],
      [2, 3],
      [0, 3],
      [0, 1],
    ]);
  });
});
