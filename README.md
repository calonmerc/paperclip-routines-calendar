# Routines Calendar for Paperclip

A [Paperclip](https://github.com/paperclipai/paperclip) plugin that shows
routines (scheduled, recurring agent tasks) on a calendar, so you can see what
runs when across your whole company.

> **Status: early development (0.1.0, unpublished).**

## What it does

- Adds a **Routine calendar** page to each company (sidebar link under your
  company's navigation, at `/<company-prefix>/routine-calendar`).
- Shows a month grid of when each routine's schedules will fire, in your
  browser's timezone, coloured by the assigned agent.
- Routines that won't actually run (paused or archived routine, or disabled
  schedule) are shown faded and hatched.
- Schedule times match Paperclip's own scheduler exactly, including its
  handling of daylight-saving changes (a skipped hour means no run; a repeated
  hour runs twice).
- Very frequent schedules collapse into one "N×" entry per day.
- Routines triggered only by webhook or API are listed below the calendar.
- On narrow screens the month is shown as a day-by-day agenda.

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
