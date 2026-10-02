/**
 * Stable per-agent colours.
 *
 * Agents are sorted by name (then id) and take palette slots in order, so the
 * same org always gets the same colours and neighbours never collide until
 * the palette runs out. The palette is mid-luminance so it reads on both light
 * and dark host themes, where it's used for accents and tinted backgrounds,
 * never as text on white.
 */

import type { AgentDto } from "./routines.js";

export const AGENT_PALETTE = [
  "#4e79a7",
  "#f28e2b",
  "#59a14f",
  "#e15759",
  "#b07aa1",
  "#76b7b2",
  "#edc948",
  "#ff9da7",
  "#9c755f",
  "#8cd17d",
  "#a0cbe8",
  "#d37295",
] as const;

export const UNASSIGNED_COLOR = "#9ca3af";

export function assignAgentColors(agents: readonly AgentDto[]): Map<string, string> {
  const sorted = [...agents].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const colors = new Map<string, string>();
  sorted.forEach((agent, index) => {
    colors.set(agent.id, AGENT_PALETTE[index % AGENT_PALETTE.length]!);
  });
  return colors;
}

export function colorForAgent(colors: ReadonlyMap<string, string>, agentId: string | null): string {
  return (agentId && colors.get(agentId)) || UNASSIGNED_COLOR;
}
