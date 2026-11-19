# Iron Defense: session handoff

To pick this project up in a new session: "Read HANDOFF.md, README.md and gameplay.md, then continue."

**Issue list:** `ISSUES.md` holds open bugs, play-test feedback and the agreed backlog. **Agreed workflow:** when the user mentions a new issue or feature, first add it to `ISSUES.md` with options and a proposal. **Don't build it** until the user decides (they collect findings while play-testing and set priorities later). When an item is fixed, move it to `CHANGELOG.md`.

Last updated: 2026-11-14, after the first playable build (see `git log`).

## What this is
- An original top-down, portrait, 5-lane mech defense game. It runs in the browser and installs as a PWA.
- Target devices: Samsung Galaxy S25+ (portrait) and desktop (centered portrait column).
- A sister game to Ironline (`../mech_defense/`), but a **completely separate project**: its own code, save key and repo. The code was written fresh, following Ironline's structure (simulation separate from rendering).
- Originality: the screenshots in `samples/` (an old iOS mech-defense game and Ebbtide) are **mood references only**. Never copy names, art, unit designs or layouts.
  - `samples/` is deliberately excluded from git, because the repo may go public.

## How the user likes to work
- They review the spec and design before anything is built. They asked for art samples before coding.
- They prefer design questions explained in plain text with a recommendation, then asked directly in the reply. They rejected multiple-choice question dialogs.
- They often answer with their own ideas, for example the global Hold/Advance switch and the three new mechs. Record those ideas in `gameplay.md`.
- `gameplay.md` is the source of truth. Keep it in sync whenever rules or numbers in `src/data.js` / `src/world.js` change.

## Decisions (details in gameplay.md §14 "Resolved")
1. **Field:** 5 lanes, 600 × 2400. 5 × 7 build cells per side; turrets block their cell.
2. **Deploying:** pick the active lane with the HUD lane buttons (L1–L5), then tap a mech card.
3. **Constructor:** builds queued turrets. Orders are paid when placed and refunded in full if cancelled. The trip fee is 20, refunded on a safe return.
4. **Engagement:** a global Hold/Advance switch per side (default Hold).
   - In Advance, mechs sidestep around turrets; Mortar and Lancer still pause 0.4 s to fire.
   - The AI uses the switch too.
   - *Future idea, not for the first versions:* a separate switch per mech type.
5. **Aiming:** mechs turn their upper body to aim at any angle and prefer targets ahead. Turrets fire in all directions.
6. **Roster:** Ironline's 5 mechs plus Seeker (homing missiles), Breacher (wallbreaker) and Lancer (wall attacker), and 3 turrets.
   - Players bring a loadout of 5 mechs per battle. *The user may want to raise this to all 8 later.*
7. **Unlocks:** one new mech type per stage; the full arsenal after 6 stages.
8. **Art:**
   - **Final style:** sample 7, medium voxel (3 px voxels) with an angled oblique view.
   - **During development:** flat vector (sample 4), which is what `src/render.js` draws now.
   - The user disliked the low-res angled pixel art (samples 1 and 2) and liked the painted style (sample 3), but picked sample 7.
9. **Sound:** the user disliked Ironline's toy-like sounds and wants it "a tad more realistic". `src/audio.js` is new layered, positional synthesis. If that's still not enough, the fallback is CC0 samples (not decided).
10. **Repo:** https://github.com/pmcl77/iron_defense (public).
11. **Hosting (Cloudflare Pages, project `iron-defense`):** the release is at https://iron-defense.pages.dev, built from `main`. The dev preview is at https://dev.iron-defense.pages.dev, built from `dev`. Both deploy automatically on every push. There's no build step: the output directory is the repo root.
    - Dev builds (a `dev.` host, localhost or a LAN address) show a "DEV" tag, use `manifest-dev.webmanifest` ("Iron Defense (dev)"), and have their own save, because the save is tied to the web address.
    - The old GitHub Pages site (pmcl77.github.io/iron_defense) should be **unpublished** by the user (repo Settings → Pages). Check whether that's done.
12. **Branches:** `main` is the released, stable version. `dev` is for everyday work. See "Git workflow" below.

## Round 2 changes (after the user's first play-test, 2026-11-14)
- **The user's feedback:**
  - Stages 1–12 were easy with massed Mortars plus a few Brawlers.
  - Endless 1 was always lost.
  - Deploying in the middle lane covered every lane.
  - Fast mechs ran straight through slower friendly ones.
  - Max energy looked stuck at 300 (Capacitors only gave starting energy).
- **What was done:**
  - Lane reach: own lane ± 1.
  - Mortar: slow, inaccurate shells, half damage to structures, reload 3.2.
  - Friendly collision: convoy in Hold, overtake-and-return in Advance.
  - Stages 7–12: +8% enemy income.
  - Endless: a smooth ramp.
  - Capacitors: +40 max energy per level.
  - The balance bot now tests three strategies.
  - 48 tests.
- **Next round, already agreed:**
  - **Sapper**, a mine-laying mech. The design is in gameplay.md §5.4; build it, then decide stats and unlock stage with the user.
  - **Later:** an enemy AI that counters your army composition.
- The user wants to play-test the lane rule to see whether lanes 2 + 4 become the only setup.

## Status
- **First playable build plus round 2:** everything in the spec is implemented except the Sapper.
  - `node tools/test.mjs`: 55/55 pass.
  - Headless browser run (`tools/shots.cjs`): no console errors.
  - **Not yet played by hand or on the real phone.**
- **Balance:** a bot-tuned first draft. Stage table and bot results are in gameplay.md §11.
  - The Workshop was removed in 0.7.0-dev.1; the stages are not re-tuned for that yet (before: without upgrades the bot won stages 1–3, with mid-level upgrades stages 1–8). The bot tools now run without Workshop variants.
  - Many bot losses are stalemates against turret walls (the 600 s cap in the bot). Watch whether battles drag for a human player.
- **Not done yet:** mech footstep and servo sounds, a stage 1 tutorial, the voxel renderer, GitHub/Pages, real-device testing.

## Files
| Path | What's in it |
|---|---|
| `gameplay.md` | Full spec (§1–14). §13c lists the exact implementation values |
| `src/data.js` | All numbers: field, units, specials, unlocks, STAGES |
| `src/world.js` | Simulation. Key parts: `move`/`trySidestep`, `pickTarget`, `fire`/`updateProjectiles`, `updateConstructor`, `updateAI`/`aiLane`. Emits `fx` events |
| `src/render.js` | Flat vector renderer: unit shapes (`LEGS`/`TOPS`), turrets, base, particles, minimap, `renderIcon` |
| `src/main.js` | Loop, HUD, screens (menu, stages, loadout, help, settings, pause, upgrades, result), input, debug hooks |
| `src/audio.js` | Synthesized sound bus (pan, distance, reverb, compressor) |
| `src/save.js` | localStorage key `iron-defense-save-v1` |
| `art_samples/` | Art studies. `sample.html?style=1…7`, renders saved as `style-N.png`, comparisons `comparison.png` and `comparison-2.png`. `fine.js` (ray-traced voxels, primitive-based models) is the start of the final renderer |
| `tools/` | `serve.py`, `test.mjs`, `balance.mjs` (bot), `matrix.mjs` (bot strategy matrix), `profile.mjs` (strategy profile of a battle), `replay.mjs` (re-run a real battle from its stats), `notes.mjs` (play-test notes with their battle), `lifetime.mjs`, `focus.mjs` (enemy focus types), `synth_howitzer.mjs`, `shots.cjs`, `sound.cjs`, `make_icons.cjs`, `bake_voxel.cjs` + `voxel/` (voxel models and bake code) |
| `assets/voxel/` | Baked voxel sprite sheets, ground tiles and `meta.json` (generated, committed) |
| `src/render_voxel.js` | Voxel renderer: extends the flat `Renderer`, draws the baked sheets in the angled view |

## Git workflow
- **Work on `dev`.** Commit there and never commit straight to `main`.
- **Play-testing:** the user pushes `dev` and plays it at https://dev.iron-defense.pages.dev (about 1 minute after the push).
- **Changelog:** every user-visible change goes into `CHANGELOG.md` under "Unreleased" when it's committed on `dev`.
- **Version:** `src/version.js` holds the version shown in the game (menu and settings) and recorded in every battle's stats. On `dev` it carries a `-dev.N` suffix: a build number, e.g. `0.5.0-dev.3`.
- **Dev build number (decided 2026-11-17):** bump `N` with every push to `dev` that changes the game (code under `src/`, `index.html`, `style.css`, assets); pushes of docs or ISSUES.md alone don't count. It lets the user check they're playing the latest build and refer to it ("on dev.3 …"). Note the build number on the changelog entry. The third number (PATCH) is only for bug-fix releases on `main` (e.g. `0.4.1`), never for dev builds.
- **Release steps:**
  1. On `dev`, rename "Unreleased" in CHANGELOG.md to `[X.Y.Z]: <date>`, set `src/version.js` to `X.Y.Z` and commit.
  2. Merge into `main` and tag `vX.Y.Z`.
  3. Back on `dev`, add a new "Unreleased" section and set the version to the next `-dev.0` (e.g. `0.6.0-dev.0`); the first game change after it is `-dev.1`.
  4. Push `main`, `dev` and the tags (`git push origin main dev --tags`).
- **Releasing:** when a build is tested and good, and the user agrees, merge `dev` into `main` (`git switch main && git merge --ff-only dev`, falling back to a normal merge), optionally tag it (`v0.2`, …), then switch back to `dev`. https://iron-defense.pages.dev updates about 1 minute after `main` is pushed.
- **Pushing (since 2026-11-14):** I push myself over SSH with a **repo-scoped deploy key**, which has write access to `pmcl77/iron_defense` only.
  - The key is `~/.ssh/iron_defense_deploy` in the container, with the host alias `github-iron-defense` in `~/.ssh/config`. The remote is `git@github-iron-defense:pmcl77/iron_defense.git`.
  - Push `dev` as part of normal work. Push `main` only for a release the user has agreed to. Use `git push origin <branch> --tags` when tags change.
  - **After a container rebuild** the key is gone:
    1. Generate a new one: `ssh-keygen -t ed25519 -N "" -f ~/.ssh/iron_defense_deploy`.
    2. Recreate the `~/.ssh/config` entry. Add github.com's ED25519 host key to known_hosts and check its fingerprint (`SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU`).
    3. The user adds the new public key under repo Settings → Deploy keys (with write access) and deletes the old one.
  - The user decided **not** to keep the private key in the project folder (the repo is public).
  - Fallback if the key isn't set up: the user pushes from VS Code (Source Control → Sync/Push). HTTPS pushes from the container terminal fail.
- **Checking a deploy:** `curl -s -o /dev/null -w "%{http_code}" https://dev.iron-defense.pages.dev/` (or the release address), then load it headless, as in `tools/shots.cjs`.
- **Local server:** `python3 tools/serve.py` only works on the computer itself.
  - The container's port isn't reachable from the network.
  - Even when started from the Mac's own terminal, the phone couldn't connect. Ping worked and the macOS firewall is off, so something on the Mac drops incoming TCP. It was left unsolved; the dev preview replaces it.
- **Screenshots from the user:** they drop them into `tmp_files/` or `screens/` (both gitignored), and I read them from there.
- **Commits:** end messages with the `Co-Authored-By` line. Commit and push only when the user asks or it's part of an agreed task.

## Commands
```bash
python3 tools/serve.py                      # http://localhost:8767 (preview config "iron-defense" in .claude/launch.json)
node tools/test.mjs                         # rule tests
node tools/balance.mjs [runs] [stage…]      # bot balance report
node tools/matrix.mjs [seeds] [stage…]      # bot strategy matrix (does the strategy change the kind of game?)
node tools/profile.mjs <stats.json> [row]   # strategy profile of real battles
node tools/replay.mjs <stats.json> <row> [--at m:ss]   # exact replay; checks itself against the recorded timeline and events
node tools/shots.cjs <outdir>               # headless phone + desktop smoke test with screenshots
node tools/sound.cjs [moduleUrl] [prefix]   # render every sound to WAV (tmp_files/sound/) + level/band report; needs serve.py
node tools/bake_voxel.cjs [part …]          # re-bake voxel sprites/ground into assets/voxel/ (~15 s); parts: mech types, sentry, howitzer, arc, constructor, base, ground
node art_samples/shoot.cjs [styles…]        # re-render art samples
```
- Playwright is installed globally. Scripts load it from `/usr/local/share/npm-global/lib/node_modules/playwright`, and its browsers live in `/ms-playwright`.
- Node 22 is available. There's no npm project; `package.json` only sets `"type": "module"`.
- Seed a save in the browser: `localStorage.setItem('iron-defense-save-v1', JSON.stringify({cleared: 6}))`, then reload.
- Browser console: `__game`, `__step(seconds)`, `__save()`.

## Gotchas
- `constructor` is a built-in property of every JavaScript object, so the Constructor's level key is `builder`. The entity kind is still `'constructor'`.
- `World.canDeploy` only allows mechs in `world.unlocked.mechs`, which in a battle is the 5-mech loadout.
- Service worker: when adding files, update `SHELL` in `sw.js` and bump `CACHE`. It registers only on HTTPS.
- Shadows and the ground image in `render.js` are cached per resize and stage. Call `renderer.resize(...)` after layout changes (`main.js` `resize()` does this).

## Next steps (suggested)
0. Check the branch with `git status -sb`: it should be `dev`. If `origin/dev` doesn't exist yet, ask the user to push `dev` from VS Code.
1. Ask the user how the first build plays on the S25+: open https://pmcl77.github.io/iron_defense/ in Chrome, then "Add to Home screen".
2. Play-test findings: touch target sizes, readability, difficulty curve, whether battles stall at turret walls, sound realism.
3. Tune `STAGES` and the new mech stats. Keep gameplay.md §11 and §13c in sync.
4. Add footstep and servo sounds and a stage 1 tutorial overlay.
5. Later: the voxel renderer. Bake sprite sheets (16 facings, a few walk frames, a separate shadow layer) from `art_samples/fine.js` at 3 px voxels, and pre-render the ground once.
