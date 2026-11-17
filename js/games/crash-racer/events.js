// ランダムイベント。apply(game) で効果を出す。fx.* は残り秒数。
export const EVENTS = [
  {
    id: 'MEGA_BOOST', text: 'メガブースト！', color: '#ff5cf0', size: 1.0,
    apply(g) { g.fx.megaBoost = 4; g.boostKick += 0.5; g.addScore(800 * g.mult, true); },
  },
  {
    id: 'ULTRA_SPEED', text: 'ウルトラスピード！', color: '#5ef1ff', size: 1.05,
    apply(g) { g.fx.ultra = 5; g.boostKick += 0.3; },
  },
  {
    id: 'SUPER_CRASH', text: 'スーパークラッシュ！', color: '#ff7a1a', size: 1.0,
    apply(g) { g.fx.superCrash = 8; },
  },
  {
    id: 'SEVENS', text: '777777!', color: '#ffe14d', size: 1.3,
    apply(g) { g.addScore(7777 * (1 + g.stageIndex), true); g.audio.scoreRoll(); g.goldRain(); },
  },
  {
    id: 'COMBO_BREAKER', text: 'コンボ大放出！', color: '#b4ff39', size: 0.95,
    apply(g) { g.addCombo(5); },
  },
  {
    id: 'CHAOS_MODE', text: 'カオスモード！', color: '#ff3b6b', size: 1.1, minStage: 1,
    apply(g) { g.fx.chaos = 6; },
  },
  {
    id: 'DOUBLE_SCORE', text: 'スコア2倍！', color: '#7cff6b', size: 1.0,
    apply(g) { g.fx.double = 8; },
  },
  {
    id: 'INFINITE_ROAD', text: 'どこまでも道！', color: '#9a86ff', size: 0.95,
    apply(g) { g.fx.infinite = 4; },
  },
];

// HUD に出す「今かかっている効果」
export const FX_LABELS = [
  ['star', 'スター 10倍速'],
  ['double', 'スコア2倍'],
  ['superCrash', '衝突スコア3倍'],
  ['megaBoost', 'メガブースト'],
  ['ultra', 'ウルトラスピード'],
  ['chaos', 'カオスモード'],
  ['infinite', '障害物なし・距離3倍'],
];
