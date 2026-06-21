# calcaas-sync

Push your **real** AI-tool token usage to your [Calcaas](https://calcaas.com) dashboard.

`calcaas-sync` is a tiny, privacy-preserving wrapper around
[**ccusage**](https://github.com/ccusage/ccusage). It runs ccusage locally, reads the
**numeric** daily token aggregates it produces, and uploads them to your Calcaas account so
you get a cloud dashboard of your usage **per tool, per model, per device, over time**.

> **Privacy:** only numeric aggregates leave your machine — date, model name, token counts,
> and ccusage's cost estimate. **No prompt or response content is ever read or transmitted.**

## Prerequisites

- **Node.js 20+** (ccusage's floor).
- A coding-agent CLI that ccusage understands has been used on this machine —
  **Claude Code**, **Codex**, **Gemini CLI**, **GitHub Copilot CLI**, **OpenCode**, and more.
  calcaas-sync auto-detects whichever ones you use and tags each row by tool.
- A **Calcaas device key** — generate one in the Calcaas app under **Usage Analytics →
  Connect a device** (it looks like `cal_live_…`). The key is shown once; copy it then.

`ccusage` is bundled as a dependency, so you install **one** thing and never touch ccusage
directly.

## Install

```bash
npm install -g github:arcezio/calcaas-sync
```

> Installs straight from GitHub using the prebuilt `dist/` — no build step, toolchain,
> or npm account needed. Once published to the npm registry, `npm install -g calcaas-sync`
> will also work.

## Usage

### 1. Log in (once per computer)

```bash
calcaas-sync login --key cal_live_xxxxxxxx --device "work-laptop"
```

Run with no flags to be prompted interactively. The device label is how this machine appears
in the dashboard's **By device** breakdown — give each computer a distinct one.

Config is written to `~/.calcaas/config.json` (mode `600`):

```json
{
  "apiKey": "cal_live_…",
  "endpoint": "https://…supabase.co/functions/v1/usage-ingest",
  "deviceLabel": "work-laptop",
  "intervalMinutes": 60
}
```

### 2. Sync

One-off push (great for cron):

```bash
calcaas-sync push                 # sync everything ccusage knows about
calcaas-sync push --since 2026-06-01
```

Keep it updated with a long-running watcher (default: hourly):

```bash
calcaas-sync watch                # push now, then every 60 min
calcaas-sync watch --interval 30
```

Re-syncing is **idempotent** — the server upserts on
`(tool, model, date, device)`, so running `push`/`watch` repeatedly never creates duplicates.

### 3. Auto-start at login (recommended)

Run the syncer automatically in the background — no terminal window, survives reboots:

```bash
calcaas-sync enable      # register autostart + start the hidden watcher now
calcaas-sync status      # show config + whether autostart is on
calcaas-sync disable     # turn it back off
```

On **Windows**, `enable` drops a tiny launcher in your Startup folder
(`…\Start Menu\Programs\Startup\calcaas-sync.vbs`) that starts `calcaas-sync watch`
**hidden** (no console window) at every login, and also starts it immediately so you don't
have to wait for the next reboot. It keeps syncing hourly in the background.

Because there's no visible window, output is written to a log file you can tail anytime:

```
~/.calcaas/calcaas-sync.log
```

> `enable` requires you to have run `login` first. To stop it, run `calcaas-sync disable`
> (removes the autostart entry; a watcher already running keeps going until the next reboot
> or until you end the `node` process).

## Running `watch` as a background service (other platforms / manual setups)

`calcaas-sync enable` is Windows-only. On Linux/macOS, or if you'd rather wire it up yourself:

**Linux/macOS (pm2):**

```bash
npm install -g pm2
pm2 start calcaas-sync --name calcaas -- watch
pm2 save && pm2 startup
```

**Linux/macOS (nohup):**

```bash
nohup calcaas-sync watch > ~/.calcaas/sync.log 2>&1 &
```

**macOS (launchd):** create `~/Library/LaunchAgents/com.calcaas.sync.plist` with a
`ProgramArguments` of `[ "calcaas-sync", "watch" ]` and `RunAtLoad = true`, then
`launchctl load` it.

**Windows (Task Scheduler, manual alternative to `enable`):** create a Basic Task, trigger
**At log on**, action **Start a program** → `calcaas-sync` with argument `watch`. (Prefer
`calcaas-sync enable` — it runs hidden with no console window; a raw Task Scheduler action
flashes one.)

For cron-style setups, schedule `calcaas-sync push` instead (e.g. hourly) and skip `watch`.

## Multiple computers

Install and `login` on each machine with a **distinct `--device` label**. Every row is tagged
with its device, so the dashboard breaks usage down per machine.

## Configuration / flags

| Flag | Commands | Default | Notes |
|---|---|---|---|
| `--key` | `login` | — | Your `cal_live_…` device key |
| `--device` | `login` | hostname | Label for this machine |
| `--endpoint` | `login` | Calcaas ingest URL | Override only for self-hosting |
| `--interval` | `login`, `watch` | `60` | Minutes between syncs in `watch` |
| `--since` | `push`, `watch` | — | `YYYY-MM-DD` lower bound |

## How it works

```
agent CLIs' local logs ──▶ ccusage <tool> daily --json ──▶ normalize ──▶ POST /usage-ingest ──▶ Calcaas
   (your machine)              (bundled, local)           (numeric only)   (Bearer cal_live_…)   (dashboard)
```

`calcaas-sync` runs the bundled ccusage to detect which agent CLIs have data, then pulls each
tool's `<tool> daily --json` separately, maps every `(tool × date × model)` entry to the
Calcaas wire contract, and POSTs batched aggregates with your key in the `Authorization` header.

## Development

```bash
npm install
npm run dev -- push      # run from source via tsx
npm test                 # vitest (normalizer unit tests)
npm run build            # tsc → dist/
```

## License

MIT
