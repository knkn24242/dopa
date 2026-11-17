// 設定と記録。画面からはこの store 経由で読み書きする。
import { STORAGE_KEY, DEFAULT_DATA } from './config.js';
import { loadData, saveData } from './storage.js';

const ENUMS = {
  effectLevel: ['LOW', 'NORMAL', 'HIGH'],
  stimulationLevel: ['CALM', 'NORMAL', 'CHAOS'],
};
const RANGES = {
  soundVolume: [0, 1],
  controlSensitivity: [0.5, 2],
};

export function sanitizeSettings(s) {
  const d = DEFAULT_DATA.settings;
  for (const [k, list] of Object.entries(ENUMS)) if (!list.includes(s[k])) s[k] = d[k];
  for (const [k, [lo, hi]] of Object.entries(RANGES)) {
    const v = Number(s[k]);
    s[k] = Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d[k];
  }
  for (const k of ['soundEnabled', 'sfxOnly', 'vibrationEnabled']) s[k] = !!s[k];
  return s;
}

const data = loadData(STORAGE_KEY, DEFAULT_DATA);
sanitizeSettings(data.settings);

export const store = {
  get settings() { return data.settings; },
  get records() { return data.records; },
  set(key, value) {
    data.settings[key] = value;
    sanitizeSettings(data.settings);
    this.persist();
  },
  record(gameId) {
    const r = data.records[gameId];
    if (!r || typeof r !== 'object') {
      data.records[gameId] = { highScore: 0, highestSpeed: 0, totalCrashes: 0, totalNearMisses: 0, maxCombo: 0, plays: 0 };
    }
    return data.records[gameId];
  },
  resetRecords(gameId) {
    const def = DEFAULT_DATA.records[gameId];
    data.records[gameId] = def ? { ...def } : {};
    this.persist();
  },
  persist() { saveData(STORAGE_KEY, data); },
};
