# Issues and backlog

Open bugs, play-test feedback and planned work. When something is done, move it to `CHANGELOG.md` and remove it here.

**Workflow:** new findings and ideas are added here first, with options and a proposal. They're built only after we've discussed priorities and decided.

Labels: **bug**, **ui**, **balance**, **feature**, **tech**. Where an issue came from, e.g. "(play-test v0.2.0-dev)".

## Open

### UI / readability
- *(The minimap readability issue was fixed in 0.2.0-dev: a mix of variants B and D (narrow strip, dark background, big outlined triangles and squares). Variant D's wider 40 × 160 strip was tried first. The user is judging it on the phone; in the narrow strip, units in neighboring lanes can overlap.)*

### Gameplay / movement
- **[discussion prep] Movement rules as one consistent matrix** (user, 2026-11-14, for the 2026-11-15 discussion)
  - **Dimensions to compare:**
    - Hold vs. Advance
    - obstacle friendly vs. enemy
    - obstacle mech vs. turret (plus the base)
    - mover and obstacle ranged vs. melee
  - **Observed (Advance):** the first Brawler attacks the enemy in front of it; the second Brawler, right behind, changes lanes and walks on. This follows today's rules (the first Brawler has stopped to fight, so to the second one it is a stopped friendly, and in Advance any stopped friendly is overtaken), but it feels inconsistent: a melee mech walks *away* from a fight it could join.
  - **Today's behavior:**

    | Mover meets … | Hold | Advance |
    |---|---|---|
    | friendly mech, walking | follows (convoy) | overtakes if ≥10 faster and a neighbor lane is free |
    | friendly mech, stopped/fighting | waits behind it (convoy) | overtakes through a free neighbor lane |
    | enemy mech | stops at own range (melee: at contact) and fights | fights on the move; stopped by contact; never changes lane for it |
    | enemy turret, gap next to it | stops at own range | steps around it (**melee too**, the logged bug) |
    | enemy turret, no gap / full wall | stops at own range | walks up to contact, then fights (ranged too) |
    | enemy base | stops at own range | walks up to contact (ranged too) |

  - **Already decided or proposed:**
    - Ranged mechs in Advance stop at their range in front of anything they can't pass (decided, B).
    - Melee mechs never step around enemies (proposed).
    - Hold convoy rule A/B/C/D (open).
    - Lane change speed C (proposed).
  - **Open cell to settle tomorrow:** "friendly mech stopped and fighting", per mover type and mode. One candidate rule:
    - A **melee** mover overtakes a fighting friendly only to *join the fight* (moves up beside it into a free neighbor lane, if an enemy is within reach there), not to walk past it.
    - A **ranged** mover never needs to: it already has the target in range and stops (Hold), or stops at range (Advance, rule B).
  - **Goal:** one table where every cell has a rule we can explain in one sentence, and the help screen can show it.
- *(The overtake swing-back bug was fixed in 0.2.0-dev; see CHANGELOG.)*
- **[bug] In Advance, the Brawler steps around enemies instead of attacking** (play-test v0.2.0-dev)
  - Cause: in Advance, *every* mech steps around an enemy turret if the neighboring cell is free, melee mechs included. The Breacher has the same problem, which defeats its purpose.
  - Proposal: melee mechs (Brawler, Breacher) never step around enemies. They attack what blocks them and only change lanes to overtake slower friendlies. Ranged mechs keep stepping around turrets in Advance.
  - Asked the user: was it enemy turrets, or also enemy mechs? (Mechs should never cause a lane change; that would be a separate bug.)
- **[balance] Convoys in Hold stall** (play-test v0.2.0-dev)
  - Units queue behind slower friendlies and sit idle; switching to Advance is the only way to break the queue.
  - Worst case: a Mortar or Lancer in front stops at its long range, so the whole column waits far from the fight. Deep queues of melee or short-range units also idle.
  - Proposal: convoy while marching, spread out when the front stops.
    - While the friendly ahead is moving, follow it (keeps the "Gunner takes cover behind the Brawler" effect).
    - Once the friendly ahead stands still, a mech with no target in range steps into a free neighboring lane and moves up until something is in range, then stops (Hold).
    - It returns to its home lane when that lane is clear.
    - Advance stays as is: keep walking and overtake anything slower.
  - **Follow-up (user, 2026-11-14):** should Brawlers in Hold overtake when the unit in front is fighting? The user proposes a general rule:
    - **Hold = "hold to fight, otherwise overtake":** a mech with a target in range stops and fights; a mech without one overtakes any friendly blocking it.
    - **Advance = "always advance and overtake."**
  - **Options to compare:**
    - **A, convoy while marching, spread out when the front stops** (my earlier proposal): keeps the "Gunner takes cover behind the Brawler" effect while marching; idle units only move up once the front is fighting.
    - **B, the user's rule:** simplest and easiest to predict; nobody ever idles. Downside: no cover while marching, since fast units always pass slow ones even when nothing is happening.
    - **C, B plus roles:** like B, but ranged mechs don't overtake a melee mech (Brawler, Breacher) that's still marching, so tanks lead the column. Melee mechs overtake anything, so Brawlers push to the front of a fight.
  - **Recommendation:** B as the base rule. If cover is missed in play-testing, add C's role rule on top.
  - **Thought from the user: deploy order as tactics.**
    - Deploying Brawler → Mortar → Seeker → Gunner in Hold causes exactly this queue: the Mortar stops early to shoot (range 520) while the units behind it are still out of range.
    - Brawler (shield) → Gunner → Seeker → Mortar stacks neatly by range: each unit stops behind the one in front, at its own range.
    - So with the current rules, deploy order is a real skill. The rule we choose decides how much that skill matters.
  - **Option D, range-sorted convoy (follows from the user's thought):** in Hold, a mech may overtake a friendly ahead if that friendly is standing still, **or** has a longer range than itself (and will stop earlier anyway). The column then sorts itself by range automatically: short range in front, artillery at the back.
    - **Pro:** no idle queues even with a "wrong" deploy order; formations look sensible.
    - **Con:** it takes away the deploy-order skill the user just described.
  - **Trade-off to decide:** keep deploy order as a skill (rule A, or today's rule) vs. automatic sorting for convenience (rules B, C or D).
  - Decide together with the melee sidestep bug above and the lane change speed below, since all three change the same movement code. Slower lane changes (option C there) make overtaking more costly, which shifts the convoy trade-off.

- **[ui/gameplay] Lane changes are far too fast: mechs "fly" sideways** (user, 2026-11-14)
  - **Today:** every lane change (overtake, return home, stepping around a turret) takes a fixed 0.5 s for the 120-unit lane width, for every mech. That's 240 units/s sideways, while mechs walk forward at 30–95 (a Brawler moves sideways 6× faster than it walks). The body only tilts up to 34° and eases back. The mech also counts as being in the new lane from the very first moment, for blocking and targeting.
  - **Options:**
    - **A, longer fixed time:** e.g. 1.5 s for everyone. Simplest, but the Scout and the Brawler would still change lanes at the same pace.
    - **B, purely visual:** keep 0.5 s but turn the body fully and animate the legs. It doesn't fix the core problem, which is the speed itself.
    - **C, walk over at the mech's own speed (realistic):**
      - The mech turns toward the new lane at its turn rate and walks diagonally: sideways at about 0.8× its walk speed, forward at about 0.6×.
      - If it's blocked in front (a turret, a stopped unit), it doesn't move forward and only steps sideways.
      - It then turns back to face forward. The legs animate the whole time.
      - Resulting times: Scout ≈ 1.6 s, Gunner ≈ 2.7 s, Brawler ≈ 3.8 s, Mortar ≈ 4.3 s (and a heavy tank ≈ 5 s).
    - **Add-on for C, honest lane occupancy:** while changing lanes, the mech blocks *both* lanes, so nobody walks through it. Its lane for targeting and lane reach switches at the halfway point.
  - **Gameplay effects of C:**
    - overtaking and stepping around turrets take longer, and the mech is exposed while doing it
    - heavy mechs commit to their lane, while light mechs stay nimble
    - fewer, more deliberate lane changes overall
    - this interacts with the convoy/overtake rules above (overtaking becomes more costly), and tests #19/#20 need new timings
  - **Recommendation: C with honest lane occupancy.** It looks like walking, gives each mech its own feel, and matches the plan for heavier units. It's best decided and built together with the convoy rule and the melee sidestep bug, since all three change the same movement code.

- **[gameplay] Ranged mechs walk right up to the enemy base in Advance** (user, 2026-11-14)
  - **Today:** in Advance, a mech keeps walking while firing until something physically blocks it. Ranged mechs (Mortar 520, Lancer 460, Seeker 380 …) end up pressed against the enemy base, inside its guns' range (340) and in the middle of the melee, although they could shoot from much further back. In Hold they already stop at their own range.
  - **User's proposal:** ranged mechs only go as close to the base as needed to have it in range, even in Advance.
  - **Should turrets count too? Options:**
    - **A, base only** (the proposal as stated).
    - **B, base plus anything that can't be passed:** a ranged mech stops at its range in front of the enemy base, a full turret wall, or a turret in its lane with no free gap to step around. Turrets it *can* get around don't stop it: it keeps shooting on the move and walks past, which is what Advance is for.
    - **C, base plus every turret:** a ranged mech stops at its range in front of any turret. Advance would then behave like Hold against defenses, and stepping around turrets would almost never happen.
  - **Details for B (and A):**
    - **Where to stop:** at about 95% of its range, so small movements don't take it out of range.
    - **Melee mechs** (Brawler, Breacher) still walk up and hit.
    - **If the obstacle disappears** (turret destroyed, gap opens), the mech walks on.
    - **The enemy AI** uses the same rule.
  - **Decided (user, 2026-11-14): B.** To be built together with the other movement topics (discussion planned for 2026-11-15).
  - **Recommendation: B.** It keeps what Advance means (push past turrets you can get around) and fixes the pointless walk into point-blank range wherever the path really ends. C would remove the difference between Hold and Advance at defenses.
  - Fits together with the other movement topics (convoy, melee sidestep, lane change speed), since it changes the same code.

### Enemy AI
- **[balance] The enemy AI deploys one-sided, in same-type groups** (play-test v0.2.0-dev): e.g. 3 Brawlers at once in the same lane.
  - **Causes in the code:**
    - **Groups:** 25% of orders early, rising to 45% after about 2.5 minutes, are a group of 2–3, always of *one* type and always in one lane.
    - **Brawler preference:** when your mechs push toward its base, it picks a Brawler half the time, regardless of what's attacking. So groups of 3 Brawlers come up often.
    - **One-sided lanes:** 60% of the time it picks the lane with the least turret coverage. Once your turrets stand, that lane barely changes, so it keeps hitting the same lane. Otherwise it picks a random lane 20% of the time, and the lane your mechs push in 20% of the time.
  - **Options:**
    - **A, mixed groups from templates:** groups are compositions, not copies. Examples:
      - Brawler in front + Gunner behind
      - Brawler + Mortar
      - Aegis + 2 Gunners
      - Breacher + Lancer for sieges

      Only cheap units (Scouts) come as same-type packs. Group members deploy in a sensible order: tank first, ranged behind.
    - **B, varied lane choice:**
      - lanes are weighted by weakness instead of always taking the weakest, with a penalty for lanes it used recently
      - sometimes a split attack: two small groups in two lanes at the same time
      - it still answers your pushes in their lane
    - **C, a sensible defensive pick:** under pressure it picks from a defensive set (Brawler, Gunner, Seeker, Aegis) instead of always a Brawler. Real counter-picking against your army belongs to the agreed "counter AI" feature later.
    - **D, stage personalities (later):** e.g. "swarm" (many light units), "siege" (Lancer, Mortar, Breacher), "armored" (Brawler, Aegis), for variety between stages.
  - **Recommendation: A + B + C now, D later.** It makes the AI feel smarter and less predictable without the full counter AI. The difficulty will shift, so stages 1–12 need a rebalance with the bot afterwards.

### Under discussion
- **[balance] The Seeker reaches every lane** (play-test v0.2.0-dev)
  - **Current rule (by design, so far):** Seeker missiles are exempt from lane reach (gameplay.md §5.3, decision 13). A Seeker in lane 1 can hit targets in lane 5, within its range of 380.
  - **Why that may be a problem:** one Seeker covers the whole field width, so it ignores the lane tactics that lane reach was introduced for. It's also hard to read: missiles cross the entire screen.
  - **Options:**
    - **A, keep it:** the Seeker is the one "any lane" mech; that's its identity. Balance it through cost and damage if needed.
    - **B, normal reach (±1 lane) like everyone else:** simplest and consistent. The Seeker keeps its homing missiles and mech preference but loses its special role.
    - **C, extended reach (±2 lanes):** a middle ground. From lane 3 it covers every lane, from the edge lanes only three, so placement still matters.
    - **D, normal reach, but missiles keep tracking:** it picks targets only within ±1 lane, but a missile that's already flying follows a target that changes lanes (as today). Mostly the same as B, just stated explicitly.
  - **Recommendation: C (±2 lanes).** It keeps the Seeker special (the only mech that can cover the whole field, but only from the middle lane), and the edge lanes no longer reach across the map. If it's still too strong, fall back to B.
- **[balance] Kill bounty helps the winning side snowball** (user, 2026-11-14)
  - **Current rule:** the player gets 25% of the destroyed unit's cost for every kill, mechs and turrets alike. The enemy AI gets no bounty (it has its own income, which grows when your mechs push close to its base).
  - **Problem:** whoever is ahead gets richer and pulls further ahead. But energy for killing *attackers* near your own base is good: it helps a defender recover.
  - **Options:**
    - **A, no bounty for turrets** (user idea): destroying turrets no longer feeds an attack that's already winning.
    - **B, lower the bounty overall,** e.g. 25% → 15%: simple, but it weakens comebacks too.
    - **C, bounty by location:** 25% for kills in your own half of the field (defending), 10% in the enemy half (attacking). This matches the example "my base is under attack, I kill attackers, I get a boost".
    - **D, comeback scaling:** the bounty grows when your base has less HP left than the enemy's. Very targeted, but harder to see and understand while playing.
  - **Recommendation: A + C:** no bounty for turrets, 25% for mech kills in your own half, 10% in the enemy half. Easy to explain and it rewards defending, not snowballing.
  - **Open point:** should the enemy AI get the same defensive bounty, so both sides follow one rule? Today it gets none.
- *(The deployment queue was built in 0.2.0-dev: limit 6, a CLEAR button, a strip at the top of the controls; see CHANGELOG. Not done: lane button counters and the energy bar marker, optional extras if wanted after play-testing.)*
- **[feature] Base weaponry: a base mortar and Workshop base upgrades** (user idea, 2026-11-14). Proposals:
  - **Why:** enemy Mortars (520) and Lancers (460) outrange the base guns (340) and can shell your base or turrets without being fired on.
  - **Bastion Mortar:** a mortar battery in the base, same slow-shell rules as the Mortar mech.
    - Range 600 from the base front, about 6 s reload, splash 80, around 70 damage *(tune)*.
    - Defensive only: covers roughly the first quarter of the field (up to y ≈ 700), punishing enemies that park in front of your walls or base.
  - **New Workshop perk, Fortifications** (permanent): L1 unlocks the Bastion Mortar, L2 makes it reload 25% faster, L3 fires 2 shells per volley.
  - **New Workshop perk, Heavy Guns** (permanent): +20% base gun-tower damage per level.
  - **Workshop vs. in battle:** the Workshop unlocks and extends; in-battle upgrades strengthen. The existing in-battle Bastion Gun upgrade would then improve the gun towers and the mortar.
  - **Enemy bases:** from about stage 8, some enemy bases get a mortar too (range 560 > Mortar 520), as part of their fixed base upgrades. This is another counter to mass Mortars.
  - **Risk:** stronger base defense encourages turtling, so keep the mortar's damage modest and its reach limited to your own quarter.
  - **Open question:** buy the Bastion Mortar with Workshop credits (proposed), or unlock it by stage progress?

- **[feature] Lancer redesign as a proper rail gun** (user, 2026-11-14): today it sounds and looks like a laser.
  - **Sound, why it sounds like a laser:** the shot is built around a "zing" (a tone sliding from 3200 down to 180 Hz) plus an electric buzz, the classic sci-fi "pew".
  - **Sound proposal:**
    - a very sharp, loud crack, the slug breaking the sound barrier, like a thunderclap
    - a deep thump as the capacitors discharge
    - a brief electrical arc crackle at the muzzle
    - no falling tone
    - during the reload, a quiet rising capacitor whine, so you can hear it charging
  - **Visual, today:** a long pale-cyan streak (60 px) with a cyan muzzle flash, which reads as a laser beam.
  - **Visual, the user's idea:** look less like a laser and more like a series of shells fired from the rail gun. Options:
    - **A, one heavy slug, restyled:** a short, dark metal slug with a white-hot tip, a thin smoke trail, an orange-white muzzle flash with a shock ring, and sparks plus debris at the impact. Visual only, no rules change.
    - **B, a burst of 3 slugs:** fired 0.08 s apart, each restyled as in A, with the damage split (3 × 10 instead of 1 × 30, still ×3 vs structures). This matches "a series of shells" best. It's a small rules change: if the target dies mid-burst, the remaining slugs retarget or miss, and armor counts 3 times.
    - **C, as A, but visually a burst:** 3 slug streaks drawn close together that land as one hit. It looks like a burst, with no rules change, but the look and the damage don't quite match.
  - **Recommendation:** the new sound plus **B**. It best matches the "series of shells" idea, and the small rules effect (less overkill, more affected by armor) suits a siege gun. If we'd rather not touch balance now, take A first.
- **[feature] Heavy tank mech** (user idea, 2026-11-14): a slow, armored walker that fires heavy tank shells. They explode on impact for massive damage, with a little splash. The name is still open.
  - **Does it fit the roster?** Yes, if its role stays distinct. Today nothing is both tough and ranged:
    - the tough mechs (Brawler 700 HP, Breacher 950 HP) are melee
    - the ranged ones are fragile (Mortar 180, Lancer 300, Seeker 260)
    - the Tank would be the **frontline gun**: it soaks fire *and* hits hard at mid range
  - **Keeping it apart from the others:**
    - **vs. Mortar:** fast, direct shell (not a slow lob), so it hits moving units too. Small splash instead of big. Short range instead of artillery range.
    - **vs. Lancer:** mid range (inside turret range, so it trades fire with turrets) and all-round damage, where the Lancer has long range and is anti-structure and fragile.
    - **vs. Brawler:** fights from range, and is slower and more expensive.
  - **Stats, first guess:**
    - cost 240, HP 900, damage 90 per shell, splash 25 within radius 35 (falloff)
    - reload 3.5 s, range 320, speed 30 (the slowest mech), deploy cooldown 6 s
    - pauses briefly to fire (like the Lancer)
    - the shell flies fast (about 700/s), so it almost always hits
  - **Gameplay notes:**
    - In Hold, it stops at range 320, so it fits naturally right behind the Brawler in the range-sorted convoy idea.
    - Because it's the slowest, faster mechs would overtake it in Advance. That also makes the convoy rule decision more important.
  - **Unlock:** after the Sapper, so stage 9 or so, with the Sapper at 8. The enemy gets it a bit later, from around stage 10.
  - **Roster size:** 10 mechs with a loadout of 5 is still manageable, and more choice makes the loadout matter. I'd stop there, though: every further mech should fill a clear gap.
  - **Sound and look:** a deep cannon boom (the new cannon sound, heavier, with recoil), a visible recoil step, and a bright, short tracer for the shell, the opposite of the Lancer's long streak.
  - **Name ideas:** Goliath, Juggernaut, Rhino, Mauler, Warhound. **Recommendation: Goliath** (big, slow and heavy, and it doesn't clash with Bastion or Breacher). **Shortlist (user, 2026-11-14): Goliath or Warhound.**

### Planned features (agreed)
- **[feature] Sapper:** a mine-laying mech, the 9th mech. Designed in gameplay.md §5.4. Stats and unlock stage still to decide.
- **[feature] Enemy AI that counters your army,** e.g. flanking massed artillery with fast units. Agreed for later.
- **[feature] A separate Hold/Advance switch per mech type.** A future idea, not for the next versions.
- **[feature] Loadout of all 8 (or 9) mechs instead of 5:** maybe, decide after play-testing.

### Sound / polish
- **[feature] Sound: synthesized round 1 + 1b done in 0.2.0-dev** (see CHANGELOG). The user liked the reworked impacts, explosions and metal sounds (2026-11-14) and is judging the rest in longer play sessions.
  - Possible later: CC0 recorded samples for guns and explosions (user: "maybe later").
  - Smaller follow-ups if wanted: a distinct character per weapon (Scout lighter rattle, Gunner deeper thump); the destroyed-mech explosion still uses the old sine metal layer.
- **[feature] Mech footstep and servo sounds** (part of the sound plan in gameplay.md §13b; not built yet).
- **[feature] Stage 1 tutorial overlay.**

### Art
- **[feature] Voxel renderer (final art style, sample 7):** bake sprite sheets from `art_samples/fine.js` at 3 px voxels, and pre-render the ground.

### Tech / housekeeping
- **[tech] Unpublish the old GitHub Pages site** (repo Settings → Pages). It still serves v0.1.0 at pmcl77.github.io/iron_defense. A task for the user.
- **[tech] Local Wi-Fi testing doesn't work:** the phone can't reach a server on the Mac (ping works, firewall off). Not needed anymore since the dev preview exists; left unsolved.

## To check during play-testing (v0.2.0-dev)
- Lane reach: do lanes 2 + 4 become the only sensible setup?
- Is the Mortar still useful with slow shells?
- Do convoy and overtaking behave as expected?
- Difficulty of stages 7–12 and the first Endless waves.
- Is the sound realistic enough, or are CC0 samples needed?
