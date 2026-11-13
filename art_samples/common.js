// Shared data for the art-style samples: screen size, noise, terrain, the scene and the HUD.
// Each style renders the same scene so they can be compared side by side.

export const CSS_W = 540, CSS_H = 1170, DPR = 2;
export const DEV_W = CSS_W * DPR, DEV_H = CSS_H * DPR;
export const HUD_TOP = 44, HUD_BOT = 180; // css px
export const LANE_X = [60, 180, 300, 420, 540];

// ---------- noise ----------
export function hash(x, y, s = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, s, o = 4) {
  let t = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < o; i++) { t += a * vnoise(x * f, y * f, s + i * 101); n += a; a *= 0.5; f *= 2; }
  return t / n;
}
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const rand = (i, s = 0) => hash(i, 7919, s);

// ---------- terrain (world units, y = distance from the bottom edge, north = up) ----------
export const CRATERS = [
  { x: 110, y: 830, r: 46 }, { x: 395, y: 1010, r: 60 }, { x: 515, y: 290, r: 26 }, { x: 245, y: 648, r: 30 },
];
export function height(x, y) {
  let h = fbm(x / 140, y / 140, 3, 3) * 14 + fbm(x / 26, y / 26, 9, 2) * 2.5;
  for (const c of CRATERS) {
    const d = Math.hypot(x - c.x, y - c.y) / c.r;
    if (d < 1.6) {
      if (d < 1) h -= (1 - d * d) * c.r * 0.32;
      h += Math.exp(-((d - 1) ** 2) / 0.03) * c.r * 0.1;
    }
  }
  return h;
}
// Unlit ground color [r,g,b] and a grass amount (used to place tufts).
export function groundColor(x, y) {
  const n = fbm(x / 90, y / 90, 1, 3), g = fbm(x / 55 + 50, y / 55, 2, 3), f = vnoise(x / 6, y / 6, 5);
  let r = 146 + (n - 0.5) * 44, gg = 132 + (n - 0.5) * 38, b = 96 + (n - 0.5) * 30;
  const gt = smooth(0.5, 0.66, g) * 0.85;
  r += (112 - r) * gt; gg += (114 - gg) * gt; b += (70 - b) * gt;
  const k = (f - 0.5) * 16; r += k; gg += k; b += k * 0.8;
  for (const lc of LANE_X) for (const off of [-15, 15]) {
    if (Math.abs(x - (lc + off)) < 3.4 && fbm(lc * 0.1 + off, y / 170, 7, 2) > 0.44) {
      const t = (Math.floor(y / 4.5) % 2) ? 0.86 : 0.92; r *= t; gg *= t; b *= t;
    }
  }
  for (const c of CRATERS) {
    const d = Math.hypot(x - c.x, y - c.y) / c.r;
    if (d < 0.95) { const t = (1 - d / 0.95) * 0.75; r += (66 - r) * t; gg += (58 - gg) * t; b += (46 - b) * t; }
  }
  return [r, gg, b, gt];
}
// Light comes from the north-west, high in the sky. Shadows fall to the south-east.
const L = (() => { const v = [-0.5, 0.42, 0.76]; const m = Math.hypot(...v); return v.map(a => a / m); })();
export function groundShade(x, y, eps = 2) {
  const hx = (height(x + eps, y) - height(x - eps, y)) / (2 * eps);
  const hy = (height(x, y + eps) - height(x, y - eps)) / (2 * eps);
  const m = Math.hypot(hx, hy, 1);
  const d = (-hx * L[0] - hy * L[1] + L[2]) / m;
  return Math.min(1.3, Math.max(0.55, d / L[2]));
}

// ---------- the scene ----------
// team 0 = player (bottom, faces north), team 1 = enemy (faces south).
export const SCENE = {
  turrets: [
    { id: 'T1', type: 'sentry', x: 60, y: 470, team: 0, aim: 'E1' },
    { id: 'T2', type: 'sentry', x: 180, y: 470, team: 0, aim: 'E2' },
    { id: 'T3', type: 'howitzer', x: 420, y: 370, team: 0, aim: 'E3' },
    { id: 'T4', type: 'arc', x: 540, y: 570, team: 0 },
  ],
  building: { type: 'sentry', x: 300, y: 470, progress: 0.55 },
  planned: [{ type: 'howitzer', x: 420, y: 470 }],
  constructor: { x: 300, y: 418 },
  mechs: [
    { id: 'P1', type: 'lancer', x: 60, y: 300, team: 0, stride: 0 },
    { id: 'P2', type: 'mortar', x: 180, y: 240, team: 0, stride: 1 },
    { id: 'P3', type: 'gunner', x: 300, y: 615, team: 0, stride: 0 },
    { id: 'P6', type: 'scout', x: 318, y: 700, team: 0, stride: 1 },
    { id: 'P4', type: 'seeker', x: 420, y: 570, team: 0, stride: 1 },
    { id: 'P5', type: 'aegis', x: 540, y: 430, team: 0, stride: 0 },
    { id: 'E1', type: 'brawler', x: 60, y: 548, team: 1, stride: 0 },
    { id: 'E2', type: 'breacher', x: 180, y: 556, team: 1, stride: 1 },
    { id: 'E3', type: 'gunner', x: 300, y: 790, team: 1, stride: 0 },
    { id: 'E4', type: 'scout', x: 420, y: 905, team: 1, stride: 1 },
    { id: 'E5', type: 'scout', x: 505, y: 790, team: 1, stride: 0 },
    { id: 'E6', type: 'lancer', x: 545, y: 1085, team: 1, stride: 1 },
  ],
  hp: { T1: 0.55, T2: 0.38, E1: 0.7, E2: 0.85, E3: 0.4, E5: 0.5, P3: 0.75, P6: 0.6 },
  wreck: { x: 240, y: 652 },
  // effects, all in world units. z is height above ground in world units.
  fx: [
    { k: 'tracer', from: 'T1', to: 'E1' }, { k: 'tracer', from: 'T2', to: 'E2' },
    { k: 'tracer', from: 'P3', to: 'E3' }, { k: 'tracer', from: 'E3', to: 'P3', back: true },
    { k: 'tracer', from: 'P6', to: 'E3' },
    { k: 'muzzle', at: 'T1' }, { k: 'muzzle', at: 'T2' }, { k: 'muzzle', at: 'P3' }, { k: 'muzzle', at: 'E3' },
    { k: 'muzzle', at: 'T3', big: true },
    { k: 'sparks', x: 60, y: 505 }, { k: 'sparks', x: 180, y: 507, big: true },
    { k: 'explosion', x: 312, y: 812, r: 46 },
    { k: 'smoke', x: 240, y: 652, r: 30 },
    { k: 'smoke', x: 330, y: 830, r: 36 },
    { k: 'missile', path: [[420, 590], [400, 650], [398, 720], [410, 790]] },
    { k: 'missile', path: [[426, 600], [452, 670], [455, 750], [440, 840]] },
    { k: 'shell', x: 360, y: 640, z: 120 },
    { k: 'slug', from: [545, 1055], to: [541, 860] },
    { k: 'zap', pts: [[540, 600], [520, 700], [505, 790], [460, 850], [420, 905]] },
    { k: 'aegis', x: 540, y: 430, r: 140 },
    { k: 'weld', x: 300, y: 470 },
  ],
};
export const byId = Object.fromEntries([...SCENE.mechs, ...SCENE.turrets].map(e => [e.id, e]));
export const heading = (e) => (e.team === 1 ? Math.PI : 0);
// clockwise angle from north, from a to b
export const aimAngle = (a, b) => Math.atan2(b.x - a.x, b.y - a.y);

export const MECH_INFO = {
  scout: { name: 'SCOUT', cost: 40 }, gunner: { name: 'GUNNER', cost: 80 }, brawler: { name: 'BRAWLER', cost: 140 },
  mortar: { name: 'MORTAR', cost: 170 }, aegis: { name: 'AEGIS', cost: 120 }, seeker: { name: 'SEEKER', cost: 150 },
  breacher: { name: 'BREACHER', cost: 190 }, lancer: { name: 'LANCER', cost: 200 },
};
export const LOADOUT = [
  { type: 'scout' }, { type: 'gunner' }, { type: 'seeker', cd: 0.55 }, { type: 'lancer', cd: 0.25 }, { type: 'aegis' },
];

// ---------- HUD (device pixels, drawn at full resolution in every style) ----------
// opts.icon(ctx, type, cx, cy, size) draws a unit icon.  opts.flat = flatter panels.
export function drawHUD(ctx, opts) {
  const S = DPR, W = DEV_W, H = DEV_H;
  const UI = '"Liberation Sans", "DejaVu Sans", sans-serif';
  const MONO = '"DejaVu Sans Mono", monospace';
  const ink = '#e4e0cc', dim = 'rgba(228,224,204,0.55)', blue = '#4ea3ff', red = '#e3533f', amber = '#f0b545';
  const panelFill = opts.flat ? 'rgba(28,31,26,0.92)' : 'rgba(14,17,13,0.80)';
  const edge = 'rgba(214,206,170,0.28)';

  function panel(x, y, w, h, c = 6 * S, fill = panelFill) {
    ctx.beginPath();
    ctx.moveTo(x + c, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - c);
    ctx.lineTo(x + w - c, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + c); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = 1 * S; ctx.strokeStyle = edge; ctx.stroke();
  }
  function text(t, x, y, size, color = ink, align = 'left', font = UI, weight = '700') {
    ctx.font = `${weight} ${size * S}px ${font}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.fillText(t, x, y);
  }
  function bar(x, y, w, h, frac, color, segs = 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color; ctx.fillRect(x + S, y + S, (w - 2 * S) * frac, h - 2 * S);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x + S, y + S, (w - 2 * S) * frac, (h - 2 * S) * 0.4);
    if (segs) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; for (let i = 1; i < segs; i++) ctx.fillRect(x + (w * i) / segs, y, S, h); }
    ctx.strokeStyle = edge; ctx.lineWidth = S; ctx.strokeRect(x, y, w, h);
  }

  // ---- top bar
  if (!opts.flat) { const g = ctx.createLinearGradient(0, 0, 0, 70 * S); g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, 70 * S); }
  panel(6 * S, 6 * S, 34 * S, 32 * S);
  ctx.fillStyle = ink; ctx.fillRect(17 * S, 15 * S, 4 * S, 14 * S); ctx.fillRect(25 * S, 15 * S, 4 * S, 14 * S);
  panel(46 * S, 6 * S, W - 92 * S, 32 * S);
  const mid = W / 2;
  text('BASE', 56 * S, 15 * S, 9, blue); bar(56 * S, 21 * S, mid - 110 * S, 10 * S, 0.78, blue, 10);
  text('2340', 56 * S + mid - 110 * S, 15 * S, 9, dim, 'right', MONO, '400');
  text('STAGE 05', mid, 15 * S, 9, dim, 'center');
  text('DUST BELT', mid, 28 * S, 11, ink, 'center');
  text('HOSTILE', W - 56 * S, 15 * S, 9, red, 'right'); bar(mid + 54 * S, 21 * S, mid - 110 * S, 10 * S, 0.61, red, 10);
  text('2196', mid + 54 * S, 15 * S, 9, dim, 'left', MONO, '400');
  panel(W - 40 * S, 6 * S, 34 * S, 32 * S);
  text('1×', W - 23 * S, 22 * S, 12, ink, 'center', MONO);

  // ---- minimap (vertical strip on the right)
  const mx = W - 30 * S, my = 48 * S, mw = 24 * S, mh = 170 * S;
  panel(mx - 3 * S, my - 3 * S, mw + 6 * S, mh + 6 * S, 3 * S);
  ctx.fillStyle = 'rgba(120,112,80,0.35)'; ctx.fillRect(mx, my, mw, mh);
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; for (let i = 1; i < 5; i++) ctx.fillRect(mx + (mw * i) / 5, my, 1, mh);
  ctx.fillStyle = blue; ctx.fillRect(mx, my + mh - 4 * S, mw, 4 * S);
  ctx.fillStyle = red; ctx.fillRect(mx, my, mw, 4 * S);
  const my2 = (wy) => my + mh - (wy / 2400) * mh;
  for (const e of [...SCENE.mechs, ...SCENE.turrets]) {
    ctx.fillStyle = e.team ? red : blue;
    ctx.fillRect(mx + (e.x / 600) * mw - S, my2(e.y) - S, 2.5 * S, 2.5 * S);
  }
  for (const [lx, ly] of [[1, 1950], [3, 1950], [2, 2050], [0, 2100], [4, 2050]]) { ctx.fillStyle = red; ctx.fillRect(mx + ((lx * 120 + 60) / 600) * mw - 1.5 * S, my2(ly) - 1.5 * S, 3 * S, 3 * S); }
  ctx.strokeStyle = ink; ctx.lineWidth = S; ctx.strokeRect(mx + 0.5, my2(1240), mw - 1, my2(0) - my2(1240));

  // ---- bottom panel
  const by = H - HUD_BOT * S;
  if (!opts.flat) { const g = ctx.createLinearGradient(0, by - 30 * S, 0, by); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.5)'); ctx.fillStyle = g; ctx.fillRect(0, by - 30 * S, W, 30 * S); }
  ctx.fillStyle = opts.flat ? 'rgba(24,27,22,0.96)' : 'rgba(12,15,11,0.86)'; ctx.fillRect(0, by, W, H - by);
  ctx.fillStyle = edge; ctx.fillRect(0, by, W, S);

  // energy + mode toggle + upgrades
  const ey = by + 8 * S;
  text('⚡', 12 * S, ey + 8 * S, 12, amber, 'left', UI, '400');
  bar(28 * S, ey + 2 * S, W - 250 * S, 13 * S, 214 / 300, amber, 6);
  text('214/300', 28 * S + (W - 250 * S) * (214 / 300) - 4 * S, ey + 9 * S, 9, '#1b1a12', 'right', MONO);
  text('+8/s', W - 216 * S, ey + 9 * S, 9, dim, 'left', MONO, '400');
  const tx = W - 178 * S;
  panel(tx, ey, 128 * S, 18 * S, 4 * S);
  ctx.fillStyle = 'rgba(78,163,255,0.85)'; ctx.fillRect(tx + 2 * S, ey + 2 * S, 56 * S, 14 * S);
  text('HOLD', tx + 30 * S, ey + 9 * S, 9, '#08121e', 'center');
  text('ADVANCE', tx + 93 * S, ey + 9 * S, 9, dim, 'center');
  text('F', tx + 124 * S, ey + 9 * S, 7, dim, 'right', MONO, '400');
  panel(W - 44 * S, ey - 2 * S, 38 * S, 22 * S, 4 * S);
  // wrench glyph
  ctx.save(); ctx.translate(W - 25 * S, ey + 9 * S); ctx.rotate(-0.8); ctx.fillStyle = ink;
  ctx.fillRect(-1.5 * S, -2 * S, 3 * S, 11 * S); ctx.beginPath(); ctx.arc(0, -4 * S, 4.5 * S, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = panelFill; ctx.fillRect(-1.5 * S, -9.5 * S, 3 * S, 5 * S); ctx.restore();

  // lane strip
  const ly = by + 32 * S, lw = (W - 16 * S) / 5;
  for (let i = 0; i < 5; i++) {
    const x = 8 * S + i * lw, active = i === 2;
    panel(x + 2 * S, ly, lw - 4 * S, 22 * S, 4 * S, active ? 'rgba(78,163,255,0.85)' : panelFill);
    const c = active ? '#08121e' : dim;
    ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x + lw / 2 - 5 * S, ly + 15 * S); ctx.lineTo(x + lw / 2, ly + 7 * S); ctx.lineTo(x + lw / 2 + 5 * S, ly + 15 * S); ctx.closePath(); ctx.fill();
    text(`L${i + 1}`, x + 10 * S, ly + 11 * S, 8, c, 'left', MONO, '400');
  }

  // tabs + cards
  const cy0 = by + 62 * S;
  panel(6 * S, cy0, 30 * S, 52 * S, 4 * S, 'rgba(78,163,255,0.85)');
  panel(6 * S, cy0 + 56 * S, 30 * S, 52 * S, 4 * S);
  ctx.save(); ctx.translate(21 * S, cy0 + 26 * S); ctx.rotate(-Math.PI / 2); text('MECHS', 0, 0, 8, '#08121e', 'center'); ctx.restore();
  ctx.save(); ctx.translate(21 * S, cy0 + 82 * S); ctx.rotate(-Math.PI / 2); text('TURRETS', 0, 0, 8, dim, 'center'); ctx.restore();
  const cw = 62 * S, chh = 108 * S;
  LOADOUT.forEach((c, i) => {
    const x = 42 * S + i * (cw + 4 * S), info = MECH_INFO[c.type];
    const afford = info.cost <= 214;
    panel(x, cy0, cw, chh, 6 * S, opts.flat ? 'rgba(46,50,42,0.95)' : 'rgba(30,35,28,0.9)');
    ctx.save(); ctx.beginPath(); ctx.rect(x + 2 * S, cy0 + 2 * S, cw - 4 * S, 70 * S); ctx.clip();
    if (!opts.flat) { const g = ctx.createRadialGradient(x + cw / 2, cy0 + 36 * S, 4 * S, x + cw / 2, cy0 + 36 * S, 44 * S); g.addColorStop(0, 'rgba(120,130,110,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x, cy0, cw, 72 * S); }
    opts.icon(ctx, c.type, x + cw / 2, cy0 + 38 * S, 58 * S);
    ctx.restore();
    text(String(i + 1), x + 5 * S, cy0 + 9 * S, 8, dim, 'left', MONO, '400');
    text(info.name, x + cw / 2, cy0 + 80 * S, 8.5, ink, 'center');
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x + 6 * S, cy0 + 89 * S, cw - 12 * S, 14 * S);
    text(`⚡${info.cost}`, x + cw / 2, cy0 + 96.5 * S, 9, afford ? amber : '#9a6a5a', 'center', MONO);
    if (c.cd) {
      ctx.fillStyle = 'rgba(5,7,5,0.62)'; ctx.fillRect(x + S, cy0 + S, cw - 2 * S, (chh - 2 * S) * c.cd);
      ctx.fillStyle = amber; ctx.fillRect(x + S, cy0 + S + (chh - 2 * S) * c.cd - S, cw - 2 * S, S);
    }
  });

  // specials
  const sx0 = 42 * S + 5 * (cw + 4 * S) + 4 * S;
  const sp = [['BOMB', 'Q', 0, 'bomb'], ['EMP', 'E', 0.45, 'emp'], ['SURGE', 'R', 0.8, 'surge']];
  const pw = W - sx0 - 6 * S, ph = 33 * S;
  sp.forEach(([name, key, cd, kind], i) => {
    const x = sx0, y = cy0 + i * (ph + 4.5 * S);
    panel(x, y, pw, ph, 5 * S, opts.flat ? 'rgba(46,50,42,0.95)' : 'rgba(30,35,28,0.9)');
    const ccx = x + 17 * S, ccy = y + ph / 2;
    ctx.beginPath(); ctx.arc(ccx, ccy, 12 * S, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill();
    if (cd === 0) { ctx.strokeStyle = amber; ctx.lineWidth = 2 * S; ctx.stroke(); if (!opts.flat) { ctx.shadowColor = amber; ctx.shadowBlur = 10 * S; ctx.stroke(); ctx.shadowBlur = 0; } }
    else {
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2 * S; ctx.stroke();
      ctx.beginPath(); ctx.arc(ccx, ccy, 12 * S, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - cd)); ctx.strokeStyle = 'rgba(240,181,69,0.6)'; ctx.stroke();
    }
    ctx.fillStyle = cd === 0 ? ink : dim; ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.6 * S;
    if (kind === 'bomb') { ctx.beginPath(); ctx.ellipse(ccx, ccy + S, 3.5 * S, 6 * S, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(ccx - 4 * S, ccy - 7 * S, 8 * S, 2 * S); }
    if (kind === 'emp') { ctx.beginPath(); ctx.moveTo(ccx + 2 * S, ccy - 8 * S); ctx.lineTo(ccx - 4 * S, ccy + S); ctx.lineTo(ccx, ccy + S); ctx.lineTo(ccx - 2 * S, ccy + 8 * S); ctx.lineTo(ccx + 4 * S, ccy - S); ctx.lineTo(ccx, ccy - S); ctx.closePath(); ctx.fill(); }
    if (kind === 'surge') { ctx.strokeRect(ccx - 4 * S, ccy - 6 * S, 8 * S, 13 * S); ctx.fillRect(ccx - 2 * S, ccy - 8 * S, 4 * S, 2 * S); ctx.fillRect(ccx - 2.5 * S, ccy - 1 * S - 3 * S, 5 * S, 1.5 * S); ctx.fillRect(ccx - 0.75 * S, ccy - 5.5 * S, 1.5 * S, 5 * S); }
    text(name, x + 34 * S, y + 12 * S, 8.5, cd === 0 ? ink : dim);
    text(cd === 0 ? 'READY' : `${Math.round(cd * 40)}s`, x + 34 * S, y + 23 * S, 7.5, cd === 0 ? amber : dim, 'left', MONO, '400');
    text(key, x + pw - 6 * S, y + 9 * S, 7, dim, 'right', MONO, '400');
  });

  // style label
  if (opts.label) {
    ctx.font = `700 ${9 * S}px ${UI}`; const w = ctx.measureText(opts.label).width + 14 * S;
    panel(46 * S, 44 * S, w, 18 * S, 4 * S, 'rgba(0,0,0,0.6)');
    text(opts.label, 53 * S, 53 * S, 9, amber);
  }
}
