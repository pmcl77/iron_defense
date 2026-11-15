// Headless rule tests for the simulation. Run: node tools/test.mjs
import { World } from '../src/world.js';
import { QUEUE, MECHS, MECH_TYPES, TURRET_TYPES, TURRETS, CONSTRUCTOR, laneX, laneOf, cellY, unlockedSet, sellRefund, BASE_FACE } from '../src/data.js';
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
  check('Veteran Training: unit level', w.lvl[0].gunner === 3 && m.maxHp === 230 * 1.75, `hp ${m.maxHp}`);
  w.order(2, 1, 'sentry'); w.update(1 / 60);
  check('Veteran Training: Constructor', w.con && w.con.maxHp === 350, `hp ${w.con && w.con.maxHp}`);
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
  const sk = mech(w, 'seeker', 0, 0, 1000, 1e9); w.update(1 / 60);
  check('seeker reaches any lane', sk.target === near || sk.target === far);
}
// 17. Line stays behind a marching tank; a Charger passes it and returns home
{
  const w = mk();
  const slow = mech(w, 'brawler', 0, 2, 600, 1e9), g = mech(w, 'gunner', 0, 2, 540, 1e9);
  run(w, 6);
  check('line stays behind a marching tank', g.lane === 2 && g.y < slow.y && slow.y - g.y >= slow.radius + g.radius, `gap ${(slow.y - g.y).toFixed(1)}`);
  const w2 = mk();
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
  // Line behind a fighting Line with no shot of its own fans out (and stays out)
  const wf = mk();
  const tf = mech(wf, 'brawler', 1, 2, 1500, 1e9); tf.def = { ...tf.def, dmg: 0, speed: 0 };
  const sk = mech(wf, 'seeker', 0, 2, 1150, 1e9), gf = mech(wf, 'gunner', 0, 2, 1090, 1e9);
  run(wf, 12);
  check('line fans out behind a fighting line mech', Math.abs(gf.lane - 2) === 1 && gf.target === tf, `lane ${gf.lane}`);
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
  check('gunner walks on beside a fighting seeker (pass becomes fan-out)', gr.y > sr.y && gr.lane !== 2 && gr.homeLane == null, `SE ${sr.y.toFixed(0)} GU L${gr.lane} ${gr.y.toFixed(0)} home ${gr.homeLane}`);
  const wm = mk();
  const mm = mech(wm, 'mortar', 0, 2, 600, 1e9), bm = mech(wm, 'brawler', 0, 2, 540, 1e9), gm = mech(wm, 'gunner', 0, 2, 480, 1e9);
  run(wm, 40);
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
  const runner = mech(w2, 'scout', 1, 3, 1480, 1000); runner.def = { ...runner.def, dmg: 0, range: 1 };
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
  const w = mk();
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
