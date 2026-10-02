#!/usr/bin/env node
// Seed a throwaway Paperclip dev instance with a company, agents, and routines
// whose schedules exercise the calendar (daily, weekdays, weekly, Mon/Wed,
// monthly, disabled, paused, DST edge, multi-trigger, webhook-only).
//
// Usage: node scripts/seed-dev.mjs [--api-base http://127.0.0.1:3100]
//
// Only works against a `local_trusted` instance (no auth). Idempotent: reuses
// the company/agents/routines it finds by name instead of duplicating them.
// Agents use a no-op `process` adapter and are paused, so routines that fire
// create issues but never run real work.

const COMPANY_NAME = "Routines Calendar Demo";

const argIndex = process.argv.indexOf("--api-base");
const apiBase = (
  argIndex !== -1 ? process.argv[argIndex + 1] : process.env.PAPERCLIP_API_URL ?? "http://127.0.0.1:3100"
).replace(/\/$/, "");

const AGENTS = [
  { key: "researcher", name: "Researcher", role: "researcher", title: "Research Agent" },
  { key: "planner", name: "Planner", role: "pm", title: "Planning Agent" },
  { key: "writer", name: "Writer", role: "cmo", title: "Content Writer" },
  { key: "ops", name: "Ops", role: "devops", title: "Operations Agent" },
];

/**
 * `agent: null` means unassigned. `status` defaults to "active".
 * Trigger `enabled` defaults to true.
 */
const ROUTINES = [
  {
    title: "Daily research brief",
    agent: "researcher",
    triggers: [{ label: "1am daily", cronExpression: "0 1 * * *", timezone: "America/Chicago" }],
  },
  {
    title: "Standup prep (weekdays)",
    agent: "planner",
    triggers: [{ label: "Weekday mornings", cronExpression: "30 8 * * 1-5", timezone: "America/New_York" }],
  },
  {
    title: "Weekly backlog cleanup",
    agent: "ops",
    triggers: [{ label: "Friday afternoon", cronExpression: "0 16 * * 5", timezone: "UTC" }],
  },
  {
    title: "Draft blog posts (Mon/Wed)",
    agent: "writer",
    triggers: [{ label: "Mon + Wed", cronExpression: "0 10 * * 1,3", timezone: "America/Chicago" }],
  },
  {
    title: "Monthly metrics report",
    agent: "planner",
    triggers: [{ label: "5th of the month", cronExpression: "0 9 5 * *", timezone: "Europe/London" }],
  },
  {
    title: "Sunday archive sweep (trigger disabled)",
    agent: "ops",
    triggers: [{ label: "Sunday 2am", cronExpression: "0 2 * * 0", timezone: "UTC", enabled: false }],
  },
  {
    title: "Health check every 4h (routine paused)",
    agent: "ops",
    status: "paused",
    triggers: [{ label: "Every 4 hours", cronExpression: "0 */4 * * *", timezone: "UTC" }],
  },
  {
    // 01:30 local is ambiguous on fall-back day (fires twice) and fine otherwise.
    title: "Nightly backup 01:30 (DST edge)",
    agent: "ops",
    triggers: [{ label: "01:30 Chicago", cronExpression: "30 1 * * *", timezone: "America/Chicago" }],
  },
  {
    // 02:30 local does not exist on spring-forward day, so that day is skipped.
    title: "Spring-forward gap 02:30 (DST edge)",
    agent: "researcher",
    triggers: [{ label: "02:30 Chicago", cronExpression: "30 2 * * *", timezone: "America/Chicago" }],
  },
  {
    title: "Release notes (two schedules)",
    agent: "writer",
    triggers: [
      { label: "Tuesday draft", cronExpression: "0 9 * * 2", timezone: "America/Los_Angeles" },
      { label: "Thursday final", cronExpression: "0 15 * * 4", timezone: "America/Los_Angeles" },
    ],
  },
  {
    title: "Inbound webhook triage (no schedule, unassigned)",
    agent: null,
    triggers: [{ kind: "webhook", label: "Inbound webhook" }],
  },
];

async function api(method, path, body) {
  const res = await fetch(`${apiBase}/api${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function main() {
  const health = await api("GET", "/health");
  if (health.deploymentMode !== "local_trusted") {
    throw new Error(`Refusing to seed: ${apiBase} is in ${health.deploymentMode} mode, expected local_trusted.`);
  }
  console.log(`Seeding ${apiBase} (Paperclip ${health.version})`);

  const companies = await api("GET", "/companies");
  let company = companies.find((c) => c.name === COMPANY_NAME);
  if (!company) {
    company = await api("POST", "/companies", {
      name: COMPANY_NAME,
      description: "Seed data for paperclip-routines-calendar development.",
    });
    console.log(`+ company ${company.name} (${company.id})`);
  } else {
    console.log(`= company ${company.name} (${company.id})`);
  }

  const existingAgents = await api("GET", `/companies/${company.id}/agents`);
  const agentIds = {};
  for (const spec of AGENTS) {
    let agent = existingAgents.find((a) => a.name === spec.name);
    if (!agent) {
      agent = await api("POST", `/companies/${company.id}/agents`, {
        name: spec.name,
        role: spec.role,
        title: spec.title,
        adapterType: "process",
        adapterConfig: { command: "true" },
      });
      console.log(`+ agent ${agent.name} (${agent.id})`);
    } else {
      console.log(`= agent ${agent.name} (${agent.id})`);
    }
    if (agent.status !== "paused") {
      await api("POST", `/agents/${agent.id}/pause`, {});
    }
    agentIds[spec.key] = agent.id;
  }

  const existingRoutines = await api("GET", `/companies/${company.id}/routines`);
  for (const spec of ROUTINES) {
    if (existingRoutines.some((r) => r.title === spec.title)) {
      console.log(`= routine ${spec.title}`);
      continue;
    }
    const routine = await api("POST", `/companies/${company.id}/routines`, {
      title: spec.title,
      assigneeAgentId: spec.agent ? agentIds[spec.agent] : null,
      status: spec.status ?? "active",
    });
    for (const trigger of spec.triggers) {
      const kind = trigger.kind ?? "schedule";
      const created = await api(
        "POST",
        `/routines/${routine.id}/triggers`,
        kind === "schedule"
          ? { kind, label: trigger.label, cronExpression: trigger.cronExpression, timezone: trigger.timezone }
          : { kind, label: trigger.label },
      );
      const triggerId = created.trigger?.id ?? created.id;
      if (trigger.enabled === false) {
        await api("PATCH", `/routine-triggers/${triggerId}`, { enabled: false });
      }
    }
    console.log(`+ routine ${spec.title}`);
  }

  console.log(`Done. Company prefix/id: ${company.issuePrefix ?? ""} ${company.id}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
