import type { CSSProperties } from "react";
import type { RunState } from "../lib/routines.js";

/**
 * Host theme tokens (shadcn-style CSS variables on :root / .dark in the
 * Paperclip app) with fallbacks in case a variable is missing.
 */
export const t = {
  fg: "var(--foreground, #1f2937)",
  muted: "var(--muted-foreground, #6b7280)",
  border: "var(--border, rgba(127,127,127,0.25))",
  card: "var(--card, transparent)",
  mutedBg: "var(--muted, rgba(127,127,127,0.08))",
  accent: "var(--accent, rgba(127,127,127,0.12))",
  primary: "var(--primary, #111827)",
  destructive: "var(--destructive, #dc2626)",
  radius: "var(--radius, 0.5rem)",
} as const;

export function tint(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

/** Chip styling: solid agent-colour accent; hatched and faded when it won't run. */
export function chipStyle(color: string, runState: RunState): CSSProperties {
  const running = runState === "active";
  return {
    display: "flex",
    alignItems: "baseline",
    gap: 4,
    minWidth: 0,
    padding: "1px 4px",
    borderLeft: `3px ${running ? "solid" : "dashed"} ${color}`,
    borderRadius: 3,
    fontSize: 11,
    lineHeight: "16px",
    color: t.fg,
    background: running
      ? tint(color, 16)
      : `repeating-linear-gradient(135deg, ${tint(color, 14)} 0 4px, transparent 4px 8px)`,
    opacity: running ? 1 : 0.6,
  };
}

export const buttonStyle: CSSProperties = {
  font: "inherit",
  fontSize: 13,
  padding: "4px 10px",
  color: t.fg,
  background: "transparent",
  border: `1px solid ${t.border}`,
  borderRadius: t.radius,
  cursor: "pointer",
};
