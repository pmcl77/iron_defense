// Replays (ISSUES.md 2026-11-19 "Exact replays"): re-run a battle from its stats row (seed, setup and every player
// input with its exact simulation step, sent since 0.7.0-dev.4) and check it against what the phone recorded.
// Run: node tools/replay.mjs <stats.json> <row> [--at m:ss]
//   stats.json: the GET /api/stats answer (or a file with { rows: [...] }); row: its "row" number
//   --at m:ss   stop there and print where every unit stands (lane, distance, HP, target, waiting/strip)
import { readFileSync } from 'node:fs';
import { World } from '../src/world.js';
import { defaultSave } from '../src/save.js';
import { BASE_FACE } from '../src/data.js';

export const STEP = 1 / 60;

// a World for this replay, ready to run
export function replayWorld(rep) {
  const w = new World(JSON.parse(JSON.stringify(rep.stage)), defaultSave(), rep.unlocked, { seed: rep.seed, dev: rep.dev });
  w.replaying = true;
  return w;
}
// run until step `until` (default: the end of the recorded battle), applying the inputs on the way.
// onStep(w) after every step (optional). Returns the world.
export function runReplay(rep, { until = rep.steps, onStep = null, w = replayWorld(rep), from = 0 } = {}) {
  let k = from;
  while (w.step < until) {
    while (k < rep.inputs.length && rep.inputs[k][0] <= w.step) { const [, m, ...a] = rep.inputs[k++]; w[m](...a); }
    w.update(STEP);
    if (onStep) onStep(w);
    if (w.result && w.step >= until) break;
  }
  return w;
}
// compare the replay's timeline samples (every 30 s) and events with the recorded ones; first difference or null
export function checkReplay(row, w) {
  const rec = row.timeline || [], got = w.log.timeline;
  for (let i = 0; i < Math.min(rec.length - 1, got.length); i++) {
    if (JSON.stringify(rec[i]) !== JSON.stringify(got[i])) return { at: rec[i][0], recorded: rec[i], replay: got[i] };
  }
  const re = row.events || [], ge = w.log.events;
  for (let i = 0; i < Math.min(re.length, ge.length); i++) {
    if (JSON.stringify(re[i]) !== JSON.stringify(ge[i])) return { at: re[i][0], event: i, recorded: re[i], replay: ge[i] };
  }
  if (re.length !== ge.length) return { at: null, events: [re.length, ge.length] };
  return null;
}
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
// what stands where: one line per unit, by lane, front first
export function describe(w) {
  const out = [`${mmss(w.time)}  energy ${Math.round(w.energy)}/${w.maxEnergy}  base ${Math.round(w.bases[0].hp)} / enemy ${Math.round(w.bases[1].hp)}  queue ${w.queue.map((q) => q.type).join(' ') || '-'}`];
  const us = w.entities.filter((e) => !e.dead && (e.kind === 'mech' || e.kind === 'turret' || e.kind === 'constructor'));
  for (const team of [0, 1]) {
    out.push(team === 0 ? 'YOURS (distance from your base face)' : 'ENEMY (distance from its base face)');
    for (let l = 0; l < 5; l++) {
      const row = us.filter((e) => e.team === team && (e.kind === 'turret' ? e.lane === l : (e.lane ?? -1) === l))
        .map((e) => ({ e, d: Math.round(Math.abs(e.y - BASE_FACE[team])) })).sort((a, b) => b.d - a.d);
      if (!row.length) continue;
      out.push(`  L${l + 1}: ` + row.map(({ e, d }) => `${e.type}${e.kind === 'turret' ? '(T)' : ''}@${d}`
        + ` ${Math.round(100 * e.hp / e.maxHp)}%${e.target ? ' ⚔' + e.target.type : ''}${e.strip ? ' strip' : ''}${e.shift && !e.strip ? ' shifting' : ''}${e.kind === 'mech' && !e.moving && !e.target ? ' waiting' : ''}`).join(', '));
    }
  }
  return out.join('\n');
}

function main() {
  const [file, rowArg, ...rest] = process.argv.slice(2);
  if (!file || !rowArg) { console.log('usage: node tools/replay.mjs <stats.json> <row> [--at m:ss]'); return; }
  const rows = JSON.parse(readFileSync(file, 'utf8')).rows;
  const row = rows.find((r) => String(r.row) === rowArg);
  if (!row) { console.log(`row ${rowArg} not found`); return; }
  if (!row.replay) { console.log(`row ${rowArg} (${row.v}) has no replay data (sent since 0.7.0-dev.4)`); return; }
  const ai = rest.indexOf('--at');
  if (ai >= 0) {
    const [m, s] = rest[ai + 1].split(':').map(Number);
    const w = runReplay(row.replay, { until: Math.round((m * 60 + s) / STEP) });
    console.log(describe(w));
    return;
  }
  const t0 = Date.now(), w = runReplay(row.replay);
  const diff = checkReplay(row, w);
  console.log(`row ${row.row}: stage ${row.stage} ${row.stageName}, recorded ${row.result} at ${mmss(row.time)}; replay ${w.result || 'running'} at ${mmss(w.time)} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  console.log(diff ? `DRIFT from ${diff.at != null ? mmss(diff.at) : 'the end'}: ${JSON.stringify(diff)}` : `exact: all ${row.timeline.length - 1} timeline samples and ${row.events.length} events match`);
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) main();
