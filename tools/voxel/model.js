// Voxel models + renderer for baking sprites (build time only, not loaded by the game).
// Ported from art_samples/fine.js (style 7). Mechs are split into legs and upper body, because the
// torso turns independently in the game. Units: world units; models face +y (north).
import { FIELD, LANES, ROWS, BASE_FACE, cellY, laneX } from '../../src/data.js';

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
const LANE_X = Array.from({ length: LANES }, (_, l) => laneX(l));

// ---------- terrain: the whole field ----------
export const CRATERS = [];
for (let i = 0; i < 8; i++) CRATERS.push({ x: 50 + rand(i, 61) * 500, y: 380 + rand(i, 62) * 1640, r: 20 + rand(i, 63) * 32 });
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

// ---------- palette (index 0 = empty) ----------
export const PAL = [null]; const PIDX = new Map();
function col(hex, emi = false) {
  const k = hex * 2 + (emi ? 1 : 0);
  if (!PIDX.has(k)) { PIDX.set(k, PAL.length); PAL.push({ r: (hex >> 16) & 255, g: (hex >> 8) & 255, b: hex & 255, emi }); }
  return PIDX.get(k);
}
export const TEAM = [
  { base: col(0x6f6e48), dark: col(0x45452f), light: col(0x8f8d63), metal: col(0x4d4f4a), gun: col(0x2c2e2f), acc: col(0x3e8de0), glow: col(0x8fdcff, true) },
  { base: col(0x5d6062), dark: col(0x3b3d3f), light: col(0x7e8181), metal: col(0x45474a), gun: col(0x27282a), acc: col(0xc8443a), glow: col(0xff7a55, true) },
];
const GLASS = col(0x1c2a30), CONC = col(0xa9a69a), CONC2 = col(0x9b988c), CONC3 = col(0x8a877c), SANDB = col(0xb3a57d), SANDB2 = col(0xa29570),
  YEL = col(0xc0a24a), HAZY = col(0xc9a83f), HAZK = col(0x2a2926), BRASS = col(0xb89a5a), COPPER = col(0xa86f3c), CYAN = col(0x9ff4ff, true),
  WHITE_E = col(0xeaffff, true), ORANGE_E = col(0xffa040, true), RED_E = col(0xff5040, true), BLACK = col(0x121212), TANK = col(0xc2bfb2),
  OLIVEBOX = col(0x5e6040), RUBBER = col(0x2a2a28), HANGAR = col(0x66684a), HANGAR2 = col(0x5a5c41), STEEL = col(0x3d4144), BURNT = col(0x38332f);
const TUFT = [col(0x9c9658), col(0xb0a663), col(0x86834e), col(0xbfb27a), col(0x948f55)];
const ROCK = [col(0x9a978e), col(0x85827a)];
const hazard = (x, y, z) => (Math.floor((x + z) / 3) % 2 ? HAZY : HAZK);

// ---------- primitives (world units; z = bottom for boxes / z-cylinders, center height otherwise) ----------
const B = (x, y, z, w, d, h, c, o = {}) => ({ t: 'b', x, y, z: z + h / 2, ex: [w / 2, d / 2, h / 2], c, ...o });
const C = (x, y, z, r, h, c, o = {}) => {
  const ax = o.ax || 'z';
  return { t: 'c', ax, x, y, z: ax === 'z' ? z + h / 2 : z, r, hl: h / 2, c, ex: ax === 'z' ? [r, r, h / 2] : ax === 'y' ? [r, h / 2, r] : [h / 2, r, r], ...o };
};
const S = (x, y, z, r, c) => ({ t: 's', x, y, z, r, c, ex: [r, r, r] });


// ---------- models (facing +y, model units) ----------
function legs(P, lx, fw, fl, hip, st) {
  const o = [];
  for (const [s, f] of [[-1, st], [1, -st]]) {
    o.push(B(s * lx, f, 0, fw, fl, 2.5, P.dark), B(s * lx, f + fl / 2, 0, fw * 0.8, 2.5, 1.8, P.metal), B(s * lx, f - fl / 2 + 1, 0, fw * 0.6, 2, 3, P.metal));
    o.push(C(s * lx, f, 2.5, fw * 0.28, 2.5, P.metal));
    o.push(B(s * lx, f * 0.6 - 1.5, 4, fw * 0.6, fw * 0.7, hip * 0.5, P.base, { rx: -0.3 }));
    o.push(S(s * lx, f * 0.45 + 0.8, hip * 0.55, fw * 0.42, P.metal));
    o.push(B(s * lx * 0.9, f * 0.25, hip * 0.5, fw * 0.65, fw * 0.75, hip * 0.5, P.base, { rx: 0.25 }));
  }
  o.push(B(0, 0, hip - 1.5, lx * 2, fw * 0.7, 3, P.metal));
  return o;
}
export const LEGS = {
  scout: (P, st) => legs(P, 6, 5, 9, 11, st),
  gunner: (P, st) => legs(P, 9, 7, 12, 15, st),
  brawler: (P, st) => legs(P, 13, 10, 15, 15, st),
  mortar: (P, st) => legs(P, 10, 7, 12, 13, st),
  aegis: (P, st) => legs(P, 9, 7, 11, 13, st),
  seeker: (P, st) => legs(P, 9, 7, 11, 13, st),
  breacher: (P, st) => [...[[-1, 1], [1, 1], [-1, -1], [1, -1]].flatMap(([sx, sy]) => [B(sx * 16, sy * 11 + (st ? sy : -sy) * 1.5, 0, 9, 11, 3, P.dark), B(sx * 14, sy * 9.5, 3, 5, 6, 9, P.metal, { rx: sy * 0.3 })])],
  lancer: (P, st) => legs(P, 8, 6, 11, 14, st),
};
export const TOP = {
  scout: (P) => [B(0, 0, 11, 12, 10, 6, P.base), B(0, 4.5, 11.5, 10, 3, 4.5, P.base, { rx: -0.45 }), B(0, -1, 17, 10, 8, 1.2, P.light),
    B(0, 5.2, 14, 7, 1.2, 2, GLASS), C(-4, -3, 17, 0.45, 8, P.gun), B(8, 2, 12, 3, 6, 3, P.metal), C(8, 9, 13.5, 1, 12, P.gun, { ax: 'y' }),
    B(-3.5, 1, 18.2, 3, 3, 0.8, P.acc)],
  gunner: (P) => [B(0, 0, 15, 18, 14, 8, P.base), B(0, 6.5, 15.5, 16, 4, 6, P.base, { rx: -0.45 }), B(0, -1, 23, 15, 11, 1.5, P.light),
    B(0, 7.8, 19.5, 9, 1.2, 2.2, GLASS), B(0, -8.5, 16, 12, 4, 8, P.dark), C(-3.5, -10.5, 22, 1.3, 4, P.gun), C(3.5, -10.5, 22, 1.3, 4, P.gun),
    ...[-1, 1].flatMap((s) => [B(s * 12, 0, 17, 6, 10, 7, P.base), B(s * 12, -2, 24, 6, 3, 0.8, P.acc), B(s * 12, 5, 17, 4.5, 7, 4.5, P.metal),
      C(s * 12, 13, 19.2, 1.4, 13, P.gun, { ax: 'y' }), C(s * 12, 19.5, 19.2, 1.9, 2, P.metal, { ax: 'y' })])],
  brawler: (P) => [B(0, 0, 15, 26, 18, 11, P.base), B(0, 9, 15.5, 24, 4, 10, P.base, { rx: -0.35 }), B(0, -1, 26, 22, 14, 1.5, P.light),
    B(0, 4, 26, 9, 7, 4, P.base), B(0, 7.7, 27.5, 7, 0.8, 1.6, GLASS), B(0, -9.5, 18, 16, 2, 8, P.dark),
    ...[-1, 1].flatMap((s) => [B(s * 17, 0, 20, 9, 13, 10, P.base), B(s * 17, -3, 30, 9, 4, 0.8, P.acc), B(s * 17, 7, 16, 7, 8, 7, P.metal),
      B(s * 17, 13, 12, 10, 9, 9, P.dark), B(s * 17, 17.8, 13, 9, 1.5, 7, P.metal)])],
  mortar: (P) => [B(0, 0, 13, 20, 16, 8, P.base), B(0, 0, 21, 18, 14, 1.2, P.light), B(0, 7.5, 13.5, 12, 3, 7, P.base, { rx: -0.4 }), B(0, 9, 17, 8, 1, 2, GLASS),
    C(0, -2, 28, 5, 16, P.dark, { ax: 'y', rx: 1.1 }), C(0, -2, 28, 5.7, 2.2, P.metal, { ax: 'y', rx: 1.1 }), C(0, 1.4, 34.5, 3.3, 3, BLACK, { ax: 'y', rx: 1.1 }),
    ...[-1, 1].flatMap((s) => [B(s * 12, -2, 14, 4, 12, 8, P.metal), B(s * 12, -6, 22, 4, 3, 0.8, P.acc), C(s * 12, 1, 22.5, 1.1, 6, BRASS, { ax: 'y' })])],
  aegis: (P) => [C(0, 0, 13, 11, 8, P.base), C(0, 0, 21, 10, 1.2, P.light), C(0, -1, 22, 7, 2, P.metal), C(0, -1, 24, 5, 1, P.light), S(0, -1, 25.5, 3.2, CYAN),
    B(0, 10.4, 15.5, 8, 1.4, 2.6, GLASS), B(-12, 0, 15, 2, 10, 8, P.acc), B(12, 0, 15, 2, 10, 8, P.acc), C(9, 12, 17, 1, 10, P.gun, { ax: 'y' })],
  seeker: (P) => [B(0, 0, 13, 14, 13, 8, P.base), B(0, 6.2, 13.5, 12, 3, 6, P.base, { rx: -0.45 }), B(0, 7.4, 17, 8, 1.2, 2.4, GLASS), B(0, -1, 21, 12, 9, 1.2, P.light),
    ...[-1, 1].flatMap((s) => [B(s * 12, 0, 15, 9, 15, 9, P.base), B(s * 12, 0, 24, 9, 15, 1, P.light), B(s * 12, -7, 24.6, 9, 1.4, 0.6, P.acc),
      ...[0, 1, 2].flatMap((b) => [-1, 1].map((a) => C(s * 12 + a * 2.2, -3.5 + b * 4.2, 24, 1.4, 1.4, BRASS)))])],
  breacher: (P) => [B(0, -1, 10, 26, 24, 10, P.base), B(0, -2, 20, 22, 18, 1.5, P.light), B(0, 4, 21, 10, 7, 4, P.base), B(0, 7.7, 22.5, 8, 0.8, 1.6, GLASS),
    B(0, 15, 3, 34, 4, 13, hazard), ...[-15, -10, -5, 0, 5, 10, 15].map((x) => B(x, 18, 5, 2.5, 3, 8, P.metal)),
    C(-9, 9, 11, 1.4, 10, P.gun, { ax: 'y' }), C(9, 9, 11, 1.4, 10, P.gun, { ax: 'y' }),
    B(0, -14, 13, 10, 4, 8, P.dark), C(-3, -14, 21, 1.3, 6, P.gun), C(3, -14, 21, 1.3, 6, P.gun), B(-9, -6, 21.5, 4, 8, 0.6, P.acc), B(9, -6, 21.5, 4, 8, 0.6, P.acc)],
  lancer: (P) => [B(0, -3, 14, 14, 12, 8, P.base), B(0, -4, 22, 12, 9, 1.2, P.light), B(0, 3.2, 17, 8, 1.2, 2.4, GLASS), B(0, -11, 17, 10, 5, 7, P.dark),
    B(0, 10, 21, 5, 34, 4, P.gun), B(0, 10, 25, 1.4, 32, 0.8, P.metal), ...[0, 7, 14, 21].flatMap((y) => [B(0, y, 20.5, 7, 2, 5, P.metal), B(0, y, 25.4, 3, 1, 0.5, P.glow)]),
    B(0, 27.5, 20.5, 7, 2, 5, P.metal), B(5, -3, 22.3, 3, 6, 0.6, P.acc)],
};
export const MECH_TOP = { scout: 18, gunner: 25, brawler: 31, mortar: 36, aegis: 29, seeker: 26, breacher: 25, lancer: 26 };

export function constructorModel(P) {
  const tread = (x, y) => (Math.floor(y / 2.2) % 2 ? RUBBER : col(0x3a3a35));
  return [B(-12, 0, 0, 8, 34, 6, tread), B(12, 0, 0, 8, 34, 6, tread), B(0, -1, 5, 18, 26, 7, YEL), B(0, -1, 12, 18, 26, 1, col(0xcfb15a)),
    B(-4, 7, 13, 9, 8, 6, YEL), B(-4, 7, 19, 9, 8, 1, col(0xcfb15a)), B(-4, 11.2, 14.5, 8, 0.8, 3.5, GLASS), S(-7, 4, 20.8, 1.1, ORANGE_E),
    C(5, -6, 13, 3.5, 3, col(0x8c7a3c)), B(5, 6, 19, 3, 26, 3, YEL, { rx: 0.3 }), C(5, 19, 11, 0.3, 12, P.gun), B(5, 19, 9, 2.2, 2.2, 1.6, P.metal),
    B(0, -14.5, 6, 18, 1, 4, hazard), B(4, -10, 13, 4, 6, 0.6, P.acc)];
}
export function padModel(type) {
  const s = type === 'howitzer' ? 66 : 56, o = [B(0, 0, 0, s, s, 3, CONC2), B(0, 0, 3, s - 4, s - 4, 0.6, CONC)];
  if (type === 'sentry') for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2; if (Math.abs(Math.sin(a) - 1) < 0.05) continue;
    for (const layer of [0, 1]) o.push(B(Math.cos(a) * 23, Math.sin(a) * 23, 3.6 + layer * 3.2, 8.5, 5.5, 3.2, (i + layer) % 2 ? SANDB : SANDB2, { rz: a + Math.PI / 2 + layer * 0.16 }));
  }
  if (type === 'howitzer') {
    for (const [x, y, w, d] of [[0, -28, 58, 6], [-28, -2, 6, 48], [28, -2, 6, 48]]) for (const layer of [0, 1]) o.push(B(x, y, 3.6 + layer * 3.4, w - layer * 2, d - 1, 3.4, layer ? SANDB : SANDB2));
  }
  if (type === 'arc') for (const [x, y] of [[-21, -21], [21, -21], [-21, 21], [21, 21]]) o.push(B(x, y, 3, 5, 5, 8, CONC3), B(x, y, 11, 3, 3, 1, col(0xe0e0d0)));
  return o;
}
export function headModel(type, P) {
  if (type === 'sentry') return [C(0, 0, 3.6, 12, 3.5, P.metal), C(0, 0, 7, 10, 7, P.base), C(0, 0, 14, 8, 1.5, P.light),
    C(-3.5, 15, 10.5, 1.4, 20, P.gun, { ax: 'y' }), C(3.5, 15, 10.5, 1.4, 20, P.gun, { ax: 'y' }), C(-3.5, 24, 10.5, 2, 2, P.metal, { ax: 'y' }), C(3.5, 24, 10.5, 2, 2, P.metal, { ax: 'y' }),
    B(0, 9, 7, 16, 2, 8, P.base, { rx: 0.2 }), B(11, -2, 7, 6, 9, 6, OLIVEBOX), B(-4, -4, 15.5, 4, 3, 0.6, P.acc)];
  if (type === 'howitzer') return [B(0, -2, 3.6, 16, 14, 6, P.base), B(0, -2, 9.6, 14, 12, 1.2, P.light), B(0, 7, 3.6, 26, 2.5, 11, P.base, { rx: 0.15 }),
    C(0, 25, 13, 3.2, 38, P.gun, { ax: 'y', rx: 0.12 }), B(0, 44, 15.3, 8, 4, 5.5, P.metal, { rx: 0.12 }), C(0, 3, 12, 4.4, 8, P.metal, { ax: 'y' }),
    C(-12, 0, 8, 6, 3, RUBBER, { ax: 'x' }), C(12, 0, 8, 6, 3, RUBBER, { ax: 'x' }),
    B(-7, -18, 3.6, 3, 22, 3, P.dark, { rz: -0.25 }), B(7, -18, 3.6, 3, 22, 3, P.dark, { rz: 0.25 }), B(-4, -6, 10.8, 3, 4, 0.6, P.acc)];
  return [C(0, 0, 3.6, 13, 5, P.base), C(0, 0, 8.6, 3, 30, P.metal), ...[13, 19, 25, 31].map((z) => C(0, 0, z, 8, 2, COPPER)),
    S(0, 0, 41, 5, CYAN), S(0, 0, 41.5, 3, WHITE_E), B(9, -9, 8.6, 3, 3, 0.6, P.acc)];
}
export function baseModel(team) {
  const P = TEAM[team], o = [B(300, 50, 0, 600, 100, 2, CONC2)];
  for (let x = 0; x < 600; x += 40) o.push(B(x + 20, 50, 2, 1, 100, 0.3, CONC3));
  o.push(B(300, 91, 2, 600, 10, 18, CONC));
  for (let x = 6; x < 600; x += 12) o.push(B(x, 91, 20, 6, 10, 3, CONC));
  for (const g of LANE_X) {
    o.push(B(g, 91, 2, 38, 12, 14, null), B(g, 93, 2, 34, 2, 13.5, STEEL), B(g, 96.5, 15, 30, 1, 1.2, P.glow));
    for (let x = -14; x <= 14; x += 4) o.push(B(g + x, 94.2, 2, 0.6, 0.5, 13.5, col(0x33363a)));
    o.push(B(g - 20, 91, 2, 3, 13, 22, CONC3), B(g + 20, 91, 2, 3, 13, 22, CONC3));
  }
  for (const tx of [120, 480]) {
    o.push(B(tx, 64, 2, 40, 40, 30, CONC2), B(tx, 64, 32, 34, 34, 0.8, CONC3));
    for (const [x, y, w, d] of [[0, -18.5, 40, 3], [0, 18.5, 40, 3], [-18.5, 0, 3, 40], [18.5, 0, 3, 40]]) o.push(B(tx + x, 64 + y, 32, w, d, 3, CONC2));
    o.push(C(tx, 66, 32.8, 10, 4, P.base), C(tx, 66, 36.8, 8, 3, P.base), C(tx, 66, 39.8, 6.5, 1, P.light), B(tx, 76, 34, 14, 2, 6, P.base, { rx: 0.2 }));
    o.push(C(tx - 3.5, 84, 38, 1.5, 26, P.gun, { ax: 'y' }), C(tx + 3.5, 84, 38, 1.5, 26, P.gun, { ax: 'y' }), B(tx - 4, 60, 40.8, 5, 3, 0.6, P.acc));
  }
  o.push(B(300, 40, 2, 120, 56, 30, col(0xa3a094)), B(300, 40, 32, 112, 48, 0.8, col(0x86847a)));
  for (const [x, y, w, d] of [[0, -27, 120, 2], [0, 27, 120, 2], [-59, 0, 2, 56], [59, 0, 2, 56]]) o.push(B(300 + x, 40 + y, 32, w, d, 2.5, col(0xa3a094)));
  o.push(B(258, 30, 32.8, 14, 12, 5, col(0x6a6c6a)), B(278, 30, 32.8, 14, 12, 5, col(0x6a6c6a)), B(258, 30, 37.8, 10, 8, 0.8, col(0x4a4a4a)));
  o.push(C(345, 25, 32.8, 0.9, 30, col(0x4a4a4a)), S(345, 25, 63.5, 1.2, RED_E), C(300, 48, 40, 12, 1.5, col(0xd0cec4), { rx: 0.5 }), C(300, 46, 34, 1.5, 6, col(0x555555)));
  o.push(B(330, 54, 32.8, 40, 8, 0.6, P.acc));
  for (let x = 250; x < 352; x += 10) o.push(B(x, 68.6, 10, 4, 1, 2, P.glow));
  for (const hx of [52, 548]) {
    o.push(C(hx, 46, 2, 34, 58, HANGAR, { ax: 'y' }));
    for (let y = 20; y < 76; y += 7) o.push(C(hx, y, 2, 34.4, 1, HANGAR2, { ax: 'y' }));
    o.push(B(hx, 75.4, 2, 40, 1.2, 22, STEEL), B(hx, 76.2, 2, 1, 0.5, 22, col(0x222428)));
  }
  for (const [x, y] of [[180, 26], [180, 54], [420, 26]]) o.push(C(x, y, 2, 11, 15, TANK), C(x, y, 17, 9, 1, col(0xd3d0c3)));
  for (const [x, y, w] of [[210, 78, 9], [222, 76, 8], [380, 78, 9], [394, 76, 8], [128, 12, 10], [440, 60, 8]]) o.push(B(x, y, 2, w, 7, 6, OLIVEBOX), B(x, y, 8, w - 1, 6, 0.5, col(0x6c6e4a)));
  return o;
}

// ---------- voxel grid ----------
export class Grid {
  constructor(NX, NY, NZ, v, wx0 = 0, wy0 = 0) {
    Object.assign(this, { NX, NY, NZ, v, wx0, wy0 });
    this.g = new Uint8Array(NX * NY * NZ);
  }
  set(x, y, z, c) { if (x >= 0 && y >= 0 && z >= 0 && x < this.NX && y < this.NY && z < this.NZ) this.g[(z * this.NY + y) * this.NX + x] = c; }
  get(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.NX && y < this.NY && z < this.NZ ? this.g[(z * this.NY + y) * this.NX + x] : 0; }
  // place primitives: world pos (wx, wy, wz), heading th (clockwise from north), scale s
  add(prims, wx, wy, wz = 0, th = 0, s = 1, zcut = Infinity) {
    const ct = Math.cos(th), st = Math.sin(th), v = this.v;
    for (const p of prims) {
      const cx = Math.cos(p.rx || 0), sx = Math.sin(p.rx || 0), cz = Math.cos(p.rz || 0), sz = Math.sin(p.rz || 0);
      const toModel = (lx, ly, lz) => { // prim local -> model
        const y1 = ly * cx - lz * sx, z1 = ly * sx + lz * cx; // rx
        return [p.x + lx * cz - y1 * sz, p.y + lx * sz + y1 * cz, p.z + z1]; // rz
      };
      const toWorld = ([mx, my, mz]) => [wx + s * (mx * ct + my * st), wy + s * (-mx * st + my * ct), wz + s * mz];
      let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) {
        const w = toWorld(toModel(a * p.ex[0], b * p.ex[1], c * p.ex[2]));
        for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], w[k]); hi[k] = Math.max(hi[k], w[k]); }
      }
      const x0 = Math.max(0, Math.floor((lo[0] - this.wx0) / v)), x1 = Math.min(this.NX - 1, Math.floor((hi[0] - this.wx0) / v));
      const y0 = Math.max(0, Math.floor((lo[1] - this.wy0) / v)), y1 = Math.min(this.NY - 1, Math.floor((hi[1] - this.wy0) / v));
      const z0 = Math.max(0, Math.floor(lo[2] / v)), z1 = Math.min(this.NZ - 1, Math.floor(hi[2] / v), Math.floor(zcut / v));
      for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        // cell center -> model -> prim local
        const qx = (this.wx0 + (x + 0.5) * v - wx) / s, qy = (this.wy0 + (y + 0.5) * v - wy) / s, qz = ((z + 0.5) * v - wz) / s;
        const mx = qx * ct - qy * st, my = qx * st + qy * ct;
        let dx = mx - p.x, dy = my - p.y, dz = qz - p.z;
        const ux = dx * cz + dy * sz, uy = -dx * sz + dy * cz; // undo rz
        const vy = uy * cx + dz * sx, vz = -uy * sx + dz * cx; // undo rx
        let inside;
        if (p.t === 'b') inside = Math.abs(ux) <= p.ex[0] && Math.abs(vy) <= p.ex[1] && Math.abs(vz) <= p.ex[2];
        else if (p.t === 's') inside = ux * ux + vy * vy + vz * vz <= p.r * p.r;
        else if (p.ax === 'z') inside = ux * ux + vy * vy <= p.r * p.r && Math.abs(vz) <= p.hl;
        else if (p.ax === 'y') inside = ux * ux + vz * vz <= p.r * p.r && Math.abs(vy) <= p.hl;
        else inside = vy * vy + vz * vz <= p.r * p.r && Math.abs(ux) <= p.hl;
        if (!inside) continue;
        const c = p.c === null ? 0 : typeof p.c === 'function' ? p.c(ux, vy, vz) : p.c;
        this.g[(z * this.NY + y) * this.NX + x] = c;
      }
    }
  }
}

// ---------- ground ----------
function laneDirt(wx, wy) {
  let d = 1;
  for (const lc of LANE_X) d = Math.min(d, smooth(30, 44, Math.abs(wx - lc) + (vnoise(wx / 9, wy / 9, 31) - 0.5) * 14));
  return 1 - d; // 1 on the dirt track
}
export function groundAlbedo(wx, wy) {
  const n = fbm(wx / 120, wy / 120, 1, 3), m = vnoise(wx / 7, wy / 7, 5), dirt = laneDirt(wx, wy);
  let r = 146 + (n - 0.5) * 22, g = 139 + (n - 0.5) * 18, b = 92 + (n - 0.5) * 14;        // dry grass
  const dry = smooth(0.45, 0.7, fbm(wx / 60 + 40, wy / 60, 2, 3)); r += 18 * dry; g += 12 * dry; b += 6 * dry;
  r += (172 - r) * dirt * 0.85; g += (159 - g) * dirt * 0.85; b += (124 - b) * dirt * 0.85;  // dirt track
  for (const lc of LANE_X) for (const off of [-12, 12]) if (Math.abs(wx - (lc + off)) < 2.6 && dirt > 0.6) { r *= 0.9; g *= 0.9; b *= 0.9; }
  const k = (m - 0.5) * 8; r += k; g += k; b += k;
  for (const c of CRATERS) {
    const d = Math.hypot(wx - c.x, wy - c.y) / c.r;
    if (d < 0.95) { const t = (1 - d / 0.95) * 0.65; r += (92 - r) * t; g += (82 - g) * t; b += (64 - b) * t; }
    else if (d < 1.15) { r += 10; g += 9; b += 7; }
  }
  // build-cell corner brackets of both teams
  let dec = 0;
  for (const team of [0, 1]) for (let row = 0; row < ROWS; row++) {
    const cy = cellY(team, row);
    if (Math.abs(wy - cy) > 50) continue;
    const cx = ((wx % 120) + 120) % 120, cyy = wy - (cy - 50);
    const nx = Math.min(cx - 4, 116 - cx), ny = Math.min(cyy - 4, 96 - cyy);
    if ((nx >= 0 && nx < 1.8 && ny >= 0 && ny < 14) || (ny >= 0 && ny < 1.8 && nx >= 0 && nx < 14)) dec = team ? 0.2 : 0.33;
  }
  if (dec) { r += (240 - r) * dec; g += (245 - g) * dec; b += (230 - b) * dec; }
  return [r, g, b];
}
export function addScatter(G, y0, y1) {
  const v = G.v, n = Math.round((y1 - y0) * 1.85);
  for (let i = 0; i < n; i++) { // grass tufts
    const wx = rand(i, 11) * 600, wy = y0 + rand(i, 12) * (y1 - y0);
    const dirt = laneDirt(wx, wy);
    if (rand(i, 13) < dirt * 0.93) continue;
    let inCrater = false; for (const c of CRATERS) if (Math.hypot(wx - c.x, wy - c.y) < c.r * 0.8) inCrater = true;
    if (inCrater && rand(i, 14) < 0.8) continue;
    const X = Math.floor((wx - G.wx0) / v), Y = Math.floor((wy - G.wy0) / v), k = 3 + Math.floor(rand(i, 15) * 5);
    for (let j = 0; j < k; j++) {
      const dx = Math.round((rand(i * 13 + j, 16) - 0.5) * 4), dy = Math.round((rand(i * 13 + j, 17) - 0.5) * 3);
      const h = 1 + Math.floor(rand(i * 13 + j, 18) * 3), c = TUFT[(i + j) % TUFT.length], lean = dx > 0 ? 1 : dx < 0 ? -1 : 0;
      for (let z = 0; z < h; z++) G.set(X + dx + (z >= h - 1 ? lean : 0), Y + dy, z, c);
    }
  }
  for (let i = 0; i < n / 14; i++) { // pebbles
    const X = Math.floor((rand(i, 21) * 600 - G.wx0) / v), Y = Math.floor((y0 + rand(i, 22) * (y1 - y0) - G.wy0) / v), c = ROCK[i % 2], s = 1 + (i % 3);
    for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) G.set(X + a, Y + b, 0, c);
    if (s > 1) G.set(X, Y, 1, c);
  }
}

// ---------- renderer ----------
export const Lraw = [-0.68, -0.14, 0.72], Lm = Math.hypot(...Lraw), L = Lraw.map((a) => a / Lm);
const SUN = [1.0, 0.95, 0.86], SKY = [0.86, 0.9, 1.0];
function shadeVoxelPal(ci, light, f) { const p = PAL[ci]; if (p.emi) return [p.r, p.g, p.b]; return [p.r * light[0] * f, p.g * light[1] * f, p.b * light[2] * f]; }

// proj: {p (px per voxel), a, b, ox, x0, bot}
export function render(G, W, H, proj, groundFn) {
  const { NX, NY, NZ, g } = G, { p, a, b, ox, x0, bot } = proj;
  const out = new Uint8ClampedArray(W * H * 4);
  const top = new Uint8Array(NX * NY); let maxTop = 0;
  for (let z = 0; z < NZ; z++) for (let i = 0, base = z * NX * NY; i < NX * NY; i++) if (g[base + i]) { top[i] = z + 1; if (z + 1 > maxTop) maxTop = z + 1; }
  // per-pixel start height from column footprints
  const zs = new Uint8Array(W * H);
  for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
    const m = top[y * NX + x]; if (!m) continue;
    const xa = x0 + Math.min(x, x + m * ox) * p, xb = x0 + Math.max(x + 1, x + 1 + m * ox) * p;
    const ya = bot - ((y + 1) * a + m * b) * p, yb = bot - y * a * p;
    for (let py = Math.max(0, Math.floor(ya)); py < Math.min(H, Math.ceil(yb)); py++) for (let px = Math.max(0, Math.floor(xa)); px < Math.min(W, Math.ceil(xb)); px++) {
      const i = py * W + px; if (zs[i] < m) zs[i] = m;
    }
  }
  // ground shadow map (columns swept along the sun direction)
  let gsh = null, gheight = null;
  if (groundFn) {
    gsh = new Uint8Array(NX * NY);
    const kx = -L[0] / L[2], ky = -L[1] / L[2];
    for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
      const m = top[y * NX + x]; if (!m) continue;
      for (let t = 0.5; t <= m; t += 0.5) {
        const X = Math.floor(x + 0.5 + t * kx), Y = Math.floor(y + 0.5 + t * ky);
        if (X >= 0 && Y >= 0 && X < NX && Y < NY && top[Y * NX + X] <= t) gsh[Y * NX + X] = 1;
      }
    }
    gheight = new Float32Array(NX * NY);
    for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) gheight[y * NX + x] = height(G.wx0 + (x + 0.5) * G.v, G.wy0 + (y + 0.5) * G.v) / G.v;
  }
  const occ = (x, y, z) => (x >= 0 && y >= 0 && z >= 0 && x < NX && y < NY && z < NZ ? g[(z * NY + y) * NX + x] : 0);
  function inShadow(X, Y, Z) { // march toward the sun
    let ix = Math.floor(X), iy = Math.floor(Y), iz = Math.floor(Z);
    const sx = L[0] > 0 ? 1 : -1, sy = L[1] > 0 ? 1 : -1;
    const tdx = Math.abs(1 / L[0]), tdy = Math.abs(1 / L[1]), tdz = 1 / L[2];
    let tx = L[0] > 0 ? (ix + 1 - X) * tdx : (X - ix) * tdx, ty = L[1] > 0 ? (iy + 1 - Y) * tdy : (Y - iy) * tdy, tz = (iz + 1 - Z) * tdz;
    for (let k = 0; k < 400; k++) {
      if (tx < ty && tx < tz) { ix += sx; tx += tdx; } else if (ty < tz) { iy += sy; ty += tdy; } else { iz++; tz += tdz; }
      if (iz >= maxTop || ix < 0 || iy < 0 || ix >= NX || iy >= NY) return false;
      if (g[(iz * NY + iy) * NX + ix]) return true;
    }
    return false;
  }
  const dX = ox, dY = a > 0 ? b / a : 0; // ray direction per unit of Z descent
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const i = py * W + px, sxv = (px + 0.5 - x0) / p, syv = (bot - py - 0.5) / p;
    let rgb = null;
    const zstart = zs[i];
    if (zstart) {
      const Z0 = zstart, X0 = sxv - Z0 * ox, Y0 = (syv - Z0 * b) / a;
      let ix = Math.floor(X0), iy = Math.floor(Y0), iz = Z0 - 1;
      const stx = dX > 0 ? 1 : -1, sty = dY > 0 ? 1 : -1;
      const tdx = dX ? Math.abs(1 / dX) : Infinity, tdy = dY ? Math.abs(1 / dY) : Infinity;
      let tx = dX > 0 ? (ix + 1 - X0) * tdx : dX < 0 ? (X0 - ix) * tdx : Infinity;
      let ty = dY > 0 ? (iy + 1 - Y0) * tdy : dY < 0 ? (Y0 - iy) * tdy : Infinity;
      let tz = 1, t = 0, axis = 2;
      for (let k = 0; k < 600; k++) {
        if (iz < 0) break;
        const c = occ(ix, iy, iz);
        if (c) {
          const HX = X0 + dX * t, HY = Y0 + dY * t, HZ = Z0 - t;
          let nx = 0, ny = 0, nz = 0, amb;
          if (axis === 0) { nx = -stx; amb = 0.44; } else if (axis === 1) { ny = -sty; amb = 0.54; } else { nz = 1; amb = 0.66; }
          // ambient occlusion
          let ao = 1;
          if (nz) { ao -= 0.07 * ((occ(ix - 1, iy, iz + 1) ? 1 : 0) + (occ(ix + 1, iy, iz + 1) ? 1 : 0) + (occ(ix, iy - 1, iz + 1) ? 1 : 0) + (occ(ix, iy + 1, iz + 1) ? 1 : 0)); }
          else { ao -= 0.08 * ((occ(ix + nx, iy + ny, iz - 1) ? 1 : 0) + (occ(ix + nx + (ny ? 1 : 0), iy + ny + (nx ? 1 : 0), iz) ? 1 : 0) + (occ(ix + nx - (ny ? 1 : 0), iy + ny - (nx ? 1 : 0), iz) ? 1 : 0)); }
          ao *= 0.78 + 0.22 * Math.min(1, iz / 7);
          const diff = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
          const lit = diff > 0 && !inShadow(HX + nx * 0.01, HY + ny * 0.01, HZ + nz * 0.01) ? diff * 0.62 : 0;
          // crisp lit edge on the sunward rims of top faces
          let edge = 1;
          if (nz) { const fx = HX - ix, fy = HY - iy; if ((fx < 0.2 && !occ(ix - 1, iy, iz)) || (fy < 0.2 && !occ(ix, iy - 1, iz))) edge = 1.12; }
          const n = 1 + (hash(ix * 7 + iz, iy * 13 + iz * 5, 9) - 0.5) * 0.07;
          const light = [amb * ao * SKY[0] + lit * SUN[0], amb * ao * SKY[1] + lit * SUN[1], amb * ao * SKY[2] + lit * SUN[2]];
          rgb = shadeVoxelPal(c, light, n * edge);
          break;
        }
        if (tx < ty && tx < tz) { ix += stx; t = tx; tx += tdx; axis = 0; } else if (ty < tz) { iy += sty; t = ty; ty += tdy; axis = 1; } else { iz -= 1; t = tz; tz += 1; axis = 2; }
      }
    }
    if (!rgb) {
      if (!groundFn) continue; // transparent
      const X = sxv, Y = a > 0 ? syv / a : syv, wx = G.wx0 + X * G.v, wy = G.wy0 + Y * G.v;
      const alb = groundFn(wx, wy), gx = Math.floor(X), gy = Math.floor(Y);
      let lit = 1, ao = 1, nz = 1, nxx = 0, nyy = 0;
      if (gx >= 1 && gy >= 1 && gx < NX - 1 && gy < NY - 1) {
        const hx = (gheight[gy * NX + gx + 1] - gheight[gy * NX + gx - 1]) / 2, hy = (gheight[(gy + 1) * NX + gx] - gheight[(gy - 1) * NX + gx]) / 2;
        const m = Math.hypot(hx, hy, 1); nxx = -hx / m; nyy = -hy / m; nz = 1 / m;
        if (gsh[gy * NX + gx]) lit = 0;
        let s = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const tt = top[(gy + dy) * NX + gx + dx]; if (tt) s += Math.min(tt, 4) / (1 + Math.abs(dx) + Math.abs(dy)); }
        ao = Math.max(0.55, 1 - s * 0.022);
      } else if (gx >= 0 && gy >= 0 && gx < NX && gy < NY && gsh[gy * NX + gx]) lit = 0;
      const diff = Math.max(0, nxx * L[0] + nyy * L[1] + nz * L[2]);
      const n = 1 + (hash(px, py, 3) - 0.5) * 0.035;
      const amb = 0.62 * ao;
      rgb = [alb[0] * (amb * SKY[0] + diff * 0.6 * lit * SUN[0]) * n, alb[1] * (amb * SKY[1] + diff * 0.6 * lit * SUN[1]) * n, alb[2] * (amb * SKY[2] + diff * 0.6 * lit * SUN[2]) * n];
    }
    out[i * 4] = rgb[0]; out[i * 4 + 1] = rgb[1]; out[i * 4 + 2] = rgb[2]; out[i * 4 + 3] = 255;
  }
  return out;
}

