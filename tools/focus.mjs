// Focus types (ISSUES.md 2026-11-19): how often the enemy deploys its focus types (FT) compared with its other unit
// types, per stage, from many simulated deploy choices (no battle: orders drawn at times spread over 10 minutes, a share
// of them under pressure). Factor = average deploys per FT ÷ average deploys per other type in the loadout.
// Run: node tools/focus.mjs [target=3] [pressure share=0.25]   (target: the battle's drawn factor, AI.focus.range)
import { World } from '../src/world.js';
import { defaultSave } from '../src/save.js';
import { STAGES, MECH_TYPES, stageDef, randomLoadout, RANDOM_PERSONALITIES, PERSONALITIES } from '../src/data.js';

const ALL = { mechs: MECH_TYPES, turrets: [], specials: [] };

export function focusFactor(stage, { target = 3, pressure = 0.25, orders = 6000, seed = 1 } = {}) {
  const w = new World({ ...stage, focusX: target }, defaultSave(), ALL, { seed });
  const n = {};
  for (let i = 0; i < orders; i++) {
    w.time = (i * 7) % 600;
    const o = w.aiOrder(i % Math.round(1 / pressure) === 0 ? 800 : 0, [0, 0, 800, 0, 0]);
    for (const t of o.groups.flat()) n[t] = (n[t] || 0) + 1;
  }
  const ft = w.focus, others = stage.roster.filter((t) => !ft.includes(t));
  const avg = (ts) => ts.reduce((a, t) => a + (n[t] || 0), 0) / (ts.length || 1);
  const tot = Object.values(n).reduce((a, b) => a + b, 0);
  return { factor: ft.length ? avg(ft) / Math.max(1e-9, avg(others)) : NaN, ft, share: Object.fromEntries(stage.roster.map((t) => [t, Math.round(100 * (n[t] || 0) / tot)])) };
}

function main() {
  const target = +(process.argv[2] || 3), pressure = +(process.argv[3] || 0.25);
  console.log(`target ×${target}, ${Math.round(pressure * 100)}% of orders under pressure`);
  const rows = [];
  for (let i = 0; i < STAGES.length; i++) {
    const st = stageDef(i), r = focusFactor(st, { target, pressure });
    rows.push(r.factor);
    console.log(`${String(i + 1).padStart(2)} ${st.name.padEnd(13)} ${PERSONALITIES[st.personality].name.padEnd(15)} FT ${r.ft.join('+').padEnd(16)} ×${r.factor.toFixed(1)}  ${Object.entries(r.share).map(([t, p]) => `${t} ${p}%`).join(', ')}`);
  }
  let k = 7; const rnd = () => ((k = (k * 9301 + 49297) % 233280) / 233280);
  for (const p of RANDOM_PERSONALITIES) {
    const roster = randomLoadout(rnd, MECH_TYPES, p);
    const r = focusFactor({ ...stageDef(12), personality: p, roster }, { target, pressure });
    console.log(`   random ${PERSONALITIES[p].name.padEnd(15)} FT ${r.ft.join('+').padEnd(16)} ×${r.factor.toFixed(1)}  ${Object.entries(r.share).map(([t, q]) => `${t} ${q}%`).join(', ')}`);
  }
  const s = [...rows].sort((a, b) => a - b);
  console.log(`campaign: median ×${s[s.length >> 1].toFixed(1)}, range ×${s[0].toFixed(1)}–×${s[s.length - 1].toFixed(1)}`);
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) main();
