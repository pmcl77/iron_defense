// Progress in localStorage. Separate from Ironline.
const KEY = 'iron-defense-save-v1';

export function defaultSave() {
  return {
    cleared: 0,                 // campaign stages cleared
    stars: [],                  // best stars per stage
    endlessBest: 0,             // highest endless stage reached
    credits: 0,
    tech: {},                   // Workshop starting level per unit type (incl. 'builder' = Constructor)
    perks: { energy: 0, armor: 0, charge: 0, regen: 0 },
    loadout: ['scout', 'gunner'],
    settings: { sound: true, speed: 1 },
  };
}

export function loadSave() {
  try {
    const raw = typeof localStorage !== 'undefined' && localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const d = defaultSave(), s = JSON.parse(raw);
    return { ...d, ...s, perks: { ...d.perks, ...s.perks }, settings: { ...d.settings, ...s.settings } };
  } catch {
    return defaultSave();
  }
}

export function writeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

export function resetSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return defaultSave();
}
