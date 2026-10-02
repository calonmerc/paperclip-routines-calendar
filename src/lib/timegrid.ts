/**
 * Week/day view model: places one day's items on a 24-hour time axis.
 *
 * Items are positioned by their wall-clock minute in the display timezone,
 * so DST needs no special casing: on a fall-back day both runs of an
 * ambiguous time land on the same row (and sit side by side), and nothing
 * lands in a spring-forward gap because no instant has that wall time.
 */

import { DEFAULT_LIMITS } from "./occurrences.js";
import { itemInstant, type DayItem, type PlaceOptions } from "./calendar.js";
import { zonedParts } from "./zoned.js";

export const MINUTES_PER_DAY = 24 * 60;

/**
 * Placement for week/day views. Items get their own block unless a trigger
 * fires more than once an hour on average, so hourly schedules stay visible.
 */
export const TIME_GRID_PLACE_OPTIONS: PlaceOptions = { collapseAbove: 24, limits: DEFAULT_LIMITS };

export interface TimedBlock {
  item: DayItem & { kind: "single" };
  /** Minutes since local midnight, 0-1439. */
  startMinute: number;
  /** 0-based column within its overlap cluster. */
  lane: number;
  /** Columns in its overlap cluster; the block is `1 / laneCount` wide. */
  laneCount: number;
}

export interface DayLayout {
  timed: TimedBlock[];
  /** Collapsed dense schedules, shown in a strip above the time axis. */
  dense: (DayItem & { kind: "collapsed" })[];
}

export interface LayoutOptions {
  /**
   * Visual height of a block in minutes. Runs have no duration, so this only
   * decides when two blocks would overlap on screen and need separate lanes.
   */
  blockMinutes: number;
}

export const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = { blockMinutes: 30 };

export function wallMinute(instant: number, displayTimeZone: string): number {
  const { hour, minute } = zonedParts(instant, displayTimeZone);
  return hour * 60 + minute;
}

/**
 * Lays out one day's items (as produced by `placeOccurrences`, already sorted
 * by time). Overlapping blocks form a cluster; each block takes the first
 * free lane, and every block in a cluster shares the cluster's lane count.
 */
export function layoutDay(
  items: readonly DayItem[],
  displayTimeZone: string,
  options: LayoutOptions = DEFAULT_LAYOUT_OPTIONS,
): DayLayout {
  const dense: DayLayout["dense"] = [];
  const singles: { item: DayItem & { kind: "single" }; startMinute: number }[] = [];
  for (const item of items) {
    if (item.kind === "collapsed") dense.push(item);
    else singles.push({ item, startMinute: wallMinute(item.instant, displayTimeZone) });
  }
  // Wall minutes aren't monotonic in instants on a fall-back day.
  singles.sort((a, b) => a.startMinute - b.startMinute || itemInstant(a.item) - itemInstant(b.item));

  const timed: TimedBlock[] = [];
  let cluster: TimedBlock[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;
  const closeCluster = () => {
    for (const block of cluster) block.laneCount = laneEnds.length;
    cluster = [];
    laneEnds = [];
  };

  for (const { item, startMinute } of singles) {
    if (startMinute >= clusterEnd) closeCluster();
    const end = startMinute + options.blockMinutes;
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= startMinute);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = end;
    clusterEnd = cluster.length === 0 ? end : Math.max(clusterEnd, end);
    const block: TimedBlock = { item, startMinute, lane, laneCount: 1 };
    cluster.push(block);
    timed.push(block);
  }
  closeCluster();

  return { timed, dense };
}
