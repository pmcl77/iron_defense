// Player bot 2.0 (ISSUES.md "A stronger player bot", rule set v0 and the replay analysis of rows 68–85).
// Plays the player's side through the player's own inputs (request, order, upgradeUnit, upgradeBase, special), so every
// bot match is a normal replay and the replay doesn't need the bot. Runs in the browser (dev match, Player: Bot) and in
// Node (tools/bot.mjs). It never draws from the world's random numbers (that would change the battle): it has its own.
//
// Structure (code): phases with a priority list of rules, checked every THINK s:
//   opening → Reactor ×2; pressure → defend the threatened lane; calm/middle → upgrades in a window, formations in
//   lanes 2/4; push → Howitzers in the middle lanes, forward deploys, no more upgrades.
// Numbers and lists (data): a profile, see PROFILES; every value can be overridden (dev match "Bot settings").
import { MECHS, TURRETS, BASE_FACE, LANES, laneX, cellY, ROWS, SPECIALS, MAX_UNIT_LEVEL } from './data.js';

export const THINK = 0.5; // s between decisions

// The user's style (rows 68–85). Lanes are 1-based like in the game.
const YOU = {
  name: 'You (base style)',
  reactorOpen: 2,            // Reactor levels in the opening (first 30 s)
  reactor3: { energy: 320, eta: 35, early: 90 }, // Reactor 3: when this rich and the nearest enemy this far (s); against a defensive enemy from `early` s
  calmEta: 30,               // s until the nearest enemy arrives: calm (opening and quiet phases)
  windowEta: 15,             // middle phase: an upgrade window right after a fight, enemy at least this far (s)
  reserve: 120,              // energy left after an upgrade in a window (data: p10 180, median 330; with the cap at 420 and
                             // 300 per level from level 3, more would block the higher levels; the Surge is a second reserve)
  upgradeTo: 5,              // focus types (a tank and a line type) up to this level
  thirdTo: 3,                // then the third type (Mortar) up to this level
  pressure: 700,             // an enemy this close to the base face (or 350 to a turret) = under pressure
  ignoreScouts: 2,           // up to this many Scouts alone are no threat ("I don't care about a single SC")
  outerHeavy: 450,           // threats in lane 1 or 5 are answered from lane 2 or 4 (ranged units reach over); the outer
                             // lane itself only when this much enemy value pushes there (row 86 note: "I never use 1 and 5
                             // but only 2 and 4, also in these cases; only when a lot of enemies pressure L1/2")
  save: 'surge',             // formations: 'whole' (tap when all is affordable), 'surge' (affordable with the Surge), 'queue' (tap at once)
  formations: [              // [units, weight]; the counter table below shifts the weights
    [['brawler', 'seeker', 'mortar'], 4], [['brawler', 'gunner', 'seeker'], 2], [['brawler', 'seeker'], 2],
    [['brawler', 'gunner', 'seeker', 'mortar'], 2], [['brawler', 'seeker', 'seeker'], 2], [['seeker', 'seeker', 'seeker'], 1],
  ],
  lanes: [2, 4],             // formation pairs, built in alternation
  aegis: true,               // an Aegis in lane 3 once a front line forms
  aegisLane: 3,
  howitzers: true,           // the push: Howitzers on the front row of the middle lanes
  pushLine: 55,              // scrimmage line % for the Howitzer push
  pushAfter: 180,            // not before this time (s; data: first Howitzer p10 3:02)
  pushLevel: 3,              // and only once the focus types have this level (row 85: "I don't go forward too early,
                             // the extra distance makes room for upgrading")
  pushRoom: 450,             // nearest enemy at least this far from the turret cell
  anchorAt: 480,             // no push by this time (s): Howitzers on a middle row as an anchor
  anchorRow: 4,
  howitzerLanes: [3, 2, 4],
  outerAt: 80,               // enemy base HP % below which the push also uses lanes 1 and 5
  swarmSentries: true,       // against Scout/Gunner swarms: Sentries in lanes 1 and 5 with the push
  bomb: 380,                 // Bombing when the target value reaches this (a lone Lancer = 400)
  emp: 3,                    // EMP when this many own mechs are deep in the enemy half with enemies around them, or 4+ enemies close under pressure
};
// Optional profile fields: loadout (its own 5 unit types instead of yours), focus (the two upgrade types, else by the
// enemy's mix), third (the third upgrade type), turrets (an early turret plan [type, lane, row], built in calm moments),
// line + lineShare (a unit in every lane at once, lanes 1–5), reactor3.always (Reactor 3 as soon as it's calm).
const R = (t, n) => [t, n];
export const PROFILES = {
  you: YOU,
  lancers: { ...YOU, name: 'You, Lancers for Mortars', loadout: ['brawler', 'gunner', 'seeker', 'lancer', 'aegis'],
    formations: YOU.formations.map(([f, n]) => [f.map((t) => (t === 'mortar' ? 'lancer' : t)), n]) },
  gunners: { ...YOU, name: 'Gunner swarms', formations: [R(['brawler', 'gunner', 'gunner'], 3), R(['brawler', 'gunner', 'gunner', 'seeker'], 2), R(['gunner', 'gunner', 'gunner'], 1)] },
  spread: { ...YOU, name: 'Spread upgrades', upgradeTo: 3, thirdTo: 3 },
  // other styles (ISSUES.md "Bot profiles"): do other strategies win too?
  turtle: { ...YOU, name: 'Turtle (turrets early, push late)', pushLine: 62, pushAfter: 420, pushLevel: 4,
    turrets: [['sentry', 2, 3], ['sentry', 4, 3], ['howitzer', 3, 2], ['sentry', 3, 3], ['howitzer', 2, 1], ['howitzer', 4, 1]] },
  rusher: { ...YOU, name: 'Rusher (never saves)', reactorOpen: 1, reactor3: { energy: 99999, eta: 99, early: 99999 }, upgradeTo: 2, thirdTo: 0,
    save: 'queue', howitzers: false, aegis: false,
    formations: [R(['brawler', 'gunner'], 3), R(['brawler', 'seeker'], 3), R(['gunner', 'gunner'], 2), R(['brawler', 'gunner', 'seeker'], 2)] },
  artillery: { ...YOU, name: 'Artillery (MO/LA behind a BW wall)', loadout: ['brawler', 'aegis', 'mortar', 'lancer', 'seeker'],
    focus: ['brawler', 'mortar'], third: 'lancer', pushLine: 60,
    formations: [R(['brawler', 'mortar', 'mortar'], 3), R(['brawler', 'aegis', 'mortar', 'lancer'], 2), R(['brawler', 'lancer', 'mortar'], 2), R(['brawler', 'seeker', 'mortar'], 1)] },
  noSeeker: { ...YOU, name: 'No Seekers', loadout: ['brawler', 'gunner', 'mortar', 'lancer', 'aegis'], focus: ['gunner', 'brawler'], third: 'mortar',
    formations: [R(['brawler', 'gunner', 'mortar'], 3), R(['brawler', 'gunner', 'gunner'], 3), R(['brawler', 'gunner', 'lancer'], 2), R(['gunner', 'gunner', 'mortar'], 1)] },
  economist: { ...YOU, name: 'Economist (Reactor and upgrades first)', reactor3: { energy: 0, eta: 20, early: 0, always: true }, reserve: 60,
    upgradeTo: 5, thirdTo: 5, pushLevel: 5, pushAfter: 360 },
  horde: { ...YOU, name: 'Horde (a unit in every lane)', save: 'whole', line: ['gunner', 'seeker', 'seeker', 'seeker', 'gunner'], lineShare: 0.6 },
};
// the settings shown in the dev match dialog (the rest via profile text, later)
export const BOT_SETTINGS = {
  pushLine: { label: 'Howitzer push at line %', type: 'number', min: 30, max: 90 },
  save: { label: 'Formations', type: 'select', options: { surge: 'With the Surge', whole: 'Whole formation', queue: 'Tap and queue' } },
  upgradeTo: { label: 'Focus types up to level', type: 'number', min: 1, max: MAX_UNIT_LEVEL },
  howitzers: { label: 'Howitzers', type: 'bool' },
  aegis: { label: 'Aegis in lane 3', type: 'bool' },
};
export function botProfile(name = 'you', over = {}) { return { ...(PROFILES[name] || YOU), ...over, profile: PROFILES[name] ? name : 'you' }; }

const ARTY = (t) => MECHS[t]?.role === 'artillery';
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const short = { scout: 'SC', gunner: 'GU', brawler: 'BW', mortar: 'MO', aegis: 'AE', seeker: 'SE', breacher: 'BE', lancer: 'LA' };

export class Bot {
  constructor(w, p = botProfile(), seed = 1) {
    this.p = p;
    this.r = (seed >>> 0) || 1;
    this.t = 0;
    this.seen = {}; this.seenIds = new Set();
    this.pair = 0;          // next lane of the pair (index into p.lanes)
    this.plan = null;       // formation being saved for
    this.phase = 'opening';
    this.thought = 'opening';
    this.pushed = false;    // Howitzers ordered: no more upgrades
    this.last = '';
    this.avail = new Set(w.unlocked.mechs);
  }
  rnd() { this.r = (this.r * 1664525 + 1013904223) >>> 0; return this.r / 4294967296; }
  pick(list) { // [[item, weight]]
    let k = this.rnd() * list.reduce((a, [, n]) => a + n, 0);
    for (const [x, n] of list) { k -= n; if (k <= 0) return x; }
    return list[list.length - 1][0];
  }
  // call after every world step; thinks every THINK s
  tick(w) {
    if (w.result) return;
    this.t -= 1 / 60;
    if (this.t > 0) return;
    this.t = THINK;
    this.look(w);
    this.think(w);
  }
  // what the player can see: enemy units on the field (types counted once each)
  look(w) {
    const en = [], own = [], ownTur = [], enTur = [];
    for (const e of w.entities) {
      if (e.dead) continue;
      if (e.team === 1 && e.kind === 'mech') { en.push(e); if (!this.seenIds.has(e.id)) { this.seenIds.add(e.id); this.seen[e.type] = (this.seen[e.type] || 0) + 1; } }
      else if (e.team === 0 && e.kind === 'mech') own.push(e);
      else if (e.team === 0 && e.kind === 'turret') ownTur.push(e);
      else if (e.team === 1 && e.kind === 'turret') enTur.push(e);
    }
    const tot = Object.values(this.seen).reduce((a, b) => a + b, 0) || 1, sh = (...ts) => ts.reduce((a, t) => a + (this.seen[t] || 0), 0) / tot;
    this.mix = { swarm: sh('scout', 'gunner'), arty: sh('lancer', 'mortar'), lancer: sh('lancer'), tanky: sh('brawler', 'aegis'), breach: sh('breacher') };
    // threats: enemy mechs near the base or a turret; a few Scouts alone don't count
    const near = (e) => e.y - BASE_FACE[0] < this.p.pressure || ownTur.some((t) => Math.hypot(t.x - e.x, t.y - e.y) < 350);
    let threats = en.filter(near);
    if (threats.length <= this.p.ignoreScouts && threats.every((e) => e.type === 'scout')) threats = [];
    let eta = Infinity;
    for (const e of en) eta = Math.min(eta, (e.y - BASE_FACE[0]) / MECHS[e.type].speed);
    Object.assign(this, { en, own, ownTur, enTur, threats, eta });
  }
  say(s) { this.thought = s; }

  think(w) {
    const p = this.p, time = w.time;
    // queue: pay it with the Surge (the user taps a formation, then surges: rows 68–81)
    if (w.queue.length && w.canSpecial('surge') && !w.canDeploy(w.queue[0].type) && w.energy + SPECIALS.surge.amount >= MECHS[w.queue[0].type].cost) w.special('surge');
    this.specials(w);
    // opening: Reactor ×2
    if (time < 30 && w.baseLvl.reactor < p.reactorOpen) {
      if (w.upgradeBase('reactor')) this.say(`opening: Reactor ${w.baseLvl.reactor}`); else this.say('opening: saving for the Reactor');
      if (!this.threats.length) return;
    }
    if (this.threats.length) { this.phase = 'pressure'; this.defend(w); return; }
    this.phase = this.pushed ? 'push' : this.eta > p.calmEta ? 'calm' : 'middle';
    if (this.push(w)) return;
    if (this.turtle(w)) return;
    if (this.upgrade(w)) return;
    this.formation(w);
  }

  // ---------- pressure ----------
  defend(w) {
    const p = this.p;
    const first = this.threats.reduce((a, b) => (a.y < b.y ? a : b));
    let lane = Math.max(0, first.lane), fromInside = false;
    if (lane === 0 || lane === LANES - 1) {
      const there = this.threats.filter((e) => e.lane === lane), heavy = there.reduce((a, e) => a + MECHS[e.type].cost, 0);
      // Breachers go for structures (×4): they get a direct answer in their lane (row 87: the base lost 31% without)
      if (heavy < p.outerHeavy && !there.some((e) => e.type === 'breacher')) { lane = lane === 0 ? 1 : LANES - 2; fromInside = true; }
    }
    // how much is already answering: own mechs near the threat in lanes ±1
    const val = (list) => list.reduce((a, e) => a + MECHS[e.type].cost * (e.hp / e.maxHp), 0);
    const foes = this.threats.filter((e) => Math.abs(e.lane - lane) <= 1), mine = this.own.filter((e) => Math.abs(e.lane - lane) <= 1 && e.y < first.y + 500);
    const queued = w.queue.filter((q) => Math.abs(q.lane - lane) <= 1).reduce((a, q) => a + MECHS[q.type].cost, 0);
    if (val(mine) + queued >= 1.2 * val(foes)) { this.say(`pressure L${lane + 1}: holding (${foes.length} enemies)`); return; }
    // the answer by what's coming (rule 3 and rows 81/84): swarms → Gunners, Breachers/tanks → Brawler + Seekers
    const cheap = foes.filter((e) => e.type === 'scout' || e.type === 'gunner').length / (foes.length || 1);
    const hasTank = this.own.some((e) => e.lane === lane && e.type === 'brawler' && e.y < first.y);
    const want = fromInside ? (cheap > 0.6 ? ['gunner', 'seeker'] : ['seeker', 'gunner']) // reaching over into the outer lane: ranged only
      : cheap > 0.6 ? ['gunner', 'gunner', 'brawler'] : !hasTank ? ['brawler', 'seeker', 'gunner'] : ['seeker', 'gunner', 'brawler'];
    const type = want.find((t) => this.avail.has(t) && w.canDeploy(t)) || want.find((t) => this.avail.has(t));
    if (!type || w.queue.length >= 3) { this.say(`pressure L${lane + 1}: waiting for energy`); return; }
    const turret = w.forwardTurret(lane), fwd = !!turret && first.y > turret.y && w.laneFwd(lane);
    w.request(type, lane, fwd);
    if (w.energy < 60 && w.canSpecial('surge')) w.special('surge');
    this.say(`pressure L${first.lane + 1}: ${short[type]}${fromInside ? ` from L${lane + 1}` : ''} against ${foes.length} (${foes.map((e) => short[e.type]).slice(0, 4).join(' ')})`);
  }

  // ---------- upgrades ----------
  focusTypes() {
    if (this.p.focus) {
      const third = this.p.third && this.avail.has(this.p.third) ? [this.p.third] : [];
      return [...this.p.focus.filter((t) => this.avail.has(t)), ...third];
    }
    const m = this.mix, line = m.swarm > 0.55 && this.avail.has('gunner') ? 'gunner' : this.avail.has('seeker') ? 'seeker' : 'gunner';
    // against Lancers the tank first (row 83: "draw LA and SE fire longer"), else the line type first
    const two = m.lancer > 0.15 ? ['brawler', line] : [line, 'brawler'];
    const third = this.p.third || (this.avail.has('mortar') ? 'mortar' : this.avail.has('lancer') ? 'lancer' : null);
    return [...two.filter((t) => this.avail.has(t)), ...(third && this.avail.has(third) ? [third] : [])];
  }
  upgrade(w) {
    const p = this.p;
    if (this.pushed) return false;
    const calm = this.eta > p.calmEta, window = this.eta > p.windowEta;
    if (!window) return false;
    // Reactor 3: rich and calm, or early against a defensive enemy (row 82)
    if (w.baseLvl.reactor < 3 && w.baseUpgradeCost('reactor') != null) {
      const defensive = (this.mix.tanky > 0.4 || p.reactor3.always) && w.time > p.reactor3.early;
      if ((w.energy >= p.reactor3.energy && this.eta > p.reactor3.eta) || (defensive && calm && w.energy >= w.baseUpgradeCost('reactor') + 100)) {
        if (w.upgradeBase('reactor')) { this.say(`${this.phase}: Reactor 3${defensive ? ' (a long battle ahead)' : ''}`); return true; }
      }
    }
    const [a, b, c] = this.focusTypes();
    const lv = (t) => w.lvl[0][t];
    // the lower of the two focus types first, then the third type
    let type = null;
    const two = [a, b].filter(Boolean).filter((t) => lv(t) < p.upgradeTo).sort((x, y) => lv(x) - lv(y));
    if (two.length) type = two[0]; else if (c && lv(c) < p.thirdTo) type = c;
    if (!type) return false;
    const cost = w.unitUpgradeCost(type);
    if (cost == null) return false;
    const keep = calm ? 60 : p.reserve; // in the middle phase a reserve for one defensive answer
    if (w.energy - cost < keep) return false; // not yet: formations go on, the upgrade comes when energy piles up
    if (w.upgradeUnit(type)) { this.say(`${this.phase}: upgrade ${short[type]} → ${lv(type)} (enemy ${Math.round(this.eta)} s away)`); return true; }
    return false;
  }

  // ---------- formations ----------
  chooseFormation() {
    const p = this.p, m = this.mix;
    let list = p.formations.map(([f, n]) => {
      let k = n;
      if (m.swarm > 0.55) k *= f.includes('gunner') ? 2.5 : 0.6;
      if (m.arty > 0.3 || m.tanky > 0.4) k *= f.filter((t) => t === 'seeker').length >= 2 || f.includes('mortar') ? 1.8 : 0.8;
      return [f, k];
    });
    list = list.map(([f, k]) => [f.filter((t) => this.avail.has(t)), k]).filter(([f]) => f.length >= 2);
    return list.length ? this.pick(list) : [...this.avail].slice(0, 3);
  }
  formation(w) {
    const p = this.p;
    if (w.queue.length >= 2) { this.say(`${this.phase}: queue ${w.queue.map((q) => short[q.type]).join('-')}`); return; }
    if (!this.plan) {
      const units = this.chooseFormation();
      let lane = p.lanes[this.pair % p.lanes.length] - 1;
      // a push through the middle: the whole train into lane 3 (user, 2026-11-20)
      const mid = this.en.filter((e) => e.y < 1300 && e.lane >= 1 && e.lane <= 3).length, outer = this.en.filter((e) => e.y < 1300 && (e.lane === 0 || e.lane === 4)).length;
      if (mid >= 4 && outer <= 1 && this.rnd() < 0.35) lane = 2;
      // the push: lanes 1 and 5 too, once the enemy base is hurt (rows 80, 83)
      const eb = w.bases[1].hp / w.bases[1].maxHp;
      if (this.pushed && eb * 100 < p.outerAt && this.rnd() < 0.3) lane = this.rnd() < 0.5 ? 0 : 4;
      // an Aegis in lane 3 once a front line forms (rows 76, 82)
      const aegisOut = this.own.some((e) => e.type === 'aegis' && e.lane === p.aegisLane - 1);
      const line = p.line && p.line.filter((t) => this.avail.has(t)).length === p.line.length ? p.line : null;
      if (p.aegis && this.avail.has('aegis') && !aegisOut && this.own.length >= 6 && this.rnd() < 0.15) { this.plan = { units: ['aegis'], lane: p.aegisLane - 1 }; }
      else if (line && this.rnd() < (p.lineShare || 0)) this.plan = { units: line, lanes: line.map((_, k) => k), lane: 2 };
      else this.plan = { units, lane };
    }
    const cost = this.plan.units.reduce((a, t) => a + MECHS[t].cost, 0);
    const surge = w.canSpecial('surge') ? SPECIALS.surge.amount : 0;
    const need = p.save === 'queue' ? MECHS[this.plan.units[0]].cost : p.save === 'whole' ? cost : Math.min(cost - surge, cost * 0.8);
    const name = this.plan.units.map((t) => short[t]).join('-');
    if (w.energy < Math.min(need, w.maxEnergy - 10)) { this.say(`${this.phase}: saving for ${name} ${this.plan.lanes ? 'across all lanes' : `in L${this.plan.lane + 1}`} (${Math.round(w.energy)}/${Math.round(need)})`); return; }
    this.plan.units.forEach((t, k) => w.request(t, this.plan.lanes ? this.plan.lanes[k] : this.plan.lane));
    this.say(`${this.phase}: ${name} ${this.plan.lanes ? 'across all lanes' : `in L${this.plan.lane + 1}${w.laneFwd(this.plan.lane) ? ' (forward)' : ''}`}`);
    if (this.plan.units.length > 1 || this.plan.units[0] !== 'aegis') this.pair++;
    this.plan = null;
  }

  // ---------- an early turret plan (turtle) ----------
  turtle(w) {
    const p = this.p;
    if (!p.turrets || w.time < 40) return false;
    for (const [type, l, r] of p.turrets) {
      const lane = l - 1, row = r - 1;
      if (!w.unlocked.turrets.includes(type) || w.cells[0][lane][row] || w.orderAt(lane, row)) continue;
      if (w.energy < TURRETS[type].cost + 60) { this.say(`${this.phase}: saving for a ${TURRETS[type].name} in L${l} row ${r}`); return true; }
      if (w.order(lane, row, type)) { this.say(`${this.phase}: ${TURRETS[type].name} in L${l} row ${r}`); return true; }
    }
    return false;
  }

  // ---------- the push: Howitzers ----------
  push(w) {
    const p = this.p;
    if (!p.howitzers || !w.unlocked.turrets.includes('howitzer')) return false;
    const line = Math.round(100 * (w.frontShare ?? 0.5));
    const pushRow = ROWS - 1;
    const free = (lane, row) => !w.cells[0][lane][row] && !w.orderAt(lane, row);
    const room = (lane, row) => !this.en.some((e) => Math.hypot(e.x - laneX(lane), e.y - cellY(0, row)) < p.pushRoom);
    let row = null;
    const ready = w.time >= p.pushAfter && this.focusTypes().slice(0, 2).every((t) => w.lvl[0][t] >= Math.min(p.pushLevel, p.upgradeTo));
    if (!this.pushed && !ready && w.time <= p.anchorAt) return false;
    if (line >= p.pushLine && (ready || this.pushed)) row = pushRow;
    else if (!this.pushed && w.time > p.anchorAt) row = p.anchorRow - 1; // the anchor (row 84)
    if (row == null && !this.pushed) return false;
    if (row == null) row = pushRow;
    const lanes = p.howitzerLanes.map((l) => l - 1).filter((l) => free(l, row) && !w.cells[0][l].some((t) => t && !t.dead && t.type === 'howitzer' && t.row >= row));
    // Sentries on the outer lanes against swarms (row 81)
    const sentries = p.swarmSentries && this.mix.swarm > 0.55 && this.pushed && w.unlocked.turrets.includes('sentry') ? [0, 4].filter((l) => free(l, row) && !w.forwardTurret(l)) : [];
    const lane = lanes.find((l) => room(l, row));
    if (lane != null) {
      if (w.energy < TURRETS.howitzer.cost + 40) { this.say(`push (line ${line}%): saving for a Howitzer in L${lane + 1}`); return true; }
      if (w.order(lane, row, 'howitzer')) { this.pushed = true; this.say(`push (line ${line}%): Howitzer L${lane + 1} row ${row + 1}`); return true; }
    } else if (sentries.length && w.energy >= TURRETS.sentry.cost + 150) {
      const l = sentries[0];
      if (room(l, row) && w.order(l, row, 'sentry')) { this.say(`push: Sentry L${l + 1} against the swarm`); return true; }
    }
    return false;
  }

  // ---------- specials ----------
  specials(w) {
    const p = this.p;
    // Bombing by value: artillery counts double, enemy Howitzers too; aim a little ahead of moving mechs
    if (w.canSpecial('bomb')) {
      const val = (e) => (e.kind === 'turret' ? (e.type === 'howitzer' ? 2 * TURRETS.howitzer.cost : 0) : MECHS[e.type].cost * (ARTY(e.type) ? 2 : 1));
      const targets = [...this.en, ...this.enTur];
      let best = null, bv = 0;
      for (const e of targets) {
        const ax = e.x, ay = e.kind === 'mech' && !e.pause ? e.y - 25 : e.y;
        const v = targets.reduce((a, f) => a + (Math.hypot(f.x - ax, f.y - ay) < 85 ? val(f) * (0.6 + 0.4 * (f.hp / f.maxHp)) : 0), 0);
        if (v > bv) { bv = v; best = [ax, ay, e]; }
      }
      if (best && bv >= p.bomb) { w.special('bomb', best[0], best[1]); this.say(`Bombing on ${short[best[2].type] || best[2].type} (value ${Math.round(bv)})`); }
    }
    // EMP: mostly offensive (rows 68–84: median 2 own mechs deep, no enemy near the base)
    if (w.canSpecial('emp')) {
      const deep = this.own.filter((e) => e.y > 1400 && this.en.concat(this.enTur).some((f) => Math.hypot(f.x - e.x, f.y - e.y) < 300));
      if (deep.length >= p.emp || this.threats.length >= 4) { w.special('emp'); this.say(deep.length >= p.emp ? `EMP for the push (${deep.length} deep)` : 'EMP under pressure'); }
    }
  }
}
