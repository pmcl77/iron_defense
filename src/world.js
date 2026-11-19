import {
  FIELD, LANES, ROWS, FWD, BASE_FACE, laneX, laneOf, cellY, LANE_CHANGE, DEV_SWITCHES, STRIP, MARCH, DETOUR, MECHS, TURRETS, CONSTRUCTOR, BASE, BASE_UPGRADES, SPECIALS,
  ENERGY, OVERTIME, QUEUE, ROLES, STOP_AT, AI_GROUPS, AI, PERSONALITIES, levelMult, upgradeCost, MAX_UNIT_LEVEL, MAX_TECH, sellRefund,
} from './data.js';

// The simulation. No drawing and no DOM: everything visual or audible is emitted as `fx`
// events that the renderer and audio consume. Runs in the browser and in Node (tools/).
// Coordinates: x 0..600 (west → east), y 0..2400 (player base → enemy base). Angles are
// clockwise from north (+y), so heading (dx, dy) = atan2(dx, dy).

let nextId = 1;
const TAU = Math.PI * 2;
const AIM_TOL = (10 * Math.PI) / 180;
const PAUSE_TO_FIRE = 0.4;
const STOPPED_FOR = 0.5;   // s a friendly must have stood still before mechs behind it treat it as stopped (rule A)
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
const STEP_OUT = 4; // extra sideways clearance before a lane-changing mech may walk on past a friendly in the lane it leaves

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
    // dmg[team][attacker type] = [to mechs, to turrets, to the base, to the Constructor]: HP actually removed (no overkill);
    // attacker 'bomb' = Bombing. taken[team][type] = HP lost. shield[team] = HP the Aegis field saved its side.
    // strip[team] = [times a mech stepped onto a strip, damage dealt from strips]
    // wait[team][type] = seconds its mechs stood still with nothing to shoot (summed over all mechs of that type)
    // life[team][type] = [deaths, combat seconds of those, survivors, combat seconds of those so far]: combat time runs
    // from a mech's first encounter (it has a target or was hit) to its death; survivors are added by lifeLog()
    this.log = { mechs: [{}, {}], turrets: [{}, {}], lost: [{}, {}], specials: {}, upgrades: [], timeline: [], events: [],
      dmg: [{}, {}], taken: [{}, {}], shield: [0, 0], strip: [[0, 0], [0, 0]], wait: [{}, {}], life: [{}, {}] };
    this.aiOrders = 0;
    this.nextSample = 0;
    this.march = opts.march ?? MARCH.pace;
    // dev switches (DEV_SWITCHES): opts.dev overrides the defaults; live ones can change during the battle (setDev)
    this.dev = Object.fromEntries(Object.entries(DEV_SWITCHES).map(([k, d]) => [k, opts.dev?.[k] ?? d.def]));
    this.log.dev = { ...this.dev }; // values at the start (live changes: 'dev' events)
    this.overtime = false;
    this.activeLane = 2;
    this.fwd = Array(LANES).fill(false); // per lane: deploy forward at the frontmost own turret

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
    // focus types of the enemy's personality (only those in its loadout) and this battle's target factor
    this.focus = (PERSONALITIES[stage.personality]?.focus || []).filter((t) => stage.roster.includes(t));
    const [f0, f1] = AI.focus.range;
    this.focusX = stage.focusX ?? +(f0 + this.rnd() * (f1 - f0)).toFixed(2);
    this.aiCount = {}; this.focusB = {}; // enemy units chosen so far per type, and the steered focus boost per FT
  }

  // Battle events, time in s (0.1). Side: 1 = player, 0 = enemy AI ("Player 1"; inside the game team 0 is the player,
  // see side()). Progress = % of the way from own base to the enemy base.
  // Numbers people read start at 1, as in the game: lane 1-5 (left to right, as the lane buttons), row 1-7 (1 = nearest
  // to that side's base), order and group from 1. Level counts upgrades (0 = none), as the "L2" on the cards.
  //   [t, 'deploy', team, type, level, lane]            + for the enemy: order number, group in that order (split attack = 2 groups)
  //                                                     + for a player forward deploy: row of the turret
  //   [t, 'turret', team, type, level, lane, row]       turret finished (enemy start turrets at t = 0)
  //   [t, 'sold', type, lane, row]
  //   [t, 'death', team, type, lane, progress, killer]  killer = attacker type ('base', 'bomb' for Bombing)
  //   [t, 'special', kind, x, y]
  //   [t, 'upgrade', key, new level]                    key = unit type or base.armor / base.gun / base.reactor
  //   [t, 'overtime']                                   overtime started
  //   [t, 'dev', key, 0|1]                              a live dev switch changed during the battle (dev builds)
  setDev(k, on) {
    if (!(k in this.dev) || this.dev[k] === !!on) return;
    this.dev[k] = !!on;
    this.ev('dev', k, on ? 1 : 0);
  }
  lifeOf(team, type) { return (this.log.life[team][type] ||= [0, 0, 0, 0]); }
  // combat lifetime per type with the mechs still alive added as survivors (a copy; for the battle summary)
  lifeLog() {
    const out = this.log.life.map((o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [...v]])));
    for (const e of this.entities) {
      if (e.kind !== 'mech' || e.dead || e.contact == null) continue;
      const l = (out[e.team][e.type] ||= [0, 0, 0, 0]); l[2]++; l[3] += this.time - e.contact;
    }
    return out;
  }
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
    // forward deploy is the default: a lane's first turret switches it to forward (a later one keeps the lane's choice)
    if (team === 0 && !this.forwardTurret(lane)) this.fwd[lane] = true;
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
  // Forward deploy (player only): a lane's frontmost finished own turret is a deploy point for that lane only.
  // New mechs appear just behind it (base side); if it's gone, the next one back, else the base.
  forwardTurret(lane) {
    for (let r = ROWS - 1; r >= 0; r--) { const t = this.cells[0][lane][r]; if (t && !t.dead) return t; }
    return null;
  }
  // the lane's last turret is gone (destroyed or sold): the lane goes back to base deploys
  // (orders already queued as forward fall back to the base when their turn comes)
  dropFwd(lane) { if (this.fwd[lane] && !this.forwardTurret(lane)) this.fwd[lane] = false; }
  laneFwd(lane) { return this.fwd[lane]; }
  spawnPoint(lane, fwd) {
    const t = fwd ? this.forwardTurret(lane) : null;
    return t ? { y: t.y - t.radius - 30, row: t.row } : { y: BASE_FACE[0] + 24, row: null };
  }
  deploy(type, lane = this.activeLane, fwd = this.laneFwd(lane)) {
    if (!this.canDeploy(type)) return false;
    const d = MECHS[type], at = this.spawnPoint(lane, fwd);
    this.energy -= d.cost;
    this.deployCd[type] = d.cd;
    const jitter = (this.rnd() * 2 - 1) * 20;
    const e = this.spawn({ kind: 'mech', type, team: 0, lane, x: laneX(lane) + jitter, y: at.y, jitter });
    this.stats.deployed++;
    if (at.row === null) this.ev('deploy', 1, type, this.lvl[0][type], lane + 1);
    else this.ev('deploy', 1, type, this.lvl[0][type], lane + 1, at.row + 1);
    this.fx.push({ t: 'deploy', x: e.x, y: e.y, team: 0, type });
    return true;
  }
  // Tap on a mech card: deploy now if nothing is waiting and it's affordable, otherwise queue.
  // Each order remembers base or forward. Returns 'deployed' | 'queued' | 'full' | false.
  request(type, lane = this.activeLane, fwd = this.laneFwd(lane)) {
    if (this.result || !this.unlocked.mechs.includes(type)) return false;
    if (!this.queue.length && this.canDeploy(type) && this.spawnClear(lane, fwd)) return this.deploy(type, lane, fwd) ? 'deployed' : false;
    if (this.queue.length >= QUEUE.max) return 'full';
    this.queue.push({ type, lane, fwd });
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
  spawnClear(lane, fwd = false) {
    const y0 = this.spawnPoint(lane, fwd).y, x0 = laneX(lane);
    for (const e of this.entities)
      if (!e.dead && e.team === 0 && e.kind === 'mech' && Math.abs(e.x - x0) < 50 && Math.abs(e.y - y0) < e.radius + 26) return false;
    return true;
  }
  updateQueue(dt) {
    const q = this.queue[0];
    if (!q) return;
    if (!this.canDeploy(q.type)) { this.queueWait = 0; return; } // energy or cooldown: the whole queue waits
    this.queueWait += dt;
    if (!this.spawnClear(q.lane, q.fwd) && this.queueWait < QUEUE.wait) return;
    if (this.deploy(q.type, q.lane, q.fwd)) { this.queue.shift(); this.queueWait = 0; }
  }
  // Lane button: select a lane. Tapping the selected lane again switches it between base and
  // forward (each lane remembers its choice). Returns 'fwd' | 'base' | 'noturret' (forward wanted, no turret) | 'lane'.
  setLane(l, toggle = true) {
    if (l < 0 || l >= LANES) return false;
    if (toggle && l === this.activeLane) {
      if (this.fwd[l]) { this.fwd[l] = false; return 'base'; }
      if (!this.forwardTurret(l)) return 'noturret';
      this.fwd[l] = true; return 'fwd';
    }
    this.activeLane = l;
    return 'lane';
  }

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
    this.dropFwd(lane);
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

  // overtime: the current income (after upgrades, ramp, pressure) ×OVERTIME.mult for both sides
  otIncome(r) { return this.overtime ? r * OVERTIME.mult : r; }

  // ---------- simulation ----------
  update(dt) {
    this.time += dt;
    if (!this.result) {
      if (!this.overtime && this.time >= OVERTIME.at) {
        this.overtime = true;
        this.ev('overtime');
        this.fx.push({ t: 'overtime' });
      }
      this.energy = Math.min(this.maxEnergy, this.energy + this.otIncome(this.regen) * dt);
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
    if (e.kind === 'mech') {
      this.move(e, dt, t);
      // waiting: standing still with nothing to shoot (walking and fighting don't count)
      if (!e.moving && !t) this.log.wait[e.team][e.type] = (this.log.wait[e.team][e.type] || 0) + dt;
      if (e.contact == null && (t || e.hp < e.maxHp)) e.contact = this.time;
    }
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
      if (Math.abs(s.x1 - e.bx) < 0.01) { e.bx = s.x1; e.shift = null; e.lane = s.to; if (s.strip) { e.strip = s.strip; this.log.strip[e.team][0]++; } }
    }
    if (e.strip) { this.moveStrip(e, dt, t, R, speed, px, py); return; }
    // Chargers step over toward a turret ahead in a neighbouring lane
    if (R.goal === 'structure' && !e.shift && e.homeLane == null) this.seekStructure(e);
    this.lean(e, dt, t, R);
    this.detour(e, dt, speed);
    e.x = e.bx + (e.lean || 0) + (e.detour || 0);
    const done = () => { // legs face where it walks: diagonal while changing lanes or walking around a turret, sideways if blocked in front
      const vx = e.bx + (e.detour || 0) - px, vy = e.y - py;
      e.body = turnTo(e.body, Math.abs(vx) > 1e-4 ? Math.atan2(vx, vy) : home, BODY_TURN * dt);
    };
    const drift = e.shift && this.dev.drift && !(R.fireOnMove && e.pause > 0); // keep a lane change diagonal
    if (!drift && !this.wantsToMove(e, t, R)) { e.moving = !!e.shift; e.still = e.moving ? 0 : (e.still || 0) + dt; e.blocker = null; e.mb = 0; done(); return; }
    // march pace: extra speed while nothing is near (see MARCH)
    const want = this.march > speed && !t && !this.enemyNear(e, MARCH.clear) ? this.march - speed : 0;
    e.mb = e.mb || 0;
    e.mb = want > e.mb ? Math.min(want, e.mb + MARCH.ramp * dt) : Math.max(want, e.mb - MARCH.brake * dt);
    const sp = !this.wantsToMove(e, t, R) ? speed * LANE_CHANGE.drift : (speed + e.mb) * (e.shift ? LANE_CHANGE.fwd : 1);
    let ny = e.y + dir * sp * dt, block = null;
    for (const f of this.entities) {
      if (f.dead || f === e) continue;
      let s;
      if (f.team === e.team) {
        if (f.kind !== 'mech') continue;
        // keep a gap behind friendly mechs. While changing lanes, a friendly in the lane it is leaving blocks only
        // while the two still overlap sideways (ISSUES.md 2026-11-18 "stepping out to pass"): it steps out, then
        // walks on diagonally instead of straight sideways.
        if (this.shareLane(e, f) && !(e.shift && e.shift.to !== e.shift.from && !this.inLane(f, e.shift.to) && Math.abs(f.x - e.x) >= f.radius + e.radius + STEP_OUT)) s = f.y - dir * (f.radius + e.radius + GAP);
        // while passing in another lane, never get ahead of a *marching* friendly in the home lane it may not
        // pass; hang back far enough that the home lane counts as free behind it (laneFree: radii + 10).
        // If that friendly has stopped to fight, the pass becomes a fan-out: stay in this lane and walk on.
        else if (e.homeLane != null && e.lane !== e.homeLane && f.lane === e.homeLane && !f.strip && !this.canPass(R, f, e) && (f.y - e.y) * dir > 0) {
          if (this.fighting(f)) { e.homeLane = null; e.passing = null; continue; }
          s = f.y - dir * (f.radius + e.radius + 12);
        } else if (f.stripWait && f.lane === e.lane && !e.shift) {
          // a strip mech ahead waiting to step back into this lane goes first (order by position)
          s = f.y - dir * (f.radius + e.radius + STRIP.gap + 2);
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
        if ((ny - s) * dir > 0) { ny = s; block = null; if (!t) this.tryStrip(e); }
      }
    }
    if ((ny - e.y) * dir < 0) ny = e.y; // never pushed backward
    const moved = Math.abs(ny - e.y);
    e.y = ny;
    done();
    e.moving = moved > 1e-6 || !!e.shift;
    e.still = e.moving ? 0 : (e.still || 0) + dt;
    e.phase += moved / (e.radius * 0.9 * Math.sqrt((speed + e.mb) / speed)); // marching: longer strides, not just faster steps
    e.blocker = block && block.team !== e.team ? block : null;
    if (block && !e.shift) this.onBlocked(e, block, R);
    // after passing someone, return to the home lane once it's clear
    if (!e.shift && e.homeLane != null && e.homeLane !== e.lane && this.passed(e) && !this.holdReturn(e)) {
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
    if (!e.shift && !e.strip) {
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
  inLane(f, l) { return f.shift ? f.shift.from === l || f.shift.to === l : !f.strip && f.lane === l; }
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
    // behind a fighting friendly, or (decided 2026-11-18, "A") behind a friendly that has stopped for a while (e.g.
    // waiting in a column behind a fight) when this mech has no shot itself: the same decision order
    const stopped = !f.moving && (f.still || 0) >= STOPPED_FOR && !e.target;
    if (this.fighting(f) || stopped) {
      // a fighting friendly it may pass is passed; otherwise the role's rule for this situation
      // passing to get into the fight: the side is chosen like a fan-out, toward a shot (proposal H); Chargers just go around
      if (this.canPass(R, f, e) && !R.noPassFighting) { if (!this.tryOvertake(e, f, true, !R.goal) && !e.target) this.tryStrip(e); return; }
      if (R.behindFight === 'join') this.fanOut(e, true);
      else if (R.behindFight === 'fanout') {
        if (e.target) return;
        if (this.dev.stripFirst && this.tryStrip(e, true)) return; // dev switch: a free strip before a free lane
        if (!this.fanOut(e, false)) this.tryStrip(e);
      }
      else if (!e.target) this.tryStrip(e);
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

  // ---- half-lane fan-out (gameplay.md §5.2, STRIP) ----
  // strip id: the half-lane between lanes; side -1 / +1 from lane l
  stripId(l, side) { return l + side * 0.5; }
  stripOf(f) { return f.strip ? this.stripId(f.lane, f.strip) : f.shift?.strip ? this.stripId(f.lane, f.shift.strip) : null; }
  stripX(l, side) { return laneX(l) + side * (laneX(1) - laneX(0)) / 2; }
  // is the strip spot beside e free? No mech of either team on it (or stepping onto it) close in y
  stripFree(e, id) {
    for (const f of this.entities) {
      if (f.dead || f === e || f.kind !== 'mech' || this.stripOf(f) !== id) continue;
      if (Math.abs(f.y - e.y) < f.radius + e.radius + STRIP.gap) return false;
    }
    return true;
  }
  // only when both neighbouring lanes are taken (otherwise the normal fan-out or pass applies); first come, first served
  tryStrip(e, evenIfLaneFree = false) {
    const R = e.def.rules;
    if (!R.strip || e.strip || e.shift || e.target || this.time < (e.stripAgain || 0)) return false;
    if (!evenIfLaneFree && [e.lane - 1, e.lane + 1].some((l) => this.laneAllowed(e, l) && this.laneFree(e, l))) return false;
    const opts = [-1, 1].filter((s) => this.laneAllowed(e, e.lane + s) && this.stripFree(e, this.stripId(e.lane, s)));
    if (!opts.length) return false;
    // the side whose strip spot is closest to an enemy it can reach, then toward the center
    const dir = FWD[e.team];
    const near = (s) => {
      const x = this.stripX(e.lane, s);
      let best = Infinity;
      for (const f of this.entities) {
        if (f.dead || f.team === e.team || f.kind === 'constructor' || !this.inReach(e, f) || (f.y - e.y) * dir <= 0) continue;
        best = Math.min(best, Math.hypot(f.x - x, f.y - e.y));
      }
      return best;
    };
    opts.sort((a, b) => (near(a) - near(b) || 0) || Math.abs(e.lane + a - 2) - Math.abs(e.lane + b - 2));
    if (e.bx == null) e.bx = e.x;
    e.homeLane = null; e.passing = null;
    e.shift = { from: e.lane, to: e.lane, x0: e.bx, x1: this.stripX(e.lane, opts[0]) + e.jitter * 0.2, strip: opts[0] };
    this.fx.push({ t: 'sidestep', x: e.x, y: e.y });
    return true;
  }
  // room to step back into its lane: no mech there level with it or just ahead. Mechs behind don't count, however
  // close: it's ahead of them, so it goes first, and they keep their distance from it (order by position).
  stripBackFree(e) {
    const dir = FWD[e.team];
    for (const f of this.entities) {
      if (f.dead || f === e || f.kind !== 'mech' || !this.inLane(f, e.lane)) continue;
      const dy = (f.y - e.y) * dir;
      if (dy >= 0 && dy < f.radius + e.radius + STRIP.gap) return false;
    }
    return true;
  }
  // the frontmost fighting friendly in the two lanes beside the strip, within STRIP.front ahead (or level). With the
  // dev switch stripPassLonger (ISSUES.md 2026-11-18), a friendly with a longer range doesn't cap it (like passLonger
  // in a lane: it fights from too far back for this one to reach its fight); it only counts as a reason to walk on
  // (`longer`).
  stripFront(e) {
    const dir = FWD[e.team], lanes = [e.lane, e.lane + e.strip], range = this.stat(e, 'range');
    let front = null, longer = false;
    for (const f of this.entities) {
      if (f.dead || f === e || f.team !== e.team || f.kind !== 'mech' || f.strip || !lanes.includes(f.lane) || !this.fighting(f)) continue;
      const d = (f.y - e.y) * dir;
      if (d < -(f.radius + e.radius) || d > STRIP.front) continue;
      if (this.dev.stripPassLonger && this.stat(f, 'range') > range) { longer = true; continue; }
      if (!front || (f.y - front.y) * dir > 0) front = f;
    }
    this.stripLonger = longer && !front;
    return front;
  }
  // on the strip: fight from here; walk up at most level with the fight; step back into the lane when done
  moveStrip(e, dt, t, R, speed, px, py) {
    const dir = FWD[e.team];
    e.detour = 0; e.x = e.bx;
    const front = this.stripFront(e), longer = this.stripLonger; // longer: only longer-range fighters beside it
    let moved = 0, block = null;
    if (this.wantsToMove(e, t, R) && (front || longer)) {
      let ny = e.y + dir * speed * dt;
      const cap = front ? front.y - dir * (R.follow ? front.radius + e.radius + R.follow : 0) : null;
      if (cap != null && (ny - cap) * dir > 0) ny = cap;
      for (const f of this.entities) { // walking on past the fight: enemy mechs and turrets ahead in the two lanes block
        if (front || f.dead || f.team === e.team || (f.kind !== 'mech' && f.kind !== 'turret' && f.kind !== 'base') || (f.y - e.y) * dir <= 0) continue;
        if (f.kind !== 'base' && f.lane !== e.lane && f.lane !== e.lane + e.strip) continue;
        const s = f.y - dir * (f.kind === 'base' ? e.radius : f.radius + e.radius);
        if ((ny - s) * dir > 0) { ny = s; block = f; }
      }
      const id = this.stripOf(e);
      for (const f of this.entities) { // other mechs on the same strip, either team
        if (f.dead || f === e || f.kind !== 'mech' || this.stripOf(f) !== id || (f.y - e.y) * dir <= 0) continue;
        const s = f.y - dir * (f.radius + e.radius + GAP);
        if ((ny - s) * dir > 0) { ny = s; block = f; }
      }
      if ((ny - e.y) * dir < 0) ny = e.y;
      moved = Math.abs(ny - e.y);
      e.y = ny;
    }
    e.blocker = block && block.team !== e.team ? block : null;
    // done here: no target and no closer spot, or the fight beside it is over
    e.stripWait = !t && ((!front && !longer) || moved < 1e-3);
    if (e.stripWait && this.stripBackFree(e)) {
      e.shift = { from: e.lane, to: e.lane, x0: e.bx, x1: laneX(e.lane) + e.jitter * 0.5 };
      e.strip = null; e.stripWait = false; e.stripAgain = this.time + STRIP.again;
    }
    e.moving = moved > 1e-6 || !!e.shift;
    e.mb = 0;
    e.phase += moved / (e.radius * 0.9);
    const vx = e.bx - px, vy = e.y - py;
    e.body = turnTo(e.body, Math.abs(vx) > 1e-4 ? Math.atan2(vx, vy) : (e.team === 0 ? 0 : Math.PI), BODY_TURN * dt);
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
  // dev switch returnDelay: if the friendly it was passing died, stay LANE_CHANGE.returnDelay s in the passing lane first
  holdReturn(e) {
    if (!this.dev.returnDelay || !e.passing?.dead) return false;
    e.backAt ??= this.time + LANE_CHANGE.returnDelay;
    return this.time < e.backAt;
  }
  startPass(e, blocker, home, lane) {
    e.backAt = null;
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
    const raw = amount;
    for (const s of this.entities) {
      if (s.dead || s.team !== f.team || s.type !== 'aegis' || s === f || s.stun > 0) continue;
      const d = f.kind === 'base' ? Math.abs(s.y - f.y) : Math.hypot(s.x - f.x, s.y - f.y);
      if (d <= s.def.aura) { amount *= 1 - s.def.auraDR; if (f.kind !== 'base') this.fx.push({ t: 'shield', src: s, dst: f }); break; }
    }
    this.logDamage(f, raw, amount, src, team);
    f.hp -= amount;
    f.hurt = 0.12;
    if (f.hp > 0) {
      if (f.kind === 'base' && f.team === 0) this.fx.push({ t: 'baseHit' });
      return;
    }
    f.hp = 0; f.dead = true;
    if (f.kind === 'base') {
      this.result = f.team === 1 ? 'win' : 'lose';
      this.endTime = this.time;
      this.winnerTeam = 1 - f.team;
      this.endTime = this.time;
      this.fx.push({ t: 'baseDown', x: f.x, y: f.y, team: f.team });
      return;
    }
    if (f.kind === 'turret') {
      if (this.cells[f.team][f.lane][f.row] === f) this.cells[f.team][f.lane][f.row] = null;
      if (f.team === 0) this.dropFwd(f.lane);
    }
    if (f.team === 0 && f.kind === 'mech') this.stats.lost++;
    if (f.kind === 'mech') { const l = this.lifeOf(f.team, f.type); l[0]++; l[1] += this.time - (f.contact ?? this.time); }
    if (f.kind === 'mech' || f.kind === 'turret') {
      bump(this.log.lost[f.team], f.type);
      this.ev('death', this.side(f.team), f.type, f.lane + 1, f.kind === 'mech' ? this.progress(f) : null, src ? src.type : 'bomb');
    }
    if (team === 0 && f.team === 1) {
      this.stats.kills++;
      this.energy = Math.min(this.maxEnergy, this.energy + (f.def.cost || 0) * ENERGY.bounty);
    }
    this.fx.push({ t: 'die', x: f.x, y: f.y, kind: f.kind, type: f.type, team: f.team, r: f.radius });
  }

  // damage stats (log.dmg / taken / shield): only HP actually removed, so a big hit on a nearly dead target counts what it took
  logDamage(f, raw, amount, src, team) {
    const hp = Math.max(0, f.hp), real = Math.min(amount, hp);
    if (raw > amount) this.log.shield[f.team] += Math.min(raw, hp) - real;
    if (real <= 0 || team == null || team === f.team) return;
    const by = src ? src.type : 'bomb', k = { mech: 0, turret: 1, base: 2 }[f.kind] ?? 3;
    const row = (this.log.dmg[team][by] ||= [0, 0, 0, 0]);
    row[k] += real;
    if (src && src.strip) this.log.strip[team][1] += real;
    this.log.taken[f.team][f.type] = (this.log.taken[f.team][f.type] || 0) + real;
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
    let regen = st.regen * (1 + Math.min(1, this.time / 420)) * (1 + 0.15 * this.enemyBase.reactor);
    let pressure = 0;
    const laneP = Array(LANES).fill(0);
    for (const e of this.entities) {
      if (e.team === 0 && e.kind === 'mech' && !e.dead && e.y > face - 900) { pressure += e.def.cost; laneP[Math.max(0, e.lane)] += e.def.cost; }
    }
    if (pressure > 0) regen *= 1 + Math.min(AI.pressureBonus, pressure / 1500);
    regen = this.otIncome(regen);
    ai.energy += regen * dt;
    if (PERSONALITIES[st.personality]?.waves) { this.aiWaves(dt, pressure, laneP); return; }

    if (!ai.next) ai.next = this.aiOrder(pressure, laneP);
    const cost = ai.next.groups.flat().reduce((c, t) => c + MECHS[t].cost, 0);
    if (ai.energy >= cost) {
      ai.energy -= cost;
      let first = -1;
      const order = ++this.aiOrders;
      for (const [gi, g] of ai.next.groups.entries()) {
        const lane = gi === 0 && ai.next.lane != null ? ai.next.lane : this.aiLane(pressure, laneP, first); // a defender goes where it's pushed
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
  // one enemy unit onto the field (waves and their defenders)
  aiSpawn(type, lane, order, gi = 1) {
    const ai = this.ai, face = BASE_FACE[1];
    ai.recent.push(lane); if (ai.recent.length > AI.recent) ai.recent.shift();
    const jitter = (this.rnd() * 2 - 1) * 20;
    const e = this.spawn({ kind: 'mech', type, team: 1, lane, x: laneX(lane) + jitter, y: face - 24, jitter });
    this.fx.push({ t: 'deploy', x: e.x, y: e.y, team: 1, type: e.type });
    this.ev('deploy', 0, type, this.lvl[1][type], lane + 1, order, gi);
    this.aiCount[type] = (this.aiCount[type] || 0) + 1;
  }
  // waves (AI.wave): save, then release a wave unit by unit; under pressure defend at once
  aiWaves(dt, pressure, laneP) {
    const ai = this.ai, W = AI.wave;
    ai.waveT = (ai.waveT || 0) - dt;
    if (ai.waveT > 0) return;
    const gap = () => W.gap[0] + this.rnd() * (W.gap[1] - W.gap[0]);
    if (ai.wave?.length) {
      const u = ai.wave[0];
      if (ai.energy < MECHS[u.type].cost) return;
      ai.energy -= MECHS[u.type].cost; ai.wave.shift();
      this.aiSpawn(u.type, u.lane, ai.waveNo, u.gi);
      ai.waveT = gap();
      return;
    }
    if (pressure > 300) { // defend now with what it has saved
      const d = this.aiDefend(laneP), t = d.groups[0][0];
      if (ai.energy < MECHS[t].cost) return;
      ai.energy -= MECHS[t].cost;
      this.aiSpawn(t, d.lane ?? this.aiLane(pressure, laneP), ++this.aiOrders);
      ai.waveT = gap();
      return;
    }
    if (ai.energy >= this.waveBudget()) { ai.waveNo = ++this.aiOrders; ai.wave = this.aiBuildWave(); }
  }
  // wave size in energy: grows from AI.wave.budget[0] to [1] over the first AI.wave.ramp s
  waveBudget() {
    const [b0, b1] = AI.wave.budget;
    return b0 + (b1 - b0) * Math.min(1, this.time / AI.wave.ramp);
  }
  // the units of the next wave in deploy order, each with its lane; ai.waveStyle: the style drawn
  aiBuildWave() {
    const W = AI.wave, roster = this.stage.roster, ft = this.focus.length ? this.focus : roster.filter((t) => MECHS[t].role !== 'support');
    const tanks = roster.filter((t) => MECHS[t].role === 'tank');
    const styles = tanks.length ? ['plain', 'mixed', 'tank'] : ['plain', 'mixed'];
    const style = styles[Math.floor(this.rnd() * styles.length)];
    const set = this.laneSet() || [...Array(LANES).keys()];
    // width: 1–3 neighbouring lanes of the set (AI.wave.width), then a random start among them
    const sorted = [...set].sort((a, b) => a - b), wr = this.rnd();
    let n = 1; for (let c = 0; n < W.width.length && wr >= (c += W.width[n - 1]); n++);
    n = Math.min(n, sorted.length);
    const s0 = Math.floor(this.rnd() * (sorted.length - n + 1)), lanes = sorted.slice(s0, s0 + n);
    const k = Math.floor(this.rnd() * lanes.length); lanes.push(...lanes.splice(0, k));
    this.ai.waveLanes = lanes.length;
    let budget = this.waveBudget(); const lead = [], body = [], back = [];
    const take = (list, t) => { if (budget < MECHS[t].cost || lead.length + body.length + back.length >= W.max) return false; budget -= MECHS[t].cost; list.push(t); return true; };
    if (style === 'tank') for (let i = 0; i < Math.min(2, lanes.length); i++) take(lead, tanks[Math.floor(this.rnd() * tanks.length)]);
    const others = roster.filter((t) => !ft.includes(t) && MECHS[t].role !== 'tank');
    if (others.length && this.rnd() < (W.extra[style] ?? 0)) take(back, others[Math.floor(this.rnd() * others.length)]);
    const one = ft[Math.floor(this.rnd() * ft.length)];
    for (let i = 0; i < 40; i++) if (!take(body, style === 'plain' ? one : ft[i % ft.length])) break;
    body.sort((a, b) => MECHS[a].speed - MECHS[b].speed); // slowest first: the fast ones catch up
    this.ai.waveStyle = style;
    this.ev('wave', 0, style, lead.length + body.length + back.length, lanes.map((l) => l + 1).sort().join(''));
    // lanes: tanks lead in the first lanes and the rest follows them; otherwise the wave rotates through its lanes
    const use = style === 'tank' ? lanes.slice(0, lead.length) : lanes;
    return [...lead, ...body, ...back].map((type, i) => ({ type, lane: use[i % use.length], gi: (i % use.length) + 1 }));
  }
  // the next enemy order: { groups: [[types front to back], …] }
  aiOrder(pressure, laneP = null) {
    const o = this.aiChoose(pressure, laneP);
    for (const t of o.groups.flat()) this.aiCount[t] = (this.aiCount[t] || 0) + 1;
    this.focusSteer();
    return o;
  }
  aiChoose(pressure, laneP) {
    const roster = this.stage.roster, late = Math.min(1, this.time / 150);
    // under pressure: half the time a single defender (aiDefend)
    if (pressure > 300 && this.rnd() < 0.5) return this.aiDefend(laneP);
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
    const wts = solo.map((t) => this.focusOf(t, true) / Math.pow(MECHS[t].cost, 1 - late * 0.8));
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
    // focus types: a group that has a place for one comes up more often (the factor once per group), and a place in the
    // group a focus type can fill prefers it
    const members = (g) => (g.pack === 'cheap' ? cheap : g.pack === 'tank' ? tanks : g.roles.flatMap((r) => ofRole(r)));
    const gw = (g) => g.w * Math.max(1, ...members(g).map((t) => this.focusOf(t)));
    let r = this.rnd() * fits.reduce((x, g) => x + gw(g), 0), tpl = fits[0];
    for (const g of fits) { r -= gw(g); if (r <= 0) { tpl = g; break; } }
    const any = (list) => this.weighted(list, (t) => this.focusOf(t));
    if (tpl.pack === 'cheap') { const t = any(cheap); return Array(Math.min(maxSize, 2 + Math.floor(this.rnd() * 2))).fill(t); }
    if (tpl.pack === 'tank') { const t = any(tanks); return [t, t]; }
    return tpl.roles.map((role) => any(ofRole(role)));
  }
  // the focus weight of a type: its steered boost for a focus type, else 1. alone: for a single unit, only roles that work alone
  focusOf(t, alone = false) {
    if (!this.focus.includes(t) || (alone && !AI.focus.alone.includes(MECHS[t].role))) return 1;
    return this.focusBoost(t);
  }
  // steering: each FT keeps a boost (start: the target factor) that grows a little with every choice while it is behind
  // the target in this battle and shrinks while it is ahead (an FT that can't get there just stays at `max`)
  focusBoost(t) { return this.focusB[t] ?? this.focusX; }
  focusSteer() {
    if (!this.focus.length) return;
    const others = this.stage.roster.filter((x) => !this.focus.includes(x));
    const avg = others.reduce((a, x) => a + (this.aiCount[x] || 0), 0) / (others.length || 1);
    for (const t of this.focus) {
      const now = ((this.aiCount[t] || 0) + 1) / (avg + 1);
      this.focusB[t] = Math.min(AI.focus.max, Math.max(1, this.focusBoost(t) * Math.pow(this.focusX / now, 0.25)));
    }
  }
  weighted(list, w) {
    let r = this.rnd() * list.reduce((a, t) => a + w(t), 0);
    for (const t of list) { r -= w(t); if (r <= 0) return t; }
    return list[list.length - 1];
  }
  // a single defender when the player's mechs are near the base (ISSUES.md 2026-11-19, the user's own order): most of
  // the time by the situation: the base is shelled from afar by artillery → Seeker, else Gunner; otherwise a Brawler first
  // if it has no tank in the pushed lane yet, then Seeker/Gunner. Only types in its loadout (the next in that order if
  // one is missing). The rest of the time a random defender. It deploys in the lane that is pushed hardest.
  aiDefend(laneP) {
    const roster = this.stage.roster, face = BASE_FACE[1];
    const def = AI.defensive.filter((t) => roster.includes(t));
    const solo = roster.filter((t) => MECHS[t].role !== 'support');
    const lane = laneP && laneP.some((x) => x > 0) ? laneP.indexOf(Math.max(...laneP)) : null;
    if (!def.length) return { groups: [[solo[solo.length - 1]]], lane };
    if (this.rnd() >= AI.defendOrder) return { groups: [[this.weighted(def, (t) => this.focusOf(t))]], lane };
    let art = 0, all = 0;
    for (const e of this.entities) {
      if (e.dead || e.team !== 0 || e.kind !== 'mech' || e.y < face - 900) continue;
      all += e.def.cost; if (e.def.role === 'artillery') art += e.def.cost;
    }
    const sg = this.rnd() < 0.5 ? ['seeker', 'gunner'] : ['gunner', 'seeker'];
    const tank = lane != null && this.entities.some((e) => !e.dead && e.team === 1 && e.kind === 'mech' && e.def.role === 'tank' && e.lane === lane && e.y > face - 900);
    const order = all > 0 && art / all >= 0.5 ? ['seeker', 'gunner', 'brawler'] : tank ? [...sg, 'brawler'] : ['brawler', ...sg];
    return { groups: [[order.find((t) => def.includes(t))]], lane };
  }
  // lane for an enemy group: sometimes random, sometimes the lane you push in, otherwise weighted toward weakly
  // defended lanes, with a penalty for lanes it used recently. exclude: a lane already used by this order (split).
  // defence per lane: player turret HP that can cover it
  laneCover() {
    const cover = Array(LANES).fill(0);
    for (const t of this.entities) {
      if (t.dead || t.team !== 0 || t.kind !== 'turret') continue;
      const rng = this.stat(t, 'range');
      for (let l = 0; l < LANES; l++) if (Math.abs(t.x - laneX(l)) <= rng) cover[l] += t.hp;
    }
    return cover;
  }
  // the lane set of the current phase for a personality with `lanes` (null: all lanes); a new one when the phase ends
  laneSet() {
    const shape = PERSONALITIES[this.stage.personality]?.lanes, sets = shape && AI.laneSets[shape];
    if (!sets) return null;
    const ai = this.ai;
    if (!ai.set || this.time >= ai.setEnd) {
      const cover = this.laneCover(), min = Math.min(...cover);
      const weak = (l) => 1 / (1 + (cover[l] - min) / 800);
      const prev = ai.set, cand = sets.filter((s) => s !== prev); // never the same set twice in a row
      ai.set = this.weightedBy(cand, (set) => Math.pow(set.reduce((a, l) => a + weak(l), 0) / set.length, 2));
      const [p0, p1] = AI.lanePhase;
      ai.setEnd = this.time + p0 + this.rnd() * (p1 - p0);
      this.ev('lanes', 0, ai.set.map((l) => l + 1).join(''));
    }
    return ai.set;
  }
  weightedBy(list, w) {
    const ws = list.map(w);
    let r = this.rnd() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < list.length; i++) { r -= ws[i]; if (r <= 0) return list[i]; }
    return list[list.length - 1];
  }
  aiLane(pressure, laneP, exclude = -1) {
    const set = this.laneSet();
    let lanes = [...Array(LANES).keys()].filter((l) => l !== exclude && (!set || set.includes(l)));
    if (!lanes.length) lanes = [...Array(LANES).keys()].filter((l) => l !== exclude);
    const r = this.rnd();
    if (r < 0.2) return lanes[Math.floor(this.rnd() * lanes.length)];
    if (pressure > 0 && r < 0.4) {
      const best = lanes.reduce((a, b) => (laneP[b] > laneP[a] ? b : a));
      if (laneP[best] > 0) return best;
    }
    const cover = this.laneCover();
    const min = Math.min(...lanes.map((l) => cover[l]));
    const wts = lanes.map((l) => (1 / (1 + (cover[l] - min) / 800)) * Math.pow(AI.recentPenalty, this.ai.recent.filter((x) => x === l).length));
    let k = this.rnd() * wts.reduce((a, b) => a + b, 0);
    for (let i = 0; i < lanes.length; i++) { k -= wts[i]; if (k <= 0) return lanes[i]; }
    return lanes[lanes.length - 1];
  }
}
