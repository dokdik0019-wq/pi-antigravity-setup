# pi-antigravity-setup

Pi extensions and diagnostics for [Pi coding agent](https://github.com/earendil-works/pi) + Antigravity (Google AI Pro).

## Install

```bash
pi install npm:pi-antigravity
/login antigravity

git clone https://github.com/dokdik0019-wq/pi-antigravity-setup
cp pi-antigravity-setup/extensions/*.ts ~/.pi/agent/extensions/
cp pi-antigravity-setup/agents/*.md ~/.pi/agent/agents/
```

Reload Pi (or restart). No build step.

## Commands

| Command | Effect |
|---|---|
| `/agbar` | Toggle the quota bottom bar |
| `/agbar refresh` | Force-refresh quota data |
| `/toks` | Toggle the tok/s meter |

## Contents

| Path | Description |
|---|---|
| `extensions/antigravity-usage-bar.ts` | Bottom bar with Antigravity quota per pool (Gemini / Claude+GPT × 5h / weekly) and reset time |
| `extensions/tok-per-sec.ts` | Live tok/s on the working line |
| `agents/*.md` | `svg-maker` / `mermaid-maker` subagents for [pi-subagents](https://github.com/earendil-works/pi-subagents) |
| `scripts/diagnose-antigravity.mjs` | Raw account diagnostics (tier / quota / 403) |
| `docs/troubleshooting-antigravity-403.md` | Fix for the `VALIDATION_REQUIRED` 403 |
| `docs/learn-adaptation.md` | Notes on adapting the `learn` repo |
| `docs/todo.md` | Backlog |

> `agents/*.md` contain machine-specific `subagentOnlyExtensions` paths — edit before use.

## Credits

- Tutoring/visualize adapted from [amosblomqvist/learn](https://github.com/amosblomqvist/learn) (MIT)
- Extension inspiration from [amosblomqvist/pi-config](https://github.com/amosblomqvist/pi-config)
- Provider: [pi-antigravity](https://github.com/Rahularya01/pi-antigravity) (unofficial, not affiliated with Google)
