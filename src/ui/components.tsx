import type { CSSProperties, ReactNode } from "react";
import { UNASSIGNED_COLOR } from "../lib/colors.js";
import { dateKey, sameDate, type CalendarDate, type DayItem } from "../lib/calendar.js";
import { RUN_STATE_LABELS, type AgentDto, type ScheduleEntry } from "../lib/routines.js";
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
    <div style={{ ...chipStyle(ctx.colorFor(entry.agentId), entry.runState), ...style }} title={tooltip}>
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
    </div>
  );
}

export function Legend({
  agents,
  colorFor,
  showUnassigned,
}: {
  agents: AgentDto[];
  colorFor: (agentId: string | null) => string;
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
      {[...agents].sort((a, b) => a.name.localeCompare(b.name)).map((agent) => swatch(colorFor(agent.id), agent.name))}
      {showUnassigned && swatch(UNASSIGNED_COLOR, "Unassigned")}
      {swatch(UNASSIGNED_COLOR, "Won't run (paused or disabled)", "routine-paused")}
    </div>
  );
}

/** Narrow layout: a list of the days that have items. */
export function Agenda({
  dates,
  days,
  today,
  ctx,
  emptyText,
}: {
  dates: CalendarDate[];
  days: ReadonlyMap<string, DayItem[]> | undefined;
  today: CalendarDate;
  ctx: ChipContext;
  emptyText: string;
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
              <Chip key={itemKey(item)} item={item} dayKey={key} ctx={ctx} />
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
