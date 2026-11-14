import {
  FIELD, LANES, ROWS, FWD, BASE_FACE, laneX, laneOf, cellY, MECHS, TURRETS, CONSTRUCTOR, BASE, BASE_UPGRADES, SPECIALS,
  ENERGY, QUEUE, levelMult, upgradeCost, MAX_UNIT_LEVEL, MAX_TECH, sellRefund,
} from './data.js';

// The simulation. No drawing and no DOM: everything visual or audible is emitted as `fx`
// events that the renderer and audio consume. Runs in the browser and in Node (tools/).
// Coordinates: x 0..600 (west → east), y 0..2400 (player base → enemy base). Angles are
// clockwise from north (+y), so heading (dx, dy) = atan2(dx, dy).

let nextId = 1;
const TAU = Math.PI * 2;
const AIM_TOL = (10 * Math.PI) / 180;
const SHIFT_TIME = 0.5;
const PAUSE_TO_FIRE = 0.4;
const GAP = 4;            // spacing kept between friendly mechs in a lane
const LANE_REACH = 1;     // mechs target their own lane and this many lanes to each side

export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
export const headingTo = (a, b) => Math.atan2(b.x - a.x, b.y - a.y);
const isStructure = (f) => f.kind === 'turret' || f.kind === 'base';

export class World {
  // unlocked: { mechs, turrets, specials }. opts.seed makes the run reproducible.
  constructor(stage, save, unlocked, opts = {}) {
    this.stage = stage;
    this.unlocked = unlocked;
    this.rnd = opts.seed != null ? mulberry32(opts.seed) : Math.random;
    this.time = 0;
    this.entities = [];
    this.projectiles = [];
    this.bombs = [];
    this.fx = [];
    this.result = null;
    this.stats = { kills: 0, deployed: 0, lost: 0 };
    this.mode = ['hold', 'hold'];
    this.activeLane = 2;

    // unit levels per team
    this.lvl = [{}, {}];
    for (const t of [...Object.keys(MECHS), ...Object.keys(TURRETS), 'builder']) {
      this.lvl[0][t] = Math.min(MAX_TECH, save.tech[t] || 0);
      this.lvl[1][t] = stage.lvl;
    }
    const perks = save.perks;
    this.baseLvl = { armor: 0, gun: 0, reactor: 0 };
    const eb = { armor: 0, gun: 0, reactor: 0, ...(stage.base || {}) };
    this.enemyBase = eb;
    this.gunLvl = [0, eb.gun];

    // player economy
    this.maxEnergy = ENERGY.cap + ENERGY.perkCap * perks.energy;
    this.energy = Math.min(this.maxEnergy, ENERGY.start + ENERGY.perkStart * perks.energy);
    this.regen = ENERGY.regen + ENERGY.perkRegen * (perks.regen || 0);
    this.deployCd = {};
    this.queue = []; // [{ type, lane }], strict first in, first out
    this.queueWait = 0;
    this.specialMult = 1 - 0.1 * perks.charge;
    this.specialCd = {};
    for (const k of Object.keys(SPECIALS)) this.specialCd[k] = SPECIALS[k].cd * this.specialMult * 0.5;

    // bases
    this.playerBaseHp = BASE.hp * (1 + 0.15 * perks.armor);
    this.bases = [
      this.spawn({ kind: 'base', type: 'base', team: 0, x: FIELD.w / 2, y: BASE_FACE[0], hp: this.playerBaseHp }),
      this.spawn({ kind: 'base', type: 'base', team: 1, x: FIELD.w / 2, y: BASE_FACE[1], hp: stage.baseHp * (1 + 0.2 * eb.armor) }),
    ];

    // turret cells: cells[team][lane][row] = turret entity | null
    this.cells = [0, 1].map(() => Array.from({ length: LANES }, () => Array(ROWS).fill(null)));
    for (const [type, lane, row] of stage.turrets) this.placeTurret(1, type, lane, row);

    // constructor and the order queue (player only)
    this.orders = [];
    this.con = null;
    this.conWait = 0;

    this.ai = { energy: 40, next: null, killedTurret: false };
  }

  // ---------- entities ----------
  spawn(o) {
    const def = o.kind === 'mech' ? MECHS[o.type] : o.kind === 'turret' ? TURRETS[o.type] : o.kind === 'constructor' ? CONSTRUCTOR : BASE;
    const lv = o.kind === 'base' ? 0 : this.lvl[o.team][o.type];
    const hp = o.hp || def.hp * levelMult(lv).hp;
    const face = o.team === 0 ? 0 : Math.PI;
    const e = {
      id: nextId++, kind: o.kind, type: o.type, team: o.team, x: o.x, y: o.y, lane: o.lane ?? -1, row: o.row ?? -1,
      hp, maxHp: hp, def, radius: def.radius, cool: this.rnd() * 0.3, stun: 0, pause: 0,
      aim: face, body: face, phase: this.rnd() * 6, moving: false, dead: false, recoil: 0, flash: 0, hurt: 0,
      jitter: o.jitter || 0, shift: null, target: null, born: this.time,
    };
    this.entities.push(e);
    return e;
  }
  placeTurret(team, type, lane, row) {
    const t = this.spawn({ kind: 'turret', type, team, lane, row, x: laneX(lane), y: cellY(team, row) });
    this.cells[team][lane][row] = t;
    return t;
  }
  stat(e, key) {
    if (e.kind === 'base') return key === 'dmg' ? BASE.dmg * (1 + 0.5 * this.gunLvl[e.team]) : BASE[key];
    const base = e.def[key];
    const m = levelMult(this.lvl[e.team][e.type]);
    return key in m ? base * m[key] : base;
  }
  // edge distance from attacker e to target f
  dist(e, f) {
    if (e.kind === 'base') return Math.abs(f.y - e.y) - f.radius;
    if (f.kind === 'base') return Math.abs(e.y - f.y);
    return Math.hypot(f.x - e.x, f.y - e.y) - f.radius;
  }
  ahead(e, f) { return f.kind === 'base' || (f.y - e.y) * FWD[e.team] >= -f.radius; }

  // ---------- player actions ----------
  canDeploy(type) {
    return !this.result && this.unlocked.mechs.includes(type) && this.energy >= MECHS[type].cost && !(this.deployCd[type] > 0);
  }
  deploy(type, lane = this.activeLane) {
    if (!this.canDeploy(type)) return false;
    const d = MECHS[type];
    this.energy -= d.cost;
    this.deployCd[type] = d.cd;
    const jitter = (this.rnd() * 2 - 1) * 20;
    const e = this.spawn({ kind: 'mech', type, team: 0, lane, x: laneX(lane) + jitter, y: BASE_FACE[0] + 24, jitter });
    this.stats.deployed++;
    this.fx.push({ t: 'deploy', x: e.x, y: e.y, team: 0, type });
    return true;
  }
  // Tap on a mech card: deploy now if nothing is waiting and it's affordable, otherwise queue.
  // Returns 'deployed' | 'queued' | 'full' | false.
  request(type, lane = this.activeLane) {
    if (this.result || !this.unlocked.mechs.includes(type)) return false;
    if (!this.queue.length && this.canDeploy(type) && this.spawnClear(lane)) return this.deploy(type, lane) ? 'deployed' : false;
    if (this.queue.length >= QUEUE.max) return 'full';
    this.queue.push({ type, lane });
    this.fx.push({ t: 'queue', type, lane });
    return 'queued';
  }
  cancelQueued(i) {
    if (i < 0 || i >= this.queue.length) return false;
    this.queue.splice(i, 1);
    if (i === 0) this.queueWait = 0;
    this.fx.push({ t: 'cancel' });
    return true;
  }
  clearQueue() {
    if (!this.queue.length) return false;
    this.queue.length = 0; this.queueWait = 0;
    this.fx.push({ t: 'cancel' });
    return true;
  }
  // no friendly mech overlapping the spawn point of this lane
  spawnClear(lane) {
    const y0 = BASE_FACE[0] + 24, x0 = laneX(lane);
    for (const e of this.entities)
      if (!e.dead && e.team === 0 && e.kind === 'mech' && Math.abs(e.x - x0) < 50 && Math.abs(e.y - y0) < e.radius + 26) return false;
    return true;
  }
  updateQueue(dt) {
    const q = this.queue[0];
    if (!q) return;
    if (!this.canDeploy(q.type)) { this.queueWait = 0; return; } // energy or cooldown: the whole queue waits
    this.queueWait += dt;
    if (!this.spawnClear(q.lane) && this.queueWait < QUEUE.wait) return;
    if (this.deploy(q.type, q.lane)) { this.queue.shift(); this.queueWait = 0; }
  }
  setLane(l) { if (l >= 0 && l < LANES) this.activeLane = l; }
  setMode(m) { if (m !== this.mode[0]) { this.mode[0] = m; this.fx.push({ t: 'mode', team: 0, mode: m }); } }

  orderAt(lane, row) { return this.orders.find((o) => o.lane === lane && o.row === row) || null; }
  canOrder(lane, row, type) {
    return !this.result && lane >= 0 && lane < LANES && row >= 0 && row < ROWS && !!TURRETS[type] &&
      !this.cells[0][lane][row] && !this.orderAt(lane, row) && this.energy >= TURRETS[type].cost;
  }
  order(lane, row, type) {
    if (!this.canOrder(lane, row, type)) return false;
    this.energy -= TURRETS[type].cost;
    this.orders.push({ lane, row, type, progress: 0 });
    this.fx.push({ t: 'order', x: laneX(lane), y: cellY(0, row) });
    return true;
  }
  cancel(lane, row) {
    const o = this.orderAt(lane, row);
    if (!o) return false;
    this.orders.splice(this.orders.indexOf(o), 1);
    this.energy = Math.min(this.maxEnergy, this.energy + TURRETS[o.type].cost);
    this.fx.push({ t: 'cancel', x: laneX(lane), y: cellY(0, row) });
    return true;
  }
  sell(lane, row) {
    const t = this.cells[0][lane]?.[row];
    if (!t || this.result) return false;
    this.energy = Math.min(this.maxEnergy, this.energy + sellRefund(TURRETS[t.type], t.hp / t.maxHp));
    t.dead = true; t.sold = true;
    this.cells[0][lane][row] = null;
    this.fx.push({ t: 'sell', x: t.x, y: t.y });
    return true;
  }
  unitUpgradeCost(type) {
    const def = MECHS[type] || TURRETS[type], lv = this.lvl[0][type];
    return lv >= MAX_UNIT_LEVEL ? null : upgradeCost(def, lv);
  }
  upgradeUnit(type) {
    const c = this.unitUpgradeCost(type);
    if (c == null || this.energy < c || this.result) return false;
    this.energy -= c;
    const before = levelMult(this.lvl[0][type]).hp;
    this.lvl[0][type]++;
    const ratio = levelMult(this.lvl[0][type]).hp / before;
    for (const e of this.entities) if (e.team === 0 && e.type === type && !e.dead) { e.maxHp *= ratio; e.hp *= ratio; }
    this.fx.push({ t: 'upgrade' });
    return true;
  }
  baseUpgradeCost(k) { return BASE_UPGRADES[k].costs[this.baseLvl[k]] ?? null; }
  upgradeBase(k) {
    const c = this.baseUpgradeCost(k);
    if (c == null || this.energy < c || this.result) return false;
    this.energy -= c;
    this.baseLvl[k]++;
    const b = this.bases[0];
    if (k === 'armor') { const add = BASE.hp * 0.2; b.maxHp += add; b.hp += add; }
    if (k === 'gun') this.gunLvl[0] = this.baseLvl.gun;
    if (k === 'reactor') { this.regen += 2; this.maxEnergy += 60; }
    this.fx.push({ t: 'upgrade' });
    return true;
  }
  canSpecial(k) { return !this.result && this.unlocked.specials.includes(k) && this.specialCd[k] <= 0; }
  special(k, x = FIELD.w / 2, y = 1200) {
    if (!this.canSpecial(k)) return false;
    this.specialCd[k] = SPECIALS[k].cd * this.specialMult;
    if (k === 'bomb') {
      for (let i = 0; i < 7; i++) {
        const a = this.rnd() * TAU, r = Math.sqrt(this.rnd()) * 110;
        this.bombs.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, t: 0.6 + i * 0.16 });
      }
      this.fx.push({ t: 'jet', x, y });
    } else if (k === 'emp') {
      for (const e of this.entities) if (e.team === 1 && (e.kind === 'mech' || e.kind === 'turret') && !e.dead) e.stun = 4;
      this.fx.push({ t: 'emp' });
    } else if (k === 'surge') {
      this.energy = Math.min(this.maxEnergy, this.energy + SPECIALS.surge.amount);
      this.fx.push({ t: 'surge' });
    }
    return true;
  }

  // ---------- simulation ----------
  update(dt) {
    this.time += dt;
    if (!this.result) {
      this.energy = Math.min(this.maxEnergy, this.energy + this.regen * dt);
      for (const k in this.deployCd) this.deployCd[k] -= dt;
      for (const k in this.specialCd) this.specialCd[k] = Math.max(0, this.specialCd[k] - dt);
      this.updateQueue(dt);
      this.updateAI(dt);
      this.updateConstructor(dt);
    }
    for (const e of this.entities) {
      if (e.dead) continue;
      e.recoil = Math.max(0, e.recoil - dt * 6);
      e.flash = Math.max(0, e.flash - dt);
      e.hurt = Math.max(0, e.hurt - dt);
      if (e.kind === 'constructor') continue;
      if (e.stun > 0) { e.stun -= dt; e.moving = false; continue; }
      if (this.result && e.team !== this.winnerTeam) { e.moving = false; continue; }
      this.think(e, dt);
    }
    this.updateProjectiles(dt);
    this.updateBombs(dt);
    this.entities = this.entities.filter((e) => !e.dead || e.kind === 'base');
    if (this.fx.length > 4000) this.fx.splice(0, this.fx.length - 4000);
  }

  // target choice: ahead first (mechs only), then preferred type, then nearest
  targetKey(e, f, d) {
    let k = d;
    if (e.kind === 'mech' && !this.ahead(e, f)) k += 1e6;
    const pref = e.def.pref;
    if (pref === 'mech' && f.kind !== 'mech') k += 1e4;
    if (pref === 'structure' && !isStructure(f)) k += 1e4;
    return k;
  }
  // mechs only reach their own lane and the neighbours (bases span every lane; Seeker missiles are exempt)
  inReach(e, f) {
    return e.kind !== 'mech' || e.def.anyLane || f.kind === 'base' || Math.abs(laneOf(f.x) - e.lane) <= LANE_REACH;
  }
  pickTarget(e, range) {
    let best = null, bestK = Infinity;
    for (const f of this.entities) {
      if (f.dead || f.team === e.team || !this.inReach(e, f)) continue;
      const d = this.dist(e, f);
      if (d > range) continue;
      const k = this.targetKey(e, f, d);
      if (k < bestK) { bestK = k; best = f; }
    }
    // keep the current target until it dies or leaves range, unless a better category appears
    const cur = e.target;
    if (cur && !cur.dead && cur !== best && this.inReach(e, cur)) {
      const d = this.dist(e, cur);
      if (d <= range && Math.floor(this.targetKey(e, cur, d) / 1e4) <= Math.floor(bestK / 1e4)) return cur;
    }
    return best;
  }

  think(e, dt) {
    const t = this.pickTarget(e, this.stat(e, 'range'));
    e.target = t;
    e.cool -= dt;
    e.pause = Math.max(0, e.pause - dt);
    let aimed = !!t;
    if (e.kind !== 'base') {
      const want = t ? headingTo(e, t.kind === 'base' ? { x: e.x, y: t.y } : t) : e.kind === 'mech' ? e.body : e.aim;
      const step = e.def.turn * dt, d = angDiff(e.aim, want);
      e.aim += Math.max(-step, Math.min(step, d));
      aimed = !!t && Math.abs(angDiff(e.aim, want)) < AIM_TOL;
    }
    if (e.kind === 'mech') this.move(e, dt, t);
    if (t && aimed && e.cool <= 0) {
      e.cool = this.stat(e, 'reload');
      this.fire(e, t);
      if (e.def.pauseToFire) e.pause = PAUSE_TO_FIRE;
    }
  }

  move(e, dt, t) {
    const dir = FWD[e.team];
    const home = e.team === 0 ? 0 : Math.PI;
    if (e.shift) {
      const s = e.shift;
      s.t += dt;
      const k = Math.min(1, s.t / SHIFT_TIME), sm = k * k * (3 - 2 * k);
      e.x = s.from + (s.to - s.from) * sm;
      e.body = home + Math.sign(s.to - s.from) * dir * 0.6 * (1 - k);
      if (k >= 1) { e.shift = null; e.body = home; }
    }
    const want = this.mode[e.team] === 'hold' ? !t : e.pause <= 0;
    if (!want) { e.moving = !!e.shift; return; }
    const sp = this.stat(e, 'speed') * (e.shift && e.shift.slow ? 0.5 : 1);
    let ny = e.y + dir * sp * dt, block = null;
    for (const f of this.entities) {
      if (f.dead || f === e) continue;
      let s;
      if (f.team === e.team) {
        if (f.kind !== 'mech' || f.lane !== e.lane) continue;
        s = f.y - dir * (f.radius + e.radius + GAP); // convoy: queue behind friendly mechs
      } else if ((f.kind === 'mech' || f.kind === 'turret') && f.lane === e.lane) s = f.y - dir * (f.radius + e.radius);
      else if (f.kind === 'base') s = f.y - dir * e.radius;
      else continue;
      if ((f.y - e.y) * dir <= 0) continue; // behind
      if ((ny - s) * dir > 0) { ny = s; block = f; }
    }
    if ((ny - e.y) * dir < 0) ny = e.y; // never pushed backward
    const moved = Math.abs(ny - e.y);
    e.y = ny;
    e.moving = moved > 1e-6 || !!e.shift;
    e.phase += moved / (e.radius * 0.9);
    const adv = this.mode[e.team] === 'advance';
    if (block && !e.shift && adv) {
      if (block.kind === 'turret') this.trySidestep(e, block);
      else if (block.team === e.team) this.tryOvertake(e, block);
    }
    // after overtaking, return to the home lane once it's clear
    if (!e.shift && e.homeLane != null && e.homeLane !== e.lane && this.passed(e)) {
      const next = e.lane + Math.sign(e.homeLane - e.lane); // one lane at a time
      if (this.laneFree(e, next)) this.shiftTo(e, next);
    }
    if (e.homeLane === e.lane && !e.shift) { e.homeLane = null; e.passing = null; }
  }

  // true once the overtaker is clearly ahead of the mech it was passing, or that mech is gone, has left the home lane or is far ahead
  passed(e) {
    const f = e.passing;
    if (!f || f.dead || f.lane !== e.homeLane) return true;
    const ahead = (f.y - e.y) * FWD[e.team];
    return ahead < -(f.radius + e.radius + 10) || ahead > 150; // clearly passed it, or it's far ahead and no longer in the way
  }
  shiftTo(e, lane, slow = false) {
    e.shift = { from: e.x, to: laneX(lane) + e.jitter * 0.5, t: 0, slow };
    e.lane = lane;
    this.fx.push({ t: 'sidestep', x: e.x, y: e.y });
  }
  // a lane is free for a mech at its current position: no enemy turret close ahead, no mech beside it
  laneFree(e, l) {
    if (l < 0 || l >= LANES) return false;
    const dir = FWD[e.team];
    for (const f of this.entities) {
      if (f.dead || f === e || f.lane !== l) continue;
      const dy = (f.y - e.y) * dir;
      if (f.kind === 'turret' && f.team !== e.team && dy > -f.radius && dy < f.radius + e.radius + 60) return false;
      if (f.kind === 'mech' && Math.abs(f.y - e.y) < f.radius + e.radius + 10) return false;
    }
    return true;
  }
  tryOvertake(e, blocker) {
    // not worth it if the mech ahead is walking at almost the same speed
    if (blocker && blocker.moving && this.stat(e, 'speed') - this.stat(blocker, 'speed') < 10) return false;
    // never swing back into the home lane before the mech being passed is behind us
    const opts = [e.lane - 1, e.lane + 1].filter((l) => this.laneFree(e, l) && !(l === e.homeLane && !this.passed(e)));
    if (!opts.length) return false;
    const home = e.homeLane ?? e.lane;
    // prefer the side closer to home, then the side with fewer friendlies ahead
    const ahead = (l) => this.entities.filter((f) => !f.dead && f.team === e.team && f.kind === 'mech' && f.lane === l && (f.y - e.y) * FWD[e.team] > 0 && Math.abs(f.y - e.y) < 200).length;
    opts.sort((a, b) => Math.abs(a - home) - Math.abs(b - home) || ahead(a) - ahead(b));
    e.homeLane = home;
    if (blocker) e.passing = blocker;
    this.shiftTo(e, opts[0]);
    return true;
  }

  trySidestep(e, turret) {
    const opts = [e.lane - 1, e.lane + 1].filter((l) => l >= 0 && l < LANES && !this.cells[turret.team][l][turret.row]);
    if (!opts.length) return false;
    let lane = opts[0];
    if (opts.length === 2) {
      const count = (l) => this.entities.filter((f) => !f.dead && f.team !== e.team && f.kind !== 'base' && Math.abs(f.x - laneX(l)) < 60 && Math.abs(f.y - e.y) < 250).length;
      const a = count(opts[0]), b = count(opts[1]);
      lane = a < b ? opts[0] : b < a ? opts[1] : opts[this.rnd() < 0.5 ? 0 : 1];
    }
    e.homeLane = null; e.passing = null; // stepping around a turret is permanent
    this.shiftTo(e, lane, true);
    return true;
  }

  muzzle(e) {
    if (e.kind === 'base') {
      const gx = BASE.guns.reduce((a, b) => (Math.abs(b - (e.target?.x ?? 300)) < Math.abs(a - (e.target?.x ?? 300)) ? b : a));
      return { x: gx, y: e.y - FWD[e.team] * 20 };
    }
    const r = e.radius * (e.kind === 'turret' ? 0.95 : 0.9);
    return { x: e.x + Math.sin(e.aim) * r, y: e.y + Math.cos(e.aim) * r };
  }

  fire(e, t) {
    const dmg = this.stat(e, 'dmg'), m = this.muzzle(e), kind = e.kind === 'base' ? 'bullet' : e.def.proj;
    e.recoil = 1; e.flash = 0.06;
    const tp = t.kind === 'base' ? { x: Math.max(20, Math.min(FIELD.w - 20, e.x)), y: t.y } : t;
    if (kind === 'melee') {
      this.damage(t, dmg, e);
      this.fx.push({ t: 'punch', x: (e.x + tp.x) / 2, y: (e.y + tp.y) / 2, type: e.type });
    } else if (kind === 'bullet' || kind === 'slug') {
      this.projectiles.push({ kind, x: m.x, y: m.y, target: t, tx: tp.x, ty: tp.y, dmg, team: e.team, src: e, speed: kind === 'slug' ? 2600 : 1100 });
      this.fx.push({ t: kind === 'slug' ? 'slug' : 'shot', x: m.x, y: m.y, team: e.team, type: e.type, kind: e.kind, ang: e.aim });
    } else if (kind === 'shell') {
      const d0 = Math.hypot(tp.x - m.x, tp.y - m.y);
      const sc = e.def.scatterMax ? 12 + (e.def.scatterMax - 12) * Math.min(1, d0 / this.stat(e, 'range')) : 12;
      const tx = tp.x + (this.rnd() * 2 - 1) * sc, ty = tp.y + (this.rnd() * 2 - 1) * sc;
      const dist = Math.hypot(tx - m.x, ty - m.y), [f0, f1] = e.def.flight || [0.7, 900];
      this.projectiles.push({ kind, x: m.x, y: m.y, z: 0, sx: m.x, sy: m.y, tx, ty, t: 0, T: f0 + dist / f1, apex: 60 + dist * (e.def.flight ? 0.5 : 0.3), dmg, team: e.team, src: e, splash: e.def.splash });
      this.fx.push({ t: 'cannon', x: m.x, y: m.y, team: e.team, type: e.type, ang: e.aim });
    } else if (kind === 'missile') {
      for (let i = 0; i < e.def.salvo; i++) {
        this.projectiles.push({ kind, x: m.x, y: m.y, ang: e.aim + (i % 2 ? 0.6 : -0.6), target: t, tx: tp.x, ty: tp.y, dmg, team: e.team, src: e, splash: e.def.splash, speed: 520, life: 3, trail: [] });
      }
      this.fx.push({ t: 'missile', x: m.x, y: m.y, team: e.team });
    } else if (kind === 'zap') {
      const pts = [{ x: m.x, y: m.y }], hit = new Set();
      let cur = t, d = dmg;
      for (let i = 0; i < e.def.chain && cur; i++) {
        hit.add(cur);
        this.damage(cur, d, e);
        pts.push(cur.kind === 'base' ? { x: tp.x, y: tp.y } : { x: cur.x, y: cur.y });
        d *= 0.75;
        let nxt = null, nd = 140;
        for (const f of this.entities) {
          if (f.dead || f.team === e.team || hit.has(f) || f.kind === 'base') continue;
          const dd = Math.hypot(f.x - cur.x, f.y - cur.y);
          if (dd < nd) { nd = dd; nxt = f; }
        }
        cur = nxt;
      }
      this.fx.push({ t: 'zap', pts });
    }
  }

  updateProjectiles(dt) {
    for (const p of this.projectiles) {
      if (p.kind === 'bullet' || p.kind === 'slug') {
        const t = p.target;
        if (t.kind !== 'base' && !t.dead) { p.tx = t.x; p.ty = t.y; }
        const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy), step = p.speed * dt;
        p.px = p.x; p.py = p.y;
        if (d <= step || t.dead) {
          if (!t.dead) { this.damage(t, p.dmg, p.src, p.team); this.fx.push({ t: 'hit', x: p.tx, y: p.ty, kind: p.kind }); }
          p.done = true;
        } else { p.x += (dx / d) * step; p.y += (dy / d) * step; }
      } else if (p.kind === 'shell') {
        p.t += dt;
        const k = Math.min(1, p.t / p.T);
        p.x = p.sx + (p.tx - p.sx) * k; p.y = p.sy + (p.ty - p.sy) * k; p.z = Math.sin(k * Math.PI) * p.apex;
        if (k >= 1) {
          this.splash(p.tx, p.ty, p.splash, p.dmg, p.team, p.src);
          this.fx.push({ t: 'boom', x: p.tx, y: p.ty, size: p.splash / 60 });
          p.done = true;
        }
      } else if (p.kind === 'missile') {
        let t = p.target;
        if (t.dead) { // retarget the nearest enemy close by
          let best = null, bd = 220;
          for (const f of this.entities) {
            if (f.dead || f.team === p.team || f.kind === 'base') continue;
            const d = Math.hypot(f.x - p.x, f.y - p.y);
            if (d < bd) { bd = d; best = f; }
          }
          if (best) p.target = t = best;
        }
        if (!t.dead && t.kind !== 'base') { p.tx = t.x; p.ty = t.y; }
        const want = Math.atan2(p.tx - p.x, p.ty - p.y), step = 5 * dt;
        p.ang += Math.max(-step, Math.min(step, angDiff(p.ang, want)));
        p.x += Math.sin(p.ang) * p.speed * dt; p.y += Math.cos(p.ang) * p.speed * dt;
        p.life -= dt;
        if ((p.trail.push({ x: p.x, y: p.y }), p.trail.length > 14)) p.trail.shift();
        if (Math.hypot(p.tx - p.x, p.ty - p.y) < 16 || p.life <= 0) {
          this.splash(p.x, p.y, p.splash, p.dmg, p.team, p.src); // a direct hit is inside the target: full damage
          this.fx.push({ t: 'boom', x: p.x, y: p.y, size: 0.5 });
          p.done = true;
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.done);
  }

  updateBombs(dt) {
    for (const b of this.bombs) {
      b.t -= dt;
      if (b.t <= 0) {
        this.splash(b.x, b.y, 80, 95, 0, null, 0.5);
        this.fx.push({ t: 'boom', x: b.x, y: b.y, size: 1.5, bomb: true });
        b.done = true;
      }
    }
    this.bombs = this.bombs.filter((b) => !b.done);
  }

  splash(x, y, r, dmg, team, src, baseMult = 1) {
    for (const f of this.entities) {
      if (f.dead || f.team === team) continue;
      const d = f.kind === 'base' ? Math.abs(y - f.y) : Math.hypot(f.x - x, f.y - y) - f.radius;
      if (d <= r) {
        const fall = d <= 0 ? 1 : 1 - 0.5 * (d / r);
        this.damage(f, dmg * fall * (f.kind === 'base' ? baseMult : 1), src, team);
      }
    }
  }

  damage(f, amount, src, srcTeam) {
    if (f.dead || this.result) return;
    const team = src ? src.team : srcTeam;
    if (src && src.def) {
      if (src.def.structMult && isStructure(f)) amount *= src.def.structMult;
      if (src.def.stunOnHit && f.kind === 'turret' && src.def.proj === 'melee') f.stun = Math.max(f.stun, src.def.stunOnHit);
    }
    // Aegis field (doesn't stack, doesn't protect itself)
    for (const s of this.entities) {
      if (s.dead || s.team !== f.team || s.type !== 'aegis' || s === f || s.stun > 0) continue;
      const d = f.kind === 'base' ? Math.abs(s.y - f.y) : Math.hypot(s.x - f.x, s.y - f.y);
      if (d <= s.def.aura) { amount *= 1 - s.def.auraDR; break; }
    }
    f.hp -= amount;
    f.hurt = 0.12;
    if (f.hp > 0) {
      if (f.kind === 'base' && f.team === 0) this.fx.push({ t: 'baseHit' });
      return;
    }
    f.hp = 0; f.dead = true;
    if (f.kind === 'base') {
      this.result = f.team === 1 ? 'win' : 'lose';
      this.winnerTeam = 1 - f.team;
      this.endTime = this.time;
      this.fx.push({ t: 'baseDown', x: f.x, y: f.y, team: f.team });
      return;
    }
    if (f.kind === 'turret') {
      if (this.cells[f.team][f.lane][f.row] === f) this.cells[f.team][f.lane][f.row] = null;
      if (f.team === 0 && team === 1) this.ai.killedTurret = true;
    }
    if (f.team === 0 && f.kind === 'mech') this.stats.lost++;
    if (team === 0 && f.team === 1) {
      this.stats.kills++;
      this.energy = Math.min(this.maxEnergy, this.energy + (f.def.cost || 0) * ENERGY.bounty);
    }
    this.fx.push({ t: 'die', x: f.x, y: f.y, kind: f.kind, type: f.type, team: f.team, r: f.radius });
  }

  // ---------- constructor ----------
  updateConstructor(dt) {
    const C = CONSTRUCTOR, home = { x: FIELD.w / 2, y: BASE_FACE[0] + 12 };
    if (this.con && this.con.dead) {
      if (this.orders[0]) this.orders[0].progress = 0;
      this.con = null;
      this.conWait = C.respawn;
    }
    this.conWait = Math.max(0, this.conWait - dt);
    if (!this.con) {
      if (this.orders.length && this.conWait <= 0 && this.energy >= C.fee) {
        this.energy -= C.fee;
        this.con = this.spawn({ kind: 'constructor', type: 'builder', team: 0, x: home.x, y: home.y });
        this.con.building = false;
        this.fx.push({ t: 'conOut', x: home.x, y: home.y });
      }
      return;
    }
    const c = this.con, o = this.orders[0];
    const goal = o ? { x: laneX(o.lane), y: cellY(0, o.row) - 36 } : home;
    const dx = goal.x - c.x, dy = goal.y - c.y, d = Math.hypot(dx, dy);
    c.building = false;
    if (d > 2) {
      const step = Math.min(d, this.stat(c, 'speed') * dt);
      const nx = c.x + (dx / d) * step, ny = c.y + (dy / d) * step;
      const blocked = this.entities.some((f) => !f.dead && f.team === 1 && f.kind === 'mech' &&
        Math.hypot(f.x - nx, f.y - ny) < f.radius + c.radius && Math.hypot(f.x - nx, f.y - ny) < Math.hypot(f.x - c.x, f.y - c.y));
      if (!blocked) { c.x = nx; c.y = ny; c.phase += step / 10; }
      c.body = Math.atan2(dx, dy);
      c.moving = !blocked;
      return;
    }
    c.moving = false;
    if (o) {
      const cx = laneX(o.lane), cy = cellY(0, o.row);
      const occupied = this.entities.some((f) => !f.dead && f.team === 1 && f.kind === 'mech' && Math.abs(f.x - cx) < 60 && Math.abs(f.y - cy) < 50);
      c.body = 0;
      if (occupied) return;
      c.building = true;
      o.progress += dt / (C.buildTime / (1 + 0.2 * this.lvl[0].builder));
      if (o.progress >= 1) {
        this.orders.shift();
        this.placeTurret(0, o.type, o.lane, o.row);
        this.fx.push({ t: 'build', x: cx, y: cy, type: o.type });
      }
    } else {
      this.energy = Math.min(this.maxEnergy, this.energy + C.fee);
      c.dead = true; c.returned = true;
      this.con = null;
      this.fx.push({ t: 'conBack', x: c.x, y: c.y });
    }
  }

  // ---------- enemy AI ----------
  updateAI(dt) {
    const ai = this.ai, st = this.stage, face = BASE_FACE[1];
    // engagement mode
    const pb = this.bases[0], eb = this.bases[1];
    const m = eb.hp / eb.maxHp < 0.3 ? 'hold' : ai.killedTurret || pb.hp / pb.maxHp < 0.5 ? 'advance' : 'hold';
    if (m !== this.mode[1]) { this.mode[1] = m; this.fx.push({ t: 'mode', team: 1, mode: m }); }

    let regen = st.regen * (1 + Math.min(1, this.time / 420)) * (1 + 0.15 * this.enemyBase.reactor);
    let pressure = 0;
    const laneP = Array(LANES).fill(0);
    for (const e of this.entities) {
      if (e.team === 0 && e.kind === 'mech' && !e.dead && e.y > face - 900) { pressure += e.def.cost; laneP[Math.max(0, e.lane)] += e.def.cost; }
    }
    if (pressure > 0) regen *= 1 + Math.min(0.4, pressure / 1500);
    ai.energy += regen * dt;

    if (!ai.next) {
      const roster = st.roster, late = Math.min(1, this.time / 150);
      let pick;
      if (pressure > 300 && this.rnd() < 0.5) {
        pick = roster.includes('brawler') ? 'brawler' : roster[roster.length - 1];
      } else {
        const w = roster.map((t) => 1 / Math.pow(MECHS[t].cost, 1 - late * 0.8));
        let r = this.rnd() * w.reduce((a, b) => a + b, 0);
        pick = roster[0];
        for (let i = 0; i < roster.length; i++) { r -= w[i]; if (r <= 0) { pick = roster[i]; break; } }
      }
      ai.next = { type: pick, count: this.rnd() < 0.25 + late * 0.2 ? 2 + Math.floor(this.rnd() * 2) : 1 };
    }
    const cost = MECHS[ai.next.type].cost * ai.next.count;
    if (ai.energy >= cost) {
      ai.energy -= cost;
      const lane = this.aiLane(pressure, laneP);
      for (let i = 0; i < ai.next.count; i++) {
        const jitter = (this.rnd() * 2 - 1) * 20;
        const e = this.spawn({ kind: 'mech', type: ai.next.type, team: 1, lane, x: laneX(lane) + jitter, y: face - 24 + i * 34, jitter });
        this.fx.push({ t: 'deploy', x: e.x, y: e.y, team: 1, type: e.type });
      }
      ai.next = null;
    }
  }
  aiLane(pressure, laneP) {
    const r = this.rnd();
    if (r < 0.2) return Math.floor(this.rnd() * LANES);
    if (pressure > 0 && r < 0.4) return laneP.indexOf(Math.max(...laneP));
    // weakest defended lane: least player turret HP that can cover it
    const cover = Array(LANES).fill(0);
    for (const t of this.entities) {
      if (t.dead || t.team !== 0 || t.kind !== 'turret') continue;
      const rng = this.stat(t, 'range');
      for (let l = 0; l < LANES; l++) if (Math.abs(t.x - laneX(l)) <= rng) cover[l] += t.hp;
    }
    const min = Math.min(...cover), opts = cover.map((c, i) => (c === min ? i : -1)).filter((i) => i >= 0);
    return opts[Math.floor(this.rnd() * opts.length)];
  }
}
