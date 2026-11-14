# Iron Defense: gameplay specification

Iron Defense is an original real-time defense game seen from above. Your base is at the bottom of the battlefield and the enemy (CPU/AI) base is at the top. Both sides send mechs up and down several parallel lanes and build turret walls. You win by destroying the enemy base before it destroys yours.

It's a sister game to **Ironline** (`../mech_defense/`). The economy, units, upgrades, specials, rewards and progression carry over from Ironline's `GAMEPLAY.md`. This file is the source of truth for Iron Defense. Section 1 lists what's different.

> **Originality:** the genre and the pull toward classic iOS mech-defense games are the inspiration. Iron Defense uses its own name, units, art and stages. Don't copy names, artwork, unit designs or stage layouts from any existing game. The screenshots in `samples/` are mood references only.

Numbers marked *(tune)* are starting values carried over from Ironline or picked as a first guess. They're expected to change once the game is playable.

## 1. Differences from Ironline

| Topic | Ironline | Iron Defense |
|---|---|---|
| View | Side view, landscape | Top view, portrait. Player base at the bottom, enemy base at the top |
| Battlefield | One lane | **5 parallel lanes** |
| Turret placement | 6 fixed slots | A grid of build cells in your half of the field |
| Building turrets | Instant | A **Constructor** mech drives out and builds queued turrets |
| Blocking | Every enemy blocks | Turrets block their lane cell; in Advance mode mechs steer around them through gaps |
| Engagement | Mechs always stop to fire | Global **Hold / Advance** toggle per side (§5.5) |
| Mech roster | 5 mechs | 8 mechs (adds Seeker, Breacher, Lancer); pick a loadout of 5 before battle |
| Specials | Airstrike, EMP, Repair | Bombing, EMP, **Energy Surge** |
| Enemy base | Fixed stats, gun scales with stage level | **Fixed set of base upgrades per stage** |
| Art | Procedural vector, side view | Angled top-down "3D pixel art", realistic military look (§13) |

## 2. Overview and core loop

Each stage is a rectangular battlefield with the two bases on opposite short edges. Some enemy turrets are already placed. Both sides spend energy on mechs and turrets, and the enemy is trying to destroy your base just as you are trying to destroy theirs.

- **Win:** destroy the enemy base.
- **Lose:** your base is destroyed.

The loop is the same as Ironline's:
1. Pick a stage.
2. Fight by spending energy on mechs, turrets and upgrades, and use specials.
3. Earn credits, stars and unlocks.
4. Spend credits on permanent Workshop upgrades.
5. Move on to the next, harder stage.

## 3. The battlefield

| Property | Value |
|---|---|
| Size | 600 wide × 2400 long world units *(tune)* |
| Lanes | 5, each 120 wide, running from bottom to top |
| Player base | Spans the bottom edge, front face at y = 100 |
| Enemy base | Spans the top edge, front face at y = 2300 |
| Player build zone | 5 lanes × 7 rows of build cells, each 120 × 100. Row centers at world y = 270, 370, … 870 (170–770 units in front of the base face) *(tune)* |
| Enemy build zone | Mirror of the player's: 5 lanes × 7 rows; row 0 is nearest the enemy base (world y = 2130 … 1530) |
| Enemy turrets | Fixed per stage, given as (lane, row) on the enemy build zone |

- The field is taller than the screen. The camera pans vertically only, and the full width is always visible.
- "Forward" means toward the enemy base: up for you, down for the enemy.
- Both bases are as wide as the field, so a mech can attack the enemy base from any lane.

## 4. Energy

The rules are the same as Ironline:

| Property | Value |
|---|---|
| Starting energy | 100, +50 per Capacitors perk level |
| Regeneration | 8 per second, +2 per Reactor upgrade |
| Energy cap | 300, +40 per Capacitors perk level (permanent, Workshop), +60 per Reactor upgrade (in battle) |
| Kill bounty | 25% of the destroyed unit's cost |
| Turret sell refund | 25% (nearly dead) to 50% (full HP) of build cost |

Energy pays for mechs, turrets, Constructor trips (§6.2), unit upgrades and base upgrades.

## 5. Mechs

Mechs are mobile units. Each one attacks the first enemy it comes across, and that can be the enemy base.

### 5.1 Deploying

- One lane is **active**. It's shown by a highlight on the field and on a strip of **5 lane buttons in the HUD**, just above the cards. It starts on the middle lane. (The buttons are needed because your base is off screen once you scroll forward.)
- Tapping a mech card deploys that mech at your base, into the active lane.
- Each card has a short cooldown after use, as in Ironline.
- **Loadout:** you have up to 8 mech types, but the HUD holds 5 mech cards. Before each battle you pick a loadout of 5 unlocked mechs, which keeps hotkeys 1–5. The last loadout is remembered. *(Might later grow to allow all 8 mechs.)*

### 5.2 Movement and lanes

- A mech walks forward in its lane. When and where it stops depends on the engagement mode (§5.5).
- **Turrets block their lane cell.** In **Advance** mode, when a mech reaches an enemy turret it checks the two neighboring lanes (±1) at that row. If one is free, it moves over diagonally (about 0.5 s) and keeps walking. If both are free, it picks the one with fewer enemies nearby, then breaks ties randomly. If neither is free, it stays and attacks the turret. In **Hold** mode a mech fights the turret from range instead of steering around it.
- A complete **turret wall** with no free cell in the row stops every mech until a turret in the wall is destroyed.
- **Opposing** mechs in the same lane block each other, as in Ironline.
- **Friendly mechs in the same lane don't pass through each other.** A mech keeps a small gap (4 units) behind the friendly mech in front of it. What happens next depends on the engagement mode (§5.5):
  - **Hold = convoy:** faster mechs stay behind slower ones, so the column moves at the pace of its slowest mech. Heavy mechs in front naturally shield the ranged ones behind.
  - **Advance = overtake:** a faster mech that's held up steps into a free neighboring lane, passes, and returns to its own (home) lane once that's clear again. A lane counts as free when there's no enemy turret just ahead in it and no mech right beside the overtaker. If neither neighbor is free, it waits behind.
- Mechs change lanes only to get around enemy turrets (permanent: they stay in the new lane) or to overtake (temporary: they return to their home lane). The Constructor doesn't block and isn't blocked by friendly mechs.
- Each mech gets a small cosmetic sideways offset (±20) inside its lane.

### 5.3 Targeting

- A mech targets the **nearest enemy within range that's ahead of it or level with it**. Range is a straight-line (circle) distance measured to the target's edge.
- **Lane reach:** a mech can only target enemies in **its own lane and the two lanes next to it**. A mech in lane 3 covers lanes 2–4; a mech in lane 1 covers lanes 1–2. Exceptions: the enemy **base** spans every lane and is always reachable; **Seeker** missiles reach any lane; **turrets and bases** fire into any lane. Splash and zap chains still hit anything in their radius.
- **Mechs turn to aim.** The upper body (torso and weapons) rotates toward the target at any angle, while the legs keep walking along the lane. Torso turn rate is about 360°/s *(tune)*, and a mech fires only once it's aimed within 10°.
- **Ahead first:** a mech picks a target ahead of it or level with it whenever one is in range. It turns to shoot at targets behind it only when nothing ahead is in range. In Hold mode it also stops for those.
- **Turrets and bases fire in every direction.** Otherwise any mech that got past a turret would be safe from it.
- Some mechs have a target preference (the Lancer prefers turrets and bases, the Seeker prefers mechs). They take the nearest preferred target in range, or the nearest target of any kind if none is preferred.

### 5.4 Mech roster

The first five are copied from Ironline; the last three are new *(tune)*:

| Mech | Cost | HP | Damage | Reload (s) | Range | Speed | Card cooldown | Attack |
|---|---|---|---|---|---|---|---|---|
| Scout | 40 | 90 | 8 | 0.35 | 150 | 95 | 1.2 s | Bullet |
| Gunner | 80 | 230 | 18 | 0.6 | 260 | 55 | 2 s | Bullet |
| Brawler | 140 | 700 | 48 | 1.0 | 60 | 40 | 3.5 s | Melee |
| Mortar | 170 | 180 | 60 (×0.5 vs turrets and bases) | 3.2 | 520 | 35 | 4.5 s | Slow shell, splash 70 |
| Aegis | 120 | 340 | 6 | 0.8 | 180 | 45 | 4 s | Bullet, 40% damage-reduction field within 140 |
| **Seeker** | 150 | 260 | 2 × 35 | 2.4 | 380 | 50 | 4 s | Missile salvo, splash 30, prefers mechs |
| **Breacher** | 190 | 950 | 30 (×4 vs turrets and bases) | 1.2 | 60 | 38 | 5 s | Melee; each hit stuns a turret for 0.3 s |
| **Lancer** | 200 | 300 | 30 (×3 vs turrets and bases) | 2.5 | 460 | 40 | 5 s | Siege slug, prefers turrets and bases |

The three new mechs fill roles a lane game needs *(tune)*:
- **Seeker** (homing missiles): fires a salvo of 2 missiles that curve onto their target in any lane and explode with a small splash. It gives burst damage against mechs and punishes groups bunched in a gap.
- **Breacher** (wallbreaker): an armored demolition mech that walks up to a wall and tears it down. It's weak against mechs but deals ×4 damage to turrets and bases, and its hits briefly stun the turret it's hitting.
- **Lancer** (wall attacker): a fragile long-range siege gun that outranges every turret. It picks turrets and bases over mechs and deals ×3 damage to them. It needs escorts against mechs.

**Mortar** (long-range splash, rebalanced after play-testing): its shells are slow (flight time 1.0 s + distance/400, about 2.3 s at full range) and get less accurate with distance (scatter ±12 close up, growing to ±40 at full range). Shells land where the target *was*, so the Mortar is strong against units that stand still (mechs fighting or queued, turrets) and weak against mechs on the move. It deals half damage to turrets and bases. Breaking walls is the job of Lancers and Breachers.

**Planned (next round, not built yet): Sapper**, a 9th mech that lays mines.
- It drops a hidden mine every 60–80 units it walks. At most 6 of its mines are on the field at once.
- A mine goes off when an enemy mech steps on it and deals splash damage. Mines are cheap and fragile.
- It lets you deny a lane to the enemy without building turrets there.
- A "Minefield" special (drop mines at every friendly mech's position at once) is a possible later addition.
- Stats and unlock stage are still to be decided *(tune)*.

Attack types work as in Ironline, measured in 2D:
- **Bullets** home in on their target.
- **Shells** fly to the target's position and deal circular splash damage. Damage falls off from 100% at the center to 50% at the edge.
- **Missiles** are slower homing projectiles (speed 520, turn rate about 5 rad/s, 3 s life) that curve toward their target and deal their damage as splash on impact (a direct hit takes full damage). If the target dies first, a missile retargets the nearest enemy within 220, or explodes where the target was.
- **Slugs** are very fast, straight projectiles (Lancer) that hit a single target.
- **Melee** hits instantly.
- **Zaps** chain to the nearest enemy within 140 units, in any lane.

### 5.5 Engagement mode (Hold / Advance)

Each side has one **global** engagement mode that applies to all of its mechs, including those already on the field. You switch it with a toggle button next to the specials (key F). It starts on **Hold**.

| Mode | Behavior |
|---|---|
| **Hold** (default) | A mech stops as soon as it has a target in range and fires at it until it's destroyed, then retargets. It walks on only when nothing is in range. This keeps ranged mechs at their maximum range. Columns move as a **convoy**: faster mechs queue behind slower friendly mechs. |
| **Advance** | Mechs keep walking while firing at whatever is in range. They steer around turrets that have a free neighbor cell (§5.2) and **overtake** slower friendly mechs through a free neighboring lane, then return to their own lane. They stop only when physically blocked: a full turret wall, an opposing mech in their lane, a friendly they can't overtake, or a base. |

- Units that fire shells (Mortar) and slugs (Lancer) still stop briefly to fire in Advance mode (about 0.4 s per shot). This stops long-range artillery from walking into turret range and firing for free.
- Neither mode is always better. Hold is safe and slow; Advance is fast but takes fire while passing turrets. Typical uses for Advance are right after an EMP, or after a gap opens in a wall.
- The enemy AI uses the same toggle (§10).
- *Future version (not in the first builds):* a separate Hold/Advance switch per mech type.

## 6. Turrets

Turrets are fixed units with high HP. They attack the first unit they see, using the same targeting rules as mechs. Because they don't move, a row of turrets with no gaps forms a wall that mechs can't get past (§5.2).

| Turret | Cost | HP | Damage | Reload (s) | Range | Attack |
|---|---|---|---|---|---|---|
| Sentry | 90 | 650 | 9 | 0.22 | 290 | Bullet |
| Howitzer | 160 | 950 | 55 | 2.0 | 430 | Shell, splash 60 |
| Arc Coil | 200 | 750 | 30 | 1.2 | 230 | Zap, 3 targets |

### 6.1 Ordering turrets

1. Pick a turret card, then tap a free build cell. You can keep tapping more cells to queue several turrets.
2. The turret's cost is paid when you place the order. The cell shows a "planned" marker.
3. Tapping a planned cell cancels that order and refunds its full cost.

### 6.2 The Constructor

- When the order queue isn't empty and no Constructor is out, one leaves your base. Each trip costs **20 energy** *(tune)*.
- It drives to each planned cell in the order the turrets were placed and builds them one at a time. Each build takes **2 s** *(tune)*.
- **Stats:** 200 HP, speed 80, no weapon *(tune)*. It doesn't block enemies, but enemies can block it, and they target it like any other unit. Its level grows with the Workshop like other units.
- A build doesn't start, and pauses, while an enemy mech stands on the cell.
- **If it's destroyed** before the queue is finished, a new Constructor is sent automatically after **3 s** *(tune)*, at the usual trip cost. Turrets already built stay. A turret that was partly built is lost, but its order stays in the queue (already paid).
- **If it finishes the queue**, it drives back to the base. When it arrives, the **trip cost is refunded**. If more orders are added while it's still out, it goes back to work instead of returning.
- Only one Constructor can be out at a time.

### 6.3 Selling

Tap a turret you built and choose Sell. It's removed immediately and refunds energy as described in §4. Selling doesn't need the Constructor.

## 7. Bases

The two bases work alike: each has an HP bar and is destroyed at 0 HP. Your base has extra advantages:

- **Weak base guns:** they shoot at incoming enemy mechs and turrets within range. Stats: 12 damage, 0.5 s reload, range 340.
- **Upgrades at any time during battle**, paid with energy:

| Upgrade | Effect per level | Costs |
|---|---|---|
| Armor | +20% base HP; the added HP also repairs the base | 150 / 250 / 400 |
| Bastion Gun | +50% base gun damage | 120 / 220 / 350 |
| Reactor | +2 energy/s, +60 energy cap | 100 / 200 / 320 |

The **enemy base** has a fixed set of upgrade levels per stage (Armor, Gun, Reactor). They're applied when the stage starts and never change during the battle. Here the enemy Reactor raises the AI's income by 15% per level *(tune)*.

The player base starts with 3000 HP, +15% per Reinforced Walls perk level.

## 8. Unit levels and in-battle upgrades

The rules are the same as Ironline. Every mech and turret type has a level from 0 to 5. Each level gives +25% damage and HP, and +4% speed, range and fire rate. Upgrades apply to every unit of that type, including ones already on the field.

The cost to go from level L to L+1 is `min(300, round(unit cost × 0.9 × (L + 1)))`. The Constructor isn't upgraded in battle; its level only comes from the Workshop.

## 9. Specials

Specials don't cost energy; they only have cooldowns. Each one starts a battle at half its cooldown, and the Fast Uplink perk shortens all cooldowns by 10% per level.

| Special | Cooldown | Effect |
|---|---|---|
| Bombing | 40 s | Tap a point on the field. Seven bombs land within a circle of radius 110 around it. Each deals 95 splash damage in a radius of 80, and only 50% against bases. |
| EMP | 55 s | Stuns every enemy mech and turret for 4 s. |
| Energy Surge | 50 s *(tune)* | Instantly gives +100 energy *(tune)*, up to the energy cap. |

## 10. Enemy AI

The enemy works like Ironline's AI, adapted for lanes:

- **Income:** the stage's regen value. It doubles over the first 7 minutes, and goes up by up to 40% when your mechs get close to its base. Enemy Reactor levels multiply this further (§7).
- **Unit choice:** it prefers cheap units early and expensive ones later. Under pressure it often sends Brawlers. Sometimes it saves up to deploy a group of 2–3.
- **Lane choice:** usually the lane where your defenses are weakest (fewest turret HP in range of that lane). Sometimes it picks a random lane, and it answers your pushes by sending units into the lane under the most pressure *(tune)*.
- **Engagement mode:** it starts on Hold. It switches to Advance after it destroys one of your turrets, or when your base drops below 50% HP. It switches back to Hold when its own base drops below 30% HP *(tune)*.
- **Turrets:** fixed per stage. The enemy has no Constructor. It never builds new turrets, never repairs and never upgrades during a battle.

## 11. Battle end, rewards and progression

Everything below carries over from Ironline unless noted.

- **Stars:** ★ for a win, ★★ if your base has more than 50% HP left, ★★★ if it has more than 85%.
- **Credits:**
  - Win: `60 + 30 × min(stage index, 14) + 25 × stars`
  - Loss: `15 + 2 × kills`
- **Campaign:** 12 stages, each harder than the last. Endless mode opens after all 12 are cleared. Enemy turrets are given as (type, lane 1–5, row 0–6 counted from the enemy base). Each stage has fixed enemy base upgrade levels.

| # | Stage | Enemy base HP | Enemy level | Enemy regen | Enemy roster | Enemy turrets (type lane/row) | Enemy base upgrades |
|---|---|---|---|---|---|---|---|
| 1 | Scrubline | 1500 | 0 | 5 | Scout | none | — |
| 2 | Dry Ford | 1800 | 0 | 6 | Scout, Gunner | none | — |
| 3 | Quarry Road | 2100 | 0 | 6.5 | + Brawler | Sentry 3/3 | — |
| 4 | Dust Belt | 2400 | 0 | 7 | + Mortar | Sentry 2/3, 4/3 | Gun 1 |
| 5 | Saltpan | 2700 | 0 | 7.5 | + Seeker | Sentry 1/3, 5/3; Howitzer 3/1 | Armor 1 |
| 6 | Red Cut | 3000 | 1 | 8 | Gunner, Brawler, Mortar, Seeker, Aegis | Sentry 2/4, 3/4, 4/4; Howitzer 3/1 | Armor 1, Gun 1 |
| 7 | Pylon Field | 3300 | 1 | 9.2 | 7 types (no Breacher) | Arc 3/3; Sentry 1/3, 5/3; Howitzer 2/1 | Reactor 1 |
| 8 | Gravel Sea | 3600 | 1 | 9.7 | 7 types (no Scout) | Sentry 1/4, 2/4, 4/4; Arc 3/4; Howitzer 3/1, 5/2 | Armor 1, Gun 1 |
| 9 | Ironwood | 4000 | 2 | 10.3 | 7 types (no Scout) | Sentry 1/5, 2/5, 4/5, 5/5; Arc 3/3; Howitzer 3/1 | Armor 1, Gun 1, Reactor 1 |
| 10 | Ash Ridge | 4400 | 2 | 10.8 | all 8 | Arc 2/4, 4/4; Sentry 3/4, 3/1; Howitzer 1/2, 5/2 | Armor 2, Gun 1, Reactor 1 |
| 11 | Breakwater | 4800 | 2 | 11.3 | 7 types (no Scout) | Sentry wall 1–5/5; Howitzer 3/1 | Armor 1, Gun 1, Reactor 1 |
| 12 | Last Bastion | 5400 | 2 | 12.4 | all 8 | Arc 1/5, 3/5, 5/5; Sentry 2/5, 4/5; Howitzer 2/1, 4/1 | Armor 2, Gun 2, Reactor 1 |

**Endless wave n** starts just above Last Bastion and ramps up gradually:
- **Enemy base HP:** 5400 × (1 + 0.06 n)
- **Enemy level:** 2 + ⌊(n + 1) / 3⌋, max 5
- **Enemy regen:** 12.4 × (1 + 0.04 n)
- **Turrets and roster:** the same as Last Bastion
- **Enemy base upgrades:** armor 2 + ⌊n/3⌋, gun 2 + ⌊n/4⌋, reactor 1 + ⌊n/3⌋, each capped at 3

So Endless 1 is about as hard as stage 12, Endless 2 brings level 3, and each further wave adds a little.

**Balance history:**
- **First build:** play-testing showed stages 1–12 were easy with massed Mortars behind Brawlers. The Mortar outranged every turret and the base gun, and from the middle lane ranged units reached every lane. Endless 1 was a sudden wall (enemy level 2 → 3 plus base upgrades all at once).
- **Second round (this version):**
  - lane reach (§5.3)
  - the Mortar rework
  - friendly collision: convoy in Hold, overtaking in Advance
  - stages 7–12 have about 8% more enemy income
  - a smooth Endless ramp

  `node tools/balance.mjs` now tests three bot strategies: mixed, mass Mortar behind Brawlers, and split waves on lanes 2 and 4. Mass Mortar no longer wins stages 9–12 at mid Workshop levels. With full Workshop upgrades, stages 9–11 and Endless 1 are winnable. Needs play-testing.
- **Unlock order:**

| Stages cleared | Unlock |
|---|---|
| 0 (start) | Scout, Gunner, Sentry, Bombing, Constructor |
| 1 | Brawler |
| 2 | Mortar, Howitzer |
| 3 | Seeker, EMP |
| 4 | Aegis |
| 5 | Lancer, Arc Coil |
| 6 | Breacher, Energy Surge |

One new mech type per stage, so the full arsenal is available from stage 7. The 5-mech loadout becomes a real choice from stage 5, once 6 mechs are unlocked.

- **Workshop:**
  - Veteran Training: units start at up to level 3. This includes the Constructor, which gets more HP and builds faster.
  - Perks (permanent, apply to every battle):
    - Capacitors: +50 starting energy and +40 max energy per level (150 / 300 / 500 credits).
    - Reinforced Walls: +15% base HP per level (200 / 400 / 650).
    - Fast Uplink: specials recharge 10% faster per level (200 / 400 / 650).

## 12. Controls (portrait touch first)

| Action | Touch | Keyboard / mouse |
|---|---|---|
| Pan camera | Drag the field vertically, or tap the minimap | W/S, arrow keys, mouse wheel |
| Choose active lane | Tap one of the 5 lane buttons in the HUD | Shift+1–5 |
| Deploy a mech | Tap its card | 1–5 |
| Hold / Advance | Toggle button next to the specials | F |
| Order turrets | TURRETS tab → card → tap one or more free cells | T, 1–3, then click cells |
| Cancel an order / sell a turret | Tap the planned cell / tap your turret → Sell | Click |
| Specials | Round buttons (tap the target for Bombing) | Q / E / R |
| Upgrades panel (pauses the game) | Wrench button | U |
| Pause | ❚❚ | Space, Esc |

## 13. Visual style

**Chosen final style: medium-resolution voxel art, angled (sample 7 in `art_samples/`).** It's a grounded, realistic military look, inspired by the Ebbtide reference screenshots, without copying any of their assets.

- **Camera:** an angled top-down oblique view. You see the top, the south (front) face and the east face of every object, while the lanes stay vertical on screen. Projection: ground y × 0.78, height × 0.72, a sideways shift of −0.32 × height.
- **Voxels:** about 3 screen px per voxel on a 1080-px-wide phone, roughly 1.7 world units. Units are built in code from simple shapes (boxes, cylinders, spheres) and voxelized, so the resolution is a single setting.
- **Unit size:** sprites are drawn larger than the combat radius (mechs ×1.3, turrets ×1.1) so they read well on a phone.
- **Color:** a muted palette of olive drab, khaki, sand, concrete grey and dull steel. Bright color is saved for muzzle flashes, explosions, energy effects and team markings (player blue, enemy red).
- **Light:** sun from the west-south-west. Hard, long shadows, ambient occlusion where things meet the ground, and bright edges on the sunlit side of voxels.
- **Ground:** low-contrast dirt tracks for the lanes, dry grass between them, small voxel grass tufts that cast tiny shadows, craters and debris.
- **Effects:** painted-style glows on top (muzzle flashes, explosions, smoke, tracers, lightning), as in sample 3.
- **HUD:** dark, semi-transparent panels with small, clean type, in the style of a military command interface.
- **Performance plan:** the sample is fully ray-traced, at about 2 s per frame. In the game, units are pre-rendered at load time into sprite sheets (16 facing angles, a few walk frames, a separate shadow layer). The ground is pre-rendered once. Each frame only draws sprites.

**During development the game uses the flat vector style (sample 4).** All drawing lives in one renderer module, separate from the simulation, as in Ironline. The voxel renderer replaces it later without touching gameplay. The sample code in `art_samples/fine.js` is the starting point for it.

## 13b. Sound

Ironline's sound effects were too toy-like. Iron Defense aims for **more realistic, heavier military sound**, still made in code with no audio files:
- **Guns:** short filtered-noise cracks with a low "thump" body and a quick tail. Each weapon gets its own pitch and character (Sentry rattle, Gunner bursts, Howitzer boom, Lancer rail "snap").
- **Explosions:** layered sound, made of a deep sub-bass thump, a noise burst and a rumbling tail with debris crackle.
- **Space:** a generated reverb (convolution) for an outdoor echo. Sounds are quieter and duller the farther they are from the camera, and panned left or right by their position on screen.
- **Mechs:** heavy footstep thuds and hydraulic servo whines, kept quiet. The Constructor has an engine hum and welding crackle.
- **Mixing:** a cap on how many sounds of the same kind play at once, and a master compressor so big battles don't clip.

If synthesis isn't realistic enough, the fallback is free CC0 (public domain) sound samples. That would add audio files to the project, so it's a later decision.

## 13c. Implementation details

These are the exact values the first build uses that aren't stated in the sections above. All of them live in `src/data.js` or `src/world.js`.

| Topic | Value |
|---|---|
| Deploy point | Player mechs appear at y = 124 (base face + 24) in the active lane, ±20 sideways jitter. Enemy mechs appear at y = 2276; groups are spaced 34 apart |
| Turn rates | Mech torsos 2π rad/s. Sentry 5, Howitzer 2.5, Arc Coil instant. A unit fires only when aimed within 10° |
| Target keeping | A unit keeps its target while it's alive and in range, unless a better category appears (ahead beats behind, preferred type beats others) |
| Sidestep / overtake | 0.5 s smoothed sideways move at half forward speed. Around a turret the mech stays in its new lane; when overtaking it returns home once the home lane is clear (no mech within the two radii + 10, no enemy turret just ahead) |
| Friendly spacing | Mechs in the same lane keep a gap of 4 units (edge to edge) |
| Lane reach | Own lane ± 1, using the target's current x position (`laneOf`). Code: `World.inReach` |
| Pause to fire | Mortar and Lancer stop for 0.4 s after each shot in Advance |
| Bullets / slugs | Homing, speed 1100 / 2600 |
| Shells | Howitzer: scatter ±12, flight time 0.7 s + distance/900. Mortar: scatter ±12 growing to ±40 at full range, flight time 1.0 s + distance/400, higher arc |
| Missiles | 2 per salvo, launched ±0.6 rad off aim, speed 520, turn 5 rad/s, 3 s life, retarget within 220 |
| Zap chain | Jumps up to 140 units, 75% damage per jump, never jumps to a base |
| Base guns | Fire from the gun tower nearest the target (x = 120 or 480). Range is measured from the base face line |
| Constructor | Starts at the middle of the base front; parks 36 units in front of (south of) the target cell. Build speed × (1 + 0.2 × Workshop level). Its Workshop key is `builder` |
| Bombing | Bombs land at random points within radius 110, the first after 0.6 s, then every 0.16 s |
| AI lane choice | 20% random lane; otherwise, if your mechs are within 900 of its base, 20% the lane with the most of them; otherwise the lane with the least player turret HP able to reach it |
| Workshop | Veteran Training up to level 3 for every unlocked mech, turret and the Constructor: 120 / 260 / 450 credits |
| Visual scale | Mechs are drawn at 1.3×, turrets at 1.1× and the Constructor at 1.2× their combat radius |

## 14. Decisions and open questions

### Resolved
1. **Lane count and field size:** 5 lanes on 600 × 2400. On a portrait phone (S25+) this shows about 975 world units, roughly 40% of the field, and build cells come out about 82 × 69 px.
2. **Deploying into a lane:** active lane plus tap a card. The lane is picked with the HUD lane buttons (§5.1).
3. **Constructor economics:** a 20-energy trip fee, refunded when the Constructor returns safely (§6.2).
4. **Lane changes:** only in Advance mode: permanently around enemy turrets, temporarily to overtake slower friendly mechs (§5.2, §5.5).
5. **Unit roster:** Ironline's 5 mechs and 3 turrets, plus Seeker, Breacher and Lancer (§5.4). Players pick a loadout of 5 mechs.
6. **Engagement:** a global Hold / Advance toggle (§5.5).
7. **Art style:** medium voxel, angled (sample 7) as the final style; flat vector (sample 4) during development (§13).
8. **Loadout:** 5 mechs per battle (may grow to all 8 later).
9. **Unlocks:** one new mech type per stage (§11).
10. **Mech aiming:** mechs turn their upper body to aim at any angle; turrets fire in all directions (§5.3).
11. **Project setup:** a standalone project, separate from Ironline. Code may be copied from Ironline and adapted. Save key `iron-defense-save-v1`. Git repo initialized; GitHub and Pages come later.
12. **Desktop:** a centered portrait column with letterbox bars.
13. **Lane reach:** mechs target their own lane ± 1 (Seeker, turrets and bases exempt). Trying it out; the user expects lanes 2 + 4 may become the go-to setup and wants to see how it feels.
14. **Mortar:** stays long-range splash, with slow, inaccurate shells and half damage to structures.
15. **Friendly collision:** convoy in Hold, overtake-and-return in Advance (option c with b2).
16. **Capacitors perk:** permanent +40 max energy per level as well as +50 starting energy (Workshop upgrades should be lasting).

### Still open
1. **New mech numbers:** the Seeker, Breacher and Lancer stats are first guesses. Check them once the game is playable.
2. **Stage balance:** the 12 stages in §11 are a bot-tuned first draft. They need play-testing on the phone.
3. **Sound realism:** whether code-made sound is realistic enough, or CC0 samples are needed (§13b).
4. **Sapper / mines:** the design is sketched in §5.4; build it next round. Stats and unlock stage still to decide.
5. **Enemy AI that counters your army** (e.g. flanking massed artillery with fast units): agreed for later.
6. **Lane rule feel:** whether lanes 2 + 4 become the only setup. Possible follow-ups: lane-specific terrain or cover, or an AI that punishes the uncovered lanes more.
