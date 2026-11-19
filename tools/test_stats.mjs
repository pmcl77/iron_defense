// Tests for functions/api/stats.js against a real SQLite database (node:sqlite) wrapped to look like D1.
// Run: node tools/test_stats.mjs
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost, onRequestGet } from '../functions/api/stats.js';
import * as notes from '../functions/api/notes.js';

function d1(setup) {
  const db = new DatabaseSync(':memory:');
  if (setup) db.exec(setup);
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
ok((await post({ ...battle, pad: 'x'.repeat(1100000) })).status === 413, 'oversized body rejected');
ok((await onRequestPost({ env: {}, request: new Request('https://x', { method: 'POST', body: '{}' }) })).status === 503, 'missing binding → 503');

ok((await get('')).status === 403, 'read without key forbidden');
ok((await get('?key=wrong')).status === 403, 'wrong key forbidden');
const r = await get('?key=secret-key');
ok(r.status === 200, 'read with key');
const data = await r.json();
ok(data.rows.length === 2 && data.rows[0].stageName === 'Dust Belt' && data.rows[0].mechs[1].scout === 9, 'rows hold the full summary');
ok(data.rows[1].duration === undefined && data.rows[1].time === 200.4, 'row data is the sent JSON');
ok(data.summary.length === 2 && data.summary.every((s) => s.n === 1 && s.stage === 3), 'summary grouped by result');
ok(data.next === data.rows[1].row && data.next === 2, 'next = last row number');
const r2 = await (await get('?since=' + data.rows[0].row, { 'x-stats-key': 'secret-key' })).json();
ok(r2.rows.length === 1 && r2.rows[0].result === 'lose', 'since + header key');

// battle ids, abandoned rounds, device and name
const ID = 'a1b2c3d4e5f60718', DEV = '0123456789abcdef';
const rows = async () => (await (await get('?key=secret-key')).json()).rows;
ok((await post({ ...battle, stage: 5, id: ID, device: DEV, result: 'abandoned', time: 120 })).status === 201, 'abandoned stored');
ok((await post({ ...battle, stage: 5, id: ID, device: DEV, result: 'abandoned', time: 150 })).status === 201, 'newer checkpoint accepted');
let s5 = (await rows()).filter((r) => r.stage === 5);
ok(s5.length === 1 && s5[0].time === 150, 'newer checkpoint replaces the older one');
await post({ ...battle, stage: 5, id: ID, device: DEV, result: 'win', time: 400 });
s5 = (await rows()).filter((r) => r.stage === 5);
ok(s5.length === 1 && s5[0].result === 'win' && s5[0].time === 400, 'real result replaces abandoned');
await post({ ...battle, stage: 5, id: ID, device: DEV, result: 'abandoned', time: 200 });
s5 = (await rows()).filter((r) => r.stage === 5);
ok(s5.length === 1 && s5[0].result === 'win', 'a real result is never replaced');
await post({ ...battle, stage: 5, id: 'ffffffffffffffff', device: DEV, result: 'lose' });
ok((await rows()).filter((r) => r.stage === 5).length === 2, 'other battle id is a new row');
ok((await post({ ...battle, id: 'XYZ' })).status === 400 && (await post({ ...battle, device: 12 })).status === 400, 'bad id or device rejected');
ok((await post({ ...battle, name: 5 })).status === 400, 'non-string name rejected');
await post({ ...battle, stage: 7, name: '  Phil\u0007ippe the very long name  ' });
const n7 = (await rows()).find((r) => r.stage === 7);
ok(n7 && n7.name === 'Philippe the very lo', 'name cleaned and cut to 20', n7 && n7.name);
await post({ ...battle, stage: 8, name: '   ' });
ok(!('name' in (await rows()).find((r) => r.stage === 8)), 'empty name dropped');
const sum = (await (await get('?key=secret-key')).json()).summary.find((s) => s.stage === 5 && s.result === 'win');
ok(sum && sum.devices === 1, 'summary counts devices');
const withId = (await rows()).find((r) => r.result === 'win' && r.stage === 5);
ok(withId.id === ID && Number.isInteger(withId.row), 'battle id and row number both kept');
const all = await (await get('?key=secret-key')).json();
ok(Number.isInteger(all.next) && all.next === all.rows[all.rows.length - 1].row, 'next is a row number even when rows have battle ids');

// a database made by the first version (no battle column) is upgraded in place
const old = { STATS_DB: d1(`CREATE TABLE battles (id INTEGER PRIMARY KEY AUTOINCREMENT, created TEXT NOT NULL DEFAULT (datetime('now')),
  version TEXT, build TEXT, stage INTEGER, result TEXT, duration INTEGER, data TEXT NOT NULL);
  INSERT INTO battles (version, build, stage, result, duration, data) VALUES ('0.4.0-dev', 'dev', 8, 'win', 550, '{"v":"0.4.0-dev","stage":8}');`), STATS_KEY: 'k' };
const { onRequestPost: p2, onRequestGet: g2 } = await import('../functions/api/stats.js?fresh');
const r3 = await p2({ env: old, request: new Request('https://x', { method: 'POST', body: JSON.stringify({ ...battle, id: ID }) }) });
const d3 = await (await g2({ env: old, request: new Request('https://x?key=k') })).json();
ok(r3.status === 201 && d3.rows.length === 2 && d3.rows[0].stage === 8, 'old table upgraded, old row kept');

ok((await post({ ...battle, stage: 20, pad: 'x'.repeat(200000) })).status === 201, 'a 200 KB battle is accepted');
// gzipped bodies (long battles stay under the 64 KB keepalive limit)
const gz = async (text) => new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
const postGz = async (bytes) => onRequestPost({ env, request: new Request('https://x/api/stats', { method: 'POST', headers: { 'x-stats-enc': 'gzip' }, body: bytes }) });
const big = { ...battle, id: 'abcdefabcdef0042', stage: 21, events: Array.from({ length: 3000 }, (_, i) => [i / 10, 'deploy', 1, 'seeker', 1 + (i % 5), 2]) };
const zipped = await gz(JSON.stringify(big));
ok(zipped.length < 60000 && JSON.stringify(big).length > 60000, 'a long battle gzips below the keepalive limit');
ok((await postGz(zipped)).status === 201, 'gzipped battle stored');
const back = (await (await get('?key=secret-key')).json()).rows.find((r) => r.id === 'abcdefabcdef0042');
ok(back && back.events.length === 3000, 'gzipped battle reads back complete');
ok((await postGz(new Uint8Array([1, 2, 3, 4]))).status === 400, 'broken gzip rejected');
ok((await postGz(await gz(JSON.stringify({ ...battle, pad: 'x'.repeat(1100000) })))).status === 413, 'gzipped body too large once unpacked rejected');
// notes (functions/api/notes.js): same database and key
{
  const nPost = (body) => notes.onRequestPost({ env, request: new Request('https://x/api/notes', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }) });
  const nGet = (q) => notes.onRequestGet({ env, request: new Request('https://x/api/notes' + q) });
  const n = { battle: '0123456789abcdef', step: 7200, time: 120, text: 'why do the SEs queue here?', mode: 'replay', v: '0.7.0-dev.7' };
  ok((await nPost(n)).status === 201, 'note stored');
  ok((await nPost({ ...n, mode: 'battle', text: 'line1\nline2\u0007' })).status === 201, 'battle note stored');
  ok((await nPost({ ...n, battle: 'xyz' })).status === 400, 'note: bad battle id rejected');
  ok((await nPost({ ...n, text: '   ' })).status === 400, 'note: empty text rejected');
  ok((await nPost({ ...n, step: -1 })).status === 400, 'note: bad step rejected');
  ok((await nPost({ ...n, mode: 'other' })).status === 400, 'note: bad mode rejected');
  ok((await nPost('x'.repeat(9000))).status === 413, 'note: oversized rejected');
  ok((await nGet('')).status === 403, 'notes: read without key forbidden');
  const nd = await (await nGet('?key=secret-key')).json();
  ok(nd.rows.length === 2 && nd.rows[0].text === n.text && nd.rows[0].step === 7200 && nd.rows[1].text === 'line1\nline2', 'notes read back (control characters removed, newlines kept)');
  const nd2 = await (await nGet('?key=secret-key&since=' + nd.rows[0].id)).json();
  ok(nd2.rows.length === 1, 'notes: since');
  ok((await get('?key=secret-key')).status === 200, 'stats still readable next to the notes table');
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
