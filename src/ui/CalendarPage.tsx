import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import type { PluginPageProps } from "@paperclipai/plugin-sdk/ui";
import {
  addMonths,
  buildMonthGrid,
  dateKey,
  offsetChangeDays,
  placeOccurrences,
  sameDate,
  type CalendarDate,
  type DayItem,
  type WeekStart,
} from "../lib/calendar.js";
import { UNASSIGNED_COLOR, assignAgentColors, colorForAgent } from "../lib/colors.js";
import { RUN_STATE_LABELS, extractSchedules, type AgentDto, type ScheduleEntry } from "../lib/routines.js";
import { localTimeZone, zonedParts } from "../lib/zoned.js";
import { useRoutineData } from "./api.js";
import { buttonStyle, chipStyle, t } from "./theme.js";

const MAX_ITEMS_PER_CELL = 5;
const WEEK_STARTS_ON: WeekStart = 0;
/** Below this page width the grid is unreadable, so show an agenda list. */
const AGENDA_BELOW_PX = 640;

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

export function RoutineCalendarPage({ context }: PluginPageProps) {
  const displayTimeZone = useMemo(() => localTimeZone(), []);
  const today = useMemo(() => zonedParts(Date.now(), displayTimeZone), [displayTimeZone]);
  const [cursor, setCursor] = useState({ year: today.year, month: today.month });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const { data, loading, error, reload } = useRoutineData(context.companyId);
  const rootRef = useRef<HTMLDivElement>(null);
  const narrow = useIsNarrow(rootRef, AGENDA_BELOW_PX);

  const schedules = useMemo(() => (data ? extractSchedules(data.routines) : null), [data]);
  const colors = useMemo(() => assignAgentColors(data?.agents ?? []), [data]);
  const agentNames = useMemo(() => new Map((data?.agents ?? []).map((a) => [a.id, a.name])), [data]);
  const grid = useMemo(
    () => buildMonthGrid(cursor.year, cursor.month, displayTimeZone, WEEK_STARTS_ON),
    [cursor, displayTimeZone],
  );
  const placed = useMemo(
    () => (schedules ? placeOccurrences(schedules.entries, grid, displayTimeZone) : null),
    [schedules, grid, displayTimeZone],
  );

  const changeDays = useMemo(() => offsetChangeDays(grid, displayTimeZone), [grid, displayTimeZone]);

  const timeFormat = useMemo(
    () => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: displayTimeZone }),
    [displayTimeZone],
  );
  // On DST-change days the same clock time can occur twice, so add the zone.
  const zonedTimeFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
        timeZone: displayTimeZone,
      }),
    [displayTimeZone],
  );
  const monthTitle = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    Date.UTC(cursor.year, cursor.month - 1, 1),
  );
  const weekdayNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" });
    // 2023-01-01 was a Sunday.
    return Array.from({ length: 7 }, (_, i) => fmt.format(Date.UTC(2023, 0, 1 + ((i + WEEK_STARTS_ON) % 7))));
  }, []);

  if (!context.companyId) {
    return <div style={{ padding: 24, color: t.muted }}>Select a company to see its routine calendar.</div>;
  }

  const shift = (months: number) => {
    setCursor((c) => addMonths(c.year, c.month, months));
    setExpanded(new Set());
  };

  const usedAgents = (data?.agents ?? []).filter((agent) =>
    schedules?.entries.some((entry) => entry.agentId === agent.id),
  );
  const hasUnassigned = schedules?.entries.some((entry) => entry.agentId === null) ?? false;

  return (
    <div ref={rootRef} style={{ padding: 16, color: t.fg, fontSize: 14, display: "grid", gap: 12 }}>
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, marginRight: "auto" }}>Routine calendar</h1>
        <button type="button" style={buttonStyle} onClick={() => shift(-1)} aria-label="Previous month">
          ‹
        </button>
        <button
          type="button"
          style={buttonStyle}
          onClick={() => {
            setCursor({ year: today.year, month: today.month });
            setExpanded(new Set());
          }}
        >
          Today
        </button>
        <button type="button" style={buttonStyle} onClick={() => shift(1)} aria-label="Next month">
          ›
        </button>
        <strong style={{ minWidth: 150, textAlign: "center", fontSize: 16 }}>{monthTitle}</strong>
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

      <Legend agents={usedAgents} colors={colors} showUnassigned={hasUnassigned} />

      {narrow ? (
        <Agenda
          dates={grid.dates.filter((date) => date.month === cursor.month)}
          days={placed?.days}
          today={today}
          renderChip={(item, key) => (
            <Chip
              key={`${item.entry.triggerId}-${item.kind === "single" ? item.instant : "dense"}`}
              item={item}
              color={colorForAgent(colors, item.entry.agentId)}
              agentName={item.entry.agentId ? agentNames.get(item.entry.agentId) ?? "Unknown agent" : "Unassigned"}
              timeFormat={changeDays.has(key) ? zonedTimeFormat : timeFormat}
            />
          )}
        />
      ) : (
      <div role="grid" aria-label={`Routines for ${monthTitle}`} style={{ border: `1px solid ${t.border}`, borderRadius: t.radius, overflow: "hidden" }}>
        <div role="row" style={rowStyle}>
          {weekdayNames.map((name) => (
            <div key={name} role="columnheader" style={{ padding: "6px 8px", fontSize: 12, color: t.muted, background: t.mutedBg }}>
              {name}
            </div>
          ))}
        </div>
        {Array.from({ length: 6 }, (_, week) => (
          <div key={week} role="row" style={rowStyle}>
            {grid.dates.slice(week * 7, week * 7 + 7).map((date) => {
              const key = dateKey(date);
              const items = placed?.days.get(key) ?? [];
              const isExpanded = expanded.has(key);
              const visible = isExpanded ? items : items.slice(0, MAX_ITEMS_PER_CELL);
              const hidden = items.length - visible.length;
              const inMonth = date.month === cursor.month;
              const isToday = sameDate(date, today);
              return (
                <div
                  key={key}
                  role="gridcell"
                  aria-label={`${key}: ${items.length} scheduled`}
                  style={{
                    minHeight: 112,
                    minWidth: 0,
                    padding: 4,
                    borderTop: `1px solid ${t.border}`,
                    borderLeft: `1px solid ${t.border}`,
                    background: inMonth ? t.card : t.mutedBg,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  <div
                    style={{
                      alignSelf: "flex-start",
                      fontSize: 12,
                      fontWeight: isToday ? 700 : 500,
                      color: inMonth ? t.fg : t.muted,
                      padding: "0 4px",
                      borderRadius: 999,
                      outline: isToday ? `1.5px solid ${t.primary}` : undefined,
                    }}
                  >
                    {date.day}
                  </div>
                  {visible.map((item) => (
                    <Chip
                      key={`${item.entry.triggerId}-${item.kind === "single" ? item.instant : "dense"}`}
                      item={item}
                      color={colorForAgent(colors, item.entry.agentId)}
                      agentName={item.entry.agentId ? agentNames.get(item.entry.agentId) ?? "Unknown agent" : "Unassigned"}
                      timeFormat={changeDays.has(key) ? zonedTimeFormat : timeFormat}
                    />
                  ))}
                  {(hidden > 0 || isExpanded) && items.length > MAX_ITEMS_PER_CELL && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        })
                      }
                      style={{ ...linkButtonStyle, alignSelf: "flex-start" }}
                    >
                      {isExpanded ? "Show less" : `+${hidden} more`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      )}

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

const rowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
  marginLeft: -1,
};

const linkButtonStyle: CSSProperties = {
  font: "inherit",
  fontSize: 11,
  padding: "0 4px",
  color: t.muted,
  background: "none",
  border: "none",
  cursor: "pointer",
  textDecoration: "underline",
};

function describeEntry(entry: ScheduleEntry): string {
  return entry.triggerLabel ? `${entry.routineTitle} (${entry.triggerLabel})` : entry.routineTitle;
}

function Chip({
  item,
  color,
  agentName,
  timeFormat,
}: {
  item: DayItem;
  color: string;
  agentName: string;
  timeFormat: Intl.DateTimeFormat;
}) {
  const { entry } = item;
  const time = timeFormat.format(item.kind === "single" ? item.instant : item.firstInstant);
  const tooltip = [
    describeEntry(entry),
    `${entry.cronExpression} (${entry.timeZone})`,
    agentName,
    RUN_STATE_LABELS[entry.runState],
    item.kind === "collapsed" ? `${item.count} runs this day, first at ${time}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div style={chipStyle(color, entry.runState)} title={tooltip}>
      <span style={{ color: t.muted, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
        {item.kind === "collapsed" ? `${item.count}×` : time}
      </span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {entry.routineTitle}
      </span>
    </div>
  );
}

function Legend({
  agents,
  colors,
  showUnassigned,
}: {
  agents: AgentDto[];
  colors: ReadonlyMap<string, string>;
  showUnassigned: boolean;
}) {
  const swatch = (color: string, label: string, runState: "active" | "routine-paused" = "active") => (
    <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          ...chipStyle(color, runState),
          width: 14,
          height: 12,
          padding: 0,
          borderLeftWidth: 14,
        }}
        aria-hidden
      />
      {label}
    </span>
  );
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: 12, color: t.muted }}>
      {[...agents]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((agent) => swatch(colorForAgent(colors, agent.id), agent.name))}
      {showUnassigned && swatch(UNASSIGNED_COLOR, "Unassigned")}
      {swatch(UNASSIGNED_COLOR, "Won't run (paused or disabled)", "routine-paused")}
    </div>
  );
}

function Agenda({
  dates,
  days,
  today,
  renderChip,
}: {
  dates: CalendarDate[];
  days: ReadonlyMap<string, DayItem[]> | undefined;
  today: CalendarDate;
  renderChip: (item: DayItem, dayKey: string) => ReactNode;
}) {
  const heading = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const withItems = dates.filter((date) => (days?.get(dateKey(date))?.length ?? 0) > 0);
  if (withItems.length === 0) return <div style={{ color: t.muted }}>Nothing scheduled this month.</div>;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {withItems.map((date) => {
        const key = dateKey(date);
        return (
          <section key={key} aria-label={key} style={{ display: "grid", gap: 3 }}>
            <h2 style={{ fontSize: 13, fontWeight: sameDate(date, today) ? 700 : 600, margin: 0 }}>
              {heading.format(Date.UTC(date.year, date.month - 1, date.day))}
              {sameDate(date, today) && <span style={{ color: t.muted, fontWeight: 400 }}> · Today</span>}
            </h2>
            {days!.get(key)!.map((item) => renderChip(item, key))}
          </section>
        );
      })}
    </div>
  );
}

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ border: `1px solid ${t.border}`, borderRadius: t.radius, padding: 12, fontSize: 13 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
      {children}
    </section>
  );
}
