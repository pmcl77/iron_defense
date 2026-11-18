// Run: node tools/synth_howitzer.mjs (ISSUES.md, 2026-11-18: strip-first vs enemy Howitzer splash)
// Synthetic test: a line of enemy Howitzers behind an enemy front vs an identical stream of Gunners.
import { World } from '../src/world.js';
import { MECH_TYPES, TURRET_TYPES, laneX } from '../src/data.js';
import { defaultSave } from '../src/save.js';
import { lifeTracker } from './lifetime.mjs';
const ALL = { mechs: MECH_TYPES, turrets: TURRET_TYPES, specials: [] };
function scene(seed, stripFirst, mortal) {
  const st = { name: 'T', index: 0, baseHp: 1e9, lvl: 0, regen: 0, roster: ['scout'], base: {},
    turrets: mortal ? [['howitzer', 1, 5], ['howitzer', 3, 5]] : [['howitzer', 1, 5], ['howitzer', 2, 5], ['howitzer', 3, 5]] }; // enemy row 6 = y 1630
  const w = new World(st, defaultSave(), ALL, { seed, dev: { stripFirst, drift: true, returnDelay: false } });
  w.ai.energy = -1e9; w.regen = 0;
  const hw = w.entities.filter((e) => e.kind === 'turret' && e.team === 1);
  if (!mortal) hw.forEach((h) => { h.hp = h.maxHp = 1e12; });
  const sp = (type, team, l, y) => { const e = w.spawn({ kind: 'mech', type, team, lane: l, x: laneX(l), y, jitter: (w.rnd() * 2 - 1) * 20 }); if (!mortal) e.hp = e.maxHp = 1e12; return e; };
  // enemy front: Brawlers in L2-L4 holding at y 1480 (no damage in the static scene)
  const wall = (mortal ? [2] : [1, 2, 3]).map((l) => { const f = sp('brawler', 1, l, 1480); f.def = { ...f.def, speed: 0, ...(mortal ? {} : { dmg: 0 }) }; return f; });
  const ours = [];
  let next = 0, shots = 0, hitMechs = 0;
  const origSplash = w.splash.bind(w);
  w.splash = (x, y, r, dmg, team, src) => { if (src?.type === 'howitzer') { shots++; hitMechs += w.entities.filter((e) => !e.dead && e.team !== team && e.kind === 'mech' && Math.hypot(e.x - x, e.y - y) <= r + e.radius).length; } return origSplash(x, y, r, dmg, team, src); };
  let hwDead = null; const tr = lifeTracker();
  for (let t = 0; t < 120; t += 1 / 60) {
    if (t >= next && ours.length < 22) { ours.push(sp(mortal && (ours.length === 0 || ours.length === 8) ? 'brawler' : 'gunner', 0, 2, 1000)); next += 2; }
    w.update(1 / 60); w.fx.length = 0; tr.step(w);
    if (mortal && hwDead == null && hw.every((h) => h.dead)) hwDead = t;
  }
  const g = ours.filter((e) => e.type === 'gunner');
  return { hwDmg: w.log.dmg[1].howitzer?.[0] || 0, perShot: shots ? hitMechs / shots : 0, strips: w.log.strip[0][0],
    guLost: g.filter((e) => e.dead).length, hwDead, life: tr.report(w, 0, 'gunner'), wait: (w.log.wait[0].gunner || 0) / g.length };
}
for (const mortal of [false, true]) {
  console.log(mortal ? '\nB) real HP: assault on the Howitzer line (120 s, 20 Gunners + 2 Brawlers)' : 'A) static: immortal, how much splash lands (120 s)');
  for (const stripFirst of [false, true]) {
    const R = []; for (let seed = 1; seed <= 12; seed++) R.push(scene(seed, stripFirst, mortal));
    const avg = (k) => R.reduce((a, r) => a + (r[k] ?? 120), 0) / R.length;
    const died = R.reduce((a, r) => a + r.life.died, 0), life = R.reduce((a, r) => a + r.life.died * (r.life.life || 0), 0) / died;
    console.log(`  strip first ${stripFirst ? 'ON ' : 'OFF'}: Howitzer dmg to mechs ${Math.round(avg('hwDmg'))}, mechs hit per shell ${avg('perShot').toFixed(2)}, strip entries ${avg('strips').toFixed(1)}, Gunner wait ${avg('wait').toFixed(1)} s` +
      (mortal ? `, Gunners lost ${avg('guLost').toFixed(1)}/20, Howitzers all down at ${avg('hwDead').toFixed(0)} s (${R.filter((r) => r.hwDead != null).length}/12 runs), Gunner combat life ${life.toFixed(1)} s` : ''));
  }
}
