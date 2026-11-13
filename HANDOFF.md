# Iron Defense: session handoff

To pick this project up in a new session: "Read HANDOFF.md, README.md and gameplay.md, then continue."

## Background
- A sister game to Ironline (`../mech_defense/`), but a **completely separate project** with its own code and save. Code was written fresh, following Ironline's structure (simulation separate from rendering).
- Original game. The reference screenshots in `samples/` (an old iOS mech-defense game and Ebbtide) are mood references only. Never copy names, art or layouts.
- Target devices: Samsung Galaxy S25+ (portrait) and desktop (centered portrait column).

## Decisions so far (details in gameplay.md §14)
- 5 lanes on a 600 × 2400 field; 5 × 7 build cells per side; turrets block their cell.
- Constructor builds queued turrets; trip fee 20, refunded on safe return.
- Global Hold / Advance switch per side. In Advance, mechs sidestep around turrets; shells and slugs still pause to fire. The AI uses the switch too. (Future, not soon: a switch per mech type.)
- Mechs turn their upper body to aim at any angle and prefer targets ahead.
- 8 mechs (Scout, Gunner, Brawler, Mortar, Aegis, Seeker, Breacher, Lancer) and 3 turrets. Loadout of 5 per battle; might grow to all 8 later.
- Unlocks: one new mech type per stage; full arsenal after 6 stages.
- Art: **final style = sample 7** (medium voxel, angled oblique, ray-traced and then pre-rendered into sprite sheets). **Development style = flat vector (sample 4)**, which is what `src/render.js` draws now.
- Sound: the user disliked Ironline's toy-like sounds. `src/audio.js` is a new layered, positional synthesis. If it's still not realistic enough, the fallback is CC0 samples.

## Status (first playable build)
- Everything from the spec is implemented, with 32/32 rule tests passing and no console errors in the headless browser run.
- Balance is a bot-tuned first draft (see gameplay.md §11, "Balance status").
- Not yet done:
  - mech footstep sounds
  - the voxel renderer
  - a tutorial
  - GitHub repo and Pages hosting
  - testing on the real phone

## Testing
- `node tools/test.mjs` and `node tools/balance.mjs`.
- `node tools/shots.cjs <dir>` runs a headless browser (phone and desktop) and saves screenshots.
- Seed a save: `localStorage.setItem('iron-defense-save-v1', JSON.stringify({cleared: 6, credits: 1200}))`, then reload.
- Watch out for the name `constructor`: it is a built-in property of every JavaScript object, so the Constructor's tech/level key is `builder`.

## Next steps (suggested)
1. Create a GitHub repo and enable Pages, then play-test on the S25+: touch sizes, readability, difficulty, sound.
2. Tune stages, and the new mech stats, from that play-testing.
3. Add footstep and servo sounds, and a stage 1 tutorial.
4. Start the voxel renderer: bake sprite sheets from `art_samples/fine.js` models.
