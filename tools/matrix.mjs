// Bot strategy matrix (ISSUES.md 2026-11-18 "Context for stats"): does the deploy strategy change the kind of game?
// Every bot strategy (tools/balance.mjs) plays the same stages and seeds; per strategy it prints the outcome and the
// strategy profile (tools/profile.mjs): where the fights happen, turret losses, damage by role, combat lifetime.
// Run: node tools/matrix.mjs [seeds=6] [stage numbers…]   (default stages 4, 7, 10)
import { play } from './balance.mjs';
import { profile, summaryOf } from './profile.mjs';
import { STAGES } from '../src/data.js';

const STRATS = ['mixed', 'mortar', 'split', 'train', 'horde', 'gunners', 'forward'];
const WORKSHOP = (stage) => (stage >= 10 ? 'max' : 'mid'); // stage 10 stalls at 'mid' (tools/lifetime.mjs)
const seeds = +(process.argv[2] || 6);
const stages = process.argv.slice(3).map(Number);
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const avgObj = (os) => { const k = [...new Set(os.flatMap(Object.keys))]; return Object.fromEntries(k.map((x) => [x, Math.round(avg(os.map((o) => o[x] || 0)))]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])); };
const o = (x) => Object.entries(x).map(([k, v]) => `${k} ${v}`).join(', ');

for (const stage of stages.length ? stages : [4, 7, 10]) {
  const variant = WORKSHOP(stage);
  console.log(`\n== stage ${stage} ${STAGES[stage - 1]?.name ?? ''}, Workshop ${variant}, ${seeds} seeds (same seeds for every strategy)`);
  for (const strat of STRATS) {
    const P = [], R = [];
    for (let k = 0; k < seeds; k++) {
      const r = play(stage - 1, 1000 + k * 17, variant, strat);
      const s = summaryOf(r.world, r.loadout); R.push({ ...r, enemyHp: s.enemyHp }); P.push(profile(s));
    }
    const f = (k, d = 0) => avg(P.map((p) => p[k])).toFixed(d);
    console.log(`${strat.padEnd(8)} wins ${R.filter((r) => r.win).length}/${seeds}, ${(avg(R.map((r) => r.time)) / 60).toFixed(1)} min, base left ours ${Math.round(100 * avg(R.map((r) => r.hp)))}% / enemy ${Math.round(avg(R.map((r) => r.enemyHp)))}%`
      + ` | tank-led ${f('tankLed')}%, forward ${f('forward')}%, group ${f('groupSize', 1)}, ${f('perMin', 1)} deploys/min, energy by role ${o(avgObj(P.map((p) => p.roleEnergy)))}`);
    console.log(`${''.padEnd(8)} game: deaths at ${f('playerDeathAt')}% / ${f('enemyDeathAt')}% of the way (ours / enemy), turrets lost ${avg(P.map((p) => p.turretsLost[0])).toFixed(1)} / ${avg(P.map((p) => p.turretsLost[1])).toFixed(1)}`
      + `, damage by role ${o(avgObj(P.map((p) => p.dmgRole)))}, combat life s ${o(avgObj(P.map((p) => p.life)))}`);
  }
}
