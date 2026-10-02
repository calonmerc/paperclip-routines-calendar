import { describe, expect, it } from "vitest";
import { parseCron, validateCron } from "../src/lib/cron.js";

describe("parseCron (server dialect)", () => {
  it("expands wildcards, ranges, steps and lists", () => {
    const cron = parseCron("*/15 9-17 1,15 */3 1-5");
    expect(cron.minutes).toEqual([0, 15, 30, 45]);
    expect(cron.hours).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(cron.daysOfMonth).toEqual([1, 15]);
    expect(cron.months).toEqual([1, 4, 7, 10]);
    expect(cron.daysOfWeek).toEqual([1, 2, 3, 4, 5]);
  });

  it("supports N/S (start at N to field max) and N-M/S", () => {
    expect(parseCron("5/20 * * * *").minutes).toEqual([5, 25, 45]);
    expect(parseCron("0 1-10/3 * * *").hours).toEqual([1, 4, 7, 10]);
  });

  it("dedupes and sorts list values", () => {
    expect(parseCron("30,0,30,15 * * * *").minutes).toEqual([0, 15, 30]);
  });

  it("tolerates surrounding and repeated whitespace", () => {
    expect(parseCron("  0   9 * *  1 ").hours).toEqual([9]);
  });

  it.each([
    ["", "must not be empty"],
    ["* * * *", "exactly 5 fields"],
    ["* * * * * *", "exactly 5 fields"],
    ["0 9 * * 7", "out of range"],
    ["0 9 * * MON", 'Invalid value "MON"'],
    ["0 9 * JAN *", 'Invalid value "JAN"'],
    ["0 9 L * *", 'Invalid value "L"'],
    ["0 9 ? * 1", 'Invalid value "?"'],
    ["@daily", "exactly 5 fields"],
    ["60 * * * *", "out of range"],
    ["0 24 * * *", "out of range"],
    ["0 0 0 * *", "out of range"],
    ["0 0 * 13 *", "out of range"],
    ["0 0 5-1 * *", "start > end"],
    ["*/0 * * * *", "Invalid step"],
    ["1,,2 * * * *", "Empty element"],
    ["0 10-5/2 * * *", "Empty result"],
  ])("rejects %j like the server", (expr, message) => {
    expect(validateCron(expr)).toContain(message);
  });

  it("keeps the server's parseInt leniency", () => {
    // The server accepts these, so the calendar must too.
    expect(parseCron("5x 9 * * *").minutes).toEqual([5]);
    expect(parseCron("0 9 1-3x * *").daysOfMonth).toEqual([1, 2, 3]);
  });
});
