// Headless rule tests for the simulation. Run: node tools/test.mjs
import { World } from '../src/world.js';
import { OVERTIME, ENERGY, TRAITS, LEVEL_STEP, levelMult, MARCH, stageDef, QUEUE, MECHS, MECH_TYPES, TURRET_TYPES, TURRETS, CONSTRUCTOR, laneX, laneOf, cellY, unlockedSet, sellRefund, BASE_FACE, STAGES, UNLOCKS, LOADOUT_SIZE, randomLoadout, PERSONALITIES, RANDOM_PERSONALITIES, AI, BASE_UPGRADES } from '../src/data.js';
import { focusFactor } from './focus.mjs';
import { runReplay, checkReplay } from './replay.mjs';
import { quickMatch } from '../src/quick.js';
import { defaultSave } from '../src/save.js';

const ALL = { mechs: MECH_TYPES, turrets: TURRET_TYPES, specials: ['bomb', 'emp', 'surge'] };
let pass = 0, fail = 0;
function check(name, cond, info = '') {
  if (cond) pass++; else { fail++; console.log(`FAIL  ${name}${info ? '  — ' + info : ''}`); }
}
// A quiet test world: no enemy income, no player regen, plenty of energy.
// march: the march pace (MARCH.pace by default); 0 = off, for tests of the rules at combat pace
function mk(turrets = [], march, dev) {
  const st = { name: 'Test', index: 0, baseHp: 1e6, lvl: 0, regen: 0, roster: ['scout'], turrets, base: {} };
  const w = new World(st, defaultSave(), ALL, { seed: 7, march, dev });
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

// 15. no Workshop (0.7.0-dev.1): every battle starts the same; in-battle upgrades only, no base Armor
{
  const old = { ...defaultSave(), credits: 900, tech: { gunner: 3 }, perks: { energy: 3, armor: 3, charge: 3, regen: 3 } };
  const st = { name: 'Test', index: 0, baseHp: 1e6, lvl: 0, regen: 0, roster: ['scout'], turrets: [], base: { armor: 1 } };
  const w = new World(st, old, ALL, { seed: 1 });
  check('fresh start: energy 100 of 300, income 8/s', w.energy === 100 && w.maxEnergy === 300 && w.regen === 8, `${w.energy}/${w.maxEnergy}, ${w.regen}/s`);
  check('fresh start: base HP 3000, specials at half cooldown', w.bases[0].maxHp === 3000 && Math.abs(w.specialCd.bomb - 20) < 1e-9);
  const m = w.spawn({ kind: 'mech', type: 'gunner', team: 0, lane: 2, x: 300, y: 500 });
  check('fresh start: units at level 0 (old Workshop tech ignored)', w.lvl[0].gunner === 0 && m.maxHp === 230, `hp ${m.maxHp}`);
  w.energy = 1000;
  check('in-battle upgrades: unit level, Reactor, Bastion Gun; no base Armor', w.upgradeUnit('gunner') && w.lvl[0].gunner === 1 && w.upgradeBase('reactor') && w.regen === 10 && w.upgradeBase('gun') && !BASE_UPGRADES.armor);
  check('enemy base keeps its stage Armor (+20% HP)', w.bases[1].maxHp === 1.2e6);
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

// ---- damage stats (log.dmg / taken / shield)
{
  const w = mk();
  const g = mech(w, 'gunner', 0, 2, 900), b = mech(w, 'brawler', 1, 2, 1500, 100);
  w.damage(b, 60, g); w.damage(b, 300, g); // second hit kills: only the 40 HP left count
  check('damage stats: HP actually removed, no overkill', w.log.dmg[0].gunner?.[0] === 100, JSON.stringify(w.log.dmg[0]));
  check('damage stats: damage taken by type', w.log.taken[1].brawler === 100);
  w.damage(w.bases[1], 50, null, 0);
  check('damage stats: Bombing and base damage', w.log.dmg[0].bomb?.[2] === 50);
  const w2 = mk();
  const ae = mech(w2, 'aegis', 1, 2, 1500, 1e9), m = mech(w2, 'gunner', 1, 2, 1480, 1e9), s = mech(w2, 'gunner', 0, 2, 1000);
  w2.damage(m, 100, s);
  check('damage stats: Aegis field saved HP', Math.abs(w2.log.shield[1] - 100 * ae.def.auraDR) < 1e-6 && Math.abs(w2.log.dmg[0].gunner[0] - 100 * (1 - ae.def.auraDR)) < 1e-6, `${w2.log.shield[1]}`);
}

// ---- half-lane fan-out (STRIP)
{
  // L3 fight: GU1 fights, both neighbouring lanes are taken beside GU2, so GU2 steps onto a strip and fights from there
  const setup = (type = 'gunner') => {
    const w = mk();
    const foe = mech(w, 'brawler', 1, 2, 1400, 1e9); foe.def = { ...foe.def, dmg: 0, speed: 0 };
    const g1 = mech(w, 'gunner', 0, 2, 1150, 1e9), g2 = mech(w, type, 0, 2, 1090, 1e9);
    const n = [1, 3].map((l) => { const m = mech(w, 'gunner', 0, l, 1090, 1e9); m.def = { ...m.def, speed: 0, dmg: 0 }; return m; });
    return { w, foe, g1, g2, n };
  };
  const a = setup();
  run(a.w, 8);
  check('strip: line steps onto a strip when both neighbouring lanes are taken', a.g2.strip && a.g2.lane === 2 && a.g2.target === a.foe, `strip ${a.g2.strip} lane ${a.g2.lane} target ${a.g2.target?.type}`);
  check('strip: stands between two lanes', a.g2.strip && Math.abs(Math.abs(a.g2.x - laneX(2)) - (laneX(1) - laneX(0)) / 2) < 15, `x ${a.g2.x.toFixed(0)}`);
  check('strip: not in any lane (blocks nobody)', a.g2.strip && !a.w.inLane(a.g2, 2) && !a.w.inLane(a.g2, 2 + a.g2.strip));
  check('strip: not ahead of the fight it joins', a.g2.y <= a.g1.y + 1, `strip ${a.g2.y.toFixed(0)} front ${a.g1.y.toFixed(0)}`);
  check('strip: one mech per spot', !a.w.stripFree({ ...a.g1, y: a.g2.y }, a.w.stripOf(a.g2)));
  // a third gunner behind; the fight ends: the strip mech steps back first, the lane mech behind keeps its distance
  const g3 = mech(a.w, 'gunner', 0, 2, 1000, 1e9);
  run(a.w, 2);
  a.foe.hp = 0; a.w.damage(a.foe, 1e12, null, 0);
  run(a.w, 10);
  check('strip: returns to its lane after the fight', !a.g2.strip && !a.g2.shift && a.g2.lane === 2 && Math.abs(a.g2.x - laneX(2)) < 15, `strip ${a.g2.strip} x ${a.g2.x.toFixed(0)}`);
  check('strip: goes back in ahead of the mech behind it', a.g2.y > g3.y, `strip mech ${a.g2.y.toFixed(0)} behind ${g3.y.toFixed(0)}`);
  // Tanks don't use strips (they hold the lane)
  const b = setup('brawler');
  run(b.w, 8);
  check('strip: tanks never use it', !b.g2.strip && !b.g2.shift?.strip);
  // only Flankers (Gunner) use strips: a Seeker waits
  const d = setup('seeker'); d.g2.def = { ...d.g2.def, range: 200 };
  run(d.w, 8);
  check('strip: only Flankers (Seeker never)', !d.g2.strip && !d.g2.shift?.strip);
  check('strip: Gunner is a Flanker, nobody else', MECH_TYPES.filter((t) => MECHS[t].rules.strip).join() === 'gunner');
  check('strip: logged (entries, damage from strips)', a.w.log.strip[0][0] >= 1 && a.w.log.strip[0][1] > 0, JSON.stringify(a.w.log.strip));
  // with a free neighbouring lane the normal fan-out comes first
  const c = setup(); c.n[1].dead = true; c.w.entities = c.w.entities.filter((e) => !e.dead);
  run(c.w, 8);
  check('strip: a free neighbouring lane comes first', !c.g2.strip && c.g2.lane === 3, `lane ${c.g2.lane} strip ${c.g2.strip}`);
}

// ---- rule A: the decision order behind a stopped (waiting) friendly, not only a fighting one
{
  // a column of Gunners behind a fighting Brawler in L3: the ones further back (behind a *waiting* Gunner) fan out too
  const colScene = (A = true) => {
    const w = mk([], 0);
    const foe = mech(w, 'brawler', 1, 2, 1400, 1e9); foe.def = { ...foe.def, dmg: 0, speed: 0 };
    const bw = mech(w, 'brawler', 0, 2, 1300, 1e9); bw.def = { ...bw.def, dmg: 0 };
    const col = [1240, 1180, 1120, 1060].map((y) => { const g = mech(w, 'gunner', 0, 2, y, 1e9); g.def = { ...g.def, range: 120, dmg: 0 }; return g; });
    run(w, 15);
    return col;
  };
  const col = colScene();
  check('A: every Gunner of a column gets out of line (fan-out or strip)', col.filter((g) => g.lane !== 2 || g.strip).length >= 3, col.map((g) => `L${g.lane + 1}${g.strip ? 's' : ''}`).join(' '));
  // a marching column stays together (nobody is stopped)
  const w2 = mk([], 0);
  const lead = mech(w2, 'brawler', 0, 2, 900, 1e9), g2 = mech(w2, 'gunner', 0, 2, 840, 1e9), g3 = mech(w2, 'gunner', 0, 2, 780, 1e9);
  run(w2, 6);
  check('A: a marching column stays in its lane', g2.lane === 2 && g3.lane === 2 && !g3.strip, `L${g2.lane + 1} L${g3.lane + 1}`);
}
// ---- waiting time stat
{
  const w = mk([], 0);
  const foe = mech(w, 'brawler', 1, 2, 1400, 1e9); foe.def = { ...foe.def, dmg: 0, speed: 0 };
  const g1 = mech(w, 'gunner', 0, 2, 1150, 1e9); // fights: no waiting
  const m = mech(w, 'mortar', 0, 4, 300, 1e9); m.def = { ...m.def, speed: 0 }; // stands with nothing to shoot
  run(w, 5);
  check('wait stat: standing without a target counts, fighting does not', (w.log.wait[0].mortar || 0) > 4 && (w.log.wait[0].gunner || 0) < 2, JSON.stringify(w.log.wait[0]));
}
// ---- combat lifetime stat
{
  const w = mk([], 0);
  const foe = mech(w, 'seeker', 1, 2, 1500, 1e9); foe.def = { ...foe.def, speed: 0 }; // shoots, never dies
  const g = mech(w, 'gunner', 0, 2, 700); // walks up, meets the Seeker, dies
  const far = mech(w, 'mortar', 0, 4, 300, 1e9); far.def = { ...far.def, speed: 0 }; // never meets anyone
  let met = null;
  for (let i = 0; i < 60 * 90 && !g.dead; i++) { w.update(1 / 60); if (met == null && g.contact != null) met = w.time; }
  const l = w.log.life[0].gunner || [0, 0, 0, 0], all = w.lifeLog();
  check('life stat: a death counts the time from first contact', g.dead && met > 1 && l[0] === 1 && Math.abs(l[1] - (w.time - met)) < 0.05, JSON.stringify(l) + ' met ' + met);
  check('life stat: survivors only after contact (lifeLog), not in the log', !all[0].mortar && all[1].seeker?.[2] === 1 && all[1].seeker[3] > 0 && !w.log.life[1].seeker, JSON.stringify(all));
}
// ---- stepping out to pass (ISSUES.md 2026-11-18): once clear of the friendly it leaves behind, it walks on diagonally
{
  const w = mk([], 0);
  const m = mech(w, 'mortar', 0, 2, 700); m.def = { ...m.def, speed: 0 };
  const g = mech(w, 'gunner', 0, 2, 600);
  let y0 = null, yEnd = null;
  for (let i = 0; i < 60 * 8; i++) { w.update(1 / 60); if (g.shift && y0 == null) y0 = g.y; if (y0 != null && !g.shift && yEnd == null) yEnd = g.y; }
  check('pass: steps out, then walks on diagonally (gains ground during the lane change)', y0 != null && yEnd - y0 > 30, `gained ${(yEnd - y0).toFixed(0)}`);
}
// ---- dev switches
{
  check('dev switches: defaults', (() => { const w = mk(); return w.dev.drift === true && w.dev.returnDelay === false && w.dev.stripFirst === false && w.dev.stripPassLonger === true && w.log.dev.drift === true; })());
  const w = mk([], 0, { drift: false }); w.setDev('drift', true); w.setDev('drift', true);
  check('dev switches: live change logged once', w.dev.drift && w.log.events.filter((e) => e[1] === 'dev').length === 1 && w.log.dev.drift === false);
  // drift: a Gunner with a target in range keeps walking forward while it changes lane (only with drift on)
  const lane = (drift) => {
    const v = mk([], 0, { drift });
    const foe = mech(v, 'brawler', 1, 1, 560, 1e9); foe.def = { ...foe.def, dmg: 0, speed: 0 };
    const g = mech(v, 'gunner', 0, 1, 330, 1e9); run(v, 1); const y0 = g.y;
    v.shiftTo(g, 0); run(v, 1.5);
    return g.y - y0;
  };
  check('dev switch drift: diagonal lane change', lane(true) > 15 && lane(false) < 1, `${lane(true).toFixed(0)} / ${lane(false).toFixed(0)}`);
  // returnDelay: the passed friendly dies -> stays in the passing lane for a while
  const pass = (returnDelay) => {
    const v = mk([], 0, { returnDelay });
    const g = mech(v, 'gunner', 0, 2, 900, 1e9), m = mech(v, 'mortar', 0, 2, 960, 1e9);
    v.startPass(g, m, 2, 3); run(v, 3); // in L4 now
    m.hp = 0; v.damage(m, 1e12, null, 1);
    run(v, 1);
    return g.lane === 3 && !g.shift;
  };
  check('dev switch returnDelay: stays a moment after the passed friendly died', pass(true) && !pass(false), `${pass(true)} ${pass(false)}`);
  // stripFirst: a Flanker takes a free strip although a neighbour lane is free
  const sf = (stripFirst) => {
    const v = mk([], 0, { stripFirst });
    const foe = mech(v, 'brawler', 1, 2, 1400, 1e9); foe.def = { ...foe.def, dmg: 0, speed: 0 };
    mech(v, 'gunner', 0, 2, 1150, 1e9); const g = mech(v, 'gunner', 0, 2, 1090, 1e9);
    run(v, 8);
    return g.strip ? 'strip' : g.lane !== 2 ? 'lane' : 'none';
  };
  check('dev switch stripFirst: strip before a free lane', sf(true) === 'strip' && sf(false) === 'lane', `${sf(true)} / ${sf(false)}`);
  // stripPassLonger (ISSUES.md 2026-11-18): a Gunner on the strip beside a Seeker that fights from far back walks on
  // until it has its own target; without the switch it stays level with the Seeker, out of range
  const spl = (stripPassLonger) => {
    const v = mk([], 0, { stripPassLonger });
    const foe = mech(v, 'brawler', 1, 2, 1700, 1e9); foe.def = { ...foe.def, dmg: 0, speed: 0 };
    const se = mech(v, 'seeker', 0, 2, 1150, 1e9), g = mech(v, 'gunner', 0, 2, 1090, 1e9);
    for (const l of [1, 3]) { const m = mech(v, 'gunner', 0, l, 1230, 1e9); m.def = { ...m.def, speed: 0, dmg: 0 }; } // neighbour lanes taken
    let onStrip = false;
    for (let i = 0; i < 60 * 15; i++) { v.update(1 / 60); onStrip ||= !!g.strip; }
    return { onStrip, shoots: g.target === foe, ahead: Math.round(g.y - se.y) };
  };
  const on = spl(true), off = spl(false);
  check('dev switch stripPassLonger: walks past a longer-range friendly on the strip until it can shoot', on.onStrip && on.shoots && on.ahead > 50 && off.onStrip && !off.shoots && off.ahead <= 1, JSON.stringify({ on, off }));
}

// ---- kill bounty, enemy income ramp, overtime, forward deploy
{
  const w0 = mk([], 0); w0.energy = 0;
  w0.damage(mech(w0, 'brawler', 1, 2, 1500), 1e6, null, 0);
  check('kill bounty', Math.abs(w0.energy - MECHS.brawler.cost * ENERGY.bounty) < 1e-6);
  const income = () => {
    const w = new World({ ...stageDef(0), turrets: [], base: {} }, defaultSave(), ALL, { seed: 1 });
    w.time = 600; w.ai.energy = -1e9; w.updateAI(1);
    return w.ai.energy + 1e9;
  };
  const r = stageDef(0).regen;
  check('enemy income doubles by 7 min', Math.abs(income() - 2 * r) < 1e-6, income());

  // overtime (normal rule): from minute 9 both sides' current income ×1.5, logged once
  {
    const p = mk([], 0); p.energy = 0; p.maxEnergy = 1e6; p.regen = 14;
    p.time = OVERTIME.at - 1; p.update(0.5);
    check('no overtime before minute 9', !p.overtime);
    p.time = OVERTIME.at; p.update(0.01); const e1 = p.energy; p.update(1);
    check('overtime: player income ×1.5', p.overtime && Math.abs(p.energy - e1 - 14 * OVERTIME.mult) < 1e-6, p.energy - e1);
    p.update(1);
    check('overtime logged once', p.log.events.filter((e) => e[1] === 'overtime').length === 1);
    const q = new World({ ...stageDef(0), turrets: [], base: {} }, defaultSave(), ALL, { seed: 1 });
    q.time = 650; q.overtime = true; q.ai.energy = -1e9; q.updateAI(1);
    check('overtime: enemy income ×1.5', Math.abs(q.ai.energy + 1e9 - 2 * r * OVERTIME.mult) < 1e-6, q.ai.energy + 1e9);
    const b = mk([], 0), base = b.bases[1]; b.overtime = true; const h = base.hp; b.damage(base, 100, null, 0);
    check('overtime: bases take normal damage', Math.abs(h - base.hp - 100) < 1e-6);
  }
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
}

// enemy loadouts (ISSUES.md 2026-11-18): at most 5 types per stage, stage n brings the unit cleared stage n unlocks,
// random loadouts follow the rules, the AI fields only its loadout
{
  check('enemy loadouts: at most 5 different types per stage', STAGES.every((st) => st.roster.length <= LOADOUT_SIZE && new Set(st.roster).size === st.roster.length && st.roster.every((t) => MECHS[t])));
  const front = UNLOCKS.slice(1).map((u, n) => (u.mechs || []).every((t) => STAGES[n].roster.includes(t)));
  check('enemy loadouts: stage n brings the unit unlocked by clearing it (frontrunner)', front.every(Boolean), front.join());
  let r = 7; const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const role = (t) => MECHS[t].role, draws = Array.from({ length: 500 }, () => randomLoadout(rnd));
  const ok = draws.every((d) => d.length === LOADOUT_SIZE && new Set(d).size === LOADOUT_SIZE && d.some((t) => role(t) === 'line')
    && d.some((t) => role(t) === 'tank' || role(t) === 'artillery') && d.filter((t) => role(t) === 'charger').length <= 1);
  check('random loadout: 5 types, a Line, a Tank or Artillery, at most one Charger', ok);
  check('random loadout: varied', new Set(draws.map((d) => [...d].sort().join())).size > 20 && MECH_TYPES.every((t) => draws.some((d) => d.includes(t))));
  const lo = ['scout', 'gunner', 'seeker', 'aegis', 'mortar'];
  const w = new World({ name: 'L', index: 6, baseHp: 1e6, lvl: 0, regen: 0, roster: lo, turrets: [], base: {} }, defaultSave(), ALL, { seed: 21 });
  const all = [];
  for (let i = 0; i < 2000; i++) { w.time = i % 400; for (const g of w.aiOrder(i % 4 === 0 ? 800 : 0).groups) all.push(...g); }
  check('AI fields only its loadout (no Tank in a tankless loadout)', all.every((t) => lo.includes(t)) && lo.every((t) => all.includes(t)), [...new Set(all)].join(','));
}

// personalities and focus types (ISSUES.md 2026-11-19)
{
  check('personality: every stage has one, its focus types are in its loadout', STAGES.every((st) => PERSONALITIES[st.personality] && PERSONALITIES[st.personality].focus.every((t) => st.roster.includes(t))));
  let r = 11; const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const ok = RANDOM_PERSONALITIES.every((p) => Array.from({ length: 50 }, () => randomLoadout(rnd, MECH_TYPES, p)).every((lo) => lo.length === LOADOUT_SIZE && new Set(lo).size === LOADOUT_SIZE && PERSONALITIES[p].focus.every((t) => lo.includes(t))
    && lo.some((t) => MECHS[t].role === 'line') && lo.some((t) => ['tank', 'artillery'].includes(MECHS[t].role))));
  check('personality: a random loadout always holds its focus types and keeps the rules', ok);
  const w = new World(stageDef(7), defaultSave(), ALL, { seed: 4 });
  check('focus: the battle draws a target in the range', w.focusX >= AI.focus.range[0] && w.focusX <= AI.focus.range[1] && w.focus.join() === 'breacher,lancer', `${w.focusX} ${w.focus}`);
  check('focus: Artillery/Support focus types get no boost as singles', w.focusOf('lancer', true) === 1 && w.focusOf('breacher', true) > 1);
  const alone = focusFactor(stageDef(5), { target: 3 }), hunt = focusFactor(stageDef(2), { target: 3 }), siege = focusFactor(stageDef(7), { target: 3 });
  check('focus: a focus type that works alone ends near the target (×3)', Math.abs(alone.factor - 3) < 0.4 && Math.abs(hunt.factor - 3) < 0.4, `breacher ×${alone.factor.toFixed(2)}, seeker ×${hunt.factor.toFixed(2)}`);
  check('focus: siege deploys clearly more Breachers and Lancers than before (×0.4)', siege.factor > 2, `×${siege.factor.toFixed(2)}`);
  const low = focusFactor(stageDef(7), { target: 2.2 }), high = focusFactor(stageDef(7), { target: 3.5 });
  check('focus: a higher drawn target gives more focus types', high.factor > low.factor, `${low.factor.toFixed(2)} < ${high.factor.toFixed(2)}`);
}
// lane sets (swarm: three lanes per phase, weighted toward weakly defended lanes)
{
  const sw = stageDef(6);
  check('swarm: focus types Scout + Gunner, three-lane sets', PERSONALITIES.swarm.focus.join() === 'scout,gunner' && PERSONALITIES.swarm.lanes === 'three');
  const w = mk(); w.stage = sw; w.time = 10;
  const set = w.laneSet();
  const lanes = Array.from({ length: 300 }, () => w.aiLane(0, [0, 0, 0, 0, 0]));
  check('lane set: one of the four 3-lane sets, all deploys inside it', AI.laneSets.three.some((x) => x.join() === set.join()) && lanes.every((l) => set.includes(l)) && new Set(lanes).size === 3, `${set} → ${[...new Set(lanes)]}`);
  const end = w.ai.setEnd;
  check('lane set: a phase lasts 60–120 s', end - 10 >= 60 && end - 10 <= 120, `${(end - 10).toFixed(0)} s`);
  const seen = new Set(); for (let t = 0; t < 1200; t += 5) { w.time = t; seen.add(w.laneSet().join()); }
  check('lane set: changes over a battle, logged', seen.size >= 2 && w.log.events.filter((e) => e[1] === 'lanes').length >= 5, [...seen].join(' | '));
  // turrets cover lanes 3–5 (and 2 a little): sets with lane 1 are much more likely
  const v = mk(); v.stage = sw;
  for (const l of [2, 3, 4]) { v.placeTurret(0, 'sentry', l, 2); v.placeTurret(0, 'sentry', l, 3); }
  const n = {}; for (let i = 0; i < 600; i++) { v.ai.set = null; const x = v.laneSet().join(); n[x] = (n[x] || 0) + 1; }
  check('lane set: sets with open lanes are more likely, others still possible', (n['0,1,2'] || 0) > 2 * (n['2,3,4'] || 0) && (n['2,3,4'] || 0) > 0, JSON.stringify(n));
  const o = mk(); o.stage = stageDef(7);
  check('lane set: other personalities use all lanes (none)', o.laneSet() === null);
  const d = mk(); d.stage = sw; d.time = 10; d.laneSet();
  const out = d.ai.set; const other = [0, 1, 2, 3, 4].find((l) => !out.includes(l));
  const lp = [0, 0, 0, 0, 0]; lp[other] = 900;
  check('lane set: a defender still goes where it is pushed', d.aiDefend(lp).lane === other);
}
// swarm waves (AI.wave)
{
  const sw = stageDef(6);
  const runWaves = (stage, secs, setup = () => {}) => {
    const w = new World({ ...stage, turrets: [] }, defaultSave(), ALL, { seed: 5 });
    setup(w);
    for (let t = 0; t < secs; t += 1 / 60) w.update(1 / 60);
    return w;
  };
  const w = runWaves(sw, 240);
  const dep = w.log.events.filter((e) => e[1] === 'deploy' && e[2] === 0), waves = w.log.events.filter((e) => e[1] === 'wave');
  const first = dep[0]?.[0] ?? 0;
  check('waves: the swarm saves first (no deploy before it can afford a wave)', first > 20 && waves.length >= 2, `first deploy ${first}s, ${waves.length} waves`);
  const byWave = {}; for (const e of dep) (byWave[e[6]] ||= []).push(e);
  const sizes = Object.values(byWave).map((x) => x.length);
  const gaps = Object.values(byWave).flatMap((x) => x.slice(1).map((e, i) => e[0] - x[i][0]));
  check('waves: 5–12 units each, one about every 1–1.2 s', sizes.every((n) => n >= 5 && n <= 12) && gaps.every((g) => g >= 0.95 && g <= 1.3), `sizes ${sizes}, gaps ${Math.min(...gaps).toFixed(2)}–${Math.max(...gaps).toFixed(2)}`);
  const mixed = Object.values(byWave).filter((x) => new Set(x.map((e) => e[3])).size > 1);
  const slowFirst = mixed.every((x) => { const fs = x.filter((e) => ['scout', 'gunner'].includes(e[3])).map((e) => MECHS[e[3]].speed); return fs.every((v, i) => !i || v >= fs[i - 1]); });
  check('waves: slowest first (Scouts after the Gunners)', slowFirst, mixed.map((x) => x.map((e) => e[3].slice(0, 2)).join(' ')).join(' | '));
  check('waves: inside the lane set', Object.values(byWave).every((x) => x.every((e) => w.log.events.some((l) => l[1] === 'lanes' && String(l[3]).includes(String(e[5]))))));
  const styles = new Set(); let extras = 0, tankLed = 0;
  const lo = ['brawler', 'gunner', 'scout', 'mortar', 'aegis'];
  for (let seed = 1; seed <= 12; seed++) {
    const v = new World({ ...sw, roster: lo, turrets: [] }, defaultSave(), ALL, { seed });
    for (let i = 0; i < 30; i++) { const wave = v.aiBuildWave(); styles.add(v.ai.waveStyle);
      if (v.ai.waveStyle === 'tank') tankLed += wave[0].type === 'brawler' ? 1 : -100;
      if (['mortar', 'aegis'].includes(wave[wave.length - 1].type)) extras++;
      if (wave.slice(0, -1).some((u) => ['mortar', 'aegis'].includes(u.type))) extras -= 100; }
  }
  check('waves: plain, mixed and tank-led (with a tank in the loadout); tanks lead', styles.size === 3 && tankLed > 0, `${[...styles]} tank-led ${tankLed}`);
  check('waves: other unit types only at the back, now and then', extras > 10, `${extras}`);
  const noTank = new World({ ...sw, turrets: [] }, defaultSave(), ALL, { seed: 2 });
  const st2 = new Set(); for (let i = 0; i < 40; i++) { noTank.aiBuildWave(); st2.add(noTank.ai.waveStyle); }
  check('waves: no tank-led wave without a tank (stage 7)', !st2.has('tank') && st2.size === 2);
  // lane sets never repeat back to back; waves use 1–3 neighbouring lanes of the set (mostly 2)
  { const v = new World({ ...sw, turrets: [] }, defaultSave(), ALL, { seed: 5 }); let rep = 0, prev = null;
    for (let i = 0; i < 200; i++) { v.time = i * 200; const s = v.laneSet(); if (s === prev) rep++; prev = s; }
    check('lane sets: never the same set twice in a row', rep === 0, `${rep} repeats`);
    const wn = [0, 0, 0, 0]; let neigh = true;
    for (let i = 0; i < 400; i++) { v.time = 300 + i; const wv = v.aiBuildWave(), ls = [...new Set(wv.map((u) => u.lane))].sort((a, b) => a - b);
      wn[ls.length]++; const set = [...v.ai.set].sort((a, b) => a - b), ix = ls.map((l) => set.indexOf(l));
      if (ix.some((x, j) => x < 0 || (j && x !== ix[j - 1] + 1))) neigh = false; }
    check('waves: mostly 2 neighbouring lanes of the set, sometimes 1 or all 3', neigh && wn[2] > wn[1] && wn[1] > wn[3] && wn[3] > 20, `1 lane ${wn[1]}, 2 lanes ${wn[2]}, 3 lanes ${wn[3]}`); }
  // early waves smaller (budget 400 → 600 over 4 min); extras: every mixed wave, about 1 in 3 plain waves
  const cost = (wv) => wv.reduce((a, u) => a + MECHS[u.type].cost, 0);
  const rw = new World({ ...sw, turrets: [] }, defaultSave(), ALL, { seed: 3 });
  rw.time = 0; const c0 = cost(rw.aiBuildWave()); rw.time = 300; const c1 = cost(rw.aiBuildWave());
  check('waves: early waves smaller (budget grows over the first 4 minutes)', c0 <= 400 && c1 > 450 && c1 <= 600, `${c0} → ${c1}`);
  const ex = { plain: [0, 0], mixed: [0, 0] };
  for (let seed = 1; seed <= 10; seed++) { const v = new World({ ...sw, turrets: [] }, defaultSave(), ALL, { seed }); v.time = 300;
    for (let i = 0; i < 60; i++) { const wv = v.aiBuildWave(), s = v.ai.waveStyle; ex[s][0]++; if (!v.focus.includes(wv[wv.length - 1].type)) ex[s][1]++; } }
  const pr = (s) => ex[s][1] / ex[s][0];
  check('waves: an extra unit type at the back of every mixed wave and about 1 in 3 plain waves', pr('mixed') === 1 && pr('plain') > 0.25 && pr('plain') < 0.42, `mixed ${pr('mixed').toFixed(2)}, plain ${pr('plain').toFixed(2)}`);
  const d = runWaves(sw, 15, (v) => { for (let i = 0; i < 5; i++) { const m = v.spawn({ kind: 'mech', type: 'gunner', team: 0, lane: 2, x: laneX(2), y: BASE_FACE[1] - 400 - i * 50 }); m.hp = m.maxHp = 1e9; m.def = { ...m.def, speed: 0, dmg: 0 }; } });
  const dd = d.log.events.filter((e) => e[1] === 'deploy' && e[2] === 0);
  check('waves: under pressure it defends at once instead of saving', dd.length >= 2 && dd[0][0] < 12, dd.map((e) => `${e[0]}s ${e[3]}`).join(', '));
}
// enemy door (ISSUES.md 2026-11-19, hidden Lancer): groups come through the door one by one, never behind the base face
{
  const st = { name: 'D', index: 9, baseHp: 1e6, lvl: 0, regen: 0, roster: ['brawler', 'gunner', 'seeker', 'lancer'], turrets: [], base: {} };
  const w = new World(st, defaultSave(), ALL, { seed: 4 });
  for (const t of ['brawler', 'gunner', 'seeker', 'lancer']) w.ai.door[1].push({ type: t, order: 1, gi: 1, wait: 0 });
  let behind = 0;
  for (let i = 0; i < 60 * 12; i++) { w.update(1 / 60); for (const e of w.entities) if (!e.dead && e.kind === 'mech' && e.team === 1 && e.y > BASE_FACE[1]) behind++; }
  const dep = w.log.events.filter((e) => e[1] === 'deploy' && e[2] === 0);
  const gaps = dep.slice(1).map((e, i) => e[0] - dep[i][0]);
  check('enemy door: a group comes through one by one, front unit first', dep.map((e) => e[3]).join() === 'brawler,gunner,seeker,lancer' && gaps.every((g) => g > 0.3 && g <= 1.6), `${dep.map((e) => `${e[0]}s ${e[3]}`).join(', ')}`);
  check('enemy door: no enemy mech behind its base face', behind === 0, `${behind} frames`);
  const v = new World(st, defaultSave(), ALL, { seed: 4 });
  const m = v.spawn({ kind: 'mech', type: 'seeker', team: 1, lane: 1, x: laneX(1), y: BASE_FACE[1] - 24 }); m.def = { ...m.def, speed: 0 };
  v.ai.door[1].push({ type: 'lancer', order: 1, gi: 1, wait: 0 });
  let t = 0; while (!v.log.events.some((e) => e[1] === 'deploy') && t < 5) { v.update(1 / 60); t += 1 / 60; }
  check('enemy door: an occupied door delays a deploy by at most 1.5 s', t > 1.4 && t < 1.6, `${t.toFixed(2)} s`);
}
// replays: same seed, setup and inputs give the same battle
{
  const st = { ...stageDef(8) };
  const unl = { mechs: ['brawler', 'gunner', 'seeker', 'aegis', 'mortar'], turrets: TURRET_TYPES, specials: ['bomb', 'emp', 'surge'] };
  const setup = JSON.parse(JSON.stringify({ seed: 12345, stage: st, unlocked: unl, dev: {} }));
  const w = new World(st, defaultSave(), unl, { seed: 12345, dev: {} });
  let r = 7; const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 60 * 200; i++) {
    if (i % 90 === 0) { w.setLane(Math.floor(rnd() * 5), rnd() < 0.2); w.request(unl.mechs[Math.floor(rnd() * 5)]); }
    if (i % 1500 === 700) w.order(Math.floor(rnd() * 5), 6, 'howitzer');
    if (i % 2000 === 1000) w.special('bomb', 300, 1500 + rnd() * 300);
    if (i === 3000) w.upgradeBase('reactor');
    if (i === 5000) w.setBaseDeploy(2);
    w.update(1 / 60);
  }
  const row = { timeline: [...w.log.timeline, w.sample(false)], events: w.log.events, replay: { ...setup, steps: w.step, inputs: w.inputs } };
  const v = runReplay(row.replay);
  const diff = checkReplay(row, v);
  check('replay: same seed, setup and inputs give the same battle', !diff && w.inputs.length > 100 && v.log.events.length === w.log.events.length, diff ? JSON.stringify(diff) : `${w.inputs.length} inputs, ${w.log.events.length} events`);
  check('replay: inputs are not logged again while replaying', v.inputs.length === 0);
}
// quick match (src/quick.js): one setup from a seed; fixed fields override; difficulty = the enemy's ramp
{
  const types = unlockedSet(8).mechs;
  const a = quickMatch('hard', 0xa9b3c1f2, {}, false, 8, types), b = quickMatch('hard', 0xa9b3c1f2, {}, false, 8, types);
  check('quick match: the same seed gives the same setup', JSON.stringify(a.st) === JSON.stringify(b.st));
  const many = Array.from({ length: 60 }, (_, k) => quickMatch('medium', k * 7919, {}, false, 8, types).st);
  check('quick match: strength of the highest cleared stage (8), turrets of a cleared stage, enemy units from yours',
    many.every((st) => st.lvl === STAGES[7].lvl && st.regen === STAGES[7].regen && st.roster.every((t) => types.includes(t)) && st.quick.turretStage <= 7)
    && new Set(many.map((st) => st.quick.turretStage)).size >= 5 && new Set(many.map((st) => st.personality)).size >= 5);
  check('quick match: focus types in the loadout, surprise from stage 7', many.every((st) => PERSONALITIES[st.personality].focus.some((t) => st.roster.includes(t)) && st.roster.includes(st.surprise)));
  const early = quickMatch('easy', 5, {}, false, 2, unlockedSet(2).mechs).st;
  check('quick match: no surprise before stage 7; only unlocked types early', !early.surprise && early.roster.every((t) => unlockedSet(2).mechs.includes(t)), early.roster.join());
  const f = quickMatch('hard', 0xa9b3c1f2, { personality: 'siege' }, true, 8, types);
  check('dev match: a fixed field overrides, the other draws stay the same', f.st.personality === 'siege' && f.st.quick.turretStage === a.st.quick.turretStage);
  const g = quickMatch('hard', 1, { turretStage: 2, level: 4 }, true, 8, types);
  check('dev match: fixed turret stage and level', JSON.stringify(g.st.turrets) === JSON.stringify(STAGES[2].turrets) && g.st.lvl === 4);
  const inc = (d) => { const w = new World({ ...quickMatch(d, 3, {}, false, 8, types).st, turrets: [] }, defaultSave(), ALL, { seed: 1 }); w.time = 420; w.ai.energy = 0; w.updateAI(1); return w.ai.energy; };
  const [e, m, h] = ['easy', 'medium', 'hard'].map(inc);
  check('quick match: difficulty = income ramp (×1.5 / ×2 / ×2.5 at 7 min)', Math.abs(m / e - 2 / 1.5) < 0.02 && Math.abs(h / e - 2.5 / 1.5) < 0.02, `${e.toFixed(2)} ${m.toFixed(2)} ${h.toFixed(2)}`);
}
// defensive pick (the user's order, followed about 70% of the time)
{
  const st = { name: 'D', index: 9, baseHp: 1e6, lvl: 0, regen: 0, roster: ['brawler', 'gunner', 'seeker', 'mortar', 'lancer'], turrets: [], base: {} };
  const picks = (setup) => {
    const w = mk(); w.stage = st; setup(w);
    const out = {}; for (let i = 0; i < 400; i++) { const o = w.aiDefend([0, 0, 800, 0, 0]); out[o.groups[0][0]] = (out[o.groups[0][0]] || 0) + 1; if (o.lane !== 2) out.wrongLane = 1; }
    return out;
  };
  const face = BASE_FACE[1];
  const shelled = picks((w) => { mech(w, 'mortar', 0, 2, face - 600); mech(w, 'lancer', 0, 1, face - 700); });
  check('defend: shelled from afar by artillery → Seeker first', shelled.seeker > 280 && !shelled.wrongLane, JSON.stringify(shelled));
  const pushed = picks((w) => { mech(w, 'gunner', 0, 2, face - 400); });
  check('defend: no own tank in the pushed lane → Brawler first', pushed.brawler > 280, JSON.stringify(pushed));
  const tanked = picks((w) => { mech(w, 'gunner', 0, 2, face - 400); mech(w, 'brawler', 1, 2, face - 200); });
  check('defend: with its tank there → Seeker or Gunner', tanked.seeker + tanked.gunner > 280 && tanked.seeker > 60 && tanked.gunner > 60, JSON.stringify(tanked));
  check('defend: some variety (random defender about 30%)', pushed.gunner > 20 && pushed.seeker > 20, JSON.stringify(pushed));
  check('defend: deploys in the lane pushed hardest', !shelled.wrongLane && !pushed.wrongLane);
}

// scrimmage line (world.updateFront)
{
  const w = mk();
  w.updateFront();
  const mid = (BASE_FACE[0] + BASE_FACE[1]) / 2;
  check('front: empty field → the middle of every lane, even share', w.front.every((y) => Math.abs(y - mid) < 1) && Math.abs(w.frontShare - 0.5) < 1e-9, w.front.join());
  const v = mk();
  mech(v, 'gunner', 0, 1, 1500); mech(v, 'gunner', 0, 1, 900); // a runner at 1500, the second mech at 900
  mech(v, 'scout', 0, 3, 2000); mech(v, 'aegis', 0, 3, 1900);  // Charger and Support don't count
  for (let i = 0; i < 40; i++) v.updateFront();               // eased in
  check('front: the second most advanced mech sets a side\'s front (a lone runner doesn\'t)', Math.abs(v.front[1] - (900 + BASE_FACE[1]) / 2) < 2, v.front[1].toFixed(1));
  check('front: Scouts and Aegis don\'t move it', Math.abs(v.front[3] - mid) < 2, v.front[3].toFixed(1));
  check('front: the player ahead in a lane → share above 0.5', v.frontShare > 0.5);
  const t = mk([['sentry', 4, 3]]);
  for (let i = 0; i < 40; i++) t.updateFront();
  check('front: an enemy turret holds its side\'s front in its lane', t.front[4] < mid - 50 && Math.abs(t.front[0] - mid) < 2, t.front[4].toFixed(1));
  const r = mk(); mech(r, 'gunner', 0, 2, 1400); mech(r, 'gunner', 0, 2, 1300); run(r, 11);
  check('front: sampled every 5 s as [t, average %, lane 1–5 %]', r.log.front.length === 3 && r.log.front.map((e) => e[0]).join() === '0,5,10' && r.log.front[2].length === 7 && r.log.front[2][4] > 50, JSON.stringify(r.log.front));
}

// bot 2.0 (src/bot.js): plays through the player's inputs only, so a bot match replays exactly without the bot
{
  const { quickMatch } = await import('../src/quick.js');
  const { Bot, botProfile } = await import('../src/bot.js');
  const { replayWorld, replayStep } = await import('../src/replay.js');
  const q = quickMatch('medium', 0x389a0f7c, { level: 0, personality: 'swarm' }, true, 12, ['scout', 'gunner', 'brawler', 'mortar', 'seeker', 'aegis', 'lancer', 'breacher']);
  const unl = { mechs: ['brawler', 'gunner', 'seeker', 'mortar', 'aegis'], turrets: ['sentry', 'howitzer', 'arc'], specials: ['bomb', 'emp', 'surge'] };
  const setup = JSON.parse(JSON.stringify({ seed: q.st.quick.seed, stage: q.st, unlocked: unl, dev: {} }));
  const w = new World(JSON.parse(JSON.stringify(setup.stage)), defaultSave(), unl, { seed: setup.seed });
  const bot = new Bot(w, botProfile('you'), 7);
  for (let i = 0; i < 60 * 240 && !w.result; i++) { w.update(1 / 60); bot.tick(w); }
  check('bot: plays (Reactor in the opening, units deployed, upgrades)', w.baseLvl.reactor >= 2 && w.stats.deployed >= 8 && w.log.upgrades.length >= 4, `${w.baseLvl.reactor} ${w.stats.deployed} ${w.log.upgrades.length}`);
  check('bot: says what it thinks', typeof bot.thought === 'string' && bot.thought.length > 5, bot.thought);
  const rep = { ...setup, steps: w.step, inputs: w.inputs };
  const r = replayWorld(rep); let k = 0;
  while (r.step < rep.steps) k = replayStep(r, rep, k);
  check('bot: its match replays exactly from the inputs alone', JSON.stringify(r.log.events) === JSON.stringify(w.log.events), `${r.log.events.length} vs ${w.log.events.length}`);
  check('bot: settings override the profile', botProfile('you', { pushLine: 70 }).pushLine === 70 && botProfile('nope').profile === 'you');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
