// Voxel renderer (final art style, sample 7): draws pre-baked sprite sheets from assets/voxel/
// (made by tools/bake_voxel.cjs) in an oblique view. Effects, overlays and bars come from the
// flat renderer, adjusted through its projection hooks (squash, lift).
import { Renderer } from './render.js';
import { FIELD, BASE_FACE } from './data.js';

const TAU = Math.PI * 2;
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('missing ' + src)); i.src = src; });

export class VoxelRenderer extends Renderer {
  constructor(canvas) {
    super(canvas);
    this.ready = false;
  }
  async load(base = 'assets/voxel/') {
    const meta = await (await fetch(base + 'meta.json')).json();
    const files = [...new Set([...Object.values(meta.sheets).map((s) => s.file), ...meta.ground.tiles])];
    const imgs = await Promise.all(files.map((f) => loadImg(base + f)));
    this.img = Object.fromEntries(files.map((f, i) => [f, imgs[i]]));
    this.meta = meta;
    this.squash = meta.A;
    this.ready = true;
  }
  resize(w, h, dpr, top, bottom) {
    if (this.meta) this.squash = this.meta.A;
    super.resize(w, h, dpr, top, bottom);
    this.lift = 15 * this.meta.B * this.scale; // gun height
  }
  buildGround() {}

  // draw frame i of a sheet with its anchor at screen (x, y); f = css px per sprite px
  sprite(c, name, i, x, y) {
    const sh = this.meta.sheets[name]; if (!sh) return;
    const fr = sh.frames[i], f = this.scale / this.meta.UB;
    c.drawImage(this.img[sh.file], fr[0], fr[1], fr[2], fr[3], x + (fr[4] - sh.ax) * f, y + (fr[5] - sh.ay) * f, fr[2] * f, fr[3] * f);
  }
  dirIndex(a, n) { return ((Math.round((a / TAU) * n) % n) + n) % n; }
  strideIndex(e) {
    const st = e.moving ? Math.sin(e.phase) * 4 : 0, S = this.meta.STRIDES;
    let best = 0; for (let k = 1; k < S.length; k++) if (Math.abs(S[k] - st) < Math.abs(S[best] - st)) best = k;
    return best;
  }

  draw(w, dt, ui) {
    if (!this.ready) return;
    this.updateParticles(dt);
    const c = this.ctx, d = this.dpr, s = this.scale, A = this.squash;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#1a1c16'; c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(d, 0, 0, d, 0, 0);
    // ground tiles (600 world units each)
    const th = this.meta.ground.tileH;
    this.meta.ground.tiles.forEach((f, t) => {
      const y1 = this.sy((t + 1) * th), hh = th * this.ys;
      if (y1 > this.h || y1 + hh < 0) return;
      c.drawImage(this.img[f], 0, y1, this.w, hh + 0.5);
    });
    // scorch marks
    for (const p of this.particles) if (p.k === 'scorch') {
      c.fillStyle = `rgba(40,34,28,${0.35 * Math.min(1, p.life / 4)})`; c.beginPath(); this.gArc(c, this.sx(p.x), this.sy(p.y), p.r * s); c.fill();
    }
    this.drawOverlays(c, w, ui);

    const ents = w.entities.filter((e) => (!e.dead || e.kind === 'base') && this.onScreen(e));
    // shadows on one layer, so overlaps don't double up
    const sc = this.shadowCv.getContext('2d');
    sc.setTransform(1, 0, 0, 1, 0, 0); sc.clearRect(0, 0, this.shadowCv.width, this.shadowCv.height);
    sc.setTransform(d, 0, 0, d, 0, 0);
    for (const e of ents) {
      const x = this.sx(e.x), y = this.sy(e.y);
      if (e.kind === 'mech') this.sprite(sc, `mech_${e.type}_shadow`, this.dirIndex(e.body, this.meta.N_HEAD), x, y);
      else if (e.kind === 'turret') this.sprite(sc, `turret_${e.type}_shadow`, 0, x, y);
      else if (e.kind === 'constructor') this.sprite(sc, 'constructor_shadow', this.dirIndex(e.body, this.meta.N_HEAD), x, y);
    }
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 0.3; c.drawImage(this.shadowCv, 0, 0); c.restore();
    // bodies, north to south (bases sort by their front face)
    const key = (e) => (e.kind === 'base' ? BASE_FACE[e.team] : e.y);
    ents.sort((a, b) => key(b) - key(a));
    for (const e of ents) this.drawEntity(c, e, w);
    this.drawProjectiles(c, w);
    this.drawParticles(c);
    this.drawBars(c, ents);
    this.drawScreenFx(c, w);
  }
  onScreen(e) {
    if (e.kind === 'base') return true;
    const y = this.sy(e.y);
    return y > this.fieldTop - 120 && y < this.h + 60;
  }
  drawEntity(c, e) {
    const x = this.sx(e.x), y = this.sy(e.y);
    if (e.kind === 'base') {
      const ly = e.team === 0 ? 0 : BASE_FACE[1];
      if (e.dead) c.filter = 'brightness(0.45) saturate(0.4)';
      this.sprite(c, `base_${e.team}`, 0, this.sx(0), this.sy(ly));
      c.filter = 'none';
      return;
    }
    const parts = [];
    if (e.kind === 'mech') {
      const back = (e.recoil || 0) * 3 * this.scale;
      parts.push([`mech_${e.type}_${e.team}_legs`, this.dirIndex(e.body, this.meta.N_HEAD) * this.meta.STRIDES.length + this.strideIndex(e), x, y]);
      parts.push([`mech_${e.type}_${e.team}_top`, this.dirIndex(e.aim, this.meta.N_AIM), x - Math.sin(e.aim) * back, y + Math.cos(e.aim) * back * this.squash]);
    } else if (e.kind === 'turret') {
      const back = (e.recoil || 0) * 4 * this.scale;
      parts.push([`turret_${e.type}_pad`, 0, x, y]);
      parts.push([`turret_${e.type}_${e.team}_head`, this.dirIndex(e.aim, this.meta.N_AIM), x - Math.sin(e.aim) * back, y + Math.cos(e.aim) * back * this.squash]);
    } else if (e.kind === 'constructor') {
      parts.push(['constructor', this.dirIndex(e.body, this.meta.N_HEAD), x, y]);
    }
    for (const p of parts) this.sprite(c, ...p);
    if (e.hurt > 0) { // brief white flash on hit
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = Math.min(0.6, e.hurt * 3);
      for (const p of parts) this.sprite(c, ...p);
      c.restore();
    }
    if (e.stun > 0 && Math.floor(this.time * 12) % 2) {
      const r = e.radius * this.scale, cy = y - this.lift;
      c.strokeStyle = '#9ff4ff'; c.lineWidth = 1.5; c.beginPath();
      for (let i = 0; i < 5; i++) { const a = Math.random() * 7; c.moveTo(x + Math.cos(a) * r, cy + Math.sin(a) * r); c.lineTo(x + Math.cos(a + 0.4) * r * 1.3, cy + Math.sin(a + 0.4) * r * 1.3); }
      c.stroke();
    }
  }
  drawGhost(c, type, x, y) {
    this.sprite(c, `turret_${type}_pad`, 0, x, y);
    this.sprite(c, `turret_${type}_0_head`, 0, x, y);
  }
  drawBars(c, ents) {
    const s = this.scale;
    for (const e of ents) {
      if (e.dead || e.kind === 'base' || e.hp >= e.maxHp) continue;
      const sh = this.meta.sheets[e.kind === 'mech' ? `mech_${e.type}_${e.team}_top` : e.kind === 'turret' ? `turret_${e.type}_pad` : 'constructor'];
      const top = sh ? sh.top : 20;
      const w = Math.max(16, e.radius * s * 1.6), x = this.sx(e.x) - w / 2, y = this.sy(e.y) - top * this.meta.B * s - e.radius * s * this.squash - 6;
      c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillRect(x - 1, y - 1, w + 2, 5);
      c.fillStyle = e.team ? '#ff6a4a' : '#4ea3ff'; c.fillRect(x, y, w * (e.hp / e.maxHp), 3);
    }
  }
}
