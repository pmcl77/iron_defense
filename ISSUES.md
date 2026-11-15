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
  - **Decided (user, 2026-11-15):** keep On hit (default) and Beams; Subtle replaced by *Pulse* (the beams flashing every 1.5 s for 0.3 s, offset per unit); Shimmer removed. Built. Also: field radius 140 → 170 (user: "needs to be increased a bit").
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
- **[tech] Local Wi-Fi testing doesn't work:** the phone can't reach a server on the Mac (ping works, firewall off). Not needed anymore since the dev preview exists; left unsolved.

## To check during play-testing (v0.2.0-dev)
- Lane reach: do lanes 2 + 4 become the only sensible setup?
- Is the Mortar still useful with slow shells?
- Do the roles behave as described (cover behind tanks, fan-out, Chargers slipping past)?
- Difficulty of stages 7–12 and the first Endless waves.
- Is the sound realistic enough, or are CC0 samples needed?
