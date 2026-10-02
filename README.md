# Routines Calendar for Paperclip

A [Paperclip](https://github.com/paperclipai/paperclip) plugin that shows
routines (scheduled, recurring agent tasks) on a calendar, so you can see what
runs when across your whole company.

> **Status: early development.** The package currently contains the plugin
> scaffold only. The calendar view isn't built yet. This README describes
> only what exists today.

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

Paperclip loads the built `dist/` output and never compiles plugin source, so
build first:

```bash
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
