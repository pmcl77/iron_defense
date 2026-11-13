// Vector top-down renderer with two skins over the same shapes:
//   'paint' = detailed, shaded, soft long shadows, textured ground (style 3)
//   'flat'  = solid fills, outlines, short hard shadows (style 4)
import {
  DEV_W, DEV_H, DPR, HUD_BOT, LANE_X, SCENE, CRATERS, byId, heading, aimAngle, rand, hash, fbm,
  groundColor, groundShade, drawHUD,
} from './common.js';

const U = DEV_W / 600;                 // device px per world unit
const BOT = DEV_H - HUD_BOT * DPR;     // screen y of world y = 0
const sx = (x) => x * U, sy = (y) => BOT - y * U;

const TEAM = [
  { base: '#7f7c55', dark: '#4f4e36', light: '#a9a67b', metal: '#4c4f4a', gun: '#2f3235', acc: '#3b8be6', glow: '#8fdcff' },
  { base: '#6f716c', dark: '#454744', light: '#979991', metal: '#45474a', gun: '#2c2e31', acc: '#d0483b', glow: '#ff7a55' },
];
const GLASS = '#22343b', CONCRETE = '#8f8c82', SAND = '#a99c75', HAZ = '#b39a3c';

let SKIN = 'paint', MODE = 'body', ROT = 0;

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}
// ---- primitive shapes (local units, forward = -y) ----
const P = {
  rr(c, x, y, w, h, r = Math.min(w, h) * 0.25) { c.roundRect(x - w / 2, y - h / 2, w, h, r); },
  ch(c, x, y, w, h, k = Math.min(w, h) * 0.28) {
    const l = x - w / 2, t = y - h / 2;
    c.moveTo(l + k, t); c.lineTo(l + w - k, t); c.lineTo(l + w, t + k); c.lineTo(l + w, t + h - k);
    c.lineTo(l + w - k, t + h); c.lineTo(l + k, t + h); c.lineTo(l, t + h - k); c.lineTo(l, t + k); c.closePath();
  },
  ci(c, x, y, r) { c.moveTo(x + r, y); c.arc(x, y, r, 0, Math.PI * 2); },
};
// draw one part; light comes from the north-west in world space
function part(c, shape, args, col, opt = {}) {
  c.beginPath(); P[shape](c, ...args);
  if (MODE === 'shadow') { c.fillStyle = '#000'; c.fill(); return; }
  const [x, y] = args, w = shape === 'ci' ? args[2] * 2 : args[2], h = shape === 'ci' ? args[2] * 2 : args[3];
  if (SKIN === 'flat') {
    c.fillStyle = col; c.fill();
    c.lineWidth = 1.3; c.strokeStyle = '#1e2119'; c.stroke();
    if (opt.hi !== false && w > 5 && h > 5) { c.beginPath(); P[shape](c, x - w * 0.08, y - h * 0.08, w * 0.6, h * 0.6, ...(shape === 'ch' ? [] : [])); c.fillStyle = 'rgba(255,255,255,0.08)'; if (shape !== 'ci') c.fill(); }
    return;
  }
  // light direction (-1,-1) in world, rotated into local space
  const lx = -Math.cos(ROT) - Math.sin(ROT), ly = Math.sin(ROT) - Math.cos(ROT);
  const m = Math.hypot(lx, ly) || 1, r = Math.max(w, h) * 0.6;
  const g = c.createLinearGradient(x + (lx / m) * r, y + (ly / m) * r, x - (lx / m) * r, y - (ly / m) * r);
  const glow = opt.glow;
  g.addColorStop(0, glow ? col : shade(col, 1.28)); g.addColorStop(0.5, col); g.addColorStop(1, glow ? col : shade(col, 0.62));
  c.fillStyle = g; c.fill();
  if (glow) { c.save(); c.shadowColor = col; c.shadowBlur = 12; c.fill(); c.restore(); }
  c.lineWidth = 0.7; c.strokeStyle = 'rgba(10,12,8,0.65)'; c.stroke();
  // bevel highlight on the lit edge
  c.save(); c.clip(); c.beginPath(); P[shape](c, x + (lx / m) * 0.9, y + (ly / m) * 0.9, ...args.slice(2));
  c.lineWidth = 1.2; c.strokeStyle = 'rgba(255,250,225,0.22)'; c.stroke(); c.restore();
  if (opt.panel && w > 10) { c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 0.5; c.beginPath(); c.moveTo(x - w * 0.35, y); c.lineTo(x + w * 0.35, y); c.stroke(); }
  if (opt.rivets && w > 10) { c.fillStyle = 'rgba(20,20,15,0.5)'; for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { c.beginPath(); c.arc(x + a * (w / 2 - 2.2), y + b * (h / 2 - 2.2), 0.7, 0, 7); c.fill(); } }
}
const hz = (c, x, y, w, h) => { // hazard stripes
  if (MODE === 'shadow') return part(c, 'rr', [x, y, w, h, 1], '#000');
  c.save(); c.beginPath(); c.rect(x - w / 2, y - h / 2, w, h); c.clip();
  c.fillStyle = '#2c2b27'; c.fillRect(x - w / 2, y - h / 2, w, h); c.fillStyle = HAZ;
  for (let i = -w; i < w; i += 5) { c.beginPath(); c.moveTo(x - w / 2 + i, y + h / 2); c.lineTo(x - w / 2 + i + 2.5, y + h / 2); c.lineTo(x - w / 2 + i + 2.5 + h, y - h / 2); c.lineTo(x - w / 2 + i + h, y - h / 2); c.fill(); }
  c.restore(); c.strokeStyle = '#1e2119'; c.lineWidth = 0.8; c.strokeRect(x - w / 2, y - h / 2, w, h);
};

// ---- units ----
function feet(c, T, lx, fw, fl, st) {
  for (const [s, o] of [[-1, st], [1, -st]]) { part(c, 'rr', [s * lx, o, fw, fl, 1.5], T.dark, { hi: false }); part(c, 'rr', [s * lx, o - fl / 2 + 1, fw * 0.8, 1.8, 0.6], T.metal, { hi: false }); }
}
const MECH = {
  scout(c, T, st) {
    feet(c, T, 7, 6, 11, st);
    part(c, 'ch', [0, 1, 17, 15], T.base, { rivets: 1 }); part(c, 'ch', [0, 0, 12, 10], T.light);
    part(c, 'rr', [0, -5, 9, 4, 1.5], GLASS); part(c, 'rr', [9.5, -6, 2.6, 16, 1], T.gun);
    part(c, 'rr', [-5, 4, 3, 5, 0.8], T.acc);
  },
  gunner(c, T, st) {
    feet(c, T, 9, 8, 13, st);
    part(c, 'ch', [0, 1, 22, 18], T.base, { rivets: 1, panel: 1 }); part(c, 'ch', [0, 2, 16, 11], T.light);
    part(c, 'rr', [0, -7, 12, 3.5, 1.2], GLASS);
    for (const s of [-1, 1]) { part(c, 'rr', [s * 15, -9, 4, 16, 1], T.gun); part(c, 'ch', [s * 15, 1, 8, 13], T.base); part(c, 'rr', [s * 15, 4, 6, 4, 1], T.acc); }
  },
  brawler(c, T, st) {
    feet(c, T, 13, 12, 17, st);
    part(c, 'ch', [0, 1, 32, 24], T.base, { rivets: 1, panel: 1 }); part(c, 'ch', [0, 3, 24, 15], T.light);
    part(c, 'ch', [0, -6, 12, 9], T.base); part(c, 'rr', [0, -10, 8, 2.4, 1], GLASS);
    for (const s of [-1, 1]) { part(c, 'ch', [s * 22, -11, 13, 13], T.dark, { rivets: 1 }); part(c, 'ch', [s * 22, 0, 11, 14], T.base); part(c, 'rr', [s * 22, 5, 9, 4, 1], T.acc); }
  },
  mortar(c, T, st) {
    feet(c, T, 11, 9, 13, st);
    part(c, 'ch', [0, 2, 26, 22], T.base, { rivets: 1 }); part(c, 'ch', [0, 3, 20, 15], T.light);
    for (const s of [-1, 1]) { part(c, 'rr', [s * 16, 3, 6, 17, 1.5], T.metal); part(c, 'rr', [s * 16, 9, 6, 3, 1], T.acc); }
    part(c, 'ci', [0, 1, 7.5], T.dark); part(c, 'ci', [0, -1, 5.5], T.metal);
    if (MODE !== 'shadow') { c.beginPath(); c.arc(0, -1.5, 3.4, 0, 7); c.fillStyle = '#121212'; c.fill(); }
    part(c, 'rr', [0, -11, 12, 3, 1.2], GLASS);
  },
  aegis(c, T, st) {
    feet(c, T, 10, 8, 13, st);
    part(c, 'ci', [0, 0, 13], T.base); part(c, 'ci', [0, 0, 10], T.light);
    for (const s of [-1, 1]) part(c, 'rr', [s * 14, 0, 4, 11, 1], T.acc);
    part(c, 'ci', [0, 1, 7], T.metal); part(c, 'ci', [0, 1, 3.6], '#7fe9ff', { glow: 1 });
    part(c, 'rr', [0, -11, 9, 2.6, 1], GLASS);
  },
  seeker(c, T, st) {
    feet(c, T, 10, 8, 13, st);
    part(c, 'ch', [0, 1, 20, 18], T.base, { rivets: 1 }); part(c, 'rr', [0, -7, 10, 3, 1], GLASS);
    for (const s of [-1, 1]) {
      part(c, 'ch', [s * 15, 0, 11, 20], T.base, { rivets: 1 }); part(c, 'rr', [s * 15, 8, 9, 2.5, 1], T.acc);
      for (let a = 0; a < 2; a++) for (let b = 0; b < 3; b++) part(c, 'ci', [s * 15 + (a ? 2.4 : -2.4), -6 + b * 5, 1.6], '#b89a5a', { hi: false });
    }
  },
  breacher(c, T, st) {
    for (const [a, b] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) part(c, 'rr', [a * 22, b * 15 + (st ? b : -b) * 2, 10, 10, 2], T.dark, { hi: false });
    part(c, 'ch', [0, 3, 34, 28], T.base, { rivets: 1, panel: 1 }); part(c, 'ch', [0, 5, 26, 18], T.light);
    part(c, 'ch', [0, -6, 11, 7], T.base); part(c, 'rr', [0, -9, 7, 2, 1], GLASS);
    hz(c, 0, -17, 46, 6);
    for (let x = -21; x <= 21; x += 6) part(c, 'rr', [x, -22, 3.5, 5, 0.8], T.metal, { hi: false });
    part(c, 'rr', [-11, 12, 4, 8, 1], T.acc); part(c, 'rr', [11, 12, 4, 8, 1], T.acc);
    part(c, 'rr', [0, 18, 12, 4, 1], T.dark);
  },
  lancer(c, T, st) {
    feet(c, T, 9, 7, 13, st);
    part(c, 'ch', [0, 5, 20, 18], T.base, { rivets: 1 }); part(c, 'ch', [0, 6, 14, 11], T.light);
    part(c, 'rr', [0, -18, 6, 40, 1.5], T.gun); part(c, 'ch', [0, -2, 11, 13], T.metal);
    for (let y = -34; y < -6; y += 8) part(c, 'rr', [0, y, 7, 2, 0.8], T.glow, { glow: 1, hi: false });
    part(c, 'rr', [0, -38, 8, 3, 1], T.metal); part(c, 'rr', [8, 8, 4, 8, 1], T.acc);
  },
};
function constructorV(c) {
  const T = TEAM[0];
  for (const s of [-1, 1]) {
    part(c, 'rr', [s * 18, 0, 11, 44, 2], '#34342f', { hi: false });
    if (MODE !== 'shadow') { c.fillStyle = 'rgba(0,0,0,0.35)'; for (let y = -20; y < 22; y += 4) c.fillRect(s * 18 - 5, y, 10, 1.4); }
  }
  part(c, 'ch', [0, 2, 25, 32], '#a08b55', { rivets: 1, panel: 1 });
  part(c, 'ch', [-5, -8, 13, 12], '#b19c63'); part(c, 'rr', [-5, -13, 11, 3, 1], GLASS);
  hz(c, 0, 16, 24, 4);
  if (MODE !== 'shadow') { c.save(); c.translate(6, 4); c.rotate(-0.05); }
  part(c, 'rr', [0, -10, 4.5, 34, 1.2], '#c0a24a', { hi: false });
  if (MODE !== 'shadow') c.restore();
  part(c, 'ci', [6, -28, 2.4], T.gun); part(c, 'ci', [-10, -4, 1.6], '#ffa040', { glow: 1 }); part(c, 'rr', [8, 12, 4, 6, 1], T.acc);
}
function padV(c, type) {
  const s = type === 'howitzer' ? 66 : 56;
  part(c, 'ch', [0, 0, s, s, 5], CONCRETE, { rivets: 1 });
  if (MODE !== 'shadow') { c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(-s / 2 + 4, 0); c.lineTo(s / 2 - 4, 0); c.moveTo(0, -s / 2 + 4); c.lineTo(0, s / 2 - 4); c.stroke(); }
  if (type === 'sentry') for (let a = 0; a < 18; a++) {
    const t = (a / 18) * Math.PI * 2; if (Math.abs(t - Math.PI * 1.5) < 0.3) continue;
    c.save(); c.translate(Math.cos(t) * 21, Math.sin(t) * 21); c.rotate(t + Math.PI / 2);
    part(c, 'rr', [0, 0, 8, 5, 2.2], a % 2 ? SAND : shade(SAND, 0.9), { hi: false }); c.restore();
  }
  if (type === 'howitzer') { part(c, 'rr', [0, 24, 54, 7, 2.5], SAND); part(c, 'rr', [-24, 2, 7, 40, 2.5], SAND); part(c, 'rr', [24, 2, 7, 40, 2.5], SAND); }
  if (type === 'arc') for (const [x, y] of [[-20, -20], [20, -20], [-20, 20], [20, 20]]) part(c, 'rr', [x, y, 6, 6, 1], '#77746b');
}
function headV(c, type, T) {
  if (type === 'sentry') {
    for (const s of [-3, 3]) part(c, 'rr', [s, -15, 2.4, 18, 0.8], T.gun, { hi: false });
    part(c, 'ci', [0, 0, 11], T.base); part(c, 'ci', [0, 0, 8], T.light);
    part(c, 'rr', [12, 2, 6, 9, 1], '#5e6040'); part(c, 'rr', [0, -7, 9, 4, 1], T.metal); part(c, 'rr', [-4, 5, 5, 3, 1], T.acc);
  } else if (type === 'howitzer') {
    for (const s of [-1, 1]) part(c, 'rr', [s * 9, 22, 4, 26, 1.2], T.dark, { hi: false });
    part(c, 'rr', [0, -28, 6.5, 44, 1.5], T.gun); part(c, 'rr', [0, -50, 11, 5, 1], T.metal);
    part(c, 'ch', [0, 2, 24, 20], T.base, { rivets: 1, panel: 1 }); part(c, 'rr', [0, -8, 30, 5, 1.5], T.base);
    part(c, 'ch', [0, 4, 16, 12], T.light); part(c, 'rr', [-6, 9, 5, 3, 1], T.acc);
  } else {
    part(c, 'ci', [0, 0, 13], T.base); part(c, 'ci', [0, 0, 10], '#a06a3a'); part(c, 'ci', [0, 0, 7.5], T.metal);
    part(c, 'ci', [0, 0, 5.5], '#a06a3a'); part(c, 'ci', [0, 0, 4], '#9ff4ff', { glow: 1 });
    part(c, 'rr', [9, -9, 4, 3, 1], T.acc);
  }
}
function baseV(c) {
  const T = TEAM[0];
  // slab
  part(c, 'rr', [300, -45, 600, 110, 0], '#85837a', { hi: false });
  if (MODE !== 'shadow') { c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 0.6; for (let x = 0; x < 600; x += 20) { c.beginPath(); c.moveTo(x, -100); c.lineTo(x, 0); c.stroke(); } for (let y = -100; y < 0; y += 20) { c.beginPath(); c.moveTo(0, y); c.lineTo(600, y); c.stroke(); } }
  // hangars
  for (const hx of [60, 540]) {
    part(c, 'rr', [hx, -60, 84, 54, 3], '#6b6c4d');
    if (MODE !== 'shadow') {
      const g = c.createLinearGradient(hx - 42, 0, hx + 42, 0); g.addColorStop(0, 'rgba(255,255,230,0.2)'); g.addColorStop(0.45, 'rgba(255,255,230,0)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
      if (SKIN === 'paint') { c.fillStyle = g; c.fillRect(hx - 42, -87, 84, 54); }
      c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 0.8; for (let y = -84; y < -34; y += 6) { c.beginPath(); c.moveTo(hx - 42, y); c.lineTo(hx + 42, y); c.stroke(); }
    }
    part(c, 'rr', [hx, -32, 50, 4, 0.5], '#3a3c3a', { hi: false });
  }
  // command center
  part(c, 'ch', [300, -58, 120, 56, 4], '#9a978b', { rivets: 1 }); part(c, 'rr', [300, -58, 110, 46, 1], '#7f7d74');
  part(c, 'rr', [255, -66, 12, 10, 1], '#6a6c6a'); part(c, 'rr', [275, -66, 12, 10, 1], '#6a6c6a');
  part(c, 'rr', [325, -42, 36, 6, 1], T.acc); part(c, 'ci', [300, -60, 12], '#c8c6bc'); part(c, 'ci', [300, -60, 8], '#a8a69c'); part(c, 'ci', [300, -60, 2], '#555');
  part(c, 'ci', [338, -72, 2], '#ff5040', { glow: 1 });
  // tanks + crates
  for (const [x, y] of [[178, -74], [178, -48], [422, -74]]) { part(c, 'ci', [x, y, 11], '#b1aea1'); part(c, 'ci', [x, y, 7], '#c5c2b5'); }
  for (const [x, y] of [[210, -22], [222, -24], [380, -22], [394, -24], [130, -88]]) part(c, 'rr', [x, y, 10, 8, 1], '#5e6040');
  // towers
  for (const tx of [120, 480]) {
    part(c, 'ch', [tx, -22, 40, 38, 4], '#908e84', { rivets: 1 }); part(c, 'ch', [tx, -22, 32, 30, 3], '#6f6d66');
    for (const s of [-4, 4]) part(c, 'rr', [tx + s, 4, 3, 28, 1], T.gun, { hi: false });
    part(c, 'ch', [tx, -18, 22, 20, 3], T.base); part(c, 'rr', [tx, -12, 16, 3, 1], T.acc);
  }
  // front wall + gates
  part(c, 'rr', [300, -6, 600, 12, 0], '#8f8d84', { hi: false });
  if (MODE !== 'shadow') { c.fillStyle = 'rgba(0,0,0,0.18)'; for (let x = 0; x < 600; x += 9) c.fillRect(x, -12, 4, 3); }
  for (const g of LANE_X) {
    part(c, 'rr', [g, -6, 34, 12, 0.5], '#3d4042', { hi: false });
    if (MODE !== 'shadow') { c.fillStyle = 'rgba(0,0,0,0.3)'; for (let x = -15; x < 16; x += 5) c.fillRect(g + x, -11, 1, 10); }
    part(c, 'rr', [g, -1, 30, 1.6, 0.5], T.glow, { glow: 1, hi: false });
    part(c, 'rr', [g - 19, -6, 4, 14, 0.5], '#5f5d57', { hi: false }); part(c, 'rr', [g + 19, -6, 4, 14, 0.5], '#5f5d57', { hi: false });
  }
}

// ---- object list (world placement) ----
function objects() {
  const o = [];
  // base is drawn in world coords with y up -> flip
  o.push({ x: 0, y: 100, rot: Math.PI / 2, h: 22, draw: baseV, base: true }); // rot only flips the lighting to match the y-flip
  o.push({ x: SCENE.wreck.x, y: SCENE.wreck.y, rot: 0.6, h: 4, draw: (c) => {
    for (let i = 0; i < 14; i++) part(c, 'rr', [(rand(i, 41) - 0.5) * 44, (rand(i, 42) - 0.5) * 44, 3 + rand(i, 43) * 8, 3 + rand(i, 44) * 8, 1], i % 3 ? '#3a3632' : TEAM[1].dark, { hi: false });
    part(c, 'ch', [0, 0, 16, 14], '#2e2a27'); part(c, 'rr', [2, 2, 6, 3, 1], TEAM[1].acc);
  } });
  for (const t of SCENE.turrets) {
    o.push({ x: t.x, y: t.y, rot: 0, h: 3, draw: (c) => padV(c, t.type) });
    o.push({ x: t.x, y: t.y, rot: t.aim ? aimAngle(t, byId[t.aim]) : 0, h: t.type === 'arc' ? 30 : 12, draw: (c) => headV(c, t.type, TEAM[t.team]) });
  }
  const b = SCENE.building;
  o.push({ x: b.x, y: b.y, rot: 0, h: 3, draw: (c) => padV(c, b.type) });
  o.push({ x: b.x, y: b.y, rot: 0, h: 22, draw: (c) => {
    for (const [x, y] of [[-25, -25], [25, -25], [-25, 25], [25, 25]]) part(c, 'rr', [x, y, 2.4, 2.4, 0.5], '#c0a24a', { hi: false });
    part(c, 'rr', [0, -25, 50, 1.6, 0.5], '#c0a24a', { hi: false }); part(c, 'rr', [0, 25, 50, 1.6, 0.5], '#c0a24a', { hi: false });
    part(c, 'ci', [0, 0, 11], TEAM[0].base);
  } });
  o.push({ x: SCENE.constructor.x, y: SCENE.constructor.y, rot: 0, h: 12, draw: constructorV });
  for (const e of SCENE.mechs) o.push({ x: e.x, y: e.y, rot: heading(e), h: { brawler: 18, breacher: 16, mortar: 17 }[e.type] || 13, draw: (c) => MECH[e.type](c, TEAM[e.team], e.stride) });
  return o;
}
function place(c, ob, dx = 0, dy = 0) {
  c.save();
  if (ob.base) { c.translate(dx, BOT - 100 * U + dy); c.scale(U, -U); } // base: local y = distance in front of the base's front face
  else { c.translate(sx(ob.x) + dx, sy(ob.y) + dy); c.scale(U, U); c.rotate(ob.rot); }
  ROT = ob.rot; ob.draw(c); c.restore();
}

// ---- ground ----
function groundPaint(ctx) {
  const img = ctx.createImageData(DEV_W, BOT);
  const d = img.data;
  // evaluate the (expensive) terrain at half resolution, add full-res grain
  const hw = DEV_W / 2, hh = Math.ceil(BOT / 2), half = new Float32Array(hw * hh * 3);
  for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) {
    const wx = (x * 2 + 1) / U, wy = (BOT - y * 2 - 1) / U;
    const [r, g, b] = groundColor(wx, wy), f = groundShade(wx, wy, 1.5);
    const i = (y * hw + x) * 3; half[i] = r * f; half[i + 1] = g * f; half[i + 2] = b * f;
  }
  for (let y = 0; y < BOT; y++) for (let x = 0; x < DEV_W; x++) {
    const hx = Math.min(hw - 1, x >> 1), hy = Math.min(hh - 1, y >> 1), i = (hy * hw + hx) * 3, o = (y * DEV_W + x) * 4;
    const n = 1 + (hash(x, y, 3) - 0.5) * 0.09;
    d[o] = half[i] * n; d[o + 1] = half[i + 1] * n; d[o + 2] = half[i + 2] * n; d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // pebbles and grass strokes with small shadows
  for (let i = 0; i < 900; i++) {
    const wx = rand(i, 11) * 600, wy = 100 + rand(i, 12) * 1000, [, , , gt] = groundColor(wx, wy);
    const x = sx(wx), y = sy(wy);
    if (rand(i, 13) < 0.3 + gt) {
      ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      for (let j = 0; j < 5; j++) {
        const a = -Math.PI / 2 + (rand(i * 7 + j, 14) - 0.5) * 1.6, l = 5 + rand(i * 7 + j, 15) * 7;
        ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.moveTo(x + 2, y + 2); ctx.lineTo(x + 2 + Math.cos(a) * l + 3, y + 2 + Math.sin(a) * l * 0.4 + 5); ctx.stroke();
        ctx.strokeStyle = ['#6f7040', '#8e8a4c', '#5d6236', '#a39a5a'][(i + j) % 4]; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
      }
    } else if (i % 3 === 0) {
      const r = 1.5 + rand(i, 16) * 3;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x + r * 0.7, y + r * 0.6, r, r * 0.8, 0, 0, 7); ctx.fill();
      const g = ctx.createRadialGradient(x - r / 3, y - r / 3, 0, x, y, r); g.addColorStop(0, '#b8b4a6'); g.addColorStop(1, '#6e6a60');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.8, 0, 0, 7); ctx.fill();
    }
  }
}
function groundFlat(ctx) {
  ctx.fillStyle = '#a5966f'; ctx.fillRect(0, 0, DEV_W, BOT);
  for (let i = 0; i < 70; i++) {
    const wx = rand(i, 1) * 600, wy = rand(i, 2) * 1100, r = 30 + rand(i, 3) * 70;
    ctx.fillStyle = i % 3 ? '#9a8c66' : '#8e8f5c'; ctx.beginPath(); ctx.ellipse(sx(wx), sy(wy), r * U, r * U * 0.7, rand(i, 4) * 3, 0, 7); ctx.fill();
  }
  for (const lc of LANE_X) for (const off of [-15, 15]) {
    ctx.strokeStyle = 'rgba(70,60,40,0.18)'; ctx.lineWidth = 5; ctx.setLineDash([18, 10]);
    ctx.beginPath(); ctx.moveTo(sx(lc + off), 0); ctx.lineTo(sx(lc + off), BOT); ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const c of CRATERS) {
    ctx.fillStyle = '#b4a580'; ctx.beginPath(); ctx.arc(sx(c.x), sy(c.y), c.r * U * 1.05, 0, 7); ctx.fill();
    ctx.fillStyle = '#6c604a'; ctx.beginPath(); ctx.arc(sx(c.x), sy(c.y), c.r * U * 0.85, 0, 7); ctx.fill();
    ctx.fillStyle = '#5a5040'; ctx.beginPath(); ctx.arc(sx(c.x + c.r * 0.12), sy(c.y - c.r * 0.12), c.r * U * 0.55, 0, 7); ctx.fill();
  }
  for (let i = 0; i < 260; i++) {
    const x = sx(rand(i, 11) * 600), y = sy(100 + rand(i, 12) * 1000);
    ctx.fillStyle = i % 2 ? '#7b7c48' : '#8a8a52';
    ctx.beginPath(); ctx.moveTo(x - 6, y + 3); ctx.lineTo(x - 2, y - 8); ctx.lineTo(x + 1, y + 1); ctx.lineTo(x + 4, y - 7); ctx.lineTo(x + 7, y + 3); ctx.closePath(); ctx.fill();
  }
}
function overlays(ctx, flat) {
  ctx.save();
  // build cell corners
  ctx.strokeStyle = flat ? 'rgba(255,255,240,0.35)' : 'rgba(232,238,219,0.3)'; ctx.lineWidth = 2;
  for (let row = 0; row < 7; row++) for (let lane = 0; lane < 5; lane++) {
    const x0 = lane * 120 + 4, x1 = x0 + 112, y0 = 220 + row * 100 + 4, y1 = y0 + 92;
    for (const [cx, cy, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
      ctx.beginPath(); ctx.moveTo(sx(cx + dx * 14), sy(cy)); ctx.lineTo(sx(cx), sy(cy)); ctx.lineTo(sx(cx), sy(cy + dy * 14)); ctx.stroke();
    }
  }
  // active lane
  const g = ctx.createLinearGradient(0, sy(100), 0, sy(240)); g.addColorStop(0, 'rgba(78,163,255,0.25)'); g.addColorStop(1, 'rgba(78,163,255,0)');
  ctx.fillStyle = g; ctx.fillRect(sx(242), sy(240), sx(116), sy(100) - sy(240));
  ctx.strokeStyle = '#8fdcff'; ctx.lineWidth = 4;
  for (const wy of [135, 170, 205]) { ctx.beginPath(); ctx.moveTo(sx(286), sy(wy - 8)); ctx.lineTo(sx(300), sy(wy)); ctx.lineTo(sx(314), sy(wy - 8)); ctx.stroke(); }
  // planned cells
  ctx.setLineDash([10, 8]); ctx.strokeStyle = '#4ea3ff'; ctx.lineWidth = 3;
  for (const p of [...SCENE.planned, SCENE.building]) { ctx.strokeRect(sx(p.x - 54), sy(p.y + 46), 108 * U, 92 * U); ctx.fillStyle = 'rgba(78,163,255,0.08)'; ctx.fillRect(sx(p.x - 54), sy(p.y + 46), 108 * U, 92 * U); }
  ctx.setLineDash([]);
  // ghost of the queued howitzer
  const p = SCENE.planned[0]; ctx.globalAlpha = 0.35; MODE = 'body'; place(ctx, { x: p.x, y: p.y, rot: 0, draw: (c) => headV(c, 'howitzer', TEAM[0]) }); ctx.globalAlpha = 1;
  ctx.restore();
}

// ---- effects ----
function effects(ctx, flat) {
  const add = (fn) => { ctx.save(); if (!flat) ctx.globalCompositeOperation = 'lighter'; fn(); ctx.restore(); };
  const fwd = (id, d) => { const e = byId[id]; const a = e.aim ? aimAngle(e, byId[e.aim]) : heading(e); return [e.x + Math.sin(a) * d, e.y + Math.cos(a) * d]; };
  const glowLine = (x0, y0, x1, y1, col, w) => {
    ctx.save(); ctx.lineCap = 'round';
    if (!flat) { ctx.shadowColor = col; ctx.shadowBlur = 14; }
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = '#fff'; ctx.lineWidth = w * 0.4; ctx.stroke(); ctx.restore();
  };
  const blob = (x, y, r, stops) => { if (flat) { ctx.fillStyle = stops[1][1]; ctx.beginPath(); ctx.arc(x, y, r * 0.75, 0, 7); ctx.fill(); return; } const g = ctx.createRadialGradient(x, y, 0, x, y, r); for (const [o, c] of stops) g.addColorStop(o, c); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); };
  for (const f of SCENE.fx) {
    if (f.k === 'aegis') {
      ctx.save(); ctx.fillStyle = 'rgba(127,233,255,0.07)'; ctx.beginPath(); ctx.arc(sx(f.x), sy(f.y), f.r * U, 0, 7); ctx.fill();
      ctx.setLineDash(flat ? [14, 10] : [4, 8]); ctx.strokeStyle = 'rgba(127,233,255,0.75)'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
    }
  }
  for (const f of SCENE.fx) {
    if (f.k === 'tracer') {
      const [a, b] = fwd(f.from, 22), t = byId[f.to];
      const x0 = sx(a), y0 = sy(b), x1 = sx(t.x), y1 = sy(t.y);
      add(() => glowLine(x0 + (x1 - x0) * 0.35, y0 + (y1 - y0) * 0.35, x0 + (x1 - x0) * 0.62, y0 + (y1 - y0) * 0.62, '#ffd36a', 3));
    }
    if (f.k === 'muzzle') {
      const [a, b] = fwd(f.at, f.big ? 52 : 22), x = sx(a), y = sy(b), r = f.big ? 22 : 12;
      if (f.big && !flat) { for (let i = 0; i < 4; i++) blob(x + 10 + i * 9, y - 6 - i * 7, 16 + i * 4, [[0, 'rgba(190,185,170,0.45)'], [1, 'rgba(190,185,170,0)']]); }
      add(() => { blob(x, y, r * 1.6, [[0, 'rgba(255,240,180,1)'], [0.3, 'rgba(255,190,70,0.9)'], [1, 'rgba(255,140,40,0)']]);
        ctx.fillStyle = flat ? '#ffd34d' : '#fff6d0'; ctx.beginPath(); for (let i = 0; i < 8; i++) { const t = (i / 8) * Math.PI * 2, rr = i % 2 ? r * 0.35 : r; ctx.lineTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr); } ctx.fill(); });
    }
    if (f.k === 'sparks') {
      const x = sx(f.x), y = sy(f.y);
      add(() => { blob(x, y, f.big ? 26 : 16, [[0, 'rgba(255,245,200,1)'], [0.4, 'rgba(255,170,60,0.7)'], [1, 'rgba(255,120,30,0)']]);
        ctx.strokeStyle = '#ffd890'; ctx.lineWidth = 2; for (let i = 0; i < 10; i++) { const t = rand(i, 61) * 7, d = 10 + rand(i, 62) * (f.big ? 28 : 18); ctx.beginPath(); ctx.moveTo(x + Math.cos(t) * d * 0.5, y + Math.sin(t) * d * 0.5); ctx.lineTo(x + Math.cos(t) * d, y + Math.sin(t) * d); ctx.stroke(); } });
    }
    if (f.k === 'smoke') {
      for (let i = 6; i >= 0; i--) {
        const x = sx(f.x + i * 9 + rand(i, 81) * 10), y = sy(f.y - i * 5 + 8), r = f.r * U * (0.35 + i * 0.12);
        if (flat) { ctx.fillStyle = i < 2 ? '#4f4a45' : '#77726a'; ctx.globalAlpha = 0.45; ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
        else blob(x, y, r, [[0, `rgba(${i < 2 ? '60,55,50' : '120,115,105'},0.6)`], [1, 'rgba(110,105,95,0)']]);
      }
    }
    if (f.k === 'explosion') {
      const x = sx(f.x), y = sy(f.y), r = f.r * U;
      if (flat) {
        ctx.fillStyle = '#4a433c'; ctx.beginPath(); ctx.arc(x + 8, y + 6, r * 1.1, 0, 7); ctx.fill();
        for (const [k, col] of [[0.95, '#e8641e'], [0.65, '#ffa52a'], [0.35, '#ffe27a']]) { ctx.fillStyle = col; ctx.beginPath(); for (let i = 0; i < 14; i++) { const t = (i / 14) * Math.PI * 2, rr = r * k * (i % 2 ? 0.78 : 1); ctx.lineTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr); } ctx.fill(); }
      } else {
        blob(x + 10, y + 8, r * 1.5, [[0, 'rgba(40,35,30,0.7)'], [0.7, 'rgba(60,55,48,0.4)'], [1, 'rgba(60,55,48,0)']]);
        add(() => { blob(x, y, r * 1.3, [[0, 'rgba(255,255,230,1)'], [0.2, 'rgba(255,220,110,1)'], [0.5, 'rgba(255,130,40,0.85)'], [1, 'rgba(200,60,20,0)']]); });
        for (let i = 0; i < 12; i++) { const t = rand(i, 71) * 7, d = r * (0.9 + rand(i, 72) * 0.8); ctx.fillStyle = i % 3 ? '#2e2a26' : '#ffb050'; ctx.fillRect(x + Math.cos(t) * d, y + Math.sin(t) * d, 4, 4); }
      }
    }
    if (f.k === 'missile') {
      const pts = f.path.map(([x, y]) => [sx(x), sy(y)]);
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = flat ? 'rgba(235,232,222,0.7)' : 'rgba(220,215,205,0.35)'; ctx.lineWidth = flat ? 4 : 7;
      ctx.beginPath(); ctx.moveTo(...pts[0]); for (let i = 1; i < pts.length; i++) ctx.lineTo(...pts[i]); ctx.stroke(); ctx.restore();
      const [a, b] = pts[pts.length - 1], [pa, pb] = pts[pts.length - 2], ang = Math.atan2(b - pb, a - pa);
      ctx.save(); ctx.translate(a, b); ctx.rotate(ang);
      add(() => blob(-9, 0, 12, [[0, 'rgba(255,230,140,1)'], [1, 'rgba(255,120,30,0)']]));
      ctx.fillStyle = '#e4e0d4'; ctx.fillRect(-7, -2.5, 13, 5); ctx.fillStyle = '#b89a5a'; ctx.fillRect(5, -2.5, 3, 5); ctx.restore();
    }
    if (f.k === 'shell') {
      const gx = sx(f.x), gy = sy(f.y), x = gx - 10, y = gy - f.z * U * 0.5;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(gx + 30, gy + 20, 7, 4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#2d2d2a'; ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fill(); ctx.fillStyle = '#8a867a'; ctx.beginPath(); ctx.arc(x - 2, y - 2, 2, 0, 7); ctx.fill();
    }
    if (f.k === 'slug') add(() => glowLine(sx(f.from[0]), sy(f.from[1]), sx(f.to[0]), sy(f.to[1]), '#7fd8ff', 4));
    if (f.k === 'zap') {
      add(() => {
        ctx.save(); ctx.lineJoin = 'round';
        const path = () => { ctx.beginPath(); f.pts.forEach(([x, y], i) => { if (i === 0) ctx.moveTo(sx(x), sy(y)); else { const [px, py] = f.pts[i - 1]; for (let k = 1; k <= 4; k++) { const t = k / 4, j = k < 4 ? (rand(i * 9 + k, 91) - 0.5) * 22 : 0; ctx.lineTo(sx(px + (x - px) * t) + j, sy(py + (y - py) * t) + j * 0.5); } } }); };
        if (!flat) { ctx.shadowColor = '#9ff4ff'; ctx.shadowBlur = 18; }
        path(); ctx.strokeStyle = '#9ff4ff'; ctx.lineWidth = 5; ctx.stroke(); ctx.shadowBlur = 0; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.8; ctx.stroke(); ctx.restore();
      });
    }
    if (f.k === 'weld') {
      const x = sx(f.x), y = sy(f.y);
      add(() => blob(x, y, 24, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(143,220,255,0.8)'], [1, 'rgba(80,160,255,0)']]));
      ctx.fillStyle = '#101010'; ctx.fillRect(x - 40, sy(f.y - 40) - 3, 80, 7); ctx.fillStyle = '#8fdcff'; ctx.fillRect(x - 39, sy(f.y - 40) - 2, 78 * SCENE.building.progress, 5);
    }
  }
  // HP bars
  const RAD = { scout: 16, gunner: 20, brawler: 28, mortar: 24, aegis: 22, seeker: 22, breacher: 30, lancer: 22, sentry: 28, howitzer: 32, arc: 28 };
  for (const [id, hp] of Object.entries(SCENE.hp)) {
    const e = byId[id], r = RAD[e.type] * U, x = sx(e.x), y = sy(e.y) - r - 14, w = r * 1.5;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - w / 2 - 2, y - 2, w + 4, 8);
    ctx.fillStyle = e.team ? '#e3533f' : '#4ea3ff'; ctx.fillRect(x - w / 2, y, w * hp, 4);
  }
}

export function renderVector(canvas, skin, label) {
  SKIN = skin; const flat = skin === 'flat';
  canvas.width = DEV_W; canvas.height = DEV_H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, DEV_W, DEV_H);
  if (flat) groundFlat(ctx); else groundPaint(ctx);
  overlays(ctx, flat);
  const objs = objects();
  // shadows: all silhouettes into one layer so overlaps don't double-darken
  const sh = document.createElement('canvas'); sh.width = DEV_W; sh.height = DEV_H;
  const sc = sh.getContext('2d'); MODE = 'shadow';
  for (const o of objs) { const k = flat ? 0.35 : 0.9; place(sc, o, o.h * k * U, o.h * k * 0.75 * U); }
  if (!flat) for (const o of objs) place(sc, o, o.h * 0.3 * U, o.h * 0.22 * U); // contact shadow
  ctx.save(); ctx.globalAlpha = flat ? 0.28 : 0.42; if (!flat) ctx.filter = 'blur(3px)'; ctx.drawImage(sh, 0, 0); ctx.restore();
  // bodies on their own layer (so grime can be applied only to them)
  const ly = document.createElement('canvas'); ly.width = DEV_W; ly.height = DEV_H;
  const lc = ly.getContext('2d'); MODE = 'body';
  for (const o of objs) place(lc, o);
  if (!flat) { // grime / wear texture on units only
    const n = document.createElement('canvas'); n.width = 256; n.height = 256; const nc = n.getContext('2d'), id = nc.createImageData(256, 256);
    for (let i = 0; i < 256 * 256; i++) { const x = i % 256, y = (i / 256) | 0, v = fbm(x / 9, y / 9, 13, 3) * 255; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
    nc.putImageData(id, 0, 0);
    lc.save(); lc.globalCompositeOperation = 'source-atop'; lc.globalAlpha = 0.16; lc.fillStyle = lc.createPattern(n, 'repeat'); lc.fillRect(0, 0, DEV_W, DEV_H); lc.restore();
  }
  ctx.drawImage(ly, 0, 0);
  effects(ctx, flat);
  if (!flat) { // vignette
    const g = ctx.createRadialGradient(DEV_W / 2, DEV_H * 0.45, DEV_W * 0.4, DEV_W / 2, DEV_H * 0.45, DEV_H * 0.65);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.35)'); ctx.fillStyle = g; ctx.fillRect(0, 0, DEV_W, DEV_H);
  }
  const icon = (c, type, cx, cy, size) => {
    c.save(); c.translate(cx, cy); const k = size / 75; c.scale(k, k);
    ROT = 0; MODE = 'shadow'; c.save(); c.translate(4, 4); c.globalAlpha = 0.35; MECH[type](c, TEAM[0], 1); c.restore();
    MODE = 'body'; MECH[type](c, TEAM[0], 1); c.restore();
  };
  drawHUD(ctx, { icon, label, flat });
}
