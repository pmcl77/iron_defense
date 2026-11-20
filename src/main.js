import {
  FIELD, LANES, BASE_FACE, MECHS, TURRETS, SPECIALS, BASE_UPGRADES, STAGES, MAX_UNIT_LEVEL,
  LOADOUT_SIZE, LEVEL_STEP, OVERTIME, DEV_SWITCHES, laneOf, rowOf, cellY, stageDef, randomLoadout, randomPersonality, PERSONALITIES, SURPRISE_FROM, QUICK, personalitiesFor, unlockedSet, sellRefund, MECH_TYPES, TURRET_TYPES, QUEUE, ROLES, TRAITS,
} from './data.js';
import { World } from './world.js';
import { quickMatch as buildQuick, DIFFS, seedHex, topStage as topStageOf } from './quick.js';
import { replayWorld, replayStep, validReplay } from './replay.js';
import { Renderer, renderIcon, setAegisLinks, AEGIS_LINK_MODES } from './render.js';
import { VoxelRenderer } from './render_voxel.js';
import { initAudio, sfx as playSfx, setSound } from './audio.js';
import { loadSave, writeSave, resetSave, defaultSave, deviceId, randomHex } from './save.js';
import { VERSION } from './version.js';

const $ = (s) => document.querySelector(s);
const app = $('#app'), canvas = $('#game'), hud = $('#hud'), screen = $('#screen'), minimap = $('#minimap');
const flatRenderer = new Renderer(canvas);
let renderer = flatRenderer, voxelRenderer = null;
// Graphics: 'voxel' (final art, pre-baked sprites) or 'simple' (flat vector). Falls back to simple if assets fail.
async function applyGraphics() {
  let next = flatRenderer;
  if (save.settings.graphics !== 'simple') {
    try {
      if (!voxelRenderer) { const v = new VoxelRenderer(canvas); await v.load(); voxelRenderer = v; }
      next = voxelRenderer;
    } catch (err) { console.warn('voxel graphics unavailable:', err.message); }
  }
  if (next !== renderer) { next.camY = renderer.camY; renderer = next; resize(); }
}
const mctx = minimap.getContext('2d');

// Development builds (dev.iron-defense.pages.dev and other branch previews <name>.iron-defense.pages.dev, localhost,
// LAN) are marked so they're never mistaken for the release (iron-defense.pages.dev).
const IS_DEV = /^localhost$|^127\.|^192\.168\.|^10\.|\.iron-defense\.pages\.dev$/.test(location.hostname);
if (IS_DEV) {
  document.title = 'Iron Defense (dev)';
  document.querySelector('link[rel=manifest]')?.setAttribute('href', 'manifest-dev.webmanifest');
  const tag = document.createElement('div');
  tag.id = 'dev-tag'; tag.textContent = 'DEV';
  app.appendChild(tag);
}

let save = loadSave();
setSound(save.settings.sound);

const SPECIAL_ICONS = {
  bomb: '<svg viewBox="0 0 24 24"><path d="M10 2h4v3l2 2v9a4 4 0 0 1-8 0V7l2-2z"/><path d="M8 20l-2 2h12l-2-2z"/></svg>',
  emp: '<svg viewBox="0 0 24 24"><path d="M13 2L4 14h6l-1 8 9-12h-6z"/></svg>',
  surge: '<svg viewBox="0 0 24 24"><path d="M9 2h6v2h3v18H6V4h3zM11 8l-3 6h3l-1 5 5-7h-3l2-4z"/></svg>',
};

// ---------- game state ----------
const freshUi = () => ({ tab: 'mechs', placing: null, targeting: false, aim: null, selected: null });
const game = {
  mode: 'menu', world: null, stageIndex: 0, paused: false, speed: save.settings.speed || 1,
  ui: freshUi(), resultShown: false, demoTimer: 0,
};
const unlocked = () => unlockedSet(save.cleared);

// positional sound: pan from x, distance from the camera center
function sfx(name, f) {
  // battle sounds in a battle and in a replay; silent once the result screen is up (the field keeps running behind it)
  if ((game.mode !== 'play' && game.mode !== 'replay') || (game.mode === 'play' && game.resultShown)) return;
  let pan = 0, dist = 0;
  if (f && f.x !== undefined) {
    pan = Math.max(-1, Math.min(1, f.x / (FIELD.w / 2) - 1));
    const cy = renderer.camY + renderer.viewH / 2;
    dist = Math.min(1, Math.max(0, Math.abs(f.y - cy) - renderer.viewH * 0.35) / (renderer.viewH * 1.2));
  }
  playSfx(name, { pan, dist, type: f && (f.kind === 'base' ? 'base' : f.type) });
}

function currentLoadout() {
  const u = unlocked().mechs;
  const lo = (save.loadout || []).filter((t) => u.includes(t));
  for (const t of u) if (lo.length < LOADOUT_SIZE && !lo.includes(t)) lo.push(t);
  return lo.slice(0, LOADOUT_SIZE);
}

// ---------- attract mode behind the menu ----------
function startDemo() {
  const all = { mechs: MECH_TYPES, turrets: TURRET_TYPES, specials: Object.keys(SPECIALS) };
  const w = new World(stageDef(6), defaultSave(), all);
  for (const [l, r, t] of [[1, 2, 'sentry'], [3, 2, 'sentry'], [2, 1, 'howitzer'], [0, 3, 'arc']]) w.placeTurret(0, t, l, r);
  game.world = w;
  renderer.camY = 300;
}
function demoTick(dt) {
  const w = game.world;
  w.energy = 999;
  game.demoTimer -= dt;
  if (game.demoTimer <= 0) {
    w.setLane(Math.floor(Math.random() * LANES));
    w.deploy(MECH_TYPES[Math.floor(Math.random() * MECH_TYPES.length)]);
    game.demoTimer = 1.2 + Math.random() * 1.8;
  }
  renderer.camY = 700 + Math.sin(w.time * 0.04) * 600;
  renderer.clampCam();
  if (w.result && w.time - w.endTime > 3) startDemo();
}

// ---------- stage flow ----------
// The stage of the next battle: Endless gets a new random enemy loadout every battle; from SURPRISE_FROM one enemy
// slot (random per battle) is the surprise and shows '?' in the intel.
function prepareStage(i) {
  const st = stageDef(i);
  if (st.endless) { st.personality = randomPersonality(Math.random); st.roster = randomLoadout(Math.random, undefined, st.personality); }
  if (i >= SURPRISE_FROM) st.surprise = st.roster[Math.floor(Math.random() * st.roster.length)];
  game.next = { i, st };
  return st;
}
const nextStage = (i) => (game.next?.i === i ? game.next.st : prepareStage(i));
function startStage(i) {
  initAudio();
  prepareStage(i);
  showLoadout(i); // always: it also shows the enemy intel (with 5 or fewer mechs unlocked, all are picked)
}
// ---------- enemy intel ----------
// Enemy mech types the player has fought at least once. The intel shows '?' for a type the player neither owns nor has
// fought (the stage's frontrunner) and for the surprise slot. A save from before the
// intel counts the rosters of all cleared stages as seen.
function seenSet() {
  if (!Array.isArray(save.seen)) {
    const s = new Set();
    for (let k = 0; k < Math.min(save.cleared, STAGES.length); k++) for (const t of STAGES[k].roster) s.add(t);
    save.seen = [...s]; writeSave(save);
  }
  return new Set(save.seen);
}
function noteSeen(w) {
  const types = Object.keys(w.log.mechs[1]);
  if (types.length === w.seenN) return;
  w.seenN = types.length;
  const s = seenSet(), before = s.size;
  for (const t of types) s.add(t);
  if (s.size !== before) { save.seen = [...s]; writeSave(save); }
}
function intelHtml(st) {
  const seen = seenSet(), own = new Set(unlocked().mechs);
  // the surprise always shows last: in its own slot, the fixed stage order would give it away on a replay
  const units = [...st.roster.filter((t) => t !== st.surprise), ...(st.surprise ? [st.surprise] : [])].map((t) => t === st.surprise ? '<span class="iu unknown"><i>?</i><small>Surprise</small></span>'
    : seen.has(t) || own.has(t)
    ? `<span class="iu"><canvas width="72" height="72" data-icon="mech:${t}:1"></canvas><small>${MECHS[t].name}</small></span>`
    : '<span class="iu unknown"><i>?</i><small>New unit</small></span>').join('');
  const tc = {};
  for (const [t] of st.turrets || []) tc[t] = (tc[t] || 0) + 1;
  const turrets = Object.entries(tc).map(([t, n]) => `${n}× ${TURRETS[t].name}`).join(', ') || 'none';
  const EB = { armor: { name: 'Armor', costs: [0, 0, 0] }, ...BASE_UPGRADES }; // the enemy base keeps Armor (stage data)
  const base = Object.keys(EB).map((k) => `<span class="ib">${EB[k].name}${pips((st.base || {})[k] || 0, EB[k].costs.length)}</span>`).join('');
  // dev builds: a DEV button reveals what the enemy is supposed to do (personality, focus types, the surprise); the
  // battle stats record whether it was revealed (devIntel)
  const pe = PERSONALITIES[st.personality];
  const dev = !IS_DEV ? '' : st.devIntel
    ? `<div class="dev-intel"><b>DEV</b> ${pe ? `<span class="k">Personality</span> ${pe.name}: ${pe.desc} <span class="k">Focus</span> ${pe.focus.filter((t) => st.roster.includes(t)).map((t) => MECHS[t].name).join(', ')}` : ''}${st.surprise ? ` <span class="k">Surprise</span> ${MECHS[st.surprise].name}` : ''}</div>`
    : '<button class="btn small dev-btn" data-a="devintel">DEV</button>';
  return `<div class="intel">
      <div class="section-t">INTEL · ENEMY <span class="lvl-tag">LEVEL ${st.lvl}</span>${st.devIntel ? '' : dev}</div>${st.devIntel ? dev : ''}
      <div class="intel-units">${units}</div>
      <div class="intel-row"><span class="k">Turrets</span> ${turrets}</div>
      <div class="intel-row"><span class="k">Base</span> ${base}</div>
      ${IS_DEV && st.quick ? `<div class="intel-row"><span class="k">Seed</span> <span class="num">${seedHex(st.quick.seed)}</span></div>` : ''}
    </div>`;
}
function launch(i, q = null) {
  tryFullscreen();
  const u = unlocked();
  game.stageIndex = i;
  game.mode = 'play';
  game.match = q;
  if (q?.dev) { save.devMatch = { ...(save.devMatch || {}), last: seedHex(q.seed) }; writeSave(save); } // "Last seed" in the dev match dialog
  const st = q ? q.st : nextStage(i); game.next = null;
  // replays: a seed per battle, and the exact setup (stage as played, units, dev switches), sent with the stats.
  // A quick match uses its own seed (it also drew the setup), so the same seed gives the same match.
  const seed = q ? q.seed : Math.floor(Math.random() * 2 ** 32) >>> 0, unl = { mechs: currentLoadout(), turrets: u.turrets, specials: u.specials }, dev = devSettings();
  const { devIntel: _di, ...stCopy } = st;
  const setup = JSON.parse(JSON.stringify({ seed, stage: stCopy, unlocked: unl, dev })); // before the battle can touch st
  game.world = new World(st, save, unl, { dev, seed });
  game.world.setup = setup;
  game.world.battleId = randomHex(8);
  game.world.devIntel = !!st.devIntel;
  game.paused = false;
  game.resultShown = false;
  game.ui = freshUi();
  renderer.particles = [];
  screen.innerHTML = ''; screen.className = '';
  hud.hidden = false;
  resize();
  renderer.camY = -20; renderer.clampCam();
  buildHud();
  $('#stage-no').textContent = q ? 'QUICK MATCH' : st.endless ? 'ENDLESS' : `STAGE ${String(i + 1).padStart(2, '0')}`;
  $('#stage-name').textContent = q ? QUICK.names[q.difficulty].toUpperCase() : st.endless ? `WAVE ${i - STAGES.length + 1}` : st.name.toUpperCase();
  $('#foe-lvl').textContent = `L${st.lvl} `;
  toast(`${st.name}: destroy the enemy base`);
}
// ---------- battle statistics (functions/api/stats.js, ISSUES.md) ----------
// One summary per battle with a random device id and the optional player name (Settings).
// Failures (offline, local server) are ignored.
// Checkpoint: while a battle runs, its summary is kept in localStorage as 'abandoned' (every 30 s and when the app is
// hidden). When the battle ends (or is quit/restarted) the final summary replaces it and stays until the server has
// confirmed it; anything left (app closed or killed, offline, server error) is sent again at the next start.
// The server replaces an 'abandoned' row when the real result of the same battle id arrives.
// keepalive (survives closing the page or switching apps) is limited to 64 KB by browsers, so summaries are gzipped
// (a 28-minute battle: 60 KB → 11 KB); a still bigger one is sent without keepalive. Pending summaries are sent again
// at start, when the app comes back to the foreground, when the network returns and on the way back to the menu.
const CP_KEY = 'iron-defense-checkpoints';
const MIN_TIME = 15; // shorter quits are noise
const duo = (a) => ({ player: a[0], enemy: a[1] });
// whole numbers for the damage stats (objects of numbers or of [mechs, turrets, base, Constructor] arrays)
const rounded = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.isArray(v) ? v.map(Math.round) : Math.round(v)]));
// timeline entries: [time s, energy, player base HP %, enemy base HP %, player mechs, enemy mechs]
// front entries (since 0.8.0-dev.6), every 5 s and at the end: [time s, scrimmage line average %, lane 1 % … lane 5 %]
function summary(result, stars = 0) {
  const w = game.world, i = game.stageIndex, st = w.stage, pct = (b) => Math.round(100 * Math.max(0, b.hp) / b.maxHp);
  const body = {
    id: w.battleId, device: deviceId(), ...(save.settings.name ? { name: save.settings.name } : {}),
    // fmt 3: stage, lanes, rows and groups count from 1; in events side 1 = player, 0 = enemy; per-side data is named.
    // (fmt 2: player/enemy as [player, enemy] lists and event side 0 = player; fmt 1, the first dev battles: also 0-based.)
    fmt: 3, ...(IS_DEV ? { dev: w.log.dev } : {}), v: VERSION, build: IS_DEV ? 'dev' : 'release', stage: i + 1, stageName: st.name, result, stars,
    time: Math.round(w.time), kills: w.stats.kills, deployed: w.stats.deployed,
    baseHp: { player: pct(w.bases[0]), enemy: pct(w.bases[1]) }, energyLeft: Math.round(w.energy),
    loadout: w.unlocked.mechs, baseLvl: { ...w.baseLvl },
    mode: st.quick ? 'quick' : st.endless ? 'endless' : 'campaign',
    ...(st.quick ? { quick: { difficulty: st.quick.difficulty, seed: seedHex(st.quick.seed), turretStage: st.quick.turretStage + 1, dev: !!st.quick.dev, fixed: st.quick.fixed } } : {}), enemyLoadout: st.roster, ...(st.surprise ? { surprise: st.surprise } : {}),
    personality: st.personality, focusX: w.focusX, ...(IS_DEV ? { devIntel: !!w.devIntel } : {}),
    enemyStage: { lvl: st.lvl, regen: st.regen, base: st.base || {} },
    mechs: duo(w.log.mechs), turrets: duo(w.log.turrets), lost: duo(w.log.lost), specials: w.log.specials,
    dmg: duo(w.log.dmg.map(rounded)), taken: duo(w.log.taken.map(rounded)), shield: duo(w.log.shield.map(Math.round)), strip: duo(w.log.strip.map((a) => a.map(Math.round))), wait: duo(w.log.wait.map(rounded)), life: duo(w.lifeLog().map(rounded)),
    upgrades: w.log.upgrades, timeline: [...w.log.timeline, w.sample(false)], front: [...w.log.front, w.frontSample(false)], events: w.log.events,
    replay: { ...w.setup, steps: w.step, inputs: w.inputs }, // tools/replay.mjs
  };
  return body;
}
const KEEPALIVE_MAX = 60000, CP_MAX = 20, CP_DAYS = 14, SERVER_MAX = 1000000;
async function gzip(text) {
  if (typeof CompressionStream === 'undefined') return null;
  try { return await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer(); } catch { return null; }
}
// resolves true when the server stored it
async function post(body) {
  try {
    let text = JSON.stringify(body);
    // the server takes up to 1 MB (hours of play); if ever bigger, send everything except the event list
    if (text.length > SERVER_MAX) text = JSON.stringify({ ...body, events: [], eventsDropped: body.events.length });
    const gz = await gzip(text), size = gz ? gz.byteLength : text.length;
    const headers = { 'content-type': 'application/json', ...(gz ? { 'x-stats-enc': 'gzip' } : {}) };
    const r = await fetch('/api/stats', { method: 'POST', headers, body: gz || text, keepalive: size < KEEPALIVE_MAX });
    return r.ok;
  } catch { return false; }
}
function checkpoints(change) {
  let cp = {};
  try { cp = JSON.parse(localStorage.getItem(CP_KEY)) || {}; } catch { /* ignore */ }
  if (change) {
    change(cp);
    // keep it small: at most CP_MAX entries, none older than CP_DAYS (e.g. on the local test server nothing is accepted)
    const old = Date.now() - CP_DAYS * 864e5;
    const keys = Object.keys(cp).filter((k) => (cp[k].at || 0) >= old).sort((a, b) => cp[b].at - cp[a].at).slice(0, CP_MAX);
    const keep = {}; for (const k of keys) keep[k] = cp[k];
    try { localStorage.setItem(CP_KEY, JSON.stringify(keep)); } catch { /* ignore */ }
    return keep;
  }
  return cp;
}
const sending = new Set();
function deliver(id, body) {
  if (sending.has(id)) return;
  sending.add(id);
  // remove it only if it's still the same entry (a running battle may have written a newer checkpoint meanwhile)
  const same = (e) => e && e.body && e.body.result === body.result && e.body.time === body.time;
  post(body).then((ok) => { sending.delete(id); if (ok) checkpoints((cp) => { if (same(cp[id])) delete cp[id]; }); });
}
function sendStats(result, stars = 0) {
  const w = game.world;
  if (game.mode === 'play' && w && w.battleId) noteSeen(w);
  if (game.mode !== 'play' || !w || !w.battleId || w.statsSent) return;
  w.statsSent = true;
  storeReplay(w, result, stars);
  const id = w.battleId;
  if (!save.settings.stats || (result === 'quit' && w.time < MIN_TIME)) { checkpoints((cp) => { delete cp[id]; }); return; }
  const body = summary(result, stars);
  checkpoints((cp) => { cp[id] = { at: Date.now(), body }; });
  deliver(id, body);
}
// ---------- replays (src/replay.js, ISSUES.md "Exact replays") ----------
// The last REPLAY_KEEP battles of this device are kept for the replay viewer (dev builds); the stats carry them too.
const REPLAY_KEY = 'iron-defense-replays', REPLAY_KEEP = 10;
function storedReplays() { try { return JSON.parse(localStorage.getItem(REPLAY_KEY)) || []; } catch { return []; } }
function storeReplay(w, result, stars) {
  if (!w.setup || w.time < MIN_TIME) return;
  const i = game.stageIndex, st = w.stage, t = Math.round(w.time);
  const title = `${battleTitle(w, i)}: ${result}${stars ? ' ' + '★'.repeat(stars) : ''}, ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  const list = storedReplays().filter((e) => e.id !== w.battleId);
  list.push({ id: w.battleId, at: Date.now(), title, replay: { ...w.setup, steps: w.step, inputs: w.inputs } });
  while (list.length > REPLAY_KEEP) list.shift();
  try { localStorage.setItem(REPLAY_KEY, JSON.stringify(list)); } catch { /* storage full: skip */ }
}
function showReplays() {
  screen.className = '';
  const list = storedReplays().slice().reverse();
  const when = (t) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  screen.innerHTML = `
    <div class="panel">
      <div class="head"><div><h2>Replays</h2><p class="sub">Your last ${REPLAY_KEEP} battles on this device (since v0.7.0-dev.4), or a replay file.</p></div>
        <button class="btn small" data-a="back">Back</button></div>
      <div class="replay-list">${list.length ? list.map((e, n) => { const qs = e.replay?.stage?.quick; return `<button class="btn" data-a="rp" data-n="${n}">${e.title}<small>${when(e.at)}${qs ? ` · seed ${seedHex(qs.seed)}` : ''}</small></button>`; }).join('') : '<p class="sub">No replays yet.</p>'}</div>
      <div class="btn-row"><button class="btn" data-a="file">Open file…</button></div>
      <input id="rp-file" type="file" accept=".json,application/json" hidden>
    </div>`;
  const input = $('#rp-file');
  input.addEventListener('change', async () => {
    const f = input.files[0]; if (!f) return;
    try { const d = JSON.parse(await f.text()); const rep = d.replay || d; if (!validReplay(rep)) throw new Error(); startReplay({ id: d.id, title: d.title || f.name, replay: rep }); }
    catch { toast('Not a replay file'); }
  });
  bind({ back: showMenu, rp: (el) => startReplay(list[+el.dataset.n]), file: () => input.click() });
}
const rp = { rep: null, k: 0, title: '', seeking: false, speed: 1 };
function startReplay(entry) {
  if (!entry || !validReplay(entry.replay)) { toast('Replay data missing'); return; }
  rp.rep = entry.replay; rp.k = 0; rp.title = entry.title; rp.id = entry.id || null; rp.seeking = false;
  game.mode = 'replay';
  game.world = replayWorld(rp.rep);
  game.paused = false; game.resultShown = false; game.ui = freshUi();
  renderer.particles = [];
  screen.innerHTML = ''; screen.className = '';
  hud.hidden = false; hud.classList.add('replay'); $('#replay-bar').hidden = false;
  buildHud();
  const st = game.world.stage;
  $('#stage-no').textContent = 'REPLAY';
  $('#stage-name').textContent = (st.endless ? st.name : st.name).toUpperCase();
  $('#foe-lvl').textContent = `L${st.lvl} `;
  resize();
  renderer.camY = -20; renderer.clampCam();
  updateReplayBar();
}
function exitReplay() {
  rp.rep = null; rp.seeking = false;
  hud.classList.remove('replay'); $('#replay-bar').hidden = true;
  $('#btn-speed').textContent = game.speed + '×'; last.rps2 = null;
  game.mode = 'menu'; game.paused = false;
  hud.hidden = true;
  resize();
  startDemo();
  showReplays();
}
const clockOf = (s) => { const t = Math.floor(s * STEP); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
function updateReplayBar() {
  if (!rp.rep) return;
  const w = game.world;
  const sliding = rp.dragging && !rp.seeking ? `→ ${clockOf(+$('#rp-seek').value / 1000 * rp.rep.steps)} / ${clockOf(rp.rep.steps)}` : null; // dragging: where it will jump
  setText($('#rp-time'), 'rpt', rp.seeking ? `seeking… ${clockOf(rp.seeking.at)}` : sliding || `${clockOf(w.step)} / ${clockOf(rp.rep.steps)}`);
  setText($('#rp-play'), 'rpp', game.paused ? '▶' : '❚❚');
  setText($('#rp-speed'), 'rps', rp.speed + '×');
  setText($('#btn-speed'), 'rps2', rp.speed + '×');
  if (!rp.dragging) $('#rp-seek').value = String(Math.round(1000 * w.step / rp.rep.steps));
}
// jump to a step: forward from here, or from the start when going back; computed in slices so the page stays responsive
function seekTo(target) {
  if (!rp.rep) return;
  target = Math.max(0, Math.min(rp.rep.steps, Math.round(target)));
  let w = game.world;
  if (target < w.step) { w = replayWorld(rp.rep); rp.k = 0; }
  const job = { at: w.step };
  rp.seeking = job;
  const slice = () => {
    if (rp.seeking !== job || !rp.rep) return; // replaced by a newer seek or exit
    const end = Math.min(target, w.step + 2400);
    while (w.step < end) { rp.k = replayStep(w, rp.rep, rp.k); w.fx.length = 0; }
    job.at = w.step;
    updateReplayBar();
    if (w.step < target) { setTimeout(slice, 0); return; }
    game.world = w; renderer.particles = []; rp.seeking = false; acc = 0;
    updateReplayBar();
  };
  slice();
}
$('#rp-play').addEventListener('click', () => { if (rp.rep && game.world.step >= rp.rep.steps) seekTo(0); game.paused = !game.paused; updateReplayBar(); });
$('#rp-back').addEventListener('click', () => seekTo(game.world.step - 10 / STEP));
$('#rp-fwd').addEventListener('click', () => seekTo(game.world.step + 10 / STEP));
$('#rp-speed').addEventListener('click', () => { rp.speed = { 1: 2, 2: 4, 4: 8, 8: 1 }[rp.speed]; updateReplayBar(); });
$('#rp-exit').addEventListener('click', exitReplay);
$('#rp-note').addEventListener('click', () => {
  if (!rp.rep || rp.seeking) return;
  game.paused = true; updateReplayBar();
  const w = game.world;
  showNote({ battle: rp.id, step: w.step, time: w.time, mode: 'replay', title: rp.title }, () => { screen.innerHTML = ''; });
});
$('#rp-seek').addEventListener('input', (e) => { // while dragging: show where it will jump to
  rp.dragging = true;
  if (rp.rep) setText($('#rp-time'), 'rpt', `→ ${clockOf(+e.target.value / 1000 * rp.rep.steps)} / ${clockOf(rp.rep.steps)}`);
});
$('#rp-seek').addEventListener('change', (e) => { rp.dragging = false; if (rp.rep) seekTo(+e.target.value / 1000 * rp.rep.steps); });
function checkpoint() {
  const w = game.world;
  if (!save.settings.stats || game.mode !== 'play' || !w || !w.battleId || w.statsSent || w.result || w.time < MIN_TIME) return;
  checkpoints((cp) => { cp[w.battleId] = { at: Date.now(), body: summary('abandoned') }; });
  w.cpAt = w.log.timeline.length;
}
// send pending summaries: battles left without a result and results the server hasn't confirmed yet
// (not the checkpoint of the battle that is still running)
// ---------- play-test notes (functions/api/notes.js, dev builds) ----------
// A note is tied to a battle (its id) and a moment (step, time). Kept on the device until the server has it.
const NOTES_KEY = 'iron-defense-notes';
function pendingNotes(change) {
  let n = [];
  try { n = JSON.parse(localStorage.getItem(NOTES_KEY)) || []; } catch { /* ignore */ }
  if (change) { n = change(n) || n; try { localStorage.setItem(NOTES_KEY, JSON.stringify(n)); } catch { /* ignore */ } }
  return n;
}
let notesSending = false;
async function flushNotes() {
  if (notesSending) return;
  notesSending = true;
  for (const n of pendingNotes()) {
    let ok = false;
    try { ok = (await fetch('/api/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(n) })).ok; } catch { /* offline */ }
    if (!ok) break;
    pendingNotes((list) => list.filter((x) => x.key !== n.key));
  }
  notesSending = false;
}
// the note dialog; ctx: { battle, step, time, mode, title }; done() is called after Save or Cancel
function showNote(ctx, done) {
  if (!ctx.battle) { toast('This replay has no battle id: notes need one'); done(); return; }
  const t = Math.floor(ctx.time), clock = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  // a compact panel at the top; the field stays visible below it and can be panned (drag or minimap) while typing
  screen.className = 'note-mode';
  screen.innerHTML = `
    <div class="panel note-panel"><p class="sub note-head"><span><b>✎ Note</b><span class="note-where"> · ${ctx.title} · at ${clock}</span></span><button class="btn small note-hide" data-a="hide">Hide</button></p>
      <textarea id="note-text" class="note-text" maxlength="1000" rows="3" placeholder="What do you see? e.g. why do the Seekers queue here? (drag the field to look around)"></textarea>
      <div class="btn-row"><button class="btn small primary" data-a="save">Save</button><button class="btn small" data-a="cancel">Cancel</button></div></div>`;
  const ta = $('#note-text'), panel = screen.querySelector('.note-panel');
  setTimeout(() => ta.focus(), 50);
  bind({
    // Hide: the panel shrinks to its title line (keyboard closes, the whole field is visible); Show brings the text back
    hide: (el) => {
      const hidden = panel.classList.toggle('collapsed');
      el.textContent = hidden ? 'Show' : 'Hide';
      if (hidden) ta.blur(); else ta.focus();
    },
    save: () => {
      const text = ta.value.trim();
      if (text) {
        const { title: _t, ...n } = ctx;
        pendingNotes((list) => [...list, { ...n, step: Math.round(n.step), time: Math.round(n.time * 10) / 10, text, device: deviceId(), v: VERSION, key: randomHex(8) }]);
        flushNotes();
        toast('Note saved');
      }
      screen.className = ''; done();
    },
    cancel: () => { screen.className = ''; done(); },
  });
}
function battleTitle(w, i = game.stageIndex) {
  const st = w.stage;
  if (st.quick) return `Quick match ${QUICK.names[st.quick.difficulty]}${st.quick.dev ? ' (dev)' : ''}`;
  return st.endless ? `Endless ${i - STAGES.length + 1}` : `Stage ${i + 1} ${st.name}`;
}
function flushCheckpoints() {
  flushNotes();
  if (!save.settings.stats) { try { localStorage.removeItem(CP_KEY); } catch { /* ignore */ } return; }
  const cp = checkpoints((c) => { for (const k in c) if (!c[k].body) delete c[k]; }); // drop the old format
  const w = game.world, running = game.mode === 'play' && w && !w.statsSent ? w.battleId : null;
  for (const [id, e] of Object.entries(cp)) if (id !== running) deliver(id, e.body);
}
function quitToMenu(to = 'stages') {
  sendStats('quit');
  flushCheckpoints();
  game.mode = 'menu';
  hud.hidden = true;
  hideSell();
  resize();
  startDemo();
  if (to === 'stages') showStages(); else if (to === 'quick') showQuick(); else if (to === 'menu') showMenu();
}
function finishStage() {
  if (game.match) { finishQuick(); return; }
  const w = game.world, win = w.result === 'win', i = game.stageIndex;
  const b = w.bases[0], hpK = b.hp / b.maxHp;
  const stars = win ? 1 + (hpK > 0.5 ? 1 : 0) + (hpK > 0.85 ? 1 : 0) : 0;
  const before = unlocked();
  if (win) {
    if (i < STAGES.length) { save.cleared = Math.max(save.cleared, i + 1); save.stars[i] = Math.max(save.stars[i] || 0, stars); }
    else save.endlessBest = Math.max(save.endlessBest, i - STAGES.length + 1);
  }
  writeSave(save);
  const after = unlocked(), fresh = [];
  for (const k of ['mechs', 'turrets', 'specials']) for (const t of after[k]) if (!before[k].includes(t)) fresh.push((MECHS[t] || TURRETS[t] || SPECIALS[t]).name);
  sendStats(win ? 'win' : 'lose', stars);
  playSfx(win ? 'win' : 'lose');
  const t = w.time;
  screen.className = '';
  screen.innerHTML = `
    <div class="panel">
      <p class="result-title ${win ? 'win' : 'lose'}">${win ? 'VICTORY' : 'DEFEAT'}</p>
      <div class="stars">${[1, 2, 3].map((n) => `<span class="${n <= stars ? '' : 'off'}">★</span>`).join('')}</div>
      <p class="result-stats">${stageDef(i).name} · ${w.stats.kills} kills · ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}</p>
      ${fresh.length ? `<p class="unlock">Unlocked: ${fresh.join(', ')}</p>` : ''}
      <div class="btn-row">
        ${win ? '<button class="btn primary" data-a="next">Next</button>' : ''}
        <button class="btn" data-a="retry">Retry</button>
        <button class="btn" data-a="stages">Stages</button>
        <button class="btn" data-a="menu">Menu</button>
      </div>
    </div>`;
  bind({
    next: () => startStage(i + 1),
    retry: () => startStage(i),
    stages: () => quitToMenu('stages'),
    menu: () => quitToMenu('menu'),
  });
}

// ---------- screens ----------
function bind(actions) {
  screen.querySelectorAll('[data-a]').forEach((el) => el.addEventListener('click', (ev) => {
    initAudio(); playSfx('click');
    const fn = actions[el.dataset.a];
    if (fn) fn(el, ev);
  }));
}
function drawIcons(root) {
  root.querySelectorAll('canvas[data-icon]').forEach((c) => { const [k, t, team] = c.dataset.icon.split(':'); renderIcon(c, k, t, +team || 0); });
}
const pips = (n, max) => `<span class="pips">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;

function showMenu() {
  screen.className = 'clear';
  screen.innerHTML = `
    <div class="title-wrap">
      <h1 class="logo">IRON<span>DEFENSE</span></h1>
      <p class="tagline">Hold the line. Break theirs.</p>
      <div class="menu-btns">
        <button class="btn primary" data-a="play">${save.cleared ? 'Campaign' : 'Start campaign'}</button>
        ${save.cleared ? '<button class="btn" data-a="quick">Quick match</button>' : ''}
        <button class="btn" data-a="how">How to play</button>
        <button class="btn" data-a="settings">Settings</button>
        ${IS_DEV ? '<button class="btn" data-a="replays">Replays</button>' : ''}
      </div>
      <p class="version">v${VERSION}</p>
    </div>`;
  bind({ play: () => (save.cleared === 0 ? startStage(0) : showStages()), how: showHelp, settings: showSettings, replays: showReplays, quick: showQuick });
}
function showStages() {
  screen.className = '';
  const endlessOpen = save.cleared >= STAGES.length, eFrom = save.endlessBest + 1; // the first wave not yet won
  screen.innerHTML = `
    <div class="panel">
      <div class="head"><div><h2>Campaign</h2><p class="sub">Destroy the enemy base. Keep yours standing for more stars.</p></div>
        <button class="btn small" data-a="back">Back</button></div>
      <div class="stage-grid">
        ${STAGES.map((s, i) => {
          const locked = i > save.cleared, st = save.stars[i] || 0;
          return `<button class="stage-btn ${locked ? 'locked' : ''} ${i === save.cleared ? 'next' : ''}" data-a="${locked ? '' : 'go'}" data-i="${i}" ${locked ? 'disabled' : ''}>
            <b>${String(i + 1).padStart(2, '0')}</b><small>${s.name}</small><span class="st">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</span></button>`;
        }).join('')}
      </div>
      <div class="btn-row">
        <button class="btn ${endlessOpen ? 'primary' : ''}" data-a="endless" ${endlessOpen ? '' : 'disabled'}>Endless ${endlessOpen ? `· wave ${eFrom}` : '· clear all 12'}</button>
      </div>
    </div>`;
  bind({ back: showMenu, go: (el) => startStage(+el.dataset.i), endless: () => startStage(STAGES.length + eFrom - 1) });
}
// the loadout picker with the enemy intel; q = a quick match (null: campaign stage i)
function showLoadout(i, q = null) {
  const u = unlocked().mechs, st = q ? q.st : nextStage(i);
  let pick = currentLoadout();
  const render = () => {
    screen.className = '';
    screen.innerHTML = `
      <div class="panel">
        <div class="head"><div><h2>Loadout</h2><p class="sub">${q ? quickTitle(q) : st.name}: ${u.length > LOADOUT_SIZE ? `pick ${LOADOUT_SIZE} mechs to bring (${pick.length}/${LOADOUT_SIZE})` : 'your mechs'}.</p></div>
          <button class="btn small" data-a="back">Back</button></div>
        ${intelHtml(st)}
        <div class="section-t">YOUR MECHS</div>
        <div class="loadout">
          ${u.map((t) => { const n = pick.indexOf(t); return `<button class="lo ${n >= 0 ? 'on' : ''}" data-a="tog" data-t="${t}">${n >= 0 ? `<span class="slot">${n + 1}</span>` : ''}
            <canvas width="108" height="108" data-icon="mech:${t}"></canvas><b>${MECHS[t].name}</b><small>⚡${MECHS[t].cost}</small></button>`; }).join('')}
        </div>
        <div class="btn-row"><button class="btn primary" data-a="go" ${pick.length === Math.min(LOADOUT_SIZE, u.length) ? '' : 'disabled'}>Deploy</button></div>
      </div>`;
    drawIcons(screen);
    bind({
      back: () => (q ? (q.dev ? showDevMatch(q.form || q.fixed) : showQuick()) : showStages()),
      tog: (el) => { const t = el.dataset.t; pick = pick.includes(t) ? pick.filter((x) => x !== t) : pick.length < LOADOUT_SIZE ? [...pick, t] : pick; render(); },
      go: () => { save.loadout = pick; writeSave(save); launch(i, q); },
      devintel: () => { st.devIntel = true; render(); },
    });
  };
  render();
}
// ---------- quick match (ISSUES.md 2026-11-20) ----------
// One match setup: the enemy at the strength of your highest cleared stage (unit level, income, base upgrades), the
// turrets of a random cleared stage, a random personality with its loadout from your unlocked unit types, the surprise
// slot from stage 7, and the difficulty as the enemy's ramp. A seed draws everything not fixed (dev match) and also
// drives the battle, so the same seed and fixed fields give the same match.
const randomSeed = () => Math.floor(Math.random() * 2 ** 32) >>> 0;
const topStage = () => topStageOf(save.cleared);
const quickMatch = (difficulty, seed, fixed = {}, dev = false) => buildQuick(difficulty, seed, fixed, dev, save.cleared, unlocked().mechs);
const sameMatch = (q) => Object.assign(quickMatch(q.difficulty, q.seed, q.fixed, q.dev), { form: q.form });
const quickTitle = (q) => `Quick match ${QUICK.names[q.difficulty]}${q.dev ? ' (dev)' : ''}`;
const quickScore = (d) => { const c = (save.quick || {})[d] || { wins: 0, played: 0 }; return `wins ${c.wins} / ${c.played}`; };
function showQuick() {
  screen.className = '';
  const top = topStage(), st = stageDef(top);
  screen.innerHTML = `
    <div class="panel">
      <div class="head"><div><h2>Quick match</h2><p class="sub">A random enemy with your unlocked units, at the strength of your highest cleared stage (${top + 1} ${st.name}, level ${st.lvl}), on the turret layout of a cleared stage. The difficulty sets how fast its income grows.</p></div>
        <button class="btn small" data-a="back">Back</button></div>
      <div class="menu-btns" style="margin:0 auto">
        ${DIFFS.map((d) => `<button class="btn ${d === 'medium' ? 'primary' : ''}" data-a="go" data-d="${d}">${QUICK.names[d]}<small class="qscore">${quickScore(d)}</small></button>`).join('')}
        ${IS_DEV ? '<button class="btn" data-a="dev">Dev match…</button>' : ''}
      </div>
    </div>`;
  bind({ back: showMenu, go: (el) => { initAudio(); showLoadout(top, quickMatch(el.dataset.d, randomSeed())); }, dev: () => showDevMatch(save.devMatch?.form) });
}
// the enemy turret layout of a stage as a small map: 5 lanes, rows counted from the enemy base (top)
function turretMap(turrets) {
  const rows = Math.max(3, ...turrets.map(([, , r]) => r + 1)), short = { sentry: 'S', howitzer: 'H', arc: 'A' };
  let h = '<div class="tmap">';
  for (let r = 0; r < rows; r++) for (let l = 0; l < LANES; l++) {
    const t = turrets.find(([, tl, tr]) => tl === l && tr === r);
    h += `<i class="${t ? 't-' + t[0] : ''}">${t ? short[t[0]] || '?' : ''}</i>`;
  }
  return h + '</div>';
}
function turretInfo(turrets) {
  const tc = {}; for (const [t] of turrets) tc[t] = (tc[t] || 0) + 1;
  return Object.entries(tc).map(([t, n]) => `${n}× ${TURRETS[t].name}`).join(', ') || 'no turrets';
}
function personalityInfo(p, types) {
  const pe = PERSONALITIES[p];
  const focus = pe.focus.map((t) => `${MECHS[t].name}${types.includes(t) ? '' : ' (locked)'}`).join(', ');
  return `<b>${pe.name}</b>: ${pe.desc} <span class="k">Focus</span> ${focus}`;
}
// dev match (dev builds): the quick match setup with each field fixed or random
// fixed: the form to show (the last used one, kept in save.devMatch.form); a stage or personality no longer
// available falls back to random in the selects. save.devMatch.last: the seed of the last dev match, typed or drawn.
function showDevMatch(fixed = {}) {
  screen.className = '';
  const top = topStage(), types = unlocked().mechs, base = stageDef(top), last = save.devMatch?.last;
  const f = { difficulty: 'medium', seed: '', ...fixed };
  const opt = (v, label, cur) => `<option value="${v}" ${String(cur ?? '') === String(v) ? 'selected' : ''}>${label}</option>`;
  const pers = personalitiesFor(types);
  screen.innerHTML = `
    <div class="panel">
      <div class="head"><div><h2>Dev match</h2><p class="sub">Fix any part of the quick match setup; the rest is drawn from the seed.</p></div>
        <button class="btn small" data-a="back">Back</button></div>
      <div class="devform">
        <label>Difficulty <select id="dm-diff">${DIFFS.map((d) => opt(d, QUICK.names[d], f.difficulty)).join('')}</select></label>
        <label>Personality <select id="dm-pers">${opt('', 'Random', f.personality)}${pers.map((p) => opt(p, PERSONALITIES[p].name, f.personality)).join('')}</select></label>
        <div id="dm-pers-info" class="dm-info"></div>
        <label>Turrets of <select id="dm-tur">${opt('', 'Random cleared stage', f.turretStage)}${STAGES.slice(0, top + 1).map((s, k) => opt(k, `Stage ${k + 1} ${s.name}`, f.turretStage)).join('')}</select></label>
        <div id="dm-tur-info" class="dm-info"></div>
        <label>Enemy level <select id="dm-lvl">${opt('', `Stage ${top + 1} (${base.lvl})`, f.level)}${[0, 1, 2, 3, 4, 5].map((n) => opt(n, String(n), f.level)).join('')}</select></label>
        <label>Seed <input id="dm-seed" type="text" maxlength="8" placeholder="random" value="${f.seed}" autocomplete="off" spellcheck="false"></label>
      </div>
      <div class="btn-row">
        ${last ? `<button class="btn small" data-a="lastseed">Last seed <span class="num">${last}</span></button>` : ''}
        <button class="btn small" data-a="reset">Reset</button>
        <button class="btn primary" data-a="go">Continue</button></div>
    </div>`;
  const info = () => {
    const p = $('#dm-pers').value, t = $('#dm-tur').value;
    $('#dm-pers-info').innerHTML = p ? personalityInfo(p, types) : `Random from ${pers.length}: ${pers.map((x) => PERSONALITIES[x].name).join(', ')}`;
    $('#dm-tur-info').innerHTML = t === '' ? `Random from stages 1–${top + 1}` : `${turretInfo(STAGES[+t].turrets)}${turretMap(STAGES[+t].turrets)}`;
  };
  $('#dm-pers').addEventListener('change', info); $('#dm-tur').addEventListener('change', info);
  info();
  bind({
    back: showQuick,
    lastseed: () => { $('#dm-seed').value = last; },
    reset: () => {
      $('#dm-diff').value = 'medium'; for (const id of ['#dm-pers', '#dm-tur', '#dm-lvl']) $(id).value = '';
      $('#dm-seed').value = ''; info();
    },
    go: () => {
      const fx = {};
      if ($('#dm-pers').value) fx.personality = $('#dm-pers').value;
      if ($('#dm-tur').value !== '') fx.turretStage = +$('#dm-tur').value;
      if ($('#dm-lvl').value !== '') fx.level = +$('#dm-lvl').value;
      const sv = $('#dm-seed').value.trim().toLowerCase();
      if (sv && !/^[0-9a-f]{1,8}$/.test(sv)) { toast('Seed: up to 8 characters 0–9, a–f'); return; }
      const seed = sv ? parseInt(sv, 16) >>> 0 : randomSeed(), diff = $('#dm-diff').value;
      const q = quickMatch(diff, seed, fx, true);
      q.form = { ...fx, difficulty: diff, seed: sv }; // what to show again on Back, and next time the dialog opens
      save.devMatch = { ...(save.devMatch || {}), form: q.form }; writeSave(save);
      showLoadout(top, q);
    },
  });
}
// copy to the clipboard (needs https or localhost); falls back to a prompt the user can copy from
function copyText(text, done) {
  const fallback = () => { try { window.prompt('Copy:', text); } catch { /* ignore */ } };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast(done), fallback);
  else fallback();
}
function finishQuick() {
  const w = game.world, win = w.result === 'win', q = game.match;
  const c = ((save.quick ||= {})[q.difficulty] ||= { wins: 0, played: 0 });
  c.played++; if (win) c.wins++;
  writeSave(save);
  sendStats(win ? 'win' : 'lose', 0);
  playSfx(win ? 'win' : 'lose');
  const t = w.time;
  screen.className = '';
  screen.innerHTML = `
    <div class="panel">
      <p class="result-title ${win ? 'win' : 'lose'}">${win ? 'VICTORY' : 'DEFEAT'}</p>
      <p class="result-stats">${quickTitle(q)} · ${w.stats.kills} kills · ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}</p>
      <p class="result-stats">${QUICK.names[q.difficulty]}: ${quickScore(q.difficulty)}</p>
      ${IS_DEV ? `<p class="result-stats">${PERSONALITIES[w.stage.personality]?.name || ''} · turrets of stage ${q.st.quick.turretStage + 1} · seed <span class="num">${seedHex(q.seed)}</span> <button class="btn small copy-btn" data-a="copyseed">Copy</button></p>` : ''}
      <div class="btn-row">
        <button class="btn primary" data-a="again">Again</button>
        ${IS_DEV ? '<button class="btn" data-a="same">Same match</button>' : ''}
        <button class="btn" data-a="quick">Quick match</button>
        <button class="btn" data-a="menu">Menu</button>
      </div>
    </div>`;
  const top = game.stageIndex;
  bind({
    // Again: a new match with the same difficulty (dev match: the same fixed fields; a fixed seed stays fixed)
    again: () => showLoadout(top, q.dev ? Object.assign(quickMatch(q.difficulty, q.form?.seed ? q.seed : randomSeed(), q.fixed, true), { form: q.form }) : quickMatch(q.difficulty, randomSeed())),
    same: () => showLoadout(top, sameMatch(q)),
    copyseed: () => copyText(seedHex(q.seed), 'Seed copied'),
    quick: () => quitToMenu('quick'),
    menu: () => quitToMenu('menu'),
  });
}
function showHelp() {
  screen.className = '';
  const items = [
    ['Goal', 'Destroy the enemy base at the top before they destroy yours at the bottom.'],
    ['Lanes', 'The field has 5 lanes. Pick the active lane with the L1–L5 buttons, then tap a mech card to deploy it into that lane.'],
    ['Overtime', `From minute ${OVERTIME.at / 60} both sides earn ×${OVERTIME.mult} energy (the clock turns yellow, the income display shows the new rate). Kill bounty and Energy Surge stay the same.`],
    ['Forward deploy', 'Your turrets double as forward bases for their own lane. When a lane gets its first turret it switches to forward on its own (FWD): new mechs appear just behind that lane\'s frontmost turret. Tap the selected lane button again to switch between forward and base. If that turret falls, the next one back takes over; when the lane\'s last turret is gone, the lane goes back to the base.'],
    ['Deploy queue', 'Not enough energy, or the card is cooling down? The tap is queued (up to 5) in the lane you picked. Orders come out strictly in order as energy allows; energy is only paid when a mech deploys. Tap a queued mech to cancel it, CLEAR cancels all, Backspace removes the last.'],
    ['Lanes and reach', 'A mech can only shoot at its own lane and the two lanes next to it. Turrets and bases reach every lane.'],
    ['Roles', 'Every mech has a role that decides how it moves. Pick what you deploy and where:'],
    ...Object.entries(ROLES).map(([k, r]) => [r.name, `${r.desc} ${MECH_TYPES.filter((t) => MECHS[t].role === k).map((t) => MECHS[t].name).join(', ')}.`]),
    ['Traits', `A trait changes one rule of a mech's role. ${MECH_TYPES.filter((t) => MECHS[t].traits.length).map((t) => `${MECHS[t].name}: ${MECHS[t].traits.map((k) => `${TRAITS[k].name.toLowerCase()} (${TRAITS[k].desc.replace(/\.$/, '').toLowerCase()})`).join(', ')}`).join('. ')}.`],
    ['Turrets', 'Open TURRETS, pick a turret, then tap free cells to queue orders (paid now). Your Constructor drives out and builds them. Tap a planned cell to cancel. Tap your turret to sell it.'],
    ['Constructor', 'Each trip costs 20 energy, refunded when it gets home safely. If it is destroyed, a new one leaves after 3 s.'],
    ['Specials', 'Bombing (tap a target), EMP (stuns enemies) and Energy Surge (+100 energy). They recharge over time.'],
    ['Upgrades', 'The wrench opens upgrades for this battle. The game pauses while it is open.'],
    ['Controls', 'Drag the field or tap the minimap to look around. Keys: W/S pan, Shift+1–5 lane, 1–5 deploy, T turrets, Q/E/R specials, U upgrades, Space pause.'],
  ];
  screen.innerHTML = `<div class="panel"><div class="head"><h2>How to play</h2><button class="btn small" data-a="back">Back</button></div>
    <div class="list">${items.map(([b, s]) => `<div class="item"><div class="info"><b>${b}</b><small>${s}</small></div></div>`).join('')}</div></div>`;
  bind({ back: showMenu });
}
// Aegis link style (for trying out the four options; ISSUES.md)
const AEGIS_NAMES = { hit: 'On hit', always: 'Beams', pulse: 'Pulse', off: 'Off' };
function cycleAegis() {
  const i = AEGIS_LINK_MODES.indexOf(save.settings.aegis);
  save.settings.aegis = AEGIS_LINK_MODES[(i + 1) % AEGIS_LINK_MODES.length];
  setAegisLinks(save.settings.aegis); writeSave(save);
}
// dev switches (DEV_SWITCHES in data.js): dev builds only; release builds always use the defaults
const devSettings = () => (IS_DEV ? Object.fromEntries(Object.entries(DEV_SWITCHES).map(([k, d]) => [k, save.settings.dev?.[k] ?? d.def])) : {});
const devRows = (live) => Object.entries(DEV_SWITCHES).filter(([, d]) => !live || d.live).map(([k, d]) => {
  const on = live ? game.world.dev[k] : devSettings()[k];
  return `<div class="toggle"><span>${d.name}${d.live ? '' : ' <small class="sub">(next battle)</small>'}<br><small class="sub">${d.desc}</small></span><button class="btn small" data-a="dev" data-k="${k}">${on ? 'On' : 'Off'}</button></div>`;
}).join('');
function toggleDev(el, live) {
  const k = el.dataset.k, on = !(live ? game.world.dev[k] : devSettings()[k]);
  save.settings.dev = { ...(save.settings.dev || {}), [k]: on }; writeSave(save);
  if (live) game.world.setDev(k, on);
}
function showSettings() {
  screen.className = '';
  screen.innerHTML = `
    <div class="panel">
      <div class="head"><h2>Settings</h2><button class="btn small" data-a="back">Back</button></div>
      <div class="toggle"><span>Sound</span><button class="btn small" data-a="sound">${save.settings.sound ? 'On' : 'Off'}</button></div>
      <div class="toggle"><span>Graphics</span><button class="btn small" data-a="gfx">${save.settings.graphics === 'simple' ? 'Simple' : 'Voxel'}</button></div>
      <div class="toggle"><span>Aegis links</span><button class="btn small" data-a="aegis">${AEGIS_NAMES[save.settings.aegis] || AEGIS_NAMES.hit}</button></div>
      <div class="toggle"><span>Send battle stats</span><button class="btn small" data-a="stats">${save.settings.stats ? 'On' : 'Off'}</button></div>
      <div class="toggle"><span>Player name <small class="sub">(stats, optional) · device #${deviceId().slice(0, 4)}</small></span><input id="pname" class="name-input" maxlength="20" placeholder="none" autocomplete="off" spellcheck="false"></div>
      <div class="toggle"><span>Fullscreen</span><button class="btn small" data-a="fs">Toggle</button></div>
      <div class="toggle"><span>Reset all progress</span><button class="btn small danger" data-a="reset">Reset</button></div>
      ${IS_DEV ? `<h3 style="margin-top:14px">Dev switches</h3>${devRows(false)}` : ''}
      <p class="sub" style="margin-top:12px">Iron Defense v${VERSION}</p>
    </div>`;
  bind({
    back: showMenu,
    sound: () => { save.settings.sound = !save.settings.sound; setSound(save.settings.sound); writeSave(save); showSettings(); },
    fs: () => { if (document.fullscreenElement) document.exitFullscreen(); else tryFullscreen(true); },
    aegis: () => { cycleAegis(); showSettings(); },
    dev: (el) => { toggleDev(el, false); showSettings(); },
    stats: () => { save.settings.stats = !save.settings.stats; writeSave(save); showSettings(); },
    gfx: async () => { save.settings.graphics = save.settings.graphics === 'simple' ? 'voxel' : 'simple'; writeSave(save); showSettings(); await applyGraphics(); },
    reset: (el) => { if (el.dataset.confirm) { const name = save.settings.name; save = resetSave(); save.settings.name = name; writeSave(save); setSound(true); showSettings(); } else { el.dataset.confirm = '1'; el.textContent = 'Tap again to confirm'; } },
  });
  const nameIn = $('#pname');
  nameIn.value = save.settings.name || '';
  nameIn.addEventListener('change', () => { save.settings.name = nameIn.value.trim().slice(0, 20); writeSave(save); });
  nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameIn.blur(); });
}
function showPause() {
  game.paused = true;
  screen.className = '';
  screen.innerHTML = `
    <div class="panel"><h2 style="text-align:center">Paused</h2><p class="sub" style="text-align:center">${game.match ? quickTitle(game.match) : stageDef(game.stageIndex).name}</p>
      <div class="menu-btns" style="margin:0 auto">
        <button class="btn primary" data-a="resume">Resume</button>
        <button class="btn" data-a="restart">Restart</button>
        <button class="btn" data-a="sound">Sound: ${save.settings.sound ? 'On' : 'Off'}</button>
        <button class="btn" data-a="aegis">Aegis links: ${AEGIS_NAMES[save.settings.aegis] || AEGIS_NAMES.hit}</button>
        ${IS_DEV ? '<button class="btn" data-a="note">Note…</button>' : ''}
        <button class="btn" data-a="quit">Quit to stages</button>
      </div>${IS_DEV ? `<div style="margin-top:12px">${devRows(true)}</div>` : ''}</div>`;
  bind({
    resume, restart: () => { sendStats('quit'); if (game.match) showLoadout(game.stageIndex, sameMatch(game.match)); else startStage(game.stageIndex); },
    sound: () => { save.settings.sound = !save.settings.sound; setSound(save.settings.sound); writeSave(save); showPause(); },
    aegis: () => { cycleAegis(); showPause(); },
    note: () => { const w = game.world; showNote({ battle: w.battleId, step: w.step, time: w.time, mode: 'battle', title: battleTitle(w) }, showPause); },
    dev: (el) => { toggleDev(el, true); showPause(); },
    quit: () => quitToMenu(game.match ? 'quick' : 'stages'),
  });
}
function resume() { game.paused = false; screen.innerHTML = ''; }
function showUpgrades() {
  const w = game.world;
  if (!w || w.result) return;
  game.paused = true;
  game.ui.targeting = false;
  screen.className = '';
  const types = [...w.unlocked.mechs.map((t) => ['mech', t, MECHS[t]]), ...w.unlocked.turrets.map((t) => ['turret', t, TURRETS[t]])];
  screen.innerHTML = `
    <div class="panel">
      <div class="head"><div><h2>Upgrades</h2><p class="sub">Paid with energy. They apply to units already on the field too.</p></div>
        <div><span class="en">⚡${Math.floor(w.energy)}</span> <button class="btn small primary" data-a="close">Resume</button></div></div>
      <div class="list">
        ${types.map(([k, t, def]) => {
          const lv = w.lvl[0][t], c = w.unitUpgradeCost(t);
          return `<div class="item"><canvas width="92" height="92" data-icon="${k}:${t}"></canvas>
            <div class="info"><b>${def.name}${pips(lv, MAX_UNIT_LEVEL)}</b><small>+${Math.round(LEVEL_STEP * 100)}% damage &amp; HP</small></div>
            <button class="btn small" data-a="unit" data-t="${t}" ${c == null || w.energy < c ? 'disabled' : ''}>${c == null ? 'MAX' : '⚡' + c}</button></div>`;
        }).join('')}
      </div>
      <div class="section-t">BASE</div>
      <div class="list">
        ${Object.entries(BASE_UPGRADES).map(([k, b]) => {
          const lv = w.baseLvl[k], c = w.baseUpgradeCost(k);
          return `<div class="item"><div class="info"><b>${b.name}${pips(lv, b.costs.length)}</b><small>${b.desc}</small></div>
            <button class="btn small" data-a="base" data-k="${k}" ${c == null || w.energy < c ? 'disabled' : ''}>${c == null ? 'MAX' : '⚡' + c}</button></div>`;
        }).join('')}
      </div>
    </div>`;
  drawIcons(screen);
  bind({
    close: resume,
    unit: (el) => { w.upgradeUnit(el.dataset.t); renderer.consume(w.fx, sfx); showUpgrades(); refreshCards(); },
    base: (el) => { w.upgradeBase(el.dataset.k); renderer.consume(w.fx, sfx); showUpgrades(); },
  });
}

// lane button or Shift+1-5: select a lane; a second tap switches that lane between base and forward deploy
function pickLane(l) {
  const r = game.world.setLane(l);
  if (r === 'noturret') toast(`No turret in L${l + 1} to deploy from`);
  else if (r === 'fwd') toast(`L${l + 1}: deploy forward`);
  else if (r === 'base') toast(`L${l + 1}: deploy at base`);
}
// ---------- HUD ----------
let cardEls = [], specialEls = [], laneEls = [];
function buildHud() {
  const w = game.world;
  $('#lanes').innerHTML = Array.from({ length: LANES }, (_, i) => `<button data-l="${i}">L${i + 1}</button>`).join('');
  laneEls = [...$('#lanes').children];
  laneEls.forEach((b) => b.addEventListener('click', () => { initAudio(); pickLane(+b.dataset.l); playSfx('click'); }));
  hud.querySelector('.tabs [data-tab="turrets"]').hidden = !w.unlocked.turrets.length;
  hud.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === game.ui.tab));
  refreshCards();
  $('#specials').innerHTML = Object.keys(SPECIALS).map((k) => {
    const on = w.unlocked.specials.includes(k);
    return `<button class="special" data-k="${k}" ${on ? '' : 'style="visibility:hidden"'}><span class="ring">${SPECIAL_ICONS[k]}</span>
      <span class="t"><b>${SPECIALS[k].short}</b><small class="cdt"></small></span><span class="k">${SPECIALS[k].key}</span></button>`;
  }).join('');
  specialEls = [...$('#specials').children].map((el) => ({ el, k: el.dataset.k, cdt: el.querySelector('.cdt') }));
  specialEls.forEach(({ el, k }) => el.addEventListener('click', () => useSpecial(k)));
  $('#btn-speed').textContent = game.speed + '×';
}
function refreshCards() {
  queueSig = null; // rebuild queue strip + card counters
  const w = game.world, isMech = game.ui.tab === 'mechs';
  const list = isMech ? w.unlocked.mechs : w.unlocked.turrets;
  const box = $('#cards');
  box.innerHTML = Array.from({ length: 5 }, (_, i) => {
    const t = list[i];
    if (!t) return '<div class="card empty"></div>';
    const def = isMech ? MECHS[t] : TURRETS[t], lv = w.lvl[0][t];
    return `<button class="card" data-t="${t}"><canvas width="120" height="120" data-icon="${isMech ? 'mech' : 'turret'}:${t}"></canvas>
      <span class="key">${i + 1}</span>${lv ? `<span class="lv">L${lv}</span>` : ''}<span class="nm">${def.name.toUpperCase()}</span><span class="cost">⚡${def.cost}</span><span class="cd"></span></button>`;
  }).join('');
  drawIcons(box);
  cardEls = [...box.querySelectorAll('button.card')].map((el) => ({ el, t: el.dataset.t, cd: el.querySelector('.cd'), mech: isMech }));
  cardEls.forEach(({ el, t, mech }) => el.addEventListener('click', () => onCard(t, mech)));
}
function setTab(tab) {
  if (tab === 'turrets' && !game.world.unlocked.turrets.length) return;
  game.ui.tab = tab; game.ui.placing = null;
  hud.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x.dataset.tab === tab));
  refreshCards();
}
function onCard(t, mech) {
  initAudio();
  const w = game.world;
  if (game.paused || w.result) return;
  hideSell();
  if (mech) {
    if (w.request(t) === 'full') toast(`Queue full (${QUEUE.max})`);
    renderer.consume(w.fx, sfx);
  } else {
    game.ui.targeting = false;
    game.ui.placing = game.ui.placing === t ? null : t;
    if (game.ui.placing) {
      toast(`Tap free cells to order ${TURRETS[t].name}s · tap the card again to stop`);
    }
  }
}
function useSpecial(k) {
  initAudio();
  const w = game.world;
  if (game.paused || w.result) return;
  hideSell();
  if (!w.canSpecial(k)) { toast(`${SPECIALS[k].name} is recharging`); return; }
  if (SPECIALS[k].targeted) {
    game.ui.placing = null;
    game.ui.targeting = !game.ui.targeting;
    game.ui.aim = game.ui.targeting ? renderer.screenToWorld(renderer.w / 2, (renderer.fieldTop + renderer.fieldBottom) / 2) : null;
    if (game.ui.targeting) toast('Tap the field to drop the bombs');
  } else { w.special(k); renderer.consume(w.fx, sfx); }
}
const last = {};
function setText(el, key, v) { if (last[key] !== v) { last[key] = v; el.textContent = v; } }
function updateHud() {
  const w = game.world, b0 = w.bases[0], b1 = w.bases[1];
  $('#hp0').style.width = `calc(${(100 * b0.hp / b0.maxHp).toFixed(1)}% - 2px)`;
  $('#hp1').style.width = `calc(${(100 * b1.hp / b1.maxHp).toFixed(1)}% - 2px)`;
  setText($('#hp0t'), 'hp0', String(Math.ceil(b0.hp)));
  setText($('#hp1t'), 'hp1', String(Math.ceil(b1.hp)));
  $('#energy-fill').style.width = `calc(${(100 * w.energy / w.maxEnergy).toFixed(1)}% - 2px)`;
  setText($('#energy-text'), 'en', `${Math.floor(w.energy)}/${w.maxEnergy}`);
  { const t = Math.floor(w.result ? w.endTime : w.time); setText($('#clock'), 'clk', `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`); }
  // overtime: the effective income in yellow (the formula "+17×1.5/s" doesn't fit next to the wrench)
  setText($('#regen'), 'rg', `+${Math.round(w.otIncome(w.regen))}/s`);
  $('#regen').classList.toggle('ot', !!w.overtime);
  $('#clock').classList.toggle('ot', !!w.overtime);
  if (w.overtime && !game.ui.otShown) { game.ui.otShown = true; banner('OVERTIME', `Income ×${OVERTIME.mult} for both sides`); }
  laneEls.forEach((b, i) => {
    b.classList.toggle('on', i === w.activeLane);
    b.classList.toggle('fwd', w.laneFwd(i));
  });
  for (const c of cardEls) {
    const def = c.mech ? MECHS[c.t] : TURRETS[c.t];
    c.el.classList.toggle('poor', w.energy < def.cost);
    c.el.classList.toggle('armed', game.ui.placing === c.t);
    c.cd.style.height = c.mech ? `${(100 * Math.max(0, w.deployCd[c.t] || 0) / def.cd).toFixed(0)}%` : '0';
  }
  for (const s of specialEls) {
    if (!w.unlocked.specials.includes(s.k)) continue;
    const cd = w.specialCd[s.k], max = SPECIALS[s.k].cd * w.specialMult;
    s.el.style.setProperty('--p', (1 - cd / max).toFixed(3));
    s.el.classList.toggle('cooling', cd > 0);
    s.el.classList.toggle('ready', cd <= 0);
    s.el.classList.toggle('armed', s.k === 'bomb' && game.ui.targeting);
    setText(s.cdt, 'sp' + s.k, cd > 0 ? `${Math.ceil(cd)}s` : 'READY');
  }
  updateQueue();
  if (game.ui.selected && game.ui.selected.dead) hideSell();
  renderer.drawMinimap(mctx, w, minimap.width, minimap.height);
}
// ---- deployment queue strip
let queueSig = null;
function updateQueue() {
  const w = game.world, q = w.queue, box = $('#queue');
  const sig = q.map((o) => o.type + o.lane + (o.fwd ? 'f' : '')).join(',');
  if (sig !== queueSig) {
    queueSig = sig;
    box.hidden = !q.length;
    const items = box.querySelector('.qitems');
    items.innerHTML = q.map((o, i) => `<button class="q${i ? '' : ' head'}" data-i="${i}" aria-label="Cancel ${MECHS[o.type].name}"><canvas width="80" height="68" data-icon="mech:${o.type}"></canvas>${i ? '' : '<i class="fill"></i>'}<span class="ln">${o.lane + 1}${o.fwd ? '▲' : ''}</span><span class="x">✕</span></button>`).join('')
      + '<div class="q slot"></div>'.repeat(QUEUE.max - q.length);
    drawIcons(items);
    items.querySelectorAll('button.q').forEach((b) => b.addEventListener('click', () => { w.cancelQueued(+b.dataset.i); renderer.consume(w.fx, sfx); }));
    const cnt = {};
    q.forEach((o) => { cnt[o.type] = (cnt[o.type] || 0) + 1; });
    for (const c of cardEls) {
      if (!c.mech) continue;
      let b = c.el.querySelector('.qn');
      if (cnt[c.t] > 1) { if (!b) { b = document.createElement('span'); b.className = 'qn'; c.el.appendChild(b); } b.textContent = '×' + cnt[c.t]; } else if (b) b.remove();
    }
  }
  if (!q.length) return;
  const h = q[0], cost = MECHS[h.type].cost, cd = w.deployCd[h.type] || 0;
  const fill = box.querySelector('.q.head .fill');
  if (fill) fill.style.width = `${Math.min(100, 100 * w.energy / cost).toFixed(0)}%`;
  setText(box.querySelector('.qinfo'), 'qi', `${q.length} / ${QUEUE.max}\n${w.energy < cost ? `⚡${Math.ceil(cost - w.energy)}` : cd > 0 ? `⏱${Math.ceil(cd)}s` : 'go'}`); // short: 6 slots leave about 30 px on a 384 px phone
}
$('#queue .qclear').addEventListener('click', () => { const w = game.world; if (w) { w.clearQueue(); renderer.consume(w.fx, sfx); } });
let toastTimer = 0;
// big announcement under the top bar: pulses, then fades out after about 3.5 s
let bannerTimer;
function banner(title, sub) {
  const b = $('#banner');
  $('#toast').classList.remove('show');
  b.hidden = true; void b.offsetWidth; // restart the animation
  b.innerHTML = `${title}<small>${sub}</small>`;
  b.hidden = false;
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { b.hidden = true; }, 3600);
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}
// sell popup for your turrets
function showSell(t) {
  game.ui.selected = t;
  const pop = $('#sell-pop');
  pop.textContent = `Sell ${t.def.name} +⚡${sellRefund(TURRETS[t.type], t.hp / t.maxHp)}`;
  pop.style.left = Math.max(70, Math.min(renderer.w - 70, renderer.sx(t.x))) + 'px';
  pop.style.top = (renderer.sy(t.y) - t.radius * renderer.scale * 1.4) + 'px';
  pop.hidden = false;
}
function hideSell() { $('#sell-pop').hidden = true; game.ui.selected = null; }
$('#sell-pop').addEventListener('click', () => {
  const t = game.ui.selected;
  if (t && !t.dead) { game.world.sell(t.lane, t.row); renderer.consume(game.world.fx, sfx); }
  hideSell();
});
// dev builds: the Note button pauses the battle and opens the note panel; Save or Cancel goes straight back to the battle
function quickNote() {
  const w = game.world;
  if (!IS_DEV || game.mode !== 'play' || !w || w.result || game.paused) return;
  game.paused = true;
  showNote({ battle: w.battleId, step: w.step, time: w.time, mode: 'battle', title: battleTitle(w) }, resume);
}
if (IS_DEV) { $('#btn-note').hidden = false; $('#btn-note').addEventListener('click', quickNote); }
$('#btn-pause').addEventListener('click', () => { if (game.mode === 'replay') { $('#rp-play').click(); return; } if (!game.world.result) showPause(); });
$('#btn-upg').addEventListener('click', () => { initAudio(); playSfx('click'); showUpgrades(); });
$('#btn-speed').addEventListener('click', () => {
  if (game.mode === 'replay') { $('#rp-speed').click(); return; }
  game.speed = game.speed === 1 ? 2 : 1;
  save.settings.speed = game.speed; writeSave(save);
  $('#btn-speed').textContent = game.speed + '×';
});
hud.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { initAudio(); setTab(b.dataset.tab); }));

// ---------- input on the field ----------
const local = (e) => { const r = app.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
const drag = { id: null, sy: 0, ly: 0, moved: false };
canvas.addEventListener('pointerdown', (e) => {
  initAudio();
  const p = local(e);
  drag.id = e.pointerId; drag.sy = p.y; drag.ly = p.y; drag.moved = false;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  const p = local(e);
  if (game.ui.targeting) game.ui.aim = renderer.screenToWorld(p.x, p.y);
  if (drag.id !== e.pointerId || (game.mode !== 'play' && game.mode !== 'replay')) return;
  if (Math.abs(p.y - drag.sy) > 10) drag.moved = true;
  if (drag.moved) { renderer.camY += (p.y - drag.ly) / renderer.ys; renderer.clampCam(); hideSell(); }
  drag.ly = p.y;
});
canvas.addEventListener('pointerup', (e) => {
  if (drag.id !== e.pointerId) return;
  drag.id = null;
  if (!drag.moved && game.mode === 'play') { const p = local(e); onTap(p.x, p.y); }
});
canvas.addEventListener('pointercancel', () => { drag.id = null; });
canvas.addEventListener('wheel', (e) => {
  if (game.mode !== 'play' && game.mode !== 'replay') return;
  renderer.camY -= e.deltaY / renderer.ys; renderer.clampCam(); e.preventDefault();
}, { passive: false });

function onTap(px, py) {
  const w = game.world, ui = game.ui;
  if (game.paused || w.result) return;
  const p = renderer.screenToWorld(px, py);
  if (ui.targeting) {
    if (w.special('bomb', p.x, p.y)) renderer.consume(w.fx, sfx);
    ui.targeting = false; ui.aim = null;
    return;
  }
  const lane = laneOf(p.x), row = rowOf(0, p.y), inCell = row >= 0 && Math.abs(p.y - cellY(0, row)) <= 50;
  if (inCell && w.orderAt(lane, row)) { w.cancel(lane, row); renderer.consume(w.fx, sfx); toast('Order cancelled, refunded'); return; }
  const own = inCell ? w.cells[0][lane][row] : null;
  if (own) { if (ui.selected === own) hideSell(); else showSell(own); return; }
  hideSell();
  if (ui.placing && inCell) {
    if (!w.order(lane, row, ui.placing)) toast(w.energy < TURRETS[ui.placing].cost ? 'Not enough energy' : 'Cell not free');
    renderer.consume(w.fx, sfx);
    return;
  }
  if (p.y > 0 && p.y < BASE_FACE[0] + 150) { w.setBaseDeploy(lane); playSfx('click'); }
}

// minimap: tap or drag to move the camera
function minimapNav(e) {
  const r = minimap.getBoundingClientRect(), k = 1 - (e.clientY - r.top) / r.height;
  renderer.camY = k * FIELD.h - renderer.viewH / 2; renderer.clampCam(); hideSell();
}
minimap.addEventListener('pointerdown', (e) => { try { minimap.setPointerCapture(e.pointerId); } catch { /* synthetic event */ } minimapNav(e); });
minimap.addEventListener('pointermove', (e) => { if (e.buttons) minimapNav(e); });

// keyboard
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.target && e.target.closest && e.target.closest('textarea, input')) return; // typing a note
  const k = e.key.toLowerCase();
  keys.add(k);
  if (game.mode === 'replay' && (k === ' ' || k === 'p')) { e.preventDefault(); $('#rp-play').click(); return; }
  if (game.mode !== 'play') return;
  const w = game.world;
  if (k === ' ' || k === 'escape' || k === 'p') {
    e.preventDefault();
    if (w.result) return;
    if (game.paused) resume(); else showPause();
    return;
  }
  if (game.paused) return;
  if (e.shiftKey && /^digit[1-5]$/i.test(e.code)) { pickLane(+e.code.slice(5) - 1); return; }
  if (k >= '1' && k <= '5') {
    const list = game.ui.tab === 'mechs' ? w.unlocked.mechs : w.unlocked.turrets;
    const t = list[+k - 1];
    if (t) onCard(t, game.ui.tab === 'mechs');
  }
  const sp = { q: 'bomb', e: 'emp', r: 'surge' }[k];
  if (sp && w.unlocked.specials.includes(sp)) useSpecial(sp);
  if (k === 'backspace' && w.queue.length) { e.preventDefault(); w.cancelQueued(w.queue.length - 1); renderer.consume(w.fx, sfx); }
  if (k === 'u') showUpgrades();
  if (k === 'n') { e.preventDefault(); quickNote(); }
  if (k === 't' || k === 'tab') { e.preventDefault(); setTab(game.ui.tab === 'mechs' ? 'turrets' : 'mechs'); }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
function keyPan(dt) {
  let d = 0;
  if (keys.has('w') || keys.has('arrowup')) d += 1;
  if (keys.has('s') || keys.has('arrowdown')) d -= 1;
  if (d) { renderer.camY += d * 900 * dt; renderer.clampCam(); hideSell(); }
}

// ---------- fullscreen / layout ----------
function tryFullscreen(force) {
  const touch = matchMedia('(pointer: coarse)').matches;
  const standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
  if (!force && (!touch || standalone)) return;
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen) {
    el.requestFullscreen({ navigationUI: 'hide' }).then(() => { const o = window.screen.orientation; if (o && o.lock) o.lock('portrait').catch(() => {}); }).catch(() => {});
  }
}
function resize() {
  const r = app.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 3);
  const playing = (game.mode === 'play' || game.mode === 'replay') && !hud.hidden;
  const top = playing ? $('.top').getBoundingClientRect().bottom - r.top + 4 : 0;
  const bottom = playing ? $(game.mode === 'replay' ? '#replay-bar' : '.bottom').getBoundingClientRect().top - r.top : r.height;
  renderer.resize(r.width, r.height, dpr, top, bottom);
  const mr = minimap.getBoundingClientRect();
  minimap.width = Math.max(1, Math.round(mr.width * dpr)); minimap.height = Math.max(1, Math.round(mr.height * dpr));
}
window.addEventListener('resize', resize);

function checkResult() {
  const w = game.world;
  if (w.result && !game.resultShown && w.time - w.endTime > 2.5) {
    game.resultShown = true;
    game.ui.placing = null; game.ui.targeting = false;
    hideSell();
    finishStage();
  }
}

// ---------- main loop ----------
const STEP = 1 / 60;
let acc = 0, lastT = performance.now();
function frame(now) {
  const dtReal = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  const w = game.world;
  let simDt = 0;
  if (w && game.mode === 'replay') {
    if (!game.paused && !rp.seeking) {
      acc += dtReal * rp.speed;
      let steps = 0;
      while (acc >= STEP && steps < 12) {
        if (w.step >= rp.rep.steps) { game.paused = true; acc = 0; break; } // the end of the recorded battle
        rp.k = replayStep(w, rp.rep, rp.k);
        acc -= STEP; steps++; simDt += STEP;
      }
      if (steps >= 12) acc = 0;
    }
  } else if (w && !game.paused) {
    acc += dtReal * (game.mode === 'play' ? game.speed : 1);
    let steps = 0;
    while (acc >= STEP && steps < 12) {
      if (game.mode === 'menu') demoTick(STEP);
      w.update(STEP);
      acc -= STEP; steps++; simDt += STEP;
    }
    if (steps >= 12) acc = 0;
  }
  if ((game.mode === 'play' && !game.paused) || game.mode === 'replay') keyPan(dtReal);
  if (w) { renderer.consume(w.fx, game.mode === 'replay' && rp.speed > 2 ? () => {} : sfx); renderer.draw(w, simDt, game.ui); }
  if (game.mode === 'replay') { updateHud(); updateReplayBar(); }
  if (game.mode === 'play') { updateHud(); checkResult(); noteSeen(w); if (w.cpAt !== w.log.timeline.length) checkpoint(); }
  requestAnimationFrame(frame);
}

// ---------- boot ----------
resize();
setAegisLinks(save.settings.aegis);
applyGraphics();
startDemo();
showMenu();
requestAnimationFrame(frame);
flushCheckpoints();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') checkpoint(); else flushCheckpoints(); });
window.addEventListener('online', () => flushCheckpoints());
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

// debug hooks
window.__game = game;
window.__replay = (entry) => startReplay(entry.replay ? entry : { title: 'replay', replay: entry }); // tools: start a replay (row.replay or a replay file)
window.__save = () => save;
window.__step = (seconds) => {
  const w = game.world;
  for (let t = 0; t < seconds; t += STEP) {
    if (game.mode === 'menu') demoTick(STEP);
    w.update(STEP);
    renderer.consume(w.fx, () => {});
    renderer.updateParticles(STEP);
  }
  renderer.draw(w, 0, game.ui);
  if (game.mode === 'play') { updateHud(); checkResult(); noteSeen(w); if (w.cpAt !== w.log.timeline.length) checkpoint(); }
};
