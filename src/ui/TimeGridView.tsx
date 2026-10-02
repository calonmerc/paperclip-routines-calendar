import { useEffect, useMemo, useRef, useState } from "react";
import { dateKey, sameDate, type CalendarDate, type DayItem } from "../lib/calendar.js";
import { DEFAULT_LAYOUT_OPTIONS, MINUTES_PER_DAY, layoutDay, wallMinute, type DayLayout } from "../lib/timegrid.js";
import { Chip, itemKey, type ChipContext } from "./components.js";
import { t } from "./theme.js";

const PX_PER_HOUR = 48;
const GUTTER_PX = 52;
/** Scroll so the earliest block sits a little below the top edge. */
const SCROLL_LEAD_MINUTES = 30;

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const minuteToPx = (minute: number) => (minute / 60) * PX_PER_HOUR;

/**
 * Week (7 columns) or day (1 column) on a 24-hour axis in the display
 * timezone. Blocks that would overlap on screen share the column side by side.
 */
export function TimeGridView({
  dates,
  days,
  today,
  displayTimeZone,
  ctx,
  detailed,
  onOpenDay,
}: {
  dates: CalendarDate[];
  days: ReadonlyMap<string, DayItem[]> | undefined;
  today: CalendarDate;
  displayTimeZone: string;
  ctx: ChipContext;
  /** Day view: show agent and schedule on each block. */
  detailed: boolean;
  /** Week view: day headers open that day. */
  onOpenDay?: (date: CalendarDate) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const now = useNow(60_000);

  const layouts = useMemo(
    () => dates.map((date): DayLayout => layoutDay(days?.get(dateKey(date)) ?? [], displayTimeZone)),
    [dates, days, displayTimeZone],
  );
  const hasDense = layouts.some((layout) => layout.dense.length > 0);
  const earliest = Math.min(...layouts.flatMap((layout) => layout.timed.map((b) => b.startMinute)));
  const rangeKey = dates.map(dateKey).join(",");

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = Number.isFinite(earliest) ? minuteToPx(Math.max(0, earliest - SCROLL_LEAD_MINUTES)) : minuteToPx(8 * 60);
  }, [rangeKey, earliest]);

  const hourLabels = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", timeZone: "UTC" });
    return Array.from({ length: 24 }, (_, h) => fmt.format(Date.UTC(2023, 0, 1, h)));
  }, []);
  // Formatted separately: some locales order { weekday, day } as "27 Sun".
  const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" });
  const longFormat = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  const columns = `${GUTTER_PX}px repeat(${dates.length}, minmax(0, 1fr))`;
  const nowMinute = wallMinute(now, displayTimeZone);

  return (
    <div
      role="grid"
      aria-label="Routines by time of day"
      style={{ border: `1px solid ${t.border}`, borderRadius: t.radius, overflow: "hidden" }}
    >
      <div role="row" style={{ display: "grid", gridTemplateColumns: columns, background: t.mutedBg }}>
        <div aria-hidden />
        {dates.map((date) => {
          const isToday = sameDate(date, today);
          const utc = Date.UTC(date.year, date.month - 1, date.day);
          const label = `${weekdayFormat.format(utc)} ${date.day}`;
          const labelStyle = {
            font: "inherit",
            fontSize: 12,
            fontWeight: isToday ? 700 : 500,
            color: isToday ? t.fg : t.muted,
            padding: "6px 8px",
            textAlign: "left" as const,
          };
          return (
            <div key={dateKey(date)} role="columnheader" style={{ borderLeft: `1px solid ${t.border}`, minWidth: 0 }}>
              {onOpenDay ? (
                <button
                  type="button"
                  onClick={() => onOpenDay(date)}
                  aria-label={`Open ${longFormat.format(utc)} in day view`}
                  style={{ ...labelStyle, width: "100%", background: "none", border: "none", cursor: "pointer" }}
                >
                  {label}
                </button>
              ) : (
                <div style={labelStyle}>{longFormat.format(utc)}</div>
              )}
            </div>
          );
        })}
      </div>

      {hasDense && (
        <div role="row" style={{ display: "grid", gridTemplateColumns: columns, borderTop: `1px solid ${t.border}` }}>
          <div style={{ fontSize: 10, color: t.muted, padding: "4px 6px", textAlign: "right" }}>Frequent</div>
          {dates.map((date, i) => (
            <div
              key={dateKey(date)}
              role="gridcell"
              style={{ borderLeft: `1px solid ${t.border}`, padding: 2, display: "grid", gap: 2, alignContent: "start", minWidth: 0 }}
            >
              {layouts[i]!.dense.map((item) => (
                <Chip key={itemKey(item)} item={item} dayKey={dateKey(date)} ctx={ctx} detailed={detailed} />
              ))}
            </div>
          ))}
        </div>
      )}

      <div ref={scrollRef} style={{ maxHeight: "70vh", overflowY: "auto", borderTop: `1px solid ${t.border}` }}>
        <div style={{ display: "grid", gridTemplateColumns: columns, height: minuteToPx(MINUTES_PER_DAY), position: "relative" }}>
          <div aria-hidden style={{ position: "relative" }}>
            {hourLabels.map((label, h) =>
              h === 0 ? null : (
                <div
                  key={h}
                  style={{
                    position: "absolute",
                    top: minuteToPx(h * 60) - 7,
                    right: 6,
                    fontSize: 10,
                    lineHeight: "14px",
                    color: t.muted,
                    whiteSpace: "nowrap",
                  }}
                >
                  {label}
                </div>
              ),
            )}
          </div>
          {dates.map((date, i) => {
            const key = dateKey(date);
            const isToday = sameDate(date, today);
            return (
              <div
                key={key}
                role="gridcell"
                aria-label={`${key}: ${layouts[i]!.timed.length} scheduled`}
                style={{
                  position: "relative",
                  minWidth: 0,
                  borderLeft: `1px solid ${t.border}`,
                  background: `repeating-linear-gradient(to bottom, ${t.border} 0 1px, transparent 1px ${PX_PER_HOUR}px)`,
                }}
              >
                {layouts[i]!.timed.map((block) => (
                  <Chip
                    key={itemKey(block.item)}
                    item={block.item}
                    dayKey={key}
                    ctx={ctx}
                    detailed={detailed && block.laneCount === 1}
                    showTime={detailed || block.laneCount === 1}
                    style={{
                      position: "absolute",
                      top: minuteToPx(block.startMinute),
                      height: minuteToPx(DEFAULT_LAYOUT_OPTIONS.blockMinutes) - 2,
                      left: `calc(${(block.lane / block.laneCount) * 100}% + 2px)`,
                      width: `calc(${100 / block.laneCount}% - 4px)`,
                      boxSizing: "border-box",
                      overflow: "hidden",
                      alignItems: "center",
                    }}
                  />
                ))}
                {isToday && (
                  <div
                    aria-label="Now"
                    style={{
                      position: "absolute",
                      top: minuteToPx(nowMinute),
                      left: 0,
                      right: 0,
                      height: 0,
                      borderTop: `2px solid ${t.destructive}`,
                      pointerEvents: "none",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
