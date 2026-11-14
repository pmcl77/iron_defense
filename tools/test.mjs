// Headless rule tests for the simulation. Run: node tools/test.mjs
import { World } from '../src/world.js';
import { MECH_TYPES, TURRET_TYPES, TURRETS, CONSTRUCTOR, laneX, cellY, unlockedSet, sellRefund, BASE_FACE } from '../src/data.js';
import { defaultSave } from '../src/save.js';

const ALL = { mechs: MECH_TYPES, turrets: TURRET_TYPES, specials: ['bomb', 'emp', 'surge'] };
let pass = 0, fail = 0;
function check(name, cond, info = '') {
  if (cond) pass++; else { fail++; console.log(`FAIL  ${name}${info ? '  — ' + info : ''}`); }
}
// A quiet test world: no enemy income, no player regen, plenty of energy.
function mk(turrets = []) {
  const st = { name: 'Test', index: 0, baseHp: 1e6, lvl: 0, regen: 0, roster: ['scout'], turrets, base: {} };
  const w = new World(st, defaultSave(), ALL, { seed: 7 });
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
// 2. Hold: stop at range of an enemy turret, never sidestep
{
  const w = mk([['sentry', 2, 6]]);
  const t = tough(w.cells[1][2][6]); t.def = { ...t.def, dmg: 0 };
  const g = mech(w, 'gunner', 0, 2, 1100, 1e9);
  run(w, 15);
  const edge = t.y - g.y - t.radius;
  check('hold stops at range', Math.abs(edge - 260) < 3, `edge ${edge.toFixed(1)}`);
  check('hold never sidesteps', g.lane === 2);
}
// 3. Advance: walk past a single turret by sidestepping
{
  const w = mk([['sentry', 2, 6]]);
  const t = tough(w.cells[1][2][6]); t.def = { ...t.def, dmg: 0 };
  const g = mech(w, 'gunner', 0, 2, 1100, 1e9);
  w.setMode('advance');
  run(w, 25);
  check('advance sidesteps', g.lane === 1 || g.lane === 3, `lane ${g.lane}`);
  check('advance passes the turret', g.y > t.y + 40, `y ${g.y.toFixed(0)} vs turret ${t.y}`);
}
// 4. a complete wall stops everything, even in Advance
{
  const w = mk([0, 1, 2, 3, 4].map((l) => ['sentry', l, 6]));
  for (const l of [0, 1, 2, 3, 4]) { const t = tough(w.cells[1][l][6]); t.def = { ...t.def, dmg: 0 }; }
  const g = mech(w, 'gunner', 0, 2, 1100, 1e9);
  w.setMode('advance');
  run(w, 30);
  check('full wall stops', g.y < cellY(1, 6) - 30 && g.lane === 2, `y ${g.y.toFixed(0)} lane ${g.lane}`);
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
// 12. AI mode switching
{
  const w = mk();
  w.update(1 / 60);
  check('AI starts in hold', w.mode[1] === 'hold');
  w.bases[0].hp = w.bases[0].maxHp * 0.4; w.update(1 / 60);
  check('AI advances when player base < 50%', w.mode[1] === 'advance');
  w.bases[1].hp = w.bases[1].maxHp * 0.2; w.update(1 / 60);
  check('AI holds when own base < 30%', w.mode[1] === 'hold');
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
  save.perks = { energy: 3, armor: 3, charge: 3 };
  for (const t of [...MECH_TYPES, ...TURRET_TYPES, 'builder']) save.tech[t] = 3;
  const st = { name: 'Test', index: 0, baseHp: 1e6, lvl: 0, regen: 0, roster: ['scout'], turrets: [], base: {} };
  const w = new World(st, save, ALL, { seed: 1 });
  check('Capacitors: starting energy', w.energy === 250, `energy ${w.energy}`);
  check('Capacitors: max energy', w.maxEnergy === 420, `max ${w.maxEnergy}`);
  w.energy = 1000; w.upgradeBase('reactor');
  check('Reactor stacks on top of Capacitors', w.maxEnergy === 480, `max ${w.maxEnergy}`);
  check('Reinforced Walls: base HP', w.bases[0].maxHp === 4350, `hp ${w.bases[0].maxHp}`);
  check('Fast Uplink: cooldowns', Math.abs(w.specialMult - 0.7) < 1e-9 && Math.abs(w.specialCd.bomb - 14) < 1e-9);
  const m = w.spawn({ kind: 'mech', type: 'gunner', team: 0, lane: 2, x: 300, y: 500 });
  check('Veteran Training: unit level', w.lvl[0].gunner === 3 && m.maxHp === 230 * 1.75, `hp ${m.maxHp}`);
  w.order(2, 1, 'sentry'); w.update(1 / 60);
  check('Veteran Training: Constructor', w.con && w.con.maxHp === 350, `hp ${w.con && w.con.maxHp}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
