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
// turn = torso turn rate (rad/s). pref = target preference. structMult = damage multiplier vs turrets and bases.
const TURN = Math.PI * 2; // about 360°/s
export const MECHS = {
  scout: {
    name: 'Scout', cost: 40, hp: 90, dmg: 8, reload: 0.35, range: 150, speed: 95, cd: 1.2,
    proj: 'bullet', radius: 16, turn: TURN, desc: 'Fast and cheap. Harasses and screens.',
  },
  gunner: {
    name: 'Gunner', cost: 80, hp: 230, dmg: 18, reload: 0.6, range: 260, speed: 55, cd: 2,
    proj: 'bullet', radius: 20, turn: TURN, desc: 'Reliable mid-range firepower.',
  },
  brawler: {
    name: 'Brawler', cost: 140, hp: 700, dmg: 48, reload: 1.0, range: 60, speed: 40, cd: 3.5,
    proj: 'melee', radius: 28, turn: TURN, desc: 'Heavy melee tank. Smashes walls.',
  },
  mortar: {
    name: 'Mortar', cost: 170, hp: 180, dmg: 60, reload: 2.6, range: 520, speed: 35, cd: 4.5,
    proj: 'shell', splash: 70, radius: 24, turn: TURN, pauseToFire: true, desc: 'Long-range splash. Fragile.',
  },
  aegis: {
    name: 'Aegis', cost: 120, hp: 340, dmg: 6, reload: 0.8, range: 180, speed: 45, cd: 4,
    proj: 'bullet', aura: 140, auraDR: 0.4, radius: 22, turn: TURN, desc: 'Field: allies nearby take 40% less damage.',
  },
  seeker: {
    name: 'Seeker', cost: 150, hp: 260, dmg: 35, reload: 2.4, range: 380, speed: 50, cd: 4,
    proj: 'missile', salvo: 2, splash: 30, pref: 'mech', radius: 22, turn: TURN, desc: 'Homing missile salvos. Hunts mechs.',
  },
  breacher: {
    name: 'Breacher', cost: 190, hp: 950, dmg: 30, reload: 1.2, range: 60, speed: 38, cd: 5,
    proj: 'melee', structMult: 4, stunOnHit: 0.3, radius: 30, turn: TURN, desc: 'Wallbreaker. ×4 damage to turrets and bases.',
  },
  lancer: {
    name: 'Lancer', cost: 200, hp: 300, dmg: 30, reload: 2.5, range: 460, speed: 40, cd: 5,
    proj: 'slug', structMult: 3, pref: 'structure', radius: 22, turn: TURN, pauseToFire: true,
    desc: 'Siege gun. Outranges turrets, ×3 vs structures.',
  },
};
export const MECH_TYPES = Object.keys(MECHS);

export const TURRETS = {
  sentry: {
    name: 'Sentry', cost: 90, hp: 650, dmg: 9, reload: 0.22, range: 290, proj: 'bullet', radius: 30, turn: 5,
    desc: 'Rapid-fire gun. Blocks its cell.',
  },
  howitzer: {
    name: 'Howitzer', cost: 160, hp: 950, dmg: 55, reload: 2.0, range: 430, proj: 'shell', splash: 60, radius: 34, turn: 2.5,
    desc: 'Long-range shells with splash.',
  },
  arc: {
    name: 'Arc Coil', cost: 200, hp: 750, dmg: 30, reload: 1.2, range: 230, proj: 'zap', chain: 3, radius: 30, turn: 99,
    desc: 'Lightning that chains to 3 targets.',
  },
};
export const TURRET_TYPES = Object.keys(TURRETS);

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

export const ENERGY = { start: 100, regen: 8, cap: 300, bounty: 0.25, perkStart: 50, perkCap: 40 };
export const MAX_UNIT_LEVEL = 5;
export const BASE_MAX_ENERGY = 300;
export const upgradeCost = (def, lvl) => Math.min(BASE_MAX_ENERGY, Math.round(def.cost * 0.9 * (lvl + 1)));
export const levelMult = (lvl) => ({
  dmg: 1 + 0.25 * lvl, hp: 1 + 0.25 * lvl, speed: 1 + 0.04 * lvl, range: 1 + 0.04 * lvl, reload: 1 - 0.04 * lvl,
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
    baseHp: 3300, lvl: 1, regen: 8.5, roster: ['scout', 'gunner', 'brawler', 'mortar', 'seeker', 'aegis', 'lancer'],
    turrets: [['arc', 2, 3], ['sentry', 0, 3], ['sentry', 4, 3], ['howitzer', 1, 1]], base: { reactor: 1 },
  }),
  S('Gravel Sea', {
    baseHp: 3600, lvl: 1, regen: 9, roster: ['gunner', 'brawler', 'mortar', 'seeker', 'aegis', 'lancer', 'breacher'],
    turrets: [['sentry', 0, 4], ['sentry', 1, 4], ['arc', 2, 4], ['sentry', 3, 4], ['howitzer', 2, 1], ['howitzer', 4, 2]],
    base: { armor: 1, gun: 1 },
  }),
  S('Ironwood', {
    baseHp: 4000, lvl: 2, regen: 9.5, roster: ['gunner', 'brawler', 'mortar', 'seeker', 'aegis', 'lancer', 'breacher'],
    turrets: [['sentry', 0, 5], ['sentry', 1, 5], ['sentry', 3, 5], ['sentry', 4, 5], ['arc', 2, 3], ['howitzer', 2, 1]],
    base: { armor: 1, gun: 1, reactor: 1 },
  }),
  S('Ash Ridge', {
    baseHp: 4400, lvl: 2, regen: 10, roster: ['scout', 'gunner', 'brawler', 'mortar', 'seeker', 'aegis', 'lancer', 'breacher'],
    turrets: [['arc', 1, 4], ['arc', 3, 4], ['sentry', 2, 4], ['howitzer', 0, 2], ['howitzer', 4, 2], ['sentry', 2, 1]],
    base: { armor: 2, gun: 1, reactor: 1 },
  }),
  S('Breakwater', {
    baseHp: 4800, lvl: 2, regen: 10.5, roster: ['gunner', 'brawler', 'mortar', 'seeker', 'aegis', 'lancer', 'breacher'],
    turrets: [['sentry', 0, 5], ['sentry', 1, 5], ['sentry', 2, 5], ['sentry', 3, 5], ['sentry', 4, 5], ['howitzer', 2, 1]],
    base: { armor: 1, gun: 1, reactor: 1 },
  }),
  S('Last Bastion', {
    baseHp: 5400, lvl: 2, regen: 11.5, roster: ['scout', 'gunner', 'brawler', 'mortar', 'seeker', 'aegis', 'lancer', 'breacher'],
    turrets: [['arc', 0, 5], ['sentry', 1, 5], ['arc', 2, 5], ['sentry', 3, 5], ['arc', 4, 5], ['howitzer', 1, 1], ['howitzer', 3, 1]],
    base: { armor: 2, gun: 2, reactor: 1 },
  }),
];

export function stageDef(i) {
  if (i < STAGES.length) return { ...STAGES[i], index: i };
  const n = i - STAGES.length + 1, last = STAGES[STAGES.length - 1];
  return {
    name: `Endless ${n}`, index: i, endless: true,
    baseHp: Math.round(last.baseHp * (1 + 0.12 * n)), lvl: Math.min(MAX_UNIT_LEVEL, 3 + Math.floor(n / 3)),
    regen: last.regen + n, roster: last.roster, turrets: last.turrets,
    base: { armor: 3, gun: Math.min(3, 2 + Math.floor(n / 4)), reactor: Math.min(3, 2 + Math.floor(n / 4)) },
  };
}

export const stageReward = (i, stars) => 60 + 30 * Math.min(i, 14) + 25 * stars;
export const lossReward = (kills) => 15 + 2 * kills;

// ---------- workshop ----------
export const PERKS = {
  energy: { name: 'Capacitors', desc: '+50 starting energy and +40 max energy', costs: [150, 300, 500] },
  armor: { name: 'Reinforced Walls', desc: '+15% base HP', costs: [200, 400, 650] },
  charge: { name: 'Fast Uplink', desc: 'Specials recharge 10% faster', costs: [200, 400, 650] },
};
export const MAX_TECH = 3;
export const techCost = (lvl) => [120, 260, 450][lvl];
