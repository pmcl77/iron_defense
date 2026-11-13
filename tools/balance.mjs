// Balance bot: plays every campaign stage several times with a simple player policy.
// Usage: node tools/balance.mjs [runs=6] [stage numbers…]
import { World } from '../src/world.js';
import { STAGES, MECHS, TURRETS, LANES, stageDef, unlockedSet, laneX, cellY, LOADOUT_SIZE } from '../src/data.js';
import { defaultSave } from '../src/save.js';

const PREF = ['gunner', 'brawler', 'seeker', 'lancer', 'mortar', 'aegis', 'breacher', 'scout'];
const MAX_T = 600;

function makeSave(variant) {
  const s = defaultSave();
  if (variant === 'mid') {
    for (const t of [...Object.keys(MECHS), ...Object.keys(TURRETS), 'builder']) s.tech[t] = 2;
    s.perks = { energy: 1, armor: 1, charge: 1 };
  }
  return s;
}

function play(i, seed, variant) {
  const u = unlockedSet(i);
  const loadout = PREF.filter((t) => u.mechs.includes(t)).slice(0, LOADOUT_SIZE);
  const w = new World(stageDef(i), makeSave(variant), { mechs: loadout, turrets: u.turrets, specials: u.specials }, { seed });
  // wall plan: row 2 sentries center-out, then support turrets
  const plan = [[2, 2, 'sentry'], [1, 2, 'sentry'], [3, 2, 'sentry']];
  if (u.turrets.includes('howitzer')) plan.push([2, 0, 'howitzer']);
  plan.push([0, 2, 'sentry'], [4, 2, 'sentry']);
  if (u.turrets.includes('arc')) plan.push([2, 3, 'arc']);
  if (u.turrets.includes('howitzer')) plan.push([0, 0, 'howitzer'], [4, 0, 'howitzer']);
  let waving = 0, waveLane = 2;
  let think = 0, r = seed * 9301 + 49297;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const dt = 1 / 60;
  while (!w.result && w.time < MAX_T) {
    w.update(dt); w.fx.length = 0;
    if ((think -= dt) > 0) continue;
    think = 0.5;
    const enemies = w.entities.filter((e) => !e.dead && e.team === 1 && e.kind === 'mech');
    const mine = w.entities.filter((e) => !e.dead && e.team === 0 && e.kind === 'mech');
    const threat = enemies.filter((e) => e.y < 900);
    // turrets: keep the plan built (turret count grows with time)
    const want = Math.min(plan.length, 2 + Math.floor(w.time / 45));
    for (const [l, row, t] of plan.slice(0, want)) {
      if (!w.cells[0][l][row] && !w.orderAt(l, row) && w.energy >= TURRETS[t].cost + 30) w.order(l, row, t);
    }
    // specials
    if (w.canSpecial('emp') && (threat.length >= 3 || (mine.filter((e) => e.y > 1700).length >= 3))) w.special('emp');
    if (w.canSpecial('surge') && w.energy < 60) w.special('surge');
    if (w.canSpecial('bomb') && enemies.length) {
      let best = null, bn = 0;
      for (const e of enemies) { const n = enemies.filter((f) => Math.hypot(f.x - e.x, f.y - e.y) < 110).length; if (n > bn) { bn = n; best = e; } }
      if (bn >= 3 || (best && best.y < 600)) w.special('bomb', best.x, best.y);
    }
    // engagement mode: push with a group, hold while gathering
    const front = mine.filter((e) => e.y > 1000).length;
    w.setMode(front >= 4 || w.bases[1].hp / w.bases[1].maxHp < 0.35 ? 'advance' : 'hold');
    // defend threatened lanes at once; otherwise attack in waves down one lane
    const afford = () => loadout.filter((t) => w.canDeploy(t));
    if (threat.length && w.energy > 60) {
      w.setLane(Math.max(0, threat.reduce((a, b) => (a.y < b.y ? a : b)).lane));
      const a = afford(); if (a.length) w.deploy(a[Math.floor(rnd() * a.length)]);
    } else if (w.energy >= Math.min(w.maxEnergy - 20, 260) || waving > 0) {
      if (waving <= 0) {
        const cnt = Array.from({ length: LANES }, (_, l) => w.cells[1][l].filter(Boolean).length);
        const m = Math.min(...cnt), opts = cnt.map((c, l) => (c === m ? l : -1)).filter((l) => l >= 0);
        waveLane = opts[Math.floor(rnd() * opts.length)]; waving = 4;
      }
      w.setLane(waveLane);
      const a = afford();
      if (a.length) { w.deploy(a[Math.floor(rnd() * a.length)]); waving--; } else if (w.energy < 40) waving = 0;
    }
    // upgrades when energy piles up
    if (w.energy >= w.maxEnergy - 10) {
      const opts = [...loadout.slice(0, 3), 'sentry'].map((t) => [t, w.unitUpgradeCost(t)]).filter(([, c]) => c != null).sort((a, b) => a[1] - b[1]);
      if (w.baseUpgradeCost('reactor') != null && w.baseLvl.reactor < 2) w.upgradeBase('reactor');
      else if (opts.length) w.upgradeUnit(opts[0][0]);
    }
  }
  const b = w.bases[0];
  return { win: w.result === 'win', time: w.time, hp: b.hp / b.maxHp, timeout: !w.result };
}

const runs = +(process.argv[2] || 6);
const only = process.argv.slice(3).map((n) => +n - 1);
console.log('stage            | no workshop: win%  time  hp% | mid workshop: win%  time  hp%');
for (let i = 0; i < STAGES.length; i++) {
  if (only.length && !only.includes(i)) continue;
  const row = [];
  for (const v of ['none', 'mid']) {
    const res = Array.from({ length: runs }, (_, k) => play(i, 1000 + k * 17, v));
    const wins = res.filter((x) => x.win);
    const avg = (a, f) => (a.length ? a.reduce((s, x) => s + f(x), 0) / a.length : 0);
    row.push(`${String(Math.round((100 * wins.length) / runs)).padStart(4)}% ${String(Math.round(avg(res, (x) => x.time))).padStart(5)}s ${String(Math.round(100 * avg(wins, (x) => x.hp))).padStart(4)}%${res.some((x) => x.timeout) ? ' T' : '  '}`);
  }
  console.log(`${String(i + 1).padStart(2)} ${STAGES[i].name.padEnd(13)} |        ${row[0]}   |         ${row[1]}`);
}
