import { useCallback, useEffect, useState } from "react";
import type { AgentDto, RoutineListItemDto } from "../lib/routines.js";

/**
 * Plugin UI is trusted same-origin code, so it calls the Paperclip REST API
 * directly with the board session (the same pattern as Paperclip's
 * kitchen-sink example plugin). The worker SDK has no way to list routines;
 * see AGENTS.md "Reading routines".
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function getJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { credentials: "include", headers: { accept: "application/json" }, signal });
  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === "string") detail = body.error;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(response.status, path, `${response.status} ${detail || response.statusText} (${path})`);
  }
  return (await response.json()) as T;
}

export interface RoutineData {
  routines: RoutineListItemDto[];
  agents: AgentDto[];
}

export interface RoutineDataState {
  data: RoutineData | null;
  loading: boolean;
  error: Error | null;
  reload: () => void;
}

export function useRoutineData(companyId: string | null): RoutineDataState {
  const [data, setData] = useState<RoutineData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!companyId) {
      setData(null);
      return;
    }
    const controller = new AbortController();
    const company = encodeURIComponent(companyId);
    setLoading(true);
    setError(null);
    Promise.all([
      getJson<RoutineListItemDto[]>(`/api/companies/${company}/routines`, controller.signal),
      getJson<AgentDto[]>(`/api/companies/${company}/agents`, controller.signal),
    ])
      .then(([routines, agents]) => {
        setData({ routines, agents });
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });
    return () => controller.abort();
  }, [companyId, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, reload };
}
