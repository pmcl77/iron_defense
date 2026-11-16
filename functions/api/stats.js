// Cloudflare Pages Function: battle statistics (ISSUES.md "Battle statistics for balancing").
// Deploys with the site. Set up per environment in the dashboard (Production = main, Preview = dev):
//   STATS_DB  - D1 database binding (iron-defense-stats / iron-defense-stats-dev)
//   STATS_KEY - secret needed to read the data
// POST /api/stats         one battle summary from the game (main.js sendStats)
// GET  /api/stats?key=…   { summary, rows, next }; optional since=<row> and limit=<n> (max 5000).
//                         Each row is the sent summary (its `id` = battle id) plus `row` (database row number) and `created`.
//                         The key can also be sent as header "x-stats-key".
// Each battle has a random id. A battle left without a result arrives as 'abandoned' (main.js checkpoint); if the
// real result of the same battle comes later, it replaces that row. A real result is never replaced.

const RESULTS = ['win', 'lose', 'quit', 'abandoned'];
const HEX16 = /^[0-9a-f]{16}$/;
const MAX_BODY = 1048576; // 1 MB; a 22-minute battle is about 36 KB
const SCHEMA = `CREATE TABLE IF NOT EXISTS battles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created TEXT NOT NULL DEFAULT (datetime('now')),
  version TEXT, build TEXT, stage INTEGER, result TEXT, duration INTEGER,
  data TEXT NOT NULL)`;

let ready = false;
async function init(db) {
  if (ready) return;
  await db.prepare(SCHEMA).run();
  // added after the first version: the battle id (older rows keep NULL)
  const cols = (await db.prepare('PRAGMA table_info(battles)').all()).results.map((c) => c.name);
  if (!cols.includes('battle')) await db.prepare('ALTER TABLE battles ADD COLUMN battle TEXT').run();
  await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS battles_battle ON battles (battle)').run();
  ready = true;
}

const json = (o, status = 200) => new Response(JSON.stringify(o), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

// Compare via SHA-256 digests so the check takes the same time whatever the input.
async function sameKey(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest('SHA-256', enc.encode(s))));
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let d = 0;
  for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i];
  return d === 0;
}

export async function onRequestPost({ request, env }) {
  const db = env.STATS_DB;
  if (!db) return json({ error: 'not configured' }, 503);
  const text = await request.text();
  if (text.length > MAX_BODY) return json({ error: 'too large' }, 413);
  let b;
  try { b = JSON.parse(text); } catch { return json({ error: 'bad json' }, 400); }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return json({ error: 'invalid' }, 400);
  const ok = typeof b.v === 'string' && /^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/.test(b.v)
    && (b.build === 'dev' || b.build === 'release')
    && Number.isInteger(b.stage) && b.stage >= 0 && b.stage < 1000
    && RESULTS.includes(b.result)
    && Number.isFinite(b.time) && b.time >= 0 && b.time <= 36000
    && (b.id === undefined || HEX16.test(b.id)) && (b.device === undefined || HEX16.test(b.device))
    && (b.name === undefined || typeof b.name === 'string');
  if (!ok) return json({ error: 'invalid' }, 400);
  let data = text;
  if (b.name !== undefined) {
    b.name = b.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 20);
    if (!b.name) delete b.name;
    data = JSON.stringify(b);
  }
  await init(db);
  await db.prepare(`INSERT INTO battles (battle, version, build, stage, result, duration, data) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (battle) DO UPDATE SET version = excluded.version, build = excluded.build, stage = excluded.stage,
      result = excluded.result, duration = excluded.duration, data = excluded.data
    WHERE battles.result = 'abandoned'`)
    .bind(b.id ?? null, b.v, b.build, b.stage, b.result, Math.round(b.time), data).run();
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
  const limit = Math.min(5000, Math.max(1, parseInt(url.searchParams.get('limit'), 10) || 2000));
  const summary = (await db.prepare(`SELECT version, build, stage, result, COUNT(*) AS n, ROUND(AVG(duration)) AS avgTime,
    COUNT(DISTINCT json_extract(data, '$.device')) AS devices
    FROM battles GROUP BY version, build, stage, result ORDER BY version, stage, result`).all()).results;
  const rows = (await db.prepare('SELECT id, created, data FROM battles WHERE id > ? ORDER BY id LIMIT ?')
    .bind(since, limit).all()).results.map((r) => ({ ...JSON.parse(r.data), row: r.id, created: r.created }));
  return json({ summary, rows, next: rows.length ? rows[rows.length - 1].row : since });
}
