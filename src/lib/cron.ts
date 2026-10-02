/**
 * Cron parsing that mirrors Paperclip's own scheduler.
 *
 * Ported from `server/src/services/cron.ts` (Paperclip 2026.1001.0) so the
 * calendar accepts, rejects and interprets expressions exactly as the server
 * does. Notable differences from Vixie cron and libraries like cron-parser:
 *
 * - exactly 5 numeric fields; no names (MON/JAN), `?`, `L`, `W`, `#`, `@daily`
 * - day of week is 0-6 (Sunday = 0); 7 is rejected
 * - day-of-month and day-of-week are ANDed, never ORed
 * - values go through `parseInt`, so the server's leniency (`"5x"` → 5) is
 *   preserved on purpose
 *
 * Keep this file behaviourally identical to upstream. If upstream changes,
 * port the change and add a test.
 */

export interface ParsedCron {
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];
  daysOfWeek: number[];
}

interface FieldSpec {
  min: number;
  max: number;
  name: string;
}

const FIELD_SPECS: readonly [FieldSpec, FieldSpec, FieldSpec, FieldSpec, FieldSpec] = [
  { min: 0, max: 59, name: "minute" },
  { min: 0, max: 23, name: "hour" },
  { min: 1, max: 31, name: "day of month" },
  { min: 1, max: 12, name: "month" },
  { min: 0, max: 6, name: "day of week" },
];

function validateBounds(value: number, spec: FieldSpec): void {
  if (value < spec.min || value > spec.max) {
    throw new Error(`Value ${value} out of range [${spec.min}–${spec.max}] for cron ${spec.name} field`);
  }
}

function parseField(token: string, spec: FieldSpec): number[] {
  const values = new Set<number>();

  for (const part of token.split(",")) {
    const trimmed = part.trim();
    if (trimmed === "") {
      throw new Error(`Empty element in cron ${spec.name} field`);
    }

    const slashIdx = trimmed.indexOf("/");
    if (slashIdx !== -1) {
      const base = trimmed.slice(0, slashIdx);
      const stepStr = trimmed.slice(slashIdx + 1);
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step <= 0) {
        throw new Error(`Invalid step "${stepStr}" in cron ${spec.name} field`);
      }

      let rangeStart = spec.min;
      let rangeEnd = spec.max;

      if (base === "*") {
        // every `step` from the field minimum
      } else if (base.includes("-")) {
        const [a, b] = base.split("-").map((s) => parseInt(s, 10));
        if (a === undefined || b === undefined || isNaN(a) || isNaN(b)) {
          throw new Error(`Invalid range "${base}" in cron ${spec.name} field`);
        }
        rangeStart = a;
        rangeEnd = b;
      } else {
        const start = parseInt(base, 10);
        if (isNaN(start)) {
          throw new Error(`Invalid start "${base}" in cron ${spec.name} field`);
        }
        rangeStart = start;
      }

      validateBounds(rangeStart, spec);
      validateBounds(rangeEnd, spec);

      for (let i = rangeStart; i <= rangeEnd; i += step) {
        values.add(i);
      }
      continue;
    }

    if (trimmed.includes("-")) {
      const [aStr, bStr] = trimmed.split("-");
      const a = parseInt(aStr ?? "", 10);
      const b = parseInt(bStr ?? "", 10);
      if (isNaN(a) || isNaN(b)) {
        throw new Error(`Invalid range "${trimmed}" in cron ${spec.name} field`);
      }
      validateBounds(a, spec);
      validateBounds(b, spec);
      if (a > b) {
        throw new Error(`Invalid range ${a}-${b} in cron ${spec.name} field (start > end)`);
      }
      for (let i = a; i <= b; i++) {
        values.add(i);
      }
      continue;
    }

    if (trimmed === "*") {
      for (let i = spec.min; i <= spec.max; i++) {
        values.add(i);
      }
      continue;
    }

    const val = parseInt(trimmed, 10);
    if (isNaN(val)) {
      throw new Error(`Invalid value "${trimmed}" in cron ${spec.name} field`);
    }
    validateBounds(val, spec);
    values.add(val);
  }

  if (values.size === 0) {
    throw new Error(`Empty result for cron ${spec.name} field`);
  }

  return [...values].sort((a, b) => a - b);
}

/** Parse a 5-field cron expression. Throws on anything the server rejects. */
export function parseCron(expression: string): ParsedCron {
  const trimmed = expression.trim();
  if (!trimmed) {
    throw new Error("Cron expression must not be empty");
  }

  const tokens = trimmed.split(/\s+/);
  if (tokens.length !== 5) {
    throw new Error(`Cron expression must have exactly 5 fields, got ${tokens.length}: "${trimmed}"`);
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = tokens as [string, string, string, string, string];
  return {
    minutes: parseField(minute, FIELD_SPECS[0]),
    hours: parseField(hour, FIELD_SPECS[1]),
    daysOfMonth: parseField(dayOfMonth, FIELD_SPECS[2]),
    months: parseField(month, FIELD_SPECS[3]),
    daysOfWeek: parseField(dayOfWeek, FIELD_SPECS[4]),
  };
}

/** `null` when valid, otherwise the error message the server would give. */
export function validateCron(expression: string): string | null {
  try {
    parseCron(expression);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
