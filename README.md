# Iron Defense

An original top-down lane-defense mech game for portrait phones and desktop, installable as an app (PWA).
Your base is at the bottom and the enemy base is at the top. Send mechs up 5 lanes, queue turrets that your Constructor builds, switch your army between **Hold** and **Advance**, and call in specials to destroy the enemy base first.

There's no build step and no dependencies: plain JavaScript ES modules and Canvas 2D.

## Run locally

```bash
python3 tools/serve.py        # http://localhost:8767
```

For phone testing, use the dev preview above. The local server only works on this computer: it runs inside the dev container, and the Mac blocks incoming connections from other devices.

## Play online

| | Address | Built from |
|---|---|---|
| Release | https://iron-defense.pages.dev | `main` |
| Dev preview | https://dev.iron-defense.pages.dev (marked "DEV", separate save) | `dev` |

Both are hosted on Cloudflare Pages, which deploys automatically on every push. On Android, open the address in Chrome and choose ⋮ → Add to Home screen to install it. You can install the release and the dev preview side by side.

## Changes

[CHANGELOG.md](CHANGELOG.md) lists every version and what changed. Its "Unreleased" section is what's on the dev preview.

## Gameplay

[gameplay.md](gameplay.md) is the full specification and the source of truth: rules, stats, stages, progression, art and sound direction.

## Code layout

| File | Purpose |
|---|---|
| `src/data.js` | All stats, upgrade curves, stages, unlocks and perks (tune balance here) |
| `src/world.js` | Simulation: lanes, movement and blocking, Hold/Advance, sidestepping, targeting, projectiles, the Constructor, specials, enemy AI. No DOM, so it also runs in Node |
| `src/render.js` | All drawing (flat vector development art), particles, minimap, card icons |
| `src/main.js` | Game loop, HUD, screens, touch/mouse/keyboard input |
| `src/audio.js` | Synthesized sound effects (WebAudio, positional, with reverb) |
| `src/save.js` | Progress in localStorage (`iron-defense-save-v1`) |
| `art_samples/` | Art-style studies. `fine.js` is the start of the final voxel renderer (sample 7) |

The simulation never draws. It emits `fx` events that `render.js` turns into particles and sound, so the art style can be replaced by swapping `render.js`.

## Tools

```bash
node tools/test.mjs            # headless rule tests
node tools/balance.mjs [runs] [stages…]   # bot plays the campaign and reports win rates
node tools/shots.cjs <outdir>  # headless browser smoke test with screenshots (needs Playwright)
node tools/make_icons.cjs      # render icons/icon.svg to PNG
```

In the browser console: `__game` (state), `__step(seconds)` (advance the simulation), `__save()`.
