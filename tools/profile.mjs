// Strategy profile of a battle (ISSUES.md 2026-11-18 "Context for stats"): what the player chose (loadout, deploy
// strategy, spending) and what kind of game came out of it, computed from a battle summary (the format main.js sends,
// see functions/api/stats.js). No game change needed: all player inputs are in the events.
// Run: node tools/profile.mjs <stats.json> [first row]   (the JSON from GET /api/stats, or an array of summaries)
import fs from 'fs';
import { MECHS, TURRETS } from '../src/data.js';

const TANK_WINDOW = 15; // s: a deploy counts as tank-led if an own Tank was deployed in the same lane this long before
const BURST_GAP = 4; // s: deploys closer than this belong to the same group
const median = (xs) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const sumDmg = (o) => Object.values(o || {}).reduce((a, v) => a + v[0] + v[1] + v[2] + v[3], 0);

// a battle summary from a World (for bot runs), same shape as main.js's summary (only the fields profile() reads)
export function summaryOf(w, loadout) {
  const duo = ([p, e]) => ({ player: p, enemy: e });
  return { result: w.result || 'timeout', time: w.time, loadout, events: w.log.events, dmg: duo(w.log.dmg), life: duo(w.lifeLog()),
    baseHp: Math.round(100 * w.bases[0].hp / w.bases[0].maxHp), enemyHp: Math.round(100 * w.bases[1].hp / w.bases[1].maxHp) };
}

export function profile(s) {
  const ev = s.events || [];
  const dep = ev.filter((e) => e[1] === 'deploy' && e[2] === 1); // [t, 'deploy', 1, type, level, lane, fwdRow?]
  const role = (t) => MECHS[t]?.role;
  const spent = { mechs: 0, turrets: 0, upgrades: 0 }, byRole = {};
  for (const e of dep) { const c = MECHS[e[3]]?.cost || 0; spent.mechs += c; byRole[role(e[3])] = (byRole[role(e[3])] || 0) + c; }
  for (const e of ev) if (e[1] === 'turret' && e[2] === 1 && e[0] > 0) spent.turrets += TURRETS[e[3]]?.cost || 0;
  const followers = dep.filter((e) => role(e[3]) !== 'tank');
  const led = followers.filter((e) => dep.some((b) => role(b[3]) === 'tank' && b[5] === e[5] && b[0] <= e[0] && e[0] - b[0] <= TANK_WINDOW));
  const lanes = [0, 0, 0, 0, 0]; for (const e of dep) lanes[e[5] - 1]++;
  const groups = []; let g = 0, last = -1e9;
  for (const e of dep) { if (e[0] - last > BURST_GAP) { if (g) groups.push(g); g = 0; } g++; last = e[0]; }
  if (g) groups.push(g);
  // kind of game: where mechs die (progress = % of the way from their own base), turret losses, damage by role
  const deaths = (side) => ev.filter((e) => e[1] === 'death' && e[2] === side && MECHS[e[3]]).map((e) => e[5]);
  const turretsLost = (side) => ev.filter((e) => e[1] === 'death' && e[2] === side && TURRETS[e[3]]).length;
  const dmgRole = {}, pd = s.dmg?.player || {};
  const total = sumDmg(pd);
  for (const [t, v] of Object.entries(pd)) { const r = role(t) || (TURRETS[t] ? 'turrets' : t); dmgRole[r] = (dmgRole[r] || 0) + (v[0] + v[1] + v[2] + v[3]) / (total || 1); }
  const life = {};
  for (const [t, v] of Object.entries(s.life?.player || {})) if (v[0]) life[t] = v[1] / v[0];
  const n = dep.length || 1, pct = (x) => Math.round(100 * x);
  return {
    result: s.result, minutes: +(s.time / 60).toFixed(1), loadout: s.loadout,
    deploys: dep.length, perMin: +(dep.length / Math.max(1, s.time / 60)).toFixed(1),
    roleEnergy: Object.fromEntries(Object.entries(byRole).map(([r, c]) => [r, pct(c / (spent.mechs || 1))])), // % of mech energy
    tankLed: pct(led.length / (followers.length || 1)), // % of non-tank deploys with a fresh tank ahead in the lane
    lanes: lanes.map((c) => pct(c / n)), mainLanes: lanes.filter((c) => c / n >= 0.15).length,
    forward: pct(dep.filter((e) => e[6] != null).length / n),
    groupSize: +(dep.length / (groups.length || 1)).toFixed(1), // mechs per group (1 = trickle)
    turretEnergy: spent.turrets, specials: ev.filter((e) => e[1] === 'special').length,
    upgrades: ev.filter((e) => e[1] === 'upgrade').length,
    // kind of game
    playerDeathAt: Math.round(median(deaths(1))), enemyDeathAt: Math.round(median(deaths(0))), // median progress %
    turretsLost: [turretsLost(1), turretsLost(0)], // [player's, enemy's]
    dmgRole: Object.fromEntries(Object.entries(dmgRole).map(([r, x]) => [r, pct(x)]).filter(([, x]) => x > 0).sort((a, b) => b[1] - a[1])),
    life: Object.fromEntries(Object.entries(life).map(([t, x]) => [t, Math.round(x)])), // mean combat seconds of the dead
  };
}

export function printProfile(label, p) {
  const o = (x) => Object.entries(x).map(([k, v]) => `${k} ${v}`).join(', ');
  console.log(`${label}: ${p.result} ${p.minutes} min | loadout ${(p.loadout || []).join(' ')}`);
  console.log(`  choices: ${p.deploys} deploys (${p.perMin}/min), energy by role ${o(p.roleEnergy)}; tank-led ${p.tankLed}%, lanes ${p.lanes.join('/')}% (${p.mainLanes} main), forward ${p.forward}%, group ${p.groupSize}, turrets ${p.turretEnergy} E, specials ${p.specials}, upgrades ${p.upgrades}`);
  console.log(`  game: deaths at ${p.playerDeathAt}% (ours) / ${p.enemyDeathAt}% (enemy) of the way, turrets lost ${p.turretsLost[0]}/${p.turretsLost[1]}, damage by role ${o(p.dmgRole)}, combat life ${o(p.life) || '-'}`);
}

function main() {
  const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const from = +(process.argv[3] || 0);
  for (const s of (d.rows || d).filter((r) => (r.row ?? 0) >= from && r.events)) printProfile(`row ${s.row} stage ${s.stage}`, profile(s));
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) main();
