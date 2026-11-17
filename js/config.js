// DOPA! の調整値はできるだけここに集める。
// 遊びながら数値を変えて、すぐ確かめられるようにしている。

export const STORAGE_KEY = 'dopa.v1';

// LocalStorage に保存する形（初期値）。個人情報は入れない。
export const DEFAULT_DATA = {
  settings: {
    soundEnabled: true,
    soundVolume: 0.7,
    sfxOnly: false,          // true = BGM を鳴らさず効果音だけ
    vibrationEnabled: true,
    effectLevel: 'NORMAL',   // LOW / NORMAL / HIGH
    stimulationLevel: 'NORMAL', // CALM / NORMAL / CHAOS
    controlSensitivity: 1,   // 0.5〜2
  },
  records: {
    crashRacer: {
      highScore: 0,
      highestSpeed: 0,
      totalCrashes: 0,
      totalNearMisses: 0,
      maxCombo: 0,
      plays: 0,
    },
  },
};

// エフェクト量（粒子・残像・スピード線の倍率）
export const FX_LEVELS = {
  LOW: { particles: 0.4, trail: 0.4, lines: 0.4 },
  NORMAL: { particles: 1, trail: 1, lines: 1 },
  HIGH: { particles: 1.8, trail: 1.6, lines: 1.6 },
};

// 刺激レベル。CALM は画面揺れ・フラッシュ・点滅を止める。
export const STIM_LEVELS = {
  CALM: { shake: 0, flash: 0, hueSpeed: 0.25, giantAlpha: 0.06, blink: false },
  NORMAL: { shake: 7, flash: 0.14, hueSpeed: 1, giantAlpha: 0.13, blink: true },
  CHAOS: { shake: 12, flash: 0.22, hueSpeed: 1.6, giantAlpha: 0.2, blink: true },
};

// 端末性能に合わせた軽量化。quality は 0（軽い）〜2（きれい）。
export const PERF = {
  maxDpr: [1, 1.5, 2],
  maxPixels: [500000, 1000000, 1600000], // Canvas の内部ピクセル数の上限
  particleCap: [120, 260, 520],
  qualityMul: [0.45, 0.75, 1],
  downFps: 45,      // これを下回ったら 1 段軽くする
  upFps: 57,        // これを上回り続けたら 1 段戻す
  upHoldSec: 8,
};

export const CRASH_RACER = {
  lanes: 3,
  roadWidthFrac: 0.86,  // 画面幅に対する道路の幅
  roadMaxAspect: 0.62,  // 道路の幅は画面の高さ×これ以下（横長画面用）
  roadMaxPx: 560,
  playerYFrac: 0.78,    // 自車の縦位置（画面の高さに対する割合）
  player: { w: 0.5, h: 0.9, hit: 0.82 }, // 単位はレーン幅。hit は当たり判定の縮小率

  // 衝突回数 → 速度倍率。間は直線でつなぐ（1回ごとに少しずつ速くなる）
  speedTable: [[0, 1.0], [1, 1.2], [3, 1.5], [5, 2.0], [8, 3.0], [12, 5.0], [15, 7.0], [20, 10.0], [30, 15.0]],
  speedPerCrashAfter: 0.4, // 30回以降、1回ごとに足す倍率
  multMax: 99,
  // 速度は「速度レベル」で持つ（speedTable の回数の列と同じ単位）。衝突 1 回でこれだけ上がる
  speedRamp: 3,
  // HP：障害物（車・コーン・ライバルなど）に当たるたびに 1 減る。0 で大クラッシュ → リザルト。
  // 無敵中・スター中にはね飛ばした分は減らない。wreckTime は大クラッシュの演出の秒数
  hp: { max: 50, wreckTime: 1.8 },
  // コンボで指数関数的に加速：速度 × base^コンボ数（20コンボで約10倍、30コンボで約30倍）。
  // 実際のスクロールも上限なしで速くなる（physMax は描画が追いつく限界の安全柵）。コンボが切れると戻る
  comboSpeed: { base: 1.12, physMax: 60, damp: 3, spawnMax: 4 },
  // コーンに当たると減速（速度レベルを下げる）。ステージ（色・演出）は下がらない
  cone: { slowLevel: 3, invincible: 0.6 },
  // スター：まれに出る。取ると duration 秒間、速度倍率 mult 倍・無敵・障害物を全部はね飛ばす
  star: { duration: 10, mult: 10, physBoost: 1.6, spawnRate: 1.7, scoreMul: 2 },
  // ライバルカー：後ろから追い上げてきて、前でレーンを変えながら競り合い、しばらくすると走り去る。
  // ぶつかる（体当たり）と大きな得点。単位は レーン幅/秒・秒
  rival: {
    first: 12, every: [18, 30], approachSpeed: 2.6, holdAhead: [0.5, 3.2], drift: 0.9,
    raceTime: [7, 10], laneChange: [1.3, 2.3], blink: 0.6, escapeSpeed: 7, scoreMul: 5,
  },

  // 実際のスクロール速度は上限つき（操作不能にしないため）。見た目と km/h は誇張する
  physCap: 3.0,
  physCurve: 3.2,
  baseScroll: 0.6,      // 倍率1.0 のときの速さ（画面の高さ／秒）
  boostKick: 0.45,      // 衝突直後の一瞬の加速
  kmhBase: 120,
  kmhExp: 1.55,         // 表示 km/h = kmhBase × 倍率^kmhExp（15倍で約8,000km/h）

  laneChangeRate: 18,   // 横移動の追従の速さ
  swipeThresholdPx: 26, // これ以上指が動いたらスワイプ（感度で割る）
  invincibleTime: 1.1,
  hitStop: 0.055,       // 衝突の瞬間のスロー
  flashCooldown: 0.45,  // 画面フラッシュの最短間隔（高速点滅を防ぐ）
  startGrace: 1.2,      // 開始直後は障害物を出さない

  // 障害物の「行」と行の間隔（秒）。ステージが上がるほど短くなる
  rowGap: { slow: 1.15, fast: 0.62, minAfterDouble: 0.72, jitter: [0.85, 1.25] },
  // 行の種類の出やすさ（ステージ 0〜4）
  rowWeights: {
    single: [6, 5, 4, 3, 3],
    double: [0, 2, 3, 3.5, 4],
    mover: [0, 0, 1.5, 2, 2.5],
    cones: [1.5, 1.5, 1.5, 1.5, 1.2],
    zigzag: [0, 0, 0, 1, 1.5],
    star: [0.3, 0.3, 0.3, 0.3, 0.3], // 全体の 3% 前後（およそ 20〜40 秒に 1 回）
  },
  singleTypes: [
    ['car', 'car', 'cone', 'debris'],
    ['car', 'car', 'cone', 'debris', 'barricade'],
    ['car', 'cone', 'debris', 'barricade'],
    ['car', 'cone', 'debris', 'barricade'],
    ['car', 'cone', 'debris', 'barricade'],
  ],

  nearMissGap: 0.56,    // すれ違った時のすき間がこれ未満ならニアミス（レーン幅単位）
  perfectGap: 0.3,
  comboTime: 3.5,       // この秒数なにも起きないとコンボが 0 に戻る

  score: { perSecond: 12, crash: 300, nearMiss: 120, perfectBonus: 2, comboStep: 0.15, bump: 50 },

  // ステージ（これまでの最高の速度レベルで決まる。下がらない）。色相 bg/edge/lane、cycle は色相の回る速さ（度/秒）
  stages: [
    { name: 'NORMAL', crashes: 0, bg: 228, edge: 188, lane: 220, sat: 18, cycle: 0 },
    { name: 'BOOST', crashes: 3, bg: 268, edge: 315, lane: 300, sat: 30, cycle: 0 },
    { name: 'TURBO', crashes: 8, bg: 250, edge: 168, lane: 180, sat: 45, cycle: 0 },
    { name: 'CHAOS', crashes: 15, bg: 320, edge: 55, lane: 190, sat: 50, cycle: 16 },
    { name: 'ABSURD', crashes: 30, bg: 15, edge: 190, lane: 300, sat: 55, cycle: 40 },
  ],
  backgroundShiftAt: 5,           // 最高速度レベルがこれを超えると背景の色が変わる
  trail: [0, 3, 5, 7, 10],        // 残像の数
  speedLines: [2, 6, 12, 20, 30], // スピード線（本/秒）
  ambientSparks: [0, 0, 0, 14, 30],
  giantEvery: [0, 0, 0, 7, 3.2],  // 画面を横切る巨大な数字の間隔（秒）

  events: { first: 9, min: 12, max: 22, avoidRepeat: 2 },
};
