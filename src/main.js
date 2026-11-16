import {
  FIELD, LANES, BASE_FACE, MECHS, TURRETS, SPECIALS, BASE_UPGRADES, PERKS, STAGES, CONSTRUCTOR, MAX_UNIT_LEVEL, MAX_TECH,
  LOADOUT_SIZE, LEVEL_STEP, EXPERIMENTS, OVERTIME_BONUS, laneOf, rowOf, cellY, stageDef, stageReward, lossReward, unlockedSet, techCost, sellRefund, MECH_TYPES, TURRET_TYPES, QUEUE, ROLES, TRAITS,
} from './data.js';
import { World } from './world.js';
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
// dev experiment (EXPERIMENTS in data.js): only on dev builds; the tag reads "DEV: <experiment>" while one is chosen
const expKey = () => (IS_DEV && EXPERIMENTS[save.settings.exp] ? save.settings.exp : 'off');
function updateDevTag() {
  const tag = document.getElementById('dev-tag');
  if (tag) tag.textContent = expKey() === 'off' ? 'DEV' : `DEV: ${EXPERIMENTS[expKey()].name}`;
}
updateDevTag();

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
  if (game.mode !== 'play') return;
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
function startStage(i) {
  initAudio();
  showLoadout(i); // always: it also shows the enemy intel (with 5 or fewer mechs unlocked, all are picked)
}
// ---------- enemy intel ----------
// Enemy mech types the player has fought at least once; the rest show as '?' in the intel. A save from before the
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
function intelHtml(i) {
  const st = stageDef(i), seen = seenSet();
  const units = st.roster.map((t) => seen.has(t)
    ? `<span class="iu"><canvas width="72" height="72" data-icon="mech:${t}:1"></canvas><small>${MECHS[t].name}</small></span>`
    : '<span class="iu unknown"><i>?</i><small>Unknown</small></span>').join('');
  const tc = {};
  for (const [t] of st.turrets || []) tc[t] = (tc[t] || 0) + 1;
  const turrets = Object.entries(tc).map(([t, n]) => `${n}× ${TURRETS[t].name}`).join(', ') || 'none';
  const base = Object.keys(BASE_UPGRADES).map((k) => `<span class="ib">${BASE_UPGRADES[k].name}${pips((st.base || {})[k] || 0, BASE_UPGRADES[k].costs.length)}</span>`).join('');
  return `<div class="intel">
      <div class="section-t">INTEL · ENEMY <span class="lvl-tag">LEVEL ${st.lvl}</span></div>
      <div class="intel-units">${units}</div>
      <div class="intel-row"><span class="k">Turrets</span> ${turrets}</div>
      <div class="intel-row"><span class="k">Base</span> ${base}</div>
    </div>`;
}
function launch(i) {
  tryFullscreen();
  const u = unlocked();
  game.stageIndex = i;
  game.mode = 'play';
  game.world = new World(stageDef(i), save, { mechs: currentLoadout(), turrets: u.turrets, specials: u.specials }, { exp: expKey() });
  game.world.battleId = randomHex(8);
  game.paused = false;
  game.resultShown = false;
  game.ui = freshUi();
  renderer.particles = [];
  screen.innerHTML = ''; screen.className = '';
  hud.hidden = false;
  resize();
  renderer.camY = -20; renderer.clampCam();
  buildHud();
  const st = stageDef(i);
  $('#stage-no').textContent = st.endless ? 'ENDLESS' : `STAGE ${String(i + 1).padStart(2, '0')}`;
  $('#stage-name').textContent = st.endless ? `WAVE ${i - STAGES.length + 1}` : st.name.toUpperCase();
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
// timeline entries: [time s, energy, player base HP %, enemy base HP %, player mechs, enemy mechs]
function summary(result, stars = 0) {
  const w = game.world, i = game.stageIndex, st = w.stage, pct = (b) => Math.round(100 * Math.max(0, b.hp) / b.maxHp);
  const body = {
    id: w.battleId, device: deviceId(), ...(save.settings.name ? { name: save.settings.name } : {}),
    // fmt 3: stage, lanes, rows and groups count from 1; in events side 1 = player, 0 = enemy; per-side data is named.
    // (fmt 2: player/enemy as [player, enemy] lists and event side 0 = player; fmt 1, the first dev battles: also 0-based.)
    fmt: 3, ...(w.expKey !== 'off' ? { exp: w.expKey } : {}), v: VERSION, build: IS_DEV ? 'dev' : 'release', stage: i + 1, stageName: st.name, result, stars,
    time: Math.round(w.time), kills: w.stats.kills, deployed: w.stats.deployed,
    baseHp: { player: pct(w.bases[0]), enemy: pct(w.bases[1]) }, energyLeft: Math.round(w.energy),
    loadout: w.unlocked.mechs, tech: { ...save.tech }, perks: { ...save.perks }, baseLvl: { ...w.baseLvl },
    enemyStage: { lvl: st.lvl, regen: st.regen, base: st.base || {} },
    mechs: duo(w.log.mechs), turrets: duo(w.log.turrets), lost: duo(w.log.lost), specials: w.log.specials,
    upgrades: w.log.upgrades, timeline: [...w.log.timeline, w.sample(false)], events: w.log.events,
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
  const id = w.battleId;
  if (!save.settings.stats || (result === 'quit' && w.time < MIN_TIME)) { checkpoints((cp) => { delete cp[id]; }); return; }
  const body = summary(result, stars);
  checkpoints((cp) => { cp[id] = { at: Date.now(), body }; });
  deliver(id, body);
}
function checkpoint() {
  const w = game.world;
  if (!save.settings.stats || game.mode !== 'play' || !w || !w.battleId || w.statsSent || w.result || w.time < MIN_TIME) return;
  checkpoints((cp) => { cp[w.battleId] = { at: Date.now(), body: summary('abandoned') }; });
  w.cpAt = w.log.timeline.length;
}
// send pending summaries: battles left without a result and results the server hasn't confirmed yet
// (not the checkpoint of the battle that is still running)
function flushCheckpoints() {
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
  if (to === 'stages') showStages(); else if (to === 'menu') showMenu();
}
function finishStage() {
  const w = game.world, win = w.result === 'win', i = game.stageIndex;
  const b = w.bases[0], hpK = b.hp / b.maxHp;
  const stars = win ? 1 + (hpK > 0.5 ? 1 : 0) + (hpK > 0.85 ? 1 : 0) : 0;
  const reward = win ? stageReward(i, stars) : lossReward(w.stats.kills);
  const before = unlocked();
  if (win) {
    if (i < STAGES.length) { save.cleared = Math.max(save.cleared, i + 1); save.stars[i] = Math.max(save.stars[i] || 0, stars); }
    else save.endlessBest = Math.max(save.endlessBest, i - STAGES.length + 1);
  }
  save.credits += reward;
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
      <p class="result-stats">+<span class="credits">${reward}</span> credits</p>
      ${fresh.length ? `<p class="unlock">Unlocked: ${fresh.join(', ')}</p>` : ''}
      <div class="btn-row">
        ${win ? '<button class="btn primary" data-a="next">Next</button>' : ''}
        <button class="btn" data-a="retry">Retry</button>
        <button class="btn" data-a="workshop">Workshop</button>
        <button class="btn" data-a="stages">Stages</button>
      </div>
    </div>`;
  bind({
    next: () => startStage(i + 1),
    retry: () => startStage(i),
    workshop: () => { quitToMenu('none'); showWorkshop(); },
    stages: () => quitToMenu('stages'),
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
        <button class="btn" data-a="workshop">Workshop · <span class="credits">${save.credits}¢</span></button>
        <button class="btn" data-a="how">How to play</button>
        <button class="btn" data-a="settings">Settings</button>
      </div>
      <p class="version">v${VERSION}</p>
    </div>`;
  bind({ play: () => (save.cleared === 0 ? startStage(0) : showStages()), workshop: showWorkshop, how: showHelp, settings: showSettings });
}
function showStages() {
  screen.className = '';
  const endlessOpen = save.cleared >= STAGES.length, eFrom = Math.max(1, save.endlessBest);
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
        <button class="btn ${endlessOpen ? 'primary' : ''}" data-a="endless" ${endlessOpen ? '' : 'disabled'}>Endless ${endlessOpen ? `· from ${eFrom}` : '· clear all 12'}</button>
        <button class="btn" data-a="workshop">Workshop · <span class="credits">${save.credits}¢</span></button>
      </div>
    </div>`;
  bind({ back: showMenu, go: (el) => startStage(+el.dataset.i), endless: () => startStage(STAGES.length + eFrom - 1), workshop: showWorkshop });
}
function showLoadout(i) {
  const u = unlocked().mechs;
  let pick = currentLoadout();
  const render = () => {
    screen.className = '';
    screen.innerHTML = `
      <div class="panel">
        <div class="head"><div><h2>Loadout</h2><p class="sub">${stageDef(i).name}: ${u.length > LOADOUT_SIZE ? `pick ${LOADOUT_SIZE} mechs to bring (${pick.length}/${LOADOUT_SIZE})` : 'your mechs'}.</p></div>
          <button class="btn small" data-a="back">Back</button></div>
        ${intelHtml(i)}
        <div class="section-t">YOUR MECHS</div>
        <div class="loadout">
          ${u.map((t) => { const n = pick.indexOf(t); return `<button class="lo ${n >= 0 ? 'on' : ''}" data-a="tog" data-t="${t}">${n >= 0 ? `<span class="slot">${n + 1}</span>` : ''}
            <canvas width="108" height="108" data-icon="mech:${t}"></canvas><b>${MECHS[t].name}</b><small>⚡${MECHS[t].cost}</small></button>`; }).join('')}
        </div>
        <div class="btn-row"><button class="btn primary" data-a="go" ${pick.length === Math.min(LOADOUT_SIZE, u.length) ? '' : 'disabled'}>Deploy</button></div>
      </div>`;
    drawIcons(screen);
    bind({
      back: showStages,
      tog: (el) => { const t = el.dataset.t; pick = pick.includes(t) ? pick.filter((x) => x !== t) : pick.length < LOADOUT_SIZE ? [...pick, t] : pick; render(); },
      go: () => { save.loadout = pick; writeSave(save); launch(i); },
    });
  };
  render();
}
function showWorkshop() {
  screen.className = '';
  const u = unlocked();
  const types = [...u.mechs.map((t) => ['mech', t, MECHS[t]]), ...u.turrets.map((t) => ['turret', t, TURRETS[t]]), ['constructor', 'builder', { ...CONSTRUCTOR, desc: 'More HP and faster building.' }]];
  screen.innerHTML = `
    <div class="panel">
      <div class="head"><div><h2>Workshop</h2><p class="sub">Permanent upgrades, paid with credits from every battle.</p></div>
        <div><span class="credits">${save.credits}¢</span> <button class="btn small" data-a="back">Back</button></div></div>
      <div class="section-t">VETERAN TRAINING: UNITS START AT A HIGHER LEVEL</div>
      <div class="list">
        ${types.map(([k, t, def]) => {
          const lv = save.tech[t] || 0, c = lv < MAX_TECH ? techCost(lv) : null;
          return `<div class="item"><canvas width="92" height="92" data-icon="${k}:${t}"></canvas>
            <div class="info"><b>${def.name}${pips(lv, MAX_TECH)}</b><small>${def.desc}</small></div>
            <button class="btn small" data-a="tech" data-t="${t}" ${c == null || save.credits < c ? 'disabled' : ''}>${c == null ? 'MAX' : c + '¢'}</button></div>`;
        }).join('')}
      </div>
      <div class="section-t">COMMAND PERKS</div>
      <div class="list">
        ${Object.entries(PERKS).map(([k, p]) => {
          const lv = save.perks[k], c = p.costs[lv];
          return `<div class="item"><div class="info"><b>${p.name}${pips(lv, p.costs.length)}</b><small>${p.desc}</small></div>
            <button class="btn small" data-a="perk" data-k="${k}" ${c == null || save.credits < c ? 'disabled' : ''}>${c == null ? 'MAX' : c + '¢'}</button></div>`;
        }).join('')}
      </div>
    </div>`;
  drawIcons(screen);
  bind({
    back: showMenu,
    tech: (el) => { const t = el.dataset.t, lv = save.tech[t] || 0, c = techCost(lv); if (lv < MAX_TECH && save.credits >= c) { save.credits -= c; save.tech[t] = lv + 1; writeSave(save); playSfx('upgrade'); } showWorkshop(); },
    perk: (el) => { const k = el.dataset.k, lv = save.perks[k], c = PERKS[k].costs[lv]; if (c != null && save.credits >= c) { save.credits -= c; save.perks[k]++; writeSave(save); playSfx('upgrade'); } showWorkshop(); },
  });
}
function showHelp() {
  screen.className = '';
  const items = [
    ['Goal', 'Destroy the enemy base at the top before they destroy yours at the bottom.'],
    ['Lanes', 'The field has 5 lanes. Pick the active lane with the L1–L5 buttons, then tap a mech card to deploy it into that lane.'],
    ['Deploy queue', 'Not enough energy, or the card is cooling down? The tap is queued (up to 5) in the lane you picked. Orders come out strictly in order as energy allows; energy is only paid when a mech deploys. Tap a queued mech to cancel it, CLEAR cancels all, Backspace removes the last.'],
    ['Lanes and reach', 'A mech can only shoot at its own lane and the two lanes next to it. Turrets and bases reach every lane.'],
    ['Roles', 'Every mech has a role that decides how it moves. Pick what you deploy and where:'],
    ...Object.entries(ROLES).map(([k, r]) => [r.name, `${r.desc} ${MECH_TYPES.filter((t) => MECHS[t].role === k).map((t) => MECHS[t].name).join(', ')}.`]),
    ['Traits', `A trait changes one rule of a mech's role. ${MECH_TYPES.filter((t) => MECHS[t].traits.length).map((t) => `${MECHS[t].name}: ${MECHS[t].traits.map((k) => TRAITS[k].name.toLowerCase()).join(', ')}`).join('. ')}.`],
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
      ${IS_DEV ? `<div class="toggle"><span>Experiment <small class="sub">(dev only, one at a time)</small></span><select id="exp" class="name-input">${Object.entries(EXPERIMENTS).map(([k, x]) => `<option value="${k}"${k === expKey() ? ' selected' : ''}>${x.name}</option>`).join('')}</select></div>` : ''}
      <div class="toggle"><span>Fullscreen</span><button class="btn small" data-a="fs">Toggle</button></div>
      <div class="toggle"><span>Reset all progress</span><button class="btn small danger" data-a="reset">Reset</button></div>
      <p class="sub" style="margin-top:12px">Iron Defense v${VERSION}</p>
    </div>`;
  bind({
    back: showMenu,
    sound: () => { save.settings.sound = !save.settings.sound; setSound(save.settings.sound); writeSave(save); showSettings(); },
    fs: () => { if (document.fullscreenElement) document.exitFullscreen(); else tryFullscreen(true); },
    aegis: () => { cycleAegis(); showSettings(); },
    stats: () => { save.settings.stats = !save.settings.stats; writeSave(save); showSettings(); },
    gfx: async () => { save.settings.graphics = save.settings.graphics === 'simple' ? 'voxel' : 'simple'; writeSave(save); showSettings(); await applyGraphics(); },
    reset: (el) => { if (el.dataset.confirm) { const name = save.settings.name; save = resetSave(); save.settings.name = name; writeSave(save); setSound(true); showSettings(); } else { el.dataset.confirm = '1'; el.textContent = 'Tap again to confirm'; } },
  });
  $('#exp')?.addEventListener('change', (e) => { save.settings.exp = e.target.value; writeSave(save); updateDevTag(); });
  const nameIn = $('#pname');
  nameIn.value = save.settings.name || '';
  nameIn.addEventListener('change', () => { save.settings.name = nameIn.value.trim().slice(0, 20); writeSave(save); });
  nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameIn.blur(); });
}
function showPause() {
  game.paused = true;
  screen.className = '';
  screen.innerHTML = `
    <div class="panel"><h2 style="text-align:center">Paused</h2><p class="sub" style="text-align:center">${stageDef(game.stageIndex).name}</p>
      <div class="menu-btns" style="margin:0 auto">
        <button class="btn primary" data-a="resume">Resume</button>
        <button class="btn" data-a="restart">Restart</button>
        <button class="btn" data-a="sound">Sound: ${save.settings.sound ? 'On' : 'Off'}</button>
        <button class="btn" data-a="aegis">Aegis links: ${AEGIS_NAMES[save.settings.aegis] || AEGIS_NAMES.hit}</button>
        <button class="btn" data-a="quit">Quit to stages</button>
      </div></div>`;
  bind({
    resume, restart: () => { sendStats('quit'); startStage(game.stageIndex); },
    sound: () => { save.settings.sound = !save.settings.sound; setSound(save.settings.sound); writeSave(save); showPause(); },
    aegis: () => { cycleAegis(); showPause(); },
    quit: () => quitToMenu('stages'),
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

// ---------- HUD ----------
let cardEls = [], specialEls = [], laneEls = [];
function buildHud() {
  const w = game.world;
  $('#lanes').innerHTML = Array.from({ length: LANES }, (_, i) => `<button data-l="${i}">L${i + 1}</button>`).join('');
  laneEls = [...$('#lanes').children];
  laneEls.forEach((b) => b.addEventListener('click', () => { initAudio(); w.setLane(+b.dataset.l); playSfx('click'); }));
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
      if (renderer.camY > 400) { renderer.camY = 100; renderer.clampCam(); }
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
  setText($('#regen'), 'rg', w.overtime ? `+${w.regen}+${OVERTIME_BONUS}/s` : `+${w.regen}/s`);
  if (w.overtime && !game.ui.otShown) { game.ui.otShown = true; toast(`OVERTIME: +${OVERTIME_BONUS} energy/s for both sides`); }
  laneEls.forEach((b, i) => b.classList.toggle('on', i === w.activeLane));
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
  const sig = q.map((o) => o.type + o.lane).join(',');
  if (sig !== queueSig) {
    queueSig = sig;
    box.hidden = !q.length;
    const items = box.querySelector('.qitems');
    items.innerHTML = q.map((o, i) => `<button class="q${i ? '' : ' head'}" data-i="${i}" aria-label="Cancel ${MECHS[o.type].name}"><canvas width="80" height="68" data-icon="mech:${o.type}"></canvas>${i ? '' : '<i class="fill"></i>'}<span class="ln">${o.lane + 1}</span><span class="x">✕</span></button>`).join('')
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
  setText(box.querySelector('.qinfo'), 'qi', `${q.length} / ${QUEUE.max}\n${w.energy < cost ? `next ⚡${Math.ceil(cost - w.energy)}` : cd > 0 ? `wait ${Math.ceil(cd)}s` : 'deploying'}`);
}
$('#queue .qclear').addEventListener('click', () => { const w = game.world; if (w) { w.clearQueue(); renderer.consume(w.fx, sfx); } });
let toastTimer = 0;
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
$('#btn-pause').addEventListener('click', () => { if (!game.world.result) showPause(); });
$('#btn-upg').addEventListener('click', () => { initAudio(); playSfx('click'); showUpgrades(); });
$('#btn-speed').addEventListener('click', () => {
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
  if (drag.id !== e.pointerId || game.mode !== 'play') return;
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
  if (game.mode !== 'play') return;
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
  if (p.y > 0 && p.y < BASE_FACE[0] + 150) { w.setLane(lane); playSfx('click'); }
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
  const k = e.key.toLowerCase();
  keys.add(k);
  if (game.mode !== 'play') return;
  const w = game.world;
  if (k === ' ' || k === 'escape' || k === 'p') {
    e.preventDefault();
    if (w.result) return;
    if (game.paused) resume(); else showPause();
    return;
  }
  if (game.paused) return;
  if (e.shiftKey && /^digit[1-5]$/i.test(e.code)) { w.setLane(+e.code.slice(5) - 1); return; }
  if (k >= '1' && k <= '5') {
    const list = game.ui.tab === 'mechs' ? w.unlocked.mechs : w.unlocked.turrets;
    const t = list[+k - 1];
    if (t) onCard(t, game.ui.tab === 'mechs');
  }
  const sp = { q: 'bomb', e: 'emp', r: 'surge' }[k];
  if (sp && w.unlocked.specials.includes(sp)) useSpecial(sp);
  if (k === 'backspace' && w.queue.length) { e.preventDefault(); w.cancelQueued(w.queue.length - 1); renderer.consume(w.fx, sfx); }
  if (k === 'u') showUpgrades();
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
  const playing = game.mode === 'play' && !hud.hidden;
  const top = playing ? $('.top').getBoundingClientRect().bottom - r.top + 4 : 0;
  const bottom = playing ? $('.bottom').getBoundingClientRect().top - r.top : r.height;
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
  if (w && !game.paused) {
    acc += dtReal * (game.mode === 'play' ? game.speed : 1);
    let steps = 0;
    while (acc >= STEP && steps < 12) {
      if (game.mode === 'menu') demoTick(STEP);
      w.update(STEP);
      acc -= STEP; steps++; simDt += STEP;
    }
    if (steps >= 12) acc = 0;
  }
  if (game.mode === 'play' && !game.paused) keyPan(dtReal);
  if (w) { renderer.consume(w.fx, sfx); renderer.draw(w, simDt, game.ui); }
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
