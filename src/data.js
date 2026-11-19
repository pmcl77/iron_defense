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
//   strip        half-lane fan-out: with no shot behind a fighting friendly and both neighbouring lanes taken, it steps
//                onto the strip between two lanes and fights from there (gameplay.md §5.2, STRIP). No role has it;
//                it comes with the Flanker trait (Gunner)
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
// drift: while changing lanes a mech that would stand still (target in range) keeps walking forward at this share of its
// speed, unless something is right in front of it, so lane changes look diagonal (dev switch 'drift').
// returnDelay: seconds a passing mech stays in the passing lane when the friendly it was passing dies (dev switch).
export const LANE_CHANGE = { side: 1.0, fwd: 0.6, drift: 0.4, returnDelay: 2 };
// Dev switches (dev builds only, Settings; live ones also in the pause menu during a battle). def = value on release
// builds and when never set. Each battle's stats record the values at the start (dev) and every live change as an event.
export const DEV_SWITCHES = {
  drift: { name: 'Diagonal lane changes', desc: 'keep walking forward while changing lanes', def: true, live: true },
  returnDelay: { name: 'Return delay', desc: `stay ${2} s in the passing lane if the passed friendly dies`, def: false, live: true },
  stripFirst: { name: 'Gunners: strip before lane', desc: 'a Flanker takes a free strip before a free neighbour lane', def: false, live: false },
  stripPassLonger: { name: 'Strip: walk past longer guns', desc: 'on a strip, a fighting friendly with a longer range doesn\'t stop it; it walks on until it has a target', def: true, live: true },
};
// half-lane fan-out (gameplay.md §5.2): a fighting spot on the strip between two lanes. It blocks nobody and is in no
// lane (reach stays its lane ± 1). It walks up at most level with the fighting friendly it joins (within `front`
// ahead), one mech per spot (`gap` between mechs on the same strip, any team), and returns to its lane when it has
// no shot and can't get closer, or the fight is over, as soon as there's room.
export const STRIP = { front: 250, gap: 10, again: 4 }; // again: seconds before it may step onto a strip again after returning
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
    proj: 'bullet', traits: ['flanker'], radius: 20, turn: TURN, desc: 'Reliable mid-range firepower.',
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
  defendOrder: 0.7, // share of defensive picks that follow the situation rule (see aiDefend); the rest: a random defender
  // focus types (PERSONALITIES): each battle draws a target factor in `range`: each FT deployed about that many times as
  // often as each other type, measured on the result. The AI steers on its own count: the boost of an FT grows while it
  // is behind the target and shrinks when ahead (between 1 and `max`). Singles: only roles that work alone get the
  // boost; Artillery/Support FT come more often only in groups (their factor may end lower). tools/focus.mjs checks it.
  focus: { range: [2.2, 3.5], max: 40, alone: ['tank', 'line', 'charger'] },
  recent: 4, recentPenalty: 0.5, // lanes used in the last 4 orders get this weight factor per use
  pressureBonus: 0.1, // extra income when the player's mechs are near its base, at most (was 0.4; ISSUES "Battles are too long")
};
// Traits (gameplay.md §5.5): each changes exactly one rule of the mech's role.
//   pref   targeting: 'mech' or 'structure' first (role default: nearest, no preference)
//   reach  lanes to each side it can target (role default: 1)
export const TRAITS = {
  prefersMechs: { name: 'Prefers mechs', set: { pref: 'mech' }, desc: 'Picks enemy mechs over structures.' },
  prefersStructures: { name: 'Prefers structures', set: { pref: 'structure' }, desc: 'Picks turrets and bases over mechs.' },
  flanker: { name: 'Flanker', set: { strip: true }, desc: 'In a crowded fight it can fight from the strip between two lanes.' },
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
export const QUEUE = { max: 6, wait: 1.5 };
// Overtime (ISSUES.md "Battles are too long", tested as dev experiments, kept by the user 2026-11-17): from minute 9
// both sides' current income (after upgrades, the enemy's ramp and pressure bonus) ×1.5; kill bounty and Surge unchanged.
export const OVERTIME = { at: 540, mult: 1.5 };
export const ENERGY = { start: 100, regen: 8, cap: 300, bounty: 0.25, perkStart: 50, perkCap: 40, perkRegen: 1 };

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
// roster: the enemy loadout (at most LOADOUT_SIZE types; the AI fields only these). Stage n brings the unit the player
// unlocks by clearing it (the "frontrunner", ISSUES.md 2026-11-18); from SURPRISE_FROM one slot is hidden in the intel.
// Personalities: 1 first contact, 2 first shells, 3 hunters, 4 armored, 5 long guns, 6 wall breakers, 7 swarm (no tanks),
// 8 siege, 9 iron wall, 10 artillery line, 11 rush, 12 elite.
const S = (name, o) => ({ name, ...o });
export const STAGES = [
  S('Scrubline', { personality: 'firstContact', baseHp: 1500, lvl: 0, regen: 5, roster: ['scout', 'gunner', 'brawler'], turrets: [], base: {} }),
  S('Dry Ford', { personality: 'firstShells', baseHp: 1800, lvl: 0, regen: 6, roster: ['scout', 'gunner', 'brawler', 'mortar'], turrets: [], base: {} }),
  S('Quarry Road', { personality: 'hunters', baseHp: 2100, lvl: 0, regen: 6.5, roster: ['scout', 'gunner', 'brawler', 'mortar', 'seeker'], turrets: [['sentry', 2, 3]], base: {} }),
  S('Dust Belt', { personality: 'armored',
    baseHp: 2400, lvl: 0, regen: 7, roster: ['brawler', 'aegis', 'gunner', 'seeker', 'mortar'],
    turrets: [['sentry', 1, 3], ['sentry', 3, 3]], base: { gun: 1 },
  }),
  S('Saltpan', { personality: 'longGuns',
    baseHp: 2700, lvl: 0, regen: 7.5, roster: ['lancer', 'mortar', 'gunner', 'brawler', 'scout'],
    turrets: [['sentry', 0, 3], ['howitzer', 2, 1], ['sentry', 4, 3]], base: { armor: 1 },
  }),
  S('Red Cut', { personality: 'wallBreakers',
    baseHp: 3000, lvl: 1, regen: 8, roster: ['breacher', 'brawler', 'aegis', 'gunner', 'mortar'],
    turrets: [['sentry', 1, 4], ['sentry', 2, 4], ['sentry', 3, 4], ['howitzer', 2, 1]], base: { gun: 1, armor: 1 },
  }),
  S('Pylon Field', { personality: 'swarm',
    baseHp: 3300, lvl: 1, regen: 9.2, roster: ['scout', 'gunner', 'seeker', 'aegis', 'mortar'],
    turrets: [['arc', 2, 3], ['sentry', 0, 3], ['sentry', 4, 3], ['howitzer', 1, 1]], base: { reactor: 1 },
  }),
  S('Gravel Sea', { personality: 'siege',
    baseHp: 3600, lvl: 1, regen: 9.7, roster: ['lancer', 'mortar', 'breacher', 'brawler', 'gunner'],
    turrets: [['sentry', 0, 4], ['sentry', 1, 4], ['arc', 2, 4], ['sentry', 3, 4], ['howitzer', 2, 1], ['howitzer', 4, 2]],
    base: { armor: 1, gun: 1 },
  }),
  S('Ironwood', { personality: 'ironWall',
    baseHp: 4000, lvl: 2, regen: 10.3, roster: ['brawler', 'aegis', 'seeker', 'gunner', 'breacher'],
    turrets: [['sentry', 0, 5], ['sentry', 1, 5], ['sentry', 3, 5], ['sentry', 4, 5], ['arc', 2, 3], ['howitzer', 2, 1]],
    base: { armor: 1, gun: 1, reactor: 1 },
  }),
  S('Ash Ridge', { personality: 'artilleryLine',
    baseHp: 4400, lvl: 2, regen: 10.8, roster: ['lancer', 'mortar', 'seeker', 'gunner', 'brawler'],
    turrets: [['arc', 1, 4], ['arc', 3, 4], ['sentry', 2, 4], ['howitzer', 0, 2], ['howitzer', 4, 2], ['sentry', 2, 1]],
    base: { armor: 2, gun: 1, reactor: 1 },
  }),
  S('Breakwater', { personality: 'rush',
    baseHp: 4800, lvl: 2, regen: 11.3, roster: ['scout', 'breacher', 'brawler', 'gunner', 'seeker'],
    turrets: [['sentry', 0, 5], ['sentry', 1, 5], ['sentry', 2, 5], ['sentry', 3, 5], ['sentry', 4, 5], ['howitzer', 2, 1]],
    base: { armor: 1, gun: 1, reactor: 1 },
  }),
  S('Last Bastion', { personality: 'elite',
    baseHp: 5400, lvl: 2, regen: 12.4, roster: ['brawler', 'aegis', 'seeker', 'lancer', 'mortar'],
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
    regen: +(last.regen * (1 + 0.04 * n)).toFixed(1), roster: last.roster, personality: last.personality, turrets: last.turrets, // the game gives Endless a random personality and loadout per battle
    base: {
      armor: Math.min(3, (last.base.armor || 0) + Math.floor(n / 3)),
      gun: Math.min(3, (last.base.gun || 0) + Math.floor(n / 4)),
      reactor: Math.min(3, (last.base.reactor || 0) + Math.floor(n / 3)),
    },
  };
}

// Enemy personalities (ISSUES.md 2026-11-19, glossary in gameplay.md): the theme of an enemy loadout and its focus
// types (FT), which the enemy deploys more often (AI.focus). A campaign stage names its personality; Endless (later
// quick match) draws one of RANDOM_PERSONALITIES and builds its loadout around the FT. desc: shown with dev intel.
export const PERSONALITIES = {
  firstContact: { name: 'First contact', focus: ['brawler'], desc: 'A light probe: Scouts and Gunners, then the first Brawlers.' },
  firstShells: { name: 'First shells', focus: ['mortar'], desc: 'Mortars lob shells over the front line.' },
  hunters: { name: 'Hunters', focus: ['seeker'], desc: 'Seekers hunt your mechs with missiles.' },
  armored: { name: 'Armored', focus: ['aegis', 'brawler'], desc: 'Brawlers advance under Aegis fields.' },
  longGuns: { name: 'Long guns', focus: ['lancer'], desc: 'Lancers outrange your turrets and shoot them from afar.' },
  wallBreakers: { name: 'Wall breakers', focus: ['breacher'], desc: 'Breachers charge your turrets and stun them.' },
  swarm: { name: 'Swarm', focus: ['scout', 'seeker'], desc: 'Many light, fast units and no tanks.' },
  siege: { name: 'Siege', focus: ['breacher', 'lancer'], desc: 'Breaks your turrets with Breachers and Lancers.' },
  ironWall: { name: 'Iron wall', focus: ['brawler', 'aegis'], desc: 'Shielded Brawler lines that are hard to break and slow to die.' },
  artilleryLine: { name: 'Artillery line', focus: ['lancer', 'mortar'], desc: 'Lancers and Mortars shell you from far back.' },
  rush: { name: 'Rush', focus: ['scout', 'breacher'], desc: 'Scouts and Breachers dash past your mechs to your structures.' },
  elite: { name: 'Elite', focus: ['seeker', 'lancer'], desc: 'Seekers and Lancers, backed by Brawlers and Aegis.' },
};
export const RANDOM_PERSONALITIES = ['armored', 'longGuns', 'wallBreakers', 'swarm', 'siege', 'ironWall', 'artilleryLine', 'rush', 'elite'];
export const randomPersonality = (rnd) => RANDOM_PERSONALITIES[Math.floor(rnd() * RANDOM_PERSONALITIES.length)];

export const SURPRISE_FROM = 6; // stage index (stage 7): from here one enemy loadout slot shows '?' in the intel

// A rule-based random enemy loadout (Endless, later quick match): LOADOUT_SIZE different types with at least one Line
// type, at least one Tank or Artillery, and at most one Charger. With a personality its focus types are always in it
// (a personality may bring two Chargers, e.g. rush); the other slots are random. rnd: () => [0, 1).
export function randomLoadout(rnd, types = MECH_TYPES, personality = null) {
  const role = (t) => MECHS[t].role;
  const focus = (PERSONALITIES[personality]?.focus || []).filter((t) => types.includes(t));
  const chargers = Math.max(1, focus.filter((t) => role(t) === 'charger').length);
  for (let n = 0; n < 1000; n++) {
    const pool = types.filter((t) => !focus.includes(t)), pick = [...focus];
    while (pick.length < Math.min(LOADOUT_SIZE, types.length)) pick.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    if (pick.some((t) => role(t) === 'line') && pick.some((t) => role(t) === 'tank' || role(t) === 'artillery')
      && pick.filter((t) => role(t) === 'charger').length <= chargers) return pick;
  }
  return STAGES[STAGES.length - 1].roster.slice();
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
