// Quick match (ISSUES.md 2026-11-20): one match setup, drawn from a seed. The enemy plays at the strength of your
// highest cleared stage (unit level, income, base upgrades), on the turrets of a random cleared stage, with a random
// personality and its loadout from your unlocked unit types, the surprise slot from stage 7, and the difficulty as
// its ramp. Fields in `fixed` (dev match: personality, turretStage, level) override the draws. The same seed also
// drives the battle, so the same seed and fixed fields give the same match.
import { STAGES, QUICK, SURPRISE_FROM, stageDef, randomLoadout, personalitiesFor } from './data.js';
import { mulberry32 } from './world.js';

export const DIFFS = ['easy', 'medium', 'hard'];
export const seedHex = (n) => (n >>> 0).toString(16).padStart(8, '0');
export const topStage = (cleared) => Math.max(0, Math.min(cleared, STAGES.length) - 1);

// cleared: stages cleared; types: the player's unlocked mech types. Returns { difficulty, seed, fixed, dev, top, st }.
export function quickMatch(difficulty, seed, fixed = {}, dev = false, cleared = 1, types = []) {
  const rnd = mulberry32((seed ^ 0x9e3779b9) >>> 0), top = topStage(cleared);
  const pers = personalitiesFor(types);
  // draw everything in a fixed order, used or not, so fixing one field doesn't change the others
  const drawTurret = Math.floor(rnd() * (top + 1)), drawPers = pers[Math.floor(rnd() * pers.length)] || 'firstContact';
  const turretStage = fixed.turretStage ?? drawTurret, personality = fixed.personality ?? drawPers;
  const roster = randomLoadout(rnd, types, personality);
  const surprise = top >= SURPRISE_FROM ? roster[Math.floor(rnd() * roster.length)] : null;
  const base = stageDef(top);
  const st = {
    ...base, name: 'Quick match', personality, roster, turrets: STAGES[turretStage].turrets.map((t) => [...t]),
    lvl: fixed.level ?? base.lvl, ramp: QUICK.ramp[difficulty],
    quick: { difficulty, seed, turretStage, dev, fixed: { ...fixed } },
  };
  if (surprise) st.surprise = surprise; else delete st.surprise;
  return { difficulty, seed, fixed: { ...fixed }, dev, top, st };
}
