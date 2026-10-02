# AGENTS.md

Single source of truth for coding-agent instructions in this repo. `CLAUDE.md`
is a symlink to this file. **Edit only `AGENTS.md`**, and never replace the
symlink with a copy.

## What this is

`paperclip-routines-calendar` is a [Paperclip](https://github.com/paperclipai/paperclip)
plugin that shows a company's **routines** (scheduled recurring agent tasks) on
a calendar, so you can see what runs when across the org.

A Paperclip plugin is a package with a manifest, a worker (Node, runs in a
host-managed process), and optional UI (React, loaded into the Paperclip web
app). Paperclip never compiles plugin source: it loads the built output from
`dist/`.

- Production install: the npm package name, entered in the Paperclip UI (or
  `paperclipai plugin install paperclip-routines-calendar`).
- Development install: local path, `paperclipai plugin install .`

## Tech stack

- TypeScript (strict), ESM (`"type": "module"`), Node **>= 24.11** (required
  by `@paperclipai/plugin-sdk`, the `paperclipai` CLI and the server). `.nvmrc`
  pins 24.
- pnpm 9 (`packageManager` field). Paperclip itself uses pnpm 9.
- `@paperclipai/plugin-sdk` pinned to the exact Paperclip release we test
  against (currently `2026.1001.0`). It is a devDependency: esbuild bundles it
  into the worker, the manifest imports only types, and the host provides
  `@paperclipai/plugin-sdk/ui` + React to the UI bundle at runtime.
- esbuild via the SDK's `createPluginBundlerPresets` (`esbuild.config.mjs`).
- vitest for tests (`tests/**/*.spec.ts`).

## Commands

```bash
nvm use                # Node 24 (WSL default is still 22)
pnpm install
pnpm dev               # esbuild watch: dist/manifest.js, dist/worker.js, dist/ui/
pnpm build             # one-off build
pnpm typecheck         # tsc --noEmit
pnpm test              # vitest run
pnpm dev:ui            # optional SDK UI dev server on :4177 (not wired up yet)
node scripts/seed-dev.mjs   # seed the dev instance (see below)
```

`pnpm typecheck`, `pnpm test` and `pnpm build` must all pass before calling
anything done.

## Local dev loop

A throwaway Paperclip instance lives in its own data dir, so it never touches
real data:

```bash
nvm use 24
npm i -g paperclipai@2026.1001.0 \
  --allow-scripts=@embedded-postgres/linux-x64,ssh2,protobufjs,cpu-features
# First run (onboard + start). Later runs: `paperclipai run -d ~/.paperclip-routines-calendar-dev`
paperclipai onboard --yes --no-install-service -d ~/.paperclip-routines-calendar-dev
# -> http://127.0.0.1:3100, local_trusted, embedded Postgres on :54329
```

- npm 11 blocks install scripts by default. Without `--allow-scripts`, the
  embedded Postgres binaries aren't set up.
- `onboard` has **no** `--instance` flag (only `run` does). Isolation is via
  `-d/--data-dir`.

In this repo:

```bash
pnpm dev                                   # keep running
export PAPERCLIP_API_URL=http://127.0.0.1:3100
paperclipai plugin install .               # once; the server then watches dist/
paperclipai plugin list
paperclipai plugin inspect paperclip-routines-calendar
paperclipai plugin health  paperclip-routines-calendar
paperclipai plugin logs    paperclip-routines-calendar
paperclipai plugin data    paperclip-routines-calendar <dataKey> --payload-json '{}'
node scripts/seed-dev.mjs                  # company + agents + routines
```

Reload behaviour (verified on 2026.1001.0, which contradicts the docs):
- A `dist/` rebuild restarts the worker. A UI rebuild is picked up on the next
  page load.
- **Manifest changes are NOT re-read** by the watcher. Slots, capabilities and
  routes keep the installed version.
- `paperclipai plugin upgrade <key>` re-reads the manifest, but **rejects**
  any upgrade that adds capabilities (HTTP 400 "capability escalation"; there
  is no approval API, despite the route docs mentioning `upgrade_pending`).
- So after manifest edits in dev: `paperclipai plugin uninstall
  paperclip-routines-calendar && paperclipai plugin install .`

### Looking at the UI headlessly

No browser ships with WSL. Playwright's headless Chromium works without
extra system packages. Keep it out of the repo, in a scratch dir:

```bash
npm i playwright@1 && npx playwright install chromium
```

Then load `http://127.0.0.1:3100/ROU/routine-calendar` with
`timezoneId: "America/Chicago"`. Screenshot it at 1440px and at 390px (light
and `colorScheme: "dark"`; the host applies `.dark` from the OS preference),
and collect console errors. Verify every UI change this way before calling
it done.

### Seed data

`scripts/seed-dev.mjs` is idempotent, and refuses to run unless the target is
`local_trusted`. It creates the company "Routines Calendar Demo" (prefix `ROU`)
and four agents. The agents use a no-op `process` adapter (`command: "true"`)
and are **paused**, so routines that fire never do real work. Routines:

| Routine | Cron | TZ | Notes |
| --- | --- | --- | --- |
| Daily research brief | `0 1 * * *` | America/Chicago | daily |
| Standup prep (weekdays) | `30 8 * * 1-5` | America/New_York | weekdays |
| Weekly backlog cleanup | `0 16 * * 5` | UTC | weekly |
| Draft blog posts (Mon/Wed) | `0 10 * * 1,3` | America/Chicago | list |
| Monthly metrics report | `0 9 5 * *` | Europe/London | 5th of month |
| Sunday archive sweep | `0 2 * * 0` | UTC | trigger `enabled: false` |
| Health check every 4h | `0 */4 * * *` | UTC | routine `status: paused`; dense |
| Nightly backup 01:30 | `30 1 * * *` | America/Chicago | fires twice on fall-back day |
| Spring-forward gap 02:30 | `30 2 * * *` | America/Chicago | skipped on spring-forward day |
| Release notes | `0 9 * * 2` + `0 15 * * 4` | America/Los_Angeles | two schedule triggers |
| Inbound webhook triage | none (webhook) | n/a | unassigned, so the server forces it to paused |

## Releasing

npm trusted publishing (OIDC) from `.github/workflows/release.yml` on a
published GitHub release. There's no token secret; the one-time setup is in
[docs/RELEASING.md](docs/RELEASING.md). `package.json` `version` and
`src/manifest.ts` `version` must match the tag. `dist/` is never committed:
the npm tarball gets it from `prepublishOnly`, and git clones must
`pnpm build`.

## Repo layout

```
src/manifest.ts      plugin manifest (id, capabilities, UI slots)
src/constants.ts     shared constants (page route path, routine page path)
src/worker.ts        worker entry (definePlugin + runWorker); health + settings data
src/lib/cron.ts      port of the server's cron parser (keep identical)
src/lib/zoned.ts     Intl-based timezone helpers (wall time <-> instants)
src/lib/occurrences.ts  bounded schedule expansion, server semantics
src/lib/routines.ts  API DTOs -> schedule entries + run state; legend filter
src/lib/colors.ts    stable per-agent colours
src/lib/settings.ts  per-company settings (instanceConfigSchema) with defaults
src/lib/calendar.ts  month grid, week/day/agenda spans, day bucketing (viewer's timezone)
src/lib/timegrid.ts  week/day time-of-day layout (wall-clock rows, overlap lanes)
src/ui/index.tsx     UI entry; named exports referenced by manifest slots
src/ui/CalendarPage.tsx  page slot: header, view switch, data, notices
src/ui/MonthView.tsx     month grid
src/ui/TimeGridView.tsx  week/day 24-hour grid
src/ui/components.tsx    shared chip, legend filter, agenda view, notice
src/ui/SidebarLink.tsx   sidebar slot
src/ui/api.ts        same-origin REST fetch hook
src/ui/storage.ts    localStorage prefs (view; filter per company)
tests/support/server-oracle.ts  port of server nextCronTickInTimeZone (test oracle)
tests/fixtures/      routines/agents captured from the seeded dev instance
tests/*.spec.ts      vitest
scripts/             dev tooling (seeding)
.claude/skills, .agents/   paperclip-create-plugin authoring skill (upstream copy)
```

## Code conventions

- Strict TS; no `any` at module boundaries. Model API payloads with local
  types that mirror `@paperclipai/shared` (`RoutineListItem`, etc.).
- Keep pure logic (cron parsing, occurrence expansion, colour assignment) in
  framework-free modules under `src/lib/`, so it is unit-testable in Node
  without React or the host.
- Dates: store and compare instants as UTC epoch ms or `Date`; convert to wall
  time only for display, or when matching cron fields in the trigger's
  timezone. Never use the browser's local timezone implicitly in schedule
  logic.
- UI: import only from `@paperclipai/plugin-sdk/ui`. Never import Paperclip
  `ui/src/*` internals. Prefer SDK shared components when one fits.
- Dependencies: keep minimal; justify every new runtime dependency in the
  commit message.
- Commits: small, focused, imperative subject, with a body explaining why.
  Don't push or publish; the maintainer does that.

## Verified facts (Paperclip 2026.1001.0)

Sources: the installed packages in `node_modules`, a shallow clone of
`paperclipai/paperclip` (main at `d9b64ee`, 2026-10-02; spot-checked against
the released packages), and the running dev instance.

### 1. Reading routines

- **The worker SDK cannot list arbitrary routines.** `ctx.routines` only has
  `managed.{get,reconcile,reset,update,run}` for routines the plugin itself
  declares (capability `routines.managed`). There is no `routines.read`
  capability.
- **`ctx.db` cannot read routine tables.** `PLUGIN_DATABASE_CORE_READ_TABLES`
  covers companies, projects, goals, agents, issues, issue_documents,
  issue_relations, issue_comments, heartbeat_runs, cost_events, approvals,
  issue_approvals and budget_incidents. Routine tables aren't in it.
- **The worker gets no API credential.** Its env only carries
  `PAPERCLIP_PLUGIN_ID`. Calling REST from the worker would need
  `http.outbound` plus an operator-supplied API key via `secrets.read-ref`.
- **Chosen path: the plugin UI calls the REST API same-origin.** Plugin UI is
  trusted, same-origin JS inside the Paperclip app, and not sandboxed by
  capabilities. The first-party kitchen-sink example does exactly this:
  `fetch("/api/...", { credentials: "include" })`. Endpoints
  (`server/src/routes/routines.ts`):
  - `GET /api/companies/:companyId/routines[?projectId=]` returns
    `RoutineListItem[]`: the routine fields plus `triggers[]` (`id, kind, label,
    enabled, cronExpression, timezone, nextRunAt, lastFiredAt, lastResult`),
    `lastRun`, and `activeIssue`. Verified against the dev instance.
  - `GET /api/routines/:id` returns `RoutineDetail`, which adds `assignee`
    (name/role/title), `project`, full `triggers`, and `recentRuns`.
  - `GET /api/routines/:id/runs?limit=50` returns `RoutineRunSummary[]` (run
    history: `status`, `triggeredAt`, `completedAt`, `failureReason`,
    `linkedIssue`).
  - `GET /api/companies/:companyId/agents` gives agent names for labels and
    colours.
  - Auth: none in `local_trusted` (verified). In authenticated deployments,
    the board session cookie is sent same-origin (`credentials: "include"`);
    this is **not yet verified** on an authenticated instance.

### 2. UI slots

`PLUGIN_UI_SLOT_TYPES`: `page`, `detailTab`, `taskDetailView`,
`dashboardWidget`, `sidebar`, `routeSidebar`, `sidebarPanel`,
`projectSidebarItem`, `globalToolbarButton`, `appShellOverlay`,
`organizationSwitcher`, `toolbarButton`, `contextMenuItem`,
`commentAnnotation`, `commentContextMenuItem`, `settingsPage`,
`companySettingsPage`.

- **Full calendar: a `page` slot with `routePath`**, mounted at
  `/:companyPrefix/<routePath>`. `routePath` must be a single lowercase slug,
  can't use a reserved segment, and must be unique across plugins.
  Capability: `ui.page.register`. Props: `PluginPageProps`.
- **Nav entry: a `sidebar` slot** (capability `ui.sidebar.register`) that
  renders a link using `useHostNavigation().linkProps(path)`. This is the
  GitHub Manager pattern.
- Dashboard widget: `dashboardWidget` (`ui.dashboardWidget.register`), a good
  later home for an "upcoming routines" mini-view.
- Host context: `useHostContext()` gives `companyId`, `companyPrefix`,
  `userId`, `projectId`, `entityId/Type`.
- The host's routine pages are `/:companyPrefix/routines` and
  `/:companyPrefix/routines/:routineId`, the click-through target.
- Plugin UI bundles are served at `/_plugins/<pluginId uuid>/ui/*`.

### 3. Config and settings

- The manifest declares `instanceConfigSchema` (JSON Schema). Values are
  stored **per company** (migration `0164_plugin_config_company_scope`).
  - Read: `GET /api/plugins/:pluginId/config?companyId=`, or
    `ctx.config.get(companyId?)` in the worker.
  - Write: `POST /api/plugins/:pluginId/config` with body
    `{ companyId, configJson }`; requires instance admin (verified).
  - The host renders a form from the schema automatically at
    `/:companyPrefix/company/settings/instance/plugins/:pluginId`
    (Configuration tab), using `title`, `description`, `default`,
    `minimum`/`maximum` (verified). No capability is needed to read config.
- A `settingsPage` slot gives the plugin its own settings UI.
- `ctx.state` (capabilities `plugin.state.read/write`) offers scoped key/value
  state (company, issue, and other scopes) for per-company preferences that
  don't need admin rights.

### 4. Cron schedules and timezones

- Schedules live on **routine triggers** (`kind: "schedule"`), not on the
  routine. A routine can have several triggers. Kinds: `schedule`, `webhook`,
  `api`. Only `schedule` has a cron expression.
- Each trigger stores `cronExpression` and `timezone`. Creating one defaults
  `timezone` to `"UTC"`, and an update can't null it. `nextRunAt` is an
  instant computed by the server.
- Server cron (`server/src/services/cron.ts` + `nextCronTickInTimeZone` in
  `services/routines.ts`) is a **custom implementation, not a library**:
  - Exactly 5 numeric fields. Supports `*`, `N`, `N-M`, `*/S`, `N/S`,
    `N-M/S`, and comma lists. **No** names (`MON`, `JAN`), `?`, `L`, `W`, `#`,
    or `@daily`. Day of week is `0-6` (Sunday is 0; `7` is rejected).
  - Day-of-month and day-of-week are **ANDed**, unlike Vixie cron, which ORs
    them when both are restricted. Example: `0 9 1 * 1` means "the 1st **and**
    a Monday".
  - Matching walks UTC minutes and compares the **wall-clock** fields in the
    trigger's IANA timezone, via `Intl.DateTimeFormat` with `h23`. As a result:
    - **Spring-forward gap:** a nonexistent local time never matches, so that
      day is skipped.
    - **Fall-back overlap:** an ambiguous local time matches **twice**, an hour
      apart. The scheduler computes the next tick from "now", so both fire.
- **Will it actually run?** The scheduler dispatches only when
  `trigger.enabled && !trigger.archived && routine.status === "active"`.
  Routine statuses are `active`, `paused` and `archived`.
  - `nextRunAt` stays populated for disabled triggers and paused routines
    (verified), so it can't be used alone.
  - A routine whose project is paused has its ticks claimed but **suppressed**.
  - An active routine with no assignee is forced to `paused`.
  - `catchUpPolicy: "enqueue_missed_with_cap"` can enqueue missed runs after
    downtime.

### 5. UI ↔ worker bridge

- UI `usePluginData(key, params)` calls worker
  `ctx.data.register(key, handler(params))`.
- UI `usePluginAction(key)` returns `(params) => Promise`, backed by
  `ctx.actions.register`.
- `usePluginStream(channel)` receives worker pushes via `ctx.streams`.
- Results must be JSON-serializable. From the CLI:
  `paperclipai plugin data <key> <dataKey>` (verified with `health`).

### Packaging

- The server finds entrypoints via the `paperclipPlugin` key in
  `package.json` (`manifest`, `worker`, `ui`). If that key is missing it falls
  back to `dist/manifest.js`. The dev file-watcher **only** reads
  `paperclipPlugin`.
- The plugin id must match `/^[a-z0-9][a-z0-9._-]*$/`. The scaffolder derives
  it from the package name (`@scope/name` becomes `scope.name`). Keep it
  stable once published.

## Discrepancies found (docs vs. reality)

- `paperclipai plugin init` from the **npm-installed** CLI fails with
  "Package package.json not found at …/packages/shared/package.json". It
  resolves the SDK relative to its own install dir, which only works from a
  monorepo checkout. That's why this repo started as plain `pnpm init`. The
  scaffold was reproduced by hand from
  `packages/plugins/create-paperclip-plugin/src/index.ts`.
- The docs' local-dev guide says "Node.js 24.11+", but the prompt-level
  assumption was Node 20+. Node 24.11+ is enforced by `engines`.
- `onboard --instance` doesn't exist; use `--data-dir` (`run` does accept
  `--instance`).
- The `paperclip-create-plugin` skill says "no host-provided shared plugin UI
  component kit yet". The SDK (`@paperclipai/plugin-sdk/ui`) and the authoring
  guide do export shared components (`MarkdownBlock`, `IssuesList`,
  `AssigneePicker`, `ManagedRoutinesList`, …). Trust the SDK.
- GitHub Manager declares `"paperclip": { "manifest" }` in `package.json`.
  The real key is `paperclipPlugin`; theirs only works via the `dist/` fallback.
- `/_plugins/<pluginKey>/ui/*` returns HTTP 500. It only works with the plugin
  UUID. The host uses the UUID, so this doesn't affect us.
- `LOCAL_PLUGIN_DEVELOPMENT.md` says a manifest rebuild makes the host
  re-read the manifest. It doesn't (see "Reload behaviour").
- `POST /api/plugins/:id/upgrade` is documented as moving capability
  escalations to `upgrade_pending`; it actually returns 400.
- `routines` isn't in `PLUGIN_RESERVED_COMPANY_ROUTE_SEGMENTS`, but the host
  serves `/:companyPrefix/routines`. Don't claim that slug.
- docs.paperclip.ing has no stable "develop a plugin locally" URL (404s). The
  authoritative text is in the repo at `doc/plugins/*.md`.

## Known unknowns

- **Authenticated deployments:** does same-origin `fetch(..., {credentials:
  "include"})` from plugin UI work against `authenticated` mode? Expected yes,
  since it's the same session cookie and the kitchen-sink example relies on
  it. Not yet verified. Fallback: a worker data handler using `http.outbound`
  with an operator-supplied board API key secret.
- **Styling:** which host CSS (Tailwind classes, CSS variables) is reliably
  available to plugin UI? GitHub Manager uses Tailwind class names, but only
  classes the host already compiled will exist. Plan: inline styles plus host
  CSS variables, with fallbacks.
- **Capability planning:** the escalation check above means a published
  version that adds a capability can't be upgraded in place; users would have
  to uninstall and reinstall. Decide capabilities before publishing, and
  re-test `upgrade` on newer Paperclip releases.
- **Project-paused suppression:** routines in a paused project still show as
  scheduled. The list endpoint doesn't expose project pause state.
- **Archived triggers:** `RoutineListItem.triggers` doesn't expose
  `archived`. Unknown whether the list endpoint already filters them out.
