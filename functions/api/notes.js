// Cloudflare Pages Function: play-test notes (ISSUES.md "Exact replays", notes). Same database and key as the stats.
// POST /api/notes        { battle, step, time, text, mode, device?, v? } from the game (pause menu or replay bar, dev builds):
//                        a note tied to a battle (its id, as in the stats) and a moment (simulation step, time in s)
// GET  /api/notes?key=…  { rows, next }; optional since=<id>. Header "x-stats-key" works too.
// Notes go into their own table `notes` (created on first use); the battles table is not touched.
import { json, sameKey } from './stats.js';

const HEX16 = /^[0-9a-f]{16}$/;
const SCHEMA = `CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created TEXT NOT NULL DEFAULT (datetime('now')),
  battle TEXT NOT NULL, device TEXT, version TEXT, mode TEXT, step INTEGER, time REAL, text TEXT NOT NULL)`;

let ready = false;
async function init(db) {
  if (ready) return;
  await db.prepare(SCHEMA).run();
  ready = true;
}

export async function onRequestPost({ request, env }) {
  const db = env.STATS_DB;
  if (!db) return json({ error: 'not configured' }, 503);
  const text = await request.text();
  if (text.length > 8192) return json({ error: 'too large' }, 413);
  let b;
  try { b = JSON.parse(text); } catch { return json({ error: 'bad json' }, 400); }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return json({ error: 'invalid' }, 400);
  const note = typeof b.text === 'string' ? b.text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, 1000) : '';
  const ok = HEX16.test(b.battle) && note
    && Number.isInteger(b.step) && b.step >= 0 && b.step < 1e8
    && Number.isFinite(b.time) && b.time >= 0 && b.time <= 36000
    && (b.mode === 'battle' || b.mode === 'replay')
    && (b.device === undefined || HEX16.test(b.device))
    && (b.v === undefined || (typeof b.v === 'string' && /^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/.test(b.v)));
  if (!ok) return json({ error: 'invalid' }, 400);
  await init(db);
  await db.prepare('INSERT INTO notes (battle, device, version, mode, step, time, text) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(b.battle, b.device ?? null, b.v ?? null, b.mode, b.step, b.time, note).run();
  return json({ ok: true }, 201);
}

export async function onRequestGet({ request, env }) {
  const db = env.STATS_DB, key = env.STATS_KEY;
  if (!db || !key) return json({ error: 'not configured' }, 503);
  const url = new URL(request.url);
  const given = url.searchParams.get('key') || request.headers.get('x-stats-key') || '';
  if (!(await sameKey(given, key))) return json({ error: 'forbidden' }, 403);
  await init(db);
  const since = Math.max(0, parseInt(url.searchParams.get('since'), 10) || 0);
  const rows = (await db.prepare('SELECT * FROM notes WHERE id > ? ORDER BY id LIMIT 1000').bind(since).all()).results;
  return json({ rows, next: rows.length ? rows[rows.length - 1].id : since });
}
