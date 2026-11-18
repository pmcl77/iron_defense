# Iron Defense: notes for Claude

Start every session with `HANDOFF.md` (state, setup, release steps), then `README.md` and `gameplay.md` (the spec and source of truth; keep it in sync with `src/data.js` / `src/world.js`).

## Working agreements
- **Issues first:** a new issue, bug or idea goes into `ISSUES.md` with options and a proposal (source, label). Build only when the user says so ("build", "go", "let's try …"). Done items go to `CHANGELOG.md`.
- **Discussion:** plain prose with a recommendation, then ask directly. No multiple-choice dialogs. Explain in what the player sees on the field first; code details only when asked.
- **Terms:** the glossary at the top of `gameplay.md` defines the core concepts (unit type UT, role RO, loadout LO, building the loadout BL, deployment DEP, personality, focus types, …). Use ad-hoc acronyms in brackets otherwise. **When unsure which concept the user means, ask.**
- **Unit codes:** SC Scout, GU Gunner, BW Brawler, MO Mortar, SE Seeker, AE Aegis, BE Breacher, LA Lancer; ".f" = fighting.
- **Numbers are 1-based** in discussion and stats (lanes 1–5, rows, stages, groups); levels count upgrades (0 = none). In battle events side 1 = player, 0 = enemy.
- **Originality:** Clash Royale and other games are inspiration only; never copy names, art, units or layouts.

## Branches and safety
- Work and commit on `dev`, push `dev` yourself (dev preview: https://dev.iron-defense.pages.dev). `main` = releases, only when the user agrees (steps in `HANDOFF.md`).
- The repo is public: never print or commit `secrets.env` (stats keys) or private keys.

## Checks
- `node tools/test.mjs` and `node tools/test_stats.mjs` must pass before a commit.
- Balance and analysis tools: see `README.md` (balance.mjs, matrix.mjs, profile.mjs, lifetime.mjs).
