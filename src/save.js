// Progress in localStorage. Separate from Ironline.
const KEY = 'iron-defense-save-v1';

export function defaultSave() {
  return {
    cleared: 0,                 // campaign stages cleared
    stars: [],                  // best stars per stage
    endlessBest: 0,             // highest endless stage reached
    loadout: ['scout', 'gunner'],
    quick: {},                  // quick match: { easy|medium|hard: { wins, played } }
    seen: null,                 // enemy mech types fought at least once (enemy intel shows '?' for the rest); null = not set up yet
    settings: { sound: true, speed: 1, graphics: 'voxel', aegis: 'hit', stats: true, name: '', dev: {} },
  };
}

export function loadSave() {
  try {
    const raw = typeof localStorage !== 'undefined' && localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const d = defaultSave(), s = JSON.parse(raw);
    delete s.credits; delete s.tech; delete s.perks; // the Workshop was removed in 0.7.0-dev.1
    return { ...d, ...s, settings: { ...d.settings, ...s.settings } };
  } catch {
    return defaultSave();
  }
}

export function writeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

export const randomHex = (bytes) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');

// Random id for this device, for the battle statistics. Kept apart from the save, so "Reset all progress" keeps it.
const DEVICE_KEY = 'iron-defense-device';
let device = null;
export function deviceId() {
  if (device) return device;
  try { device = localStorage.getItem(DEVICE_KEY); } catch { /* ignore */ }
  if (!/^[0-9a-f]{16}$/.test(device || '')) {
    device = randomHex(8);
    try { localStorage.setItem(DEVICE_KEY, device); } catch { /* ignore */ }
  }
  return device;
}

export function resetSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return defaultSave();
}
