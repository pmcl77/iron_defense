// Combat lifetime (ISSUES.md 2026-11-18): time from a mech's first encounter (it has a target, or it was hit)
// to its death; mechs alive at the end are counted separately (time until the end, "censored").
// Run: node tools/lifetime.mjs [seeds=10]  plays stage 10 with the balance bot, strip-first off vs on, same seeds.
import { play } from './balance.mjs';

export function lifeTracker() {
  const rec = new Map();
  return {
    step(w) {
      for (const e of w.entities) {
        if (e.kind !== 'mech') continue;
        let r = rec.get(e);
        if (!r) rec.set(e, (r = { team: e.team, type: e.type, contact: null, death: null, strip: false }));
        if (r.contact == null && !e.dead && (e.target || e.hp < e.maxHp)) r.contact = w.time;
        if (e.strip) r.strip = true;
        if (e.dead && r.death == null) r.death = w.time;
      }
      for (const [e, r] of rec) if (e.dead && r.death == null) r.death = w.time; // removed from the list this step
    },
    // { n, contact, died, life (mean contact→death of the dead), alive, aliveLife (mean contact→end of survivors) }
    report(w, team, type, filter = () => true) {
      const rs = [...rec.values()].filter((r) => r.team === team && r.type === type && filter(r));
      const c = rs.filter((r) => r.contact != null), d = c.filter((r) => r.death != null), a = c.filter((r) => r.death == null);
      const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
      return { n: rs.length, contact: c.length, died: d.length, life: mean(d.map((r) => r.death - r.contact)),
        alive: a.length, aliveLife: mean(a.map((r) => w.time - r.contact)) };
    },
  };
}

function main() {
  const seeds = +(process.argv[2] || 10);
  for (const [strat, variant] of [['gunners', 'max'], ['gunners', 'mid'], ['train', 'max']]) {
    console.log(`\nstage 10, bot '${strat}', Workshop ${variant}, ${seeds} seeds`);
    for (const stripFirst of [false, true]) {
      const S = { win: 0, time: 0, n: 0, died: 0, lifeSum: 0, strips: 0, stripN: 0, stripLife: 0, stripDied: 0, laneLife: 0, laneDied: 0, dmg: 0, hw: 0, hwN: 0, eb: 0, pb: 0 };
      for (let seed = 1; seed <= seeds; seed++) {
        const tr = lifeTracker(); let W;
        const r = play(9, seed, variant, strat, (w) => { W = w; tr.step(w); }, { stripFirst, drift: true, returnDelay: true });
        const g = tr.report(W, 0, 'gunner'), gs = tr.report(W, 0, 'gunner', (x) => x.strip), gl = tr.report(W, 0, 'gunner', (x) => !x.strip);
        S.win += r.win; S.time += r.time; S.n += g.n; S.died += g.died; S.lifeSum += g.died * (g.life || 0);
        S.stripN += gs.n; S.stripDied += gs.died; S.stripLife += gs.died * (gs.life || 0); S.laneDied += gl.died; S.laneLife += gl.died * (gl.life || 0);
        S.strips += W.log.strip[0][0]; S.dmg += (W.log.dmg[0].gunner || [0]).reduce((a, b) => a + b, 0);
        const hd = W.log.events.filter((e) => e[1] === 'death' && e[2] === 0 && e[3] === 'howitzer'); // log side 0 = enemy
        S.eb += W.bases[1].hp / W.bases[1].maxHp; S.pb += W.bases[0].hp / W.bases[0].maxHp;
        S.hw += hd.reduce((a, e) => a + e[0], 0); S.hwN += hd.length;
      }
      const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '-');
      console.log(`  strip first ${stripFirst ? 'ON ' : 'OFF'}: wins ${S.win}/${seeds}, avg ${f(S.time / seeds / 60)} min, Gunners ${f(S.n / seeds, 0)}/round, `
        + `combat life ${f(S.lifeSum / S.died)} s (strip users ${f(S.stripLife / S.stripDied)} s, ${f(100 * S.stripN / S.n, 0)}% of Gunners; others ${f(S.laneLife / S.laneDied)} s), `
        + `damage per Gunner ${f(S.dmg / S.n, 0)}, strip entries ${f(S.strips / seeds)}, `
        + `Howitzers down ${S.hwN}/${2 * seeds} (avg ${f(S.hw / S.hwN / 60)} min), base HP left ours ${f(100 * S.pb / seeds, 0)}% / enemy ${f(100 * S.eb / seeds, 0)}%`);
    }
  }
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) main();
