// Synthesized, more realistic sound effects (WebAudio, no asset files).
// Each sound is built in layers (crack / body / thump / tail) and played through a bus with
// stereo pan, distance low-pass and a generated outdoor reverb, then a compressor + limiter.

let ac = null, master = null, revIn = null, white = null, brown = null;
let enabled = true;
const last = {}, active = {};
const MIN_GAP = { shot: 0.03, hit: 0.05, cannon: 0.06, boom: 0.05, smallboom: 0.05, bigboom: 0.1, zap: 0.08, punch: 0.06, slug: 0.05, missile: 0.08, die: 0.05, alarm: 1.5, servo: 0.12, deploy: 0.1, engine: 0.5 };
const MAX_VOICES = { shot: 6, cannon: 3, boom: 4, smallboom: 4, bigboom: 3, die: 4, zap: 2, punch: 3, slug: 2, missile: 3 };

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.25;
  const limit = ac.createDynamicsCompressor();
  limit.threshold.value = -3; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = 0.001; limit.release.value = 0.1;
  master = ac.createGain(); master.gain.value = 0.7;
  master.connect(comp).connect(limit).connect(ac.destination);
  // outdoor reverb: short early reflections + a diffuse decaying tail
  const conv = ac.createConvolver(), len = Math.floor(ac.sampleRate * 1.8), ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) { const t = i / ac.sampleRate; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (t < 0.012 ? 0 : 1) * 0.6; }
    for (const [t, g] of [[0.017, 0.5], [0.029, 0.35], [0.047, 0.28], [0.071, 0.2]]) d[Math.floor((t + ch * 0.003) * ac.sampleRate)] += g;
  }
  conv.buffer = ir;
  const revLp = ac.createBiquadFilter(); revLp.type = 'lowpass'; revLp.frequency.value = 3200;
  revIn = ac.createGain(); revIn.gain.value = 0.32;
  revIn.connect(conv).connect(revLp).connect(master);
  // noise buffers
  const n = ac.sampleRate * 2;
  white = ac.createBuffer(1, n, ac.sampleRate); brown = ac.createBuffer(1, n, ac.sampleRate);
  const w = white.getChannelData(0), b = brown.getChannelData(0);
  let lastB = 0;
  for (let i = 0; i < n; i++) { w[i] = Math.random() * 2 - 1; lastB = (lastB + 0.02 * w[i]) / 1.02; b[i] = lastB * 3.5; }
}
export function setSound(on) { enabled = on; }

// ---------- building blocks ----------
function bus(t, pan = 0, dist = 0, wet = 0.25, gain = 1) {
  const g = ac.createGain(); g.gain.value = gain * (1 - dist * 0.75);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 16000 * Math.pow(1 - dist, 2) + 900;
  const p = ac.createStereoPanner ? ac.createStereoPanner() : null;
  g.connect(lp);
  let out = lp;
  if (p) { p.pan.value = pan * 0.8; lp.connect(p); out = p; }
  out.connect(master);
  const send = ac.createGain(); send.gain.value = wet + dist * 0.35; out.connect(send).connect(revIn);
  return g;
}
function env(param, t, a, peak, d, curve = 'exp') {
  param.setValueAtTime(0.0001, t);
  param.linearRampToValueAtTime(peak, t + a);
  if (curve === 'exp') param.exponentialRampToValueAtTime(0.0001, t + a + d);
  else param.linearRampToValueAtTime(0.0001, t + a + d);
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
function metal(dest, t, base, peak, dur) { // inharmonic clank
  for (const [k, p] of [[1, 1], [1.47, 0.6], [2.09, 0.45], [2.76, 0.3], [3.9, 0.2]]) tone(dest, t, 'sine', base * k, base * k * 0.98, dur * (1.2 - k * 0.15), peak * p);
}
const vary = (x, v = 0.08) => x * (1 + (Math.random() * 2 - 1) * v);

// ---------- sounds ----------
const GUN = { // crack frequency, body, thump, level
  sentry: [3200, 500, 140, 0.26], gunner: [2500, 380, 110, 0.34], scout: [3600, 600, 170, 0.22], aegis: [3400, 560, 160, 0.2],
  base: [2000, 300, 80, 0.45], default: [2800, 450, 120, 0.3],
};
export function sfx(name, o = {}) {
  if (!ac || !enabled || ac.state !== 'running') return;
  const t = ac.currentTime;
  if (MIN_GAP[name] && last[name] && t - last[name] < MIN_GAP[name]) return;
  if (MAX_VOICES[name] && (active[name] || 0) >= MAX_VOICES[name]) return;
  last[name] = t;
  active[name] = (active[name] || 0) + 1;
  setTimeout(() => { active[name]--; }, 250);
  const pan = o.pan || 0, dist = o.dist || 0;
  switch (name) {
    case 'shot': {
      const [cf, bf, tf, lv] = GUN[o.type] || GUN.default, b = bus(t, pan, dist, 0.22, lv);
      noise(b, t, 0.03, 'highpass', vary(cf), vary(cf) * 0.7, 0.9, 0.7);
      noise(b, t, 0.09, 'bandpass', vary(bf), bf * 0.6, 0.6, 1.2);
      tone(b, t, 'sine', vary(tf), tf * 0.5, 0.07, 0.6);
      break;
    }
    case 'cannon': { // howitzer / mortar launch
      const b = bus(t, pan, dist, 0.35, o.type === 'mortar' ? 0.6 : 0.8);
      noise(b, t, 0.02, 'highpass', 2500, 2000, 0.8);
      noise(b, t, 0.5, 'lowpass', 900, 120, 0.9, 0.7, brown);
      tone(b, t, 'sine', vary(70), 28, 0.4, 1.0);
      if (o.type === 'mortar') tone(b, t, 'triangle', 220, 140, 0.08, 0.3);
      break;
    }
    case 'slug': { // rail gun: snap + descending zing + electric buzz
      const b = bus(t, pan, dist, 0.3, 0.55);
      noise(b, t, 0.025, 'highpass', 4000, 3000, 1);
      tone(b, t, 'sine', 3200, 180, 0.16, 0.5);
      tone(b, t, 'sawtooth', 120, 90, 0.18, 0.18);
      tone(b, t, 'sine', 55, 35, 0.2, 0.7);
      break;
    }
    case 'missile': {
      const b = bus(t, pan, dist, 0.3, 0.45);
      noise(b, t, 0.6, 'bandpass', 1800, 700, 0.8, 1.5, white, 0.04);
      noise(b, t, 0.35, 'lowpass', 300, 120, 0.5, 0.7, brown, 0.02);
      break;
    }
    case 'smallboom': case 'boom': case 'bigboom': case 'die': {
      const big = name === 'bigboom' ? 1.6 : name === 'smallboom' ? 0.55 : 1;
      const b = bus(t, pan, dist, 0.4, 0.75 * Math.min(1.2, big));
      noise(b, t, 0.04 * big, 'highpass', 1800, 900, 0.7);
      noise(b, t, 0.9 * big, 'lowpass', 2200, 90, 1.0, 0.6, brown, 0.004);
      tone(b, t, 'sine', vary(90 / Math.sqrt(big)), 26, 0.7 * big, 1.1);
      for (let i = 0; i < Math.round(4 * big); i++) noise(b, t + 0.08 + Math.random() * 0.5 * big, 0.03, 'bandpass', 2000 + Math.random() * 3000, null, 0.18, 2); // debris
      if (name === 'die') metal(b, t + 0.02, vary(180), 0.15, 0.5);
      break;
    }
    case 'punch': {
      const b = bus(t, pan, dist, 0.25, 0.6);
      noise(b, t, 0.06, 'lowpass', 1400, 300, 1, 0.8, brown);
      tone(b, t, 'sine', 95, 45, 0.15, 0.9);
      metal(b, t, vary(260), 0.22, 0.35);
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
      tone(b, t + 0.32, 'sine', 70, 40, 0.12, 0.6);
      noise(b, t + 0.32, 0.06, 'lowpass', 600, 200, 0.5, 0.7, brown);
      break;
    }
    case 'servo': {
      const b = bus(t, pan, dist, 0.15, 0.18);
      tone(b, t, 'triangle', 280, 520, 0.22, 0.4, 0.03);
      break;
    }
    case 'build': {
      const b = bus(t, pan, dist, 0.25, 0.5);
      metal(b, t, 210, 0.25, 0.6); tone(b, t, 'sine', 80, 45, 0.18, 0.7);
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
