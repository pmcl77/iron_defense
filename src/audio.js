// Synthesized sound effects (WebAudio, no asset files).
// Weight comes from shaped noise, not pitched tones: every layer is filtered noise (or an
// oscillator) -> attack/hold/decay envelope -> soft-clip waveshaper. The hold keeps the peak
// for a few ms (the "oomph"), and the clipping adds harmonics so the low end survives on phone
// speakers. Each sound goes through a bus with stereo pan and distance low-pass, then to the
// master, an outdoor reverb and a slapback echo. Master: high-pass, low shelf, compressor
// (slow enough attack to let transients through), limiter.

let ac = null, master = null, revIn = null, echoIn = null, white = null, brown = null, pink = null;
let enabled = true, offline = false;
const last = {}, active = {};
const MIN_GAP = { shot: 0.03, hit: 0.04, slughit: 0.06, cannon: 0.06, boom: 0.05, smallboom: 0.05, bigboom: 0.1, zap: 0.08, punch: 0.06, slug: 0.05, missile: 0.08, die: 0.05, alarm: 1.5, servo: 0.12, deploy: 0.1, engine: 0.5 };
const MAX_VOICES = { shot: 6, hit: 3, slughit: 2, cannon: 3, boom: 4, smallboom: 4, bigboom: 3, die: 4, zap: 2, punch: 3, slug: 2, missile: 3 };

// ctx: optional (Offline)AudioContext, used by tools/sound.cjs to render sounds headless
export function initAudio(ctx) {
  if (ctx) { ac = null; offline = true; }
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!ctx && !AC) return;
  ac = ctx || new AC();
  const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 28; hp.Q.value = 0.7;
  const shelf = ac.createBiquadFilter(); shelf.type = 'lowshelf'; shelf.frequency.value = 120; shelf.gain.value = 3;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 3.5; comp.attack.value = 0.012; comp.release.value = 0.22;
  const limit = ac.createDynamicsCompressor();
  limit.threshold.value = -2; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = 0.002; limit.release.value = 0.1;
  master = ac.createGain(); master.gain.value = 0.6;
  master.connect(hp).connect(shelf).connect(comp).connect(limit).connect(ac.destination);
  // outdoor reverb: early reflections + a diffuse decaying tail
  const conv = ac.createConvolver(), len = Math.floor(ac.sampleRate * 2.2), ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) { const t = i / ac.sampleRate; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.6) * (t < 0.015 ? 0 : 1) * 0.55; }
    for (const [t, g] of [[0.019, 0.5], [0.033, 0.36], [0.052, 0.3], [0.08, 0.22], [0.12, 0.14]]) d[Math.floor((t + ch * 0.004) * ac.sampleRate)] += g;
  }
  conv.buffer = ir;
  const revLp = ac.createBiquadFilter(); revLp.type = 'lowpass'; revLp.frequency.value = 2800;
  revIn = ac.createGain(); revIn.gain.value = 0.3;
  revIn.connect(conv).connect(revLp).connect(master);
  // slapback echo off distant terrain: two taps, darkened, with a little feedback
  echoIn = ac.createGain(); echoIn.gain.value = 0.5;
  const d1 = ac.createDelay(1), d2 = ac.createDelay(1), fb = ac.createGain(), eLp = ac.createBiquadFilter(), eHp = ac.createBiquadFilter();
  d1.delayTime.value = 0.14; d2.delayTime.value = 0.31; fb.gain.value = 0.22;
  eLp.type = 'lowpass'; eLp.frequency.value = 1600; eHp.type = 'highpass'; eHp.frequency.value = 90;
  echoIn.connect(eLp).connect(eHp);
  eHp.connect(d1); eHp.connect(d2);
  const eOut = ac.createGain(); eOut.gain.value = 0.32;
  d1.connect(eOut); d2.connect(fb).connect(d2); d2.connect(eOut);
  eOut.connect(master);
  // noise buffers
  const n = ac.sampleRate * 2;
  white = ac.createBuffer(1, n, ac.sampleRate); brown = ac.createBuffer(1, n, ac.sampleRate); pink = ac.createBuffer(1, n, ac.sampleRate);
  const w = white.getChannelData(0), b = brown.getChannelData(0), p = pink.getChannelData(0);
  let lastB = 0, b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const x = Math.random() * 2 - 1; w[i] = x;
    lastB = (lastB + 0.02 * x) / 1.02; b[i] = lastB * 3.5;
    b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852;
    b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
    p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11; b6 = x * 0.115926;
  }
}
export function setSound(on) { enabled = on; }

// ---------- building blocks ----------
function bus(t, pan = 0, dist = 0, wet = 0.25, gain = 1, echo = 0.3) {
  const g = ac.createGain(); g.gain.value = gain * (1 - dist * 0.7);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 16000 * Math.pow(1 - dist, 2) + 900;
  const p = ac.createStereoPanner ? ac.createStereoPanner() : null;
  g.connect(lp);
  let out = lp;
  if (p) { p.pan.value = pan * 0.8; lp.connect(p); out = p; }
  out.connect(master);
  const send = ac.createGain(); send.gain.value = wet + dist * 0.35; out.connect(send).connect(revIn);
  const es = ac.createGain(); es.gain.value = echo * (0.6 + dist * 0.6); out.connect(es).connect(echoIn);
  return g;
}
function env(param, t, a, peak, d, curve = 'exp') {
  param.setValueAtTime(0.0001, t);
  param.linearRampToValueAtTime(peak, t + a);
  if (curve === 'exp') param.exponentialRampToValueAtTime(0.0001, t + a + d);
  else param.linearRampToValueAtTime(0.0001, t + a + d);
}
const curves = {};
function shaper(k) { // soft clip tanh(kx), normalized
  const key = Math.round(k * 10);
  if (!curves[key]) {
    const c = new Float32Array(1024), nk = Math.tanh(k);
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; c[i] = Math.tanh(k * x) / nk; }
    curves[key] = c;
  }
  const s = ac.createWaveShaper(); s.curve = curves[key]; s.oversample = '2x';
  return s;
}
// One layer: source -> filter (optional sweep) -> attack/hold/decay -> soft clip -> level.
// src: 'white' | 'pink' | 'brown' | an oscillator type. f: [f0, f1] filter (noise) or pitch (osc).
function layer(dest, t, { src = 'pink', type = 'lowpass', f = [1000], fd, q = 0.7, a = 0.002, h = 0, d = 0.1, drive = 0, lvl = 1 }) {
  const end = t + a + h + d;
  let s, filt = null;
  if (src === 'white' || src === 'pink' || src === 'brown') {
    s = ac.createBufferSource(); s.buffer = src === 'white' ? white : src === 'pink' ? pink : brown;
    filt = ac.createBiquadFilter(); filt.type = type; filt.Q.value = q;
    filt.frequency.setValueAtTime(f[0], t);
    if (f[1] && f[1] !== f[0]) filt.frequency.exponentialRampToValueAtTime(f[1], t + a + h + (fd || d));
    s.start(t, Math.random() * 1.6);
  } else {
    s = ac.createOscillator(); s.type = src;
    s.frequency.setValueAtTime(f[0], t);
    if (f[1] && f[1] !== f[0]) s.frequency.exponentialRampToValueAtTime(f[1], t + a + h + (fd || d));
    s.start(t);
  }
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + a);
  if (h) g.gain.setValueAtTime(1, t + a + h);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  const out = ac.createGain(); out.gain.value = lvl;
  (filt ? s.connect(filt) : s).connect(g);
  if (drive > 0) g.connect(shaper(drive)).connect(out); else g.connect(out);
  out.connect(dest);
  s.stop(end + 0.05);
}
function noise(dest, t, dur, type, f0, f1, peak, q = 0.8, buf = white, a = 0.002) {
  const s = ac.createBufferSource(); s.buffer = buf;
  const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ac.createGain(); env(g.gain, t, a, peak, dur);
  s.connect(f).connect(g).connect(dest);
  s.start(t, Math.random() * 1.5); s.stop(t + a + dur + 0.05);
}
function tone(dest, t, type, f0, f1, dur, peak, a = 0.002) {
  const o = ac.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = ac.createGain(); env(g.gain, t, a, peak, dur);
  o.connect(g).connect(dest); o.start(t); o.stop(t + a + dur + 0.05);
}
function metal(dest, t, base, peak, dur, drive = 0) { // inharmonic clank, slightly detuned partials
  let d = dest;
  if (drive) { const sh = shaper(drive), g = ac.createGain(); g.gain.value = 0.7; sh.connect(g).connect(dest); d = sh; }
  for (const [k, p] of [[1, 1], [1.47, 0.6], [2.09, 0.45], [2.76, 0.3], [3.9, 0.2], [5.4, 0.12]]) {
    const f = base * k * (1 + (Math.random() - 0.5) * 0.02);
    tone(d, t, 'sine', f, f * 0.985, dur * (1.2 - k * 0.12), peak * p);
  }
}
// a heavy, unpitched low thump (feet, landings, impacts)
function thud(dest, t, f = 110, lvl = 1, d = 0.15, drive = 3) {
  layer(dest, t, { src: 'brown', type: 'bandpass', f: [f * 1.4, f * 0.8], q: 0.9, a: 0.002, h: 0.012, d, drive, lvl });
  layer(dest, t, { src: 'pink', type: 'lowpass', f: [900, 250], a: 0.001, h: 0.003, d: d * 0.4, drive: 2, lvl: lvl * 0.35 });
}
const vary = (x, v = 0.08) => x * (1 + (Math.random() * 2 - 1) * v);
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------- sounds ----------
// guns: blast lowpass start/end Hz, blast length s, low body level, overall level
const GUN = {
  scout: [5200, 1600, 0.045, 0.25, 0.24], gunner: [3800, 900, 0.075, 0.55, 0.34], sentry: [4200, 1200, 0.06, 0.4, 0.28],
  aegis: [4600, 1400, 0.05, 0.3, 0.22], base: [2600, 500, 0.13, 0.95, 0.5], default: [3800, 1000, 0.065, 0.4, 0.3],
};
export function sfx(name, o = {}) {
  if (!ac || !enabled || (!offline && ac.state !== 'running')) return;
  const t = ac.currentTime + (o.at || 0);
  if (!o.at) {
    if (MIN_GAP[name] && last[name] && t - last[name] < MIN_GAP[name]) return;
    if (MAX_VOICES[name] && (active[name] || 0) >= MAX_VOICES[name]) return;
    last[name] = t;
    active[name] = (active[name] || 0) + 1;
    setTimeout(() => { active[name]--; }, 250);
  }
  const pan = o.pan || 0, dist = o.dist || 0;
  switch (name) {
    case 'shot': {
      const [f0, f1, len, body, lv] = GUN[o.type] || GUN.default, b = bus(t, pan, dist, 0.22, lv, 0.35);
      layer(b, t, { src: 'white', type: 'highpass', f: [vary(2200)], a: 0.0005, h: 0.0015, d: 0.012, lvl: 0.85 }); // supersonic crack
      layer(b, t, { src: 'pink', f: [vary(f0), f1], q: 0.6, a: 0.001, h: 0.006, d: vary(len), drive: 4, lvl: 0.75 }); // muzzle blast
      layer(b, t, { src: 'brown', f: [vary(240, 0.1), 120], q: 0.9, a: 0.002, h: 0.012, d: len * 1.7, drive: 3, lvl: body }); // pressure
      if (o.type === 'base') layer(b, t, { src: 'sine', f: [50, 42], a: 0.003, h: 0.03, d: 0.18, drive: 1.5, lvl: 0.25 });
      break;
    }
    case 'cannon': { // howitzer / mortar launch: deep thoomp
      const mortar = o.type === 'mortar', b = bus(t, pan, dist, 0.35, mortar ? 0.5 : 0.65, 0.45);
      layer(b, t, { src: 'white', type: 'highpass', f: [1800], a: 0.0005, h: 0.002, d: 0.015, lvl: 0.45 });
      layer(b, t, { src: 'pink', f: [vary(mortar ? 1500 : 2200), 260], a: 0.002, h: 0.02, d: 0.3, drive: 5, lvl: 0.8 });
      layer(b, t, { src: 'brown', type: 'bandpass', f: [vary(mortar ? 130 : 105), 80], q: 0.8, a: 0.003, h: 0.03, d: 0.45, drive: 4, lvl: 1.0 });
      layer(b, t, { src: 'sine', f: [vary(48, 0.05), 40], a: 0.004, h: 0.04, d: 0.4, drive: 1.5, lvl: 0.3 });
      if (mortar) layer(b, t, { src: 'pink', type: 'bandpass', f: [vary(380), 330], q: 5, a: 0.001, h: 0.004, d: 0.12, lvl: 0.5 }); // hollow tube "tunk"
      break;
    }
    case 'slug': { // rail gun: snap + descending zing + electric buzz + recoil body
      const b = bus(t, pan, dist, 0.3, 0.55, 0.35);
      noise(b, t, 0.025, 'highpass', 4000, 3000, 1);
      tone(b, t, 'sine', 3200, 180, 0.16, 0.45);
      tone(b, t, 'sawtooth', 120, 90, 0.18, 0.16);
      layer(b, t, { src: 'brown', f: [260, 110], q: 0.9, a: 0.002, h: 0.012, d: 0.16, drive: 3, lvl: 0.8 });
      break;
    }
    case 'hit': { // bullet striking armor: tick + short ping
      const b = bus(t, pan, dist, 0.15, 0.13, 0.1);
      layer(b, t, { src: 'white', type: 'bandpass', f: [vary(3200, 0.2)], q: 5, a: 0.0005, h: 0.001, d: 0.025, lvl: 0.8 });
      tone(b, t, 'sine', vary(1800, 0.2), 1700, 0.05, 0.18);
      layer(b, t, { src: 'pink', f: [1200, 400], a: 0.001, d: 0.03, drive: 2, lvl: 0.35 });
      break;
    }
    case 'slughit': { // rail slug punching armor: heavy clang
      const b = bus(t, pan, dist, 0.25, 0.35, 0.3);
      thud(b, t, 150, 0.8, 0.1, 4);
      metal(b, t, vary(420, 0.12), 0.22, 0.3, 1.5);
      layer(b, t, { src: 'white', type: 'highpass', f: [2500], a: 0.0005, h: 0.002, d: 0.03, lvl: 0.4 });
      break;
    }
    case 'missile': {
      const b = bus(t, pan, dist, 0.3, 0.45);
      noise(b, t, 0.6, 'bandpass', 1800, 700, 0.8, 1.5, white, 0.04);
      noise(b, t, 0.35, 'lowpass', 300, 120, 0.5, 0.7, brown, 0.02);
      break;
    }
    case 'smallboom': case 'boom': case 'bigboom': case 'die': {
      // crack -> blast (clipped, dark sweep) -> chest body -> sub -> rolling rumble -> falling debris
      const big = name === 'bigboom' ? 1.6 : name === 'smallboom' ? 0.55 : 1;
      const b = bus(t, pan, dist, 0.4, 0.6 * Math.min(1.25, 0.6 + big * 0.4), 0.5);
      layer(b, t, { src: 'pink', type: 'highpass', f: [900], a: 0.0005, h: 0.004, d: 0.02 * big, drive: 6, lvl: 0.5 });
      layer(b, t, { src: 'pink', f: [vary(3500), 220], fd: 0.25 * big, q: 0.6, a: 0.002, h: 0.025 * big, d: 0.5 * big, drive: 5, lvl: 0.9 });
      layer(b, t, { src: 'brown', type: 'bandpass', f: [vary(150 / Math.sqrt(big)), 75], q: 0.8, a: 0.003, h: 0.04 * big, d: 0.6 * big, drive: 4, lvl: 1.0 });
      layer(b, t, { src: 'sine', f: [vary(52, 0.06), 36], a: 0.004, h: 0.05 * big, d: 0.7 * big, drive: 1.5, lvl: big > 0.7 ? 0.35 : 0.15 });
      layer(b, t + 0.03, { src: 'brown', f: [170, 70], a: 0.06, h: 0.1 * big, d: 1.4 * big, lvl: 0.55 });
      const db = bus(t, pan, dist, 0.3, 0.35, 0.1);
      for (let i = 0; i < Math.round(6 * big); i++) // dirt and fragments landing
        layer(db, t + rnd(0.12, 0.25 + 0.7 * big), { src: 'pink', type: 'bandpass', f: [rnd(500, 2400)], q: 1.4, a: 0.001, d: rnd(0.02, 0.07), drive: 2, lvl: rnd(0.1, 0.3) });
      if (name === 'die') { // wreck: torn metal and a crunch
        metal(b, t + 0.02, vary(140), 0.2, 0.6, 2.5);
        layer(b, t + 0.05, { src: 'pink', type: 'bandpass', f: [900, 400], q: 1.2, a: 0.004, h: 0.02, d: 0.25, drive: 6, lvl: 0.35 });
        thud(db, t + rnd(0.35, 0.5), 90, 0.9, 0.2);
      }
      break;
    }
    case 'punch': { // Brawler melee: heavy metal-on-metal impact
      const b = bus(t, pan, dist, 0.25, 0.6, 0.35);
      thud(b, t, vary(120), 1.0, 0.2, 5);
      layer(b, t, { src: 'pink', f: [2600, 600], a: 0.001, h: 0.004, d: 0.08, drive: 4, lvl: 0.45 });
      metal(b, t, vary(190), 0.25, 0.4, 2);
      break;
    }
    case 'zap': {
      const b = bus(t, pan, dist, 0.25, 0.4);
      const osc = ac.createOscillator(); osc.type = 'sawtooth';
      for (let i = 0; i < 10; i++) osc.frequency.setValueAtTime(300 + Math.random() * 2500, t + i * 0.015);
      const g = ac.createGain(); env(g.gain, t, 0.002, 0.35, 0.18);
      osc.connect(g).connect(b); osc.start(t); osc.stop(t + 0.22);
      noise(b, t, 0.18, 'bandpass', 5000, 3000, 0.6, 3);
      tone(b, t, 'sine', 60, 50, 0.2, 0.3);
      break;
    }
    case 'deploy': { // hydraulics + pneumatic release + heavy step
      const b = bus(t, pan, dist, 0.2, 0.45);
      const o1 = ac.createOscillator(); o1.type = 'sawtooth'; o1.frequency.setValueAtTime(70, t); o1.frequency.linearRampToValueAtTime(130, t + 0.3);
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
      const g = ac.createGain(); env(g.gain, t, 0.05, 0.25, 0.3, 'lin');
      o1.connect(f).connect(g).connect(b); o1.start(t); o1.stop(t + 0.4);
      noise(b, t + 0.05, 0.28, 'highpass', 5000, 3000, 0.25, 0.7, white, 0.01);
      thud(b, t + 0.32, 95, 1.0, 0.16, 4);
      break;
    }
    case 'servo': {
      const b = bus(t, pan, dist, 0.15, 0.18);
      tone(b, t, 'triangle', 280, 520, 0.22, 0.4, 0.03);
      break;
    }
    case 'build': {
      const b = bus(t, pan, dist, 0.25, 0.5);
      metal(b, t, 210, 0.25, 0.6); thud(b, t, 110, 0.8, 0.14);
      for (let i = 0; i < 5; i++) noise(b, t + 0.08 + i * 0.05, 0.03, 'bandpass', 3500, null, 0.25, 4);
      break;
    }
    case 'sell': {
      const b = bus(t, pan, dist, 0.25, 0.45);
      metal(b, t, 170, 0.2, 0.4); noise(b, t + 0.05, 0.4, 'highpass', 3000, 6000, 0.2);
      break;
    }
    case 'engine': { // diesel start
      const b = bus(t, pan, dist, 0.15, 0.35);
      const o1 = ac.createOscillator(); o1.type = 'sawtooth'; o1.frequency.setValueAtTime(30, t); o1.frequency.linearRampToValueAtTime(52, t + 0.5);
      const am = ac.createOscillator(); am.frequency.value = 14; const amg = ac.createGain(); amg.gain.value = 0.12; am.connect(amg);
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 280;
      const g = ac.createGain(); env(g.gain, t, 0.05, 0.3, 0.8, 'lin'); amg.connect(g.gain);
      o1.connect(f).connect(g).connect(b); o1.start(t); am.start(t); o1.stop(t + 0.9); am.stop(t + 0.9);
      break;
    }
    case 'emp': {
      const b = bus(t, 0, 0, 0.5, 0.6);
      tone(b, t, 'sine', 50, 1800, 0.45, 0.4, 0.01);
      tone(b, t + 0.4, 'sine', 1800, 80, 0.5, 0.3);
      noise(b, t + 0.35, 0.6, 'highpass', 2500, 7000, 0.3);
      tone(b, t + 0.35, 'sine', 70, 30, 0.6, 0.8);
      break;
    }
    case 'surge': {
      const b = bus(t, 0, 0, 0.3, 0.4);
      const o1 = ac.createOscillator(); o1.type = 'sawtooth'; o1.frequency.setValueAtTime(55, t); o1.frequency.exponentialRampToValueAtTime(220, t + 0.6);
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(3000, t + 0.6);
      const g = ac.createGain(); env(g.gain, t, 0.1, 0.35, 0.6, 'lin');
      o1.connect(f).connect(g).connect(b); o1.start(t); o1.stop(t + 0.8);
      break;
    }
    case 'jet': { // fly-by: band sweep + pan sweep + rumble
      const g = ac.createGain(); g.gain.value = 0.5;
      const p = ac.createStereoPanner ? ac.createStereoPanner() : null;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000;
      g.connect(lp); if (p) { p.pan.setValueAtTime(-0.8, t); p.pan.linearRampToValueAtTime(0.8, t + 1.8); lp.connect(p).connect(master); p.connect(revIn); } else lp.connect(master);
      const s = ac.createBufferSource(); s.buffer = white;
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(2400, t + 0.9); bp.frequency.exponentialRampToValueAtTime(500, t + 2);
      const eg = ac.createGain(); eg.gain.setValueAtTime(0.0001, t); eg.gain.exponentialRampToValueAtTime(0.7, t + 0.85); eg.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);
      s.connect(bp).connect(eg).connect(g); s.start(t); s.stop(t + 2.2);
      noise(g, t + 0.4, 1.2, 'lowpass', 200, 80, 0.6, 0.7, brown, 0.4);
      break;
    }
    case 'alarm': {
      const b = bus(t, 0, 0, 0.2, 0.12);
      for (let i = 0; i < 2; i++) { tone(b, t + i * 0.22, 'square', 620, 620, 0.16, 0.5, 0.01); tone(b, t + i * 0.22 + 0.11, 'square', 520, 520, 0.1, 0.5, 0.01); }
      break;
    }
    case 'click': { const b = bus(t, 0, 0, 0.05, 0.15); noise(b, t, 0.012, 'bandpass', 3000, null, 0.7, 2); tone(b, t, 'square', 1400, 1400, 0.012, 0.15); break; }
    case 'upgrade': { const b = bus(t, 0, 0, 0.15, 0.2); tone(b, t, 'square', 880, 880, 0.06, 0.3); tone(b, t + 0.08, 'square', 1320, 1320, 0.09, 0.3); metal(b, t, 400, 0.08, 0.3); break; }
    case 'win': case 'lose': {
      const b = bus(t, 0, 0, 0.4, 0.3);
      const notes = name === 'win' ? [196, 262, 330, 392] : [262, 247, 196, 147];
      notes.forEach((f, i) => {
        const o1 = ac.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = f;
        const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(400, t + i * 0.22); lp.frequency.linearRampToValueAtTime(1800, t + i * 0.22 + 0.15);
        const g = ac.createGain(); env(g.gain, t + i * 0.22, 0.04, 0.3, i === 3 ? 0.9 : 0.3, 'lin');
        o1.connect(lp).connect(g).connect(b); o1.start(t + i * 0.22); o1.stop(t + i * 0.22 + 1.2);
      });
      break;
    }
  }
}
