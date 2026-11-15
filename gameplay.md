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
| Blocking | Every enemy blocks | Turrets block their lane cell; Chargers slip past mechs (§5.2) |
| Behavior | Mechs always stop to fire | Each type belongs to a **role** with fixed rules, no stance switch (§5.2) |
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
| Regeneration | 8 per second, +1 per Power Grid perk level (permanent, Workshop), +2 per Reactor upgrade (in battle) |
| Energy cap | 300, +40 per Capacitors perk level (permanent, Workshop), +60 per Reactor upgrade (in battle) |
| Kill bounty | 25% of the destroyed unit's cost |
| Turret sell refund | 25% (nearly dead) to 50% (full HP) of build cost |

Energy pays for mechs, turrets, Constructor trips (§6.2), unit upgrades and base upgrades.

## 5. Mechs

Mechs are mobile units. Each one attacks the first enemy it comes across, and that can be the enemy base.

### 5.1 Deploying

- One lane is **active**. It's shown by a highlight on the field and on a strip of **5 lane buttons in the HUD**, just above the cards. It starts on the middle lane. (The buttons are needed because your base is off screen once you scroll forward.)
- **Deployment queue:** a mech card tapped without enough energy, or while the card cools down, queues the order (max 5) in the active lane. Strictly first in, first out: the whole queue waits for energy and cooldowns, and energy is paid on deploy. Cancel one order by tapping it, or all with CLEAR. A queued deploy waits until its lane's spawn point is clear, at most 1.5 s.
- Tapping a mech card deploys that mech at your base, into the active lane.
- Each card has a short cooldown after use, as in Ironline.
- **Loadout:** you have up to 8 mech types, but the HUD holds 5 mech cards. Before each battle you pick a loadout of 5 unlocked mechs, which keeps hotkeys 1–5. The last loadout is remembered. *(Might later grow to allow all 8 mechs.)*

### 5.2 Movement: roles, types and traits

*Decided 2026-11-15 (replaces the Hold/Advance switch). Being built in 0.4.0-dev in the steps listed at the end of this section; until a step is built, the game still behaves the old way.*

There is **no stance switch**. A mech's behavior comes from its type alone, and the same rules always apply:

- **Role:** a set of rules every member follows: where it walks, what stops it, whom it passes, when it fans out, and what it shoots by default.
- **Type:** a single unit (Gunner, Seeker …) with its own stats and weapon (melee, direct fire, homing, shells). Stats change how *well* a unit does something, never *what* it does. A role rule can depend on the weapon: "fights what blocks it" means a melee unit hits it and a ranged unit shoots it.
- **Trait:** changes exactly **one** rule of the role (movement, targeting or reach) for one type. If a change alters the unit's goal (where it walks, what stops it), it's a different role, not a trait. At most one or two traits per type.
- **One-sentence test:** every type can be explained in one sentence (role sentence plus traits). That sentence is shown on its card and in the help screen (§5.5).
- **Turrets have no roles.** They only use the shared targeting rule (§5.3).
- The **enemy** uses the same roles.

**The five roles:**

| Role | One sentence |
|---|---|
| **Tank** | Leads from the front, draws fire and fights whatever blocks it. |
| **Line** | Stops at range and shoots; takes cover behind a marching tank. |
| **Support** | Follows the fight and stays just behind its front. |
| **Artillery** | Stays at the back and shoots from as far as possible. |
| **Charger** | Charges the first enemy structure in its path, slipping past mechs and shooting on the move. |

**What each role does:**

| Situation | Tank | Line | Support | Artillery | Charger |
|---|---|---|---|---|---|
| Nothing in range | marches on | marches on | marches on | marches on | marches on |
| Enemy mech in range | keeps walking (firing if ranged) until blocked | stops at range, shoots | stops just behind the frontmost fighting friendly nearby; shoots if in range | stops at range, shoots | keeps moving, shoots on the move |
| Enemy turret or base ahead | walks up and fights it | stops at range | as above | stops at maximum range | stops at it and fights it (ranged: at range) |
| Enemy mech blocks its lane | fights it, melee also from the neighbor lane (side attack) | fights it | fights it | fights it | slips past through a free neighbor lane; fights it only if every side is blocked |
| Friendly ahead, marching | passes non-tanks | stays behind tanks; passes Support and Artillery | stays behind; passes only Artillery | stays behind | passes anyone |
| Friendly ahead, stopped and fighting | steps beside it into a free neighbor lane and joins the fight | shoots from behind if it has a shot, otherwise fans out ±1 lane | stays behind it (its spot) | stays behind and waits for a shot | goes around it |
| Default target | whatever blocks it, otherwise nearest | nearest | nearest | nearest | nearest |

**Charger goal:** the first structure in its path: the nearest enemy turret ahead within ±1 lane (it steps over toward it), otherwise the base.

**Shared rules (all roles):**
- **Passing:** Tank passes anyone who isn't a tank. Line passes Support and Artillery. Support passes only Artillery, and never a friendly that's fighting. Artillery passes nobody. Charger passes anyone. Otherwise a mech keeps a 4-unit gap behind the friendly in front.
- **Ranged units stop at about 95% of their range** in front of what stops them (enemy mechs, turrets, the base), so small movements don't take them out of range. Melee units walk up to contact.
- **Fan-out** (Line behind a fighting friendly, Tank joining a fight): only once the friendly ahead has stopped to fight, never while it's still marching, so fresh deployments keep their cover. It prefers the side with a reachable target, then the side with fewer friendlies.
- **Lane changes:**
  - a mech walks over diagonally at a pace that matches its speed and turns its body; heavy mechs take longer
  - it starts only when the destination lane is free (reservation), and blocks only what it physically overlaps on the way
  - at most ±1 lane from its home lane
  - after passing someone it returns home; after fanning out to fight it stays in the new lane
- **A full turret wall** (no free cell in the row) stops everyone until a turret falls.
- **Friendly turrets:** own mechs (and the Constructor) walk around them in the gap between the pads, while staying assigned to their lane. This is cosmetic: full speed, no effect on blocking, reach or targeting.
- Each mech gets a small cosmetic sideways offset (±20) inside its lane.

**Tuning values to start with** *(tune after play-testing)*: side attack reaches about 100 units into the neighbor lane; Support stays about 40 units behind the friendly it follows.

**Build order** (each step followed by a play-test):
1. Roles and their rules replace the Hold/Advance switch (the HUD button goes; its space goes to the energy bar, later maybe another special).
2. Walking lane changes and the detour around friendly turrets.
3. Melee side attack.
4. Traits (§5.5).
5. Enemy AI deploy variety, using roles (§10).
6. Balance pass with the bot.

### 5.3 Targeting

- A mech targets the **nearest enemy within range that's ahead of it or level with it**. Range is a straight-line (circle) distance measured to the target's edge.
- **Lane reach:** a mech can only target enemies in **its own lane and the two lanes next to it**. A mech in lane 3 covers lanes 2–4; a mech in lane 1 covers lanes 1–2. Exceptions: the enemy **base** spans every lane and is always reachable; the **Seeker** reaches two lanes to each side (Long reach trait, §5.5; until step 4 is built it still reaches any lane); **turrets and bases** fire into any lane. Splash and zap chains still hit anything in their radius.
- **Mechs turn to aim.** The upper body (torso and weapons) rotates toward the target at any angle, while the legs keep walking along the lane. Torso turn rate is about 360°/s *(tune)*, and a mech fires only once it's aimed within 10°.
- **Ahead first:** a mech picks a target ahead of it or level with it whenever one is in range. It turns to shoot at targets behind it only when nothing ahead is in range.
- **Turrets and bases fire in every direction.** Otherwise any mech that got past a turret would be safe from it.
- **Default target per role** (§5.2): the nearest enemy; a Tank always fights what blocks it.
- **Traits** can change it (§5.5): the Lancer prefers turrets and bases, the Seeker prefers mechs. They take the nearest preferred target in range, or the nearest target of any kind if none is preferred.
- **Keeping a target:** a unit keeps its target until it dies or leaves range, unless a better category appears. A mech that physically blocks a unit always becomes its target. "Drawing fire" works through this: newly arriving enemies pick the nearest unit, which is the tank in front.

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
- **Seeker** (homing missiles): fires a salvo of 2 missiles that curve onto their target up to two lanes away and explode with a small splash. It gives burst damage against mechs and punishes groups bunched in a gap.
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

### 5.5 Type allocation, traits and card texts

*Decided 2026-11-15, see §5.2.*

**Traits** (each replaces one role rule):
- **Prefers mechs:** picks enemy mechs over structures.
- **Prefers structures:** picks turrets and bases over mechs.
- **Long reach:** targets own lane ± 2 instead of ± 1 (§5.3).

| Type | Role | Weapon | Traits | Card text |
|---|---|---|---|---|
| Brawler | Tank | melee | none | Leads from the front, draws fire and smashes whatever blocks it, also from the side. |
| Breacher | Charger | melee, ×4 vs structures, stuns turrets | none | Slowly charges the first structure in its path, walks past mechs and tears turrets down. |
| Scout | Charger | bullets | none | Fast. Charges the first structure in its path, slips past mechs and shoots on the move. |
| Gunner | Line | bullets | none | Stops at range and shoots the nearest enemy; takes cover behind marching tanks. |
| Seeker | Line | homing missiles | prefers mechs, long reach | Stops at range and fires homing missiles at enemy mechs up to two lanes away. |
| Aegis | Support | bullets + 40% damage-reduction field | none | Follows the fight, stays just behind its front and shields everyone nearby. |
| Mortar | Artillery | slow shells, splash | none | Stays at the back and shells the nearest enemy from long range. |
| Lancer | Artillery | slugs, ×3 vs structures | prefers structures | Stays at the back and snipes turrets and bases from beyond their range. |

Later units get a role the same way (the heavy tank: Tank if it leads and brawls, Charger if it goes for walls; a repair mech: Support).

*Old rule, still in the game until step 1 is built:* a global Hold / Advance toggle per side (key F). Hold stopped mechs whenever a target was in range; Advance kept them walking while firing, stepping around turrets and overtaking friendlies.

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
- **Behavior:** its mechs follow the same roles as yours (§5.2). *(Until step 1 is built it still switches Hold/Advance: Advance after it destroys one of your turrets or your base drops below 50%, back to Hold when its own base drops below 30%.)*
- **Planned (step 5 of the movement build):** more varied deploys using roles: mixed groups from templates (tank first, ranged behind), varied lane choice and split attacks, a sensible defensive pick under pressure (ISSUES.md).
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
    - Power Grid: +1 energy per second per level (200 / 400 / 650).

## 12. Controls (portrait touch first)

| Action | Touch | Keyboard / mouse |
|---|---|---|
| Pan camera | Drag the field vertically, or tap the minimap | W/S, arrow keys, mouse wheel |
| Choose active lane | Tap one of the 5 lane buttons in the HUD | Shift+1–5 |
| Deploy a mech | Tap its card | 1–5 |
| Hold / Advance *(until the roles are built)* | Toggle button next to the specials | F |
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
| Pause to fire | Mortar and Lancer stop for 0.4 s after each shot in Advance (obsolete once the roles are built: Artillery always stops) |
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
4. **Lane changes:** follow the role rules: passing, fan-out to join a fight, Chargers slipping past mechs; at most ±1 lane from home, walked over at the mech's pace (§5.2). *(Replaced the Advance-only rule on 2026-11-15.)*
5. **Unit roster:** Ironline's 5 mechs and 3 turrets, plus Seeker, Breacher and Lancer (§5.4). Players pick a loadout of 5 mechs.
6. **Behavior:** roles, types and traits, no stance switch (§5.2, §5.5). *(Replaced the global Hold / Advance toggle on 2026-11-15: in play-testing Hold was used about 98% of the time, and two rule sets per unit were too much to keep in mind.)*
7. **Art style:** medium voxel, angled (sample 7) as the final style; flat vector (sample 4) during development (§13).
8. **Loadout:** 5 mechs per battle (may grow to all 8 later).
9. **Unlocks:** one new mech type per stage (§11).
10. **Mech aiming:** mechs turn their upper body to aim at any angle; turrets fire in all directions (§5.3).
11. **Project setup:** a standalone project, separate from Ironline. Code may be copied from Ironline and adapted. Save key `iron-defense-save-v1`. Git repo initialized; GitHub and Pages come later.
12. **Desktop:** a centered portrait column with letterbox bars.
13. **Lane reach:** mechs target their own lane ± 1 (turrets and bases exempt; the Seeker's Long reach trait reaches ± 2 lanes, decided 2026-11-15: from the middle lane it covers everything, but then it has no tank in front of it, which makes its lane a real decision). Trying it out; the user expects lanes 2 + 4 may become the go-to setup and wants to see how it feels.
14. **Mortar:** stays long-range splash, with slow, inaccurate shells and half damage to structures.
15. **Friendly collision:** by role: passing rules and fan-out (§5.2). *(Replaced convoy in Hold / overtake in Advance on 2026-11-15.)*
16. **Capacitors perk:** permanent +40 max energy per level as well as +50 starting energy (Workshop upgrades should be lasting).

### Still open
1. **New mech numbers:** the Seeker, Breacher and Lancer stats are first guesses. Check them once the game is playable.
2. **Stage balance:** the 12 stages in §11 are a bot-tuned first draft. They need play-testing on the phone.
3. **Sound realism:** whether code-made sound is realistic enough, or CC0 samples are needed (§13b).
4. **Sapper / mines:** the design is sketched in §5.4; build it next round. Stats and unlock stage still to decide.
5. **Enemy AI that counters your army** (e.g. flanking massed artillery with fast units): agreed for later.
6. **Lane rule feel:** whether lanes 2 + 4 become the only setup. Possible follow-ups: lane-specific terrain or cover, or an AI that punishes the uncovered lanes more.
