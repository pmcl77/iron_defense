// Voxel "3D pixel art" renderer: units are small voxel models that are rasterized into a
// low-resolution z-buffer and scaled up with crisp edges. pitch 62 = angled, 90 = straight down.
import {
  DEV_W, DEV_H, DPR, HUD_BOT, LANE_X, SCENE, byId, heading, aimAngle, hash, rand,
  groundColor, groundShade, drawHUD,
} from './common.js';

const EMI = 0x1000000; // emissive flag: not shaded
const PIX = 5;          // device px per low-res pixel
const LW = DEV_W / PIX, LH = DEV_H / PIX; // 270 x 585
const K = LW / 600;     // low-res px per world unit (0.36). One voxel = one low-res pixel.

// ---------- palette ----------
const TEAM = [
  { base: 0x7f7c55, dark: 0x55543a, light: 0xa5a277, metal: 0x4c4f4a, gun: 0x34373a, acc: 0x3b8be6, glow: 0x8fdcff | EMI },
  { base: 0x6f716c, dark: 0x484a47, light: 0x93958d, metal: 0x45474a, gun: 0x2f3134, acc: 0xc9463a, glow: 0xff7a55 | EMI },
];
const GLASS = 0x22343b, GLASS_HI = 0x5a8592, CONCRETE = 0x8a887f, CONC_D = 0x75736b, SAND = 0xa69a74, HAZ_Y = 0xb39a3c, HAZ_K = 0x2c2b27;
const mulc = (c, f) => {
  const r = Math.min(255, ((c >> 16) & 255) * f), g = Math.min(255, ((c >> 8) & 255) * f), b = Math.min(255, (c & 255) * f);
  return (r << 16) | (g << 8) | b;
};

// ---------- voxel model ----------
export class Model {
  constructor(w, d, h) { this.w = w; this.d = d; this.h = h; this.v = new Int32Array(w * d * h).fill(-1); }
  idx(x, y, z) { return (z * this.d + y) * this.w + x; }
  in(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.w && y < this.d && z < this.h; }
  get(x, y, z) { return this.in(x, y, z) ? this.v[this.idx(x, y, z)] : -1; }
  set(x, y, z, c) { if (this.in(x, y, z)) this.v[this.idx(x, y, z)] = typeof c === 'function' ? c(x, y, z) : c; }
  box(x, y, z, w, d, h, c) { for (let k = z; k < z + h; k++) for (let j = y; j < y + d; j++) for (let i = x; i < x + w; i++) this.set(i, j, k, c); return this; }
  // box centered on (cx, cy) relative to model center
  bc(cx, cy, z, w, d, h, c) { return this.box(Math.round(this.w / 2 + cx - w / 2), Math.round(this.d / 2 + cy - d / 2), z, w, d, h, c); }
  cyl(cx, cy, z, r, h, c) {
    const ox = this.w / 2 + cx, oy = this.d / 2 + cy;
    for (let j = Math.floor(oy - r - 1); j <= oy + r + 1; j++) for (let i = Math.floor(ox - r - 1); i <= ox + r + 1; i++) {
      if ((i + 0.5 - ox) ** 2 + (j + 0.5 - oy) ** 2 <= r * r) for (let k = z; k < z + h; k++) this.set(i, j, k, c);
    }
    return this;
  }
  clr(cx, cy, z, w, d, h) { return this.bc(cx, cy, z, w, d, h, -1); }
}
// rotate clockwise by angle (radians) around the vertical axis, nearest-neighbor resampling
export function rotate(m, a) {
  if (Math.abs(a) < 1e-6) return m;
  const c = Math.cos(a), s = Math.sin(a);
  const W = Math.ceil(Math.abs(m.w * c) + Math.abs(m.d * s)) + 2, D = Math.ceil(Math.abs(m.w * s) + Math.abs(m.d * c)) + 2;
  const r = new Model(W, D, m.h);
  for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - W / 2, dy = y + 0.5 - D / 2;
    const sx = Math.floor(dx * c - dy * s + m.w / 2), sy = Math.floor(dx * s + dy * c + m.d / 2);
    if (sx < 0 || sy < 0 || sx >= m.w || sy >= m.d) continue;
    for (let z = 0; z < m.h; z++) { const v = m.get(sx, sy, z); if (v >= 0) r.v[r.idx(x, y, z)] = v; }
  }
  return r;
}
const noisy = (base, amt = 0.07, seed = 1) => (x, y, z) => mulc(base, 1 + (hash(x * 7 + z, y * 13 + z * 3, seed) - 0.5) * amt * 2);

// ---------- unit models (facing +y = north) ----------
function legs(m, P, lx, fw, fl, hip, stride) {
  for (const [sx, st] of [[-1, stride], [1, -stride]]) {
    m.bc(sx * lx, st, 0, fw, fl, 2, P.dark);
    m.bc(sx * lx, st + fl / 2 - 1, 0, fw, 1, 1, P.metal);
    m.bc(sx * lx, st * 0.5, 2, Math.max(1, fw - 2), 3, hip - 3, P.metal);
    m.bc(sx * lx, st * 0.3, hip - 2, fw, 4, 3, P.base);
  }
}
const MECHS = {
  scout(P, st) {
    const m = new Model(16, 16, 11); legs(m, P, 3, 3, 5, 5, st ? 2 : -2);
    m.bc(0, 0, 5, 8, 7, 3, P.base).bc(0, 0, 8, 6, 5, 1, P.light).bc(0, 3, 6, 4, 2, 2, GLASS).bc(0, 3, 7, 2, 1, 1, GLASS_HI);
    m.bc(4.5, 3, 6, 1, 8, 1, P.gun).bc(-2, -2, 8, 1, 2, 1, P.acc);
    return m;
  },
  gunner(P, st) {
    const m = new Model(20, 20, 13); legs(m, P, 4, 4, 6, 6, st ? 2 : -2);
    m.bc(0, 0, 6, 10, 8, 4, P.base).bc(0, -1, 10, 8, 5, 1, P.light).bc(0, 3.5, 8, 6, 1, 2, GLASS).bc(0, 3.5, 9, 4, 1, 1, GLASS_HI);
    for (const s of [-1, 1]) {
      m.bc(s * 7, 0, 6, 3, 6, 4, P.base).bc(s * 7, -1, 10, 3, 3, 1, P.acc);
      m.bc(s * 7, 6, 7, 2, 7, 2, P.gun).bc(s * 7, 3, 7, 3, 2, 3, P.metal);
    }
    return m;
  },
  brawler(P, st) {
    const m = new Model(28, 28, 16); legs(m, P, 6, 6, 8, 7, st ? 2 : -2);
    m.bc(0, 0, 7, 14, 11, 6, P.base).bc(0, -1, 13, 12, 8, 1, P.light).bc(0, 2, 13, 6, 5, 2, P.base).bc(0, 4.5, 14, 4, 1, 1, GLASS_HI).bc(0, 4.5, 13, 4, 1, 1, GLASS);
    for (const s of [-1, 1]) {
      m.bc(s * 10, 0, 8, 5, 7, 5, P.base).bc(s * 10, -1, 13, 5, 3, 1, P.acc);
      m.bc(s * 10, 6, 6, 6, 6, 6, P.dark).bc(s * 10, 9, 7, 6, 1, 4, P.metal).bc(s * 10, 6, 12, 4, 4, 1, P.metal);
    }
    m.bc(0, -6, 7, 8, 2, 4, P.metal);
    return m;
  },
  mortar(P, st) {
    const m = new Model(24, 24, 18); legs(m, P, 5, 4, 6, 6, st ? 2 : -2);
    m.bc(0, -1, 6, 12, 10, 4, P.base).bc(0, -1, 10, 10, 8, 1, P.light).bc(0, 4.5, 8, 6, 1, 2, GLASS);
    for (let z = 10; z < 17; z++) m.cyl(0, -2 + (z - 10) * 0.5, z, 3, 1, z === 16 ? P.metal : P.dark);
    m.cyl(0, 1, 16, 1.6, 1, 0x141414);
    for (const s of [-1, 1]) { m.bc(s * 7.5, -2, 6, 3, 8, 4, P.metal); m.bc(s * 7.5, -2, 10, 3, 2, 1, P.acc); }
    return m;
  },
  aegis(P, st) {
    const m = new Model(22, 22, 15); legs(m, P, 4.5, 4, 6, 6, st ? 2 : -2);
    m.cyl(0, 0, 6, 6, 4, P.base).cyl(0, 0, 10, 5, 1, P.light).bc(0, 5, 7, 6, 1, 2, GLASS);
    m.cyl(0, -1, 11, 4, 1, P.metal).cyl(0, -1, 11, 2.5, 1, -1).cyl(0, -1, 11, 1.6, 3, 0x7fe9ff | EMI);
    for (const s of [-1, 1]) m.bc(s * 7, 1, 7, 2, 5, 2, P.acc);
    m.bc(5.5, 6, 7, 1, 4, 1, P.gun);
    return m;
  },
  seeker(P, st) {
    const m = new Model(22, 22, 14); legs(m, P, 4.5, 4, 6, 6, st ? 2 : -2);
    m.bc(0, 0, 6, 9, 8, 4, P.base).bc(0, 3.5, 8, 5, 1, 2, GLASS).bc(0, -1, 10, 7, 5, 1, P.light);
    for (const s of [-1, 1]) {
      m.bc(s * 7, 0, 7, 5, 9, 4, P.base).bc(s * 7, -4, 11, 5, 1, 1, P.acc);
      for (let a = 0; a < 2; a++) for (let b = 0; b < 3; b++) {
        m.bc(s * 7 + (a ? 1 : -1), 2.5 - b * 2.3, 11, 1, 1, 1, (a + b) % 2 ? 0xb89a5a : 0x9a7c45);
      }
    }
    return m;
  },
  breacher(P, st) {
    const m = new Model(30, 30, 15);
    for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      m.bc(sx * 10, sy * 7 + (st ? sy : -sy), 0, 5, 5, 2, P.dark).bc(sx * 9, sy * 6, 2, 3, 3, 4, P.metal);
    }
    m.bc(0, -1, 5, 16, 13, 6, P.base).bc(0, -2, 11, 12, 9, 1, P.light).bc(0, 3, 11, 5, 3, 2, P.base).bc(0, 4.5, 12, 3, 1, 1, GLASS_HI);
    // demolition ram with hazard stripes and teeth
    m.box(4, 22, 2, 22, 3, 8, (x) => (Math.floor(x / 2) % 2 ? HAZ_Y : HAZ_K));
    for (let x = 4; x < 26; x += 3) m.box(x, 25, 3, 2, 2, 5, P.metal);
    for (const s of [-1, 1]) m.bc(s * 5, 6, 5, 2, 6, 2, P.gun);
    m.bc(0, -8, 8, 6, 2, 3, P.dark).bc(-2, -8, 11, 1, 1, 2, P.gun).bc(2, -8, 11, 1, 1, 2, P.gun);
    m.bc(-6, -5, 11, 2, 4, 1, P.acc).bc(6, -5, 11, 2, 4, 1, P.acc);
    return m;
  },
  lancer(P, st) {
    const m = new Model(26, 34, 14); legs(m, P, 4, 3, 6, 6, st ? 2 : -2);
    m.bc(0, -2, 6, 9, 8, 4, P.base).bc(0, -3, 10, 7, 5, 1, P.light).bc(-3, -6, 7, 3, 3, 3, P.dark);
    m.bc(0, 8, 9, 3, 20, 2, P.gun).bc(0, 2, 8, 5, 6, 3, P.metal);
    for (let y = 4; y < 17; y += 4) m.bc(0, y, 11, 3, 1, 1, P.glow);
    m.bc(0, 18, 9, 3, 1, 2, P.metal).bc(4, -3, 10, 2, 4, 1, P.acc);
    return m;
  },
};
function constructorModel(P) {
  const m = new Model(28, 30, 16);
  for (const s of [-1, 1]) m.bc(s * 8, 0, 0, 5, 20, 4, (x, y) => (y % 3 ? 0x3a3a35 : 0x2a2a26));
  m.bc(0, -1, 3, 11, 15, 4, noisy(0xa08b55)).bc(0, -1, 7, 11, 15, 1, 0xb19c63);
  m.bc(-2, 4, 8, 6, 5, 3, 0xa08b55).bc(-2, 6.5, 9, 6, 1, 2, GLASS).bc(-2, 4, 11, 6, 5, 1, 0xb5a06a);
  m.bc(-4, 3, 12, 1, 1, 1, 0xffa040 | EMI);
  m.box(8, 6, 7, 12, 2, 1, (x) => (Math.floor(x / 2) % 2 ? HAZ_Y : HAZ_K));
  for (let i = 0; i < 9; i++) m.bc(3, -3 + i * 1.6, 9 + i * 0.6, 2, 2, 1, 0xc0a24a);
  m.bc(3, 11, 9, 1, 1, 6, P.gun).bc(3, 11, 8, 2, 2, 1, P.metal);
  m.bc(4, -6, 8, 2, 3, 1, P.acc);
  return m;
}
// turret pads and heads
function pad(type) {
  const s = type === 'howitzer' ? 30 : 26, m = new Model(s, s, 6);
  m.bc(0, 0, 0, s - 2, s - 2, 2, noisy(CONCRETE, 0.05, 4)).bc(0, 0, 2, s - 6, s - 6, 0, 0);
  if (type === 'sentry') {
    for (let a = 0; a < 26; a++) {
      const t = (a / 26) * Math.PI * 2; if (Math.abs(Math.sin(t)) > 0.97 && Math.cos(t) < 0) continue;
      const x = Math.cos(t) * 10, y = Math.sin(t) * 10;
      m.bc(x, y, 2, 3, 3, (a % 2) + 2, a % 3 ? SAND : mulc(SAND, 0.9));
    }
  } else if (type === 'howitzer') {
    m.bc(0, -11, 2, 24, 3, 3, noisy(SAND, 0.08, 6)).bc(-11, -2, 2, 3, 18, 3, noisy(SAND, 0.08, 7)).bc(11, -2, 2, 3, 18, 3, noisy(SAND, 0.08, 8));
  } else {
    for (const [x, y] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) m.bc(x, y, 2, 3, 3, 4, CONC_D);
  }
  return m;
}
function head(type, P) {
  if (type === 'sentry') {
    const m = new Model(18, 22, 7);
    m.cyl(0, 0, 0, 5, 3, P.base).cyl(0, 0, 3, 4, 1, P.light).bc(0, 2, 2, 4, 3, 2, P.dark);
    for (const s of [-1.5, 1.5]) m.bc(s, 7, 1, 1, 8, 1, P.gun);
    m.bc(0, 7, 1, 4, 2, 1, P.metal).bc(5.5, -1, 0, 3, 4, 3, 0x5e6040).bc(-2, -3, 4, 3, 1, 1, P.acc);
    return m;
  }
  if (type === 'howitzer') {
    const m = new Model(36, 40, 8);
    m.bc(0, -2, 0, 10, 9, 4, P.base).bc(0, -2, 4, 8, 7, 1, P.light).bc(0, 3, 0, 14, 2, 6, P.base);
    m.bc(0, 13, 2, 3, 19, 3, P.gun).bc(0, 22, 2, 5, 2, 3, P.metal).bc(0, 4, 1, 5, 4, 5, P.metal);
    for (const s of [-1, 1]) m.bc(s * 4, -12, 0, 2, 11, 2, P.dark);
    m.bc(-3, -4, 5, 2, 2, 1, P.acc);
    return m;
  }
  const m = new Model(14, 14, 20); // arc coil
  m.cyl(0, 0, 0, 5, 3, P.base).cyl(0, 0, 3, 2, 13, P.metal);
  for (const z of [5, 8, 11, 14]) m.cyl(0, 0, z, 4, 1, 0xa06a3a);
  m.cyl(0, 0, 16, 3, 2, 0x9ff4ff | EMI).cyl(0, 0, 18, 2, 1, 0xe8ffff | EMI).bc(3, -3, 2, 1, 1, 1, P.acc);
  return m;
}
function baseModel() {
  const P = TEAM[0], m = new Model(270, 54, 32);
  m.box(0, 0, 0, 270, 46, 1, (x, y) => ((Math.floor(x / 6) + Math.floor(y / 6)) % 2 ? 0x7f7d74 : 0x878579));
  const gates = LANE_X.map((x) => Math.round(x * 0.45)); // designed at 270 px wide, resampled to fit
  // front wall with gates
  m.box(0, 40, 1, 270, 5, 9, noisy(CONCRETE, 0.06, 2));
  for (let x = 0; x < 270; x += 4) m.box(x, 40, 10, 2, 5, 1, noisy(CONCRETE, 0.06, 3));
  for (const g of gates) {
    m.box(g - 8, 40, 1, 16, 5, 7, -1);
    m.box(g - 7, 41, 1, 14, 1, 6, (x) => (x % 3 ? 0x3d4042 : 0x33363a));
    m.box(g - 8, 40, 7, 16, 5, 3, 0x6d6b64).box(g - 6, 44, 8, 12, 1, 1, P.glow);
    m.box(g - 9, 39, 1, 1, 6, 10, 0x5f5d57).box(g + 8, 39, 1, 1, 6, 10, 0x5f5d57);
  }
  // gun towers at lane boundaries
  for (const tx of [54, 216]) {
    m.box(tx - 9, 26, 1, 18, 18, 14, noisy(0x908e84, 0.05, 9)).box(tx - 8, 27, 15, 16, 16, 1, 0x6f6d66);
    for (let x = tx - 9; x < tx + 9; x += 3) { m.box(x, 26, 15, 2, 1, 1, 0x908e84); m.box(x, 43, 15, 2, 1, 1, 0x908e84); }
    m.box(tx - 5, 31, 15, 10, 9, 3, P.base).box(tx - 4, 32, 18, 8, 7, 1, P.light);
    m.box(tx - 3, 40, 16, 1, 13, 1, P.gun).box(tx + 2, 40, 16, 1, 13, 1, P.gun);
    m.box(tx - 3, 33, 19, 6, 1, 1, P.acc);
  }
  // command center
  m.box(108, 6, 1, 54, 26, 16, noisy(0x9a978b, 0.04, 11)).box(109, 7, 17, 52, 24, 1, 0x7c7a71);
  for (let x = 108; x < 162; x++) { m.set(x, 6, 17, 0x9a978b); m.set(x, 31, 17, 0x9a978b); }
  m.box(112, 12, 18, 6, 5, 2, 0x6a6c6a).box(122, 12, 18, 6, 5, 2, 0x6a6c6a).box(140, 22, 18, 16, 3, 1, P.acc);
  for (let z = 18; z < 31; z++) m.set(152, 12, z, 0x4a4a4a);
  m.set(152, 12, 31, 0xff5040 | EMI);
  { const cx = 134, cy = 24; for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) { const r = Math.hypot(i, j); if (r <= 5) m.set(cx + i, cy + j, 19 + (r > 3.5 ? 1 : 0), r < 1.5 ? 0x555555 : 0xc8c6bc); } m.box(cx, cy, 18, 1, 1, 1, 0x555555); }
  for (let x = 112; x < 158; x += 6) m.box(x, 31, 6, 3, 1, 2, P.glow);
  // hangars with arched roofs
  for (const [x0, x1] of [[8, 46], [224, 262]]) {
    const c = (x0 + x1) / 2, hw = (x1 - x0) / 2;
    for (let x = x0; x < x1; x++) {
      const h = 3 + Math.round(10 * Math.sqrt(Math.max(0, 1 - ((x + 0.5 - c) / hw) ** 2)));
      m.box(x, 6, 1, 1, 24, h, (xx, y) => (y % 4 === 0 ? 0x5a5b40 : 0x6b6c4d));
    }
    m.box(x0 + 8, 30, 1, x1 - x0 - 16, 1, 7, 0x3a3c3a);
  }
  // fuel tanks, crates
  for (const [x, y] of [[80, 12], [80, 24], [190, 12]]) for (let z = 1; z < 8; z++) for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) if (i * i + j * j <= 18) m.set(x + i, y + j, z, z === 7 ? 0xc5c2b5 : 0xb1aea1);
  for (const [x, y, w] of [[94, 33, 4], [99, 34, 3], [170, 34, 4], [176, 33, 3], [60, 8, 5]]) m.box(x, y, 1, w, 3, 3, noisy(0x5e6040, 0.1, x));
  return scaleModel(m, K / 0.45);
}
function scaleModel(m, f) {
  if (Math.abs(f - 1) < 1e-6) return m;
  const r = new Model(Math.round(m.w * f), Math.round(m.d * f), Math.round(m.h * f));
  for (let z = 0; z < r.h; z++) for (let y = 0; y < r.d; y++) for (let x = 0; x < r.w; x++) {
    const v = m.get(Math.floor(x / f), Math.floor(y / f), Math.floor(z / f)); if (v >= 0) r.v[r.idx(x, y, z)] = v;
  }
  return r;
}
function tuft(seed) {
  const m = new Model(5, 5, 4), cols = [0x7c7c46, 0x9a9152, 0x60653a, 0x8c8a4c];
  const n = 3 + Math.floor(rand(seed, 1) * 4);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(rand(seed, i * 3 + 2) * 5), y = Math.floor(rand(seed, i * 3 + 3) * 5), h = 1 + Math.floor(rand(seed, i * 3 + 4) * 3);
    m.box(x, y, 0, 1, 1, h, cols[(seed + i) % 4]);
  }
  return m;
}
function rock(seed) {
  const m = new Model(5, 5, 3), c = rand(seed, 9) > 0.5 ? 0x8f8d86 : 0x76736b;
  m.box(1, 1, 0, 3, 3, 1, c).box(1 + (seed % 2), 1, 1, 2, 2, 1, mulc(c, 1.1));
  return m;
}
function wreckModel() {
  const m = new Model(30, 30, 6), P = TEAM[1];
  for (let i = 0; i < 26; i++) {
    const x = rand(i, 41) * 24 + 3, y = rand(i, 42) * 24 + 3, w = 1 + Math.floor(rand(i, 43) * 4), d = 1 + Math.floor(rand(i, 44) * 4);
    m.box(Math.floor(x), Math.floor(y), 0, w, d, 1 + Math.floor(rand(i, 45) * 3), i % 3 ? 0x3a3632 : P.dark);
  }
  m.box(12, 12, 0, 6, 6, 3, 0x2e2a27).box(13, 13, 3, 4, 3, 1, P.acc);
  return m;
}

// ---------- rasterizer ----------
class Raster {
  constructor(pitchDeg, bot) {
    const p = (pitchDeg * Math.PI) / 180;
    this.s = Math.sin(p); this.c = Math.abs(Math.cos(p)) < 1e-6 ? 0 : Math.cos(p);
    this.bot = bot;
    this.col = new Uint32Array(LW * LH); this.dep = new Float32Array(LW * LH).fill(Infinity);
    this.shadow = new Uint8Array(LW * LH);
  }
  sy(Y, Z) { return this.bot - Y * this.s - Z * this.c; }
  // world -> screen (low-res px)
  at(wx, wy, wz = 0) { return [wx * K, this.sy(wy * K, wz * K)]; }
  groundPass() {
    for (let py = 0; py < LH; py++) for (let px = 0; px < LW; px++) {
      const Y = (this.bot - py - 0.5) / this.s, wx = (px + 0.5) / K, wy = Y / K;
      const [r, g, b] = groundColor(wx, wy), f = groundShade(wx, wy, 3);
      const n = 1 + (hash(px, py, 77) - 0.5) * 0.05;
      this.col[py * LW + px] = (Math.min(255, r * f * n) << 16) | (Math.min(255, g * f * n) << 8) | Math.min(255, b * f * n);
    }
  }
  fill(px, a, b, color, depth) {
    for (let r = Math.ceil(a - 0.5); r + 0.5 < b; r++) {
      if (r < 0 || r >= LH) continue;
      const i = r * LW + px;
      if (depth < this.dep[i]) { this.dep[i] = depth; this.col[i] = color; }
    }
  }
  // draw a model whose center sits at world (wx, wy); zoff in voxels
  draw(m, wx, wy, zoff = 0, corner = false) {
    const ox = Math.round(corner ? wx * K : wx * K - m.w / 2), oy = Math.round(corner ? wy * K : wy * K - m.d / 2);
    const { s, c } = this;
    for (let z = 0; z < m.h; z++) for (let y = 0; y < m.d; y++) for (let x = 0; x < m.w; x++) {
      let v = m.v[m.idx(x, y, z)];
      if (v < 0) continue;
      const top = m.get(x, y, z + 1) < 0, south = c > 0 && m.get(x, y - 1, z) < 0;
      if (!top && !south) continue;
      const px = ox + x; if (px < 0 || px >= LW) continue;
      const Y = oy + y, Z = z + zoff, depth = (Y + 0.5) * c - (Z + 0.5) * s;
      const emi = v & EMI; v &= 0xffffff;
      const n = emi ? 1 : 1 + (hash(x * 3 + z, y * 5 + z * 7, 17) - 0.5) * 0.06;
      if (top) {
        let f = 1.0;
        if (!emi) {
          if (m.get(x, y + 1, z) < 0) f += 0.12;
          if (m.get(x - 1, y, z) < 0) f += 0.06;
          if (m.get(x + 1, y, z) < 0) f -= 0.08;
          if (m.get(x, y - 1, z + 1) >= 0 || m.get(x + 1, y, z + 1) >= 0) f -= 0.12; // occluded by taller neighbor
        }
        this.fill(px, this.sy(Y + 1, Z + 1), this.sy(Y, Z + 1), mulc(v, f * n), depth);
      }
      if (south) {
        let f = emi ? 0.9 : 0.66;
        if (!emi && m.get(x + 1, y, z) < 0) f -= 0.05;
        this.fill(px, this.sy(Y, Z + 1), this.sy(Y, Z), mulc(v, f * n), depth - 0.01);
      }
    }
  }
  // long hard shadows toward the south-east
  cast(m, wx, wy, zoff = 0, corner = false) {
    const ox = corner ? wx * K : wx * K - m.w / 2, oy = corner ? wy * K : wy * K - m.d / 2;
    const LX = 0.85, LY = 0.6;
    for (let y = 0; y < m.d; y++) for (let x = 0; x < m.w; x++) {
      let top = -1;
      for (let z = m.h - 1; z >= 0; z--) if (m.v[m.idx(x, y, z)] >= 0) { top = z; break; }
      if (top < 0) continue;
      for (let t = zoff; t <= top + 1 + zoff; t += 0.35) {
        const gx = ox + x + 0.5 + t * LX, gy = oy + y + 0.5 - t * LY;
        const px = Math.floor(gx), py = Math.floor(this.sy(gy, 0));
        if (px >= 0 && px < LW && py >= 0 && py < LH) this.shadow[py * LW + px] = 1;
      }
    }
  }
  applyShadow() {
    const sh = this.shadow, out = sh.slice();
    for (let y = 1; y < LH - 1; y++) for (let x = 1; x < LW - 1; x++) {
      const i = y * LW + x;
      if (!sh[i] && sh[i - 1] + sh[i + 1] + sh[i - LW] + sh[i + LW] >= 3) out[i] = 1;
    }
    for (let i = 0; i < out.length; i++) if (out[i]) {
      const c = this.col[i];
      this.col[i] = (((((c >> 16) & 255) * 0.56) | 0) << 16) | ((((c >> 8) & 255) * 0.6 | 0) << 8) | (((c & 255) * 0.7) | 0);
    }
  }
  // ---- 2D pixel effects (no depth)
  blend(x, y, c, a, add = false) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= LW || y >= LH) return;
    const i = y * LW + x, d = this.col[i];
    const dr = (d >> 16) & 255, dg = (d >> 8) & 255, db = d & 255, r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    const o = add ? [Math.min(255, dr + r * a), Math.min(255, dg + g * a), Math.min(255, db + b * a)]
      : [dr + (r - dr) * a, dg + (g - dg) * a, db + (b - db) * a];
    this.col[i] = ((o[0] | 0) << 16) | ((o[1] | 0) << 8) | (o[2] | 0);
  }
  line(x0, y0, x1, y1, c, a = 1, add = false, every = 1) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 0; i <= n; i += every) this.blend(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c, a, add);
  }
  disc(cx, cy, r, c, a = 1, add = false, ragged = 0, seed = 0) {
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const rr = r * (1 - ragged * hash(x, y, seed));
      if (d <= rr) this.blend(x, y, c, a, add);
    }
  }
  ellipse(cx, cy, rx, ry, c, a, every = 2) {
    const n = Math.ceil(2 * Math.PI * Math.max(rx, ry));
    for (let i = 0; i < n; i += every) { const t = (i / n) * Math.PI * 2; this.blend(cx + Math.cos(t) * rx, cy + Math.sin(t) * ry, c, a); }
  }
  toCanvas() {
    const cv = document.createElement('canvas'); cv.width = LW; cv.height = LH;
    const cx = cv.getContext('2d'), img = cx.createImageData(LW, LH);
    for (let i = 0; i < this.col.length; i++) {
      const c = this.col[i]; img.data[i * 4] = (c >> 16) & 255; img.data[i * 4 + 1] = (c >> 8) & 255; img.data[i * 4 + 2] = c & 255; img.data[i * 4 + 3] = 255;
    }
    cx.putImageData(img, 0, 0); return cv;
  }
}

// ---------- scene render ----------
const MECH_H = { scout: 9, gunner: 11, brawler: 15, mortar: 15, aegis: 13, seeker: 12, breacher: 13, lancer: 11 };
const MECH_R = { scout: 16, gunner: 20, brawler: 28, mortar: 24, aegis: 22, seeker: 22, breacher: 30, lancer: 22 };
function unitModel(e) {
  if (e.kind === 'turret') return null;
  return rotate(MECHS[e.type](TEAM[e.team], e.stride), heading(e));
}

export function renderVoxel(canvas, pitch, label) {
  canvas.width = DEV_W; canvas.height = DEV_H;
  const ctx = canvas.getContext('2d');
  const bot = LH - (HUD_BOT * DPR) / PIX;
  const R = new Raster(pitch, bot);
  R.groundPass();

  // ground overlays: build grid corners, active lane, planned cells
  const gpt = (wx, wy) => R.at(wx, wy);
  for (let row = 0; row < 7; row++) for (let lane = 0; lane < 5; lane++) {
    const x0 = lane * 120 + 4, x1 = lane * 120 + 116, y0 = 220 + row * 100 + 4, y1 = y0 + 92;
    for (const [cx, cy, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
      const [a, b] = gpt(cx, cy), [c2] = gpt(cx + dx * 14, cy), [, d2] = gpt(cx, cy + dy * 14);
      R.line(a, b, c2, b, 0xe8eedb, 0.28); R.line(a, b, a, d2, 0xe8eedb, 0.28);
    }
  }
  { // active lane highlight (lane 3, index 2)
    for (let wy = 100; wy < 230; wy += 1 / K / 1.2) { const [a, b] = gpt(242, wy), [c2] = gpt(358, wy); R.line(a, b, c2, b, 0x4ea3ff, 0.1); }
    for (const wy of [140, 175, 210]) { const [a, b] = gpt(300, wy); for (let i = -5; i <= 5; i++) R.blend(a + i, b + Math.abs(i) * 0.6, 0x8fdcff, 0.85); }
  }
  for (const p of [...SCENE.planned, SCENE.building]) {
    const [a, b] = gpt(p.x - 54, p.y - 46), [c2, d2] = gpt(p.x + 54, p.y + 46);
    R.line(a, b, c2, b, 0x4ea3ff, 0.9, false, 2); R.line(a, d2, c2, d2, 0x4ea3ff, 0.9, false, 2);
    R.line(a, b, a, d2, 0x4ea3ff, 0.9, false, 2); R.line(c2, b, c2, d2, 0x4ea3ff, 0.9, false, 2);
  }

  // collect objects
  const objs = [];
  objs.push({ m: baseModel(), x: 0, y: 0, z: 0, corner: true });
  for (let i = 0; i < 420; i++) {
    const wx = rand(i, 11) * 600, wy = 110 + rand(i, 12) * 1250;
    const [, , , gt] = groundColor(wx, wy);
    if (rand(i, 13) < 0.25 + gt) objs.push({ m: tuft(i), x: wx, y: wy, z: 0, small: true });
  }
  for (let i = 0; i < 60; i++) objs.push({ m: rock(i), x: rand(i, 21) * 600, y: 110 + rand(i, 22) * 1250, z: 0, small: true });
  for (const bx of [120, 240, 360, 480]) for (let wy = 160; wy < 1300; wy += 160) {
    const m = new Model(3, 3, 4); m.box(0, 0, 0, 2, 2, 3, 0x9a978b).box(0, 1, 3, 2, 1, 1, 0xd8a040 | EMI);
    objs.push({ m, x: bx, y: wy, z: 0, small: true });
  }
  objs.push({ m: wreckModel(), x: SCENE.wreck.x, y: SCENE.wreck.y, z: 0 });
  for (const t of SCENE.turrets) {
    objs.push({ m: pad(t.type), x: t.x, y: t.y, z: 0 });
    const a = t.aim ? aimAngle(t, byId[t.aim]) : 0;
    objs.push({ m: rotate(head(t.type, TEAM[t.team]), a), x: t.x, y: t.y, z: t.type === 'arc' ? 2 : 3 });
  }
  { // turret under construction: pad + scaffold + half head
    const b = SCENE.building, pm = pad(b.type);
    objs.push({ m: pm, x: b.x, y: b.y, z: 0 });
    const hm = head(b.type, TEAM[0]); for (let z = 2; z < hm.h; z++) for (let y = 0; y < hm.d; y++) for (let x = 0; x < hm.w; x++) hm.v[hm.idx(x, y, z)] = -1;
    objs.push({ m: hm, x: b.x, y: b.y, z: 3 });
    const sc = new Model(26, 26, 12);
    for (const [x, y] of [[2, 2], [23, 2], [2, 23], [23, 23]]) sc.box(x, y, 0, 1, 1, 12, 0xc0a24a);
    sc.box(2, 2, 11, 22, 1, 1, 0xc0a24a).box(2, 23, 11, 22, 1, 1, 0xc0a24a);
    objs.push({ m: sc, x: b.x, y: b.y, z: 0 });
  }
  objs.push({ m: constructorModel(TEAM[0]), x: SCENE.constructor.x, y: SCENE.constructor.y, z: 0 });
  for (const e of SCENE.mechs) objs.push({ m: unitModel(e), x: e.x, y: e.y, z: 0 });

  for (const o of objs) R.cast(o.m, o.x, o.y, o.z, o.corner);
  R.applyShadow();
  for (const o of objs) R.draw(o.m, o.x, o.y, o.z, o.corner);

  // ---- effects
  const gunZ = (e) => (byId[e] && byId[e].type in MECH_H ? MECH_H[byId[e].type] * 0.75 : 5) / K;
  const fwd = (id, d) => { const e = byId[id]; const a = e.aim ? aimAngle(e, byId[e.aim]) : heading(e); return [e.x + Math.sin(a) * d, e.y + Math.cos(a) * d]; };
  for (const f of SCENE.fx) {
    if (f.k === 'aegis') {
      const [cx, cy] = R.at(f.x, f.y);
      R.ellipse(cx, cy, f.r * K, f.r * K * R.s, 0x7fe9ff, 0.7, 2);
      for (let y = -f.r; y <= f.r; y += 1 / K) for (let x = -f.r; x <= f.r; x += 1 / K) if (x * x + y * y < f.r * f.r && hash(x | 0, y | 0, 3) < 0.5) { const [a, b] = R.at(f.x + x, f.y + y); R.blend(a, b, 0x7fe9ff, 0.05); }
    }
  }
  for (const f of SCENE.fx) {
    if (f.k === 'tracer') {
      const [fx0, fy0] = fwd(f.from, 26), t = byId[f.to];
      const [a, b] = R.at(fx0, fy0, gunZ(f.from)), [c2, d2] = R.at(t.x, t.y, gunZ(f.to));
      const u = 0.35, v = 0.65, x0 = a + (c2 - a) * u, y0 = b + (d2 - b) * u, x1 = a + (c2 - a) * v, y1 = b + (d2 - b) * v;
      R.line(x0, y0, x1, y1, 0xffe39a, 0.9, true);
      const x2 = a + (c2 - a) * 0.8, y2 = b + (d2 - b) * 0.8; R.line(x2, y2, x2 + (c2 - a) * 0.08, y2 + (d2 - b) * 0.08, 0xffcf70, 0.7, true);
    }
    if (f.k === 'muzzle') {
      const [mx, my] = fwd(f.at, f.big ? 52 : 26), [a, b] = R.at(mx, my, gunZ(f.at));
      R.disc(a, b, f.big ? 3.2 : 2, 0xffc040, 0.9, true); R.disc(a, b, f.big ? 1.6 : 1, 0xffffff, 1);
      if (f.big) { R.disc(a + 3, b - 2, 3, 0xb8b2a2, 0.5); R.disc(a + 6, b - 4, 2.5, 0xa8a292, 0.4); }
    }
    if (f.k === 'sparks') {
      const [a, b] = R.at(f.x, f.y, 8 / K);
      for (let i = 0; i < (f.big ? 14 : 8); i++) { const t = rand(i, 61) * Math.PI * 2, d = 1 + rand(i, 62) * (f.big ? 7 : 4); R.blend(a + Math.cos(t) * d, b + Math.sin(t) * d * 0.7, i % 2 ? 0xffe9a0 : 0xffa040, 1); }
      R.disc(a, b, f.big ? 2.5 : 1.5, 0xfff2c0, 0.9, true);
    }
    if (f.k === 'explosion') {
      const [a, b] = R.at(f.x, f.y, 6 / K), r = f.r * K;
      R.disc(a + 2, b + 1, r * 1.1, 0x2a2622, 0.55, false, 0.35, 5);
      R.disc(a, b, r * 0.85, 0xe0601c, 1, false, 0.3, 6);
      R.disc(a - 1, b - 1, r * 0.6, 0xff9a2a, 1, false, 0.25, 7);
      R.disc(a - 1, b - 1, r * 0.35, 0xffe070, 1, false, 0.2, 8);
      R.disc(a - 1, b - 2, r * 0.15, 0xffffff, 1);
      for (let i = 0; i < 16; i++) { const t = rand(i, 71) * Math.PI * 2, d = r * (1 + rand(i, 72) * 0.9); R.blend(a + Math.cos(t) * d, b + Math.sin(t) * d * 0.8, i % 3 ? 0x3a3530 : 0xffb050, 1); }
    }
    if (f.k === 'smoke') {
      for (let i = 0; i < 7; i++) {
        const [a, b] = R.at(f.x + i * 7 + rand(i, 81) * 10, f.y - i * 4, (10 + i * 12) / 1);
        R.disc(a, b, (f.r * K) * (0.35 + i * 0.09), i < 2 ? 0x4a4440 : 0x7a756c, 0.55 - i * 0.05, false, 0.3, i + 30);
      }
    }
    if (f.k === 'missile') {
      const pts = f.path.map(([x, y], i) => R.at(x, y, (14 + i * 10) / 1));
      for (let i = 0; i < pts.length - 1; i++) {
        const [a, b] = pts[i], [c2, d2] = pts[i + 1], n = Math.ceil(Math.hypot(c2 - a, d2 - b));
        for (let j = 0; j < n; j += 2) R.disc(a + ((c2 - a) * j) / n, b + ((d2 - b) * j) / n, 0.6 + (i / pts.length) * 0.6, 0xcfcac0, 0.25 + (i / pts.length) * 0.35);
      }
      const [a, b] = pts[pts.length - 1], [pa, pb] = pts[pts.length - 2];
      const dx = a - pa, dy = b - pb, m = Math.hypot(dx, dy);
      R.line(a, b, a + (dx / m) * 3, b + (dy / m) * 3, 0xe8e4d8, 1);
      R.blend(a - dx / m, b - dy / m, 0xffd060, 1); R.disc(a - (dx / m) * 1.5, b - (dy / m) * 1.5, 1.4, 0xff9a30, 0.6, true);
    }
    if (f.k === 'shell') {
      const [g1, g2] = R.at(f.x, f.y), [a, b] = R.at(f.x, f.y, f.z);
      R.disc(g1 + f.z * K * 0.85, g2 + f.z * K * 0.6 * R.s, 1.2, 0x000000, 0.35);
      R.disc(a, b, 1.3, 0x2a2a28, 1); R.blend(a - 0.5, b - 0.5, 0x9a968a, 1);
      for (let i = 1; i < 6; i++) R.blend(a - i * 0.8, b + i * 1.2, 0xc8c2b0, 0.3 - i * 0.04);
    }
    if (f.k === 'slug') {
      const [a, b] = R.at(f.from[0], f.from[1], 22), [c2, d2] = R.at(f.to[0], f.to[1], 22);
      R.line(a, b, c2, d2, 0x7fd8ff, 0.35, true); R.line(a + 1, b, c2 + 1, d2, 0x7fd8ff, 0.2, true); R.line(a - 1, b, c2 - 1, d2, 0x7fd8ff, 0.2, true);
      R.line((a + c2) / 2, (b + d2) / 2, c2, d2, 0xffffff, 0.9, true); R.disc(c2, d2, 1.8, 0xe8fbff, 1, true);
    }
    if (f.k === 'zap') {
      const pts = f.pts.map(([x, y], i) => R.at(x, y, i === 0 ? 38 : 16));
      for (let i = 0; i < pts.length - 1; i++) {
        const [a, b] = pts[i], [c2, d2] = pts[i + 1];
        const mx = (a + c2) / 2 + (rand(i, 91) - 0.5) * 6, my = (b + d2) / 2 + (rand(i, 92) - 0.5) * 4;
        for (const [o, al] of [[0, 1], [1, 0.3], [-1, 0.3]]) { R.line(a + o, b, mx + o, my, 0x9ff4ff, al, true); R.line(mx + o, my, c2 + o, d2, 0x9ff4ff, al, true); }
      }
      const [ea, eb] = pts[pts.length - 1]; R.disc(ea, eb, 2, 0xe8ffff, 0.8, true);
    }
    if (f.k === 'weld') {
      const [a, b] = R.at(f.x, f.y, 10 / K);
      R.disc(a, b, 1.5, 0xffffff, 1, true); R.disc(a, b, 3.5, 0x8fdcff, 0.35, true);
      for (let i = 0; i < 7; i++) { const t = rand(i, 101) * Math.PI * 2, d = 2 + rand(i, 102) * 4; R.blend(a + Math.cos(t) * d, b + Math.sin(t) * d * 0.6, 0xfff0a0, 1); }
      // build progress bar
      const [px, py] = R.at(f.x, f.y - 40); for (let i = -10; i < 10; i++) { R.blend(px + i, py, 0x101010, 0.8); if (i < -10 + 20 * SCENE.building.progress) R.blend(px + i, py, 0x8fdcff, 1); }
    }
  }
  // HP bars
  for (const [id, hp] of Object.entries(SCENE.hp)) {
    const e = byId[id], h = e.type in MECH_H ? MECH_H[e.type] : 9, r = (MECH_R[e.type] || 26) * K;
    const [a, b] = R.at(e.x, e.y, 0); const y = Math.round(b - h * R.c - r * R.s - 3);
    const w = Math.round(r * 1.4), x0 = Math.round(a - w / 2);
    for (let i = -1; i <= w; i++) { R.blend(x0 + i, y, 0x0a0a0a, 0.85); R.blend(x0 + i, y + 1, 0x0a0a0a, 0.85); }
    for (let i = 0; i < Math.round(w * hp); i++) R.blend(x0 + i, y, e.team ? 0xe3533f : 0x4ea3ff, 1);
  }

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(R.toCanvas(), 0, 0, DEV_W, DEV_H);

  // icons for HUD cards: render the model alone into a small raster
  const icon = (c, type, cx, cy, size) => {
    const m = MECHS[type](TEAM[0], 1), n = Math.max(m.w, m.d) + 2;
    const cv = document.createElement('canvas'); cv.width = n; cv.height = n;
    const ic = cv.getContext('2d'), img = ic.createImageData(n, n);
    const p = (Math.min(pitch, 58) * Math.PI) / 180, s = Math.sin(p), co = Math.cos(p);
    const dep = new Float32Array(n * n).fill(Infinity), col = new Int32Array(n * n).fill(-1);
    const ox = Math.round(n / 2 - m.w / 2), botI = n / 2 + (m.d / 2) * s + (m.h / 2) * co * 0.6;
    const syI = (Y, Z) => botI - Y * s - Z * co;
    for (let z = 0; z < m.h; z++) for (let y = 0; y < m.d; y++) for (let x = 0; x < m.w; x++) {
      let v = m.v[m.idx(x, y, z)]; if (v < 0) continue;
      const top = m.get(x, y, z + 1) < 0, south = m.get(x, y - 1, z) < 0; v &= 0xffffff;
      const d = (y + 0.5) * co - (z + 0.5) * s, px = ox + x;
      const put = (a, b, cc, dd) => { for (let r = Math.ceil(a - 0.5); r + 0.5 < b; r++) if (r >= 0 && r < n && dd < dep[r * n + px]) { dep[r * n + px] = dd; col[r * n + px] = cc; } };
      if (top) put(syI(y + 1, z + 1), syI(y, z + 1), mulc(v, m.get(x, y + 1, z) < 0 ? 1.12 : 1), d);
      if (south) put(syI(y, z + 1), syI(y, z), mulc(v, 0.66), d - 0.01);
    }
    for (let i = 0; i < n * n; i++) if (col[i] >= 0) { img.data[i * 4] = (col[i] >> 16) & 255; img.data[i * 4 + 1] = (col[i] >> 8) & 255; img.data[i * 4 + 2] = col[i] & 255; img.data[i * 4 + 3] = 255; }
    ic.putImageData(img, 0, 0);
    c.imageSmoothingEnabled = false;
    const sz = Math.max(n, Math.floor(size / n) * n);
    c.drawImage(cv, Math.round(cx - sz / 2), Math.round(cy - sz / 2), sz, sz);
  };
  drawHUD(ctx, { icon, label });
}
