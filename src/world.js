import {
  FIELD, LANES, ROWS, FWD, BASE_FACE, laneX, laneOf, cellY, LANE_CHANGE, MARCH, DETOUR, MECHS, TURRETS, CONSTRUCTOR, BASE, BASE_UPGRADES, SPECIALS,
  ENERGY, EXPERIMENTS, OVERTIME_BONUS, QUEUE, ROLES, STOP_AT, AI_GROUPS, AI, levelMult, upgradeCost, MAX_UNIT_LEVEL, MAX_TECH, sellRefund,
} from './data.js';

// The simulation. No drawing and no DOM: everything visual or audible is emitted as `fx`
// events that the renderer and audio consume. Runs in the browser and in Node (tools/).
// Coordinates: x 0..600 (west → east), y 0..2400 (player base → enemy base). Angles are
// clockwise from north (+y), so heading (dx, dy) = atan2(dx, dy).

let nextId = 1;
const TAU = Math.PI * 2;
const AIM_TOL = (10 * Math.PI) / 180;
const PAUSE_TO_FIRE = 0.4;
const GAP = 4;            // spacing kept between friendly mechs in a lane

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
const BODY_TURN = 3;      // rad/s: how fast a mech's legs turn toward where it walks
const turnTo = (a, b, step) => { const d = angDiff(a, b); return a + Math.max(-step, Math.min(step, d)); };
const isStructure = (f) => f.kind === 'turret' || f.kind === 'base';

const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };

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
    // battle log for the statistics upload (main.js sendStats): counts per team and type, a 30 s timeline, and
    // events in time order (see ev() below)
    this.log = { mechs: [{}, {}], turrets: [{}, {}], lost: [{}, {}], specials: {}, upgrades: [], timeline: [], events: [] };
    this.aiOrders = 0;
    this.nextSample = 0;
    this.march = opts.march ?? MARCH.pace;
    this.expKey = EXPERIMENTS[opts.exp] ? opts.exp : 'off';
    this.exp = EXPERIMENTS[this.expKey];
    this.overtime = false;
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

    this.ai = { energy: 40, next: null, recent: [] };
  }

  // Battle events, time in s (0.1). Side: 1 = player, 0 = enemy AI ("Player 1"; inside the game team 0 is the player,
  // see side()). Progress = % of the way from own base to the enemy base.
  // Numbers people read start at 1, as in the game: lane 1-5 (left to right, as the lane buttons), row 1-7 (1 = nearest
  // to that side's base), order and group from 1. Level counts upgrades (0 = none), as the "L2" on the cards.
  //   [t, 'deploy', team, type, level, lane]            + for the enemy: order number, group in that order (split attack = 2 groups)
  //   [t, 'turret', team, type, level, lane, row]       turret finished (enemy start turrets at t = 0)
  //   [t, 'sold', type, lane, row]
  //   [t, 'death', team, type, lane, progress, killer]  killer = attacker type ('base', 'bomb' for Bombing)
  //   [t, 'special', kind, x, y]
  //   [t, 'upgrade', key, new level]                    key = unit type or base.armor / base.gun / base.reactor
  //   [t, 'overtime']                                   dev experiment: overtime started
  ev(...a) { this.log.events.push([Math.round(this.time * 10) / 10, ...a]); }
  side(team) { return team === 0 ? 1 : 0; }
  progress(e) {
    const p = (e.y - BASE_FACE[e.team]) / (BASE_FACE[1 - e.team] - BASE_FACE[e.team]);
    return Math.round(100 * Math.max(0, Math.min(1, p)));
  }

  // timeline entry: [time s, energy, own base HP %, enemy base HP %, own mechs, enemy mechs]
  sample(push = true) {
    const n = [0, 0];
    for (const e of this.entities) if (!e.dead && e.kind === 'mech') n[e.team]++;
    const pct = (b) => Math.round(100 * Math.max(0, b.hp) / b.maxHp);
    const s = [Math.round(this.time), Math.round(this.energy), pct(this.bases[0]), pct(this.bases[1]), n[0], n[1]];
    if (push) this.log.timeline.push(s);
    return s;
  }

  // any enemy mech, turret or base within r (bases: distance to the front face)
  enemyNear(e, r) {
    for (const f of this.entities) {
      if (f.dead || f.team === e.team || f.kind === 'constructor') continue;
      const d = f.kind === 'base' ? Math.abs(f.y - e.y) - f.radius : Math.hypot(f.x - e.x, f.y - e.y) - f.radius;
      if (d < r) return true;
    }
    return false;
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
      jitter: o.jitter || 0, shift: null, target: null, blocker: null, home0: o.lane ?? -1, born: this.time,
    };
    this.entities.push(e);
    if (o.kind === 'mech' || o.kind === 'turret') bump(this.log[o.kind === 'mech' ? 'mechs' : 'turrets'][o.team], o.type);
    return e;
  }
  placeTurret(team, type, lane, row) {
    const t = this.spawn({ kind: 'turret', type, team, lane, row, x: laneX(lane), y: cellY(team, row) });
    this.cells[team][lane][row] = t;
    this.ev('turret', this.side(team), type, this.lvl[team][type], lane + 1, row + 1);
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
    this.ev('deploy', 1, type, this.lvl[0][type], lane + 1);
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
    this.ev('sold', t.type, lane + 1, row + 1);
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
    this.log.upgrades.push([Math.round(this.time), type]);
    this.ev('upgrade', type, this.lvl[0][type]);
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
    this.log.upgrades.push([Math.round(this.time), 'base.' + k]);
    this.ev('upgrade', 'base.' + k, this.baseLvl[k]);
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
    bump(this.log.specials, k);
    this.ev('special', k, Math.round(x), Math.round(y));
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
      if (!this.overtime && this.exp.overtime && this.time >= this.exp.overtime) {
        this.overtime = true;
        this.ev('overtime');
        this.fx.push({ t: 'overtime' });
      }
      this.energy = Math.min(this.maxEnergy, this.energy + (this.regen + (this.overtime ? OVERTIME_BONUS : 0)) * dt);
      for (const k in this.deployCd) this.deployCd[k] -= dt;
      for (const k in this.specialCd) this.specialCd[k] = Math.max(0, this.specialCd[k] - dt);
      this.updateQueue(dt);
      this.updateAI(dt);
      this.updateConstructor(dt);
      if (this.time >= this.nextSample) { this.sample(); this.nextSample += 30; }
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
    const pref = e.kind === 'mech' ? e.def.rules.pref : null;
    if (pref === 'mech' && f.kind !== 'mech') k += 1e4;
    if (pref === 'structure' && !isStructure(f)) k += 1e4;
    return k;
  }
  // mechs reach their own lane ± their reach (role default 1; the long-reach trait 2); bases span every lane
  inReach(e, f) {
    return e.kind !== 'mech' || f.kind === 'base' || Math.abs(this.laneAt(f) - e.lane) <= e.def.rules.reach;
  }
  // side attack: melee Tanks also hit enemies in a neighbouring lane (gameplay.md §5.2)
  sideReach(e) {
    if (e.kind !== 'mech' || e.def.proj !== 'melee') return 0;
    return e.def.rules.sideAttack || 0;
  }
  isSide(e, f) { return f.kind !== 'base' && this.laneAt(f) !== e.lane; }
  rangeFor(e, f, range) { const s = this.sideReach(e); return s && this.isSide(e, f) ? Math.max(range, s) : range; }
  pickTarget(e, range) {
    let best = null, bestK = Infinity;
    for (const f of this.entities) {
      if (f.dead || f.team === e.team || !this.inReach(e, f)) continue;
      const d = this.dist(e, f);
      if (d > this.rangeFor(e, f, range)) continue;
      const k = this.targetKey(e, f, d);
      if (k < bestK) { bestK = k; best = f; }
    }
    // keep the current target until it dies or leaves range, unless a better category appears
    const cur = e.target;
    if (cur && !cur.dead && cur !== best && this.inReach(e, cur)) {
      const d = this.dist(e, cur);
      if (d <= this.rangeFor(e, cur, range) && Math.floor(this.targetKey(e, cur, d) / 1e4) <= Math.floor(bestK / 1e4)) return cur;
    }
    return best;
  }

  think(e, dt) {
    let t = this.pickTarget(e, this.stat(e, 'range'));
    // an enemy that physically blocks a mech is always its target
    const b = e.blocker;
    if (b && !b.dead && this.dist(e, b) <= this.stat(e, 'range')) t = b;
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

  // Movement by role (gameplay.md §5.2). The role decides when a mech stops, whom it passes and
  // what it does behind a fighting friendly; nothing here checks type names.
  move(e, dt, t) {
    const dir = FWD[e.team];
    const home = e.team === 0 ? 0 : Math.PI;
    const R = e.def.rules; // role + traits
    const speed = this.stat(e, 'speed');
    if (e.bx == null) e.bx = e.x;
    const px = e.bx + (e.detour || 0), py = e.y; // to face where it actually walks (lane change and detour; not the lean)
    // a lane change is walked: sideways at LANE_CHANGE.side × its speed (forward below at LANE_CHANGE.fwd ×).
    // It occupies both lanes until it arrives; its lane for targeting and reach switches at the halfway point.
    if (e.shift) {
      const s = e.shift, d = s.x1 - e.bx, step = speed * LANE_CHANGE.side * dt;
      e.bx += Math.max(-step, Math.min(step, d));
      if (e.lane !== s.to && Math.abs(s.x1 - e.bx) <= Math.abs(e.bx - s.x0)) e.lane = s.to;
      e.phase += Math.min(step, Math.abs(d)) / (e.radius * 0.9);
      if (Math.abs(s.x1 - e.bx) < 0.01) { e.bx = s.x1; e.shift = null; e.lane = s.to; }
    }
    // Chargers step over toward a turret ahead in a neighbouring lane
    if (R.goal === 'structure' && !e.shift && e.homeLane == null) this.seekStructure(e);
    this.lean(e, dt, t, R);
    this.detour(e, dt, speed);
    e.x = e.bx + (e.lean || 0) + (e.detour || 0);
    const done = () => { // legs face where it walks: diagonal while changing lanes or walking around a turret, sideways if blocked in front
      const vx = e.bx + (e.detour || 0) - px, vy = e.y - py;
      e.body = turnTo(e.body, Math.abs(vx) > 1e-4 ? Math.atan2(vx, vy) : home, BODY_TURN * dt);
    };
    if (!this.wantsToMove(e, t, R)) { e.moving = !!e.shift; e.blocker = null; e.mb = 0; done(); return; }
    // march pace: extra speed while nothing is near (see MARCH)
    const want = this.march > speed && !t && !this.enemyNear(e, MARCH.clear) ? this.march - speed : 0;
    e.mb = e.mb || 0;
    e.mb = want > e.mb ? Math.min(want, e.mb + MARCH.ramp * dt) : Math.max(want, e.mb - MARCH.brake * dt);
    const sp = (speed + e.mb) * (e.shift ? LANE_CHANGE.fwd : 1);
    let ny = e.y + dir * sp * dt, block = null;
    for (const f of this.entities) {
      if (f.dead || f === e) continue;
      let s;
      if (f.team === e.team) {
        if (f.kind !== 'mech') continue;
        if (this.shareLane(e, f)) s = f.y - dir * (f.radius + e.radius + GAP); // keep a gap behind friendly mechs
        // while passing in another lane, never get ahead of a *marching* friendly in the home lane it may not
        // pass; hang back far enough that the home lane counts as free behind it (laneFree: radii + 10).
        // If that friendly has stopped to fight, the pass becomes a fan-out: stay in this lane and walk on.
        else if (e.homeLane != null && e.lane !== e.homeLane && f.lane === e.homeLane && !this.canPass(R, f, e) && (f.y - e.y) * dir > 0) {
          if (this.fighting(f)) { e.homeLane = null; e.passing = null; continue; }
          s = f.y - dir * (f.radius + e.radius + 12);
        } else continue;
        // Support stays a little behind the friendly ahead in its lane, marching or fighting, so it's already in
        // its spot when that one stops (it's faster than Line mechs); neighbouring lanes: see below
        if (R.follow && f.def.role !== 'support' && this.shareLane(e, f)) s -= dir * R.follow;
      } else if ((f.kind === 'mech' || f.kind === 'turret') && this.shareLane(e, f)) s = f.y - dir * (f.radius + e.radius);
      else if (f.kind === 'base') s = f.y - dir * e.radius;
      else continue;
      if ((f.y - e.y) * dir <= 0) continue; // behind
      if ((ny - s) * dir > 0) { ny = s; block = f; }
    }
    if (R.follow) { // stay just behind the *frontmost* fighting friendly in its own and the neighbouring lanes
      let front = null;
      for (const f of this.entities) {
        if (f.dead || f.team !== e.team || f.kind !== 'mech' || f === e || Math.abs(f.lane - e.lane) > 1) continue;
        if (!f.target || f.def.role === 'support' || (f.y - e.y) * dir <= 0) continue;
        if (!front || (f.y - front.y) * dir > 0) front = f;
      }
      if (front) {
        const s = front.y - dir * (front.radius + e.radius + R.follow);
        if ((ny - s) * dir > 0) { ny = s; block = null; }
      }
    }
    if ((ny - e.y) * dir < 0) ny = e.y; // never pushed backward
    const moved = Math.abs(ny - e.y);
    e.y = ny;
    done();
    e.moving = moved > 1e-6 || !!e.shift;
    e.phase += moved / (e.radius * 0.9 * Math.sqrt((speed + e.mb) / speed)); // marching: longer strides, not just faster steps
    e.blocker = block && block.team !== e.team ? block : null;
    if (block && !e.shift) this.onBlocked(e, block, R);
    // after passing someone, return to the home lane once it's clear
    if (!e.shift && e.homeLane != null && e.homeLane !== e.lane && this.passed(e)) {
      const next = e.lane + Math.sign(e.homeLane - e.lane); // one lane at a time
      if (this.laneFree(e, next)) this.shiftTo(e, next);
    }
    if (e.homeLane === e.lane && !e.shift) { e.homeLane = null; e.passing = null; }
  }

  // side attack visuals: lean toward an enemy in the next lane while fighting it, back afterwards.
  // Only the x position moves (e.lean on top of the lane position e.bx); the mech stays in its lane.
  lean(e, dt, t, R) {
    if (!R.sideLean) return;
    let want = 0;
    if (!e.shift && t && this.isSide(e, t) && this.dist(e, t) <= this.sideReach(e)) want = Math.sign(t.x - e.bx) * R.sideLean;
    const cur = e.lean || 0, step = 70 * dt;
    e.lean = cur + Math.max(-step, Math.min(step, want - cur));
  }
  // walk around own turrets (gameplay.md §5.2): drift into the gap between the pads, at full forward speed.
  // Cosmetic: e.detour moves x only; lane, blocking and reach are unchanged.
  detour(e, dt, speed) {
    const dir = FWD[e.team];
    let want = 0;
    if (!e.shift) {
      for (const f of this.entities) {
        if (f.dead || f.team !== e.team || f.kind !== 'turret' || f.lane !== e.lane) continue;
        const pad = DETOUR.pad[f.type] ?? DETOUR.pad.default, d = (f.y - e.y) * dir;
        if (d < -(pad + e.radius) || d > pad + e.radius + DETOUR.ahead) continue;
        want = this.detourSide(e, f) * Math.min(pad + e.radius * DETOUR.body + 2, this.detourRoom(e, f));
        break;
      }
    }
    const cur = e.detour || 0, step = Math.max(speed * DETOUR.rate, DETOUR.minRate) * dt;
    e.detour = cur + Math.max(-step, Math.min(step, want - cur));
  }
  // side of the detour: toward an empty neighbour cell, otherwise toward the field center
  detourSide(e, f) {
    const free = (l) => l >= 0 && l < LANES && !this.cells[f.team][l][f.row];
    const toCenter = f.lane < 2 ? 1 : f.lane > 2 ? -1 : (e.jitter >= 0 ? 1 : -1);
    if (free(f.lane + toCenter)) return toCenter;
    if (free(f.lane - toCenter)) return -toCenter;
    return toCenter;
  }
  // how far it may drift: into an empty cell freely, else only to the middle of the gap between two pads
  detourRoom(e, f) {
    const l = f.lane + this.detourSide(e, f);
    return l >= 0 && l < LANES && !this.cells[f.team][l][f.row] ? Infinity : DETOUR.gap;
  }

  // Does the mech walk on this tick? Roles that fire on the move keep walking (Chargers stop at
  // structures); the others stop once their target is within STOP_AT of their range.
  wantsToMove(e, t, R) {
    const stopRange = e.def.proj === 'melee' ? 0 : this.stat(e, 'range') * STOP_AT;
    if (R.fireOnMove) {
      if (e.pause > 0) return false;
      // a melee Tank stops beside an enemy in the next lane to fight it (side attack)
      if (t && this.sideReach(e) && this.isSide(e, t) && this.dist(e, t) <= this.sideReach(e)) return false;
      if (R.goal === 'structure' && stopRange > 0) {
        for (const f of this.entities) {
          if (f.dead || f.team === e.team || !isStructure(f)) continue;
          if (f.kind === 'turret' && (f.lane !== e.lane || !this.ahead(e, f))) continue;
          if (this.dist(e, f) <= stopRange) return false;
        }
      }
      return true;
    }
    return !(t && this.dist(e, t) <= stopRange);
  }

  // lanes a unit occupies: both while changing lanes (honest occupancy, also reserves the new lane)
  inLane(f, l) { return f.shift ? f.shift.from === l || f.shift.to === l : f.lane === l; }
  shareLane(a, b) { return a.shift ? this.inLane(b, a.shift.from) || this.inLane(b, a.shift.to) : this.inLane(b, a.lane); }
  // lane a unit is in or heading to
  destLane(f) { return f.shift ? f.shift.to : f.lane; }
  // lane of a unit for reach and targeting: its lane of record (mechs switch at the halfway point), else by position
  laneAt(f) { return f.kind === 'mech' || f.kind === 'turret' ? f.lane : laneOf(f.x); }
  // a fighting friendly: stopped with a target
  fighting(f) { return !!f.target && !f.dead && !f.moving; }
  // may e (with role rules R) pass friendly f? By role, plus passLonger: a fighting friendly with a longer range
  canPass(R, f, e = null) {
    if (R.passes === 'all' || R.passes.includes(f.def.role)) return true;
    return !!(R.passLonger && e && this.fighting(f) && this.stat(f, 'range') > this.stat(e, 'range'));
  }
  // lanes a mech may use: at most one lane from where it was deployed
  laneAllowed(e, l) { return l >= 0 && l < LANES && Math.abs(l - e.home0) <= 1; }

  onBlocked(e, f, R) {
    if (f.team !== e.team) {
      if (R.goal === 'structure' && f.kind === 'mech') this.tryOvertake(e, f, true); // Chargers slip past mechs
      return; // everything else fights what blocks it
    }
    if (this.fighting(f)) {
      // a fighting friendly it may pass is passed; otherwise the role's rule for this situation
      // passing to get into the fight: the side is chosen like a fan-out, toward a shot (proposal H); Chargers just go around
      if (this.canPass(R, f, e) && !R.noPassFighting) { this.tryOvertake(e, f, true, !R.goal); return; }
      if (R.behindFight === 'join') this.fanOut(e, true);
      else if (R.behindFight === 'fanout') { if (!e.target) this.fanOut(e, false); }
      else if (R.behindFight === 'around') this.tryOvertake(e, f, true);
      return;
    }
    if (this.canPass(R, f, e)) this.tryOvertake(e, f, !!R.alwaysPass);
  }

  // Step into a free neighbouring lane and stay there, to get into the fight. needEnemy: only if there
  // is something to fight in that lane (Tanks; until the side attack exists they can't hit across lanes).
  fanOut(e, needEnemy) {
    const dir = FWD[e.team];
    let opts = [e.lane - 1, e.lane + 1].filter((l) => this.laneAllowed(e, l) && this.laneFree(e, l));
    if (!opts.length) return false;
    // prefer the side from which it would reach an enemy soonest (counting its lane reach), then fewer friendlies, then the center
    const nearest = (l) => this.shotScore(e, l);
    const friends = (l) => this.entities.filter((f) => !f.dead && f.team === e.team && f.kind === 'mech' && f.lane === l && (f.y - e.y) * dir > 0 && Math.abs(f.y - e.y) < 200).length;
    const score = Object.fromEntries(opts.map((l) => [l, nearest(l)]));
    if (needEnemy) opts = opts.filter((l) => score[l] < 300); // Tanks only step over to something they can fight
    if (!opts.length) return false;
    opts.sort((a, b) => (score[a] - score[b] || 0) || friends(a) - friends(b) || Math.abs(a - 2) - Math.abs(b - 2));
    e.homeLane = null; e.passing = null; // fanning out to fight is permanent
    this.shiftTo(e, opts[0]);
    return true;
  }

  // how far ahead the nearest enemy is that e could shoot from lane l (counting its lane reach); Infinity if
  // none within `far` (default: its range + 150)
  shotScore(e, l, far = this.stat(e, 'range') + 150) {
    const dir = FWD[e.team], reachL = e.def.rules.reach;
    let best = Infinity;
    for (const f of this.entities) {
      if (f.dead || f.team === e.team || f.kind === 'constructor') continue;
      if (f.kind !== 'base' && Math.abs(this.laneAt(f) - l) > reachL) continue;
      const d = (f.y - e.y) * dir;
      if (d > 0 && d < far && d < best) best = d;
    }
    return best;
  }

  // how many friendlies (mechs and turrets) e's field would cover from lane l, a little ahead of where it is
  protectScore(e, l) {
    const r = e.def.aura || 150, x = laneX(l), y = e.y + FWD[e.team] * 60;
    let n = 0;
    for (const f of this.entities) {
      if (f.dead || f === e || f.team !== e.team || (f.kind !== 'mech' && f.kind !== 'turret')) continue;
      if (Math.hypot(f.x - x, f.y - y) <= r) n++;
    }
    return n;
  }

  // Chargers: if the nearest enemy turret ahead is in a neighbouring lane, step over toward it
  seekStructure(e) {
    const dir = FWD[e.team];
    let best = null, bd = 400;
    for (const f of this.entities) {
      if (f.dead || f.team === e.team || f.kind !== 'turret' || !this.laneAllowed(e, f.lane) || Math.abs(f.lane - e.lane) > 1) continue;
      const d = (f.y - e.y) * dir;
      if (d > 0 && d < bd) { bd = d; best = f; }
    }
    if (!best || best.lane === e.lane || bd < 150) return false;
    if (!this.laneFree(e, best.lane)) return false;
    this.shiftTo(e, best.lane);
    return true;
  }

  // true once the overtaker is clearly ahead of the mech it was passing, or that mech is gone, has left the home lane or is far ahead
  passed(e) {
    const f = e.passing;
    if (!f || f.dead || f.lane !== e.homeLane) return true;
    const ahead = (f.y - e.y) * FWD[e.team];
    return ahead < -(f.radius + e.radius + 10) || ahead > 150; // clearly passed it, or it's far ahead and no longer in the way
  }
  shiftTo(e, lane) {
    if (e.bx == null) e.bx = e.x;
    e.shift = { from: e.lane, to: lane, x0: e.bx, x1: laneX(lane) + e.jitter * 0.5 };
    this.fx.push({ t: 'sidestep', x: e.x, y: e.y });
  }
  // a lane is free for a mech at its current position: no enemy turret close ahead, no mech beside it
  laneFree(e, l) {
    if (l < 0 || l >= LANES) return false;
    const dir = FWD[e.team];
    for (const f of this.entities) {
      if (f.dead || f === e || !this.inLane(f, l)) continue;
      const dy = (f.y - e.y) * dir;
      if (f.kind === 'turret' && f.team !== e.team && dy > -f.radius && dy < f.radius + e.radius + 60) return false;
      if (f.kind === 'mech' && Math.abs(f.y - e.y) < f.radius + e.radius + 10) return false;
    }
    return true;
  }
  // pass the mech ahead through a free neighbouring lane, then return home. force: also when it's
  // walking at about the same speed (Chargers going around a fight or an enemy mech)
  tryOvertake(e, blocker, force = false, toShot = false) {
    // not worth it if the mech ahead is walking at almost the same speed
    if (!force && blocker && blocker.moving && this.stat(e, 'speed') + (e.mb || 0) - this.stat(blocker, 'speed') - (blocker.mb || 0) < 8) return false; // actual pace (march)
    const dir = FWD[e.team], R = e.def.rules;
    const home = e.homeLane ?? e.lane;
    // never swing back into the home lane before the mech being passed is behind us
    const ok = (l) => this.laneAllowed(e, l) && !(l === e.homeLane && !this.passed(e));
    // follow the leader: a friendly from the same lane that this mech may not pass and that has just
    // stepped out ahead of it to pass. Take its side, and wait while that lane is still taken beside us.
    let leader = null;
    for (const f of this.entities) {
      if (f.dead || f === e || f.team !== e.team || f.kind !== 'mech' || Math.abs(this.destLane(f) - e.lane) !== 1) continue;
      if (f.homeLane !== home || this.canPass(R, f, e)) continue;
      const d = (f.y - e.y) * dir;
      if (d > -(f.radius + e.radius) && d < 200 && (!leader || d < (leader.y - e.y) * dir)) leader = f;
    }
    if (leader && ok(this.destLane(leader))) {
      if (!this.laneFree(e, this.destLane(leader))) return false;
      return this.startPass(e, blocker, home, this.destLane(leader));
    }
    const opts = [e.lane - 1, e.lane + 1].filter((l) => ok(l) && this.laneFree(e, l));
    if (!opts.length) return false;
    // otherwise, passing a fighting friendly to join the fight (toShot): the side with a shot soonest, like a
    // fan-out (proposal H). Passing to get by: a side without an enemy close ahead. Then the side closer to
    // home, fewer friendlies ahead, toward the center.
    const foe = (l) => this.entities.some((f) => !f.dead && f.team !== e.team && (f.kind === 'mech' || f.kind === 'turret') && f.lane === l && (f.y - e.y) * dir > 0 && (f.y - e.y) * dir < 250) ? 1 : 0;
    const ahead = (l) => this.entities.filter((f) => !f.dead && f.team === e.team && f.kind === 'mech' && f.lane === l && (f.y - e.y) * dir > 0 && Math.abs(f.y - e.y) < 200).length;
    const shot = (l) => (toShot ? this.shotScore(e, l, Infinity) : 0); // the fight ahead may be beyond its own range
    // passSide 'protect' (Support): the side where its field would cover the most friendlies
    const prot = (l) => (R.passSide === 'protect' ? this.protectScore(e, l) : 0);
    opts.sort((a, b) => prot(b) - prot(a) || (shot(a) - shot(b) || 0) || (toShot ? 0 : foe(a) - foe(b)) || Math.abs(a - home) - Math.abs(b - home) || ahead(a) - ahead(b) || Math.abs(a - 2) - Math.abs(b - 2));
    return this.startPass(e, blocker, home, opts[0]);
  }
  startPass(e, blocker, home, lane) {
    e.homeLane = home;
    if (blocker) e.passing = blocker;
    this.shiftTo(e, lane);
    return true;
  }

  // where a shot leaves the unit: its weapon positions (alternating), or i for a given one
  muzzle(e, i = null) {
    if (e.kind === 'base') {
      const gx = BASE.guns.reduce((a, b) => (Math.abs(b - (e.target?.x ?? 300)) < Math.abs(a - (e.target?.x ?? 300)) ? b : a));
      return { x: gx, y: e.y - FWD[e.team] * 20, z: 36 };
    }
    const M = e.def.muzzles;
    if (M) {
      const k = i ?? (e.gun = ((e.gun ?? -1) + 1) % M.length), [lx, ly, lz] = M[k % M.length], ca = Math.cos(e.aim), sa = Math.sin(e.aim);
      return { x: e.x + lx * ca + ly * sa, y: e.y - lx * sa + ly * ca, z: lz };
    }
    const r = e.radius * (e.kind === 'turret' ? 0.95 : 0.9);
    return { x: e.x + Math.sin(e.aim) * r, y: e.y + Math.cos(e.aim) * r, z: 15 };
  }

  fire(e, t) {
    const dmg = this.stat(e, 'dmg'), m = this.muzzle(e), kind = e.kind === 'base' ? 'bullet' : e.def.proj;
    e.recoil = 1; e.flash = 0.06;
    const tp = t.kind === 'base' ? { x: Math.max(20, Math.min(FIELD.w - 20, e.x)), y: t.y } : t;
    if (kind === 'melee') {
      this.damage(t, dmg, e);
      this.fx.push({ t: 'punch', x: (e.x + tp.x) / 2, y: (e.y + tp.y) / 2, type: e.type });
    } else if (kind === 'bullet' || kind === 'slug') {
      this.projectiles.push({ kind, x: m.x, y: m.y, z0: m.z, d0: Math.hypot(tp.x - m.x, tp.y - m.y), target: t, tx: tp.x, ty: tp.y, dmg, team: e.team, src: e, speed: kind === 'slug' ? 2600 : 1100 });
      this.fx.push({ t: kind === 'slug' ? 'slug' : 'shot', x: m.x, y: m.y, z: m.z, team: e.team, type: e.type, kind: e.kind, ang: e.aim });
    } else if (kind === 'shell') {
      const d0 = Math.hypot(tp.x - m.x, tp.y - m.y);
      const sc = e.def.scatterMax ? 12 + (e.def.scatterMax - 12) * Math.min(1, d0 / this.stat(e, 'range')) : 12;
      const tx = tp.x + (this.rnd() * 2 - 1) * sc, ty = tp.y + (this.rnd() * 2 - 1) * sc;
      const dist = Math.hypot(tx - m.x, ty - m.y), [f0, f1] = e.def.flight || [0.7, 900];
      this.projectiles.push({ kind, x: m.x, y: m.y, z: 0, sx: m.x, sy: m.y, tx, ty, t: 0, T: f0 + dist / f1, apex: 60 + dist * (e.def.flight ? 0.5 : 0.3), dmg, team: e.team, src: e, splash: e.def.splash });
      this.fx.push({ t: 'cannon', x: m.x, y: m.y, z: m.z, team: e.team, type: e.type, ang: e.aim });
    } else if (kind === 'missile') {
      for (let i = 0; i < e.def.salvo; i++) {
        const mi = this.muzzle(e, i);
        this.projectiles.push({ kind, x: mi.x, y: mi.y, z0: mi.z, d0: Math.hypot(tp.x - mi.x, tp.y - mi.y), ang: e.aim + (i % 2 ? 0.6 : -0.6), target: t, tx: tp.x, ty: tp.y, dmg, team: e.team, src: e, splash: e.def.splash, speed: 520, life: 3, trail: [] });
      }
      for (let i = 0; i < Math.min(2, e.def.salvo); i++) { const mi = this.muzzle(e, i); this.fx.push({ t: 'missile', x: mi.x, y: mi.y, z: mi.z, team: e.team, quiet: i > 0 }); }
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
      if (d <= s.def.aura) { amount *= 1 - s.def.auraDR; if (f.kind !== 'base') this.fx.push({ t: 'shield', src: s, dst: f }); break; }
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
    }
    if (f.team === 0 && f.kind === 'mech') this.stats.lost++;
    if (f.kind === 'mech' || f.kind === 'turret') {
      bump(this.log.lost[f.team], f.type);
      this.ev('death', this.side(f.team), f.type, f.lane + 1, f.kind === 'mech' ? this.progress(f) : null, src ? src.type : 'bomb');
    }
    if (team === 0 && f.team === 1) {
      this.stats.kills++;
      this.energy = Math.min(this.maxEnergy, this.energy + (f.def.cost || 0) * (this.exp.bounty ?? ENERGY.bounty));
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
      // drive around own turret pads: the smallest turn away from the straight line that keeps it clear
      const pads = this.entities.filter((f) => !f.dead && f.team === 0 && f.kind === 'turret' && Math.hypot(f.x - c.x, f.y - c.y) < 140);
      const clear = (x, y) => pads.every((f) => Math.hypot(f.x - x, f.y - y) >= (DETOUR.pad[f.type] ?? DETOUR.pad.default) + c.radius + 4
        || Math.hypot(f.x - x, f.y - y) > Math.hypot(f.x - c.x, f.y - c.y)); // moving away from a pad is always fine
      let ang = Math.atan2(dx, dy);
      for (const k of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]) {
        const a = Math.atan2(dx, dy) + k * 0.26;
        if (clear(c.x + Math.sin(a) * step, c.y + Math.cos(a) * step)) { ang = a; break; }
      }
      const nx = c.x + Math.sin(ang) * step, ny = c.y + Math.cos(ang) * step;
      const blocked = this.entities.some((f) => !f.dead && f.team === 1 && f.kind === 'mech' &&
        Math.hypot(f.x - nx, f.y - ny) < f.radius + c.radius && Math.hypot(f.x - nx, f.y - ny) < Math.hypot(f.x - c.x, f.y - c.y));
      if (!blocked) { c.x = nx; c.y = ny; c.phase += step / 10; }
      c.body = ang;
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
    let regen = st.regen * (1 + (this.exp.ramp ?? 1) * Math.min(1, this.time / 420)) * (1 + 0.15 * this.enemyBase.reactor);
    let pressure = 0;
    const laneP = Array(LANES).fill(0);
    for (const e of this.entities) {
      if (e.team === 0 && e.kind === 'mech' && !e.dead && e.y > face - 900) { pressure += e.def.cost; laneP[Math.max(0, e.lane)] += e.def.cost; }
    }
    if (pressure > 0) regen *= 1 + Math.min(AI.pressureBonus, pressure / 1500);
    if (this.overtime) regen += OVERTIME_BONUS;
    ai.energy += regen * dt;

    if (!ai.next) ai.next = this.aiOrder(pressure);
    const cost = ai.next.groups.flat().reduce((c, t) => c + MECHS[t].cost, 0);
    if (ai.energy >= cost) {
      ai.energy -= cost;
      let first = -1;
      const order = ++this.aiOrders;
      for (const [gi, g] of ai.next.groups.entries()) {
        const lane = this.aiLane(pressure, laneP, first);
        if (first < 0) first = lane;
        ai.recent.push(lane); if (ai.recent.length > AI.recent) ai.recent.shift();
        g.forEach((type, i) => { // front to back: the first one deploys furthest forward
          const jitter = (this.rnd() * 2 - 1) * 20;
          const e = this.spawn({ kind: 'mech', type, team: 1, lane, x: laneX(lane) + jitter, y: face - 24 + i * 34, jitter });
          this.fx.push({ t: 'deploy', x: e.x, y: e.y, team: 1, type: e.type });
          this.ev('deploy', 0, type, this.lvl[1][type], lane + 1, order, gi + 1);
        });
      }
      ai.next = null;
    }
  }
  // the next enemy order: { groups: [[types front to back], …] }
  aiOrder(pressure) {
    const roster = this.stage.roster, late = Math.min(1, this.time / 150);
    // under pressure: half the time a single unit from the defensive set
    if (pressure > 300 && this.rnd() < 0.5) {
      const def = AI.defensive.filter((t) => roster.includes(t));
      return { groups: [[def.length ? def[Math.floor(this.rnd() * def.length)] : roster[roster.length - 1]]] };
    }
    const [g0, g1] = AI.groupChance;
    if (this.rnd() < g0 + late * (g1 - g0)) {
      const g = this.aiGroup();
      if (g) {
        if (this.rnd() < AI.splitChance) { // split attack: two small groups in two lanes at once
          const a = this.aiGroup(2), b = this.aiGroup(2);
          if (a && b) return { groups: [a, b] };
        }
        return { groups: [g] };
      }
    }
    // single unit: cheap ones early, more even later. A Support (Aegis) only comes with a group: alone it has
    // nothing to protect.
    const solo = roster.filter((t) => MECHS[t].role !== 'support');
    const wts = solo.map((t) => 1 / Math.pow(MECHS[t].cost, 1 - late * 0.8));
    let r = this.rnd() * wts.reduce((x, y) => x + y, 0), pick = solo[0];
    for (let i = 0; i < solo.length; i++) { r -= wts[i]; if (r <= 0) { pick = solo[i]; break; } }
    return { groups: [[pick]] };
  }
  // a group from the templates the roster allows (maxSize: only groups up to that size); null if none fits
  aiGroup(maxSize = 3) {
    const roster = this.stage.roster;
    const ofRole = (role) => {
      const all = roster.filter((t) => MECHS[t].role === role), heavy = all.filter((t) => MECHS[t].cost > 50);
      return heavy.length ? heavy : all;
    };
    const cheap = roster.filter((t) => MECHS[t].cost <= 50), tanks = ofRole('tank');
    const fits = AI_GROUPS.filter((g) => (g.pack === 'cheap' ? cheap.length > 0 : g.pack === 'tank' ? tanks.length > 0 && maxSize >= 2 : g.roles.length <= maxSize && g.roles.every((r) => ofRole(r).length)));
    if (!fits.length) return null;
    let r = this.rnd() * fits.reduce((x, g) => x + g.w, 0), tpl = fits[0];
    for (const g of fits) { r -= g.w; if (r <= 0) { tpl = g; break; } }
    const any = (list) => list[Math.floor(this.rnd() * list.length)];
    if (tpl.pack === 'cheap') { const t = any(cheap); return Array(Math.min(maxSize, 2 + Math.floor(this.rnd() * 2))).fill(t); }
    if (tpl.pack === 'tank') { const t = any(tanks); return [t, t]; }
    return tpl.roles.map((role) => any(ofRole(role)));
  }
  // lane for an enemy group: sometimes random, sometimes the lane you push in, otherwise weighted toward weakly
  // defended lanes, with a penalty for lanes it used recently. exclude: a lane already used by this order (split).
  aiLane(pressure, laneP, exclude = -1) {
    const lanes = [...Array(LANES).keys()].filter((l) => l !== exclude);
    const r = this.rnd();
    if (r < 0.2) return lanes[Math.floor(this.rnd() * lanes.length)];
    if (pressure > 0 && r < 0.4) {
      const best = lanes.reduce((a, b) => (laneP[b] > laneP[a] ? b : a));
      if (laneP[best] > 0) return best;
    }
    // defence per lane: player turret HP that can cover it
    const cover = Array(LANES).fill(0);
    for (const t of this.entities) {
      if (t.dead || t.team !== 0 || t.kind !== 'turret') continue;
      const rng = this.stat(t, 'range');
      for (let l = 0; l < LANES; l++) if (Math.abs(t.x - laneX(l)) <= rng) cover[l] += t.hp;
    }
    const min = Math.min(...lanes.map((l) => cover[l]));
    const wts = lanes.map((l) => (1 / (1 + (cover[l] - min) / 800)) * Math.pow(AI.recentPenalty, this.ai.recent.filter((x) => x === l).length));
    let k = this.rnd() * wts.reduce((a, b) => a + b, 0);
    for (let i = 0; i < lanes.length; i++) { k -= wts[i]; if (k <= 0) return lanes[i]; }
    return lanes[lanes.length - 1];
  }
}
