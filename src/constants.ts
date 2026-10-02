/** Company route for the calendar page: `/:companyPrefix/routine-calendar`. */
export const ROUTE_PATH = "routine-calendar";

/** Paperclip's own routine page, relative to the company: `/:companyPrefix/routines/:id`. */
export function routinePath(routineId: string): string {
  return `/routines/${encodeURIComponent(routineId)}`;
}
