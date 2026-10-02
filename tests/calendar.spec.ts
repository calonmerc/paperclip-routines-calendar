import { describe, expect, it } from "vitest";
import { addMonths, buildMonthGrid, dateKey, placeOccurrences } from "../src/lib/calendar.js";
import { AGENT_PALETTE, UNASSIGNED_COLOR, assignAgentColors, colorForAgent } from "../src/lib/colors.js";
import { extractSchedules, runStateOf, type AgentDto, type RoutineListItemDto } from "../src/lib/routines.js";
import agents from "./fixtures/seed-agents.json" with { type: "json" };
import routines from "./fixtures/seed-routines.json" with { type: "json" };

// Captured from a dev instance seeded by scripts/seed-dev.mjs (Paperclip 2026.1001.0).
const seedRoutines = routines as RoutineListItemDto[];
const seedAgents = agents as AgentDto[];

const iso = (ms: number) => new Date(ms).toISOString();
const byTitle = (title: string) => seedRoutines.find((r) => r.title === title)!;

describe("runStateOf", () => {
  it("only active routines with enabled triggers will run", () => {
    expect(runStateOf({ status: "active" }, { enabled: true })).toBe("active");
    expect(runStateOf({ status: "active" }, { enabled: false })).toBe("trigger-disabled");
    expect(runStateOf({ status: "paused" }, { enabled: true })).toBe("routine-paused");
    expect(runStateOf({ status: "archived" }, { enabled: false })).toBe("routine-archived");
  });
});

describe("extractSchedules (seed data)", () => {
  const { entries, unscheduled, problems } = extractSchedules(seedRoutines);

  it("emits one entry per schedule trigger", () => {
    // 10 scheduled routines, one of which has two schedule triggers.
    expect(entries).toHaveLength(11);
    expect(entries.filter((e) => e.routineTitle === "Release notes (two schedules)")).toHaveLength(2);
  });

  it("lists webhook-only routines as unscheduled", () => {
    expect(unscheduled.map((r) => r.title)).toEqual(["Inbound webhook triage (no schedule, unassigned)"]);
    expect(problems).toEqual([]);
  });

  it("marks disabled triggers and paused routines as not running", () => {
    const state = (title: string) => entries.find((e) => e.routineTitle === title)!.runState;
    expect(state("Sunday archive sweep (trigger disabled)")).toBe("trigger-disabled");
    expect(state("Health check every 4h (routine paused)")).toBe("routine-paused");
    expect(state("Daily research brief")).toBe("active");
  });

  it("reports schedule triggers it can't place", () => {
    const broken: RoutineListItemDto = {
      ...byTitle("Daily research brief"),
      triggers: [{ ...byTitle("Daily research brief").triggers[0]!, timezone: null }],
    };
    expect(extractSchedules([broken]).problems[0]?.message).toMatch(/no timezone/);
  });
});

describe("agent colours", () => {
  it("assigns palette slots by agent name, independent of input order", () => {
    const colors = assignAgentColors(seedAgents);
    const reversed = assignAgentColors([...seedAgents].reverse());
    expect([...colors.entries()].sort()).toEqual([...reversed.entries()].sort());
    // Alphabetical: Ops, Planner, Researcher, Writer.
    const ops = seedAgents.find((a) => a.name === "Ops")!;
    expect(colors.get(ops.id)).toBe(AGENT_PALETTE[0]);
  });

  it("uses grey for unassigned or unknown agents", () => {
    expect(colorForAgent(new Map(), null)).toBe(UNASSIGNED_COLOR);
    expect(colorForAgent(new Map(), "missing")).toBe(UNASSIGNED_COLOR);
  });
});

describe("buildMonthGrid", () => {
  it("covers 6 weeks starting on Sunday", () => {
    const grid = buildMonthGrid(2026, 10, "America/Chicago");
    expect(grid.dates).toHaveLength(42);
    expect(dateKey(grid.dates[0]!)).toBe("2026-09-27");
    expect(dateKey(grid.dates[41]!)).toBe("2026-11-07");
    expect(iso(grid.range.startMs)).toBe("2026-09-27T05:00:00.000Z");
    // Ends at local midnight after the fall-back change (CST, UTC-6).
    expect(iso(grid.range.endMs)).toBe("2026-11-08T06:00:00.000Z");
  });

  it("can start weeks on Monday", () => {
    const grid = buildMonthGrid(2026, 11, "UTC", 1);
    expect(dateKey(grid.dates[0]!)).toBe("2026-10-26");
  });

  it("starts on the 1st when the month starts on the week start", () => {
    // 2026-11-01 is a Sunday.
    expect(dateKey(buildMonthGrid(2026, 11, "UTC").dates[0]!)).toBe("2026-11-01");
  });

  it("addMonths wraps years", () => {
    expect(addMonths(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths(2027, 1, -1)).toEqual({ year: 2026, month: 12 });
    expect(addMonths(2026, 10, -22)).toEqual({ year: 2024, month: 12 });
  });
});

describe("placeOccurrences (seed data, October 2026, viewed from Chicago)", () => {
  const tz = "America/Chicago";
  const grid = buildMonthGrid(2026, 10, tz);
  const { entries } = extractSchedules(seedRoutines);
  const placed = placeOccurrences(entries, grid, tz);
  const titlesOn = (key: string) =>
    (placed.days.get(key) ?? []).map((i) => (i.kind === "single" ? i.entry.routineTitle : `${i.entry.routineTitle} ×${i.count}`));

  it("puts the 5th-of-month routine on Oct 5 and Nov 5 (London 09:00 = Chicago 03:00)", () => {
    expect(titlesOn("2026-10-05")).toContain("Monthly metrics report");
    expect(titlesOn("2026-11-05")).toContain("Monthly metrics report");
    expect(titlesOn("2026-10-06")).not.toContain("Monthly metrics report");
  });

  it("collapses dense schedules into one counted item per day", () => {
    expect(titlesOn("2026-10-14")).toContain("Health check every 4h (routine paused) ×6");
  });

  it("shows the 01:30 backup twice on fall-back day", () => {
    const backups = (placed.days.get("2026-11-01") ?? []).filter(
      (i) => i.entry.routineTitle === "Nightly backup 01:30 (DST edge)",
    );
    expect(backups).toHaveLength(2);
  });

  it("orders items within a day by time", () => {
    const items = placed.days.get("2026-10-05")!;
    const times = items.map((i) => (i.kind === "single" ? i.instant : i.firstInstant));
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("reports expansion failures instead of throwing", () => {
    const bad = { ...entries[0]!, timeZone: "Nowhere/Land" };
    const result = placeOccurrences([bad], grid, tz);
    expect(result.failed).toHaveLength(1);
    expect(result.days.size).toBe(0);
  });

  it("buckets by the viewer's timezone, not the routine's", () => {
    // Daily 01:00 Chicago = 06:00 UTC: same date in UTC, but 15:00 in Tokyo.
    const daily = entries.filter((e) => e.routineTitle === "Daily research brief");
    const tokyoGrid = buildMonthGrid(2026, 10, "Asia/Tokyo");
    const tokyo = placeOccurrences(daily, tokyoGrid, "Asia/Tokyo");
    const first = tokyo.days.get("2026-10-01")![0]!;
    expect(first.kind === "single" && iso(first.instant)).toBe("2026-10-01T06:00:00.000Z");
  });
});
