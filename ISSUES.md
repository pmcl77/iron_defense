# Issues and backlog

Open bugs, play-test feedback and planned work. When something is done, move it to `CHANGELOG.md` and remove it here.

Labels: **bug**, **ui**, **balance**, **feature**, **tech**. Where an issue came from, e.g. "(play-test v0.2.0-dev)".

## Open

### UI / readability
- **[ui] The minimap is hard to read; mech dots are too small** (play-test v0.2.0-dev, 2026-11-14)
  - Turret squares are easy to see. Mech dots are almost invisible ("with my old eyes").
  - Make mech dots bigger.
  - Check the contrast too: team colors against the brown background, and maybe a dark outline around each dot.
  - Follow-up from the user: probably mostly **color contrast**. Red dots on brown are hard to see; blue dots are easy.
  - **Plan:** render 3–4 minimap variants side by side at real phone size and let the user pick. Options:
    - a darker (near-black olive) background
    - a lighter, more orange enemy red
    - a dark outline around each dot
    - bigger mech dots
    - shapes as well as colors (mechs as direction triangles, turrets as squares)

### Under discussion
- **[feature] Production queue** (user idea, 2026-11-14): tapping a mech card without enough energy queues the order instead of refusing it, and it deploys automatically when energy and card cooldown allow. My recommendation:
  - each order keeps the lane that was active when tapped
  - strictly first in, first out
  - energy is charged on deploy (other purchases delay the queue)
  - limited to 5 orders, shown as icons with lane numbers above the cards; tap an icon to cancel
  - the open question was "unlimited or limited"; I recommend limited (5) so the game doesn't become "fill the queue and watch"

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
