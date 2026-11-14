# Changelog

All notable changes to Iron Defense. The newest version is at the top.

- **Unreleased:** what's on `dev`, playable at https://dev.iron-defense.pages.dev.
- **Released versions:** what's on `main`, live at https://iron-defense.pages.dev.

Version numbers are `MAJOR.MINOR.PATCH`, kept in `src/version.js` and shown in the game (menu and settings). Dev builds carry a `-dev` suffix.

## [Unreleased]: 0.3.0-dev

## [0.2.0]: 2026-11-14

### Gameplay
- **Lane reach:** a mech can only shoot at its own lane and the two lanes next to it. Seekers, turrets and bases still reach every lane, and the enemy base can be hit from any lane.
- **Mortar rework:** shells are slow (about 2.3 s at full range) and less accurate at long range, so they mostly hit units that stand still. Half damage against turrets and bases. Reload 2.6 → 3.2 s.
- **Friendly mechs no longer pass through each other:**
  - **Hold:** faster mechs queue behind slower ones (convoy).
  - **Advance:** they overtake through a free neighboring lane and then return to their own lane.
- **Capacitors** (Workshop) now also raises max energy permanently: +40 per level, on top of +50 starting energy.
- **New Workshop perk: Power Grid,** +1 energy per second per level (3 levels: 200 / 400 / 650 credits), permanent in every battle.

- **Deployment queue:** tapping a mech card without enough energy (or while it cools down) queues the order instead of refusing it.
  - up to 5 orders, each in the lane that was active when tapped
  - orders come out strictly in order; the whole queue waits for energy and card cooldowns
  - energy is paid on deploy, so cancelling is free
  - shown in a strip above the controls while something is queued: tap a mech to cancel it, CLEAR cancels all, Backspace removes the last; the front order shows its energy progress, and cards show ×2, ×3… when a type is queued more than once
  - queued mechs in the same lane don't spawn on top of each other

### Fixes
- **Overtaking in Advance no longer swings back** behind the unit being passed. The overtaking mech stays out until it's clearly past (or the other unit is far ahead), and it also stays out when it gets held up in the neighboring lane.
- **Overtaking changes one lane at a time:** mechs no longer jump across two lanes, through other mechs, on the way back to their own lane.
- **Overtaking runs at full speed** (half speed only when stepping around turrets). A mech doesn't start passing a unit that walks at almost the same speed.

### Sound
- **More weight ("oomph") in guns, cannons and explosions.** The old low end was a pitched tone sweeping down, which sounded like a toy drum. Now every layer is shaped noise:
  - a short hold at full strength, then soft clipping, so the bass also comes through on phone speakers
  - explosions have a crack, a blast, a deep body, a rolling rumble and falling debris; destroyed mechs add torn metal
  - the Mortar launch gets a hollow tube "tunk"
- **Outdoor echo:** a slapback echo off the terrain, on top of the reverb.
- **New: bullet impacts** make a dull thud on armor (sometimes with a little ring), and rail slugs a heavy clang.
- **Shots** have a longer, darker muzzle blast and a mid "bark"; the crack is quieter, so they no longer sound like a tick.
- **Metal sounds** (Brawler punch, slug hits, building, selling) are struck metal made from noise instead of pure tones, which rang like a bell or toy. A turret build now sounds like an impact wrench, a hiss and a final clank.
- Deploy steps use the new heavy thump. Missiles are unchanged.
- The master compressor lets attacks through, so shots sound sharper.

### UI
- **New minimap, easier to read:**
  - keeps the narrow strip
  - dark background, brighter team colors (a lighter orange-red for enemies), a black outline around every symbol
  - big symbols: mechs are triangles pointing the way they walk, turrets are small blocks, the Constructor is a yellow diamond
  - in a column of mechs, the one deployed first is drawn on top
  - turrets are narrow upright rectangles that fit one lane, so turrets next to each other stay separate

### Balance
- Stages 7–12: enemy income about 8% higher.
- Endless no longer jumps in difficulty. Wave 1 is about as hard as stage 12; enemy level, base HP, income and base upgrades then rise gradually.

### Other
- Hosting moved to Cloudflare Pages:
  - **Release** at iron-defense.pages.dev, built from `main`.
  - **Dev preview** at dev.iron-defense.pages.dev, built from `dev`.
- Dev builds show a "DEV" tag, install as "Iron Defense (dev)" and keep their own save.
- The version number is shown in the game.
- The help screen explains lane reach and convoy/overtake.
- Tests now cover every Workshop upgrade, lane reach, convoy/overtake, the Mortar and the deployment queue (68 tests).
- The balance bot tests three strategies: mixed, mass Mortar behind Brawlers, and split lanes.

## [0.1.0]: 2026-11-14

The first playable build.

- Top-down portrait battlefield: 5 lanes, player base at the bottom, enemy base at the top.
- 8 mechs:
  - Scout, Gunner, Brawler, Mortar, Aegis
  - new: Seeker (homing missiles), Breacher (wallbreaker), Lancer (wall attacker)
- Mechs turn their upper body to aim.
- 3 turrets on a 5 × 7 build grid. A Constructor drives out and builds queued orders (trip fee refunded on a safe return).
- Global Hold / Advance switch. In Advance, mechs step around turrets through gaps.
- Specials: Bombing, EMP, Energy Surge.
- In-battle upgrades. Workshop with Veteran Training and perks.
- 12 campaign stages, plus Endless mode. One new mech unlocked per stage, and a 5-mech loadout per battle.
- Enemy AI: picks lanes based on your defenses, and uses Hold / Advance too.
- Flat vector development art, portrait HUD, synthesized positional sound.
- Installable web app (PWA). It works offline.
