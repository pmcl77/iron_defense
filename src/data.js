// All tunable game data lives here. gameplay.md is the human-readable version of these numbers.

// ---------- battlefield ----------
export const FIELD = { w: 600, h: 2400 };
export const LANES = 5;
export const LANE_W = 120;
export const laneX = (lane) => LANE_W / 2 + lane * LANE_W;
export const laneOf = (x) => Math.max(0, Math.min(LANES - 1, Math.floor(x / LANE_W)));
export const FWD = [1, -1];                 // forward direction (world y) per team
export const BASE_FACE = [100, 2300];       // y of each base's front face
export const ROWS = 7;
export const ROW_H = 100;
// Build-cell centers: world y 270 … 870 for the player, mirrored for the enemy.
export const cellY = (team, row) => (team === 0 ? 270 + row * ROW_H : FIELD.h - 270 - row * ROW_H);
export const rowOf = (team, y) => {
  const r = Math.round(((team === 0 ? y : FIELD.h - y) - 270) / ROW_H);
  return r >= 0 && r < ROWS ? r : -1;
};

// ---------- units ----------
// Roles (gameplay.md §5.2): every mech type belongs to one role, a fixed set of movement rules.
//   fireOnMove   keeps walking while it fires (otherwise it stops once a target is in range)
//   passes       roles of friendly mechs it may overtake ('all' = anyone)
//   behindFight  what it does when the friendly ahead has stopped to fight:
//                join (step beside it to reach an enemy), fanout (step over if it has no shot),
//                stay, around (overtake it). Applies only to friendlies it may not pass: a fighting
//                friendly it may pass is passed.
//   sideAttack   melee weapons also hit enemies in a neighbouring lane up to this edge distance, and stop
//                beside them to fight
//   alwaysPass   passes a marching friendly it may pass even if that one is barely slower
//   noPassFighting  never passes a friendly that is fighting
//   passLonger   also passes a fighting friendly with a longer range than its own (it can't reach that fight from behind)
//   follow       stays this far behind the friendly ahead in its lane (marching or fighting) and behind the frontmost fighting friendly in its own and the next lanes
//   sideLean     while fighting an enemy in the next lane, slide this far toward it (stays in its lane)
//   passSide     'protect': when passing, pick the side where its field covers the most friendlies
//   goal         'structure': heads for the first enemy structure in its path, slips past enemy mechs
export const ROLES = {
  tank: { name: 'Tank', fireOnMove: true, passes: ['line', 'support', 'artillery', 'charger'], behindFight: 'join', alwaysPass: true, sideAttack: 100, sideLean: 35,
    desc: 'Leads from the front, draws fire and fights whatever blocks it.' },
  line: { name: 'Line', fireOnMove: false, passes: ['support', 'artillery'], passLonger: true, behindFight: 'fanout',
    desc: 'Stops at range and shoots; takes cover behind a marching tank.' },
  support: { name: 'Support', fireOnMove: false, passes: ['artillery'], behindFight: 'stay', follow: 40, noPassFighting: true, passSide: 'protect',
    desc: 'Follows the fight and stays just behind its front.' },
  artillery: { name: 'Artillery', fireOnMove: false, passes: [], behindFight: 'fanout',
    desc: 'Stays at the back and shoots from as far as possible.' },
  charger: { name: 'Charger', fireOnMove: true, passes: 'all', behindFight: 'around', goal: 'structure',
    desc: 'Charges the first enemy structure in its path, slipping past mechs and shooting on the move.' },
};
export const STOP_AT = 0.95; // ranged units stop at this share of their range
// lane changes are walked (gameplay.md §5.2): sideways at side × the mech's speed, forward at fwd × while doing it.
// 120 units of lane width: Scout ≈ 1.6 s, Gunner ≈ 2.7 s, Brawler ≈ 3.8 s, Mortar ≈ 4.3 s.
// March pace (test, ISSUES "Battles are too long"): a mech with no target and no enemy within `clear` walks at
// least `pace` (slower types speed up, faster ones keep their speed), so reinforcements and groups reach a distant
// fight sooner. It eases into it (`ramp` per s) and drops back quickly (`brake` per s) on contact. Legs take
// longer strides rather than only faster steps. pace 0 = off.
export const MARCH = { pace: 60, clear: 420, ramp: 30, brake: 120 };
export const LANE_CHANGE = { side: 1.0, fwd: 0.6 };
// walking around own turrets (cosmetic): pad half-widths, start this far ahead of the pad, how far a mech's
// body counts (× radius), drift speed (× speed, at least minRate) and the drift cap when both sides are built up
export const DETOUR = { pad: { default: 31, howitzer: 36 }, ahead: 60, body: 1.4, rate: 1.3, minRate: 40, gap: 60 };

// turn = torso turn rate (rad/s). pref = target preference. structMult = damage multiplier vs turrets and bases.
const TURN = Math.PI * 2; // about 360°/s
export const MECHS = {
  scout: {
    role: 'charger', name: 'Scout', cost: 40, hp: 90, dmg: 8, reload: 0.35, range: 150, speed: 76, cd: 1.2,
    proj: 'bullet', radius: 16, turn: TURN, desc: 'Fast and cheap. Harasses and screens.',
  },
  gunner: {
    role: 'line', name: 'Gunner', cost: 80, hp: 230, dmg: 18, reload: 0.6, range: 260, speed: 44, cd: 2,
    proj: 'bullet', radius: 20, turn: TURN, desc: 'Reliable mid-range firepower.',
  },
  brawler: {
    role: 'tank', name: 'Brawler', cost: 140, hp: 700, dmg: 48, reload: 1.0, range: 60, speed: 32, cd: 3.5,
    proj: 'melee', radius: 28, turn: TURN, desc: 'Heavy melee tank. Smashes walls.',
  },
  mortar: {
    role: 'artillery', name: 'Mortar', cost: 170, hp: 180, dmg: 60, reload: 3.2, range: 460, speed: 28, cd: 4.5,
    proj: 'shell', splash: 70, radius: 24, turn: TURN, pauseToFire: true,
    flight: [1.0, 400], scatterMax: 40, structMult: 0.5,
    desc: 'Long-range splash. Slow shells: best vs units that stand still.',
  },
  aegis: {
    role: 'support', name: 'Aegis', cost: 120, hp: 340, dmg: 6, reload: 0.8, range: 180, speed: 46, cd: 4,
    proj: 'bullet', aura: 200, auraDR: 0.4, radius: 22, turn: TURN, desc: 'Field: allies nearby take 40% less damage.',
  },
  seeker: {
    role: 'line', name: 'Seeker', cost: 150, hp: 260, dmg: 35, reload: 2.4, range: 380, speed: 40, cd: 4,
    proj: 'missile', salvo: 2, splash: 30, traits: ['prefersMechs'], radius: 22, turn: TURN, desc: 'Homing missile salvos. Hunts mechs.',
  },
  breacher: {
    role: 'charger', name: 'Breacher', cost: 190, hp: 950, dmg: 30, reload: 1.2, range: 60, speed: 30, cd: 5,
    proj: 'melee', structMult: 4, stunOnHit: 0.3, radius: 30, turn: TURN, desc: 'Wallbreaker. ×4 damage to turrets and bases.',
  },
  lancer: {
    role: 'artillery', name: 'Lancer', cost: 200, hp: 300, dmg: 30, reload: 2.5, range: 540, speed: 32, cd: 5,
    proj: 'slug', structMult: 3, traits: ['prefersStructures'], radius: 22, turn: TURN, pauseToFire: true,
    desc: 'Siege gun. Outranges turrets, ×3 vs structures.',
  },
};
export const MECH_TYPES = Object.keys(MECHS);
// Enemy AI group templates (gameplay.md §10), by role, deployed front to back in the listed order.
// A template is used only if the stage roster has a type for every role; per role it picks a random type
// (not the cheap Scout if the role has another type). pack: same-type groups ('cheap' = cost ≤ 50, 2–3 of them;
// 'tank' = 2 Tanks, rare, they spread out with the side attack).
export const AI_GROUPS = [
  { roles: ['tank', 'line'], w: 3 },
  { roles: ['tank', 'artillery'], w: 2 },
  { roles: ['line', 'artillery'], w: 2 },
  { roles: ['line', 'line'], w: 1 },
  { roles: ['line', 'line', 'support'], w: 2 },
  { roles: ['tank', 'line', 'support'], w: 1 },
  { roles: ['charger', 'artillery'], w: 1 }, // siege: Breacher + Mortar/Lancer
  { pack: 'cheap', w: 2 },
  { pack: 'tank', w: 1 },
];
export const AI = {
  groupChance: [0.25, 0.45], // share of orders that are groups: early, after about 2.5 minutes
  splitChance: 0.15,          // share of group orders that are a split attack: two small groups in two lanes
  defensive: ['brawler', 'gunner', 'seeker'], // picks under pressure (half the time); no Aegis: a Support never goes alone
  recent: 4, recentPenalty: 0.5, // lanes used in the last 4 orders get this weight factor per use
  pressureBonus: 0.1, // extra income when the player's mechs are near its base, at most (was 0.4; ISSUES "Battles are too long")
};
// Traits (gameplay.md §5.5): each changes exactly one rule of the mech's role.
//   pref   targeting: 'mech' or 'structure' first (role default: nearest, no preference)
//   reach  lanes to each side it can target (role default: 1)
export const TRAITS = {
  prefersMechs: { name: 'Prefers mechs', set: { pref: 'mech' }, desc: 'Picks enemy mechs over structures.' },
  prefersStructures: { name: 'Prefers structures', set: { pref: 'structure' }, desc: 'Picks turrets and bases over mechs.' },
  longReach: { name: 'Long reach', set: { reach: 2 }, desc: 'Targets its own lane ± 2 instead of ± 1.' },
};
const ROLE_DEFAULTS = { pref: null, reach: 1 };
// the effective rules of each mech type: role, then its traits on top (the movement code reads only these)
for (const def of Object.values(MECHS)) {
  def.traits = def.traits || [];
  def.rules = Object.assign({}, ROLE_DEFAULTS, ROLES[def.role], ...def.traits.map((t) => TRAITS[t].set));
}

export const TURRETS = {
  sentry: {
    name: 'Sentry', cost: 90, hp: 650, dmg: 9, reload: 0.22, range: 290, proj: 'bullet', radius: 30, turn: 5,
    desc: 'Rapid-fire gun. Blocks its cell.',
  },
  howitzer: {
    name: 'Howitzer', cost: 160, hp: 950, dmg: 55, reload: 2.0, range: 500, proj: 'shell', splash: 60, radius: 34, turn: 2.5,
    desc: 'Long-range shells with splash.',
  },
  arc: {
    name: 'Arc Coil', cost: 200, hp: 750, dmg: 30, reload: 1.2, range: 230, proj: 'zap', chain: 3, radius: 30, turn: 99,
    desc: 'Lightning that chains to 3 targets.',
  },
};
export const TURRET_TYPES = Object.keys(TURRETS);

// Weapon positions in world units ([right, forward, height] from the unit's center), matching the voxel
// models. Guns alternate shot by shot; a missile salvo fires one missile from each position.
const MUZZLES = {
  scout: [[10, 20, 17]], gunner: [[-16, 27, 25], [16, 27, 25]], mortar: [[-15, 4, 44], [15, 4, 44]], aegis: [[12, 22, 22]],
  seeker: [[-16, 9, 31], [16, 9, 31]], lancer: [[0, 38, 30], [0, 38, 30]], sentry: [[-4, 28, 12], [4, 28, 12]], howitzer: [[0, 50, 17]],
};
for (const [k, m] of Object.entries(MUZZLES)) (MECHS[k] || TURRETS[k]).muzzles = m;

export const CONSTRUCTOR = {
  name: 'Constructor', cost: 0, hp: 200, speed: 80, radius: 20, fee: 20, buildTime: 2, respawn: 3,
  desc: 'Drives out and builds your queued turrets.',
};

export const BASE = { name: 'Base', hp: 3000, dmg: 12, reload: 0.5, range: 340, proj: 'bullet', radius: 0, guns: [120, 480] };

export const BASE_UPGRADES = {
  armor: { name: 'Armor', desc: '+20% base HP (and repairs it)', costs: [150, 250, 400] },
  gun: { name: 'Bastion Gun', desc: '+50% base gun damage', costs: [120, 220, 350] },
  reactor: { name: 'Reactor', desc: '+2 energy/s, +60 max energy', costs: [100, 200, 320] },
};

export const SPECIALS = {
  bomb: { name: 'Bombing', short: 'BOMBING', key: 'Q', cd: 40, targeted: true, desc: 'Tap the field: 7 bombs around that point.' },
  emp: { name: 'EMP', short: 'EMP', key: 'E', cd: 55, desc: 'Stuns all enemy mechs and turrets for 4 s.' },
  surge: { name: 'Energy Surge', short: 'SURGE', key: 'R', cd: 50, amount: 100, desc: '+100 energy instantly.' },
};

// deployment queue: max orders; a queued deploy waits until its lane's spawn point is clear,
// but at most `wait` seconds (so a mech holding near the gate can't block the queue forever)
export const QUEUE = { max: 5, wait: 1.5 };
export const ENERGY = { start: 100, regen: 8, cap: 300, bounty: 0.25, perkStart: 50, perkCap: 40, perkRegen: 1 };

// Dev experiments (ISSUES.md "Battles are too long"): one at a time, chosen in Settings on the dev build only;
// 'off' is the normal game. Each battle's stats record the key. Remove an entry (and its rule in world.js) when decided.
//   bounty:   player kill bounty share (normal ENERGY.bounty)
//   ramp:     how much the enemy income grows over the first 7 minutes (normal 1 = doubles)
//   overtime: from this time (s) both sides get OVERTIME_BONUS energy/s more
export const EXPERIMENTS = {
  off: { name: 'Off' },
  bounty40: { name: 'Kill bounty 40%', bounty: 0.4 },
  bounty60: { name: 'Kill bounty 60%', bounty: 0.6 },
  ramp15: { name: 'Enemy ramp ×1.5', ramp: 0.5 },
  noramp: { name: 'No enemy ramp', ramp: 0 },
  ot8: { name: 'Overtime from 8 min', overtime: 480 },
  ot15: { name: 'Overtime from 15 min', overtime: 900 },
};
export const OVERTIME_BONUS = 15;
export const MAX_UNIT_LEVEL = 5;
export const BASE_MAX_ENERGY = 300;
export const upgradeCost = (def, lvl) => Math.min(BASE_MAX_ENERGY, Math.round(def.cost * 0.9 * (lvl + 1)));
// Levels add only damage and HP (decided 2026-11-16): range, speed and fire rate stay fixed, so the range ladder
// (gameplay.md §5.4) and the movement rules don't depend on upgrades.
export const LEVEL_STEP = 0.15;
export const levelMult = (lvl) => ({
  dmg: 1 + LEVEL_STEP * lvl, hp: 1 + LEVEL_STEP * lvl, speed: 1, range: 1, reload: 1,
});
// Selling refunds 25% (nearly dead) to 50% (full HP) of the build cost.
export const sellRefund = (def, hpFrac) => Math.round(def.cost * 0.5 * (0.5 + 0.5 * hpFrac));

// ---------- progression ----------
// Index = number of stages cleared. One new mech type per stage.
export const UNLOCKS = [
  { mechs: ['scout', 'gunner'], turrets: ['sentry'], specials: ['bomb'] },
  { mechs: ['brawler'] },
  { mechs: ['mortar'], turrets: ['howitzer'] },
  { mechs: ['seeker'], specials: ['emp'] },
  { mechs: ['aegis'] },
  { mechs: ['lancer'], turrets: ['arc'] },
  { mechs: ['breacher'], specials: ['surge'] },
];
export function unlockedSet(cleared) {
  const s = { mechs: [], turrets: [], specials: [] };
  for (let i = 0; i <= Math.min(cleared, UNLOCKS.length - 1); i++) {
    for (const k of ['mechs', 'turrets', 'specials']) if (UNLOCKS[i][k]) s[k].push(...UNLOCKS[i][k]);
  }
  return s;
}
export const LOADOUT_SIZE = 5;

// ---------- stages ----------
// turrets: [type, lane (0-4), row (0 = nearest the enemy base)]. base: enemy base upgrade levels.
const S = (name, o) => ({ name, ...o });
export const STAGES = [
  S('Scrubline', { baseHp: 1500, lvl: 0, regen: 5, roster: ['scout'], turrets: [], base: {} }),
  S('Dry Ford', { baseHp: 1800, lvl: 0, regen: 6, roster: ['scout', 'gunner'], turrets: [], base: {} }),
  S('Quarry Road', { baseHp: 2100, lvl: 0, regen: 6.5, roster: ['scout', 'gunner', 'brawler'], turrets: [['sentry', 2, 3]], base: {} }),
  S('Dust Belt', {
    baseHp: 2400, lvl: 0, regen: 7, roster: ['scout', 'gunner', 'brawler', 'mortar'],
    turrets: [['sentry', 1, 3], ['sentry', 3, 3]], base: { gun: 1 },
  }),
  S('Saltpan', {
    baseHp: 2700, lvl: 0, regen: 7.5, roster: ['scout', 'gunner', 'brawler', 'mortar', 'seeker'],
    turrets: [['sentry', 0, 3], ['howitzer', 2, 1], ['sentry', 4, 3]], base: { armor: 1 },
  }),
  S('Red Cut', {
    baseHp: 3000, lvl: 1, regen: 8, roster: ['gunner', 'brawler', 'mortar', 'seeker', 'aegis'],
    turrets: [['sentry', 1, 4], ['sentry', 2, 4], ['sentry', 3, 4], ['howitzer', 2, 1]], base: { gun: 1, armor: 1 },
  }),
  S('Pylon Field', {
    baseHp: 3300, lvl: 1, regen: 9.2, roster: ['scout', 'gunner', 'brawler', 'mortar', 'seeker', 'aegis', 'lancer'],
    turrets: [['arc', 2, 3], ['sentry', 0, 3], ['sentry', 4, 3], ['howitzer', 1, 1]], base: { reactor: 1 },
  }),
  S('Gravel Sea', {
    baseHp: 3600, lvl: 1, regen: 9.7, roster: ['gunner', 'brawler', 'mortar', 'seeker', 'aegis', 'lancer', 'breacher'],
    turrets: [['sentry', 0, 4], ['sentry', 1, 4], ['arc', 2, 4], ['sentry', 3, 4], ['howitzer', 2, 1], ['howitzer', 4, 2]],
    base: { armor: 1, gun: 1 },
  }),
  S('Ironwood', {
    baseHp: 4000, lvl: 2, regen: 10.3, roster: ['gunner', 'brawler', 'mortar', 'seeker', 'aegis', 'lancer', 'breacher'],
    turrets: [['sentry', 0, 5], ['sentry', 1, 5], ['sentry', 3, 5], ['sentry', 4, 5], ['arc', 2, 3], ['howitzer', 2, 1]],
    base: { armor: 1, gun: 1, reactor: 1 },
  }),
  S('Ash Ridge', {
    baseHp: 4400, lvl: 2, regen: 10.8, roster: ['scout', 'gunner', 'brawler', 'mortar', 'seeker', 'aegis', 'lancer', 'breacher'],
    turrets: [['arc', 1, 4], ['arc', 3, 4], ['sentry', 2, 4], ['howitzer', 0, 2], ['howitzer', 4, 2], ['sentry', 2, 1]],
    base: { armor: 2, gun: 1, reactor: 1 },
  }),
  S('Breakwater', {
    baseHp: 4800, lvl: 2, regen: 11.3, roster: ['gunner', 'brawler', 'mortar', 'seeker', 'aegis', 'lancer', 'breacher'],
    turrets: [['sentry', 0, 5], ['sentry', 1, 5], ['sentry', 2, 5], ['sentry', 3, 5], ['sentry', 4, 5], ['howitzer', 2, 1]],
    base: { armor: 1, gun: 1, reactor: 1 },
  }),
  S('Last Bastion', {
    baseHp: 5400, lvl: 2, regen: 12.4, roster: ['scout', 'gunner', 'brawler', 'mortar', 'seeker', 'aegis', 'lancer', 'breacher'],
    turrets: [['arc', 0, 5], ['sentry', 1, 5], ['arc', 2, 5], ['sentry', 3, 5], ['arc', 4, 5], ['howitzer', 1, 1], ['howitzer', 3, 1]],
    base: { armor: 2, gun: 2, reactor: 1 },
  }),
];

// Endless wave n starts just above Last Bastion and ramps up gradually.
export function stageDef(i) {
  if (i < STAGES.length) return { ...STAGES[i], index: i };
  const n = i - STAGES.length + 1, last = STAGES[STAGES.length - 1];
  return {
    name: `Endless ${n}`, index: i, endless: true,
    baseHp: Math.round(last.baseHp * (1 + 0.06 * n)),
    lvl: Math.min(MAX_UNIT_LEVEL, last.lvl + Math.floor((n + 1) / 3)),
    regen: +(last.regen * (1 + 0.04 * n)).toFixed(1), roster: last.roster, turrets: last.turrets,
    base: {
      armor: Math.min(3, (last.base.armor || 0) + Math.floor(n / 3)),
      gun: Math.min(3, (last.base.gun || 0) + Math.floor(n / 4)),
      reactor: Math.min(3, (last.base.reactor || 0) + Math.floor(n / 3)),
    },
  };
}

export const stageReward = (i, stars) => 60 + 30 * Math.min(i, 14) + 25 * stars;
export const lossReward = (kills) => 15 + 2 * kills;

// ---------- workshop ----------
export const PERKS = {
  energy: { name: 'Capacitors', desc: '+50 starting energy and +40 max energy', costs: [150, 300, 500] },
  armor: { name: 'Reinforced Walls', desc: '+15% base HP', costs: [200, 400, 650] },
  charge: { name: 'Fast Uplink', desc: 'Specials recharge 10% faster', costs: [200, 400, 650] },
  regen: { name: 'Power Grid', desc: '+1 energy per second', costs: [200, 400, 650] },
};
export const MAX_TECH = 3;
export const techCost = (lvl) => [120, 260, 450][lvl];
