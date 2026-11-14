// All drawing lives here (flat vector development style). The simulation never draws, so this
// module can be replaced by the voxel renderer later without touching gameplay.
import { FIELD, LANES, ROWS, LANE_W, BASE_FACE, laneX, cellY, MECHS, TURRETS } from './data.js';

const VIS_MECH = 1.3, VIS_TURRET = 1.1, VIS_CON = 1.2;
const TEAM = [
  { base: '#7f7c55', dark: '#4f4e36', light: '#a9a67b', metal: '#4c4f4a', gun: '#2f3235', acc: '#3b8be6', glow: '#8fdcff', hp: '#4ea3ff' },
  { base: '#6f716c', dark: '#454744', light: '#979991', metal: '#45474a', gun: '#2c2e31', acc: '#d0483b', glow: '#ff7a55', hp: '#e3533f' },
];
const GLASS = '#22343b', CONCRETE = '#8f8c82', SAND = '#a99c75', HAZ = '#b39a3c', OUT = '#1e2119';

let SHADOW = false;
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 >>> 0) / 4294967296); }

// ---------- primitive parts (local units, forward = -y) ----------
const P = {
  rr(c, x, y, w, h, r = Math.min(w, h) * 0.25) { c.roundRect(x - w / 2, y - h / 2, w, h, r); },
  ch(c, x, y, w, h, k = Math.min(w, h) * 0.28) {
    const l = x - w / 2, t = y - h / 2;
    c.moveTo(l + k, t); c.lineTo(l + w - k, t); c.lineTo(l + w, t + k); c.lineTo(l + w, t + h - k);
    c.lineTo(l + w - k, t + h); c.lineTo(l + k, t + h); c.lineTo(l, t + h - k); c.lineTo(l, t + k); c.closePath();
  },
  ci(c, x, y, r) { c.moveTo(x + r, y); c.arc(x, y, r, 0, Math.PI * 2); },
};
function part(c, shape, args, col, outline = true) {
  c.beginPath(); P[shape](c, ...args);
  if (SHADOW) { c.fill(); return; }
  c.fillStyle = col; c.fill();
  if (outline) { c.lineWidth = 1.2; c.strokeStyle = OUT; c.stroke(); }
}
function hazard(c, x, y, w, h) {
  if (SHADOW) return part(c, 'rr', [x, y, w, h, 1], '#000');
  c.save(); c.beginPath(); c.rect(x - w / 2, y - h / 2, w, h); c.clip();
  c.fillStyle = '#2c2b27'; c.fillRect(x - w / 2, y - h / 2, w, h); c.fillStyle = HAZ;
  for (let i = -w; i < w; i += 5) { c.beginPath(); c.moveTo(x - w / 2 + i, y + h / 2); c.lineTo(x - w / 2 + i + 2.5, y + h / 2); c.lineTo(x - w / 2 + i + 2.5 + h, y - h / 2); c.lineTo(x - w / 2 + i + h, y - h / 2); c.fill(); }
  c.restore(); c.strokeStyle = OUT; c.lineWidth = 0.8; c.strokeRect(x - w / 2, y - h / 2, w, h);
}

// ---------- mechs: legs (body heading) + top (aim) ----------
function feet(c, T, lx, fw, fl, st) {
  for (const [s, o] of [[-1, st], [1, -st]]) { part(c, 'rr', [s * lx, o, fw, fl, 1.5], T.dark); part(c, 'rr', [s * lx, o - fl / 2 + 1, fw * 0.8, 1.8, 0.6], T.metal, false); }
}
const LEGS = {
  scout: (c, T, st) => feet(c, T, 7, 6, 11, st),
  gunner: (c, T, st) => feet(c, T, 9, 8, 13, st),
  brawler: (c, T, st) => feet(c, T, 13, 12, 17, st),
  mortar: (c, T, st) => feet(c, T, 11, 9, 13, st),
  aegis: (c, T, st) => feet(c, T, 10, 8, 13, st),
  seeker: (c, T, st) => feet(c, T, 10, 8, 13, st),
  lancer: (c, T, st) => feet(c, T, 9, 7, 13, st),
  breacher: (c, T, st) => { for (const [a, b] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) part(c, 'rr', [a * 22, b * 15 + st * a * b * 0.6, 10, 10, 2], T.dark); },
};
const TOPS = {
  scout(c, T) {
    part(c, 'ch', [0, 1, 17, 15], T.base); part(c, 'ch', [0, 0, 12, 10], T.light);
    part(c, 'rr', [0, -5, 9, 4, 1.5], GLASS); part(c, 'rr', [9.5, -6, 2.6, 16, 1], T.gun); part(c, 'rr', [-5, 4, 3, 5, 0.8], T.acc);
  },
  gunner(c, T) {
    part(c, 'ch', [0, 1, 22, 18], T.base); part(c, 'ch', [0, 2, 16, 11], T.light); part(c, 'rr', [0, -7, 12, 3.5, 1.2], GLASS);
    for (const s of [-1, 1]) { part(c, 'rr', [s * 15, -9, 4, 16, 1], T.gun); part(c, 'ch', [s * 15, 1, 8, 13], T.base); part(c, 'rr', [s * 15, 4, 6, 4, 1], T.acc); }
  },
  brawler(c, T) {
    part(c, 'ch', [0, 1, 32, 24], T.base); part(c, 'ch', [0, 3, 24, 15], T.light); part(c, 'ch', [0, -6, 12, 9], T.base); part(c, 'rr', [0, -10, 8, 2.4, 1], GLASS);
    for (const s of [-1, 1]) { part(c, 'ch', [s * 22, -11, 13, 13], T.dark); part(c, 'ch', [s * 22, 0, 11, 14], T.base); part(c, 'rr', [s * 22, 5, 9, 4, 1], T.acc); }
  },
  mortar(c, T) {
    part(c, 'ch', [0, 2, 26, 22], T.base); part(c, 'ch', [0, 3, 20, 15], T.light);
    for (const s of [-1, 1]) { part(c, 'rr', [s * 16, 3, 6, 17, 1.5], T.metal); part(c, 'rr', [s * 16, 9, 6, 3, 1], T.acc); }
    part(c, 'ci', [0, 1, 7.5], T.dark); part(c, 'ci', [0, -1, 5.5], T.metal); part(c, 'ci', [0, -1.5, 3.4], '#121212', false);
    part(c, 'rr', [0, -11, 12, 3, 1.2], GLASS);
  },
  aegis(c, T) {
    part(c, 'ci', [0, 0, 13], T.base); part(c, 'ci', [0, 0, 10], T.light);
    for (const s of [-1, 1]) part(c, 'rr', [s * 14, 0, 4, 11, 1], T.acc);
    part(c, 'ci', [0, 1, 7], T.metal); part(c, 'ci', [0, 1, 3.6], '#7fe9ff'); part(c, 'rr', [0, -11, 9, 2.6, 1], GLASS);
  },
  seeker(c, T) {
    part(c, 'ch', [0, 1, 20, 18], T.base); part(c, 'rr', [0, -7, 10, 3, 1], GLASS);
    for (const s of [-1, 1]) {
      part(c, 'ch', [s * 15, 0, 11, 20], T.base); part(c, 'rr', [s * 15, 8, 9, 2.5, 1], T.acc);
      for (let a = 0; a < 2; a++) for (let b = 0; b < 3; b++) part(c, 'ci', [s * 15 + (a ? 2.4 : -2.4), -6 + b * 5, 1.6], '#b89a5a', false);
    }
  },
  breacher(c, T) {
    part(c, 'ch', [0, 3, 34, 28], T.base); part(c, 'ch', [0, 5, 26, 18], T.light); part(c, 'ch', [0, -6, 11, 7], T.base); part(c, 'rr', [0, -9, 7, 2, 1], GLASS);
    hazard(c, 0, -17, 46, 6);
    for (let x = -21; x <= 21; x += 6) part(c, 'rr', [x, -22, 3.5, 5, 0.8], T.metal);
    part(c, 'rr', [-11, 12, 4, 8, 1], T.acc); part(c, 'rr', [11, 12, 4, 8, 1], T.acc); part(c, 'rr', [0, 18, 12, 4, 1], T.dark);
  },
  lancer(c, T) {
    part(c, 'ch', [0, 5, 20, 18], T.base); part(c, 'ch', [0, 6, 14, 11], T.light);
    part(c, 'rr', [0, -18, 6, 40, 1.5], T.gun); part(c, 'ch', [0, -2, 11, 13], T.metal);
    for (let y = -34; y < -6; y += 8) part(c, 'rr', [0, y, 7, 2, 0.8], T.glow, false);
    part(c, 'rr', [0, -38, 8, 3, 1], T.metal); part(c, 'rr', [8, 8, 4, 8, 1], T.acc);
  },
};
export function drawMechShape(c, type, team, body, aim, stride, recoil = 0) {
  const T = TEAM[team];
  c.save(); c.rotate(body); LEGS[type](c, T, stride); c.restore();
  c.save(); c.rotate(aim); if (recoil) c.translate(0, recoil * 2.5); TOPS[type](c, T); c.restore();
}

// ---------- turrets, constructor, bases ----------
function padShape(c, type) {
  const s = type === 'howitzer' ? 66 : 56;
  part(c, 'ch', [0, 0, s, s, 5], CONCRETE);
  if (!SHADOW) { c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(-s / 2 + 4, 0); c.lineTo(s / 2 - 4, 0); c.moveTo(0, -s / 2 + 4); c.lineTo(0, s / 2 - 4); c.stroke(); }
  if (type === 'sentry') for (let a = 0; a < 18; a++) {
    const t = (a / 18) * Math.PI * 2; if (Math.abs(t - Math.PI * 1.5) < 0.3) continue;
    c.save(); c.translate(Math.cos(t) * 21, Math.sin(t) * 21); c.rotate(t + Math.PI / 2);
    part(c, 'rr', [0, 0, 8, 5, 2.2], a % 2 ? SAND : '#988c69'); c.restore();
  }
  if (type === 'howitzer') { part(c, 'rr', [0, 24, 54, 7, 2.5], SAND); part(c, 'rr', [-24, 2, 7, 40, 2.5], SAND); part(c, 'rr', [24, 2, 7, 40, 2.5], SAND); }
  if (type === 'arc') for (const [x, y] of [[-20, -20], [20, -20], [-20, 20], [20, 20]]) part(c, 'rr', [x, y, 6, 6, 1], '#77746b');
}
function headShape(c, type, T, recoil = 0) {
  if (recoil) c.translate(0, recoil * 3);
  if (type === 'sentry') {
    for (const s of [-3, 3]) part(c, 'rr', [s, -15, 2.4, 18, 0.8], T.gun);
    part(c, 'ci', [0, 0, 11], T.base); part(c, 'ci', [0, 0, 8], T.light);
    part(c, 'rr', [12, 2, 6, 9, 1], '#5e6040'); part(c, 'rr', [0, -7, 9, 4, 1], T.metal); part(c, 'rr', [-4, 5, 5, 3, 1], T.acc);
  } else if (type === 'howitzer') {
    for (const s of [-1, 1]) part(c, 'rr', [s * 9, 22, 4, 26, 1.2], T.dark);
    part(c, 'rr', [0, -28, 6.5, 44, 1.5], T.gun); part(c, 'rr', [0, -50, 11, 5, 1], T.metal);
    part(c, 'ch', [0, 2, 24, 20], T.base); part(c, 'rr', [0, -8, 30, 5, 1.5], T.base); part(c, 'ch', [0, 4, 16, 12], T.light); part(c, 'rr', [-6, 9, 5, 3, 1], T.acc);
  } else {
    part(c, 'ci', [0, 0, 13], T.base); part(c, 'ci', [0, 0, 10], '#a06a3a'); part(c, 'ci', [0, 0, 7.5], T.metal);
    part(c, 'ci', [0, 0, 5.5], '#a06a3a'); part(c, 'ci', [0, 0, 4], '#9ff4ff'); part(c, 'rr', [9, -9, 4, 3, 1], T.acc);
  }
}
export function drawTurretShape(c, type, team, aim, recoil = 0) {
  padShape(c, type);
  c.save(); c.rotate(aim); headShape(c, type, TEAM[team], recoil); c.restore();
}
function constructorShape(c, building, t) {
  const T = TEAM[0];
  for (const s of [-1, 1]) {
    part(c, 'rr', [s * 18, 0, 11, 44, 2], '#34342f');
    if (!SHADOW) { c.fillStyle = 'rgba(0,0,0,0.35)'; for (let y = -20; y < 22; y += 4) c.fillRect(s * 18 - 5, y, 10, 1.4); }
  }
  part(c, 'ch', [0, 2, 25, 32], '#a08b55'); part(c, 'ch', [-5, -8, 13, 12], '#b19c63'); part(c, 'rr', [-5, -13, 11, 3, 1], GLASS);
  hazard(c, 0, 16, 24, 4);
  c.save(); c.translate(6, 4); c.rotate(building ? Math.sin(t * 3) * 0.15 : -0.05);
  part(c, 'rr', [0, -10, 4.5, 34, 1.2], '#c0a24a'); part(c, 'ci', [0, -28, 2.4], T.gun); c.restore();
  part(c, 'ci', [-10, -4, 1.8], (t * 4) % 2 < 1 ? '#ffa040' : '#7a5020', false); part(c, 'rr', [8, 12, 4, 6, 1], T.acc);
}
// base in local coords: x 0..600, y = distance in front of the base face (negative = inside)
function baseShape(c, team, dead) {
  const T = TEAM[team];
  const conc = dead ? '#5d5a52' : '#85837a';
  part(c, 'rr', [300, -45, 600, 110, 0], conc, false);
  if (!SHADOW) { c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 0.6; for (let x = 0; x < 600; x += 20) { c.beginPath(); c.moveTo(x, -100); c.lineTo(x, 0); c.stroke(); } }
  if (dead) { // rubble
    const r = rng(team + 9);
    for (let i = 0; i < 60; i++) part(c, 'rr', [r() * 600, -r() * 100, 4 + r() * 16, 4 + r() * 12, 1], i % 3 ? '#4a4741' : '#2e2b28');
    return;
  }
  for (const hx of [60, 540]) {
    part(c, 'rr', [hx, -60, 84, 54, 3], '#6b6c4d');
    if (!SHADOW) { c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 0.8; for (let y = -84; y < -34; y += 6) { c.beginPath(); c.moveTo(hx - 42, y); c.lineTo(hx + 42, y); c.stroke(); } }
    part(c, 'rr', [hx, -32, 50, 4, 0.5], '#3a3c3a', false);
  }
  part(c, 'ch', [300, -58, 120, 56, 4], '#9a978b'); part(c, 'rr', [300, -58, 110, 46, 1], '#7f7d74');
  part(c, 'rr', [255, -66, 12, 10, 1], '#6a6c6a'); part(c, 'rr', [275, -66, 12, 10, 1], '#6a6c6a');
  part(c, 'rr', [325, -42, 36, 6, 1], T.acc); part(c, 'ci', [300, -60, 12], '#c8c6bc'); part(c, 'ci', [300, -60, 8], '#a8a69c'); part(c, 'ci', [300, -60, 2], '#555');
  for (const [x, y] of [[178, -74], [178, -48], [422, -74]]) { part(c, 'ci', [x, y, 11], '#b1aea1'); part(c, 'ci', [x, y, 7], '#c5c2b5'); }
  for (const [x, y] of [[210, -22], [222, -24], [380, -22], [394, -24], [130, -88]]) part(c, 'rr', [x, y, 10, 8, 1], '#5e6040');
  for (const tx of [120, 480]) {
    part(c, 'ch', [tx, -22, 40, 38, 4], '#908e84'); part(c, 'ch', [tx, -22, 32, 30, 3], '#6f6d66');
    for (const s of [-4, 4]) part(c, 'rr', [tx + s, 4, 3, 28, 1], T.gun);
    part(c, 'ch', [tx, -18, 22, 20, 3], T.base); part(c, 'rr', [tx, -12, 16, 3, 1], T.acc);
  }
  part(c, 'rr', [300, -6, 600, 12, 0], '#8f8d84', false);
  if (!SHADOW) { c.fillStyle = 'rgba(0,0,0,0.18)'; for (let x = 0; x < 600; x += 9) c.fillRect(x, -12, 4, 3); }
  for (let l = 0; l < LANES; l++) {
    const g = laneX(l);
    part(c, 'rr', [g, -6, 34, 12, 0.5], '#3d4042', false);
    if (!SHADOW) { c.fillStyle = 'rgba(0,0,0,0.3)'; for (let x = -15; x < 16; x += 5) c.fillRect(g + x, -11, 1, 10); }
    part(c, 'rr', [g, -1, 30, 1.6, 0.5], T.glow, false);
    part(c, 'rr', [g - 19, -6, 4, 14, 0.5], '#5f5d57', false); part(c, 'rr', [g + 19, -6, 4, 14, 0.5], '#5f5d57', false);
  }
}

// ---------- renderer ----------
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.camY = 0;
    this.time = 0;
    this.shadowCv = document.createElement('canvas');
    this.ground = null;
    this.groundKey = '';
  }
  resize(w, h, dpr, fieldTop, fieldBottom) {
    Object.assign(this, { w, h, dpr, fieldTop, fieldBottom });
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.shadowCv.width = this.canvas.width; this.shadowCv.height = this.canvas.height;
    this.scale = w / FIELD.w;
    this.viewH = (fieldBottom - fieldTop) / this.scale;
    this.groundKey = '';
    this.clampCam();
  }
  clampCam() { this.camY = Math.max(-20, Math.min(FIELD.h - this.viewH + 20, this.camY)); }
  sx(x) { return x * this.scale; }
  sy(y) { return this.fieldBottom - (y - this.camY) * this.scale; }
  screenToWorld(px, py) { return { x: px / this.scale, y: this.camY + (this.fieldBottom - py) / this.scale }; }

  buildGround(seed) {
    const key = `${seed}:${this.w}:${this.dpr}`;
    if (key === this.groundKey) return;
    this.groundKey = key;
    const k = this.scale * this.dpr;
    const cv = this.ground || document.createElement('canvas');
    cv.width = Math.round(FIELD.w * k); cv.height = Math.round(FIELD.h * k);
    const c = cv.getContext('2d'), r = rng(seed * 7919 + 13);
    c.setTransform(k, 0, 0, -k, 0, FIELD.h * k); // world coords, y up
    c.fillStyle = '#a5966f'; c.fillRect(0, 0, FIELD.w, FIELD.h);
    for (let i = 0; i < 160; i++) {
      const x = r() * FIELD.w, y = r() * FIELD.h, rad = 30 + r() * 70;
      c.fillStyle = i % 3 ? '#9a8c66' : '#8e8f5c'; c.beginPath(); c.ellipse(x, y, rad, rad * 0.7, r() * 3, 0, 7); c.fill();
    }
    // lane tracks
    c.strokeStyle = 'rgba(70,60,40,0.16)'; c.lineWidth = 3; c.setLineDash([12, 8]);
    for (let l = 0; l < LANES; l++) for (const off of [-15, 15]) { c.beginPath(); c.moveTo(laneX(l) + off, 0); c.lineTo(laneX(l) + off, FIELD.h); c.stroke(); }
    c.setLineDash([3, 14]); c.strokeStyle = 'rgba(255,250,230,0.22)'; c.lineWidth = 1.5;
    for (let l = 1; l < LANES; l++) { c.beginPath(); c.moveTo(l * LANE_W, BASE_FACE[0]); c.lineTo(l * LANE_W, BASE_FACE[1]); c.stroke(); }
    c.setLineDash([]);
    // craters
    for (let i = 0; i < 9; i++) {
      const x = 40 + r() * 520, y = 400 + r() * 1600, rad = 18 + r() * 40;
      c.fillStyle = '#b4a580'; c.beginPath(); c.arc(x, y, rad * 1.05, 0, 7); c.fill();
      c.fillStyle = '#6c604a'; c.beginPath(); c.arc(x, y, rad * 0.85, 0, 7); c.fill();
      c.fillStyle = '#5a5040'; c.beginPath(); c.arc(x + rad * 0.12, y - rad * 0.12, rad * 0.55, 0, 7); c.fill();
    }
    // tufts
    for (let i = 0; i < 700; i++) {
      const x = r() * FIELD.w, y = r() * FIELD.h;
      c.fillStyle = i % 2 ? '#7b7c48' : '#8a8a52';
      c.beginPath(); c.moveTo(x - 3.5, y - 1.5); c.lineTo(x - 1, y + 4.5); c.lineTo(x + 0.5, y - 0.5); c.lineTo(x + 2.5, y + 4); c.lineTo(x + 4, y - 1.5); c.closePath(); c.fill();
    }
    // build-cell brackets (both zones)
    for (const team of [0, 1]) {
      c.strokeStyle = team ? 'rgba(255,230,220,0.18)' : 'rgba(255,255,240,0.34)'; c.lineWidth = 1.4;
      for (let row = 0; row < ROWS; row++) for (let l = 0; l < LANES; l++) {
        const x0 = l * LANE_W + 4, x1 = x0 + LANE_W - 8, cy = cellY(team, row), y0 = cy - 46, y1 = cy + 46;
        for (const [cx, cyy, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
          c.beginPath(); c.moveTo(cx + dx * 12, cyy); c.lineTo(cx, cyy); c.lineTo(cx, cyy + dy * 12); c.stroke();
        }
      }
    }
    this.ground = cv;
  }

  // ---- fx → particles + sound
  consume(fx, sfx) {
    for (const f of fx) {
      switch (f.t) {
        case 'shot': this.flash(f.x, f.y, f.kind === 'base' ? 14 : 9); sfx('shot', f); break;
        case 'slug': this.flash(f.x, f.y, 16, '#bff0ff'); sfx('slug', f); break;
        case 'cannon': this.flash(f.x, f.y, 20); this.smoke(f.x, f.y, 3, 10); sfx('cannon', f); break;
        case 'missile': this.flash(f.x, f.y, 10, '#ffd090'); sfx('missile', f); break;
        case 'hit': this.sparks(f.x, f.y, f.kind === 'slug' ? 8 : 3, '#ffd890', 60); break;
        case 'punch': this.sparks(f.x, f.y, 10, '#ffe0a0', 90); this.flash(f.x, f.y, 14); sfx('punch', f); break;
        case 'zap': this.particles.push({ k: 'zap', pts: f.pts, life: 0.18, max: 0.18 }); sfx('zap', f.pts[0]); break;
        case 'boom': this.explosion(f.x, f.y, f.size || 1); sfx(f.size > 1.2 ? 'bigboom' : f.size < 0.7 ? 'smallboom' : 'boom', f); break;
        case 'die':
          this.explosion(f.x, f.y, f.kind === 'turret' ? 1.6 : (f.r || 20) / 20);
          this.debris(f.x, f.y, f.team, f.kind === 'turret' ? 16 : 9);
          this.particles.push({ k: 'scorch', x: f.x, y: f.y, r: (f.r || 20) * 1.2, life: 18, max: 18 });
          sfx(f.kind === 'turret' ? 'bigboom' : 'die', f); break;
        case 'baseDown': for (let i = 0; i < 14; i++) this.explosion(40 + Math.random() * 520, f.y + (f.team ? 1 : -1) * Math.random() * 90, 2 + Math.random(), i * 0.12); sfx('bigboom', f); break;
        case 'baseHit': sfx('alarm'); break;
        case 'deploy': this.ring(f.x, f.y, f.team ? '#ff9a80' : '#8fdcff', 26); if (f.team === 0) sfx('deploy', f); break;
        case 'order': this.ring(f.x, f.y, '#4ea3ff', 40); sfx('click'); break;
        case 'cancel': sfx('click'); break;
        case 'build': this.ring(f.x, f.y, '#8fdcff', 50); this.sparks(f.x, f.y, 14, '#fff0a0', 80); sfx('build', f); break;
        case 'sell': this.debris(f.x, f.y, 0, 8); this.smoke(f.x, f.y, 4, 16); sfx('sell', f); break;
        case 'conOut': sfx('engine', f); break;
        case 'emp': this.particles.push({ k: 'emp', life: 0.9, max: 0.9 }); sfx('emp'); break;
        case 'surge': this.particles.push({ k: 'surge', life: 0.7, max: 0.7 }); sfx('surge'); break;
        case 'jet': this.particles.push({ k: 'jet', x: f.x, y: f.y, life: 1.6, max: 1.6 }); sfx('jet', f); break;
        case 'upgrade': sfx('upgrade'); break;
        case 'mode': if (f.team === 0) sfx('click'); break;
        case 'sidestep': sfx('servo', f); break;
      }
    }
    fx.length = 0;
  }
  flash(x, y, s, col = '#ffe08a') { this.particles.push({ k: 'flash', x, y, s, col, life: 0.07, max: 0.07, rot: Math.random() }); }
  ring(x, y, col, r) { this.particles.push({ k: 'ring', x, y, col, r, life: 0.5, max: 0.5 }); }
  sparks(x, y, n, col, sp) {
    for (let i = 0; i < n; i++) { const a = Math.random() * 7, v = sp * (0.4 + Math.random()); this.particles.push({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, col, life: 0.25 + Math.random() * 0.2, max: 0.45 }); }
  }
  smoke(x, y, n, s) {
    for (let i = 0; i < n; i++) this.particles.push({ k: 'smoke', x: x + (Math.random() - 0.5) * s, y: y + (Math.random() - 0.5) * s, vx: 6 + Math.random() * 8, vy: 4 + Math.random() * 6, s: s * (0.6 + Math.random() * 0.6), life: 1 + Math.random(), max: 2 });
  }
  debris(x, y, team, n) {
    const col = TEAM[team].dark;
    for (let i = 0; i < n; i++) { const a = Math.random() * 7, v = 40 + Math.random() * 110; this.particles.push({ k: 'debris', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, col: i % 3 ? col : '#2e2a26', s: 2 + Math.random() * 4, rot: Math.random() * 6, life: 0.6 + Math.random() * 0.4, max: 1 }); }
  }
  explosion(x, y, s, delay = 0) {
    this.particles.push({ k: 'boom', x, y, s, life: 0.45 + delay, max: 0.45, delay });
    this.smoke(x, y, Math.round(3 + s * 3), 18 * s);
    this.sparks(x, y, Math.round(4 + s * 4), '#ffb050', 120 * Math.min(1.5, s));
  }
  updateParticles(dt) {
    this.time += dt;
    for (const p of this.particles) {
      p.life -= dt;
      if (p.vx !== undefined) { p.x += p.vx * dt; p.y += p.vy * dt; if (p.k !== 'smoke') { p.vx *= 1 - 3 * dt; p.vy *= 1 - 3 * dt; } }
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.particles.length > 900) this.particles.splice(0, this.particles.length - 900);
  }

  // ---- frame
  draw(w, dt, ui) {
    this.updateParticles(dt);
    const c = this.ctx, d = this.dpr, s = this.scale;
    this.buildGround(w.stage.index + 1);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#1a1c16'; c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    // ground slice
    const k = s * d, srcY = (FIELD.h - this.camY) * k - this.fieldBottom * d;
    c.drawImage(this.ground, 0, srcY, this.ground.width, this.canvas.height, 0, 0, this.ground.width, this.canvas.height);
    c.setTransform(d, 0, 0, d, 0, 0);
    // scorch marks
    for (const p of this.particles) if (p.k === 'scorch') {
      c.fillStyle = `rgba(40,34,28,${0.35 * Math.min(1, p.life / 4)})`; c.beginPath(); c.arc(this.sx(p.x), this.sy(p.y), p.r * s, 0, 7); c.fill();
    }
    this.drawOverlays(c, w, ui);

    const ents = w.entities.filter((e) => !e.dead || e.kind === 'base');
    // shadows: all silhouettes on one layer
    const sc = this.shadowCv.getContext('2d');
    sc.setTransform(1, 0, 0, 1, 0, 0); sc.clearRect(0, 0, this.shadowCv.width, this.shadowCv.height);
    sc.setTransform(d, 0, 0, d, 0, 0); sc.fillStyle = '#000'; SHADOW = true;
    for (const e of ents) this.drawEntity(sc, e, w, 5 * s, 5 * s);
    SHADOW = false;
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 0.28; c.drawImage(this.shadowCv, 0, 0); c.restore();
    // bodies: structures first, then mechs north-to-south
    const order = (e) => (e.kind === 'base' ? 0 : e.kind === 'turret' ? 1 : 2);
    ents.sort((a, b) => order(a) - order(b) || b.y - a.y);
    for (const e of ents) this.drawEntity(c, e, w, 0, 0);
    this.drawProjectiles(c, w);
    this.drawParticles(c);
    this.drawBars(c, ents);
    this.drawScreenFx(c, w);
  }

  drawEntity(c, e, w, ox, oy) {
    const s = this.scale, x = this.sx(e.x) + ox, y = this.sy(e.y) + oy;
    if (e.kind === 'base') {
      const dir = e.team === 0 ? 1 : -1;
      c.save(); c.translate(ox, this.sy(e.y) + oy); c.scale(s, -s * dir); baseShape(c, e.team, e.dead); c.restore();
      return;
    }
    if (y < this.fieldTop - 80 || y > this.h + 80) return;
    c.save(); c.translate(x, y);
    if (e.kind === 'mech') {
      c.scale(s * VIS_MECH, s * VIS_MECH);
      const st = e.moving ? Math.sin(e.phase) * 4 : 0;
      drawMechShape(c, e.type, e.team, e.body, e.aim, st, e.recoil);
    } else if (e.kind === 'turret') {
      c.scale(s * VIS_TURRET, s * VIS_TURRET);
      drawTurretShape(c, e.type, e.team, e.aim, e.recoil);
    } else if (e.kind === 'constructor') {
      c.scale(s * VIS_CON, s * VIS_CON); c.rotate(e.body);
      constructorShape(c, e.building, this.time);
    }
    if (!SHADOW && e.hurt > 0) { c.globalAlpha = e.hurt * 3; c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, e.radius * 0.8, 0, 7); c.fill(); }
    c.restore();
    if (!SHADOW && e.stun > 0 && Math.floor(this.time * 12) % 2) {
      c.strokeStyle = '#9ff4ff'; c.lineWidth = 1.5; c.beginPath();
      for (let i = 0; i < 5; i++) { const a = Math.random() * 7, r = e.radius * s; c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); c.lineTo(x + Math.cos(a + 0.4) * r * 1.3, y + Math.sin(a + 0.4) * r * 1.3); }
      c.stroke();
    }
  }

  drawOverlays(c, w, ui) {
    const s = this.scale;
    // active lane
    const lx = this.sx(w.activeLane * LANE_W), y0 = this.sy(BASE_FACE[0] + 150), y1 = this.sy(BASE_FACE[0]);
    const g = c.createLinearGradient(0, y1, 0, y0); g.addColorStop(0, 'rgba(78,163,255,0.28)'); g.addColorStop(1, 'rgba(78,163,255,0)');
    c.fillStyle = g; c.fillRect(lx + 2, y0, LANE_W * s - 4, y1 - y0);
    c.strokeStyle = '#8fdcff'; c.lineWidth = 2.5;
    const cx = this.sx(laneX(w.activeLane)), bob = (this.time * 40) % 35;
    for (let i = 0; i < 3; i++) { const yy = this.sy(BASE_FACE[0] + 30 + i * 35 + bob); c.globalAlpha = 1 - (i * 35 + bob) / 120; c.beginPath(); c.moveTo(cx - 9, yy + 6); c.lineTo(cx, yy); c.lineTo(cx + 9, yy + 6); c.stroke(); }
    c.globalAlpha = 1;
    // free cells while placing
    if (ui.placing) {
      for (let l = 0; l < LANES; l++) for (let r = 0; r < ROWS; r++) {
        if (w.cells[0][l][r] || w.orderAt(l, r)) continue;
        c.fillStyle = 'rgba(127,255,170,0.10)'; c.strokeStyle = 'rgba(127,255,170,0.45)'; c.lineWidth = 1;
        const x = this.sx(l * LANE_W + 6), y = this.sy(cellY(0, r) + 44);
        c.fillRect(x, y, (LANE_W - 12) * s, 88 * s); c.strokeRect(x, y, (LANE_W - 12) * s, 88 * s);
      }
    }
    // planned cells with a ghost and build progress
    c.setLineDash([6, 5]); c.lineWidth = 2;
    for (const o of w.orders) {
      const x = this.sx(o.lane * LANE_W + 6), y = this.sy(cellY(0, o.row) + 46), wd = (LANE_W - 12) * s, ht = 92 * s;
      c.fillStyle = 'rgba(78,163,255,0.10)'; c.fillRect(x, y, wd, ht); c.strokeStyle = '#4ea3ff'; c.strokeRect(x, y, wd, ht);
      c.save(); c.setLineDash([]); c.globalAlpha = 0.3 + 0.4 * o.progress;
      c.translate(this.sx(laneX(o.lane)), this.sy(cellY(0, o.row))); c.scale(s * VIS_TURRET, s * VIS_TURRET); drawTurretShape(c, o.type, 0, 0); c.restore();
      if (o.progress > 0) { c.save(); c.setLineDash([]); c.fillStyle = '#101010'; c.fillRect(x + 8, y + ht - 10, wd - 16, 5); c.fillStyle = '#8fdcff'; c.fillRect(x + 9, y + ht - 9, (wd - 18) * o.progress, 3); c.restore(); }
    }
    c.setLineDash([]);
    // pending bombs: shrinking target marks
    for (const b of w.bombs) {
      const r = (6 + b.t * 30) * s;
      c.strokeStyle = 'rgba(255,90,60,0.8)'; c.lineWidth = 1.5; c.beginPath(); c.arc(this.sx(b.x), this.sy(b.y), r, 0, 7); c.stroke();
    }
    // bombing targeting reticle
    if (ui.targeting && ui.aim) {
      const x = this.sx(ui.aim.x), y = this.sy(ui.aim.y), r = 110 * s;
      c.strokeStyle = 'rgba(255,90,60,0.9)'; c.lineWidth = 2; c.setLineDash([8, 6]); c.beginPath(); c.arc(x, y, r, 0, 7); c.stroke(); c.setLineDash([]);
      c.beginPath(); c.moveTo(x - 12, y); c.lineTo(x + 12, y); c.moveTo(x, y - 12); c.lineTo(x, y + 12); c.stroke();
    }
    // aegis fields
    for (const e of w.entities) if (e.type === 'aegis' && !e.dead && e.stun <= 0) {
      c.strokeStyle = e.team ? 'rgba(255,140,120,0.5)' : 'rgba(127,233,255,0.6)'; c.lineWidth = 1.5; c.setLineDash([10, 8]); c.lineDashOffset = -this.time * 20;
      c.beginPath(); c.arc(this.sx(e.x), this.sy(e.y), e.def.aura * s, 0, 7); c.stroke(); c.setLineDash([]);
    }
    // selected turret
    if (ui.selected) {
      const t = ui.selected;
      if (!t.dead) { c.strokeStyle = '#ffe08a'; c.lineWidth = 2; c.beginPath(); c.arc(this.sx(t.x), this.sy(t.y), t.radius * s * 1.5, 0, 7); c.stroke();
        c.strokeStyle = 'rgba(255,224,138,0.35)'; c.setLineDash([6, 6]); c.beginPath(); c.arc(this.sx(t.x), this.sy(t.y), t.def.range * s, 0, 7); c.stroke(); c.setLineDash([]); }
    }
  }

  drawProjectiles(c, w) {
    const s = this.scale;
    for (const p of w.projectiles) {
      const x = this.sx(p.x), y = this.sy(p.y);
      if (p.kind === 'bullet' || p.kind === 'slug') {
        const px = this.sx(p.px ?? p.x), py = this.sy(p.py ?? p.y), dx = x - px, dy = y - py, m = Math.hypot(dx, dy) || 1;
        const len = (p.kind === 'slug' ? 60 : 14) * s;
        c.strokeStyle = p.kind === 'slug' ? '#bff0ff' : '#ffe08a'; c.lineWidth = p.kind === 'slug' ? 3 : 2; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x - (dx / m) * len, y - (dy / m) * len); c.lineTo(x, y); c.stroke();
      } else if (p.kind === 'shell') {
        c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.arc(x + p.z * s * 0.3, y + p.z * s * 0.2, 3, 0, 7); c.fill();
        c.fillStyle = '#2d2d2a'; c.beginPath(); c.arc(x, y - p.z * s * 0.5, 3.5 + p.z * 0.01, 0, 7); c.fill();
      } else if (p.kind === 'missile') {
        c.strokeStyle = 'rgba(235,232,222,0.55)'; c.lineWidth = 2.5; c.lineCap = 'round'; c.beginPath();
        p.trail.forEach((q, i) => (i ? c.lineTo(this.sx(q.x), this.sy(q.y)) : c.moveTo(this.sx(q.x), this.sy(q.y)))); c.stroke();
        c.save(); c.translate(x, y); c.rotate(p.ang); c.fillStyle = '#ffb040'; c.beginPath(); c.arc(0, 5, 2.5, 0, 7); c.fill();
        c.fillStyle = '#e4e0d4'; c.fillRect(-1.5, -4, 3, 8); c.restore();
      }
    }
  }

  drawParticles(c) {
    const s = this.scale;
    for (const p of this.particles) {
      const k = Math.max(0, p.life / p.max);
      if (p.k === 'scorch') continue;
      const x = this.sx(p.x), y = this.sy(p.y);
      if (p.k === 'flash') {
        c.fillStyle = p.col; c.beginPath();
        for (let i = 0; i < 8; i++) { const a = p.rot + (i / 8) * Math.PI * 2, r = (i % 2 ? 0.35 : 1) * p.s * s * (0.6 + k * 0.6); c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
        c.fill();
      } else if (p.k === 'spark') {
        c.strokeStyle = p.col; c.globalAlpha = k; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y); c.lineTo(x - p.vx * 0.03 * s, y + p.vy * 0.03 * s); c.stroke(); c.globalAlpha = 1;
      } else if (p.k === 'smoke') {
        c.fillStyle = `rgba(90,85,78,${0.45 * k})`; c.beginPath(); c.arc(x, y, p.s * s * (1.6 - k * 0.8), 0, 7); c.fill();
      } else if (p.k === 'debris') {
        c.save(); c.translate(x, y); c.rotate(p.rot + p.life * 8); c.fillStyle = p.col; c.globalAlpha = Math.min(1, k * 2); c.fillRect(-p.s, -p.s, p.s * 2, p.s * 2); c.restore();
      } else if (p.k === 'ring') {
        c.strokeStyle = p.col; c.globalAlpha = k; c.lineWidth = 2; c.beginPath(); c.arc(x, y, p.r * s * (1.4 - k * 0.6), 0, 7); c.stroke(); c.globalAlpha = 1;
      } else if (p.k === 'boom') {
        if (p.life > p.max) continue; // delayed
        const r = 30 * p.s * s * (1.2 - k * 0.5);
        for (const [f, col] of [[1, '#e8641e'], [0.68, '#ffa52a'], [0.36, '#ffe27a']]) {
          c.fillStyle = col; c.globalAlpha = Math.min(1, k * 1.6); c.beginPath();
          for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2 + p.s, rr = r * f * (i % 2 ? 0.75 : 1); c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
          c.fill();
        }
        c.globalAlpha = 1;
      } else if (p.k === 'zap') {
        c.strokeStyle = '#9ff4ff'; c.globalAlpha = k; c.lineWidth = 3; c.lineJoin = 'round'; c.beginPath();
        p.pts.forEach((q, i) => {
          if (!i) { c.moveTo(this.sx(q.x), this.sy(q.y)); return; }
          const a = p.pts[i - 1];
          for (let j = 1; j <= 4; j++) { const t = j / 4, jit = j < 4 ? (Math.random() - 0.5) * 16 : 0; c.lineTo(this.sx(a.x + (q.x - a.x) * t) + jit, this.sy(a.y + (q.y - a.y) * t) + jit * 0.5); }
        });
        c.stroke(); c.strokeStyle = '#fff'; c.lineWidth = 1; c.stroke(); c.globalAlpha = 1;
      } else if (p.k === 'jet') {
        const t = 1 - k, jy = this.sy(p.y - 700 + t * 1600), jx = this.sx(p.x);
        c.save(); c.translate(jx + 30, jy + 20); c.fillStyle = 'rgba(0,0,0,0.3)';
        c.beginPath(); c.moveTo(0, -26); c.lineTo(22, 10); c.lineTo(4, 6); c.lineTo(0, 18); c.lineTo(-4, 6); c.lineTo(-22, 10); c.closePath(); c.fill(); c.restore();
      }
    }
  }

  drawBars(c, ents) {
    const s = this.scale;
    for (const e of ents) {
      if (e.dead || e.kind === 'base' || e.hp >= e.maxHp) continue;
      const vis = e.kind === 'mech' ? VIS_MECH : VIS_TURRET;
      const w = Math.max(16, e.radius * s * 1.6), x = this.sx(e.x) - w / 2, y = this.sy(e.y) - e.radius * s * vis - 9;
      c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillRect(x - 1, y - 1, w + 2, 5);
      c.fillStyle = TEAM[e.team].hp; c.fillRect(x, y, w * (e.hp / e.maxHp), 3);
    }
  }

  drawScreenFx(c, w) {
    for (const p of this.particles) {
      const k = p.life / p.max;
      if (p.k === 'emp') { c.fillStyle = `rgba(160,240,255,${0.25 * k})`; c.fillRect(0, 0, this.w, this.h); }
      if (p.k === 'surge') { c.fillStyle = `rgba(255,209,102,${0.18 * k})`; c.fillRect(0, 0, this.w, this.h); }
    }
    if (w.result) { c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(0, 0, this.w, this.h); }
  }

  // Minimap (B + D mix chosen by the user): narrow strip, dark background, big outlined symbols,
  // mechs as triangles pointing the way they walk, turrets as squares, the Constructor as a diamond.
  drawMinimap(m, w, mw, mh) {
    const k = this.dpr || 1; // canvas is in device pixels; sizes below are css px
    const YOU = '#5ab0ff', FOE = '#ff7a4a';
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.fillStyle = '#1c2016'; m.fillRect(0, 0, mw, mh);
    const pad = 4 * k; // keep the big symbols inside the narrow strip
    const sx = (x) => pad + (x / FIELD.w) * (mw - 2 * pad), sy = (y) => mh - (y / FIELD.h) * mh;
    m.fillStyle = 'rgba(255,255,255,0.10)'; for (let l = 1; l < LANES; l++) m.fillRect(Math.round(sx(l * LANE_W)), 0, Math.max(1, k * 0.6), mh);
    m.fillStyle = YOU; m.fillRect(0, sy(BASE_FACE[0]), mw, mh - sy(BASE_FACE[0]));
    m.fillStyle = FOE; m.fillRect(0, 0, mw, sy(BASE_FACE[1]));
    m.lineWidth = k; m.strokeStyle = '#000'; m.lineJoin = 'round';
    for (const e of w.entities) {
      if (e.dead || e.kind === 'base') continue;
      const x = sx(e.x), y = sy(e.y);
      m.beginPath();
      if (e.kind === 'turret') { const r = 3.2 * k; m.rect(x - r, y - r, r * 2, r * 2); }
      else if (e.kind === 'constructor') { const r = 3.8 * k; m.moveTo(x, y - r); m.lineTo(x + r, y); m.lineTo(x, y + r); m.lineTo(x - r, y); m.closePath(); }
      else { const r = 3.6 * k, d = e.team ? 1 : -1; m.moveTo(x, y + d * r * 1.1); m.lineTo(x + r, y - d * r * 0.8); m.lineTo(x - r, y - d * r * 0.8); m.closePath(); }
      m.fillStyle = e.kind === 'constructor' ? '#ffd166' : e.team ? FOE : YOU;
      m.fill(); m.stroke();
    }
    m.strokeStyle = '#e4e0cc'; m.lineWidth = 1.5 * k;
    m.strokeRect(k, sy(this.camY + this.viewH), mw - 2 * k, sy(this.camY) - sy(this.camY + this.viewH));
  }
}

// ---------- icons for HUD cards and panels ----------
export function renderIcon(canvas, kind, type, team = 0) {
  const c = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
  const size = kind === 'turret' ? 70 : kind === 'constructor' ? 56 : ({ brawler: 64, breacher: 70, lancer: 60 }[type] || 52);
  const k = Math.min(w, h) / size;
  c.translate(w / 2, h / 2 + (kind === 'mech' && type === 'lancer' ? 6 * k : 0)); c.scale(k, k);
  for (const pass of [true, false]) {
    SHADOW = pass;
    c.save(); if (pass) { c.translate(3, 3); c.fillStyle = 'rgba(0,0,0,0.3)'; }
    if (kind === 'mech') drawMechShape(c, type, team, 0, 0, 2);
    else if (kind === 'turret') drawTurretShape(c, type, team, 0);
    else constructorShape(c, false, 0);
    c.restore();
  }
  SHADOW = false;
}
