import { describe, expect, it } from "vitest";
import { DEFAULT_LIMITS, RangeTooLargeError, expandCron } from "../src/lib/occurrences.js";
import { offsetAt } from "../src/lib/zoned.js";
import { oracleInstants } from "./support/server-oracle.js";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();
const range = (start: string, end: string) => ({ startMs: Date.parse(start), endMs: Date.parse(end) });
const expandIso = (expr: string, tz: string, start: string, end: string) =>
  expandCron(expr, tz, range(start, end)).instants.map(iso);

describe("expandCron: explicit cases", () => {
  it("daily at 01:00 Chicago across a month", () => {
    const out = expandIso("0 1 * * *", "America/Chicago", "2026-10-01T00:00:00Z", "2026-11-01T00:00:00Z");
    expect(out).toHaveLength(31);
    expect(out[0]).toBe("2026-10-01T06:00:00.000Z");
    expect(out.at(-1)).toBe("2026-10-31T06:00:00.000Z");
  });

  it("weekdays only", () => {
    // 2026-10-05 is a Monday.
    const out = expandIso("30 8 * * 1-5", "America/New_York", "2026-10-03T00:00:00Z", "2026-10-12T00:00:00Z");
    expect(out).toEqual([
      "2026-10-05T12:30:00.000Z",
      "2026-10-06T12:30:00.000Z",
      "2026-10-07T12:30:00.000Z",
      "2026-10-08T12:30:00.000Z",
      "2026-10-09T12:30:00.000Z",
    ]);
  });

  it("Mon/Wed list", () => {
    const out = expandIso("0 10 * * 1,3", "America/Chicago", "2026-10-05T00:00:00Z", "2026-10-12T00:00:00Z");
    expect(out).toEqual(["2026-10-05T15:00:00.000Z", "2026-10-07T15:00:00.000Z"]);
  });

  it("monthly on the 5th, across the BST → GMT change", () => {
    const out = expandIso("0 9 5 * *", "Europe/London", "2026-10-01T00:00:00Z", "2026-12-01T00:00:00Z");
    expect(out).toEqual(["2026-10-05T08:00:00.000Z", "2026-11-05T09:00:00.000Z"]);
  });

  it("the 31st skips months without one", () => {
    const out = expandIso("0 12 31 * *", "UTC", "2027-01-01T00:00:00Z", "2027-03-01T00:00:00Z");
    expect(out).toEqual(["2027-01-31T12:00:00.000Z"]);
  });

  it("Feb 29 only exists in leap years", () => {
    expect(expandIso("0 0 29 2 *", "UTC", "2027-02-01T00:00:00Z", "2027-03-15T00:00:00Z")).toEqual([]);
    expect(expandIso("0 0 29 2 *", "UTC", "2028-02-01T00:00:00Z", "2028-03-15T00:00:00Z")).toEqual([
      "2028-02-29T00:00:00.000Z",
    ]);
  });

  it("ANDs day-of-month with day-of-week (unlike Vixie cron)", () => {
    // 1st AND Monday: next is 2027-02-01. Vixie cron would also fire every Monday.
    expect(expandIso("0 9 1 * 1", "UTC", "2026-10-01T00:00:00Z", "2026-12-01T00:00:00Z")).toEqual([]);
    expect(expandIso("0 9 1 * 1", "UTC", "2027-01-15T00:00:00Z", "2027-03-15T00:00:00Z")).toEqual([
      "2027-02-01T09:00:00.000Z",
      "2027-03-01T09:00:00.000Z",
    ]);
  });

  it("fires twice for a wall time repeated by fall-back", () => {
    const out = expandIso("30 1 * * *", "America/Chicago", "2026-10-31T00:00:00Z", "2026-11-03T00:00:00Z");
    expect(out).toEqual([
      "2026-10-31T06:30:00.000Z",
      "2026-11-01T06:30:00.000Z",
      "2026-11-01T07:30:00.000Z",
      "2026-11-02T07:30:00.000Z",
    ]);
  });

  it("skips a wall time that spring-forward removes", () => {
    const out = expandIso("30 2 * * *", "America/Chicago", "2027-03-13T00:00:00Z", "2027-03-16T00:00:00Z");
    expect(out).toEqual(["2027-03-13T08:30:00.000Z", "2027-03-15T07:30:00.000Z"]);
  });

  it("uses a half-open range [start, end)", () => {
    const out = expandIso("0 9 * * *", "UTC", "2026-10-01T09:00:00Z", "2026-10-03T09:00:00Z");
    expect(out).toEqual(["2026-10-01T09:00:00.000Z", "2026-10-02T09:00:00.000Z"]);
  });

  it("finds occurrences whose local date lies outside the UTC range dates", () => {
    // 23:30 in Kiritimati (UTC+14) is 09:30 UTC the same day; 00:30 in
    // Pago Pago (UTC-11) is 11:30 UTC.
    expect(expandIso("30 23 * * *", "Pacific/Kiritimati", "2026-10-02T00:00:00Z", "2026-10-03T00:00:00Z")).toEqual([
      "2026-10-02T09:30:00.000Z",
    ]);
    expect(expandIso("30 0 * * *", "Pacific/Pago_Pago", "2026-10-02T00:00:00Z", "2026-10-03T00:00:00Z")).toEqual([
      "2026-10-02T11:30:00.000Z",
    ]);
  });

  it("returns nothing for an empty range", () => {
    expect(expandIso("* * * * *", "UTC", "2026-10-02T00:00:00Z", "2026-10-02T00:00:00Z")).toEqual([]);
  });
});

describe("expandCron: limits and errors", () => {
  it("rejects ranges over the limit", () => {
    expect(() => expandCron("0 9 * * *", "UTC", range("2026-01-01T00:00:00Z", "2026-04-01T00:00:00Z"))).toThrow(
      RangeTooLargeError,
    );
  });

  it("accepts a range exactly at the limit", () => {
    const startMs = Date.parse("2026-10-01T00:00:00Z");
    const out = expandCron("0 9 * * *", "UTC", { startMs, endMs: startMs + DEFAULT_LIMITS.maxRangeDays * DAY });
    expect(out.instants).toHaveLength(DEFAULT_LIMITS.maxRangeDays);
  });

  it("truncates dense schedules at maxPerTrigger and says so", () => {
    const out = expandCron("* * * * *", "UTC", range("2026-10-01T00:00:00Z", "2026-10-02T00:00:00Z"), {
      ...DEFAULT_LIMITS,
      maxPerTrigger: 100,
    });
    expect(out.truncated).toBe(true);
    expect(out.instants).toHaveLength(100);
    expect(iso(out.instants[0]!)).toBe("2026-10-01T00:00:00.000Z");
  });

  it("does not flag truncation when exactly at the cap", () => {
    const out = expandCron("0 * * * *", "UTC", range("2026-10-01T00:00:00Z", "2026-10-02T00:00:00Z"), {
      ...DEFAULT_LIMITS,
      maxPerTrigger: 24,
    });
    expect(out).toMatchObject({ truncated: false });
    expect(out.instants).toHaveLength(24);
  });

  it("expands every-5-minutes across a 6-week grid without truncation", () => {
    const startMs = Date.parse("2026-09-27T05:00:00Z");
    const out = expandCron("*/5 * * * *", "America/Chicago", { startMs, endMs: startMs + 42 * DAY });
    expect(out.truncated).toBe(false);
    expect(out.instants).toHaveLength(42 * 288);
  });

  it("throws on invalid timezone and invalid cron", () => {
    const r = range("2026-10-01T00:00:00Z", "2026-10-02T00:00:00Z");
    expect(() => expandCron("0 9 * * *", "Mars/Olympus_Mons", r)).toThrow(/Invalid timezone/);
    expect(() => expandCron("0 9 * * 7", "UTC", r)).toThrow(/out of range/);
  });
});

// ---------------------------------------------------------------------------
// Oracle comparison: the fast expander must agree exactly with the server's
// minute-walking scheduler, especially around DST transitions.
// ---------------------------------------------------------------------------

const ORACLE_ZONES = [
  "UTC",
  "America/Chicago",
  "America/New_York",
  "America/St_Johns", // -03:30 / -02:30
  "America/Santiago", // transitions at local midnight
  "Europe/London",
  "Europe/Berlin",
  "Australia/Lord_Howe", // 30-minute DST
  "Pacific/Chatham", // +12:45 / +13:45
  "Asia/Kolkata", // +05:30, no DST
  "Asia/Kathmandu", // +05:45
  "Africa/Casablanca", // Ramadan offset changes
];

const ORACLE_EXPRESSIONS = [
  "0 0 * * *",
  "30 0 * * *",
  "0 1 * * *",
  "30 1 * * *",
  "0 2 * * *",
  "30 2 * * *",
  "45 2 * * *",
  "0 3 * * *",
  "*/15 0-4 * * *",
  "0 */4 * * *",
  "59 23 * * *",
  "0 9 * * 1-5",
  "0 2 * * 0",
  "0,30 1-3 * * 0,6",
];

/** Offset transitions in `[from, to)`, found by hourly sampling then bisection. */
function findTransitions(timeZone: string, from: number, to: number): number[] {
  const found: number[] = [];
  let prev = offsetAt(from, timeZone);
  for (let t = from + HOUR; t < to; t += HOUR) {
    const cur = offsetAt(t, timeZone);
    if (cur !== prev) {
      let lo = t - HOUR;
      let hi = t;
      while (hi - lo > 60_000) {
        const mid = Math.floor((lo + hi) / 2 / 60_000) * 60_000;
        if (offsetAt(mid, timeZone) === prev) lo = mid;
        else hi = mid;
      }
      found.push(hi);
      prev = cur;
    }
  }
  return found;
}

const SCAN_FROM = Date.parse("2026-09-01T00:00:00Z");
const SCAN_TO = Date.parse("2027-09-01T00:00:00Z");

describe("expandCron agrees with the server scheduler", () => {
  for (const tz of ORACLE_ZONES) {
    const transitions = findTransitions(tz, SCAN_FROM, SCAN_TO);
    // Zones without DST get an ordinary window so they're still covered.
    const windows = transitions.length > 0 ? transitions : [Date.parse("2026-10-15T00:00:00Z")];

    describe(tz, () => {
      for (const center of windows) {
        const r = { startMs: center - 1.5 * DAY, endMs: center + 1.5 * DAY };
        it(`around ${iso(center)}`, () => {
          for (const expr of ORACLE_EXPRESSIONS) {
            const expected = oracleInstants(expr, tz, r.startMs, r.endMs).map(iso);
            const actual = expandCron(expr, tz, r).instants.map(iso);
            expect(actual, `${expr} @ ${tz}`).toEqual(expected);
          }
        });
      }
    });
  }

  it("agrees over a full 6-week grid for sparse schedules", () => {
    const r = range("2026-09-27T00:00:00Z", "2026-11-08T00:00:00Z");
    for (const [expr, tz] of [
      ["0 9 5 * *", "Europe/London"],
      ["0 9 1 * 1", "UTC"],
      ["0 10 * * 1,3", "America/Chicago"],
      ["30 1 * * *", "America/Chicago"],
      ["0 9 31 * *", "Asia/Kolkata"],
    ] as const) {
      expect(expandCron(expr, tz, r).instants.map(iso), `${expr} @ ${tz}`).toEqual(
        oracleInstants(expr, tz, r.startMs, r.endMs).map(iso),
      );
    }
  });
});
