// Play-test notes (functions/api/notes.js) with the battle each one belongs to.
// Run: node tools/notes.mjs <notes.json> <stats.json>   (GET /api/notes and GET /api/stats answers)
// Each note: when, which battle (stats row, stage, result), the moment (m:ss, mode battle/replay) and the text.
// Then look at that moment: node tools/replay.mjs <stats.json> <row> --at m:ss
import { readFileSync } from 'node:fs';

const [nf, sf] = process.argv.slice(2);
if (!nf || !sf) { console.log('usage: node tools/notes.mjs <notes.json> <stats.json>'); process.exit(0); }
const notes = JSON.parse(readFileSync(nf, 'utf8')).rows, rows = JSON.parse(readFileSync(sf, 'utf8')).rows;
const mmss = (t) => { t = Math.floor(t); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
for (const n of notes) {
  const r = rows.find((x) => x.id === n.battle);
  const where = r ? `row ${r.row}, stage ${r.stage} ${r.stageName} (${r.result})` : `battle ${n.battle} (no stats row yet)`;
  console.log(`#${n.id} ${n.created} · ${where} · ${n.mode} at ${mmss(n.time)} (step ${n.step})\n   ${n.text.replace(/\n/g, '\n   ')}`);
}
