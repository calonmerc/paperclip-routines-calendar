/**
 * Routine API payloads → schedule entries the calendar can expand.
 *
 * The DTOs mirror the subset of `RoutineListItem` / `Agent` from
 * `@paperclipai/shared` that we use. Dates arrive as ISO strings over JSON.
 */

export interface RoutineTriggerDto {
  id: string;
  kind: string;
  label: string | null;
  enabled: boolean;
  cronExpression: string | null;
  timezone: string | null;
  nextRunAt: string | null;
  lastFiredAt: string | null;
  lastResult: string | null;
}

export interface RoutineListItemDto {
  id: string;
  title: string;
  /** "active" | "paused" | "archived" */
  status: string;
  assigneeAgentId: string | null;
  triggers: RoutineTriggerDto[];
}

export interface AgentDto {
  id: string;
  name: string;
}

/**
 * Whether Paperclip's scheduler will actually dispatch this schedule. It
 * fires only when the routine is active and the trigger is enabled.
 */
export type RunState = "active" | "trigger-disabled" | "routine-paused" | "routine-archived";

export const RUN_STATE_LABELS: Record<RunState, string> = {
  active: "Scheduled",
  "trigger-disabled": "Schedule disabled",
  "routine-paused": "Routine paused",
  "routine-archived": "Routine archived",
};

export interface ScheduleEntry {
  routineId: string;
  routineTitle: string;
  triggerId: string;
  triggerLabel: string | null;
  cronExpression: string;
  timeZone: string;
  agentId: string | null;
  runState: RunState;
}

export interface ScheduleProblem {
  routineId: string;
  routineTitle: string;
  triggerId: string;
  message: string;
}

export interface ScheduleExtraction {
  entries: ScheduleEntry[];
  /** Routines with no schedule trigger (webhook/API-only, or none at all). */
  unscheduled: RoutineListItemDto[];
  /** Schedule triggers the calendar can't place. */
  problems: ScheduleProblem[];
}

export function runStateOf(routine: Pick<RoutineListItemDto, "status">, trigger: Pick<RoutineTriggerDto, "enabled">): RunState {
  // Routine status wins: a paused routine never fires, whatever its triggers say.
  if (routine.status === "archived") return "routine-archived";
  if (routine.status !== "active") return "routine-paused";
  if (!trigger.enabled) return "trigger-disabled";
  return "active";
}

export function extractSchedules(routines: readonly RoutineListItemDto[]): ScheduleExtraction {
  const entries: ScheduleEntry[] = [];
  const unscheduled: RoutineListItemDto[] = [];
  const problems: ScheduleProblem[] = [];

  for (const routine of routines) {
    const schedules = routine.triggers.filter((t) => t.kind === "schedule");
    if (schedules.length === 0) {
      unscheduled.push(routine);
      continue;
    }
    for (const trigger of schedules) {
      if (!trigger.cronExpression) {
        problems.push({
          routineId: routine.id,
          routineTitle: routine.title,
          triggerId: trigger.id,
          message: "Schedule has no cron expression",
        });
        continue;
      }
      if (!trigger.timezone) {
        // The scheduler skips schedule triggers without a timezone.
        problems.push({
          routineId: routine.id,
          routineTitle: routine.title,
          triggerId: trigger.id,
          message: "Schedule has no timezone, so Paperclip will not run it",
        });
        continue;
      }
      entries.push({
        routineId: routine.id,
        routineTitle: routine.title,
        triggerId: trigger.id,
        triggerLabel: trigger.label,
        cronExpression: trigger.cronExpression,
        timeZone: trigger.timezone,
        agentId: routine.assigneeAgentId,
        runState: runStateOf(routine, trigger),
      });
    }
  }

  return { entries, unscheduled, problems };
}
