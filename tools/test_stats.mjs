// Tests for functions/api/stats.js against a real SQLite database (node:sqlite) wrapped to look like D1.
// Run: node tools/test_stats.mjs
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost, onRequestGet } from '../functions/api/stats.js';

function d1() {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run: async () => { db.prepare(sql).run(...args); return { success: true }; },
    all: async () => ({ results: db.prepare(sql).all(...args) }),
  });
  return { prepare: (sql) => stmt(sql) };
}

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const env = { STATS_DB: d1(), STATS_KEY: 'secret-key' };
const post = (body) => onRequestPost({ env, request: new Request('https://x/api/stats', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }) });
const get = (q, headers) => onRequestGet({ env, request: new Request('https://x/api/stats' + q, { headers }) });

const battle = { v: '0.4.0-dev', build: 'dev', stage: 3, stageName: 'Dust Belt', result: 'win', stars: 2, time: 312, mechs: [{ gunner: 4 }, { scout: 9 }] };
ok((await post(battle)).status === 201, 'valid battle stored');
ok((await post({ ...battle, result: 'lose', time: 200.4 })).status === 201, 'second battle stored');
ok((await post({ ...battle, result: 'draw' })).status === 400, 'unknown result rejected');
ok((await post({ ...battle, v: '<script>' })).status === 400, 'bad version rejected');
ok((await post({ ...battle, stage: 2.5 })).status === 400, 'non-integer stage rejected');
ok((await post('not json')).status === 400, 'bad json rejected');
ok((await post('[1,2]')).status === 400, 'array rejected');
ok((await post({ ...battle, pad: 'x'.repeat(20000) })).status === 413, 'oversized body rejected');
ok((await onRequestPost({ env: {}, request: new Request('https://x', { method: 'POST', body: '{}' }) })).status === 503, 'missing binding → 503');

ok((await get('')).status === 403, 'read without key forbidden');
ok((await get('?key=wrong')).status === 403, 'wrong key forbidden');
const r = await get('?key=secret-key');
ok(r.status === 200, 'read with key');
const data = await r.json();
ok(data.rows.length === 2 && data.rows[0].stageName === 'Dust Belt' && data.rows[0].mechs[1].scout === 9, 'rows hold the full summary');
ok(data.rows[1].duration === undefined && data.rows[1].time === 200.4, 'row data is the sent JSON');
ok(data.summary.length === 2 && data.summary.every((s) => s.n === 1 && s.stage === 3), 'summary grouped by result');
ok(data.next === data.rows[1].id, 'next = last id');
const r2 = await (await get('?since=' + data.rows[0].id, { 'x-stats-key': 'secret-key' })).json();
ok(r2.rows.length === 1 && r2.rows[0].result === 'lose', 'since + header key');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
