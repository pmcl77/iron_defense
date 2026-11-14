# Changelog

All notable changes to Iron Defense. The newest version is at the top.

- **Unreleased:** what's on `dev`, playable at https://dev.iron-defense.pages.dev.
- **Released versions:** what's on `main`, live at https://iron-defense.pages.dev.

Version numbers are `MAJOR.MINOR.PATCH`, kept in `src/version.js` and shown in the game (menu and settings). Dev builds carry a `-dev` suffix.

## [Unreleased]: 0.2.0-dev

### Gameplay
- **Lane reach:** a mech can only shoot at its own lane and the two lanes next to it. Seekers, turrets and bases still reach every lane, and the enemy base can be hit from any lane.
- **Mortar rework:** shells are slow (about 2.3 s at full range) and less accurate at long range, so they mostly hit units that stand still. Half damage against turrets and bases. Reload 2.6 → 3.2 s.
- **Friendly mechs no longer pass through each other:**
  - **Hold:** faster mechs queue behind slower ones (convoy).
  - **Advance:** they overtake through a free neighboring lane and then return to their own lane.
- **Capacitors** (Workshop) now also raises max energy permanently: +40 per level, on top of +50 starting energy.

### UI
- **New minimap, easier to read:**
  - keeps the narrow strip
  - dark background, brighter team colors (a lighter orange-red for enemies), a black outline around every symbol
  - big symbols: mechs are triangles pointing the way they walk, turrets are squares, the Constructor is a yellow diamond

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
- Tests now cover every Workshop upgrade, lane reach, convoy/overtake and the Mortar (48 tests).
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
