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
    s.perks = { energy: 1, armor: 1, charge: 1, regen: 1 };
  }
  if (variant === 'max') {
    for (const t of [...Object.keys(MECHS), ...Object.keys(TURRETS), 'builder']) s.tech[t] = 3;
    s.perks = { energy: 3, armor: 3, charge: 3, regen: 3 };
  }
  return s;
}

// strategies: 'mixed' (random loadout units), 'mortar' (Brawler in front, Mortars behind), 'split' (alternate waves on lanes 2 and 4),
// 'train' (the user's style: saves energy, then sends a train ordered by range, Brawler first, e.g. BW-GU-SE-MO or a
// 3-unit variation (BW-SE-MO, BW-GU-SE, BW-GU-MO), alternating lanes 2 and 4)
// 'horde' (the user's horde): saves up, then one mech in every lane at once, BW-SE-SE-SE-BW from lane 1 to 5
// (a Gunner stands in for a Seeker that isn't unlocked or is on cooldown)
// 'gunners': like 'train' but always a Brawler followed by 4 Gunners (BW-GU-GU-GU-GU), alternating lanes 2 and 4
// (the user's dev.5 Gunner hordes led by a tank; exercises fan-outs, strips and the return home behind the tank)
const HORDE = ['brawler', 'seeker', 'seeker', 'seeker', 'brawler'];
const GUNNER_TRAIN = ['brawler', 'gunner', 'gunner', 'gunner', 'gunner'];
const TRAINS = [['brawler', 'gunner', 'seeker', 'mortar'], ['brawler', 'seeker', 'mortar'], ['brawler', 'gunner', 'seeker'], ['brawler', 'gunner', 'mortar']];
export function play(i, seed, variant, strat = 'mixed', probe = null, dev = undefined) {
  const u = unlockedSet(Math.min(i, 6));
  const pref = strat === 'mortar' ? ['mortar', 'brawler', 'gunner', 'aegis', 'seeker', 'lancer', 'breacher', 'scout']
    : strat === 'train' || strat === 'horde' || strat === 'gunners' ? ['brawler', 'gunner', 'seeker', 'mortar', 'aegis', 'scout', 'lancer', 'breacher'] : PREF;
  const loadout = pref.filter((t) => u.mechs.includes(t)).slice(0, LOADOUT_SIZE);
  const w = new World(stageDef(i), makeSave(variant), { mechs: loadout, turrets: u.turrets, specials: u.specials }, { seed, dev });
  // wall plan: row 2 sentries center-out, then support turrets
  const plan = [[2, 2, 'sentry'], [1, 2, 'sentry'], [3, 2, 'sentry']];
  if (u.turrets.includes('howitzer')) plan.push([2, 0, 'howitzer']);
  plan.push([0, 2, 'sentry'], [4, 2, 'sentry']);
  if (u.turrets.includes('arc')) plan.push([2, 3, 'arc']);
  if (u.turrets.includes('howitzer')) plan.push([0, 0, 'howitzer'], [4, 0, 'howitzer']);
  let waving = 0, waveLane = 2, waveNo = 0, train = [], horde = [], hordeT = 0;
  let think = 0, r = seed * 9301 + 49297;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const dt = 1 / 60;
  while (!w.result && w.time < MAX_T) {
    w.update(dt); w.fx.length = 0;
    if (probe) probe(w);
    if ((think -= dt) > 0) continue;
    think = 0.5;
    const enemies = w.entities.filter((e) => !e.dead && e.team === 1 && e.kind === 'mech');
    const mine = w.entities.filter((e) => !e.dead && e.team === 0 && e.kind === 'mech');
    const threat = enemies.filter((e) => e.y < 900);
    // turrets: keep the plan built (turret count grows with time)
    const want = Math.min(plan.length, 2 + Math.floor(w.time / 45));
    for (const [l, row, t] of plan.slice(0, want)) {
      if (!horde.length && !train.length && !w.cells[0][l][row] && !w.orderAt(l, row) && w.energy >= TURRETS[t].cost + 30) w.order(l, row, t);
    }
    // specials
    if (w.canSpecial('emp') && (threat.length >= 3 || (mine.filter((e) => e.y > 1700).length >= 3))) w.special('emp');
    if (w.canSpecial('surge') && w.energy < 60) w.special('surge');
    if (w.canSpecial('bomb') && enemies.length) {
      let best = null, bn = 0;
      for (const e of enemies) { const n = enemies.filter((f) => Math.hypot(f.x - e.x, f.y - e.y) < 110).length; if (n > bn) { bn = n; best = e; } }
      if (bn >= 3 || (best && best.y < 600)) w.special('bomb', best.x, best.y);
    }
    // defend threatened lanes at once; otherwise attack in waves down one lane
    const afford = () => loadout.filter((t) => w.canDeploy(t));
    if (threat.length && w.energy > 60 && !horde.length && !train.length) { // (a horde or train being deployed is finished first)
      w.setLane(Math.max(0, threat.reduce((a, b) => (a.y < b.y ? a : b)).lane));
      const a = afford(); if (a.length) w.deploy(a[Math.floor(rnd() * a.length)]);
    } else if (strat === 'horde') {
      if (!horde.length) {
        const line = HORDE.map((t, l) => [loadout.includes(t) ? t : 'gunner', l]).filter(([t]) => loadout.includes(t));
        const cost = line.reduce((c, [t]) => c + MECHS[t].cost, 0);
        if (line.length && w.energy >= Math.min(w.maxEnergy - 20, cost)) { horde = line; hordeT = w.time; }
      }
      if (horde.length) {
        let [t, l] = horde[0];
        if (!w.canDeploy(t) && t === 'seeker' && w.canDeploy('gunner')) t = 'gunner';
        if (w.canDeploy(t)) { w.setLane(l); w.deploy(t); horde.shift(); }
        else if (w.time - hordeT > 25) horde = []; // a line costs more than max energy: finish it as energy comes in, give up after 25 s
      }
    } else if (strat === 'train' || strat === 'gunners') {
      if (!train.length) {
        const opts = strat === 'gunners' ? [GUNNER_TRAIN] : TRAINS.map((t) => t.filter((x) => loadout.includes(x))).filter((t) => t.length >= 2);
        const pickT = opts.length ? opts[Math.floor(rnd() * opts.length)] : loadout.slice(0, 3);
        const cost = pickT.reduce((c, t) => c + MECHS[t].cost, 0);
        if (w.energy >= Math.min(w.maxEnergy - 20, cost)) { train = [...pickT]; waveLane = waveNo++ % 2 ? 3 : 1; }
      }
      if (train.length) {
        w.setLane(waveLane);
        if (w.canDeploy(train[0])) { w.deploy(train[0]); train.shift(); }
        else if (w.energy < 30 && !mine.some((e) => e.lane === waveLane && w.time - e.born < 8)) train = []; // gave up: start over
      }
    } else if (w.energy >= Math.min(w.maxEnergy - 20, 260) || waving > 0) {
      if (waving <= 0) {
        const cnt = Array.from({ length: LANES }, (_, l) => w.cells[1][l].filter(Boolean).length);
        const m = Math.min(...cnt), opts = cnt.map((c, l) => (c === m ? l : -1)).filter((l) => l >= 0);
        waveLane = strat === 'split' ? (waveNo++ % 2 ? 3 : 1) : opts[Math.floor(rnd() * opts.length)]; waving = 4;
      }
      w.setLane(waveLane);
      const a = afford();
      let pick = a[Math.floor(rnd() * a.length)];
      if (strat === 'mortar' && a.length) {
        const tanks = mine.filter((e) => e.lane === waveLane && e.type === 'brawler').length;
        pick = !tanks && a.includes('brawler') ? 'brawler' : a.includes('mortar') ? 'mortar' : pick;
      }
      if (a.length) { w.deploy(pick); waving--; } else if (w.energy < 40) waving = 0;
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

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) main();
function main() {
  const runs = +(process.argv[2] || 6);
  const only = process.argv.slice(3).map((n) => +n - 1);
  const COLS = [['none', 'mixed'], ['mid', 'mixed'], ['mid', 'mortar'], ['mid', 'split'], ['mid', 'train'], ['mid', 'horde'], ['max', 'mortar'], ['max', 'train'], ['max', 'horde']];
  console.log('win% / avg time per strategy. Workshop: none = no upgrades, mid = level 2 + perks 1, max = level 3 + perks 3');
  console.log('stage             | ' + COLS.map(([v, st]) => `${v}/${st}`.padEnd(13)).join('| '));
  const total = STAGES.length + 3;
  for (let i = 0; i < total; i++) {
    if (only.length && !only.includes(i)) continue;
    const cells = COLS.map(([v, st]) => {
      const res = Array.from({ length: runs }, (_, k) => play(i, 1000 + k * 17, v, st));
      const wins = res.filter((x) => x.win).length, t = res.reduce((s, x) => s + x.time, 0) / runs;
      return `${String(Math.round((100 * wins) / runs)).padStart(4)}% ${String(Math.round(t)).padStart(4)}s${res.some((x) => x.timeout) ? 'T' : ' '} `;
    });
    const name = i < STAGES.length ? STAGES[i].name : `Endless ${i - STAGES.length + 1}`;
    console.log(`${String(i + 1).padStart(2)} ${name.padEnd(14)} | ${cells.join('| ')}`);
  }
}
