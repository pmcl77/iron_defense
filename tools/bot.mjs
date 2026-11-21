// Bot 2.0 runs (src/bot.js): the bot plays the setups of the user's matches (seed, enemy, map, loadout) and the result
// is compared with the user's. Usage:
//   node tools/bot.mjs <stats.json> [rows…] [--runs 5] [--profile you] [--set key=value …] [--export file] [--log]
//     stats.json: a GET /api/stats answer or { rows: [...] }; rows: row numbers (default: every quick match with a replay)
//     --runs n      bot runs per setup (each with its own bot seed; the battle seed stays the user's)
//     --set k=v     override a profile value, e.g. --set pushLine=60 --set save=whole
//     --export f    write the first run of the first row as a replay file (Replays → Open file, dev builds)
//     --log         print the bot's thoughts when they change (first run of each row)
// Time limit 30 min (ISSUES.md: matches of the user run up to 15 min); a run that hits it is a timeout, not a loss.
import { readFileSync, writeFileSync } from 'node:fs';
import { World } from '../src/world.js';
import { defaultSave } from '../src/save.js';
import { Bot, botProfile } from '../src/bot.js';

export const MAX_T = 1800;
const STEP = 1 / 60;

// one bot match on a setup ({ seed, stage, unlocked, dev }); returns the world and the bot
export function botMatch(setup, profile, botSeed = 1, onThought = null) {
  if (profile.loadout) setup = { ...setup, unlocked: { ...setup.unlocked, mechs: profile.loadout } }; // a profile with its own loadout
  const w = new World(JSON.parse(JSON.stringify(setup.stage)), defaultSave(), setup.unlocked, { seed: setup.seed, dev: setup.dev });
  w.setup = JSON.parse(JSON.stringify({ ...setup, rules: w.rules, bot: profile })); // today's rules, also on older setups
  const bot = new Bot(w, profile, botSeed);
  let said = '';
  while (!w.result && w.time < MAX_T) {
    w.update(STEP); w.fx.length = 0;
    bot.tick(w);
    const gist = bot.thought.replace(/\(\d+\/\d+\)|\d+ s away/g, ''); // numbers that count up don't make a new line
    if (onThought && gist !== said) { said = gist; onThought(w.time, bot.thought); }
  }
  return { w, bot };
}

const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`;
const lineAt = (front, s) => { const f = (front || []).filter((x) => x[0] <= s).pop(); return f ? f[1] : '-'; };
const firstUp = (ups, type, lvl) => { const u = ups.filter(([, k]) => k === type); return u[lvl - 1] ? mmss(u[lvl - 1][0]) : '-'; };
const howT = (events) => { const e = events.find((x) => x[1] === 'turret' && x[2] === 1); return e ? mmss(e[0]) : '-'; };
const mix = (events) => {
  const c = {}; let n = 0;
  for (const e of events) if (e[1] === 'deploy' && e[2] === 1) { c[e[3]] = (c[e[3]] || 0) + 1; n++; }
  return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([t, k]) => `${t.slice(0, 2).toUpperCase()}${Math.round(100 * k / n)}`).join(' ');
};
// one comparable line from a stats row or a finished world
function sumRow(r) {
  return { res: r.result, time: r.time, line: [180, 360, 540].map((s) => lineAt(r.front, s)), se3: firstUp(r.upgrades, 'seeker', 3), bw3: firstUp(r.upgrades, 'brawler', 3),
    how: howT(r.events), base: r.baseHp.player, mix: mix(r.events), deployed: r.deployed };
}
function sumWorld(w) {
  const pct = (b) => Math.round(100 * Math.max(0, b.hp) / b.maxHp);
  return sumRow({ result: w.result || 'timeout', time: Math.round(w.time), front: [...w.log.front, w.frontSample(false)], upgrades: w.log.upgrades, events: w.log.events,
    baseHp: { player: pct(w.bases[0]) }, deployed: w.stats.deployed });
}
const show = (who, s) => `  ${who.padEnd(8)} ${String(s.res).padEnd(7)} ${mmss(s.time).padStart(6)}  line 3/6/9 min ${s.line.map((x) => String(x).padStart(3)).join(' ')}  SE3 ${s.se3.padStart(5)} BW3 ${s.bw3.padStart(5)}  Howitzer ${s.how.padStart(5)}  base ${String(s.base).padStart(3)}%  ${s.deployed} units: ${s.mix}`;

function main() {
  const args = process.argv.slice(2), opt = { runs: 5, profile: 'you', set: {}, export: null, log: false }, rows = [];
  let file = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--runs') opt.runs = +args[++i];
    else if (a === '--profile') opt.profile = args[++i];
    else if (a === '--set') { const [k, v] = args[++i].split('='); opt.set[k] = v === 'true' ? true : v === 'false' ? false : isNaN(+v) ? v : +v; }
    else if (a === '--export') opt.export = args[++i];
    else if (a === '--log') opt.log = true;
    else if (!file) file = a; else rows.push(+a);
  }
  if (!file) { console.log('usage: node tools/bot.mjs <stats.json> [rows…] [--runs n] [--profile name] [--set k=v] [--export file] [--log]'); return; }
  const data = JSON.parse(readFileSync(file, 'utf8')).rows;
  const pick = data.filter((r) => r.replay && r.mode === 'quick' && (!rows.length || rows.includes(r.row)));
  const profile = botProfile(opt.profile, opt.set);
  console.log(`bot profile ${profile.profile} (${profile.name})${Object.keys(opt.set).length ? ' ' + JSON.stringify(opt.set) : ''}, ${opt.runs} runs per setup\n`);
  let wins = 0, n = 0, timeSum = 0, userSum = 0;
  for (const r of pick) {
    const q = r.quick || {};
    console.log(`row ${r.row}: ${q.difficulty} L${r.enemyStage?.lvl} ${r.personality}, turrets of stage ${q.turretStage}, seed ${q.seed}`);
    console.log(show('you', sumRow(r)));
    for (let k = 0; k < opt.runs; k++) {
      const log = opt.log && k === 0 ? (t, s) => console.log(`      ${mmss(t)} ${s}`) : null;
      const { w } = botMatch(r.replay, profile, k + 1, log);
      const s = sumWorld(w);
      console.log(show(`bot #${k + 1}`, s));
      n++; if (w.result === 'win') { wins++; timeSum += w.time; }
      if (opt.export && k === 0 && pick.indexOf(r) === 0) {
        writeFileSync(opt.export, JSON.stringify({ id: `bot-${r.row}`, title: `Bot (${profile.profile}) on row ${r.row}: ${s.res}, ${mmss(w.time)}`, replay: { ...w.setup, steps: w.step, inputs: w.inputs } }));
        console.log(`      replay written to ${opt.export}`);
      }
    }
    if (r.result === 'win') userSum += r.time;
    console.log('');
  }
  console.log(`bot: ${wins}/${n} wins, average winning time ${wins ? mmss(timeSum / wins) : '-'}; you: ${pick.filter((r) => r.result === 'win').length}/${pick.length} wins, average ${mmss(userSum / Math.max(1, pick.filter((r) => r.result === 'win').length))}`);
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) main();
