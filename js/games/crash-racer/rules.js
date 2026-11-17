// CRASH RACER の数値ルール（DOM を使わないのでテストしやすい）
import { CRASH_RACER as C } from '../../config.js';

/** 速度レベル（衝突回数相当）→ 速度倍率。表の間は直線でつなぐ */
export function multForCrashes(n) {
  const t = C.speedTable;
  const last = t[t.length - 1];
  if (n >= last[0]) return Math.min(C.multMax, last[1] + (n - last[0]) * C.speedPerCrashAfter);
  for (let i = 1; i < t.length; i++) {
    if (n <= t[i][0]) {
      const [a, ma] = t[i - 1];
      const [b, mb] = t[i];
      return ma + (mb - ma) * (n - a) / (b - a);
    }
  }
  return 1;
}

/** 速度倍率 → 実際のスクロール倍率（上限 physCap に近づくだけで超えない） */
export function physMult(m) {
  return 1 + (C.physCap - 1) * (1 - Math.exp(-(Math.max(1, m) - 1) / C.physCurve));
}

/** 表示用の km/h（誇張あり。上限なし） */
export function kmhFor(m) {
  return C.kmhBase * Math.pow(Math.max(1, m), C.kmhExp);
}

/** 速度レベル（speedTable の回数と同じ単位）→ ステージ番号 0〜4 */
export function stageFor(level) {
  let s = 0;
  C.stages.forEach((st, i) => { if (level >= st.crashes) s = i; });
  return s;
}

/** コンボ数 → 速度の掛け算（指数関数。上限なし） */
export function comboSpeedMul(combo) {
  return Math.pow(C.comboSpeed.base, Math.max(0, combo));
}

/** 衝突・コーンで速度レベルを変える。0 未満にはならない */
export function levelAfterCrash(level) { return level + C.speedRamp; }
export function levelAfterCone(level) { return Math.max(0, level - C.cone.slowLevel); }
