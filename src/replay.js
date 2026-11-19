// Replays (ISSUES.md 2026-11-19 "Exact replays"): a battle's seed, setup and player inputs (stats field `replay`,
// since 0.7.0-dev.4) re-run it exactly. Shared by the in-game viewer (main.js) and tools/replay.mjs.
import { World } from './world.js';
import { defaultSave } from './save.js';

export const STEP = 1 / 60;

// a World for this replay, at step 0 (inputs are not logged again)
export function replayWorld(rep) {
  const w = new World(JSON.parse(JSON.stringify(rep.stage)), defaultSave(), rep.unlocked, { seed: rep.seed, dev: rep.dev });
  w.replaying = true;
  return w;
}
// apply every input due before the next step, from index k; returns the next index
export function applyInputs(w, rep, k) {
  while (k < rep.inputs.length && rep.inputs[k][0] <= w.step) { const [, m, ...a] = rep.inputs[k++]; w[m](...a); }
  return k;
}
// one replay step: inputs, then the simulation; returns the next input index
export function replayStep(w, rep, k) {
  k = applyInputs(w, rep, k);
  w.update(STEP);
  return k;
}
// a replay file / stored entry is valid if it has what replayWorld needs
export function validReplay(rep) {
  return !!(rep && rep.stage && rep.unlocked && Array.isArray(rep.inputs) && Number.isFinite(rep.seed) && Number.isFinite(rep.steps));
}
