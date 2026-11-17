// LocalStorage の読み書き。壊れたデータや足りない項目があっても初期値で起動する。

const clone = (o) => JSON.parse(JSON.stringify(o));

/** localStorage を使えない環境（data: URL・一部のプライベートモード）では例外になるので null を返す */
function defaultStorage() {
  try { return globalThis.localStorage || null; } catch (_) { return null; }
}

/** 初期値の形に合わせて値を補う。型が違う値・NaN は初期値に戻す。知らないキーは残す（将来のゲーム用） */
export function mergeDefaults(def, val) {
  if (def === null || typeof def !== 'object' || Array.isArray(def)) {
    if (typeof val !== typeof def) return def;
    if (typeof val === 'number' && !Number.isFinite(val)) return def;
    return val;
  }
  const src = val && typeof val === 'object' && !Array.isArray(val) ? val : {};
  const out = {};
  for (const k of Object.keys(def)) out[k] = mergeDefaults(def[k], src[k]);
  for (const k of Object.keys(src)) if (!(k in def)) out[k] = src[k];
  return out;
}

export function loadData(key, defaults, storage = defaultStorage()) {
  let raw = null;
  try { raw = storage ? storage.getItem(key) : null; } catch (_) { return clone(defaults); }
  if (!raw) return clone(defaults);
  try {
    return mergeDefaults(defaults, JSON.parse(raw));
  } catch (_) {
    // 読めないデータは消さずに別名で残し、初期値で起動する
    try { storage.setItem(`${key}.broken-${Date.now()}`, raw); } catch (__) { /* 容量不足など */ }
    return clone(defaults);
  }
}

export function saveData(key, data, storage = defaultStorage()) {
  try {
    storage.setItem(key, JSON.stringify(data));
    return true;
  } catch (_) {
    return false; // プライベートモードなど。保存できなくても遊べる
  }
}
