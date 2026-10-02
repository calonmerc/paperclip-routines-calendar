/**
 * Per-company plugin settings, set by an instance admin in Paperclip's plugin
 * settings (the manifest's `instanceConfigSchema`). The worker reads them via
 * `ctx.config.get(companyId)`; this module turns that raw value into settings
 * with defaults, so a missing or invalid value never breaks the calendar.
 */

export interface CalendarSettings {
  /**
   * Week/day views: a schedule that fires more than this many times in a day
   * collapses into one "N×" entry instead of one block per run.
   */
  timeGridCollapseAbove: number;
}

export const DEFAULT_SETTINGS: CalendarSettings = { timeGridCollapseAbove: 24 };

/** 1440 runs a day is every minute, the most any cron can fire. */
export const COLLAPSE_ABOVE_RANGE = { minimum: 1, maximum: 1440 } as const;

export function resolveSettings(raw: Record<string, unknown> | null | undefined): CalendarSettings {
  const value = raw?.timeGridCollapseAbove;
  const valid =
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= COLLAPSE_ABOVE_RANGE.minimum &&
    value <= COLLAPSE_ABOVE_RANGE.maximum;
  return { timeGridCollapseAbove: valid ? value : DEFAULT_SETTINGS.timeGridCollapseAbove };
}
