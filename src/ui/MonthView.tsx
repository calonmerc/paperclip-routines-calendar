import { useState, type CSSProperties } from "react";
import { dateKey, sameDate, type CalendarDate, type DayItem, type MonthGrid } from "../lib/calendar.js";
import { Chip, itemKey, linkButtonStyle, type ChipContext } from "./components.js";
import { t } from "./theme.js";

const MAX_ITEMS_PER_CELL = 5;

const rowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
  marginLeft: -1,
};

/** 6-week grid. Remount (via `key`) on month change to reset expanded cells. */
export function MonthView({
  grid,
  days,
  today,
  title,
  weekdayNames,
  ctx,
  onOpenDay,
}: {
  grid: MonthGrid;
  days: ReadonlyMap<string, DayItem[]> | undefined;
  today: CalendarDate;
  title: string;
  weekdayNames: string[];
  ctx: ChipContext;
  onOpenDay: (date: CalendarDate) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const dayLabel = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

  return (
    <div role="grid" aria-label={`Routines for ${title}`} style={{ border: `1px solid ${t.border}`, borderRadius: t.radius, overflow: "hidden" }}>
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
            const items = days?.get(key) ?? [];
            const isExpanded = expanded.has(key);
            const visible = isExpanded ? items : items.slice(0, MAX_ITEMS_PER_CELL);
            const hidden = items.length - visible.length;
            const inMonth = date.month === grid.month;
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
                <button
                  type="button"
                  onClick={() => onOpenDay(date)}
                  aria-label={`Open ${dayLabel.format(Date.UTC(date.year, date.month - 1, date.day))} in day view`}
                  style={{
                    alignSelf: "flex-start",
                    font: "inherit",
                    fontSize: 12,
                    fontWeight: isToday ? 700 : 500,
                    color: inMonth ? t.fg : t.muted,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "0 4px",
                    borderRadius: 999,
                    outline: isToday ? `1.5px solid ${t.primary}` : undefined,
                  }}
                >
                  {date.day}
                </button>
                {visible.map((item) => (
                  <Chip key={itemKey(item)} item={item} dayKey={key} ctx={ctx} />
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
  );
}
