// Renders every sound effect offline (headless Chromium) to WAV files and prints level and
// band energy, so sound changes can be compared without listening in the game.
// Usage: python3 tools/serve.py & node tools/sound.cjs [moduleUrl] [outPrefix]
//   default module /src/audio.js, output tmp_files/sound/new_<name>.wav
const fs = require('fs');
const { chromium } = require('/usr/local/share/npm-global/lib/node_modules/playwright');
const MOD = process.argv[2] || '/src/audio.js', PRE = process.argv[3] || 'tmp_files/sound/new_';
const SOUNDS = [['shot', 'gunner'], ['shot', 'scout'], ['shot', 'base'], ['cannon', 'mortar'], ['cannon', 'howitzer'], ['slug'], ['missile'],
  ['hit'], ['slughit'], ['punch'], ['smallboom'], ['boom'], ['bigboom'], ['die'], ['deploy'], ['build'], ['zap']];
const BANDS = [45, 70, 110, 170, 260, 400, 800, 1600, 3200, 6400];

function wav(l, r, sr) {
  const n = l.length, b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { b.writeInt16LE(Math.max(-1, Math.min(1, l[i])) * 32767 | 0, 44 + i * 4); b.writeInt16LE(Math.max(-1, Math.min(1, r[i])) * 32767 | 0, 46 + i * 4); }
  return b;
}
function goertzel(x, f, sr) {
  const k = 2 * Math.cos(2 * Math.PI * f / sr); let s1 = 0, s2 = 0;
  for (let i = 0; i < x.length; i++) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (x.length - 1)); const s = x[i] * w + k * s1 - s2; s2 = s1; s1 = s; }
  return Math.sqrt(s1 * s1 + s2 * s2 - k * s1 * s2) / x.length;
}
(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  await pg.goto('http://localhost:8767/index.html');
  const res = await pg.evaluate(async ({ MOD, SOUNDS }) => {
    const m = await import(MOD), out = [];
    for (const [name, type] of SOUNDS) {
      const ctx = new OfflineAudioContext(2, 44100 * 2.5, 44100);
      m.initAudio(ctx); m.sfx(name, { type, at: 0.01 });
      const buf = await ctx.startRendering();
      out.push({ name: name + (type ? '_' + type : ''), l: Array.from(buf.getChannelData(0)), r: Array.from(buf.getChannelData(1)) });
    }
    return out;
  }, { MOD, SOUNDS });
  await br.close();
  const db = (v) => (20 * Math.log10(v + 1e-9)).toFixed(0).padStart(4);
  console.log('sound            peak  rms300 | band dB (first 300 ms): ' + BANDS.join(' '));
  for (const s of res) {
    fs.writeFileSync(PRE + s.name + '.wav', wav(s.l, s.r, 44100));
    const seg = s.l.slice(0, 44100 * 0.3);
    const peak = Math.max(...s.l.map(Math.abs)), rms = Math.sqrt(seg.reduce((a, v) => a + v * v, 0) / seg.length);
    console.log(s.name.padEnd(16), db(peak), ' ', db(rms), '  |', BANDS.map((f) => db(goertzel(seg, f, 44100) * 50)).join(' '));
  }
})();
