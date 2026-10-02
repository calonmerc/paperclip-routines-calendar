# Routines Calendar for Paperclip

A [Paperclip](https://github.com/paperclipai/paperclip) plugin that shows
routines (scheduled, recurring agent tasks) on a calendar, so you can see what
runs when across your whole company.

> **Status: early development (0.1.0, unpublished).**

## What it does

- Adds a **Routine calendar** page to each company (sidebar link under your
  company's navigation, at `/<company-prefix>/routine-calendar`).
- Shows when each routine's schedules will fire, in your browser's timezone,
  coloured by the assigned agent. Switch between a **month** grid, a **week**
  view and a **day** view. Week and day lay runs out by time of day, so
  clusters (everything firing at 1 AM) stand out; runs at the same time sit
  side by side. Click a day number or week-view heading to open that day.
- Click any entry to open that routine's page in Paperclip.
- Click an agent in the legend to hide or show its routines, or click
  "Won't run" to hide paused and disabled schedules. Hidden entries don't
  count towards a day's "+N more". The filter is remembered per company in
  your browser.
- Routines that won't actually run (paused or archived routine, or disabled
  schedule) are shown faded and hatched.
- Schedule times match Paperclip's own scheduler exactly, including its
  handling of daylight-saving changes (a skipped hour means no run; a repeated
  hour runs twice).
- Very frequent schedules collapse into one "N×" entry per day (in week and
  day views, only schedules that fire more than 24 times that day).
- Routines triggered only by webhook or API are listed below the calendar.
- On narrow screens the month and week are shown as a day-by-day agenda.
  The view you pick is remembered in your browser.

It only reads data; it never changes routines.

## Requirements

- Paperclip `2026.1001.0` or newer
- Node.js 24.11+ (same requirement as Paperclip itself)

## Install

### From npm (production)

In the Paperclip UI, go to the plugin settings and install the package by
name:

```
paperclip-routines-calendar
```

or use the CLI:

```bash
paperclipai plugin install paperclip-routines-calendar
```

> Not yet published to npm.

### From a local checkout (development)

Paperclip loads the built `dist/` output and never compiles plugin source.
`dist/` isn't committed to git, so a fresh clone must be built before it can be
installed. The npm package already includes `dist/`.

```bash
git clone https://github.com/calonmerc/paperclip-routines-calendar.git
cd paperclip-routines-calendar
pnpm install
pnpm build            # or keep `pnpm dev` running for watch mode
paperclipai plugin install .
paperclipai plugin inspect paperclip-routines-calendar
```

Local-path installs run trusted code from your machine. With `pnpm dev`
running, Paperclip picks up rebuilt output and restarts the plugin worker
automatically.

## Development

```bash
pnpm install
pnpm dev          # esbuild watch build into dist/
pnpm build        # one-off build
pnpm typecheck
pnpm test
```

For the full local loop (an isolated throwaway Paperclip instance, seed data,
and inspecting plugin health and logs), see [AGENTS.md](./AGENTS.md).

## License

MIT
