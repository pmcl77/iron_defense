# Changelog

All notable changes to Iron Defense. The newest version is at the top.

- **Unreleased:** what's on `dev`, playable at https://dev.iron-defense.pages.dev.
- **Released versions:** what's on `main`, live at https://iron-defense.pages.dev.

Version numbers are `MAJOR.MINOR.PATCH`, kept in `src/version.js` and shown in the game (menu and settings). Dev builds carry a `-dev.N` suffix with a build number that goes up with every dev build (e.g. `0.5.0-dev.3`); PATCH is for bug-fix releases only.

## [Unreleased]: 0.8.0-dev

### Quick match
- **Copy the seed** (0.8.0-dev.2, user idea): a Copy button next to the seed on the quick match result screen (dev builds; if the browser blocks the clipboard, a box to copy from opens); the replay list shows the seed of quick matches.
- **Quick match** (0.8.0-dev.1, decided with the user 2026-11-20): menu → Quick match → Easy / Medium / Hard (each with "wins 3 / 5") → your loadout with the enemy intel → battle. The enemy: the strength of your highest cleared stage, the turrets of a random cleared stage, a random personality with its loadout from your unlocked unit types, the surprise slot from stage 7; the difficulty is its income ramp over 7 minutes (×1.5 / ×2 / ×2.5; Medium = the campaign). Result: win or loss, the counter, Again (a new match) or Quick match. Notes and replays work as in any battle; the stats mark it `mode: quick` with difficulty, seed and turret stage.
- **Dev match** (dev builds): Quick match → Dev match…: personality (with its description and focus types), turret stage (with a list and a small map of its turrets), enemy level, difficulty and seed, each fixed or random. The seed (8 characters, e.g. `a9b3c1f2`) shows on the intel and the result screen; "Same match" plays the same setup again. The same seed and fields give the same opponent and map; the battle repeats exactly only if you play the same way.

## [0.7.0]: 2026-11-20

### Play-test notes
- **Notes, round 3** (0.7.0-dev.9, user report): the replay slider now really shows the target time while dragging (the time was overwritten every frame); the note panel has **Hide**: it shrinks to a small "✎ Note · Show" tab (keyboard closes, the whole field is visible), **Show** brings the text back.
- **Notes, round 2** (0.7.0-dev.8, user ideas): the note dialog is a compact panel at the top (3 lines), the field stays visible below it and can be panned (drag or minimap) while you type, also during a battle; replay steps ±10 s instead of ±30 s; while dragging the replay slider, the time shows where it will jump (→ m:ss).
- **Notes** (0.7.0-dev.7, dev builds, user: "build it please"): **Note…** in the pause menu during a battle, and **Note** in the replay bar, open a text field; the note is stored with that battle and moment (step and time) in the stats database (new table `notes`, created on first use; same database and key, nothing to set up). Kept on the device until the server has it. `node tools/notes.mjs <notes.json> <stats.json>` lists them with their battle; `tools/replay.mjs … --at m:ss` shows that moment. Replay files now carry the battle id, so notes work on the Mac too. The replay bar: the time moved next to the slider.

### Fixes
- **Silence behind the result screen** (0.7.0-dev.6, user report): after a battle the field keeps running behind the result dialog, and its shots and explosions kept playing until you left the dialog. Battle sounds now stop when the result screen appears (the win/lose sound still plays). Replays now have battle sound too (it was silent; off above 2×).

### Tools
- **Replays** (0.7.0-dev.4, user: "I would love to see replays in action"): every battle now uses a random seed, and the stats carry a `replay` block: the seed, the stage as played (incl. the enemy loadout, personality, surprise), your units, dev switches and every input (deploys and queue, lane taps, turret orders, cancels, sales, upgrades, specials with their target, dev switch changes) with its exact simulation step. `tools/replay.mjs` re-runs the battle and checks it against the recorded timeline samples and events (drift detection); `--at m:ss` prints who stands where. Checked: a battle played in the browser (Chromium) replays exactly in Node. Next: a replay viewer in the game.
- **Replay viewer** (0.7.0-dev.5, dev builds): menu → **Replays** lists your last 10 battles on this device (since dev.4), or **Open file…** loads a replay file (made from the stats with `node tools/replay.mjs <stats.json> <row> --export <file>`, e.g. to watch a phone battle on the Mac). The battle view with a replay bar: play/pause, −30 s / +30 s, speed 1×/2×/4×/8× (sound off above 2×), the time, and a slider to jump anywhere (jumping back re-runs from the start in the background, a few seconds for a long battle). Pan the camera as in battle. Checked with row 59 (stage 5, played on the phone): same win, same 81 events.

### Balance
- **Interim re-tune after the Workshop removal** (0.7.0-dev.3, from the user's untuned rounds rows 52–56: stage 8 win 3★, 9 loss in 5:26, 10 loss in 11:36, 11 win 3★ in 16:46, 12 loss in 4:39): enemy level 2 → 1 on Ironwood (9), Ash Ridge (10) and Last Bastion (12), the strong personalities that overran level 0 units; Breakwater (11) keeps level 2 (a weak rush) but its base HP drops 4800 → 3600 (too long, not too hard). Stages 1–8 unchanged. Endless builds on stage 12, so it starts one level lower too. The careful re-tune comes after the new unit types.

### Enemy AI
- **The enemy's door** (0.7.0-dev.2, user report: an enemy Lancer was invisible, "beneath the base", only its shots and HP bar showed): enemy groups appeared at once, front to back 34 apart, so the 3rd and 4th unit stood behind the base face, inside the base; artillery comes last in a group, and a Lancer with a target in range never walked out. The voxel graphics drew it under the base. Now every enemy unit comes through the door of its lane one by one, once the deploy point is clear or after 1.5 s at most, like the player's deploy queue. Groups keep their front-to-back order. Bot battles: no enemy mech behind its base face any more (before: thousands of frames, mostly Lancers).

### Progression
- **Workshop removed** (0.7.0-dev.1, decided with the user 2026-11-19: perks are dead weight once bought, unit tech is grind and made tuning and a fair quick match hard). Gone: credits, the Workshop screen, Veteran Training (unit, turret and Constructor tech) and the four perks (Capacitors, Reinforced Walls, Fast Uplink, Power Grid). Every battle starts the same: 100 of 300 energy, 8 energy/s, base 3000 HP, all units at level 0. Stays: the in-battle upgrades (unit levels 0–5, Bastion Gun, Reactor). The in-battle base **Armor** upgrade is also gone (an emergency QRF may replace it); the enemy base keeps its stage Armor. Old saves keep cleared stages, stars, Endless best and loadout; credits, tech and perks are dropped. **The stages are not re-tuned yet** (on purpose: the user plays them first; an interim re-tune follows in dev.2). Stats no longer send `tech` and `perks`. Bot tools (balance, matrix, lifetime) run without Workshop variants.

## [0.6.0]: 2026-11-19

### Movement
- **Stepping out to pass is diagonal** (0.6.0-dev.3): a mech changing lanes is no longer held back by the friendly in the lane it's leaving once the two are clear of each other sideways. A passing Gunner steps out, then walks on diagonally, like on its way back (before: straight sideways; user report, stage 12).
- **Strip: walk past longer guns** (0.6.0-dev.2, dev switch, on by default): a Gunner on a strip no longer stops level with a fighting Seeker or Lancer beside it (they fight from beyond its range). It walks on until it has its own target, or steps back into its lane once past. Before, it could stand idle out of range until something in front died (user report, stage 10). To test; switch it off for the old rule.

### Enemy loadouts
- **Swarm waves arrive as one crowd** (0.6.0-dev.8, user row 50: "mostly split lane style"): a wave now goes into 2 neighbouring lanes of its lane set most of the time (60%), sometimes all into one lane (25%) and only sometimes over all three (15%). Before, every wave spread over all three lanes, so 12 Scouts arrived as 4 per lane. The swarm also never draws the same lane set twice in a row (row 50 had 1-3-5 three times). Stats event `wave` now also lists its lanes.
- **Swarm waves: smaller early, more mixed in** (0.6.0-dev.7, user row 49: "waves feel better, still easy; the gap is a bit long"): the wave size grows from about 400 to 600 energy over the first 4 minutes, so the first wave comes at about 35 s instead of 50 s. Every mixed wave now has one other unit type at the back (Mortar, Aegis, Seeker), and about 1 in 3 plain waves too (before: half the mixed waves, no plain ones). Defence unchanged.
- **Swarm waves** (0.6.0-dev.6, user rows 46–47: "it felt like a swarm once they all joined"): the swarm saves its normal income for a wave (about 600 energy, up to 12 units) and releases it one unit every 1–1.2 s through its lane set, slowest first so the Scouts arrive with the Gunners. Styles per wave: plain (one unit type), mixed (other types sometimes at the back), tank-led (only with a tank). Under pressure it defends at once instead of saving. Modelled on the user's own swarms (median 10 units in 10–16 s). Stats events `wave` (style, size).
- **Swarm reworked** (0.6.0-dev.5, user report row 45: "didn't feel like a swarm, spread out all over the place"): focus types Scout + Gunner (cheap but many) instead of Scout + Seeker, and **lane sets**: the swarm deploys within three lanes (neighbours or 1-3-5) for 60–120 s, then picks a new set, preferring weakly defended lanes. Bot battles: 10–13 enemy deploys per minute (row 45: 7). Stats event `lanes` marks each new set.
- **Personalities and focus types** (0.6.0-dev.4): every enemy loadout has a personality (first contact, …, siege, swarm, artillery line, rush, elite) with 1–2 focus types, which the enemy deploys about ×2.2–3.5 as often as its other unit types (drawn per battle, steered on its own count). Artillery and Aegis focus types come more often only inside groups, never alone, so they end lower. Before, the AI's choices washed the personality out (Gravel Sea "siege": 4 Breachers and 3 Lancers of 64).
- **Defensive pick by the situation** (0.6.0-dev.4): under pressure the enemy defends like a player would: shelled from afar by artillery → a Seeker; otherwise a Brawler first if it has no tank in that lane, then Seeker/Gunner; about 30% of the time a random defender. It deploys in the lane you push hardest.
- **Endless builds personality-first** (0.6.0-dev.4): a random personality, then a loadout around its focus types.
- **Dev intel button** (0.6.0-dev.4, dev builds): "DEV" in the intel reveals personality, focus types and the surprise unit. Stats: `personality`, `focusX` (the drawn factor), `devIntel`.
- New tool `tools/focus.mjs`: simulated focus factor per stage and per random personality.
- **Every stage has its own enemy loadout** of up to 5 mech types instead of the whole roster, and the AI fields only those. Each stage gets a personality: armored, long guns, wall breakers, swarm without tanks, siege, iron wall, artillery line, rush, elite (gameplay.md §stages).
- **Frontrunner:** stage n's enemy brings the unit you unlock by clearing stage n ("beat it, then own it"). In the intel it shows as "?" (New unit) until you've fought it. Enemy introductions move up to 2 stages earlier; the stages are not re-tuned yet (that comes with the Workshop decision, ISSUES.md).
- **Surprise slot:** from stage 7 and in Endless, one enemy type shows as "?" in the intel, a different one each battle.
- **Endless:** a new random loadout every battle (5 types: at least one Line, at least one Tank or Artillery, at most one Charger).
- **Stats:** the summary has `mode` ('campaign' / 'endless'), `enemyLoadout` and `surprise`.

## [0.5.0]: 2026-11-18

Dev builds since 0.4.0: dev.1 half-lane fan-out, dev.2 damage stats, dev.3 Flanker trait (Gunner only) and dev build numbers, dev.4 columns fan out (A) and dev switches, dev.5 waiting time in the stats, dev.6 combat lifetime in the stats.

### Stats
- Battle stats now include **damage per unit type**, not only kills (final blows): damage dealt per side and attacker type, split into mechs, turrets, base and Constructor (`dmg`, Bombing as `bomb`); damage taken per type (`taken`); and the HP the **Aegis field saved** per side (`shield`). Also strip use per side (`strip`: times a mech stepped onto a strip, damage dealt from strips). From dev.5: **waiting time** per side and type (`wait`: seconds its mechs stood still with nothing to shoot; walking and fighting don't count). From dev.6: **combat lifetime** per side and type (`life`: [deaths, combat seconds of those, survivors, combat seconds of those]; the clock starts at a mech's first encounter, when it has a target or is hit, so walking to the front doesn't count). Only HP actually removed counts (no overkill). About 0.7 KB per battle.

### Gameplay: columns behind a fight (dev.4)
- A mech with no shot now also fans out (or takes a strip, or passes, by its role) behind a friendly that has **stopped** for half a second, not only behind one that is fighting. Before, only the first mech of a column behind a fight fanned out and the rest waited in line (screenshots: long Gunner columns from the forward deploy point). A marching column still stays together.

### Dev switches (dev build only, dev.4)
- Settings → Dev switches, and in the pause menu during a battle for the live ones:
  - **Diagonal lane changes** (on): a mech keeps walking forward while it changes lanes, so it moves diagonally instead of sideways; live.
  - **Return delay** (off): a passing mech whose passed friendly dies stays 2 s in the passing lane before returning; live.
  - **Gunners: strip before lane** (off): a Flanker prefers a free strip spot over a free neighbour lane; from the next battle.
- Stats record the switch values (`dev`) and live changes (event `dev`).

### Gameplay: half-lane fan-out
- In a big fight, a **Gunner** with no shot and both neighbouring lanes taken now steps onto the **strip between two lanes** and fights from there, so more of a crowd fights at once (test scene with 18 Gunners: 9 fighting instead of 5). This is the Gunner's new trait, **Flanker**; no other mech uses strips (first built for every ranged mech, narrowed after a play-test because it made Seeker hordes too strong). The strip blocks nobody, reach stays the mech's lane ±1, it never goes further than level with the fight beside it, one mech per spot (first come, first served), and it returns to its own lane when the fight is over, ahead of the mechs behind it. Same rules for the enemy.

## [0.4.0]: 2026-11-17

### Gameplay: forward deploy
- **Forward deploy** (tested as a dev experiment, kept by the user: "more engaging and easier to react"): your turrets double as deploy points for their own lane. Forward is the default: a lane switches to forward on its own when its first turret is finished (button shows **FWD**; a further turret keeps the lane's setting). Tap the selected lane button again to switch between forward and base; each lane remembers its choice, and Shift+1–5 works the same. New mechs appear just behind the lane's frontmost turret; if it falls, the next one back. When a lane's last turret is destroyed or sold, the lane switches back to the base (FWD disappears). Queued orders keep their own choice (▲ in the queue). Tapping the field near the base selects that lane at the base. Player only.

### Gameplay: overtime
- **Overtime from minute 9:** both sides' income ×1.5 (your regeneration after perks and Reactor upgrades, the enemy's after its ramp and pressure bonus); kill bounty and Energy Surge unchanged. A pulsing OVERTIME banner announces it, and the battle clock and the income display turn yellow (the display shows the new rate, e.g. "+26/s"). Tested as dev experiments (+15/s from 8 min: decisive but hectic and in the player's favour; ×1.5 from 10 min: calmer and fair); kept by the user at 9 minutes. It makes the end of a stalemate bigger, not always shorter (Last Bastion: 8 more minutes); see ISSUES.md.

### Dev experiments (removed before release)
- A dev-only experiment list in Settings tested battle length (kill bounty 40% / 60%, enemy income ramp ×1.5 / none, and the forward deploy and overtime variants above). Decided and removed for 0.4.0: kill bounty stays 25%, the enemy ramp stays as it was; forward deploy and overtime ×1.5 from 9:00 are kept as normal rules.
- Branch previews (`<branch>.iron-defense.pages.dev`) now count as dev builds.

### Gameplay
- **Roles instead of the Hold/Advance switch** (step 1 of the new movement model, gameplay.md §5.2). Every mech now follows the rules of its role, always, for you and the enemy:
  - **Tank** (Brawler): leads, keeps walking and hitting until something blocks it, fights whatever blocks it. Behind a friendly that's fighting it steps into a neighbouring lane to join, if there's an enemy there.
  - **Line** (Gunner, Seeker): stops at 95% of its range and shoots; stays behind a marching Tank for cover. Behind a fighting friendly it fans out one lane, but only if it has no shot.
  - **Support** (Aegis): follows the fight and stays about 40 units behind the nearest fighting friendly in its own or a neighbouring lane.
  - **Artillery** (Mortar, Lancer): stops at range and shoots, never passes anyone.
  - **Charger** (Scout, Breacher): heads for the first enemy structure in its path (stepping one lane over toward a turret next door), slips past enemy mechs and goes around fights, shooting on the move; it stops at a turret or the base.
  - Who may pass whom depends on the role. No mech moves more than one lane away from where it was deployed.
  - An enemy that physically blocks a mech always becomes its target.
  - The HOLD/ADVANCE button (and key F) is gone; the energy bar takes its place. The enemy no longer switches modes either.
  - The help screen lists the roles and which mechs belong to each.
- **Movement fixes after the first role play-test:**
  - a fighting friendly that a mech may pass is now passed (a Brawler no longer waits behind a fighting Mortar or Seeker, and a train like Mortar-Brawler-Gunner no longer gets stuck)
  - a Brawler passes a marching Mortar although the Mortar is only slightly slower, so tanks really lead
  - Artillery with no shot steps one lane over behind a fighting friendly instead of waiting
  - fanning out picks the side from which the mech can actually reach an enemy soonest
- **Side attack** (step 3): a Brawler also hits enemies in the neighbouring lane (up to about 100 units) and stops beside them to fight. Behind a fighting Brawler, the next one steps beside it, so a group of three attacks one enemy from three sides. While fighting from the side it leans about 35 units toward the enemy (still in its own lane) and moves back afterwards, so there's no gap between the two mechs.
- **Walking lane changes** (step 2): mechs walk diagonally into the next lane at their own pace (Scout ≈ 1.6 s, Gunner ≈ 2.7 s, Brawler ≈ 3.8 s, Mortar ≈ 4.3 s) and turn their legs toward where they walk; before, every lane change took 0.5 s. While crossing, a mech occupies both lanes, so nobody walks through it or starts into the same spot; it counts as being in the new lane from the halfway point.
- **Walking around own turrets** (step 2): mechs, the Constructor and enemy mechs no longer walk through their own turrets. They drift around the pad (toward an empty neighbour cell, or through the gap between two pads) at full speed and stay in their lane. Their legs turn diagonally around the pad, like during a lane change, instead of gliding sideways.
- **Enemy AI deploys like a player** (step 5): groups are small mixed formations from role templates, deployed front to back (e.g. Brawler + Gunner, Brawler + Mortar, two Gunners + Aegis, Breacher + Lancer), instead of 2–3 copies of one type. Same-type packs only for Scouts and, rarely, two Brawlers. About 15% of groups are split attacks into two lanes. Lanes are weighted toward weak defences instead of always the weakest, with a penalty for recently used lanes. Under pressure it picks from Brawler, Gunner, Seeker and Aegis instead of always a Brawler. Group rate unchanged (25% → 45%).
- **Aegis links:** a setting in Settings and the pause menu shows whom an Aegis protects: *On hit* (a short arc when a protected unit takes reduced damage, default), *Beams* (flickering arcs to everyone in the field), *Pulse* (the same arcs flashing every 1.5 s) or *Off*.
- **Aegis field radius 140 → 200** (user), so it covers more of a group, also in the neighbouring lanes. Applies to the enemy's Aegis too.
- **Aegis speed 36 → 46** (user): a little faster than the Line mechs (Gunner 44, Seeker 40), so it catches up with the fight it follows. It now keeps its 40-unit follow distance behind a marching friendly too, so it's already in its spot when that one stops.
- **Fixed: the Aegis follows the frontmost fighting friendly** in its own and the neighbouring lanes, as gameplay.md describes. Before, the nearest fighting friendly ahead held it back, so it often parked behind a long-range Seeker at the back of the fight instead of shielding the front.
- **Aegis passes toward the group it can protect:** when it passes a Mortar or Lancer, it picks the side where its field covers the most friendlies.
- **Traits** (step 4): a trait changes exactly one rule of a mech's role. The Seeker has *prefers mechs* and *long reach*: it now targets two lanes to each side instead of every lane (from lane 3 it still covers the whole field, from an edge lane only three lanes). The Lancer has *prefers structures* (unchanged behaviour). Help lists the traits.
- **Follow the leader when passing** (to try out): a mech that passes takes the same side as the mech leading it (one it may not pass), so a train like Mortar-Brawler-Gunner stays in order. Without a leader, it prefers a side with no enemy close ahead, then toward the center (before: simply the left).
- **Passing side by purpose (H):** passing a *fighting* friendly, a mech takes the side from which it gets a shot soonest (like a fan-out), e.g. toward the lane the Mortar ahead is shooting at. Passing a marching or waiting friendly still avoids enemies. Follow the leader comes first in both cases.
- **Line passes a fighting friendly with a longer range:** a Gunner behind a fighting Seeker passes it and returns to its lane in front, so the column stays in one lane. Two of the same type, or a Seeker behind a fighting Gunner, fan out as before.
- **Fixed:** after passing, a faster Line mech could walk past its Tank in the passing lane and return home ahead of it (Mortar.f-Brawler-Gunner ended Gunner-first). It now falls in behind the Tank. If the mech it may not pass stops to fight instead (MO.f-SE-GU: the Seeker returns home and shoots), the pass becomes a fan-out and the Gunner walks on in the passing lane instead of standing still.

- **Enemy AI never deploys an Aegis alone** (found in the battle statistics): it comes only as part of a group. Before, about 1 in 10 enemy orders was a lone Aegis with nothing to protect.

- **Battle length test** (ISSUES "Battles are too long"):
  - **March pace:** a mech with nothing near walks at least 60, so slow types (Mortar, Brawler, Seeker, Gunner) reach a distant fight much sooner; on contact they drop back to their heavy combat pace. Faster mechs (Scout) keep their speed. Both sides march; a column stays together.
  - **Smaller comeback bonus for the enemy:** its extra income when your mechs push toward its base is now at most +10% (was +40%), so a good push isn't simply absorbed.

- **Seeker, turrets and upgrades test** (ISSUES, 2026-11-16):
  - **Range ladder:** Mortar 460 (was 520), Howitzer 500 (was 430), Lancer 540 (was 460). The Lancer is now the only unit that outranges every turret; a Howitzer can cover the Sentries in front of or beside it against Seekers (and beside it against Mortars). Full ladder in gameplay.md §5.4.
  - **Upgrades add only damage and HP, +15% per level** (was +25%, plus range, speed and fire rate). Ranges and speeds never change with level, so formations and the range ladder behave the same in every battle.
  - **Seeker: normal reach** (own lane ± 1; the Long reach trait is removed from it).

### UI
- **Camera stays put when you pick a turret card.** It used to jump back to your base to show all build cells; now it keeps your view (e.g. the front turret line), as the user asked.
- **Endless button** names the wave it starts ("Endless · wave 3"): the first wave you haven't won yet. Before, "from N" restarted the last wave you had already won.
- **Battle clock** in the top bar, under the stage name (minutes:seconds; stops when the battle ends).
- **Deployment queue back to 6 slots.** The status next to it is shorter so nothing is clipped on a phone: "⚡40" (energy still missing), "⏱3s" (card cooldown), "go". On narrow phones (under 380 px) the slots get slightly slimmer so it fits down to 320 px.
- **Enemy intel** on the loadout screen, which now opens before every battle: the enemy's unit types, level, starting turrets and base upgrades, so you can pick your loadout against it. Unit types you've never fought show as "?" until you meet them (a save from before counts the units of all cleared stages as met). In battle the enemy level stands next to its HP bar.

### Tech
- **Battle statistics:** after each battle (and when you quit or restart a battle after 15 s or more) the game sends a summary to the site: version, stage, result, stars, time, base HP, loadout, Workshop levels, mechs and turrets per type for both sides, losses, specials, upgrades and a 30 s timeline. Stored in Cloudflare D1 (`functions/api/stats.js`; release and dev in separate databases), readable only with the key. Switch: Settings → *Send battle stats* (on by default). Offline or on the local test server nothing is sent and nothing breaks.
  - **Device id and player name:** each battle carries a random id of the device (kept when you reset progress) and, if set, the player name from Settings (optional, up to 20 characters, just a label). Settings shows a short device code, e.g. `#3f9a`.
  - **Event log:** every battle also lists its events in time order: deploys of both sides (unit, level, lane; for the enemy also which order and group, so split attacks show), turrets finished and sold (lane, row), deaths (lane, how far the mech got, which unit killed it), specials (with the Bombing target) and upgrades. About 8 KB for a busy 10-minute battle, 36 KB for 22 minutes; the server accepts up to 1 MB. Stage, lanes (1–5), rows (1–7 from that side's base) and groups count from 1, as in the game; levels count upgrades (0 = none). In events side 1 = player, 0 = enemy AI; everything else per side is named `player` / `enemy`.
  - **Fixed: long battles were lost.** Browsers refuse "send while closing" uploads over 64 KB (and the server had the same limit), so a long battle's summary silently failed. Now big summaries are sent normally, and every final summary stays on the device until the server has confirmed it; otherwise it's sent again at the next start. A summary over 1 MB (hours of play) would be sent without its event list (`eventsDropped` = how many).
  - **Fixed: results of long battles arrived late.** Over about 25 minutes a summary was bigger than 60 KB and was sent as a normal upload, which the phone stops when you switch to another app right after the battle; it then waited on the device until the next start. Summaries are now gzipped (a 28-minute battle: 60 KB → 11 KB) and sent the "survives switching apps" way, and anything pending is sent again when the app comes back to the foreground, when the network returns and when you go back to the menu.
  - **Abandoned rounds:** while a battle runs, the game keeps a checkpoint on the device (every 30 s and when the app goes to the background). If the app is closed or killed during a battle, the round is sent as `abandoned` at the next start. Each battle has a random id, and the server replaces an `abandoned` entry if the real result of the same battle arrives later. Playing doesn't change: a battle is not restored after the app was closed.

## [0.3.0]: 2026-11-15

### Gameplay
- **All mechs walk 20% slower,** so they feel big and heavy rather than scurrying: Scout 76, Gunner 44, Seeker 40, Aegis 36, Brawler 32, Lancer 32, Breacher 30, Mortar 28. The overtake threshold scales with it (8 instead of 10 faster).
- **Shots leave from the actual weapons** (at the right height, matching the voxel models; the torso now has 64 turn steps instead of 32 so the drawn gun and the shot line up): the Gunner fires alternately from its left and right gun, the Seeker launches one missile from each shoulder pod at once, the Mortar and the Sentry turret alternate between their two barrels, and the Scout, Aegis, Lancer and Howitzer fire from their gun's muzzle.

### Art
- **Voxel graphics (first playable version, the final art style from sample 7):**
  - an angled view with medium voxels
  - mechs, turrets, the Constructor and both bases come from the voxel models, with hard sun shadows
  - the ground has dirt tracks, craters, grass tufts and pebbles
  - mechs show their walking legs and turning torso; turrets turn their heads
  - all sprites are pre-rendered (`tools/bake_voxel.cjs`) in 16 body directions, 64 aim directions and 5 walk frames, so the phone doesn't compute voxels while playing
  - effects, HP bars and overlays reuse the flat style, adjusted to the angled view
- **New Brawler design ("Bulwark"):** 10% bigger, wider body and stance, big shoulder plates over both sides, fists raised in a guard, a front bumper bar and exhaust stacks.
- **New Mortar design:** twin short mortar tubes on the shoulders (lighter gunmetal) and an ammo box on the back, instead of one big tube in the middle.
- **Longer, heavier strides** (1.6×): about 3 steps per second for a Gunner and 1.5 for a Brawler. Heavy mechs (Brawler, Breacher, Mortar) dip slightly on each step and kick up dust when a foot lands.
- **Legs step in sync with movement:** one walk cycle per stride length, so feet no longer slide; bigger mechs take longer, slower steps. 5 leg positions instead of 3.
- No more stripes inside the lanes; the grass edges mark them.
- **Settings → Graphics:** Voxel (default) or Simple (the flat development art). It falls back to Simple automatically if the images can't be loaded.

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
