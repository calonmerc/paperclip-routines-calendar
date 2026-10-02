import { useCallback, useEffect, useState } from "react";
import type { CalendarView } from "../lib/calendar.js";
import { NO_FILTER, type EntryFilter } from "../lib/routines.js";

/**
 * Per-viewer conveniences in localStorage. Storage can be missing or throw
 * (private windows, blocked site data), so every access falls back silently.
 */
const PREFIX = "paperclip-routines-calendar:";

function read(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    // storage unavailable
  }
}

export function loadView(): CalendarView {
  const stored = read("view");
  return stored === "month" || stored === "week" || stored === "day" || stored === "agenda" ? stored : "month";
}

export function saveView(view: CalendarView) {
  write("view", view);
}

function loadFilter(companyId: string): EntryFilter {
  try {
    const parsed = JSON.parse(read(`filter:${companyId}`) ?? "null") as { hiddenAgents?: unknown; hideInactive?: unknown } | null;
    if (!parsed) return NO_FILTER;
    const hidden = Array.isArray(parsed.hiddenAgents) ? parsed.hiddenAgents.filter((k): k is string => typeof k === "string") : [];
    return { hiddenAgents: new Set(hidden), hideInactive: parsed.hideInactive === true };
  } catch {
    return NO_FILTER;
  }
}

/** The legend filter for one company, remembered per company. */
export function useStoredFilter(companyId: string | null): [EntryFilter, (next: EntryFilter) => void] {
  const [filter, setFilterState] = useState<EntryFilter>(() => (companyId ? loadFilter(companyId) : NO_FILTER));
  useEffect(() => {
    setFilterState(companyId ? loadFilter(companyId) : NO_FILTER);
  }, [companyId]);
  const setFilter = useCallback(
    (next: EntryFilter) => {
      setFilterState(next);
      if (companyId) {
        write(`filter:${companyId}`, JSON.stringify({ hiddenAgents: [...next.hiddenAgents], hideInactive: next.hideInactive }));
      }
    },
    [companyId],
  );
  return [filter, setFilter];
}
