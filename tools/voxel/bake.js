// Bakes the voxel sprites and the ground into image sheets (runs in the browser via tools/bake_voxel.cjs).
// Projection = art sample 7: oblique, ground y squashed by A, height shifts up by B and left by OX.
import { FIELD, BASE_FACE } from '../../src/data.js';
import { Grid, render, L, TEAM, LEGS, TOP, MECH_TOP, padModel, headModel, constructorModel, baseModel, addScatter, groundAlbedo } from './model.js';

export const UB = 2;          // sprite px per world unit (phones show ~1.9)
export const V = 1.5;         // world units per voxel (3 px voxels, like sample 7)
export const A = 0.78, B = 0.72, OX = -0.32;
export const VIS = { mech: 1.3, turret: 1.1, con: 1.2 };
const P = V * UB;
const MECH_TYPES = Object.keys(LEGS);
export const N_HEAD = 16, N_AIM = 64;
// walk cycle: each foot slides between -amp and +amp (model units); 5 baked positions, played as a triangle wave
export const STRIDE_POS = [-1, -0.5, 0, 0.5, 1];
const AMP = { scout: 4.3, gunner: 5.8, brawler: 7.7, mortar: 5.8, aegis: 5.3, seeker: 5.3, breacher: 6.4, lancer: 5.3 }; // long, heavy strides
const TYPE_SCALE = { brawler: 1.1 };

// extent of a primitive list in model units: horizontal radius and top height
export function extent(prims) {
  let r = 0, h = 0;
  for (const p of prims) {
    const e = Math.hypot(...p.ex);
    r = Math.max(r, Math.hypot(p.x, p.y) + e);
    h = Math.max(h, p.z + e);
  }
  return { r, h };
}
// Render primitive sets (each [prims, heading]) around the origin into a fixed-size cell.
export function cell(R, Hm) {
  const n = Math.ceil((2 * R) / V) + 2, nz = Math.ceil(Hm / V) + 1;
  const x0 = 2 - nz * OX * P, bot = 2 + (n * A + nz * B) * P;
  const W = Math.ceil(x0 + n * P + 2), H = Math.ceil(bot + 2);
  const org = (R + V) / V; // voxel coordinate of the model origin
  return { n, nz, x0, bot, W, H, ax: x0 + org * P, ay: bot - org * A * P, R };
}
export function renderSet(c, sets, s) {
  const G = new Grid(c.n, c.n, c.nz, V, -c.R - V, -c.R - V);
  for (const [prims, th] of sets) G.add(prims, 0, 0, 0, th, s);
  return { px: render(G, c.W, c.H, { p: P, a: A, b: B, ox: OX, x0: c.x0, bot: c.bot }, null), G };
}
// Ground shadow of a grid's columns (hard sun shadow on z = 0), as an alpha mask in its own cell.
const KX = -L[0] / L[2], KY = -L[1] / L[2];
function shadowCell(R, Hm) {
  const xmin = -R - V, xmax = R + Hm * KX + V, ymin = -R - V, ymax = R + Hm * KY + V;
  return { xmin, ymin, ymax, W: Math.ceil((xmax - xmin) * UB) + 2, H: Math.ceil((ymax - ymin) * A * UB) + 2, ax: -xmin * UB, ay: ymax * A * UB };
}
function renderShadow(sc, G) {
  const { NX, NY, NZ, g } = G, top = new Uint8Array(NX * NY);
  for (let z = 0; z < NZ; z++) for (let i = 0; i < NX * NY; i++) if (g[z * NX * NY + i]) top[i] = z + 1;
  const cv = new OffscreenCanvas(sc.W, sc.H), c = cv.getContext('2d');
  c.fillStyle = '#000';
  const pw = V * UB, ph = V * A * UB;
  for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
    const m = top[y * NX + x]; if (!m) continue;
    for (let t = 0; t <= m; t += 0.5) {
      const wx = G.wx0 + (x + t * KX) * V, wy = G.wy0 + (y + t * KY) * V;
      c.fillRect((wx - sc.xmin) * UB, (sc.ymax - wy - V) * A * UB, pw + 0.5, ph + 0.5);
    }
  }
  return c.getImageData(0, 0, sc.W, sc.H).data;
}

// ---------- sheets ----------
// Frames are cropped to their visible pixels and shelf-packed. meta.frames[i] = [sx, sy, w, h, dx, dy]:
// source rect in the sheet and its offset inside the full cell (whose anchor is ax, ay).
class Sheet {
  constructor(name, w, h, n, extra = {}) {
    this.frames = new Array(n);
    this.meta = { file: name + '.png', w, h, n, ...extra };
  }
  put(i, px) {
    const { w, h } = this.meta;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) { this.frames[i] = { px: null, x0: 0, y0: 0, fw: 1, fh: 1 }; return; }
    const fw = x1 - x0 + 1, fh = y1 - y0 + 1, out = new Uint8ClampedArray(fw * fh * 4);
    for (let y = 0; y < fh; y++) out.set(px.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x0 + fw) * 4), y * fw * 4);
    this.frames[i] = { px: out, x0, y0, fw, fh };
  }
  finish() {
    const MAXW = 2048, rects = [];
    let x = 0, y = 0, shelf = 0, W = 0;
    for (const f of this.frames) {
      if (x + f.fw + 1 > MAXW) { x = 0; y += shelf + 1; shelf = 0; }
      rects.push([x, y]); x += f.fw + 1; shelf = Math.max(shelf, f.fh); W = Math.max(W, x);
    }
    this.cv = new OffscreenCanvas(Math.max(1, W), Math.max(1, y + shelf));
    const c = this.cv.getContext('2d');
    this.meta.frames = this.frames.map((f, i) => {
      if (f.px) c.putImageData(new ImageData(f.px, f.fw, f.fh), rects[i][0], rects[i][1]);
      return [rects[i][0], rects[i][1], f.fw, f.fh, f.x0, f.y0];
    });
    return this;
  }
}
async function toDataURL(cv, type = 'image/png', q) {
  const blob = await cv.convertToBlob({ type, quality: q });
  return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
}

export async function bakeAll(log = () => {}, only = null) {
  const meta = { UB, V, A, B, OX, VIS, N_HEAD, N_AIM, STRIDE_POS, sheets: {} }, files = {};
  const save = async (name, sheet) => { sheet.finish(); meta.sheets[name] = sheet.meta; files[sheet.meta.file] = await toDataURL(sheet.cv); };
  const want = (k) => !only || only.includes(k);

  // mechs: legs (16 headings x 3 stride frames), upper body (32 aims), shadow (16 headings)
  for (const type of MECH_TYPES) {
    if (!want(type)) continue;
    const s = VIS.mech * (TYPE_SCALE[type] || 1), all = [...LEGS[type](TEAM[0], 0), ...TOP[type](TEAM[0])], ex = extent(all);
    const c = cell(ex.r * s, ex.h * s), sc = shadowCell(ex.r * s, ex.h * s), strides = STRIDE_POS.map((k) => k * AMP[type]);
    // stride: world distance per full walk cycle (each planted foot travels 2 amp per half cycle)
    const meta0 = { ax: c.ax, ay: c.ay, top: MECH_TOP[type] * s, stride: 4 * AMP[type] * s };
    for (const team of [0, 1]) {
      const legs = new Sheet(`mech_${type}_${team}_legs`, c.W, c.H, N_HEAD * strides.length, meta0);
      for (let h = 0; h < N_HEAD; h++) strides.forEach((st, k) => legs.put(h * strides.length + k, renderSet(c, [[LEGS[type](TEAM[team], st), (h / N_HEAD) * Math.PI * 2]], s).px));
      await save(`mech_${type}_${team}_legs`, legs);
      const top = new Sheet(`mech_${type}_${team}_top`, c.W, c.H, N_AIM, meta0);
      for (let a = 0; a < N_AIM; a++) top.put(a, renderSet(c, [[TOP[type](TEAM[team]), (a / N_AIM) * Math.PI * 2]], s).px);
      await save(`mech_${type}_${team}_top`, top);
    }
    const sh = new Sheet(`mech_${type}_shadow`, sc.W, sc.H, N_HEAD, { ax: sc.ax, ay: sc.ay });
    for (let h = 0; h < N_HEAD; h++) {
      const th = (h / N_HEAD) * Math.PI * 2, { G } = renderSet(c, [[LEGS[type](TEAM[0], 0), th], [TOP[type](TEAM[0]), th]], s);
      sh.put(h, renderShadow(sc, G));
    }
    await save(`mech_${type}_shadow`, sh);
    log(`mech ${type}`);
  }
  // turrets: pad (1), head per team (32 aims), shadow (1)
  for (const type of ['sentry', 'howitzer', 'arc']) {
    if (!want(type)) continue;
    const s = VIS.turret, all = [...padModel(type), ...headModel(type, TEAM[0])], ex = extent(all);
    const c = cell(ex.r * s, ex.h * s), sc = shadowCell(ex.r * s, ex.h * s), m0 = { ax: c.ax, ay: c.ay, top: ex.h * s * 0.6 };
    const pad = new Sheet(`turret_${type}_pad`, c.W, c.H, 1, m0);
    pad.put(0, renderSet(c, [[padModel(type), 0]], s).px);
    await save(`turret_${type}_pad`, pad);
    for (const team of [0, 1]) {
      const head = new Sheet(`turret_${type}_${team}_head`, c.W, c.H, N_AIM, m0);
      for (let a = 0; a < N_AIM; a++) head.put(a, renderSet(c, [[headModel(type, TEAM[team]), (a / N_AIM) * Math.PI * 2]], s).px);
      await save(`turret_${type}_${team}_head`, head);
    }
    const sh = new Sheet(`turret_${type}_shadow`, sc.W, sc.H, 1, { ax: sc.ax, ay: sc.ay });
    sh.put(0, renderShadow(sc, renderSet(c, [[padModel(type), 0], [headModel(type, TEAM[0]), 0]], s).G));
    await save(`turret_${type}_shadow`, sh);
    log(`turret ${type}`);
  }
  // constructor (player only): 16 headings + shadows
  if (want('constructor')) {
    const s = VIS.con, prims = constructorModel(TEAM[0]), ex = extent(prims);
    const c = cell(ex.r * s, ex.h * s), sc = shadowCell(ex.r * s, ex.h * s);
    const body = new Sheet('constructor', c.W, c.H, N_HEAD, { ax: c.ax, ay: c.ay, top: ex.h * s });
    const sh = new Sheet('constructor_shadow', sc.W, sc.H, N_HEAD, { ax: sc.ax, ay: sc.ay });
    for (let h = 0; h < N_HEAD; h++) {
      const r = renderSet(c, [[prims, (h / N_HEAD) * Math.PI * 2]], s);
      body.put(h, r.px); sh.put(h, renderShadow(sc, r.G));
    }
    await save('constructor', body); await save('constructor_shadow', sh);
    log('constructor');
  }
  // bases: one sprite each, local coords x 0..600, y 0..110 (team 1 is rotated to face south)
  if (want('base')) for (const team of [0, 1]) {
    const nx = Math.ceil(600 / V), ny = Math.ceil(110 / V), nz = Math.ceil(70 / V);
    const G = new Grid(nx, ny, nz, V, 0, 0);
    if (team === 0) G.add(baseModel(0), 0, 0, 0, 0, 1); else G.add(baseModel(1), 600, 100, 0, Math.PI, 1);
    const x0 = 2 - nz * OX * P, bot = 2 + (ny * A + nz * B) * P, W = Math.ceil(x0 + nx * P + 2), H = Math.ceil(bot + 2);
    const sh = new Sheet(`base_${team}`, W, H, 1, { ax: x0, ay: bot });
    sh.put(0, render(G, W, H, { p: P, a: A, b: B, ox: OX, x0, bot }, null));
    await save(`base_${team}`, sh);
    log(`base ${team}`);
  }
  // ground: 4 tiles of 600 world units, opaque, with grass/pebble voxels
  if (want('ground')) {
    meta.ground = { tiles: [], tileH: 600 };
    for (let t = 0; t < FIELD.h / 600; t++) {
      const y0 = t * 600, y1 = y0 + 600, m = 24;
      const G = new Grid(Math.ceil(FIELD.w / V), Math.ceil((600 + 2 * m) / V), 6, V, 0, y0 - m);
      addScatter(G, 104, FIELD.h - 104);
      const W = FIELD.w * UB, H = Math.round(600 * A * UB), bot = H + m * A * P / V;
      const px = render(G, W, H, { p: P, a: A, b: B, ox: OX, x0: 0, bot }, groundAlbedo);
      const cv = new OffscreenCanvas(W, H); cv.getContext('2d').putImageData(new ImageData(px, W, H), 0, 0);
      const name = `ground_${t}.jpg`;
      files[name] = await toDataURL(cv, 'image/jpeg', 0.88);
      meta.ground.tiles.push(name);
      log(`ground ${t}`);
    }
  }
  return { meta, files };
}
