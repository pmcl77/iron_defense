# Issues and backlog

Open bugs, play-test feedback and planned work. When something is done, move it to `CHANGELOG.md` and remove it here.

**Workflow:** new findings and ideas are added here first, with options and a proposal. They're built only after we've discussed priorities and decided.

Labels: **bug**, **ui**, **balance**, **feature**, **tech**. Where an issue came from, e.g. "(play-test v0.2.0-dev)".

## Open

### UI / readability
- *(The minimap readability issue was fixed in 0.2.0-dev: a mix of variants B and D (narrow strip, dark background, big outlined triangles and squares). Variant D's wider 40 × 160 strip was tried first. The user is judging it on the phone; in the narrow strip, units in neighboring lanes can overlap.)*

### Gameplay / movement
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
  - Decide together with the melee sidestep bug above, since both change the same movement code.

### Under discussion
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
- **[feature] Production queue** (user idea, 2026-11-14): tapping a mech card without enough energy queues the order instead of refusing it, and it deploys automatically when energy and card cooldown allow. My recommendation:
  - each order keeps the lane that was active when tapped
  - strictly first in, first out
  - energy is charged on deploy (other purchases delay the queue)
  - limited to 5 orders, shown as icons with lane numbers above the cards; tap an icon to cancel
  - the open question was "unlimited or limited"; I recommend limited (5) so the game doesn't become "fill the queue and watch"

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

### Planned features (agreed)
- **[feature] Sapper:** a mine-laying mech, the 9th mech. Designed in gameplay.md §5.4. Stats and unlock stage still to decide.
- **[feature] Enemy AI that counters your army,** e.g. flanking massed artillery with fast units. Agreed for later.
- **[feature] A separate Hold/Advance switch per mech type.** A future idea, not for the next versions.
- **[feature] Loadout of all 8 (or 9) mechs instead of 5:** maybe, decide after play-testing.

### Sound / polish
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
