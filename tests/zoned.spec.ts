import { describe, expect, it } from "vitest";
import { startOfZonedDay, wallTimeToInstants, zonedParts } from "../src/lib/zoned.js";

const iso = (ms: number) => new Date(ms).toISOString();
const wall = (year: number, month: number, day: number, hour: number, minute: number) => ({
  year,
  month,
  day,
  hour,
  minute,
});

describe("zonedParts", () => {
  it("reads midnight as hour 0 with the local weekday", () => {
    // 2026-10-02 00:00 CDT is a Friday.
    expect(zonedParts(Date.parse("2026-10-02T05:00:00Z"), "America/Chicago")).toEqual({
      year: 2026,
      month: 10,
      day: 2,
      hour: 0,
      minute: 0,
      weekday: 5,
    });
  });
});

describe("wallTimeToInstants", () => {
  it("maps an ordinary wall time to one instant", () => {
    expect(wallTimeToInstants(wall(2026, 10, 2, 9, 0), "America/Chicago").map(iso)).toEqual([
      "2026-10-02T14:00:00.000Z",
    ]);
  });

  it("returns both instants for a fall-back overlap", () => {
    expect(wallTimeToInstants(wall(2026, 11, 1, 1, 30), "America/Chicago").map(iso)).toEqual([
      "2026-11-01T06:30:00.000Z",
      "2026-11-01T07:30:00.000Z",
    ]);
  });

  it("returns nothing for a spring-forward gap", () => {
    expect(wallTimeToInstants(wall(2027, 3, 14, 2, 30), "America/Chicago")).toEqual([]);
  });

  it("handles 30-minute DST shifts (Lord Howe)", () => {
    // DST starts 2026-10-04 at 02:00 → 02:30; 02:15 doesn't exist.
    expect(wallTimeToInstants(wall(2026, 10, 4, 2, 15), "Australia/Lord_Howe")).toEqual([]);
    expect(wallTimeToInstants(wall(2026, 10, 4, 2, 30), "Australia/Lord_Howe")).toHaveLength(1);
  });

  it("handles quarter-hour offsets (Chatham, Kathmandu)", () => {
    expect(wallTimeToInstants(wall(2026, 10, 2, 9, 0), "Asia/Kathmandu").map(iso)).toEqual([
      "2026-10-02T03:15:00.000Z",
    ]);
    expect(wallTimeToInstants(wall(2026, 7, 1, 12, 0), "Pacific/Chatham").map(iso)).toEqual([
      "2026-06-30T23:15:00.000Z",
    ]);
  });
});

describe("startOfZonedDay", () => {
  it("is local midnight on ordinary days", () => {
    expect(iso(startOfZonedDay({ year: 2026, month: 10, day: 2 }, "Europe/London"))).toBe(
      "2026-10-01T23:00:00.000Z",
    );
  });

  it("is the end of the gap when midnight doesn't exist (Santiago spring-forward)", () => {
    // Chile moves clocks from 00:00 to 01:00 on 2026-09-06.
    const start = startOfZonedDay({ year: 2026, month: 9, day: 6 }, "America/Santiago");
    expect(zonedParts(start, "America/Santiago")).toMatchObject({ day: 6, hour: 1, minute: 0 });
    expect(zonedParts(start - 60_000, "America/Santiago")).toMatchObject({ day: 5, hour: 23, minute: 59 });
  });
});
