import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { PluginPageProps } from "@paperclipai/plugin-sdk/ui";
import {
  DEFAULT_PLACE_OPTIONS,
  buildDaySpan,
  buildMonthGrid,
  buildWeekSpan,
  offsetChangeDays,
  placeOccurrences,
  shiftView,
  type CalendarDate,
  type CalendarView,
  type DateSpan,
  type MonthGrid,
  type WeekStart,
} from "../lib/calendar.js";
import { assignAgentColors, colorForAgent } from "../lib/colors.js";
import { extractSchedules } from "../lib/routines.js";
import { TIME_GRID_PLACE_OPTIONS } from "../lib/timegrid.js";
import { localTimeZone, zonedParts } from "../lib/zoned.js";
import { useRoutineData } from "./api.js";
import { Agenda, ChipStyles, Legend, Notice, describeEntry, type ChipContext } from "./components.js";
import { MonthView } from "./MonthView.js";
import { TimeGridView } from "./TimeGridView.js";
import { buttonStyle, t } from "./theme.js";

const WEEK_STARTS_ON: WeekStart = 0;
/** Below this page width the grid is unreadable, so show an agenda list. */
const AGENDA_BELOW_PX = 640;
const VIEW_STORAGE_KEY = "paperclip-routines-calendar:view";
const VIEWS: { view: CalendarView; label: string }[] = [
  { view: "month", label: "Month" },
  { view: "week", label: "Week" },
  { view: "day", label: "Day" },
];

function useIsNarrow(ref: RefObject<HTMLElement | null>, threshold: number): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setNarrow(entry.contentRect.width < threshold);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, threshold]);
  return narrow;
}

function loadView(): CalendarView {
  try {
    const stored = localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === "month" || stored === "week" || stored === "day") return stored;
  } catch {
    // storage unavailable
  }
  return "month";
}

function saveView(view: CalendarView) {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    // storage unavailable
  }
}

function buildSpan(view: CalendarView, cursor: CalendarDate, timeZone: string): DateSpan | MonthGrid {
  switch (view) {
    case "month":
      return buildMonthGrid(cursor.year, cursor.month, timeZone, WEEK_STARTS_ON);
    case "week":
      return buildWeekSpan(cursor, timeZone, WEEK_STARTS_ON);
    case "day":
      return buildDaySpan(cursor, timeZone);
  }
}

const utcOf = (date: CalendarDate) => Date.UTC(date.year, date.month - 1, date.day);

function viewTitle(view: CalendarView, cursor: CalendarDate, span: DateSpan): string {
  switch (view) {
    case "month":
      return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(utcOf(cursor));
    case "week":
      return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).formatRange(
        utcOf(span.dates[0]!),
        utcOf(span.dates[span.dates.length - 1]!),
      );
    case "day":
      return new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(utcOf(cursor));
  }
}

export function RoutineCalendarPage({ context }: PluginPageProps) {
  const displayTimeZone = useMemo(() => localTimeZone(), []);
  const today = useMemo((): CalendarDate => {
    const { year, month, day } = zonedParts(Date.now(), displayTimeZone);
    return { year, month, day };
  }, [displayTimeZone]);
  const [view, setViewState] = useState<CalendarView>(loadView);
  const [cursor, setCursor] = useState<CalendarDate>(today);
  const { data, loading, error, reload } = useRoutineData(context.companyId);
  const rootRef = useRef<HTMLDivElement>(null);
  const narrow = useIsNarrow(rootRef, AGENDA_BELOW_PX);

  const setView = (next: CalendarView) => {
    setViewState(next);
    saveView(next);
  };
  const openDay = (date: CalendarDate) => {
    setCursor(date);
    setView("day");
  };

  const schedules = useMemo(() => (data ? extractSchedules(data.routines) : null), [data]);
  const colors = useMemo(() => assignAgentColors(data?.agents ?? []), [data]);
  const agentNames = useMemo(() => new Map((data?.agents ?? []).map((a) => [a.id, a.name])), [data]);
  const span = useMemo(() => buildSpan(view, cursor, displayTimeZone), [view, cursor, displayTimeZone]);
  // Lists (month grid, narrow agendas) collapse dense schedules sooner than the time grid.
  const timeGrid = view === "day" || (view === "week" && !narrow);
  const placed = useMemo(
    () =>
      schedules
        ? placeOccurrences(schedules.entries, span, displayTimeZone, timeGrid ? TIME_GRID_PLACE_OPTIONS : DEFAULT_PLACE_OPTIONS)
        : null,
    [schedules, span, timeGrid, displayTimeZone],
  );
  const changeDays = useMemo(() => offsetChangeDays(span, displayTimeZone), [span, displayTimeZone]);

  const ctx = useMemo((): ChipContext => {
    const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: displayTimeZone });
    // On DST-change days the same clock time can occur twice, so add the zone.
    const zonedTimeFormat = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
      timeZone: displayTimeZone,
    });
    return {
      colorFor: (agentId) => colorForAgent(colors, agentId),
      agentName: (agentId) => (agentId ? agentNames.get(agentId) ?? "Unknown agent" : "Unassigned"),
      timeFormatFor: (dayKey) => (changeDays.has(dayKey) ? zonedTimeFormat : timeFormat),
    };
  }, [colors, agentNames, changeDays, displayTimeZone]);

  const weekdayNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" });
    // 2023-01-01 was a Sunday.
    return Array.from({ length: 7 }, (_, i) => fmt.format(Date.UTC(2023, 0, 1 + ((i + WEEK_STARTS_ON) % 7))));
  }, []);

  if (!context.companyId) {
    return <div style={{ padding: 24, color: t.muted }}>Select a company to see its routine calendar.</div>;
  }

  const title = viewTitle(view, cursor, span);
  const unit = view === "month" ? "month" : view === "week" ? "week" : "day";
  const usedAgents = (data?.agents ?? []).filter((agent) => schedules?.entries.some((entry) => entry.agentId === agent.id));
  const hasUnassigned = schedules?.entries.some((entry) => entry.agentId === null) ?? false;

  let body;
  if (timeGrid) {
    body = (
      <TimeGridView
        dates={span.dates}
        days={placed?.days}
        today={today}
        displayTimeZone={displayTimeZone}
        ctx={ctx}
        detailed={view === "day"}
        onOpenDay={view === "week" ? openDay : undefined}
      />
    );
  } else if (narrow) {
    body = (
      <Agenda
        dates={view === "month" ? span.dates.filter((date) => date.month === cursor.month) : span.dates}
        days={placed?.days}
        today={today}
        ctx={ctx}
        emptyText={`Nothing scheduled this ${unit}.`}
      />
    );
  } else {
    const grid = span as MonthGrid;
    body = (
      <MonthView
        key={`${grid.year}-${grid.month}`}
        grid={grid}
        days={placed?.days}
        today={today}
        title={title}
        weekdayNames={weekdayNames}
        ctx={ctx}
        onOpenDay={openDay}
      />
    );
  }

  return (
    <div ref={rootRef} style={{ padding: 16, color: t.fg, fontSize: 14, display: "grid", gap: 12 }}>
      <ChipStyles />
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, marginRight: "auto" }}>Routine calendar</h1>
        <div role="group" aria-label="View" style={{ display: "inline-flex" }}>
          {VIEWS.map(({ view: option, label }, i) => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              onClick={() => setView(option)}
              style={{
                ...buttonStyle,
                borderRadius: 0,
                marginLeft: i === 0 ? 0 : -1,
                borderTopLeftRadius: i === 0 ? t.radius : 0,
                borderBottomLeftRadius: i === 0 ? t.radius : 0,
                borderTopRightRadius: i === VIEWS.length - 1 ? t.radius : 0,
                borderBottomRightRadius: i === VIEWS.length - 1 ? t.radius : 0,
                background: view === option ? t.accent : "transparent",
                fontWeight: view === option ? 600 : 400,
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" style={buttonStyle} onClick={() => setCursor((c) => shiftView(view, c, -1))} aria-label={`Previous ${unit}`}>
          ‹
        </button>
        <button type="button" style={buttonStyle} onClick={() => setCursor(today)}>
          Today
        </button>
        <button type="button" style={buttonStyle} onClick={() => setCursor((c) => shiftView(view, c, 1))} aria-label={`Next ${unit}`}>
          ›
        </button>
        <strong style={{ minWidth: 150, textAlign: "center", fontSize: 16 }}>{title}</strong>
        <button type="button" style={buttonStyle} onClick={reload} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </header>

      <div style={{ color: t.muted, fontSize: 12 }}>
        Times shown in {displayTimeZone}. Each routine runs on its own schedule timezone.
      </div>

      {error && (
        <div role="alert" style={{ color: t.destructive, border: `1px solid ${t.border}`, borderRadius: t.radius, padding: 12 }}>
          Couldn't load routines: {error.message}
        </div>
      )}

      <Legend agents={usedAgents} colorFor={ctx.colorFor} showUnassigned={hasUnassigned} />

      {body}

      {placed && placed.truncated.length > 0 && (
        <Notice title="Some schedules are too frequent to show in full">
          {placed.truncated.map((e) => describeEntry(e)).join(", ")}
        </Notice>
      )}
      {((schedules?.problems.length ?? 0) > 0 || (placed?.failed.length ?? 0) > 0) && (
        <Notice title="Schedules that couldn't be placed">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {schedules?.problems.map((p) => (
              <li key={p.triggerId}>
                {p.routineTitle}: {p.message}
              </li>
            ))}
            {placed?.failed.map((f) => (
              <li key={f.entry.triggerId}>
                {describeEntry(f.entry)}: {f.message}
              </li>
            ))}
          </ul>
        </Notice>
      )}
      {schedules && schedules.unscheduled.length > 0 && (
        <Notice title={`${schedules.unscheduled.length} routine${schedules.unscheduled.length === 1 ? "" : "s"} without a schedule`}>
          <span style={{ color: t.muted }}>Triggered by webhook, API or manually, so not shown on the calendar: </span>
          {schedules.unscheduled.map((r) => r.title).join(", ")}
        </Notice>
      )}
      {data && schedules && schedules.entries.length === 0 && !error && (
        <div style={{ color: t.muted }}>This company has no scheduled routines yet.</div>
      )}
    </div>
  );
}
