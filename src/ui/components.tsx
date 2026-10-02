import type { CSSProperties, ReactNode } from "react";
import { useHostNavigation } from "@paperclipai/plugin-sdk/ui";
import { routinePath } from "../constants.js";
import { UNASSIGNED_COLOR } from "../lib/colors.js";
import { dateKey, sameDate, type CalendarDate, type DayItem } from "../lib/calendar.js";
import { RUN_STATE_LABELS, type EntryFilter, type RunState, type ScheduleEntry } from "../lib/routines.js";
import { chipStyle, t } from "./theme.js";

/** What every view needs to render a chip. */
export interface ChipContext {
  colorFor(agentId: string | null): string;
  agentName(agentId: string | null): string;
  /** Zone-labelled on days when the display timezone's offset changes. */
  timeFormatFor(dayKey: string): Intl.DateTimeFormat;
}

export const linkButtonStyle: CSSProperties = {
  font: "inherit",
  fontSize: 11,
  padding: "0 4px",
  color: t.muted,
  background: "none",
  border: "none",
  cursor: "pointer",
  textDecoration: "underline",
};

export function describeEntry(entry: ScheduleEntry): string {
  return entry.triggerLabel ? `${entry.routineTitle} (${entry.triggerLabel})` : entry.routineTitle;
}

export function itemKey(item: DayItem): string {
  return `${item.entry.triggerId}-${item.kind === "single" ? item.instant : "dense"}`;
}

export function Chip({
  item,
  dayKey,
  ctx,
  showTime = true,
  detailed = false,
  style,
}: {
  item: DayItem;
  dayKey: string;
  ctx: ChipContext;
  /** The time grid's position already says when; narrow lanes drop the label. */
  showTime?: boolean;
  /** Day view: room for the agent and schedule after the title. */
  detailed?: boolean;
  style?: CSSProperties;
}) {
  const nav = useHostNavigation();
  const { entry } = item;
  const agentName = ctx.agentName(entry.agentId);
  const time = ctx.timeFormatFor(dayKey).format(item.kind === "single" ? item.instant : item.firstInstant);
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
    <a
      {...nav.linkProps(routinePath(entry.routineId))}
      className={CHIP_CLASS}
      style={{ ...chipStyle(ctx.colorFor(entry.agentId), entry.runState), textDecoration: "none", ...style }}
      title={tooltip}
    >
      {(showTime || item.kind === "collapsed") && (
        <span style={{ color: t.muted, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
          {item.kind === "collapsed" ? `${item.count}×` : time}
        </span>
      )}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {entry.routineTitle}
        {detailed && (
          <span style={{ color: t.muted }}>
            {" · "}
            {agentName}
            {" · "}
            <code style={{ fontSize: "inherit" }}>{entry.cronExpression}</code> ({entry.timeZone})
            {entry.runState !== "active" && ` · ${RUN_STATE_LABELS[entry.runState]}`}
          </span>
        )}
      </span>
    </a>
  );
}

const CHIP_CLASS = "routines-calendar-chip";

/** Hover and focus states, which inline styles can't express. Render once per page. */
export function ChipStyles() {
  return (
    <style>{`
      .${CHIP_CLASS} { cursor: pointer; }
      .${CHIP_CLASS}:hover { filter: brightness(0.94); opacity: 1 !important; }
      .dark .${CHIP_CLASS}:hover { filter: brightness(1.25); }
      .${CHIP_CLASS}:focus-visible { outline: 2px solid ${t.primary}; outline-offset: 1px; }
    `}</style>
  );
}

export interface LegendItem {
  /** `agentKey` of the agent (or unassigned). */
  key: string;
  label: string;
  color: string;
}

/** Agent colours; each item toggles that agent's routines on and off. */
export function Legend({
  items,
  filter,
  onToggleAgent,
  onToggleInactive,
  onShowAll,
}: {
  items: LegendItem[];
  filter: EntryFilter;
  onToggleAgent: (key: string) => void;
  onToggleInactive: () => void;
  onShowAll: () => void;
}) {
  const toggle = (key: string, color: string, label: string, shown: boolean, onClick: () => void, runState: RunState = "active") => (
    <button
      key={key}
      type="button"
      aria-pressed={shown}
      onClick={onClick}
      title={shown ? `Hide ${label}` : `Show ${label}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        font: "inherit",
        fontSize: 12,
        color: shown ? t.fg : t.muted,
        background: "none",
        border: "none",
        padding: "2px 0",
        cursor: "pointer",
        textDecoration: shown ? "none" : "line-through",
      }}
    >
      <span
        style={{
          ...chipStyle(color, runState),
          width: 14,
          height: 12,
          padding: 0,
          borderLeftWidth: 14,
          opacity: shown ? (runState === "active" ? 1 : 0.6) : 0.25,
        }}
        aria-hidden
      />
      {label}
    </button>
  );
  const anyHidden = filter.hideInactive || items.some((item) => filter.hiddenAgents.has(item.key));
  return (
    <div role="group" aria-label="Filter by agent" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 16px" }}>
      {items.map((item) =>
        toggle(item.key, item.color, item.label, !filter.hiddenAgents.has(item.key), () => onToggleAgent(item.key)),
      )}
      {toggle("inactive", UNASSIGNED_COLOR, "Won't run (paused or disabled)", !filter.hideInactive, onToggleInactive, "routine-paused")}
      {anyHidden && (
        <button type="button" onClick={onShowAll} style={{ ...linkButtonStyle, fontSize: 12, padding: 0 }}>
          Show all
        </button>
      )}
    </div>
  );
}

/** Agenda view: a list of the days that have items. The only view on narrow pages. */
export function Agenda({
  dates,
  days,
  today,
  ctx,
  emptyText,
  detailed = false,
}: {
  dates: CalendarDate[];
  days: ReadonlyMap<string, DayItem[]> | undefined;
  today: CalendarDate;
  ctx: ChipContext;
  emptyText: string;
  /** Wide pages have room for each entry's agent and schedule. */
  detailed?: boolean;
}) {
  const heading = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const withItems = dates.filter((date) => (days?.get(dateKey(date))?.length ?? 0) > 0);
  if (withItems.length === 0) return <div style={{ color: t.muted }}>{emptyText}</div>;
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
            {days!.get(key)!.map((item) => (
              <Chip key={itemKey(item)} item={item} dayKey={key} ctx={ctx} detailed={detailed} />
            ))}
          </section>
        );
      })}
    </div>
  );
}

export function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ border: `1px solid ${t.border}`, borderRadius: t.radius, padding: 12, fontSize: 13 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
      {children}
    </section>
  );
}
