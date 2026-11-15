# Issues and backlog

Open bugs, play-test feedback and planned work. When something is done, move it to `CHANGELOG.md` and remove it here.

**Workflow:** new findings and ideas are added here first, with options and a proposal. They're built only after we've discussed priorities and decided.

Labels: **bug**, **ui**, **balance**, **feature**, **tech**. Where an issue came from, e.g. "(play-test v0.2.0-dev)".

## Open

### UI / readability
- *(The minimap readability issue was fixed in 0.2.0-dev: a mix of variants B and D (narrow strip, dark background, big outlined triangles and squares). Variant D's wider 40 × 160 strip was tried first. The user is judging it on the phone; in the narrow strip, units in neighboring lanes can overlap.)*

### Gameplay / movement
- **[feature] Movement model: roles, types and traits, no stance switch** (decided with the user, 2026-11-15)
  - The full design is in gameplay.md §5.2 (roles and their rules) and §5.5 (allocation, traits, card texts).
  - **Why:** the Hold/Advance switch meant two rule sets for every unit (too much to keep in mind), only some types actually reacted to it, and in play-testing Hold was used about 98% of the time.
  - **Roles:** Tank (Brawler), Line (Gunner, Seeker), Support (Aegis), Artillery (Mortar, Lancer), Charger (Scout, Breacher).
  - **Traits** (each changes one role rule): Seeker prefers mechs + long reach (± 2 lanes); Lancer prefers structures.
  - **This replaces** the earlier movement topics: the rule matrix, the Hold/Advance meaning, the melee sidestep bug (Tanks never go around enemies), the convoy stall A–D (fan-out once the friendly ahead fights), the lane change speed (option C: walk over, with honest occupancy and a reservation) and the ranged-mechs-at-the-base decision B (ranged units stop at about 95% of their range in front of what stops them).
  - **Build order**, each step followed by a play-test:
    1. roles and their rules replace the switch (the HUD button goes, its space goes to the energy bar) **(built in 0.4.0-dev, 2026-11-15; to play-test)**
       - Balance bot, 4 runs per cell, old rules vs. roles: almost the same. Win rates equal in most cells; battles often 10–30% shorter (stages 4–8); a few cells shift by one run (stage 4 none 75% → 100%, stage 9 split 25% → 50%, stage 10 mid/mixed 25% → 0%, stage 12 max 100% → 50%). The bot no longer has an Advance switch to push with.
    2. walking lane changes and the detour around friendly turrets
    3. melee side attack (about 100 units into the neighbor lane) **(built in 0.4.0-dev, moved ahead of step 2)**
    4. traits
    5. enemy AI deploy variety, using roles (see Enemy AI)
    6. balance pass with the bot; expect clear changes in difficulty
  - **Tests:** the rule tests are rewritten per role (one set of checks per role, not per type).
  - **Code:** data-driven. `ROLES` and `TRAITS` in data.js, each mech type gets `role` and `traits`; world.js asks for the effective rules (role merged with traits) and never checks type names.
- **[gameplay] Play-test of step 1 (roles), user 2026-11-15.** Notation: "Brawler-Gunner" = a train deployed in that order; ".f" = fighting, ".b" = waiting/blocked.
  - **Observations and causes:**
    - *Mortar.f-Brawler-Gunner: the Brawler and the Gunner wait behind the fighting Mortar.* The Brawler applies "behind a fighting friendly: join", which needs an enemy in a neighbouring lane within 300. The Mortar's enemy is ~500 away, so the Brawler waits; the Gunner may not pass a Tank, so it waits too.
    - *The Brawler doesn't get past a fighting Seeker.* Same cause.
    - *Mortar.f-Mortar.b-Brawler-Gunner: the Brawler and Gunner fan out; once the front Mortar dies, the second becomes Mortar.f and the others fan out.* A *waiting* Mortar is passed (Tanks pass non-tanks); a *fighting* one isn't (the join rule above).
    - *Mortar-Brawler-Gunner on the march: the Brawler follows the Mortar.* Overtaking a marching friendly needs at least 8 speed difference; Brawler 32 vs Mortar 28 isn't enough. So the Mortar leads and the Gunner stays behind the Brawler.
    - *Mortar-Gunner: the Gunner overtakes.* As intended (Line passes Artillery).
    - *Mortar waits behind a fighting Seeker with nothing in range.* As designed (Artillery stays behind); the Seeker's target is in a lane the Mortar can't reach (any-lane Seeker until step 4).
    - *Gunners fan out to the side with nothing to fight.* The side choice only looks for enemies in that exact lane, not what the Gunner could reach from there (±1 lane), and a target can die during the move.
    - *Brawler groups: no clear pattern when they fan out.* They only step over when an enemy is in the next lane (no side attack yet, step 3).
    - *The Brawler doesn't hit enemies in the next lane.* Intended until the side attack (step 3).
    - *The Aegis never goes around anyone.* As designed: Support passes only Artillery, and never a fighting friendly.
    - Scout and Breacher change lanes to charge correctly.
  - **Proposals:**
    - **A, a fighting friendly you may pass is passed:** behind a fighting friendly, a mech first checks the passing rules; only if it may not pass does its role's "behind a fighting friendly" rule apply (Tank joins beside a Tank, Line fans out behind a Tank or Line, Artillery waits). Fixes Mortar.f blocking Brawler-Gunner and the Brawler behind a Seeker.f. Support keeps "never passes a fighting friendly".
    - **B, a Tank always passes a marching non-tank,** whatever the speed difference, so tanks really lead (Mortar-Brawler-Gunner becomes Brawler in front). Other roles keep the 8-speed threshold.
    - **C, Artillery with no shot fans out** behind a fighting friendly (like Line) instead of waiting. It still stops at its long range, so it stays at the back.
    - **D, better fan-out side (bug fix):** pick the side from which the mech would actually have a target in range (counting its ±1 reach), then fewer friendlies, then toward the center.
    - **E, side attack (step 3) next:** makes Brawler groups readable: Brawler 2 steps beside Brawler 1 and hits the same enemy from the side.
  - **Recommendation:** A + B + D now; C yes (avoids idle artillery, the original "cowards" problem); then E as the next step before step 2.
  - **Built (user: "build as suggested", 2026-11-15): A, B, C, D and E** in 0.4.0-dev. To play-test.
  - Balance bot afterwards (4 runs per cell): still close to the old rules. Stages 1–8 mostly unchanged (stage 3/4 without upgrades 100% → 75%, stage 6 mid/mortar 25% → 75%, stage 8 battles shorter); stages 9–13 mixed, within noise (stage 9 mid/mixed 25% → 50%, mid/split 50% → 0%, max/mortar 100% → 75%; Endless 1 max 75% → 25%). The enemy's Brawler groups now hit from three sides, which makes later stages a bit harder. No compensation yet: rebalance in step 6.
- **[gameplay] Play-test of fixes A–E, user 2026-11-15.**
  - **Mortar.f-Brawler-Gunner in lane 2: the Brawler went left (toward an enemy), the Gunner went right, and the faster Gunner ended up leading in lane 2.** Cause: an overtaker picks the side closer to home, then the side with *fewer friendlies ahead*, then simply the left. The Brawler took the left by default; for the Gunner the left now had the Brawler ahead, so the tie-break sent it right. The Gunner (speed 44) is faster than the Brawler (32), so it got back to lane 2 first. The tie-break that spreads mechs out is what breaks trains.
    - **Proposal F, follow the leader:** when a mech overtakes, it prefers the side where a friendly it may not pass has just gone ahead of it (its leader), and waits a moment if that lane is still occupied beside it. The Gunner then queues behind the Brawler in lane 1 and both return to lane 2 in order. Without such a leader, the side choice stays as is, except that the side with an enemy close ahead counts as blocked for passing (passing is about getting by, not starting a fight; a Tank can still hit that enemy with its side attack).
    - F applies only to *passing*. *Fanning out* keeps its own side choice: the side from which the mech can reach an enemy (proposal D). **Built (user: "build F and I will test it", 2026-11-15)** in 0.4.0-dev, to try out; keep or drop after the play-test. One change from the proposal: a side with an enemy close ahead is *avoided* when there's a choice, not fully blocked, so a mech never gets stuck behind a fight because both sides have enemies. Balance bot with F and the lean-in (4 runs per cell): same overall difficulty as after A–E, changes within noise (stage 3 without upgrades 75% → 25% but 4 → 100%; stage 9 max 75% → 100%, stage 11 max 100% → 50%, stage 12 max 50% → 75%, Endless 1 max 25% → 50%).
  - **Gunners return to their deployment lane after passing a Brawler, but stay in the new lane after a Seeker.** Two different moves: *passing* (around Support or Artillery, and Tanks around non-tanks) is temporary and returns home; *fanning out* (a Line mech may not pass a fighting Line mech such as the Seeker, so it steps beside it to shoot too) is permanent.
    - **Decided (user, 2026-11-15): fanning out stays permanent for now.** G is kept as an option for later.
    - **Proposal G (option for later):** a fanned-out mech also returns home once the fight is over: it has had no target for about 2 s and its home lane is free. It still never goes more than one lane from where it was deployed.
  - **"Artillery with nothing to shoot fans out" only matters behind another long-range mech.** Correct: a Mortar (range 520) behind a fighting Gunner, Brawler or Seeker can almost always reach the same enemy, so it stops and shoots. It only lacks a shot when the friendly ahead outranges it in practice, i.e. Mortar.f-Mortar or Lancer.f-Mortar. Not a bug; the wording in the report was misleading.
  - **Side attack: the visible gap between the two mechs** (lane centers are 120 apart; a Brawler is 28 wide, so ~65 units of air between the bodies).
    - Options: (1) accept it; (2) undo the side attack; (3) lean in: while fighting from the side, the mech slides about 35 units toward the target (it stays in its lane; lane boundaries are 60 from the center), and back afterwards; if both lean, they touch; (4) reach: the arm visibly extends on each punch.
    - **Proposal: 3 + 4.** Leaning closes most of the gap and reads as "stepping into the fight"; the punch lunge sells the hit. Rules are unchanged; only position and art.
    - **Built: lean-in (3)** in 0.4.0-dev (`sideLean: 35` on the Tank role). The punch lunge (4) isn't built. To play-test.
    - Later, not now (user): a redesigned Brawler with a thicker body would close the gap further.
- **[ui/gameplay] Own mechs walk straight through friendly turrets** (user, 2026-11-15)
  - **Rejected:** moving turrets between the lanes. They would no longer block enemies as a wall, and the build grid and lane reach assume turrets stand in a lane.
  - **User's idea:** mechs walk around their own turrets but stay assigned to their lane.
  - **Options:**
    - **A, drawing only:** shots and hits would still start from the lane center, so they'd come from the wrong place during the detour.
    - **B, a real detour position (recommended):** the mech's x drifts into the gap between turret pads while its lane stays the same for blocking, convoy, lane reach and targeting.
  - **Details for B:**
    - the drift starts about 60 units before the turret and goes back after it
    - full forward speed, so it's purely cosmetic and doesn't affect balance
    - side: the one with an empty neighboring cell, otherwise toward the field center
    - even a full turret row leaves a ~50-unit corridor between pads (a Brawler brushes them slightly)
    - the Constructor and the enemy behave the same around their own turrets
  - **Decided (user, 2026-11-15): B.** Built in step 2 of the movement build.

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
  - **Timing (proposed 2026-11-15): after the movement steps 1–4,** as step 5. The group templates can then use roles (tank first, Line and Artillery behind it), play-tests of the movement rules aren't mixed up with AI changes, and one balance pass covers both. Until then the AI's triple-Brawler groups are a good test for the side attack.

### Under discussion
- **[balance/art] All mechs move too fast: they look like insects, not massive machines** (user, play-test 0.3.0-dev; started as "big melee mechs too fast")
  - **User (2026-11-15):** with the legs now synced, the fast stepping looks like insects scurrying. Slow all mechs down a bit, combined with bigger steps, but not so much that the game becomes sluggish.
  - **Today:** steps per second (2 footfalls per walk cycle):

    | Mech | speed | steps/s |
    |---|---|---|
    | Scout | 95 | 13.6 |
    | Gunner | 55 | 5.9 |
    | Seeker | 50 | 6.1 |
    | Aegis | 45 | 5.5 |
    | Lancer | 40 | 4.8 |
    | Mortar | 35 | 3.7 |
    | Brawler | 40 | 2.9 |
    | Breacher | 38 | ~3 |

    A walking person takes about 2 steps/s, and something big should take fewer.
  - **Proposal:**
    - **Speed −20% for every mech** (e.g. Gunner 55 → 44, Brawler 40 → 32, Scout 95 → 76). Battles get about 20% longer, and the 2× speed button is there.
    - **Strides ×1.6:** the cadence drops by half again without any further slowing. Gunner ≈ 2.9 steps/s, Brawler ≈ 1.5, Mortar ≈ 1.8, Scout ≈ 7 (light and quick is fine for it).
    - **Weight cues** that cost no speed:
      - a small body dip on each footfall
      - dust puffs under heavy mechs (Brawler, Breacher, Mortar)
      - footstep thuds (already planned in the sound backlog)
    - **Rebalance:** slower mechs spend longer under turret and base fire, which favors defense. Rerun the bot; if needed, compensate with slightly more energy income or turret tweaks.
  - **Alternatives:** only bigger strides, no slowing (keeps the pace, still looks somewhat brisk); or −30% speed (heavier, but battles drag).
  - **Built in 0.3.0-dev (2026-11-15):** −20% speed, 1.6× strides, body dip and dust for heavy mechs, overtake threshold 10 → 8. Balance bot, 4 runs per cell, old vs. new speeds:
    - win rates mostly unchanged; slightly harder in a few cells (stage 4 without upgrades 100% → 75%; stage 6 mid/mixed 100% → 75%; stage 9 mid/mixed 100% → 25%; Endless 2 max 25% → 0%)
    - battles about 10–25% longer
    - with 4 runs per cell this is partly noise
    - **Not compensated yet:** play-test first. If stages 4–9 feel harder, lower enemy income there by about 4%, or give the player +0.5 energy/s.

- **[balance] The Seeker reaches every lane** (play-test v0.2.0-dev)
  - **Current rule (by design, so far):** Seeker missiles are exempt from lane reach (gameplay.md §5.3, decision 13). A Seeker in lane 1 can hit targets in lane 5, within its range of 380.
  - **Why that may be a problem:** one Seeker covers the whole field width, so it ignores the lane tactics that lane reach was introduced for. It's also hard to read: missiles cross the entire screen.
  - **Options:**
    - **A, keep it:** the Seeker is the one "any lane" mech; that's its identity. Balance it through cost and damage if needed.
    - **B, normal reach (±1 lane) like everyone else:** simplest and consistent. The Seeker keeps its homing missiles and mech preference but loses its special role.
    - **C, extended reach (±2 lanes):** a middle ground. From lane 3 it covers every lane, from the edge lanes only three, so placement still matters.
    - **D, normal reach, but missiles keep tracking:** it picks targets only within ±1 lane, but a missile that's already flying follows a target that changes lanes (as today). Mostly the same as B, just stated explicitly.
  - **Recommendation: C (±2 lanes).** It keeps the Seeker special (the only mech that can cover the whole field, but only from the middle lane), and the edge lanes no longer reach across the map. If it's still too strong, fall back to B.
  - **Decided (user, 2026-11-15): C, ± 2 lanes,** as the Seeker's "Long reach" trait (built in step 4). From lane 3 it covers every lane, but Brawlers usually go in lanes 2/4, so there it has no tank in front and walks into heavy fire. Where to deploy it becomes a real decision.
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
    - It stops at range 320, so it fits naturally right behind the Brawler.
    - Role: Tank if it leads and brawls, Charger if it goes for walls (decide when it's designed).
  - **Unlock:** after the Sapper, so stage 9 or so, with the Sapper at 8. The enemy gets it a bit later, from around stage 10.
  - **Roster size:** 10 mechs with a loadout of 5 is still manageable, and more choice makes the loadout matter. I'd stop there, though: every further mech should fill a clear gap.
  - **Sound and look:** a deep cannon boom (the new cannon sound, heavier, with recoil), a visible recoil step, and a bright, short tracer for the shell, the opposite of the Lancer's long streak.
  - **Name ideas:** Goliath, Juggernaut, Rhino, Mauler, Warhound. **Recommendation: Goliath** (big, slow and heavy, and it doesn't clash with Bastion or Breacher). **Shortlist (user, 2026-11-14): Goliath or Warhound.**

### Planned features (agreed)
- **[feature] Sapper:** a mine-laying mech, the 9th mech. Designed in gameplay.md §5.4. Stats and unlock stage still to decide.
- **[feature] Enemy AI that counters your army,** e.g. flanking massed artillery with fast units. Agreed for later.
- *(The per-type Hold/Advance switch idea is obsolete: the switch is replaced by roles, see Gameplay / movement.)*
- **[idea] "Charge" special** (2026-11-15): for a few seconds every mech pushes forward and fires on the move. Parked; only if the decision the old Advance mode gave is missed in play-testing. The space of the old Hold/Advance button could hold it, or another special.
- **[feature] Loadout of all 8 (or 9) mechs instead of 5:** maybe, decide after play-testing.

### Sound / polish
- **[feature] Sound: synthesized round 1 + 1b done in 0.2.0-dev** (see CHANGELOG). The user liked the reworked impacts, explosions and metal sounds (2026-11-14) and is judging the rest in longer play sessions.
  - Possible later: CC0 recorded samples for guns and explosions (user: "maybe later").
  - Smaller follow-ups if wanted: a distinct character per weapon (Scout lighter rattle, Gunner deeper thump); the destroyed-mech explosion still uses the old sine metal layer.
- **[feature] Mech footstep and servo sounds** (part of the sound plan in gameplay.md §13b; not built yet).
- **[feature] Stage 1 tutorial overlay.**

### Art
- **[feature] Voxel renderer: first playable version in 0.3.0-dev** (see CHANGELOG). To check on the S25+ and tune:
  - frame rate and loading time (6.6 MB of images, loaded once, then cached)
  - readability: mech size, contrast against the ground, shadow strength, number of craters
  - still flat: effects (muzzle flashes, explosions, smoke), projectiles, HUD card icons, the destroyed base (only darkened), the Constructor's building animation
  - later: voxel card icons, voxel debris and explosions, team colors via tinting (halves image size)
  - **Play-test feedback (user, 2026-11-14):** runs smoothly on the S25+, loading isn't noticeably slower, the overall look and the craters are fine. Done in 0.3.0-dev (2026-11-15): lane stripes removed, legs synced, new Brawler (design A, fists raised), new Mortar (M1, twin tubes), shots from the actual weapons. Design previews: `tmp_files/mockups/brawler_*.png`, `mortar_designs.png`.

### Tech / housekeeping
- **[tech] Unpublish the old GitHub Pages site** (repo Settings → Pages). It still serves v0.1.0 at pmcl77.github.io/iron_defense. A task for the user.
- **[tech] Local Wi-Fi testing doesn't work:** the phone can't reach a server on the Mac (ping works, firewall off). Not needed anymore since the dev preview exists; left unsolved.

## To check during play-testing (v0.2.0-dev)
- Lane reach: do lanes 2 + 4 become the only sensible setup?
- Is the Mortar still useful with slow shells?
- Do the roles behave as described (cover behind tanks, fan-out, Chargers slipping past)?
- Difficulty of stages 7–12 and the first Endless waves.
- Is the sound realistic enough, or are CC0 samples needed?
