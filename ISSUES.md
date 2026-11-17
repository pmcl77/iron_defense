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
    2. walking lane changes and the detour around friendly turrets **(built in 0.4.0-dev, 2026-11-15; to play-test)**
       - Balance bot, 4 runs per cell: same picture as after H, changes within noise (stage 9 max 100% → 75%, stage 10 mid/mixed 25% → 0%, Endless 1 max 25% → 50%).
    3. melee side attack (about 100 units into the neighbor lane) **(built in 0.4.0-dev, moved ahead of step 2)**
    4. traits **(built in 0.4.0-dev, 2026-11-15; to play-test)**
       - Balance bot, 4 runs per cell: no clear change from step 2, all within noise (stage 9 max 75% → 100%, stage 13 max 50% → 75%, stage 6 mid/mortar 100% → 75%). The Aegis radius change (140 → 170) came after this run.
    5. enemy AI deploy variety, using roles **(built in 0.4.0-dev, 2026-11-15; to play-test)**. User decisions: group rate unchanged (25% → 45%), split attacks rare (~15%), rare Brawler packs (side attack makes them interesting).
       - Balance bot, 4 runs per cell (also includes the Aegis changes: radius 200, speed 46, frontmost follow, for both sides): **clearly harder.** Without upgrades stage 2 75%, stages 3–5 0% (before 50–100%). Mid upgrades: stage 6 25–50% (before 75–100%), stage 8 0–75%, stages 9–12 0%. Max upgrades: stage 9 50%, stages 10–11 25%, stage 12 and Endless 1 0% (before 75%). Rebalance in step 6.
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
- **[bug, fixed in 0.4.0-dev] Gunner passes the Brawler after the Brawler has returned home** (user, play-test 2026-11-15, many Mortar-Brawler-Gunner trains). Verified in a simulation: the Brawler returned to lane 2 first; the Gunner, still in lane 1 and faster (44 vs 32), had nothing blocking it there, walked past the Brawler and returned in front. Fix: while in the passing lane, a mech never gets ahead of a friendly in its home lane that it may not pass; it falls in behind it. Test added.
  - Follow-up (user, MO-BR-SE-GU-SE-GU trains): the GU stood idle in the passing lane next to the MO after the SE returned home and started shooting. Cause: the hold-back above also applied to a *fighting* SE. Fixed: behind a fighting friendly it may not pass, the pass becomes a fan-out (Line behind a fighting Line fans out anyway), so the GU walks on. A search over 432 train layouts found 60 such stalls before, none after. Test added.
- **[gameplay] To discuss: should Line pass a fighting Line mech?** (user, 2026-11-15: "Why can a GU not pass a SE?")
  - Now: Line passes only Support and Artillery. Behind a fighting SE, a GU fans out: it moves to the next lane for good and walks on until it's in range.
  - Proposal: add Line to Line's `passes`. Behind a fighting SE, the GU then passes it, walks on until it has a shot, and returns to its home lane in front of the SE. The column stays in one lane, ordered roughly by range (BR, GU, SE, MO).
  - Marching Line mechs still don't leapfrog: passing a marching friendly needs 8 speed difference (GU 44 vs SE 40).
  - A SE behind a fighting GU almost always has a shot already (380 vs 260 range) and simply stops.
  - Two SEs (or two GUs): with the simple version, passing is checked before the fan-out rule (fix A), so the second one never fans out; it *passes*. It usually stops beside the first as soon as it's in range, which looks like a fan-out, but it counts as passing: once it moves on and gets clearly ahead, it returns to the home lane in front of the first one.
  - If the GU's target is within range before it's clearly past the SE, it stops in the passing lane and shoots from there. It returns home once it moves on.
  - Line still fans out behind a fighting Tank (it may not pass Tanks).
  - Alternative: Line passes only a fighting friendly with *longer* range (one more role field). Then GU behind SE.f passes, while two of the same type (and SE behind GU.f) fan out exactly as today.
  - **Side choice problem (user, 2026-11-15):** a pass picks its side by the passing rules (follow the leader, else avoid a side with an enemy close ahead), a fan-out by where it gets a shot. Example: GU1 in L3 shoots an enemy in L2; GU2 behind it would *pass* via L4 (no enemy there), from where it can't reach L2. A fan-out would take it to L2. The same already happens today when a mech passes a fighting Mortar (fix A): it uses the passing side choice.
  - **Built (user: "go ahead with H and document everything", 2026-11-15)** in 0.4.0-dev, together with the stricter variant above (`passLonger` on the Line role). To play-test. Detail found while building: the shot side looks as far ahead as needed (a Mortar's target is beyond a Gunner's range + 150, the fan-out limit). Tests added; the 432-layout stall search still finds no idle Line mechs. Balance bot afterwards (4 runs per cell): a little easier for the player than after F, mostly within noise (stages 6–8 at mid now 100% everywhere; stage 9 mid/split 0% → 75%, stage 11 max 50% → 100%; stage 9 mid/mixed 50% → 25%, Endless 1 max 50% → 25%).
  - **Proposal H:** the side depends on *why* the mech moves out, not on whether it counts as a pass or a fan-out. Behind a **fighting** friendly (pass or fan-out), it takes the side from which it gets a shot soonest (the fan-out scoring); behind a **marching or waiting** friendly, the passing rules (leader first, then avoid enemies). Follow the leader still applies first in both cases, so a train goes together: in MO.f-BR-GU the BR steps toward the enemy and the GU follows it. This also partly answers "avoid enemies or go for them?" below: when there's a fight, mechs go toward it.
- **[gameplay] To discuss: passing side without a leader — avoid enemies or go for them?** (user, 2026-11-15, while testing F)
  - Now (F): a passing mech without a leader prefers a side with no enemy within ~250 ahead, then closer to home, then fewer friendlies, then the center.
  - User's concern: we also want to stop enemies before they reach our base, so steering away from them isn't always right.
  - Ideas (user):
    - **Strength check:** step toward the enemy's lane if that enemy is equal or weaker (e.g. compare HP × damage of the enemies there with the mech plus its followers); otherwise take the free side.
    - **By role:** a Tank prefers the lane with enemies (its Line followers come along via follow-the-leader), while a Line mech on its own prefers a free lane.
  - Note: the role variant fits the data-driven model (a role field such as `passSide: 'enemy' | 'free'`); the strength check needs a simple strength formula and could give unclear results when a fight is close. To discuss after testing F.
- **[gameplay] Reconsider: Tanks pass marching non-tanks regardless of speed (fix B)** (user, play-test 2026-11-15)
  - Seen: a Brawler passing a marching Mortar took a long time. Brawler 32 vs Mortar 28 means it gains only 4 units/s; getting clearly past (about 60–70 units) takes roughly 15 s, all that time in the neighbour lane.
  - Bringing back the 8-speed rule for Tanks would end that, but then a Brawler-Gunner train follows a Mortar until the Mortar stops to shoot (the original reason for B).
  - Possible middle ways for later: a Tank passes a marching friendly only if it gains at least ~3 units/s *and* the pass would finish within ~8 s; or the friendly being passed slows down a little while a Tank passes it (it "lets it by").
  - **Decided for now (user): keep B as it is**, reconsider after more F play-testing.
  - **Worse since step 2 (measured 2026-11-15):** a mech walks at 0.6× while changing lanes, so a Brawler passing a marching Mortar now needs about 46 s from stepping out to being back home in front (before: roughly 15–20 s). It spends most of a march in the neighbour lane.
    - Options: (1) the 8-speed rule again for Tanks (then MO-BR-GU follows the Mortar until it stops); (2) the friendly being passed lets it by: it walks at about 70% while a Tank passes beside it (Mortar 28 → 20, Brawler gains 12/s, pass ≈ 12 s); (3) full forward speed while changing lanes when passing (LANE_CHANGE.fwd 1.0 for passes only); (4) a Tank passes a marching friendly only if it would finish within about 10 s, otherwise it follows.
    - Recommendation: (2). It keeps "Tanks lead", reads naturally (the slow mech makes way), and only affects the moments a Tank actually passes.
    - **Decided for now (user, 2026-11-15): leave it as is**; the user will see how it feels in more play.
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
  - **Decided (user, 2026-11-15): B.** **Built** in step 2 (0.4.0-dev); to play-test. Tuning in `DETOUR` (data.js).

### Enemy AI
- **[feature] Enemy AI later:** D, stage personalities (e.g. "swarm": many light units; "siege": Lancer, Mortar, Breacher; "armored": Brawler, Aegis) for variety between stages; and the agreed "counter AI" (real counter-picking against your army). *(A + B + C built in step 5, see CHANGELOG.)*

### Under discussion
- **[ui] Enemy intel** (user, 2026-11-16: "I have no idea what level his units are"; pre-game info? before or after the loadout? or a surprise?)
  - Today nothing about the enemy is shown: its level (one per stage, all units: e.g. Scrubline 0, Ash Ridge 2, Endless up to 5), roster, base upgrades, starting turrets.
  - **Proposal:** an "Intel" line **before the loadout pick** (stage list / loadout screen): enemy unit icons, "Level N", base upgrades as pips, number of starting turrets; makes the loadout a real counter-pick (and scouting is realistic). In battle: "L N" next to the enemy HP bar.
  - Optional surprise: a type never fought before shows as "?" until first met (discovery once per new enemy type in the campaign).
  - **Decided and built (user, 2026-11-16):** intel on the loadout screen (now shown before every battle), '?' for types never fought, "L N" next to the enemy HP bar.
- **[gameplay/balance] Battles are too long** (user, 2026-11-16: "battles are too long … that is what I like about Clash Royale, as a battle is capped to 5 min maximum"; not to copy it)
  - **Data:** recorded wins 9:10, 12:33 and 22:13; the lost stage 12 win was long too. No time limit exists (only the bot stops at 10 min).
  - **Where the time goes:** the midfield stalemate, not the base. In Breakwater the enemy base stayed at 100% for about 20 minutes, then fell in about 100 s. Two rules stretch the stalemate: the enemy's income doubles over the first 7 minutes, and rises by up to 40% when the player's mechs are near its base (the harder you push, the more it deploys).
  - **Options:**
    1. **Tune in step 6:** battle length as an explicit goal (e.g. a typical win in 4–6 min); weaken the pressure bonus and/or the income doubling so a push breaks through. Numbers only, but no guaranteed maximum.
    2. **Decisive end phase for both sides:** after a few minutes, e.g. double energy for both and lower base armor, so someone breaks through. A soft limit; the battle is still won by destroying the base.
    3. **Hard time limit:** e.g. 6 min; then the side with more base HP left wins, a draw goes to a short sudden death (or counts as a loss). Most predictable for phone sessions; can end on points.
    4. **Structural:** shorter field, faster mechs or less base HP. Shortens everything, also the parts that work; only if 1–3 aren't enough.
  - ~~Recommendation: 1 + 2~~ (revised below).
  - **User (2026-11-16):** 1: balancing would make battles longer or one-sided, so why would it remove the cause? 2: interesting. 3: no, a points decision after a grind is no accomplishment. 4: probably necessary.
  - **Two causes of the grind:**
    - (a) **Rubber band:** the enemy's +40% income under pressure helps whoever is losing, so pushes get absorbed. Win rate and length are separate: removing the bonus and setting difficulty with other numbers (enemy regen, level, turrets) can keep the win rate but let a good push break through.
    - (b) **Defender's advantage from the field:** bases 2200 apart; a Brawler walks base to base in about 70 s, a Gunner about 50 s, under turret and base fire, while the defender's reinforcements fight within seconds. Numbers can't fix this; that's why 4 is needed.
  - **Option 4 in detail:** shorter field (e.g. about 1600 between bases, 5 build rows per side instead of 7) keeps the heavy, slow walk; faster mechs would undo the 0.3.0 heavy feel; less base HP barely helps (the base falls in about 100 s once reached). Affects the build grid, all stage turret positions, camera and minimap, AI rules, tests and balance.
  - **Revised recommendation:** a test version on dev with the shorter field and without the pressure income bonus; the user plays it; then decide on 2 (end phase) as a backstop; then step 6 tunes the numbers.
  - **User (2026-11-16):** a good push shouldn't be punished by a comeback mechanic, "at least not over a certain degree". Lets energy rise to max on purpose to deploy groups instead of lone mechs; maybe favour group deploys. Reinforcing a fight far from the base is almost impossible: many have died before help (any mech) arrives.
  - **The common core is travel time.** Variants of 4:
    - 4a shorter field (as above; big change).
    - 4b **march speed:** about 1.6× while no enemy is near and not fighting, combat pace on contact. Reinforcements and late group members catch up; fights still feel heavy. One rule, field and stages unchanged.
    - 4c **forward deployment:** new mechs appear at the frontmost own turret row. Gives turrets a role in attacking (none built in any recorded battle). Bigger design change (what if that turret falls?).
    - Group deploy action (user idea): later, march speed may make it less needed.
  - **Proposed order:** (1) test build: comeback bonus limited (+40% → about +10%) + 4b march speed; user plays. (2) If pushes still stall: 4a or 4c. (3) If still too long: 2, end phase. (4) Last: step 6 numbers.
  - **User (2026-11-16):** "Right now we should try some solutions with the current game to try to get playtime to a reasonable limit." **Test build (step 1 of the order) built:** pressure bonus 0.4 → 0.1 (`AI.pressureBonus`); march pace (`MARCH` in data.js: pace 60, clear 420; passing compares the actual pace). To play-test.
    - **Bot (4 runs per cell, 2026-11-16; also includes the lone-Aegis fix), before → after:** wins come faster and more often. Win times e.g. Red Cut max 316 → 208 s, Pylon Field max 218 → 151 s, Dry Ford mid 105–120 → 98 s; mid wins at stages 6–8 rose (Red Cut mid/mixed 50 → 100%, Gravel Sea mid/split 25 → 100%); max wins at stages 9–13 rose (Ironwood 50 → 100%, Endless 1 0 → 50%). Losses also come faster (Endless 3 without upgrades 141 → 98 s). Still stuck at the 600 s limit: mid at stages 9–12 (0%) and most max cells from stage 10. The bot plays worse than the user (Ash Ridge/Breakwater: user won 3★ at mid-like upgrades).
  - **Round 2: after the test build (user play-test 2026-11-16, rows 13–15)**
    - **What the test build changed:** the Seeker no longer carries the game (44–46% of kills, was 81–87%). Turrets matter (14–18% of kills, rebuilt forward at row 7). The user: "seeker feels less OP and turrets felt much more useful". **Battle length did not improve:** Ash Ridge win 22:15, Endless 1 win 28:19 ("a real grind"). Stage 8 was a clean 6-minute win.
    - **Where the time goes (row 15):** for 20 minutes the fighting stayed at 50–63% of the field (the middle, slightly on the enemy's half). At 20–25 min the enemy pushed back to about 35%. Then one push broke through and the base fell in about 2½ minutes. Both sides lost about 300–400 mechs. The base is not the problem; breaking the midfield is.
    - **Still in the code:** the enemy's income **doubles over the first 7 minutes** and stays doubled (the test build only cut the pressure bonus). In row 15 the enemy deployed 403 mechs to the player's 296.
  - **Main options (step 2 of the order): pick one to test**
    - **4a Shorter field.** Bases about 1600 apart instead of 2200, 5 build rows per side instead of 7.
      - *Effect:* every walk is about 27% shorter, and reinforcements reach the front sooner. That helps the attacker most, because the defender is already close to its own base.
      - *Catch:* the range ladder was tuned to this field. Today the gap between the two sides' frontmost rows is about 660; with 5 rows it is about 460. Then a Howitzer (500) or Lancer (540) on row 5 hits turrets on the other side's row 5, and turrets duel across the midfield. The fix is fewer rows (4) or a bigger gap. Either way it means retuning ranges or rows.
      - *Size:* big. Build grid, all stage turret positions, camera, minimap, AI rules, tests and bot.
    - **4c Forward deployment.** New mechs appear at a forward point in their lane instead of at the base.
      - *Variant 1, at your frontmost turret in that lane:* no new unit. Turrets get an attacking role, which you already play: rows 13 and 15 have turrets on row 7. If that turret falls, mechs appear at the next one or at the base.
      - *Variant 2, a new "Forward post" built by the Constructor:* a deploy point with little or no gun. Clearer, and a target worth defending and attacking. It adds a new structure (art, rules, AI).
      - *Effect:* reinforcement time drops from about 50–70 s to a few seconds for whoever holds ground. Holding ground pays, so a push snowballs instead of being absorbed.
      - *Open question:* does the enemy get it too? Its stage turrets already stand on rows 3–5, so it would profit from the start. Fair, but it could make the grind worse. Player-only is simpler, but asymmetric.
      - *Size:* medium. Spawn rule, a deploy marker on the lane buttons, AI decision, tests.
    - **Recommendation:** 4c variant 1 first. It's the smaller change, it leaves the range ladder alone, it rewards what you already do (build forward after pushing), and it attacks the travel time directly. 4a stays the fallback.
  - **Other ideas: each one isolated, each can be judged alone**
    - **A. Cap the enemy income ramp.** It doubles over 7 minutes today. Cap it at, for example, +50%, or stop it after 4 minutes. The remaining rubber band: a long battle gets harder by itself. *Size:* one number (difficulty is then tuned by stage regen in step 6).
    - **B. End phase.** After, for example, 8 minutes both sides get more income and both bases lose armor, so someone breaks through. A backstop, still won by destroying the base. *Size:* small.
    - **C. Bigger kill bounty.** Kills give 25% of the unit's cost back today; raise it to, for example, 40%. Whoever wins the fights gets more energy and can follow up, so a won fight snowballs. *Size:* one number. *Risk:* also snowballs against the player.
    - ~~D. Slower enemy turret rebuild~~: dropped. The enemy AI never builds turrets, only its stage turrets exist (my earlier "rebuilt again and again" counted both sides' turret losses: in row 15 the enemy lost its 7 stage turrets, the player lost 8 of 11).
    - **E. Midfield objective.** A capturable relay in the middle of the field (for example in lane 3) that gives its holder +energy or a shorter special cooldown. Gives the midfield a goal and breaks the symmetry. *Size:* medium (new object, art, AI).
    - **F. Limit on mechs per side.** For example at most 25 mechs on the field per side. Stops the endless 400-mech exchange, makes each unit count, and makes energy pile up for big pushes. *Size:* small. *Risk:* feels restrictive; needs a "field full" hint.
    - **G. Exposed base.** When all of a side's turrets are destroyed, its base loses its armor (or takes more damage); for the player until a turret is rebuilt, for the enemy (which doesn't build) for the rest of the battle. Clearing the defense pays off right away. *Size:* small.
    - Recorded earlier and not repeated here: air drop / forward base, air units, faster vehicles, group deploy action, "Charge" special.
    - **H. Unit variety (user, 2026-11-16).** Big and complex, not a quick test. In Clash Royale an 8-card deck out of many cards makes room for different strategies: you don't know what the opponent plays, you may hold the right counters or the wrong ones, and some games go to the end of overtime. Iron Defense has 8 units and the user found only 2–3 viable strategies (e.g. the train), nothing like a fast cheap cycle deck ("hog cycle"). Missing archetype: a **cheap, fast unit that goes only for structures** (a raider, maybe a vehicle) that ends battles if it isn't answered. Ties in with air units and vehicles (recorded above).
  - **User's first judgment (2026-11-16, not decided):**
    - 4a shorter field: wait (big), "afraid we won't get around this eventually".
    - 4c forward deployment: shortlisted; variant to be pondered.
    - A, B: doubts. Numbers that favour the player don't feel like an accomplishment.
    - C bigger kill bounty: shortlisted.
    - F limit on mechs: interesting, but a risk of passive play (waiting to deploy).
    - G exposed base: the player starts with no turrets, so its base would be exposed from the start; it would need to apply only after turrets were lost, or only to the enemy.
  - **Proposal: experiment switches on dev (2026-11-16, to decide)**
    - A dev-only "Experiments" section in Settings; every switch defaults to today's game. Each battle's stats record the switches, so battles can be compared.
    - **4c Forward deploy** (user: "turrets double as forward bases"): off / on.
      - Same lane only: a turret in L3 is a deploy point for L3, not for L2/L4. Turret placement stays a decision, one turret doesn't serve three lanes.
      - Point: just behind (base side of) the frontmost finished turret in that lane. A turret under attack still works (reinforcing is the point); when it falls, the next one back, else the base.
      - UI: the lane button shows a small "FWD" mark when that lane has a deploy point. Deploys go forward automatically. Tapping the already selected lane button again switches that lane between forward and base (for defending at home).
      - Player only for the first test (the enemy's stage turrets stand on rows 3–5 from the start).
    - **C Kill bounty:** 25% (today) / 40% / 60%.
    - **A Enemy income ramp:** ×2 over 7 min (today) / ×1.5 / none.
    - **B End phase:** off / from 6 min / from 10 min: both sides' income ×2 and an "OVERTIME" label in the HUD. Small (a timer and the label). Base armor stays (could be added later).
    - **Test order:** 4c alone first, then C, then combinations; A and B as needed.
    - **User feedback (2026-11-16):** same lane only, player only (an enemy would have to build its turrets like the player): agreed. C and A values: agreed. Automatic forward deploy: no, it would break formations across lanes (e.g. a train alternating L2/L4 when only L2 has a turret); maybe select the turret instead of the lane button? Queue: base and forward orders in one FIFO. B: 6 min is probably too early; a number box (0 = off, 1–15 min) or a list 6/8/10/15?
    - **Revised proposal:**
      - Forward is chosen, never automatic: tap a lane button = that lane at the base (as today); tap the selected lane button again = forward (button marked FWD, only when the lane has a turret); tap again = back to base. Lane buttons are always on screen (a far turret may be off-screen) and it works the same on the keyboard (press the lane key twice). Tapping an own turret on the field could later be a shortcut (a "Deploy here" button next to Sell).
      - Queue: one FIFO; each order remembers base or forward. If the turret is gone when the order's turn comes, it uses the next turret back in that lane, else the base.
      - B: a list Off / 8 / 10 / 12 / 15 min instead of a free number (quicker on a phone, fewer distinct values so battles are comparable in the stats).
      - Deploy events in the stats get a forward mark.
    - **User (2026-11-16):** multi-tap, queue and fallback agreed. B: Off / 8 / 15 min. C and A agreed. One experiment at a time: a single "Experiment" list (one entry active; combinations only as named entries added later). Tag "DEV: <name>" (not "EXP", which reads like experience points).
    - **Income today, player vs enemy (row 15, Endless 1):**
      - Player: 8/s + 3 (Power Grid perk) + 2 per Reactor level (3 levels: +6) = about 15–17/s, plus the kill bounty (25% of each enemy mech's cost; row 15: about 12,000 energy, about 7/s on average) → about 22/s. The player also pays for turrets, Constructor trips and upgrades.
      - Enemy: stage regen 12.9 × 1.15 (Reactor 1) = about 15/s at the start, doubling over 7 minutes to about 30/s, up to about 33/s under pressure. No kill bounty. Its stage turrets, levels and base upgrades are free.
      - Unit costs are the same for both. Enemy mechs get the stage level for free (Endless 1: level 2 = +30% damage and HP), player mechs from the Workshop.
      - So after 7 minutes the enemy has about 1.4× the player's income (403 vs 296 mechs deployed in row 15).
    - **Consequences:**
      - **B ×2 for both** keeps the ratio but doubles the absolute gap (about 8/s → 16/s more for the enemy). Fairer: **the same flat bonus for both** (e.g. +15/s each), which narrows the ratio and doesn't favour whoever already earns more.
      - **C** only helps the player today, because the enemy gets no bounty. Options: as planned (a player buff, tuned later), or give the enemy the same bounty (symmetric: whoever wins fights gets ahead, either side).
      - **User (2026-11-16):** B: overtime = +15/s for both. C: player-only for now (one change vs today).
    - **Built (2026-11-16):** Settings → Experiment (dev only): Off, Forward deploy, Kill bounty 40% / 60%, Enemy ramp ×1.5 / none, Overtime from 8 / 15 min (+15/s both). Stats field `exp`; forward deploys carry the turret row. Lanes remember forward/base per lane. To play-test, 4c first.
    - **Play-test 1, Forward deploy (row 16, Ash Ridge, win 21:24, 2026-11-16):** user: "not necessarily much faster, but definitely it felt more engaging deploying close to the fight". Compared with row 13 (same stage, same Workshop, no experiment): 22:15 → 21:24, mechs deployed 208 → 197 (enemy 258 → 237).
      - 189 of 197 deploys were forward. The turrets stood on rows 4–5 (row 13: row 7), about 25% of the way to the enemy base. The fighting stayed at 45–57% of the field for about 14 minutes, so forward deploys still walked about half the distance.
      - The enemy sent more Lancers (26, row 13: 9). They destroyed 6 of the player's 7 lost Sentries; Lancer reach 540 vs Sentry 290.
      - Breakthrough from about 18 min (front 64% → 72% → 94%); the base fell in about 2 minutes once reached.
      - Reading: one battle. Forward deploy makes play more engaging but only shortens the walk to the build area (rows up to 7, about 35% of the field), not to the midfield where battles stall.
    - **Play-test 2, Forward deploy (row 17, Ash Ridge, win 22:22, same loadout, turrets on rows 6–7):** 201 of 220 deploys forward (row 7 until about 8 min, then row 6 after the enemy Lancers destroyed the row-7 Sentries; 4 of 5 lost Sentries went to Lancers again).
      - The front moved forward: 55–67% of the field (row 16: 45–57%). The enemy base was first hit at about 16 min (row 16: about 18 min) and was down to 33% at 19 min, then held there for 3 minutes while the enemy pushed back; it fell at 22:22.
      - Not shorter overall. Forward deploy moves the front about 10% but doesn't break it.
      - **Seeker hordes (user: "still a viable option to push, unsure if it holds in all situations"):** the user's Seeker runs of 6–7 across L2–L4 at 15 and 18 min line up with the two breakthroughs (front 67 → 82%, enemy base 66 → 33%). Seekers: 38% of the player's deploys, 49% of its kills; the enemy's Seekers are again its top killer (31% of the player's losses). Input for step 6 (Seeker cost/HP, splash answers such as Mortar/Howitzer, or the AI reacting to hordes).
    - **User (2026-11-16): keep Forward deploy** ("more engaging and easier to react/counter enemy deployments"). Proposal: make it a normal rule (out of the Experiment list) so the other experiments are tested on top of it; the balance bot should deploy forward too (step 6).
    - **Decided and built (user, 2026-11-16: "make it stick"):** forward deploy is a normal rule (gameplay.md §5.1, §12, in-game help); removed from the Experiment list (a saved 'forward' choice reads as Off). Battles from row 18 on have it without an `exp` mark; forward deploys carry the turret row. Open: the balance bot doesn't deploy forward yet (step 6).
    - **User (2026-11-17): forward as the default.** A lane switches to FWD when its first turret is finished, back to base when its last turret is gone; still switchable with a second tap. A further turret keeps a manual base choice. Built.
    - **View (user, 2026-11-16):** in Clash Royale the whole field is always on screen; a similar game with a bigger field, panning and zooming put the user off because of the restricted view. In Iron Defense the view shows about a quarter to a third of the field. Argument for 4a: a shorter field means shorter walks *and* more of the battle on screen (maybe all of it in portrait).
    - **Play-test, Overtime from 8 min (+ forward deploy), Ash Ridge, same loadout (rows 18–19, 2026-11-16/17):** wins in **10:20** and **14:37** (forward deploy only, rows 16–17: 21:24 and 22:22).
      - Both rounds: forward turrets on row 7, which mostly survived (row 18: none lost, row 19: 2 lost; enemy Lancers 7 and 16).
      - From minute 8 both sides deploy about twice as many mechs per minute (row 19: about 8–13 → 17–22 per minute).
      - Row 18 was largely decided before overtime (front at 83% by minute 6, base first hit at minute 7); overtime sped up the end (base 89% → 0 in about 2 minutes).
      - Row 19 is the clearer case: front stuck at 54–67% until minute 11, then broke within 3 minutes of overtime (71 → 86 → 93%), base 100 → 0 in about 1½ minutes.
      - Two battles; the effect looks large. Open: how it feels (a satisfying final phase or chaos), and Overtime from 15 for comparison.
    - **User on overtime (2026-11-17):** row 18 held back on purpose to reach overtime. "It did feel a bit hectic": busy keeping the queue filled, lane/unit choice less deliberate, less time to watch the field; maybe +15/s is too much. Feels like the player would almost always win overtime; to test on a harder stage.
      - Why it favours the player: +15/s is +88% for the player (about 17 → 32/s) but +50% for the enemy (about 30 → 45/s).
      - Why hectic: more income = more taps; the player's attention is the limit, the AI has none.
      - Proposed variants to compare (to decide): (a) **smaller bonus**, e.g. +8/s; (b) **same ratio for both**, e.g. ×1.5 income each (keeps today's balance, still more units); (c) **no extra income, bases take double damage** in overtime: ends battles without more tapping. (c) addresses the hectic feel directly.
    - **User (2026-11-17):** likes some income boost (less waiting to get train formations going); bases may generally have too much HP; 8 min felt right, 15 probably too long a stalemate, maybe 10 is the "golden" number. Next: stage 12 with the current overtime, then (a)/(b)/(c).
      - Recommendation between (a) and (b): **(b) ×1.5 for both**. Fair (keeps today's balance), and less hectic than now (player about 17 → 25/s instead of 32), while the enemy gains more in absolute terms (about +15/s). Proposed entries: "Overtime ×1.5 from 10 min" and "Overtime: bases ×2 damage from 10 min" (c), replacing "Overtime from 15 min". Base HP in general: a step-6 question.
    - **Built (2026-11-17):** "Overtime ×1.5 from 10 min" (b) and "Overtime: bases ×2 damage from 10 min" (c); "Overtime from 15 min" removed. User plays stage 12 with "Overtime from 8 min" first, then compares (b)/(c) on Ash Ridge and stage 12.
    - **For later: same rules for the enemy as for a player ("PvP rules")** (user, 2026-11-16: wouldn't that be auto-balancing, except AI strategy tuning?)
      - Side vs side becomes fair by construction: same income, bounty, costs, turrets built with a Constructor, paid upgrades. What stays: units must be balanced against each other, and difficulty must come from somewhere.
      - Difficulty then comes from (a) the enemy's "account": unit levels, loadout, base upgrades, like facing another player's progress, and (b) AI skill. Today the AI is simple and its income ramp and free turrets make up for it; with equal rules the AI must play well: build and rebuild turrets, upgrade, use specials, time pushes.
      - Bonus: the balance bot could play AI vs AI mirror matches to test unit balance directly.
      - Collects: enemy bounty, free turrets, free levels, income ramp, rebuilding turrets, forward deploy for the enemy.
  - **More ideas from the user (2026-11-16), for later:**
    - **Deployment location** adds variety (in Clash Royale troops can be placed anywhere, but that's "magic"; this game leans realistic). Realistic forms: deploy at a held forward position (4c) or an air drop with cooldown that can be shot down.
    - **Air units** (helicopters/VTOL): ignore turret walls and lane blocking, only some turrets can hit them; counter-play, but new targeting rules, turret types and art.
    - **Slow mechs with massive HP plus faster driving vehicles** (tracked/wheeled): mechs stay heavy, vehicles are the fast option; fits the realistic direction and eases travel time.
    - **User, follow-up (2026-11-16):**
      - Deployment: an air drop, or a **forward base** that can be destroyed (instead of deploying at a turret).
      - Air units with roles like in real life: fast fighters, slow heavy bombers, attack helicopters, transport helicopters that drop ground units, distraction drones.
      - **Design axis (realism spectrum):** light / fast / stealthy / hard to hit / weak ↔ heavy / slow / easy target / strong defence. Today every shot hits except shells (scatter) and missiles, so "hard to hit" would need an accuracy or evasion rule (e.g. hit chance by target size and speed; small fast units dodge shells naturally).
      - **Stealth** (a special topic): a soldier hides behind a tree, a tank can't. Stealth units or a stealth special; would need detection (revealed when firing or when close, a spotter drone or radar turret).
    - **User (2026-11-16): keep it simple.** No stealth or dodging for now; if air units come, start with 2–3 straightforward ones (e.g. an attack helicopter, "a flying Seeker", and a bomber) and decide which ground units and turrets can hit them. Not to build yet.
    - **User's first test battles with march pace (2026-11-16):**
      - Ash Ridge **with** Seekers: won 3★ in **603 s** (same stage and loadout before march: 753 s, −20%). Enemy base untouched until 9:30, then fell in about 33 s. From 5:50 on almost only single Seekers in lane 3 (every 5–8 s) plus Brawlers in lanes 1 and 5: Seekers 98 of 115 kills (85%); a Seeker in lane 3 with ±2 reach covers all five lanes.
      - Ash Ridge **without** Seekers (SC, GU, BW, MO, LA): lost in 505 s. Two-lane BW+GU trains (lanes 2, 4); player base untouched until 5:00, then fell from 98% to 0 in about 25 s against 14–15 enemy mechs. Enemy Seekers were the top killer of the player's units (27 of 83).
      - ~~No turrets built in any recorded battle~~ (wrong: the first Ash Ridge win had 8 Sentries + 6 Howitzers; none in the later ones).
      - **User on turrets:** builds them only after pushing the enemy out of the own half, otherwise they're destroyed almost at once; their range leaves them exposed when no mechs draw the fire. Builds Sentries and Howitzers just behind the front. A full wall of Sentries and Howitzers after a push is "almost impenetrable with a bit of mech support". With Seekers, turrets aren't needed.
      - Ash Ridge **without** Seekers **with turrets** (SC, GU, BW, MO, LA; user: "the enemy seeker took them out rather quickly"): lost in 416 s; 14 turrets built (10 Sentries, 4 Howitzers, rows 1–2, from 16 s), all 14 lost: **9 to Lancers**, 5 to Seekers. Base 100% until 6:00, then fell in about 30 s. Enemy Seekers killed 31 of the player's mechs.
      - **Ranges:** Lancer 460 (≈497 at enemy level 2, prefers structures, ×3 against them) > Howitzer 430 > Seeker 380 (≈410) > Sentry 290 > Arc Coil 230. Turrets can't shoot back at Lancers, and Sentries not at Seekers. By design for the Lancer (siege), but turrets only work once the front is pushed forward (matches the user's practice). If still too weak after the Seeker change: step 6 could give the Sentry a bit more range or turrets more HP against artillery.
      - The enemy Seeker has been the top killer of the player's mechs in every battle since the march test (21, 27, 31).
      - **User: a Howitzer behind a Sentry can't reach a Seeker or Lancer attacking the Sentry, so both are doomed.** Numbers: Howitzer one row (100) behind; Seeker shoots the Sentry from about 410 → about 510 from the Howitzer; Lancer about 497 → about 597. Howitzer range 430. Even level with the Sentry it doesn't reach a Lancer. **Proposal for step 6:** Howitzer range about 520 (covers a Sentry one row ahead against Seekers, hits a Lancer that attacks the Howitzer itself; the Lancer still outranges front Sentries, so it keeps its siege role); and/or turret Workshop levels add range like unit levels do.
      - **User: we ignored the Mortar; should the Sentry reach Seekers?** Mortar range 520 (≈562 at enemy level 2) outranges every turret, even a 520 Howitzer; balanced by slow, inaccurate shells and 180 HP, but it can shell a turret wall safely. **Sentry: no** (it's the cheap close defence: holds Scouts, Brawlers, Breachers, outranges Gunners 290 vs 260; reaching Seekers would make the Howitzer pointless). Layers instead: Sentry stops what comes close, Howitzer covers it against ranged attackers, mechs handle what outranges both (Lancer, Mortar).
      - **Proposed range ladder:** Arc 230 < Gunner 260 < Sentry 290 < Seeker 380 < Lancer 460 < Howitzer ~520 = Mortar 520 (artillery duel; the Lancer still outranges what it sieges at the front).
      - **User (2026-11-16):** turrets should feel worthwhile but not overpowering. Likes a unit that's out of turret range sneaking up and attacking turrets: that's meant to be the Lancer, but the Mortar outranges turrets too (one reason turrets fall quickly). Idea: Sentry just reaching a Seeker in its own lane only (would need a second, lane-based range rule; not recommended, it's the kind of hidden rule the user doesn't want). Maybe a mixed line instead of Sentry front / Howitzer behind; undecided.
      - **Revised ladder (proposal):** Arc 230 < Gunner 260 < Sentry 290 < Seeker 380 < **Mortar 460** (was 520) < **Howitzer 500** (was 430) < **Lancer 540** (was 460). The Lancer is the only unit outranging all turrets (the turret hunter); the Mortar becomes anti-mech artillery the Howitzer can answer. Coverage: Seeker attacking a Sentry is about 480 from a Howitzer one row behind (in range); a Mortar attacking a Sentry is 560 from one row behind (out) but about 475 from a Howitzer in the neighbouring lane of the same row (in), so a mixed line is stronger, the user's layout still works against Seekers.
      - **Decided (user, 2026-11-16): upgrades don't change range or speed, only HP and damage** (user: range "highly intransparent … I cannot juggle 5 different ranges"; speed: movement rules compare speeds, e.g. a level 5 Seeker walked 48, faster than a level 1 Gunner 46, so passing and convoys changed with upgrades). The reload bonus folds into damage. Card text becomes "+X% damage & HP". Build in step 6 (or earlier as a quick test).
      - **User (2026-11-16):** upgrades: no range/speed, only damage/HP, less dramatic (maybe 10–15% per level), reload unsure. Wants to play the proposed ladder (thinks the Sentry may need a bit more range); the ladder must be in the spec. **Test build:** ladder (Mortar 460, Howitzer 500, Lancer 540; gameplay.md §5.4 "Range ladder"), levels +15% damage and HP only (`LEVEL_STEP`), Seeker without Long reach (same build, so the user feels the whole package; the bot measures each change on its own).
      - **Bot, each change alone vs. the march build (4 runs per cell, 2026-11-16):** Seeker reach ±1: easier and faster (max: Ash Ridge 75 → 100%, Last Bastion 25 → 100%; mostly the *enemy* Seekers getting weaker). Range ladder: slightly harder (max Ash Ridge 75 → 0%: enemy Lancers outrange the bot's turrets), lengths unchanged. Upgrades +15% dmg/HP only: much harder and longer (Quarry Road mid 186 → 329 s, Red Cut mid 100 → 25%). **Full package:** harder and longer; user-style trains (new bot strategy): Dust Belt mid 188 → 369 s, Gravel Sea mid 100 → 25%, stages 9–11 max 100 → 50%, Last Bastion max 75 → 0%. Reading: the Seeker change helps battle length; the upgrade change lengthens battles because the player's edge over the enemy shrinks: needs counter-tuning in step 6 (lower enemy level/income on later stages, or a slightly bigger step, e.g. 20%).
      - **Idea (user, 2026-11-16): split Workshop and in-battle upgrades.** Today both raise the same level with the same step. Workshop levels are permanent (strong steps make the campaign trivial), in-battle upgrades cost energy (should feel worth it). Proposal: Workshop +15%, in battle +25% (damage and HP only); the card shows e.g. "L2 +1". Catch: stronger in-battle steps bring back some "pump one unit" (the OP Seeker had 3 in-battle upgrades); a steeper cost per level counters it. Side effect: the enemy's fixed stage level uses the Workshop step, so later enemies get a bit weaker. **To decide after the user's test rounds.**
      - **Bot, horde strategy (BW-SE-SE-SE-BW):** before this build it was the bot's strongest strategy (max: 100% at every campaign stage incl. Last Bastion in 384 s; train had 75% there). After: max Ironwood 75%, Ash Ridge 25%, Breakwater 75%, Last Bastion 0%; mid Gravel Sea 100 → 25%. Horde and train are now about equal instead of the horde dominating.
      - ~~Proposal for step 6: ranges don't grow with level~~ (decided above): (today +4% per level; enemy level 2–4 shifts the ladder, e.g. Mortar 562 > Howitzer). Levels keep adding damage, HP and speed; the ladder stays fixed and turret walls can be planned. Also weakens upgraded Seekers a bit.
    - **Reading:** march pace shortens battles somewhat, but the midfield stalemate remains; bases fall within about 30 s once reached in either direction, so the base is not the bottleneck. Seekers with ±2 reach on *both* sides may also drive the stalemate: any push in one lane is shot at from three lanes.
  - Status: test build in play-test; proposal: quick test of Seeker reach ±1 (see the Seeker entry).
- **[balance/AI] Findings from the first battle with events** (Ash Ridge, stage 10, won 3★ in 753 s, 2026-11-16; one battle, so hints, not proof)
  - **Seeker carries everything:** 138 of the player's 159 kills came from Seekers (42 deployed, up to level 5); Brawler 22 deployed → 3 kills, Gunner 5 → 0, Mortar 6 → 3. Kill credit goes to the last hit, which favours long-range missiles, but the gap is large. Candidate for step 6.
  - **Two-lane setup:** the player deployed almost only in lanes 2 and 4 (57 of 75), Brawler + Seeker pairs. From there long reach covers the whole field. Matches the open question "do lanes 2 + 4 become the only sensible setup?".
  - **Enemy AI deploys a lone Aegis:** 7 of 91 enemy orders were a single Aegis (the very first deploy at 6 s too); all 15 enemy Aegis died with nothing to protect. Cause: Aegis is in `AI.defensive` and in the single-unit pick. Option: never deploy a Support alone (send it with the next group, or only as part of a group). **Fixed (user: "fix the lone Aegis", 2026-11-16):** a Support only comes as part of a group; the old code sent a lone Aegis in ~10% of orders.
  - Enemy Brawlers did little (35 deployed → 5 kills, 26 killed by Seekers); enemy Seekers were their best unit (25 → 22 kills).
  - **Battle 2** (Breakwater, stage 11, won 3★ in 1333 s, no turrets): Seekers 192 of 238 kills (81%); two-lane trains early, five-lane SE/GU spread mid-game; long grind (enemy base untouched until ~20:30).
  - **Idea (user, 2026-11-16): line of sight.** Direct-fire weapons (bullets, slugs; Gunner, Scout, Sentry, Lancer?) need a free line to the target; missiles and Mortar shells arc over friendlies. Gives the Seeker its own identity (indirect fire) instead of "a Gunner that looks different" (user: a Seeker shouldn't be just that). Fits existing rules: Line mechs already fan out when they have no shot. Questions: what blocks (friendly mechs only, or also turrets), and whether enemies block too. Not to build yet.
    - User: Gunners side by side (L2, L3, L4) already look a bit like blocked line of sight for the ones behind. (That's range: Line stops at 95% of its range, so the one queued behind is out of range.)
    - **How to define it** (user: diagonals? angles? lanes? the space between lanes?): (1) by lanes: blocked if a friendly is between them in the shooter's lane (and the target's lane for diagonals); simple, but a mech in the lane between is ignored. (2) **geometric line (recommended):** blocked if the line from gun to target passes through a friendly mech's circle; covers diagonals, angles and the gaps between lanes (lanes 120 wide, mechs about 40–60), and matches what the player sees. (3) a cone: also blocked when nearly in the way; forgiving but harder to read.
    - Details for (2): a small tolerance so it doesn't flicker; a blocked unit doesn't fire (never hits the friendly) and its role rules take over (Line fans out as now when it has no shot); start with only own mechs blocking (turrets and bases are low, enemies are part of the fight).
  - **User (2026-11-16, after the march test):** either reduce its range/reach or tune down other stats like damage; "also upgrades might buff too much". Numbers: each level gives +25% damage and HP, +4% range and speed, −4% reload. A level 5 Seeker (Workshop 2 + 3 in battle) has 2.25× damage and HP, 0.8× reload (2.8× damage per second) and range 456 instead of 380. The enemy doesn't upgrade during a battle (stage 10: level 2 = 1.5× damage and HP), so a level 5 unit has about 1.7× its damage per second and 1.5× its HP. Upgrade scaling applies to all units: a step 6 topic.
  - **User (2026-11-16): maybe the Seeker's *long reach* (±2 lanes) is what makes it overpowered.** Data fits: from lanes 2 and 4 two Seekers cover all five lanes. Options for step 6: reach ±1 (then it's a Gunner with missiles), or keep ±2 but less damage/HP or a higher cost. To decide after the user's test battles.
  - **User (2026-11-16):** kept the Seeker at its Workshop level on purpose: "fully upgraded and released as a horde they seem almost unstoppable."
  - **Battle 3** (Last Bastion, stage 12, without Seekers: Gunner, Mortar, Aegis, Lancer, Breacher; lost in 237 s): no Tank in the loadout, enemy fought deep in the player's half from about 2 min; enemy Seekers killed 12 of the player's 29 losses. Not comparable with battles 1–2 (hardest stage, no Tank).
  - **Lost data:** the user's stage 12 win with Seekers (2026-11-16) never arrived: a long battle's summary exceeded the 64 KB browser keepalive limit (and the server limit). Fixed: no keepalive above 60 KB, server limit 1 MB, final summaries kept until the server confirms.
  - **Battle 4** (Last Bastion, without Seekers: SC, GU, BW, MO, LA; lost in 440 s, no turrets): two-lane play (lanes 2 and 4); Gunners 20 and Brawlers 14 of 55 kills; enemy base never hit.
  - Status: to discuss; collect more battles first.
- **[tech/balance] Battle statistics for balancing** (user idea, 2026-11-16: "Is it possible for the game to record statistics on the cloudflare server that you could analyze?")
  - **What:** after each battle the game sends an anonymous summary (no personal data): version and build (dev/release), stage, result, stars, duration, base HP left, mechs/turrets deployed (counts), loadout, Workshop levels, enemy deploys, specials used.
  - **Options:**
    - **A, Cloudflare D1 (recommended):** a Pages Function (`functions/api/stats.js`, deploys with every push) writes one row per battle into a D1 database (free tier is plenty). User's part: create the D1 database and bind it to the `iron-defense` Pages project in the dashboard. Claude has no Cloudflare access; reading the data either by (1) the user running one export/query command and pasting the result (safest), (2) a read-only API token scoped to that database, or (3) a key-protected endpoint returning aggregates only.
    - **B, local only:** stats kept in the save on the device, plus an "Export statistics" button that copies them for pasting. No server setup, but only one device and the user has to remember to export.
  - **Details to decide:** record dev and release (tagged by build and version); a Settings switch "Send battle statistics" (on by default).
  - **Timing:** fits right before or during step 6 (balance), so tuning can use real play-tests on the phone, not only the bot.
  - Effort: about an hour of code, plus a few clicks in the Cloudflare dashboard.
  - Status: decided 2026-11-16: option A (Cloudflare D1), two databases (prod + dev). **Built** (0.4.0-dev).
  - **Setup (done by the user, 2026-11-16):** D1 databases `iron-defense-stats` (Production) and `iron-defense-stats-dev` (Preview), bound as `STATS_DB`; secret `STATS_KEY` in both environments. No `wrangler.toml` in the repo (it would override the dashboard bindings).
  - **Reading:** `https://iron-defense.pages.dev/api/stats?key=…` (dev: `dev.iron-defense.pages.dev`) returns `{summary, rows, next}`; `since=<id>` for only new rows, `limit` up to 5000. Tests: `node tools/test_stats.mjs`.
  - **First real data (2026-11-16):** stage 9 Ironwood won 3★ in 550 s by the user with mid-level upgrades and no turrets; the balance bot wins it 0% at mid. The bot plays much worse than a human, so step 6 should not rely on the bot alone.
  - **Follow-up: player/device identification** (user, 2026-11-16: friends may play, and the user plays on several devices). Today every battle is anonymous.
    - A: random device id, made once per device and kept in the save. Separates devices, not people.
    - B: optional player name in Settings (empty by default), sent with each battle; the same name on several devices links them.
    - Recommendation: A + B. Friends should be told that the game sends stats (switch in Settings).
    - B in detail: Settings row "Player name (for stats)", up to 20 characters, only a label (no login, not checked); a short device code (e.g. `#3f9a`) shown in Settings to tell devices apart.
    - **Decided (user, 2026-11-16): A + B** (the name could later become a user account, not up for debate now). **Built.**
  - **Follow-up: rounds stopped without the pause menu** (user, 2026-11-16). Pause → Quit/Restart after 15 s already sends `quit`; closing or reloading the app, or the phone killing it, sends nothing.
    - A: send on page hide. Immediate, but switching apps briefly would count as stopping and give doubles when coming back.
    - B: checkpoint: keep the running summary in local storage (every 30 s and when the app is hidden), remove it when the battle ends; at the next start, send a leftover as `abandoned`. Reliable, no doubles; arrives on the next start.
    - Recommendation: B. Play doesn't change (pause/resume works as long as the app stays open; a battle is never restored after the app was closed). Each battle gets a random id; the server replaces an `abandoned` row when the real result of the same battle arrives (game opened twice).
    - **Decided (user, 2026-11-16): B. Built.** Tests in `tools/test_stats.mjs` (replace rules, old table upgraded in place).
  - **Follow-up: event log** (user, 2026-11-16: "does it also include deployment order, timestamp and lanes?"). Today only counts per type, upgrades with time, and the 30 s timeline.
    - Proposal: add events with time: deploys of both sides `[t, type, lane]`, turrets built/sold `[t, type, lane, row]`, specials `[t, kind, x, y]`. About 3–4 KB per 10-minute battle; raise the server limit from 16 to 64 KB.
    - **Decided (user, 2026-11-16), with unit level, upgrades, plus deaths (lane, progress, killer) and the enemy order/group. Built.** Only real deploys (no queue). Format documented at `World.ev()` in `src/world.js`; a busy 10-minute battle ≈ 8 KB. Since `fmt: 2` (user, 2026-11-16): stage, lanes, rows and groups count from 1 like in the game; levels count upgrades (0 = none). Since `fmt: 3` (user: "Ready Player 1"): in events side 1 = player, 0 = enemy AI; per-side data is named (`player` / `enemy`), stage settings are `enemyStage`. Dev rows 1–6 are older formats (no `fmt` = 0-based).

- **[ui/art] Aegis: show which friendlies its field protects** (user idea, 2026-11-15: "lightning beams to friendlies in range")
  - **Today:** the field (40% less damage taken, radius 140, doesn't stack, not on the Aegis itself; it also covers own turrets and the base) is shown only as a dashed rotating circle. You can't tell who is inside.
  - **Note:** it reduces damage taken; it doesn't add HP.
  - **Options:**
    - **A, permanent beams:** a thin flickering arc from the Aegis to every protected friendly. Clearest, but with 2 Aegis and 6–8 units nearby it's 10+ lines all the time, which gets busy on the phone.
    - **B, beam on hit:** a short, bright arc (about 0.2 s) from the Aegis to a protected unit only when it actually takes reduced damage. Shows the effect exactly when it matters; quiet otherwise.
    - **C, shimmer on the protected unit:** a faint blue glint or hex outline on protected units instead of lines.
    - **D, A but subtle:** faint, mostly still lines with an occasional spark travelling along them.
  - **Recommendation: B, plus D as an option.** B reads as "the shield absorbed that" and stays readable in big fights. A settings toggle "Aegis links: off / on hit / always" covers both; default "on hit". Cheap to draw (a few lines), no gameplay effect.
  - **Built for trying out (user: "Can we somehow test all 4 options?", 2026-11-15):** Settings and the pause menu had "Aegis links: On hit / Beams / Subtle / Shimmer / Off".
  - **Aegis stood still behind a Seeker (user screenshot, stage 11, 2026-11-15):** the code held Support behind the *nearest* fighting friendly ahead (own lane ± 1), gameplay.md says the *frontmost*. Fixed to the frontmost (user agreed: the front units need the support most, even if the Aegis takes more hits). Test added.
  - **Open idea, "hold while protecting":** if the front dies and the Aegis is suddenly frontmost, it currently follows the basic Support rule: stops and shoots if an enemy is within ~170, otherwise walks on and becomes the front alone. Option: while friendlies are still fighting inside its field (but none ahead), it holds its position; it only walks on once nobody near it is fighting. To decide.
    - Further option (user): "move to protect most": the Aegis positions itself (within its ±1 lanes) where its field covers the most fighting friendlies.
    - **User (2026-11-15):** play first; "hold to protect" or "move to protect most" could become an option later.
  - **Aegis passing side (user, 2026-11-15: "Could you implement that passing side pick rule now?"):** built; Support passes on the side where its field covers the most friendlies. To play-test.
  - **Decided (user, 2026-11-15):** keep On hit (default) and Beams; Subtle replaced by *Pulse* (the beams flashing every 1.5 s for 0.3 s, offset per unit); Shimmer removed. Built. Also: field radius 140 → 170 (user: "needs to be increased a bit"), then 200 (user: "try 200").
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
- **[idea] Save slots** (user, 2026-11-16; parked, not up for discussion yet): for play-testing, switch between e.g. a fresh save (no upgrades) and the current progress. Would be a save feature. Battle stats already record Workshop levels and perks, so battles from different saves can be told apart.
- **[tech] Local Wi-Fi testing doesn't work:** the phone can't reach a server on the Mac (ping works, firewall off). Not needed anymore since the dev preview exists; left unsolved.

## To check during play-testing (v0.2.0-dev)
- Lane reach: do lanes 2 + 4 become the only sensible setup?
- Is the Mortar still useful with slow shells?
- Do the roles behave as described (cover behind tanks, fan-out, Chargers slipping past)?
- Difficulty of stages 7–12 and the first Endless waves.
- Is the sound realistic enough, or are CC0 samples needed?
