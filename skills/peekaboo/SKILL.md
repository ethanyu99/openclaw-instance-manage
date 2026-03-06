---
name: peekaboo
description: Capture and automate macOS UI with the Peekaboo CLI.
homepage: https://peekaboo.boo
metadata: {"clawdbot":{"emoji":"👀","os":["darwin"],"requires":{"bins":["peekaboo"]},"install":[{"id":"brew","kind":"brew","formula":"steipete/tap/peekaboo","bins":["peekaboo"],"label":"Install Peekaboo (brew)"}]}}
---

# Peekaboo

Full macOS UI automation CLI: capture/inspect screens, target UI elements, drive input, and manage apps/windows/menus.

## Quickstart
```bash
peekaboo permissions
peekaboo list apps --json
peekaboo see --annotate --path /tmp/peekaboo-see.png
peekaboo click --on B1
peekaboo type "Hello" --return
```

## Core Commands
- `image`: capture screenshots (screen/window/menu bar)
- `see`: annotated UI maps with snapshot IDs
- `list`: apps, windows, screens, menubar, permissions
- `capture`: live capture or video ingest

## Interaction
- `click`: target by ID/query/coords with smart waits
- `type`: text + control keys (`--clear`, delays)
- `hotkey`: modifier combos like `cmd,shift,t`
- `drag`: drag & drop across elements/coords
- `scroll`: directional scrolling (targeted + smooth)

## See -> Click -> Type (most reliable flow)
```bash
peekaboo see --app Safari --annotate --path /tmp/see.png
peekaboo click --on B3 --app Safari
peekaboo type "user@example.com" --app Safari
peekaboo press tab --count 1 --app Safari
peekaboo type "password" --app Safari --return
```

## Notes
- Requires Screen Recording + Accessibility permissions
- Use `peekaboo see --annotate` to identify targets before clicking
- Prefer element IDs over raw coordinates for resilience
