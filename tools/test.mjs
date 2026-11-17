// Headless rule tests for the simulation. Run: node tools/test.mjs
import { World } from '../src/world.js';
import { EXPERIMENTS, OVERTIME_BONUS, ENERGY, TRAITS, LEVEL_STEP, levelMult, MARCH, stageDef, QUEUE, MECHS, MECH_TYPES, TURRET_TYPES, TURRETS, CONSTRUCTOR, laneX, laneOf, cellY, unlockedSet, sellRefund, BASE_FACE } from '../src/data.js';
import { defaultSave } from '../src/save.js';

const ALL = { mechs: MECH_TYPES, turrets: TURRET_TYPES, specials: ['bomb', 'emp', 'surge'] };
let pass = 0, fail = 0;
function check(name, cond, info = '') {
  if (cond) pass++; else { fail++; console.log(`FAIL  ${name}${info ? '  — ' + info : ''}`); }
}
// A quiet test world: no enemy income, no player regen, plenty of energy.
// march: the march pace (MARCH.pace by default); 0 = off, for tests of the rules at combat pace
function mk(turrets = [], march, exp) {
  const st = { name: 'Test', index: 0, baseHp: 1e6, lvl: 0, regen: 0, roster: ['scout'], turrets, base: {} };
  const w = new World(st, defaultSave(), ALL, { seed: 7, march, exp });
  w.ai.energy = -1e9; w.regen = 0; w.energy = 5000; w.maxEnergy = 5000;
  return w;
}
const mech = (w, type, team, lane, y, hp) => {
  const e = w.spawn({ kind: 'mech', type, team, lane, x: laneX(lane), y });
  if (hp) { e.hp = e.maxHp = hp; }
  return e;
};
const run = (w, s) => { for (let t = 0; t < s; t += 1 / 60) w.update(1 / 60); };
const tough = (e) => { e.hp = e.maxHp = 1e9; return e; };

// 1. opposing mechs in the same lane block each other
{
  const w = mk();
  const a = mech(w, 'gunner', 0, 2, 900, 1e9), b = mech(w, 'gunner', 1, 2, 1600, 1e9);
  a.def = { ...a.def, range: 1 }; b.def = { ...b.def, range: 1 }; // don't stop to shoot
  run(w, 12);
  check('opposing mechs block', b.y - a.y >= a.radius + b.radius - 0.01, `gap ${(b.y - a.y).toFixed(1)}`);
}
// 2. Line: stops at 95% of its range in front of a turret and stays in its lane
{
  const w = mk([['sentry', 2, 6]]);
  const t = tough(w.cells[1][2][6]); t.def = { ...t.def, dmg: 0 };
  const g = mech(w, 'gunner', 0, 2, 1100, 1e9);
  run(w, 15);
  const edge = t.y - g.y - t.radius;
  check('line stops at 95% range', Math.abs(edge - 260 * 0.95) < 3, `edge ${edge.toFixed(1)}`);
  check('line never steps around a turret', g.lane === 2);
}
// 3. Tank walks up to a turret; Charger stops at range of it; Charger steps over toward a turret next door
{
  const w = mk([['sentry', 2, 6]]);
  const t = tough(w.cells[1][2][6]); t.def = { ...t.def, dmg: 0 };
  const b = mech(w, 'brawler', 0, 2, 1100, 1e9);
  run(w, 25);
  check('tank walks up to the turret', Math.abs(t.y - b.y - t.radius - b.radius) < 1 && b.lane === 2, `gap ${(t.y - b.y).toFixed(1)}`);
  const w2 = mk([['sentry', 2, 6]]);
  const t2 = tough(w2.cells[1][2][6]); t2.def = { ...t2.def, dmg: 0 };
  const sc = mech(w2, 'scout', 0, 2, 1100, 1e9);
  run(w2, 15);
  check('charger stops at range of a turret', sc.lane === 2 && Math.abs(t2.y - sc.y - t2.radius - 150 * 0.95) < 3, `y ${sc.y.toFixed(0)}`);
  const w3 = mk([['sentry', 3, 6]]);
  const t3 = tough(w3.cells[1][3][6]); t3.def = { ...t3.def, dmg: 0 };
  const sc3 = mech(w3, 'scout', 0, 2, 1100, 1e9);
  run(w3, 15);
  check('charger steps over toward a turret in the next lane', sc3.lane === 3 && sc3.y < t3.y, `lane ${sc3.lane}`);
}
// 4. a complete wall stops everything
{
  const w = mk([0, 1, 2, 3, 4].map((l) => ['sentry', l, 6]));
  for (const l of [0, 1, 2, 3, 4]) { const t = tough(w.cells[1][l][6]); t.def = { ...t.def, dmg: 0 }; }
  const g = mech(w, 'scout', 0, 2, 1100, 1e9), b = mech(w, 'breacher', 0, 1, 1100, 1e9);
  run(w, 30);
  check('full wall stops', g.y < cellY(1, 6) - 30 && b.y < cellY(1, 6) - 30, `y ${g.y.toFixed(0)} / ${b.y.toFixed(0)}`);
}
// 5. targets ahead are preferred; behind only when nothing is ahead
{
  const w = mk();
  const g = mech(w, 'gunner', 0, 2, 1000, 1e9);
  const behind = mech(w, 'scout', 1, 2, 880, 1e9), front = mech(w, 'scout', 1, 3, 1150, 1e9);
  behind.def = front.def = { ...behind.def, dmg: 0, speed: 0 };
  w.update(1 / 60);
  check('prefers target ahead', g.target === front);
  front.dead = true; w.update(1 / 60);
  check('turns to target behind when nothing ahead', g.target === behind);
}
// 6. constructor: fee, build, return, refund
{
  const w = mk();
  const e0 = w.energy, cost = TURRETS.sentry.cost;
  check('order accepted', w.order(1, 2, 'sentry'));
  check('order pays up front', w.energy === e0 - cost);
  w.update(1 / 60);
  check('constructor fee charged', w.con && w.energy === e0 - cost - CONSTRUCTOR.fee);
  run(w, 20);
  check('turret built', !!w.cells[0][1][2] && w.cells[0][1][2].type === 'sentry');
  check('constructor returned, fee refunded', !w.con && w.energy === e0 - cost, `energy ${w.energy}`);
}
// 7. constructor destroyed mid-build: order kept, new constructor after 3 s for a new fee
{
  const w = mk();
  w.order(2, 5, 'howitzer');
  run(w, 0.1);
  for (let i = 0; i < 600 && !w.con.building; i++) w.update(1 / 60);
  run(w, 0.5);
  const e1 = w.energy;
  w.damage(w.con, 1e9, null, 1);
  w.update(1 / 60);
  check('order kept after constructor loss', w.orders.length === 1 && w.orders[0].progress === 0);
  run(w, 2.5);
  check('no constructor during respawn delay', !w.con);
  run(w, 1);
  check('new constructor after delay, new fee', !!w.con && Math.abs(w.energy - (e1 - CONSTRUCTOR.fee)) < 1e-6, `energy ${w.energy} vs ${e1}`);
}
// 8. cancel refunds in full; sell refunds 50% at full HP
{
  const w = mk();
  const e0 = w.energy;
  w.order(0, 0, 'arc'); w.cancel(0, 0);
  check('cancel refunds in full', w.energy === e0);
  w.energy = 1000;
  const t = w.placeTurret(0, 'sentry', 4, 4), e1 = w.energy;
  w.sell(4, 4);
  check('sell refund at full HP', w.energy === e1 + sellRefund(TURRETS.sentry, 1) && t.dead && !w.cells[0][4][4]);
}
// 9. Breacher: ×4 vs turrets and stun; Lancer ×3
{
  const w = mk([['sentry', 2, 6]]);
  const t = tough(w.cells[1][2][6]);
  const b = mech(w, 'breacher', 0, 2, t.y - t.radius - 31, 1e9);
  b.cool = 0; b.aim = 0;
  const hp0 = t.hp;
  w.update(1 / 60);
  check('breacher deals ×4 to turrets', Math.abs(hp0 - t.hp - 30 * 4) < 1e-6, `dmg ${hp0 - t.hp}`);
  check('breacher stuns turret', t.stun > 0.2);
  const w2 = mk([['sentry', 2, 6]]);
  const t2 = tough(w2.cells[1][2][6]); t2.def = { ...t2.def, dmg: 0 };
  const l = mech(w2, 'lancer', 0, 2, t2.y - 400, 1e9); l.cool = 0; l.aim = 0;
  const h2 = t2.hp; run(w2, 0.3);
  check('lancer deals ×3 to turrets', Math.abs(h2 - t2.hp - 90) < 1e-6, `dmg ${h2 - t2.hp}`);
}
// 10. specials
{
  const w = mk([['sentry', 1, 3]]);
  w.energy = 250; w.maxEnergy = 300; w.specialCd.surge = 0;
  w.special('surge');
  check('surge respects the cap', w.energy === 300);
  const m = mech(w, 'scout', 1, 2, 1500);
  w.specialCd.emp = 0; w.special('emp');
  check('EMP stuns enemy mechs and turrets', m.stun === 4 && w.cells[1][1][3].stun === 4);
  const n = mech(w, 'scout', 1, 2, 1500, 1000);
  w.specialCd.bomb = 0; w.special('bomb', n.x, n.y); run(w, 2);
  check('bombing damages', n.hp < 1000);
}
// 11. unlocks: one new mech per stage
{
  check('start roster', unlockedSet(0).mechs.join() === 'scout,gunner');
  const n = [0, 1, 2, 3, 4, 5, 6].map((c) => unlockedSet(c).mechs.length);
  check('one mech per stage', n.join() === '2,3,4,5,6,7,8', n.join());
  check('full arsenal after 6', unlockedSet(6).turrets.length === 3 && unlockedSet(6).specials.length === 3);
}
// 12. Charger slips past an enemy mech; a Tank fights it
{
  const w = mk();
  const foe = mech(w, 'brawler', 1, 2, 1300, 1e9); foe.def = { ...foe.def, dmg: 0, speed: 0 };
  const sc = mech(w, 'scout', 0, 2, 1100, 1e9);
  run(w, 10);
  check('charger slips past an enemy mech', sc.y > foe.y + 40, `scout ${sc.y.toFixed(0)} foe ${foe.y}`);
  const w2 = mk();
  const foe2 = mech(w2, 'brawler', 1, 2, 1300, 1e9); foe2.def = { ...foe2.def, dmg: 0, speed: 0 };
  const b = mech(w2, 'brawler', 0, 2, 1100, 1e9);
  run(w2, 10);
  check('tank fights the mech that blocks it', b.lane === 2 && b.target === foe2 && b.y < foe2.y, `lane ${b.lane}`);
}
// 13. win condition
{
  const w = mk();
  w.bases[1].hp = 50;
  const g = mech(w, 'brawler', 0, 2, BASE_FACE[1] - 200, 1e9);
  run(w, 10);
  check('destroying the enemy base wins', w.result === 'win', `result ${w.result} y ${g.y.toFixed(0)}`);
}
// 14. missiles hit
{
  const w = mk();
  const s = mech(w, 'seeker', 0, 2, 1000, 1e9);
  const tgt = mech(w, 'gunner', 1, 3, 1300, 1000); tgt.def = { ...tgt.def, speed: 0, dmg: 0 };
  run(w, 3);
  check('seeker missiles damage mechs', tgt.hp < 1000, `hp ${tgt.hp}`);
  void s;
}

// 15. Workshop upgrades carry over into battle
{
  const save = defaultSave();
  save.perks = { energy: 3, armor: 3, charge: 3, regen: 3 };
  for (const t of [...MECH_TYPES, ...TURRET_TYPES, 'builder']) save.tech[t] = 3;
  const st = { name: 'Test', index: 0, baseHp: 1e6, lvl: 0, regen: 0, roster: ['scout'], turrets: [], base: {} };
  const w = new World(st, save, ALL, { seed: 1 });
  check('Capacitors: starting energy', w.energy === 250, `energy ${w.energy}`);
  check('Capacitors: max energy', w.maxEnergy === 420, `max ${w.maxEnergy}`);
  check('Power Grid: energy regen', w.regen === 11, `regen ${w.regen}`);
  w.energy = 1000; w.upgradeBase('reactor');
  check('Reactor stacks on top of Capacitors', w.maxEnergy === 480, `max ${w.maxEnergy}`);
  check('Reinforced Walls: base HP', w.bases[0].maxHp === 4350, `hp ${w.bases[0].maxHp}`);
  check('Fast Uplink: cooldowns', Math.abs(w.specialMult - 0.7) < 1e-9 && Math.abs(w.specialCd.bomb - 14) < 1e-9);
  const m = w.spawn({ kind: 'mech', type: 'gunner', team: 0, lane: 2, x: 300, y: 500 });
  check('Veteran Training: unit level', w.lvl[0].gunner === 3 && Math.abs(m.maxHp - 230 * 1.45) < 1e-9, `hp ${m.maxHp}`);
  w.order(2, 1, 'sentry'); w.update(1 / 60);
  check('Veteran Training: Constructor', w.con && Math.abs(w.con.maxHp - 200 * (1 + 3 * LEVEL_STEP)) < 1e-9, `hp ${w.con && w.con.maxHp}`);
}

// 16. lane reach: own lane ± 1 (Seeker exempt)
{
  const w = mk();
  const g = mech(w, 'gunner', 0, 2, 1000, 1e9);
  const far = mech(w, 'scout', 1, 4, 1100, 1e9); far.def = { ...far.def, speed: 0, dmg: 0 };
  w.update(1 / 60);
  check('gunner ignores targets two lanes away', g.target === null);
  const near = mech(w, 'scout', 1, 3, 1150, 1e9); near.def = { ...near.def, speed: 0, dmg: 0 };
  w.update(1 / 60);
  check('gunner targets the neighbouring lane', g.target === near);
  // the Seeker has normal reach now (test build 2026-11-16: Long reach removed)
  const sk0 = mech(w, 'seeker', 0, 1, 1000, 1e9); w.update(1 / 60);
  check('seeker in lane 2 (data) no longer reaches two lanes away', sk0.target === null, `target lane ${sk0.target?.lane}`);
  // the Long reach trait itself (on a Seeker given the trait's rules): ± 2 lanes
  const lr = (lane) => { const m = mech(w, 'seeker', 0, lane, 1000, 1e9); m.def = { ...m.def, rules: { ...m.def.rules, ...TRAITS.longReach.set } }; return m; };
  const sk = lr(0); w.update(1 / 60);
  check('long reach does not reach three lanes away', sk.target === null, `target lane ${sk.target?.lane}`);
  const sk2 = lr(2); w.update(1 / 60);
  check('long reach reaches two lanes away', sk2.target === far || sk2.target === near);
  const sk1 = lr(1); w.update(1 / 60);
  check('long reach from lane 1 reaches lane 3', sk1.target === near, `target lane ${sk1.target?.lane}`);
  // traits: preferences
  const wp = mk([['sentry', 2, 7]]);
  const tp = tough(wp.cells[1][2][7]); tp.def = { ...tp.def, dmg: 0 };
  const mp = mech(wp, 'scout', 1, 2, tp.y - 30, 1e9); mp.def = { ...mp.def, speed: 0, dmg: 0 };
  const lp = mech(wp, 'lancer', 0, 2, tp.y - 400, 1e9), sp = mech(wp, 'seeker', 0, 2, tp.y - 360, 1e9);
  wp.update(1 / 60);
  check('lancer (prefers structures) picks the turret over a closer mech', lp.target === tp, `target ${lp.target?.kind}`);
  check('seeker (prefers mechs) picks the mech', sp.target === mp, `target ${sp.target?.kind}`);
  check('rules = role + traits', MECHS.seeker.rules.reach === 1 && MECHS.seeker.rules.pref === 'mech' && MECHS.seeker.rules.fireOnMove === false && MECHS.gunner.rules.reach === 1 && MECHS.gunner.rules.pref === null);
}
// 17. Line stays behind a marching tank; a Charger passes it and returns home
{
  const w = mk();
  const slow = mech(w, 'brawler', 0, 2, 600, 1e9), g = mech(w, 'gunner', 0, 2, 540, 1e9);
  run(w, 6);
  check('line stays behind a marching tank', g.lane === 2 && g.y < slow.y && slow.y - g.y >= slow.radius + g.radius, `gap ${(slow.y - g.y).toFixed(1)}`);
  const w2 = mk([], 0);
  const slow2 = mech(w2, 'brawler', 0, 2, 600, 1e9), fast = mech(w2, 'scout', 0, 2, 540, 1e9);
  run(w2, 3);
  check('charger overtakes a tank', fast.y > slow2.y, `fast ${fast.y.toFixed(0)} slow ${slow2.y.toFixed(0)}`);
  run(w2, 3);
  check('charger returns to its home lane after overtaking', fast.lane === 2 && !fast.shift && fast.homeLane == null, `lane ${fast.lane}`);
}
// 17b. behind a fighting friendly: Line fans out if it has no shot, Tank joins a fight next door, Support hangs back
{
  const w = mk([['sentry', 2, 6]]);
  const t = tough(w.cells[1][2][6]); t.def = { ...t.def, dmg: 0 };
  const m = mech(w, 'mortar', 0, 2, 1150, 1e9), g = mech(w, 'gunner', 0, 2, 1090, 1e9);
  run(w, 20);
  check('line passes fighting artillery', g.y > m.y + 40, `lane ${g.lane} y ${g.y.toFixed(0)} mortar ${m.y.toFixed(0)}`);
  // Line behind a fighting Line with a longer range passes it (passLonger) and returns home in front
  const wf = mk();
  const tf = mech(wf, 'brawler', 1, 2, 1500, 1e9); tf.def = { ...tf.def, dmg: 0, speed: 0 };
  const sk = mech(wf, 'seeker', 0, 2, 1150, 1e9), gf = mech(wf, 'gunner', 0, 2, 1090, 1e9);
  run(wf, 15);
  check('gunner passes a fighting seeker and returns home in front', gf.lane === 2 && gf.y > sk.y && gf.target === tf, `lane ${gf.lane} GU ${gf.y.toFixed(0)} SE ${sk.y.toFixed(0)}`);
  // ...but behind a fighting Line of the same range it fans out (and stays out)
  const wgs = mk();
  const tgs = mech(wgs, 'brawler', 1, 2, 1400, 1e9); tgs.def = { ...tgs.def, dmg: 0, speed: 0 };
  const gs1 = mech(wgs, 'gunner', 0, 2, 1150, 1e9), gs2 = mech(wgs, 'gunner', 0, 2, 1090, 1e9);
  run(wgs, 15);
  check('line fans out behind a fighting line mech of the same range', Math.abs(gs2.lane - 2) === 1 && gs2.homeLane == null && gs2.target === tgs, `lane ${gs2.lane} home ${gs2.homeLane}`);
  // proposal H: passing a fighting friendly, it takes the side toward the shot (enemy in lane 3, not the default lane 1)
  const wh = mk();
  const th = mech(wh, 'brawler', 1, 3, 1570, 1e9); // within the Mortar's 460 th.def = { ...th.def, dmg: 0, speed: 0 };
  const mh = mech(wh, 'mortar', 0, 2, 1150, 1e9), gh = mech(wh, 'gunner', 0, 2, 1090, 1e9);
  let hSide = null;
  for (let i = 0; i < 10 * 60 && hSide == null; i++) { wh.update(1 / 60); wh.fx.length = 0; if (gh.lane !== 2) hSide = gh.lane; }
  check('passing a fighting friendly goes toward the shot', mh.target === th && hSide === 3, `mortar target ${mh.target?.type} side ${hSide}`);
  // Artillery with no shot fans out behind a fighting friendly it may not pass
  const wa = mk([['sentry', 2, 6]]);
  const ta = tough(wa.cells[1][2][6]); ta.def = { ...ta.def, dmg: 0 };
  const g2 = mech(wa, 'gunner', 0, 2, 1150, 1e9), mo = mech(wa, 'mortar', 0, 2, 1000, 1e9);
  mo.def = { ...mo.def, range: 200 };
  run(wa, 20);
  check('artillery without a shot fans out', Math.abs(mo.lane - 2) === 1, `lane ${mo.lane}`);
  // Tanks: pass a fighting ranged friendly, and pass a marching Mortar although it's barely slower
  const wt = mk([['sentry', 2, 6]]);
  const tt = tough(wt.cells[1][2][6]); tt.def = { ...tt.def, dmg: 0 };
  const mt = mech(wt, 'mortar', 0, 2, 1150, 1e9), bt = mech(wt, 'brawler', 0, 2, 1090, 1e9);
  run(wt, 25);
  check('tank passes a fighting mortar', bt.y > mt.y + 40, `brawler ${bt.y.toFixed(0)} mortar ${mt.y.toFixed(0)}`);
  // follow the leader: Mortar.f-Brawler-Gunner, the Gunner takes the Brawler's side and stays behind it
  const wl = mk([['sentry', 2, 6]]);
  const tl = tough(wl.cells[1][2][6]); tl.def = { ...tl.def, dmg: 0 };
  const ml = mech(wl, 'mortar', 0, 2, 1150, 1e9), bl = mech(wl, 'brawler', 0, 2, 1090, 1e9), gl = mech(wl, 'gunner', 0, 2, 1040, 1e9);
  let gSide = null, bSide = null;
  for (let i = 0; i < 25 * 60; i++) { wl.update(1 / 60); wl.fx.length = 0; if (bSide == null && bl.lane !== 2) bSide = bl.lane; if (gSide == null && gl.lane !== 2) gSide = gl.lane; }
  check('gunner passes on the same side as its brawler', bSide != null && gSide === bSide, `brawler ${bSide} gunner ${gSide}`);
  check('the brawler stays in front of the gunner', bl.y > gl.y && gl.y > ml.y, `mortar ${ml.y.toFixed(0)} brawler ${bl.y.toFixed(0)} gunner ${gl.y.toFixed(0)}`);
  // ...also on a long march after the pass: the faster Gunner must not walk past the Brawler in the passing lane
  const wq = mk();
  const fq = mech(wq, 'brawler', 1, 3, 1600, 1e9); fq.def = { ...fq.def, dmg: 0, speed: 0 };
  const mq = mech(wq, 'mortar', 0, 2, 1120, 1e9), bq = mech(wq, 'brawler', 0, 2, 700, 1e9), gq = mech(wq, 'gunner', 0, 2, 640, 1e9);
  let gAhead = 0;
  for (let i = 0; i < 30 * 60; i++) { wq.update(1 / 60); wq.fx.length = 0; if (gq.y > bq.y + 1) gAhead++; }
  check('gunner never gets ahead of its brawler after passing', gAhead === 0 && gq.lane === 2 && bq.lane === 2, `ticks ahead ${gAhead}, lanes B${bq.lane} G${gq.lane}`);
  // MO.f-SE-GU: the SE passes the Mortar, returns home and stops to fight; the GU beside the Mortar must not stand there idle
  const wr = mk();
  const fr = mech(wr, 'brawler', 1, 2, 1340, 1e9); fr.def = { ...fr.def, dmg: 0, speed: 0 };
  const mr = mech(wr, 'mortar', 0, 2, 900, 1e9), sr = mech(wr, 'seeker', 0, 2, 600, 1e9), gr = mech(wr, 'gunner', 0, 2, 550, 1e9);
  run(wr, 30);
  check('gunner gets past a fighting seeker instead of standing idle', gr.y > sr.y, `SE ${sr.y.toFixed(0)} GU L${gr.lane} ${gr.y.toFixed(0)} home ${gr.homeLane}`);
  // same with two Gunners: GU1 returns home and fights, GU2 (same range, may not pass) turns its pass into a fan-out
  const wr2 = mk();
  const fr2 = mech(wr2, 'brawler', 1, 2, 1200, 1e9); fr2.def = { ...fr2.def, dmg: 0, speed: 0 };
  const mr2 = mech(wr2, 'mortar', 0, 2, 800, 1e9), ga = mech(wr2, 'gunner', 0, 2, 600, 1e9), gb = mech(wr2, 'gunner', 0, 2, 550, 1e9);
  run(wr2, 30);
  check('second gunner walks on beside the first (pass becomes fan-out)', gb.target === fr2 && gb.homeLane == null && !gb.moving, `GU1 L${ga.lane} ${ga.y.toFixed(0)} GU2 L${gb.lane} ${gb.y.toFixed(0)} home ${gb.homeLane}`);
  const wm = mk();
  const mm = mech(wm, 'mortar', 0, 2, 600, 1e9), bm = mech(wm, 'brawler', 0, 2, 540, 1e9), gm = mech(wm, 'gunner', 0, 2, 480, 1e9);
  run(wm, 60); // slow: Brawler 32 vs Mortar 28, and it walks at 0.6× while changing lanes
  check('tank passes a marching mortar and leads', bm.y > mm.y && bm.lane === 2, `brawler ${bm.y.toFixed(0)} mortar ${mm.y.toFixed(0)} lane ${bm.lane}`);
  const w2 = mk();
  const f1 = mech(w2, 'brawler', 1, 2, 1300, 1e9), f2 = mech(w2, 'brawler', 1, 3, 1330, 1e9);
  for (const f of [f1, f2]) f.def = { ...f.def, dmg: 0, speed: 0 };
  const b1 = mech(w2, 'brawler', 0, 2, 1150, 1e9), b2 = mech(w2, 'brawler', 0, 2, 1080, 1e9);
  run(w2, 12);
  check('tank joins a fight from the next lane', Math.abs(b2.lane - 2) === 1 && (b2.target === f1 || b2.target === f2), `lane ${b2.lane}`);
  // three Tanks attack one enemy from three sides
  const w4 = mk();
  const foe = mech(w4, 'brawler', 1, 2, 1300, 1e9); foe.def = { ...foe.def, dmg: 0, speed: 0 };
  const t1 = mech(w4, 'brawler', 0, 2, 1150, 1e9), t2 = mech(w4, 'brawler', 0, 2, 1090, 1e9), t3 = mech(w4, 'brawler', 0, 2, 1030, 1e9);
  run(w4, 15);
  const lanes = [t1, t2, t3].map((t) => t.lane).sort().join();
  check('three tanks attack from three sides', lanes === '1,2,3' && [t1, t2, t3].every((t) => t.target === foe && !t.moving), `lanes ${lanes}`);
  const side = [t1, t2, t3].filter((t) => t.lane !== 2);
  check('side attackers lean in but stay in their lane', side.every((t) => Math.abs(t.x - foe.x) < 120 - 25 && laneOf(t.x) === t.lane), side.map((t) => `${t.lane}@${t.x.toFixed(0)}`).join(' '));
  const h0 = foe.hp; run(w4, 2);
  check('side attackers deal damage', h0 - foe.hp >= 3 * 48 * 0.99, `dmg ${(h0 - foe.hp).toFixed(0)}`);
  foe.dead = true; run(w4, 2);
  check('they lean back once the fight is over', side.every((t) => !t.lean), side.map((t) => (t.lean || 0).toFixed(0)).join(' '));
  const w3 = mk();
  const f3 = mech(w3, 'brawler', 1, 2, 1500, 1e9); f3.def = { ...f3.def, dmg: 0, speed: 0 };
  const g3 = mech(w3, 'gunner', 0, 2, 1150, 1e9), a = mech(w3, 'aegis', 0, 2, 1080, 1e9);
  run(w3, 12);
  check('support stays a little behind the fight', a.lane === 2 && g3.y - a.y >= g3.radius + a.radius + 40 - 0.5 && g3.y - a.y < 120, `gap ${(g3.y - a.y).toFixed(1)}`);
  // Support follows the frontmost fighting friendly nearby, not the nearest one (play-test: an Aegis parked behind a Seeker)
  const wfm = mk();
  const ffm = mech(wfm, 'brawler', 1, 1, 1500, 1e9); ffm.def = { ...ffm.def, dmg: 0, speed: 0 };
  const gfm = mech(wfm, 'gunner', 0, 1, 1200, 1e9), sfm = mech(wfm, 'seeker', 0, 1, 1000, 1e9), afm = mech(wfm, 'aegis', 0, 2, 850, 1e9);
  run(wfm, 15);
  check('support follows the frontmost fighting friendly', !!gfm.target && !!sfm.target && afm.y > sfm.y && gfm.y - afm.y >= gfm.radius + afm.radius + 40 - 0.5 && gfm.y - afm.y < 120, `GU ${gfm.y.toFixed(0)} SE ${sfm.y.toFixed(0)} AE ${afm.y.toFixed(0)}`);
  // Support passes toward the friendlies its field can cover (passSide 'protect'), not the default side
  const wpr = mk();
  const mpr = mech(wpr, 'mortar', 0, 2, 900, 1e9), apr = mech(wpr, 'aegis', 0, 2, 840, 1e9);
  for (const y of [1000, 1060]) { const g = mech(wpr, 'gunner', 0, 3, y, 1e9); g.def = { ...g.def, speed: 28 }; }
  let prSide = null;
  for (let i = 0; i < 15 * 60 && prSide == null; i++) { wpr.update(1 / 60); if (apr.lane !== 2) prSide = apr.lane; }
  check('support passes on the side where it protects more friendlies', prSide === 3, `side ${prSide}`);
}
// 18. Mortar: half damage vs structures, slow shells miss moving targets
{
  const w = mk([['sentry', 2, 6]]);
  const t = tough(w.cells[1][2][6]); t.def = { ...t.def, dmg: 0 };
  const m = mech(w, 'mortar', 0, 2, t.y - 450, 1e9); m.cool = 0; m.aim = 0;
  const h0 = t.hp; run(w, 4);
  check('mortar deals half damage to turrets', h0 - t.hp > 0 && h0 - t.hp <= 30.0001, `dmg ${h0 - t.hp}`);
  const w2 = mk();
  const m2 = mech(w2, 'mortar', 0, 2, 1000, 1e9); m2.cool = 0;
  const runner = mech(w2, 'scout', 1, 3, 1440, 1000); // near the Mortar's 460 runner.def = { ...runner.def, dmg: 0, range: 1 };
  w2.update(1 / 60);
  const shell = w2.projectiles.find((p) => p.kind === 'shell');
  check('mortar shell flight time ≥ 2 s at long range', shell && shell.T >= 2, `T ${shell && shell.T.toFixed(2)}`);
  run(w2, 3);
  check('slow shell misses a fast-moving mech', runner.hp === 1000, `hp ${runner.hp}`);
}

// 19. (Charger) overtaking a moving slower mech completes (no swinging back behind it)
{
  const w = mk();
  const slow = mech(w, 'brawler', 0, 2, 600, 1e9), fast = mech(w, 'scout', 0, 2, 540, 1e9);
  let swings = 0, lastLane = fast.lane;
  for (let t = 0; t < 14; t += 1 / 60) { w.update(1 / 60); if (fast.lane !== lastLane) { swings++; lastLane = fast.lane; } }
  check('charger overtakes a walking brawler', fast.y > slow.y + slow.radius + fast.radius, `fast ${fast.y.toFixed(0)} slow ${slow.y.toFixed(0)}`);
  check('one lane change out and one back, no swinging', swings === 2 && fast.lane === 2, `lane changes ${swings}, lane ${fast.lane}`);
  check('brawler kept walking (wasn\'t waited for)', slow.y > 900, `slow ${slow.y.toFixed(0)}`);
}

// 20. overtaking with slower mechs in both neighbouring lanes: one lane at a time, never back behind the passed mech
{
  const w = mk([], 0);
  const br = mech(w, 'brawler', 0, 2, 600, 1e9), g = mech(w, 'scout', 0, 2, 540, 1e9);
  mech(w, 'mortar', 0, 1, 660, 1e9); mech(w, 'mortar', 0, 3, 660, 1e9);
  let last = g.lane, jumps = 0, backBehind = 0, left = false;
  for (let t = 0; t < 25; t += 1 / 60) {
    w.update(1 / 60);
    if (g.lane !== last) {
      if (Math.abs(g.lane - last) > 1) jumps++;
      if (left && g.lane === 2 && g.y < br.y) backBehind++;
      if (g.lane !== 2) left = true;
      last = g.lane;
    }
  }
  check('lane changes are one lane at a time', jumps === 0, `jumps ${jumps}`);
  check('never swings back behind the brawler', backBehind === 0, `swing-backs ${backBehind}`);
  check('never more than one lane from home', Math.abs(g.lane - 2) <= 1, `lane ${g.lane}`);
}

// 21. deployment queue: queue when poor, strict FIFO, lanes kept, cooldown blocks, limit, cancel, clear
{
  const w = mk(); w.energy = 100;
  check('affordable tap with empty queue deploys at once', w.request('gunner', 1) === 'deployed' && w.queue.length === 0);
  w.energy = 50;
  check('poor tap queues', w.request('brawler', 1) === 'queued' && w.queue.length === 1);
  check('later taps queue behind, even if affordable', (w.energy = 3000, w.request('scout', 3)) === 'queued' && w.queue[1].type === 'scout' && w.queue[1].lane === 3);
  w.energy = 100; // not enough for the brawler (140) but enough for the scout: strict order, nothing deploys
  const n0 = w.entities.filter((e) => e.team === 0 && e.kind === 'mech').length;
  run(w, 0.5);
  check('strict order: cheap order behind does not skip ahead', w.queue.length === 2 && w.entities.filter((e) => e.team === 0 && e.kind === 'mech').length === n0);
  w.energy = 1000;
  run(w, 3);
  const mine = w.entities.filter((e) => e.team === 0 && e.kind === 'mech');
  check('queue drains in order into the queued lanes', w.queue.length === 0 && mine.some((e) => e.type === 'brawler' && e.home0 === 1) && mine.some((e) => e.type === 'scout' && e.home0 === 3));
  check('energy charged on deploy', Math.abs(w.energy - (1000 - MECHS.brawler.cost - MECHS.scout.cost)) < 1e-6, `energy ${w.energy}`);
}
{
  const w = mk(); w.energy = 5000;
  w.request('brawler', 0); w.request('brawler', 4);
  check('cooldown: second brawler waits in queue', w.queue.length === 1);
  run(w, MECHS.brawler.cd - 0.2);
  check('still waiting during cooldown', w.queue.length === 1);
  run(w, 0.5);
  check('deploys after cooldown', w.queue.length === 0);
}
{
  const w = mk(); w.energy = 0;
  for (let i = 0; i < QUEUE.max; i++) w.request('scout', 2);
  check('queue limit', w.request('scout', 2) === 'full' && w.queue.length === QUEUE.max);
  w.cancelQueued(2);
  check('cancel one', w.queue.length === QUEUE.max - 1 && w.energy === 0);
  w.clearQueue();
  check('clear all', w.queue.length === 0);
}
{
  // spawn spacing: two queued mechs in one lane don't spawn on top of each other
  const w = mk(); w.energy = 0;
  w.request('brawler', 2); w.request('gunner', 2);
  w.energy = 5000; w.deployCd = {};
  run(w, 4);
  const [a, b] = w.entities.filter((e) => e.team === 0 && e.kind === 'mech');
  check('queued deploys in one lane are spaced', a && b && Math.abs(a.y - b.y) >= a.radius + b.radius - 6, a && b ? `dy ${Math.abs(a.y - b.y).toFixed(1)}` : 'missing');
}

// 22. shots leave from the weapons: Gunner alternates left/right, Seeker fires one missile per pod
{
  const w = mk();
  const g = mech(w, 'gunner', 0, 2, 600), t = tough(mech(w, 'scout', 1, 2, 800));
  g.aim = 0;
  w.fire(g, t); w.fire(g, t);
  const [a, b] = w.projectiles;
  check('gunner shots alternate sides', a && b && Math.sign(a.x - g.x) !== Math.sign(b.x - g.x) && Math.abs(a.x - g.x) > 10, a && b ? `${(a.x - g.x).toFixed(1)} / ${(b.x - g.x).toFixed(1)}` : '');
  check('gunner shots start ahead of the body', a.y > g.y + 20);
  const w2 = mk(), sk = mech(w2, 'seeker', 0, 2, 600), t2 = tough(mech(w2, 'scout', 1, 2, 800));
  sk.aim = 0; w2.fire(sk, t2);
  const [m1, m2] = w2.projectiles;
  check('seeker missiles leave from both pods at once', m1 && m2 && m1.x < sk.x - 10 && m2.x > sk.x + 10);
  // rotated: aiming east, the left gun is north of the body
  const w3 = mk(), g3 = mech(w3, 'gunner', 0, 2, 600), t3 = tough(mech(w3, 'scout', 1, 3, 600));
  g3.aim = Math.PI / 2; w3.fire(g3, t3);
  const p3 = w3.projectiles[0];
  check('muzzle follows the aim', p3.x > g3.x + 20 && p3.y > g3.y + 10, `${(p3.x - g3.x).toFixed(1)}, ${(p3.y - g3.y).toFixed(1)}`);
}

// step 2: walked lane changes, honest occupancy, detour around own turrets
{
  // a lane change takes lane width / speed (LANE_CHANGE.side = 1); the lane switches at the halfway point
  const w = mk(), g = mech(w, 'gunner', 0, 2, 600, 1e9);
  w.shiftTo(g, 1);
  let tHalf = null, tDone = null, laneEarly = g.lane;
  for (let i = 1; i < 6 * 60 && tDone == null; i++) {
    w.update(1 / 60);
    if (i === 30) laneEarly = g.lane;
    if (tHalf == null && g.lane === 1) tHalf = i / 60;
    if (!g.shift) tDone = i / 60;
  }
  const expect = 120 / MECHS.gunner.speed;
  check('lane change is walked at the mech\'s pace', tDone != null && Math.abs(tDone - expect) < 0.3, `took ${tDone?.toFixed(2)} s, expected ${expect.toFixed(2)} s`);
  check('lane counts as the new one from the halfway point', laneEarly === 2 && Math.abs(tHalf - expect / 2) < 0.3, `early ${laneEarly}, switched at ${tHalf?.toFixed(2)} s`);
  // the body turns toward where it walks, and back afterwards
  const w2 = mk(), b = mech(w2, 'brawler', 0, 2, 600, 1e9);
  w2.shiftTo(b, 3);
  run(w2, 1.5);
  const midBody = b.body;
  run(w2, 6);
  check('legs turn while changing lanes and turn back', midBody > 0.5 && Math.abs(b.body) < 0.05, `mid ${midBody.toFixed(2)} after ${b.body.toFixed(2)}`);
  // honest occupancy: a mech crossing into lane 1 blocks a mech walking up lane 1 behind it
  const w3 = mk(), a3 = mech(w3, 'mortar', 0, 2, 900, 1e9), c3 = mech(w3, 'mortar', 0, 1, 820, 1e9); // Artillery passes nobody
  a3.def = { ...a3.def, speed: 20 }; // slow crossing
  w3.shiftTo(a3, 1);
  let minGap = Infinity;
  for (let i = 0; i < 4 * 60; i++) { w3.update(1 / 60); if (a3.shift) minGap = Math.min(minGap, a3.y - c3.y); }
  check('a mech changing lanes blocks the lane it enters', minGap >= a3.radius + c3.radius, `closest ${minGap.toFixed(0)}`);
  // ...and the lane it leaves, and nobody else starts into that spot (reservation)
  const w4 = mk(), a4 = mech(w4, 'gunner', 0, 2, 900, 1e9), d4 = mech(w4, 'gunner', 0, 0, 900, 1e9);
  w4.shiftTo(a4, 1); w4.update(1 / 60);
  check('the lane being entered is reserved', !w4.laneFree(d4, 1) && !w4.laneFree(mech(w4, 'scout', 0, 3, 900), 2));
}
{
  // own mechs walk around their own turrets at full speed and stay in their lane
  const w = mk(), g = mech(w, 'gunner', 0, 1, 150, 1e9);
  w.placeTurret(0, 'sentry', 1, 1);
  const tur = w.cells[0][1][1] && w.entities.find((f) => f.kind === 'turret' && f.team === 0 && f.lane === 1);
  let maxOff = 0, minDist = Infinity, laneOk = true, maxBody = 0;
  const y0 = g.y;
  for (let i = 0; i < 12 * 60; i++) {
    w.update(1 / 60);
    maxBody = Math.max(maxBody, Math.abs(g.body));
    maxOff = Math.max(maxOff, Math.abs(g.x - laneX(1)));
    minDist = Math.min(minDist, Math.hypot(g.x - tur.x, g.y - tur.y));
    if (g.lane !== 1) laneOk = false;
  }
  check('legs turn diagonally around the turret and back', maxBody > 0.4 && Math.abs(g.body) < 0.02, `max ${maxBody.toFixed(2)} end ${g.body.toFixed(2)}`);
  check('own mech walks around its own turret', minDist >= 31 + g.radius, `closest ${minDist.toFixed(0)}, max drift ${maxOff.toFixed(0)}`);
  check('detour keeps lane and full speed, and ends back in the lane', laneOk && g.y - y0 > 12 * MECHS.gunner.speed * 0.97 && Math.abs(g.x - laneX(1)) < 1, `lane ok ${laneOk}, walked ${(g.y - y0).toFixed(0)}, x off ${(g.x - laneX(1)).toFixed(1)}`);
  // side: toward an empty neighbour cell; with both neighbours built, the middle of the gap
  const w2 = mk(), g2 = mech(w2, 'gunner', 0, 1, 150, 1e9);
  w2.placeTurret(0, 'sentry', 1, 1); w2.placeTurret(0, 'sentry', 2, 1);
  let side2 = 0; for (let i = 0; i < 6 * 60; i++) { w2.update(1 / 60); if (Math.abs(g2.x - laneX(1)) > Math.abs(side2)) side2 = g2.x - laneX(1); }
  check('detour goes toward the empty neighbour cell', side2 < -40, `drift ${side2.toFixed(0)}`);
  const w3 = mk(), g3 = mech(w3, 'gunner', 0, 1, 150, 1e9);
  for (const l of [0, 1, 2]) w3.placeTurret(0, 'sentry', l, 1);
  let side3 = 0; for (let i = 0; i < 6 * 60; i++) { w3.update(1 / 60); if (Math.abs(g3.x - laneX(1)) > Math.abs(side3)) side3 = g3.x - laneX(1); }
  check('between two built cells it keeps to the gap', side3 > 40 && side3 <= 61, `drift ${side3.toFixed(0)}`);
  // the Constructor drives around own pads on its way to a cell further out
  const w4 = mk();
  w4.placeTurret(0, 'sentry', 2, 0);
  w4.order(2, 3, 'sentry');
  let cMin = Infinity; const t4 = w4.entities.find((f) => f.kind === 'turret' && f.team === 0);
  for (let i = 0; i < 15 * 60; i++) { w4.update(1 / 60); if (w4.con && !w4.con.dead) cMin = Math.min(cMin, Math.hypot(w4.con.x - t4.x, w4.con.y - t4.y)); }
  check('constructor drives around own turrets', cMin >= 31 + CONSTRUCTOR.radius, `closest ${cMin.toFixed(0)}`);
  check('constructor still builds behind them', !!w4.cells[0][2][3], '');
}

// step 5: enemy AI deploys role-aware mixed groups, varies its lanes, defends with a mixed set
{
  const roster = ['scout', 'gunner', 'brawler', 'mortar', 'seeker', 'aegis', 'lancer', 'breacher'];
  const st = { name: 'AI', index: 11, baseHp: 1e6, lvl: 0, regen: 0, roster, turrets: [], base: {} };
  const w = new World(st, defaultSave(), ALL, { seed: 11 });
  w.time = 300;
  const orders = Array.from({ length: 2000 }, () => w.aiOrder(0));
  const groups = orders.flatMap((o) => o.groups).filter((g) => g.length > 1);
  const share = orders.filter((o) => o.groups.flat().length > 1).length / orders.length;
  check('late group share about 45%', share > 0.38 && share < 0.52, `share ${(share * 100).toFixed(0)}%`);
  const mixed = groups.filter((g) => new Set(g).size > 1).length / groups.length;
  check('most groups are mixed', mixed > 0.6, `mixed ${(mixed * 100).toFixed(0)}%`);
  const roleOrder = { tank: 0, charger: 0, line: 1, artillery: 2, support: 3 };
  const tankFirst = groups.every((g) => g.every((t, i) => !i || MECHS[t].role === MECHS[g[i - 1]].role || roleOrder[MECHS[g[i - 1]].role] <= roleOrder[MECHS[t].role] || (MECHS[t].role === 'artillery' && MECHS[g[i - 1]].role === 'line') || (MECHS[t].role === 'support' && MECHS[g[i - 1]].role === 'line')));
  check('groups deploy front to back (tank first, support last)', tankFirst);
  check('same-type groups are Scouts, a Brawler pair or two Line mechs', groups.filter((g) => new Set(g).size === 1).every((g) => g[0] === 'scout' || (g[0] === 'brawler' && g.length === 2) || (MECHS[g[0]].role === 'line' && g.length === 2)), groups.filter((g) => new Set(g).size === 1).map((g) => g.join('+')).filter((x, i, a) => a.indexOf(x) === i).join(' '));
  const brawlerPacks = groups.filter((g) => g.length === 2 && g[0] === 'brawler' && g[1] === 'brawler').length / groups.length;
  check('Brawler packs happen but rarely', brawlerPacks > 0.02 && brawlerPacks < 0.15, `${(brawlerPacks * 100).toFixed(1)}%`);
  const splits = orders.filter((o) => o.groups.length === 2).length / orders.filter((o) => o.groups.flat().length > 1).length;
  check('split attacks are rare (about 15% of groups)', splits > 0.08 && splits < 0.22, `${(splits * 100).toFixed(0)}%`);
  // under pressure: half the orders are single defensive picks, not always a Brawler
  const press = Array.from({ length: 1000 }, () => w.aiOrder(1000)).filter((o) => o.groups.flat().length === 1).map((o) => o.groups[0][0]);
  check('defensive picks are varied', new Set(press).size >= 4 && press.filter((t) => t === 'brawler').length < press.length * 0.6, [...new Set(press)].join(','));
  // early stages: only templates the roster allows
  const w2 = new World({ ...st, roster: ['scout', 'gunner'] }, defaultSave(), ALL, { seed: 3 });
  const o2 = Array.from({ length: 500 }, () => w2.aiOrder(0)).flatMap((o) => o.groups.flat());
  {
    const wa = new World(st, defaultSave(), ALL, { seed: 9 });
    let lone = 0, withAegis = 0;
    for (let i = 0; i < 3000; i++) {
      wa.time = (i % 300) * 1; const o = wa.aiOrder(i % 3 === 0 ? 500 : 0);
      for (const g of o.groups) { if (g.includes('aegis')) withAegis++; if (g.length === 1 && g[0] === 'aegis') lone++; }
    }
    check('enemy never deploys an Aegis alone (also under pressure)', lone === 0 && withAegis > 50, `lone ${lone}, in groups ${withAegis}`);
  }
  check('groups use only the stage roster', o2.every((t) => t === 'scout' || t === 'gunner'));
  // lanes: varied even with one weak lane, and split groups go to two different lanes
  const w3 = new World(st, defaultSave(), ALL, { seed: 5 });
  for (const l of [0, 1, 3, 4]) w3.placeTurret(0, 'sentry', l, 2);
  const lanes = Array.from({ length: 400 }, () => { const l = w3.aiLane(0, [0, 0, 0, 0, 0]); w3.ai.recent.push(l); if (w3.ai.recent.length > 4) w3.ai.recent.shift(); return l; });
  const top = Math.max(...[0, 1, 2, 3, 4].map((l) => lanes.filter((x) => x === l).length)) / lanes.length;
  check('lane choice varies (no lane above 60%)', top < 0.6 && new Set(lanes).size === 5, `top ${(top * 100).toFixed(0)}%`);
  check('a split attack never uses the same lane twice', Array.from({ length: 200 }, () => { const a = w3.aiLane(0, [0, 0, 0, 0, 0]); return w3.aiLane(0, [0, 0, 0, 0, 0], a) !== a; }).every(Boolean));
}

// ---------- levels: only damage and HP; the range ladder ----------
{
  const m = levelMult(5);
  check('levels add only damage and HP', m.dmg === 1 + 5 * LEVEL_STEP && m.hp === m.dmg && m.range === 1 && m.speed === 1 && m.reload === 1);
  const w = mk(), lo = mech(w, 'seeker', 0, 2, 400, 1e9);
  w.lvl[0].seeker = 5; const hi = mech(w, 'seeker', 0, 0, 400, 1e9);
  check('an upgraded mech keeps its range and speed', w.stat(hi, 'range') === w.stat(lo, 'range') && w.stat(hi, 'speed') === w.stat(lo, 'speed'));
  const R = (t) => (MECHS[t] || TURRETS[t]).range;
  check('range ladder: Arc < Gunner < Sentry < Seeker < Mortar < Howitzer < Lancer',
    R('arc') < R('gunner') && R('gunner') < R('sentry') && R('sentry') < R('seeker') && R('seeker') < R('mortar') && R('mortar') < R('howitzer') && R('howitzer') < R('lancer'));
}

// ---------- march pace (MARCH) ----------
{
  const w = mk();
  const b = mech(w, 'brawler', 0, 2, 400, 1e9), sc = mech(w, 'scout', 0, 0, 400, 1e9);
  run(w, 5);
  const y0 = b.y, s0 = sc.y; run(w, 2);
  const v = (b.y - y0) / 2, vs = (sc.y - s0) / 2;
  check('march: a lone Brawler walks at the march pace', Math.abs(v - MARCH.pace) < 1, `v ${v.toFixed(1)}`);
  check('march: a Scout keeps its own (higher) speed', Math.abs(vs - MECHS.scout.speed) < 1, `v ${vs.toFixed(1)}`);
  const w2 = mk([], 0), b2 = mech(w2, 'brawler', 0, 2, 400, 1e9);
  run(w2, 7);
  check('march off: base speed', Math.abs((b2.y - 400) / 7 - MECHS.brawler.speed) < 1);
  // contact: an enemy ahead → back to combat pace before it gets there
  const w3 = mk(), b3 = mech(w3, 'brawler', 0, 2, 400, 1e9);
  const en = mech(w3, 'gunner', 1, 2, 1500, 1e9);
  let gap = null;
  for (let t = 0; t < 40 && gap == null; t += 1 / 60) { w3.update(1 / 60); if (t > 5 && b3.mb < 1) gap = en.y - b3.y; }
  check('march: slows to combat pace within reach of an enemy', gap != null && gap > 300 && gap < MARCH.clear + 60, `at ${gap && gap.toFixed(0)} from it`);
  check('march: the enemy marches too, and slows as well', en.mb < 1);
  // a Gunner behind a marching Brawler doesn't try to pass: both march at the same pace
  const w4 = mk(), b4 = mech(w4, 'brawler', 0, 2, 600, 1e9), g4 = mech(w4, 'gunner', 0, 2, 520, 1e9);
  let left = false; for (let t = 0; t < 12; t += 1 / 60) { w4.update(1 / 60); if (g4.lane !== 2 || g4.shift) left = true; }
  check('march: a column marches together, nobody steps out', !left && b4.y - g4.y < 120, `gap ${(b4.y - g4.y).toFixed(0)}`);
}

// ---------- battle log (statistics upload) ----------
{
  const w = new World(stageDef(4), defaultSave(), ALL, { seed: 2 });
  w.energy = 999; w.deploy('gunner', 1); w.deploy('scout', 2); w.placeTurret(0, 'sentry', 0, 1);
  w.upgradeUnit('gunner'); w.specialCd.surge = 0; w.special('surge');
  for (let i = 0; i < 61 * 60; i++) w.update(1 / 60);
  const L = w.log;
  check('log counts own deploys and turrets', L.mechs[0].gunner === 1 && L.mechs[0].scout === 1 && L.turrets[0].sentry === 1);
  check('log counts enemy deploys', Object.values(L.mechs[1]).reduce((a, b) => a + b, 0) > 0);
  check('log records specials and upgrades', L.specials.surge === 1 && L.upgrades[0][1] === 'gunner');
  check('timeline every 30 s', L.timeline.length === 3 && L.timeline[1][0] === 30 && L.timeline[0].length === 6, JSON.stringify(L.timeline));
  check('battle log is small', JSON.stringify(L).length < 6000, JSON.stringify(L).length + ' bytes');
  const E = (k) => L.events.filter((e) => e[1] === k);
  check('event: own deploy with level and lane (lanes from 1)', E('deploy').some((e) => e[2] === 1 && e[3] === 'gunner' && e[4] === 0 && e[5] === 2 && e[0] === 0));
  check('event: turret with lane and row (from 1)', E('turret').some((e) => e[2] === 1 && e[3] === 'sentry' && e[5] === 1 && e[6] === 2));
  check('event: special and upgrade', E('special')[0]?.[2] === 'surge' && E('upgrade')[0]?.[2] === 'gunner' && E('upgrade')[0]?.[3] === 1);
  const ed = E('deploy').filter((e) => e[2] === 0);
  check('event: enemy deploy has order and group (from 1), lane 1-5', ed.length > 0 && ed.every((e) => e[6] >= 1 && (e[7] === 1 || e[7] === 2) && e[5] >= 1 && e[5] <= 5));
  check('events in time order', L.events.every((e, i) => i === 0 || e[0] >= L.events[i - 1][0]));
}
{
  // a long busy battle stays well under the server limit (64 KB)
  const w = new World(stageDef(8), defaultSave(), ALL, { seed: 4 });
  const types = ['brawler', 'gunner', 'mortar', 'seeker', 'scout'];
  for (let i = 0; i < 600 * 60 && !w.result; i++) {
    if (i % 240 === 0) { w.energy = 999; w.deploy(types[(i / 240) % 5], (i / 240) % 5); }
    w.update(1 / 60);
  }
  const E = w.log.events, size = JSON.stringify(w.log).length;
  const deaths = E.filter((e) => e[1] === 'death');
  check('event: deaths with lane, progress and killer', deaths.length > 20 && deaths.filter((e) => e[3] !== 'sentry' && e[3] !== 'arc' && e[3] !== 'howitzer').every((e) => Number.isInteger(e[4]) && e[5] >= 0 && e[5] <= 100 && typeof e[6] === 'string'));
  check('10-minute battle log under 32 KB', size < 32000, `${size} bytes, ${E.length} events`);
  console.log(`  (10-minute test battle: ${E.length} events, ${(size / 1024).toFixed(1)} KB)`);
}

// ---- dev experiments (EXPERIMENTS in data.js)
{
  const bountyGain = (exp) => {
    const w = mk([], 0, exp); w.energy = 0;
    const e = mech(w, 'brawler', 1, 2, 1500);
    w.damage(e, 1e6, null, 0);
    return w.energy;
  };
  check('normal kill bounty', Math.abs(bountyGain() - MECHS.brawler.cost * ENERGY.bounty) < 1e-6);
  check('experiment: kill bounty 40%', Math.abs(bountyGain('bounty40') - MECHS.brawler.cost * 0.4) < 1e-6);
  check('experiment: kill bounty 60%', Math.abs(bountyGain('bounty60') - MECHS.brawler.cost * 0.6) < 1e-6);
  check('unknown experiment = off', new World(stageDef(0), defaultSave(), ALL, { exp: 'nope' }).expKey === 'off');

  // enemy income after 7 minutes: doubles normally, ×1.5 or flat with the ramp experiments
  const income = (exp) => {
    const w = new World({ ...stageDef(0), turrets: [], base: {} }, defaultSave(), ALL, { seed: 1, exp });
    w.time = 600; w.ai.energy = -1e9; // never affords anything: only the income counts
    w.updateAI(1);
    return w.ai.energy + 1e9;
  };
  const r = stageDef(0).regen;
  check('enemy income doubles by 7 min', Math.abs(income() - 2 * r) < 1e-6, income());
  check('experiment: enemy ramp ×1.5', Math.abs(income('ramp15') - 1.5 * r) < 1e-6, income('ramp15'));
  check('experiment: no enemy ramp', Math.abs(income('noramp') - r) < 1e-6, income('noramp'));

  // overtime: +OVERTIME_BONUS for both from the set minute, logged once
  const w = mk([], 0, 'ot8'); w.energy = 0; w.maxEnergy = 1e6;
  w.time = 479; w.update(0.5);
  check('no overtime before 8 min', !w.overtime && w.energy < 1);
  w.time = 480; const e0 = w.energy; w.update(1);
  check('overtime from 8 min: player +15/s', w.overtime && Math.abs(w.energy - e0 - OVERTIME_BONUS) < 1e-6, w.energy - e0);
  w.update(1);
  check('overtime logged once', w.log.events.filter((e) => e[1] === 'overtime').length === 1);
  const w2 = new World({ ...stageDef(0), turrets: [], base: {} }, defaultSave(), ALL, { seed: 1, exp: 'ot8' });
  w2.time = 600; w2.overtime = true; w2.ai.energy = -1e9; const a0 = w2.ai.energy; w2.updateAI(1);
  check('overtime: enemy +15/s', Math.abs(w2.ai.energy - a0 - (2 * r + OVERTIME_BONUS)) < 1e-6, w2.ai.energy - a0);
  // forward deploy (normal rule): same lane, frontmost turret, on by default once a lane has a turret
  {
    const w = mk([], 0);
    check('forward: no turret → lane deploys at the base, toggling refused', !w.laneFwd(2) && w.setLane(2) === 'noturret' && !w.laneFwd(2));
    const t3 = w.placeTurret(0, 'sentry', 2, 3);
    check('forward: first turret of a lane switches it to forward', w.laneFwd(2));
    check('forward: second tap switches to base', w.setLane(2) === 'base' && !w.laneFwd(2));
    const t5 = w.placeTurret(0, 'sentry', 2, 5);
    check('forward: a further turret keeps the base choice', !w.laneFwd(2));
    check('forward: tap again switches to forward', w.setLane(2) === 'fwd' && w.laneFwd(2));
    w.placeTurret(0, 'sentry', 1, 6);
    check('forward: other lanes get their own first turret', w.laneFwd(1) && !w.laneFwd(0));
    w.deploy('gunner');
    const g = w.entities.filter((e) => e.kind === 'mech').pop();
    check('forward: appears behind the frontmost turret of that lane', g.lane === 2 && g.y < t5.y && g.y > t5.y - 100, g.y);
    check('forward: event carries the turret row', w.log.events.at(-1)[6] === 6);
    t5.dead = true; w.cells[0][2][5] = null;
    w.deployCd = {}; w.deploy('gunner', 2, true);
    const g2 = w.entities.filter((e) => e.kind === 'mech').pop();
    check('forward: turret gone → next one back', g2.y < t3.y && g2.y > t3.y - 100, g2.y);
    w.damage(t3, 1e9, null, 1);
    check('forward: last turret of the lane destroyed → lane back to base', !w.laneFwd(2) && w.fwd[2] === false);
    w.deploy('scout', 2, true);
    const g3 = w.entities.filter((e) => e.kind === 'mech').pop();
    check('forward: no turret left → base', g3.y === BASE_FACE[0] + 24);
    w.placeTurret(0, 'sentry', 2, 2);
    check('forward: a lane that lost all turrets turns forward again with its next one', w.laneFwd(2));
    w.setLane(1); w.sell(1, 6);
    check('forward: last turret of the lane sold → lane back to base', !w.laneFwd(1));
    // queue: each order keeps its own choice
    const q = mk([], 0); q.placeTurret(0, 'sentry', 2, 4); q.energy = 0;
    q.request('gunner'); q.setLane(2); q.request('gunner');
    check('forward: queue remembers base/forward per order', q.queue[0].fwd === true && q.queue[1].fwd === false);
    // first tap on another lane only selects it
    const o = mk([]); o.placeTurret(0, 'sentry', 1, 4);
    check('forward: first tap on another lane only selects it', o.setLane(1) === 'lane' && o.laneFwd(1));
  }
  check('every experiment has a name', Object.values(EXPERIMENTS).every((x) => x.name));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
