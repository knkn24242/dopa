// CRASH RACER — ぶつかるほど速くなる縦スクロールレース
//
// 座標の単位は「レーン幅」。x は道路の左端から（0〜3）、y は画面の上端から下向き。
// 描画は render.js、障害物は obstacles.js、イベントは events.js、数値ルールは rules.js。
import { CRASH_RACER as C, FX_LEVELS, STIM_LEVELS, PERF } from '../config.js';
import { ParticleSystem } from '../utils/particles.js';
import { TextFx, damp, clamp, formatInt, GAME_FONT } from '../utils/animation.js';
import { rand, pick, NoRepeatPicker } from '../utils/random.js';
import { RowSpawner, makeObstacle } from './crash-racer/obstacles.js';
import { RacerRenderer } from './crash-racer/render.js';
import { EVENTS, FX_LABELS } from './crash-racer/events.js';
import { multForCrashes, physMult, kmhFor, stageFor, levelAfterCrash, levelAfterCone, comboSpeedMul } from './crash-racer/rules.js';

const STAGE_UP = [
  null,
  { text: 'ブースト！', color: '#ff5cf0', sound: 'levelUp' },
  { text: 'ターボ！！', color: '#00ffd0', sound: 'levelUp' },
  { text: 'カオス！！！', color: '#ff3b6b', sound: 'chaos', sub: '超高速！！', subColor: '#5ef1ff' },
  { text: 'もうめちゃくちゃ！！！！', color: '#ffe14d', sound: 'chaos', sub: '最終カオス', subColor: '#ff5cf0' },
];

const SPARK_COLORS = ['#ffffff', '#ffe14d', '#ff9f1a', '#ff5cf0'];

class CrashRacer {
  constructor(env) {
    this.env = env;
    this.canvas = env.canvas;
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.audio = env.audio;
    this.vib = env.vibration;
    this.hud = env.hud;
    this.particles = new ParticleSystem();
    this.texts = new TextFx();
    this.obstacles = [];
    this.lines = [];
    this.giants = [];
    this.history = [];
    this.explosions = [];
    this.pointers = new Map();
    this.spawner = new RowSpawner(this);
    this.renderer = new RacerRenderer(this);
    this.eventPicker = new NoRepeatPicker(EVENTS, C.events.avoidRepeat);
    this.quality = 2;
    this.paused = false;
    this.W = 1; this.H = 1; this.dpr = 1; this.viewH = 0;
    this.applySettings(env.getSettings());
    this._bindInput();
    this.reset();
  }

  // ───────── 設定・画面サイズ ─────────

  applySettings(s) {
    this.fxl = FX_LEVELS[s.effectLevel] || FX_LEVELS.NORMAL;
    this.stim = STIM_LEVELS[s.stimulationLevel] || STIM_LEVELS.NORMAL;
    this.sens = clamp(Number(s.controlSensitivity) || 1, 0.5, 2);
    this._updateCaps();
  }

  setQuality(q) {
    this.quality = q;
    this._updateCaps();
  }

  _updateCaps() {
    this.fxMul = this.fxl.particles * PERF.qualityMul[this.quality];
    this.particles.setCap(PERF.particleCap[this.quality] * this.fxl.particles);
  }

  resize(W, H, dpr) {
    const oldViewH = this.viewH;
    this.W = W; this.H = H; this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(W * dpr));
    this.canvas.height = Math.max(1, Math.round(H * dpr));
    this.roadW = Math.min(W * C.roadWidthFrac, H * C.roadMaxAspect, C.roadMaxPx);
    this.laneW = this.roadW / C.lanes;
    this.roadX = (W - this.roadW) / 2;
    this.viewH = H / this.laneW;
    this.playerY = this.viewH * C.playerYFrac;
    if (oldViewH && oldViewH !== this.viewH) {
      const k = this.viewH / oldViewH;
      for (const o of this.obstacles) o.y *= k;
      // 画面座標で持っているものは位置がずれるので消す
      this.particles.clear();
      this.lines.length = 0;
      this.giants.length = 0;
      this.explosions.length = 0;
    }
    this.renderer.onResize();
  }

  toPx(x, y) {
    return { x: this.roadX + x * this.laneW, y: y * this.laneW };
  }

  // ───────── 開始・停止 ─────────

  reset() {
    this.t = 0; this.distance = 0; this.score = 0;
    this.crashes = 0; this.nearMisses = 0; this.combo = 0; this.comboTimer = 0; this.maxCombo = 0;
    this.mult = 1; this.multTarget = 1; this.effMult = 1; this.boostKick = 0; this.scrollSpeed = 0;
    this.comboMul = 1; this.speedFactor = 1; this.explosions.length = 0;
    this.hp = C.hp.max; this.hits = 0;
    this.wrecked = false; this.wreckTimer = 0; this.wreckSpin = 0; this.wreckBooms = []; this.finishSent = false;
    this.level = 0; this.peakLevel = 0;  // 速度レベル（衝突で上がり、コーンで下がる）と、その最高値
    this.rivalTimer = C.rival.first; this.rivalsBeaten = 0; this.starsTaken = 0;
    this.kmh = C.kmhBase; this.maxKmh = C.kmhBase;
    this.lane = 1; this.playerX = 1.5; this.tilt = 0;
    this.invincible = 0; this.whiteFlash = 0; this.hitStop = 0; this.trauma = 0;
    this.screenFlash = 0; this.lastFlash = -10;
    this.stageIndex = 0;
    this.fx = { star: 0, megaBoost: 0, ultra: 0, superCrash: 0, chaos: 0, double: 0, infinite: 0 };
    this.eventTimer = C.events.first;
    this.giantTimer = 2;
    this.lineAcc = 0; this.ambientAcc = 0; this.audioTimer = 0;
    this.obstacles.length = 0; this.lines.length = 0; this.giants.length = 0; this.history.length = 0;
    this.particles.clear();
    this.texts.clear();
    this.spawner.reset();
  }

  start() {
    this.reset();
    this.hud.reset('クラッシュレーサー');
    this.texts.banner('スタート！', { color: '#ffe14d', size: 1.25, life: 1.0, y: 0.4 });
    this.audio.setStage(0);
    this.audio.go();
    this.audio.engineStart();
    this.audio.bgmStart();
  }

  onPause() {
    this.paused = true;
    this.pointers.clear();
    this.audio.engineStop();
    this.audio.bgmStop();
  }

  onResume() {
    this.paused = false;
  }

  destroy() {
    const c = this.canvas;
    c.removeEventListener('pointerdown', this._pd);
    c.removeEventListener('pointermove', this._pm);
    c.removeEventListener('pointerup', this._pu);
    c.removeEventListener('pointercancel', this._pu);
    window.removeEventListener('keydown', this._kd);
    this.audio.engineStop();
    this.audio.bgmStop();
  }

  getResult() {
    return {
      score: Math.floor(this.score),
      highestSpeed: Math.round(this.maxKmh),
      crashes: this.crashes,
      nearMisses: this.nearMisses,
      maxCombo: this.maxCombo,
      rivalsBeaten: this.rivalsBeaten,
      starsTaken: this.starsTaken,
      hits: this.hits,
      wrecked: this.wrecked,
    };
  }

  // ───────── 操作 ─────────

  _bindInput() {
    const c = this.canvas;
    // タップ：押した瞬間に動く。そのまま指を横に動かしたら、押す前のレーン＋スワイプ方向に直す
    this._pd = (e) => {
      if (this.paused) return;
      e.preventDefault();
      try { c.setPointerCapture(e.pointerId); } catch (_) { /* 古いブラウザ */ }
      const r = c.getBoundingClientRect();
      const before = this.lane;
      this.setLane(this.lane + (e.clientX - r.left < r.width / 2 ? -1 : 1));
      this.pointers.set(e.pointerId, { x0: e.clientX, y0: e.clientY, before, steps: 0, dir: 0 });
    };
    this._pm = (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p || this.paused) return;
      e.preventDefault();
      const dx = e.clientX - p.x0;
      const dy = e.clientY - p.y0;
      const thr = C.swipeThresholdPx / this.sens;
      if (Math.abs(dx) < thr || Math.abs(dx) < Math.abs(dy) * 1.1) return;
      const dir = Math.sign(dx);
      const steps = Math.abs(dx) > thr * 2.6 ? 2 : 1;
      if (dir === p.dir && steps <= p.steps) return;
      p.dir = dir;
      p.steps = steps;
      this.setLane(p.before + dir * steps);
    };
    this._pu = (e) => { this.pointers.delete(e.pointerId); };
    this._kd = (e) => {
      if (this.paused || e.repeat) return;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); this.setLane(this.lane - 1); }
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); this.setLane(this.lane + 1); }
    };
    c.addEventListener('pointerdown', this._pd);
    c.addEventListener('pointermove', this._pm);
    c.addEventListener('pointerup', this._pu);
    c.addEventListener('pointercancel', this._pu);
    window.addEventListener('keydown', this._kd);
  }

  setLane(target) {
    if (this.wrecked) return;
    const n = clamp(target, 0, C.lanes - 1);
    if (n === this.lane) {
      if (target !== n) { // 壁側に押した：少し傾けて「押した感」だけ返す
        this.tilt += Math.sign(target - n) * 0.12;
        this.audio.wall();
      }
      return;
    }
    const dir = Math.sign(n - this.lane);
    this.lane = n;
    this.audio.move(dir, this.stageIndex);
    const p = this.toPx(this.playerX, this.playerY + C.player.h * 0.45);
    this.particles.burst(2 + Math.round(4 * this.fxMul), p.x, p.y, {
      angle: Math.PI / 2 - dir * 0.7, spread: 0.6, speed: [40, 130], life: [0.25, 0.5],
      size: [3, 6], colors: ['rgba(225,225,240,0.8)', '#5ef1ff'], follow: 1, drag: 3,
    });
  }

  // ───────── 得点・コンボ ─────────

  scoreMul() { return this.fx.double > 0 ? 2 : 1; }

  addScore(amount, bump) {
    this.score += amount;
    if (bump) this.hud.bump(Math.min(0.35, 0.1 + Math.log10(Math.max(10, amount)) * 0.04));
  }

  addCombo(n) {
    const before = this.combo;
    this.combo += n;
    this.comboTimer = C.comboTime;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    if (this.combo >= 2) this.audio.combo(this.combo);
    if (Math.floor(this.combo / 5) > Math.floor(before / 5)) {
      this.texts.banner(`${this.combo} コンボ！ 速さ x${comboSpeedMul(this.combo).toFixed(1)}`, { color: '#b4ff39', size: 0.75, life: 1.1, y: 0.5 });
    }
  }

  // ───────── 毎フレーム ─────────

  update(dt) {
    const a = this.audio;
    if (!a.engine) a.engineStart();   // 音が使えない時は何もしない
    if (!a.bgmOn) a.bgmStart();

    if (this.wrecked) { this._updateWreck(dt); return; }
    if (this.hitStop > 0) { this.hitStop -= dt; dt *= 0.2; } // 衝突の瞬間だけスロー
    this.t += dt;
    const starBefore = this.fx.star;
    for (const k in this.fx) if (this.fx[k] > 0) this.fx[k] = Math.max(0, this.fx[k] - dt);
    if (starBefore > 0 && this.fx.star <= 0) this.onStarEnd();
    const starOn = this.fx.star > 0;

    // 速度
    this.mult = damp(this.mult, this.multTarget, 4, dt);
    this.boostKick = damp(this.boostKick, 0, 2.2, dt);
    const extra = (this.fx.megaBoost > 0 ? 0.35 : 0) + (starOn ? C.star.physBoost : 0);
    // コンボで指数関数的に速くなる（実際のスクロールも）。コンボが切れたら滑らかに戻る
    this.comboMul = damp(this.comboMul, comboSpeedMul(this.combo), C.comboSpeed.damp, dt);
    this.effMult = this.mult * this.comboMul * (starOn ? C.star.mult : 1); // 表示・得点に使う倍率
    this.speedFactor = Math.min(C.comboSpeed.physMax, (physMult(this.mult) + this.boostKick + extra) * this.comboMul);
    this.scrollSpeed = C.baseScroll * this.viewH * this.speedFactor;
    const dy = this.scrollSpeed * dt;
    this.distance += dy;
    this.kmh = kmhFor(this.mult) * this.comboMul * (starOn ? C.star.mult : 1) * (1 + this.boostKick * 0.25) * (this.fx.ultra > 0 ? 2 : 1);
    // 速すぎる時は画面がずっと小刻みに揺れる（CALM では揺れない）
    this.trauma = Math.max(this.trauma, clamp((this.speedFactor - 4) / 24, 0, 0.55));
    this.maxKmh = Math.max(this.maxKmh, this.kmh);

    // 自車
    const px = this.playerX;
    this.playerX = damp(this.playerX, this.lane + 0.5, C.laneChangeRate * this.sens, dt);
    const vx = dt > 0 ? (this.playerX - px) / dt : 0;
    this.tilt = damp(this.tilt, clamp(vx * 0.05, -0.35, 0.35), 18, dt);
    this.history.push(this.playerX);
    if (this.history.length > 40) this.history.shift();

    // 走った分の得点
    this.addScore(C.score.perSecond * this.effMult * this.scoreMul() * (this.fx.infinite > 0 ? 3 : 1) * dt, false);

    this.spawner.update(dt);
    this._updateRivalSpawn(dt);
    this._updateObstacles(dt, dy);

    // タイマー類
    this.invincible = Math.max(0, this.invincible - dt);
    this.whiteFlash = Math.max(0, this.whiteFlash - dt * 5);
    this.screenFlash = Math.max(0, this.screenFlash - dt * 1.2);
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    this._updateEvents(dt);
    this._updateAmbient(dt);
    this.particles.update(dt, Math.min(this.scrollSpeed * this.laneW, this.H * 3));
    this._updateExplosions(dt);
    this.texts.update(dt);

    this.audioTimer -= dt;
    if (this.audioTimer <= 0) { this.audioTimer = 0.05; a.engineSet(this.speedFactor * (starOn ? 1.6 : 1)); }

    let fxText = '';
    for (const [k, label] of FX_LABELS) if (this.fx[k] > 0) { fxText = `${label} あと${Math.ceil(this.fx[k])}秒`; break; }
    this.hud.update({ score: this.score, kmh: this.kmh, mult: this.effMult, combo: this.combo, stage: this.stageIndex, fx: fxText, hp: this.hp, hpMax: C.hp.max }, dt);
  }

  // ───────── HP・大クラッシュ ─────────

  /** 障害物に当たった時に呼ぶ。HP が 0 になったら true */
  damage() {
    this.hits++;
    this.hp = Math.max(0, this.hp - 1);
    if (this.hp > 0) return false;
    this.wreck();
    return true;
  }

  wreck() {
    if (this.wrecked) return;
    this.wrecked = true;
    this.wreckTimer = C.hp.wreckTime;
    this.wreckBooms = [1.45, 1.15, 0.8]; // 残り秒数がこれを切ったら追加の爆発
    this.combo = 0;
    this.pointers.clear();
    const p = this.toPx(this.playerX, this.playerY);
    this.explode(p.x, p.y, 2.4);
    this.texts.banner('大クラッシュ！！', { color: '#ff4a3d', size: 1.35, life: C.hp.wreckTime, y: 0.36 });
    this.texts.banner('HP 0', { color: '#ffffff', size: 0.8, life: C.hp.wreckTime });
    this.trauma = 1;
    if (this.t - this.lastFlash > C.flashCooldown) { this.screenFlash = this.stim.flash * 1.5; this.lastFlash = this.t; }
    this.audio.crash(4);
    this.audio.chaos();
    this.audio.engineStop();
    this.audio.bgmStop();
    this.vib.chaos();
  }

  /** 大クラッシュの演出：スローモーションで自車が回りながら燃え、終わったらリザルトへ */
  _updateWreck(rdt) {
    const dt = rdt * 0.4;
    this.wreckTimer -= rdt;
    this.t += dt;
    this.wreckSpin += dt * 10;
    this.scrollSpeed *= Math.exp(-3 * rdt);
    const p = this.toPx(this.playerX, this.playerY);
    while (this.wreckBooms.length && this.wreckTimer < this.wreckBooms[0]) {
      this.wreckBooms.shift();
      this.explode(p.x + rand(-0.6, 0.6) * this.laneW, p.y + rand(-0.6, 0.4) * this.laneW, rand(1.2, 1.8));
      this.audio.crash(3);
      this.vib.crash();
    }
    this.whiteFlash = Math.max(0, this.whiteFlash - dt * 5);
    this.screenFlash = Math.max(0, this.screenFlash - rdt * 1.2);
    this.trauma = Math.max(0.35, this.trauma - rdt * 0.6);
    this.particles.update(dt, Math.min(this.scrollSpeed * this.laneW, this.H));
    this.texts.update(rdt);
    this._updateExplosions(dt);
    this.hud.update({ score: this.score, kmh: this.kmh * Math.exp(-3 * (C.hp.wreckTime - this.wreckTimer)), mult: this.effMult, combo: 0, stage: this.stageIndex, fx: '', hp: 0, hpMax: C.hp.max }, rdt);
    if (this.wreckTimer <= 0 && !this.finishSent) {
      this.finishSent = true;
      if (this.env.requestFinish) this.env.requestFinish();
    }
  }

  _updateObstacles(dt, dy) {
    const P = C.player;
    const phw = (P.w * P.hit) / 2, phh = (P.h * P.hit) / 2;
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      const T = o.type;
      if (o.knocked) { // はじき飛ばされた障害物
        o.x += o.vx * dt;
        o.y += o.vy * dt + dy * 0.3;
        o.rot += o.vr * dt;
        o.alpha -= dt * 1.6;
        if (o.alpha <= 0) this.obstacles.splice(i, 1);
        continue;
      }
      if (o.rival) { this._updateRival(o, i, dt, phw, phh); continue; }
      const y0 = o.y;
      o.y += dy * (1 - T.own);
      if (o.mover) {
        o.mover.phase += o.mover.speed * dt;
        o.x = o.mover.a + (o.mover.b - o.mover.a) * (1 - Math.cos(o.mover.phase)) / 2 + 0.5;
      }
      const dxc = Math.abs(o.x - this.playerX);
      // 縦は「このフレームで動いた範囲」で判定する（超高速で 1 フレームにすり抜けないように）
      const hh = phh + (T.h * T.hit) / 2;
      if (dxc < phw + (T.w * T.hit) / 2 && o.y > this.playerY - hh && y0 < this.playerY + hh) {
        if (T.item) { this.obstacles.splice(i, 1); this.collectStar(o); }
        else if (this.invincible > 0 || this.fx.star > 0) this.bump(o);
        else if (T.id === 'cone') this.coneHit(o);
        else this.crash(o);
        continue;
      }
      if (T.item) { if (o.y - T.h > this.viewH + 0.5) this.obstacles.splice(i, 1); continue; }
      if (!o.passed && o.y - T.h / 2 > this.playerY) {
        o.passed = true;
        const gap = dxc - (P.w / 2 + T.w / 2);
        if (gap < C.nearMissGap) this.nearMiss(o, gap);
      }
      if (o.y - T.h > this.viewH + 0.5) this.obstacles.splice(i, 1);
    }
  }

  // ───────── 衝突・ニアミス ─────────

  knock(o, power) {
    o.knocked = true;
    const side = o.x < this.playerX ? -1 : o.x > this.playerX ? 1 : (Math.random() < 0.5 ? -1 : 1);
    o.vx = side * rand(3, 6) * power;
    o.vy = -rand(4, 8) * power;
    o.vr = side * rand(5, 12);
  }

  crash(o) {
    const prevStage = this.stageIndex;
    this.crashes++;
    this.level = levelAfterCrash(this.level);
    this.peakLevel = Math.max(this.peakLevel, this.level);
    this.multTarget = multForCrashes(this.level);
    this.boostKick = Math.max(this.boostKick, C.boostKick);
    this.invincible = C.invincibleTime;
    this.whiteFlash = 1;
    this.hitStop = C.hitStop;
    this.trauma = Math.min(1, this.trauma + 0.45 + prevStage * 0.08);
    if (this.t - this.lastFlash > C.flashCooldown) { this.screenFlash = this.stim.flash; this.lastFlash = this.t; }
    this.knock(o, 1);

    const s = prevStage;
    const hit = this.toPx((o.x + this.playerX) / 2, this.playerY - C.player.h * 0.42);
    const n = Math.round((18 + s * 10) * this.fxMul);
    this.particles.burst(n, hit.x, hit.y, {
      speed: [120, 420 + s * 60], life: [0.3, 0.7], size: [1.5, 3], colors: SPARK_COLORS,
      shape: 'spark', drag: 2.5, additive: true,
    });
    this.particles.burst(Math.round(n * 0.6), hit.x, hit.y, {
      speed: [60, 260], life: [0.5, 1.0], size: [4, 9], colors: [o.color || '#ff7a1a', '#ffffff', '#2a2a33'],
      shape: 'square', gravity: 500, drag: 1, follow: 0.6,
    });

    this.explode(hit.x, hit.y, 1 + Math.min(s, 4) * 0.15);

    const gain = C.score.crash * this.multTarget * (this.fx.superCrash > 0 ? 3 : 1) * this.scoreMul();
    this.addScore(gain, true);
    // 文字は自車にかぶらないよう、少し上に出す
    this.texts.popup(`ドカン！ +${formatInt(gain)}`, hit.x, hit.y - 56, { color: '#ffe14d', size: 22 + s * 4 });
    this.texts.popup(`スピードアップ x${this.multTarget.toFixed(1)}`, hit.x, hit.y - 26, { color: '#5ef1ff', size: 15 + s * 2, life: 1.0, vy: -40 });
    this.addCombo(1);
    this.audio.crash(s);
    this.vib.crash();

    this.stageIndex = stageFor(this.peakLevel);
    if (this.stageIndex > prevStage) this.onStageUp(this.stageIndex);
    this.damage();
  }

  /** コーン：減速する（ステージは下がらない）。責める演出にはしない */
  coneHit(o) {
    this.level = levelAfterCone(this.level);
    this.multTarget = multForCrashes(this.level);
    this.boostKick = 0;
    this.invincible = C.cone.invincible;
    this.trauma = Math.min(1, this.trauma + 0.15);
    this.knock(o, 0.7);
    const p = this.toPx(o.x, this.playerY - C.player.h * 0.42);
    this.particles.burst(Math.round(12 * this.fxMul) + 3, p.x, p.y, {
      speed: [60, 220], life: [0.3, 0.6], size: [3, 6], colors: ['#ff7a1a', '#ffffff'],
      shape: 'square', gravity: 400, drag: 1.5, follow: 0.6,
    });
    this.texts.popup('ポコン！', p.x, p.y - 50, { color: '#ff9f1a', size: 20 });
    this.texts.popup(`スピードダウン x${this.multTarget.toFixed(1)}`, p.x, p.y - 22, { color: '#c9c9ff', size: 14, life: 0.9, vy: -40 });
    this.audio.bump();
    this.vib.nearMiss();
    this.damage();
  }

  // ───────── スター ─────────

  collectStar(o) {
    this.starsTaken++;
    this.fx.star = C.star.duration;
    this.addScore(1000 * this.mult * this.scoreMul(), true);
    this.texts.banner('スター！', { color: '#ffe14d', size: 1.3, life: 1.6, y: 0.34 });
    this.texts.banner(`${C.star.mult}倍速！！`, { color: '#5ef1ff', size: 0.95, life: 1.6 });
    this.audio.chaos();
    this.vib.chaos();
    this.trauma = Math.min(1, this.trauma + 0.3);
    if (this.t - this.lastFlash > C.flashCooldown) { this.screenFlash = this.stim.flash; this.lastFlash = this.t; }
    const p = this.toPx(o.x, o.y);
    this.particles.burst(Math.round(60 * this.fxMul) + 10, p.x, p.y, {
      speed: [150, 520], life: [0.6, 1.3], size: [5, 10], colors: ['#ffe14d', '#ffffff', '#ff5cf0', '#5ef1ff'],
      shape: 'confetti', gravity: 260, drag: 1.5,
    });
  }

  onStarEnd() {
    const p = this.toPx(this.playerX, this.playerY - 1.2);
    this.texts.popup('スターおわり！ナイス！', p.x, p.y, { color: '#ffe14d', size: 18, life: 1.2, vy: -40 });
    this.invincible = Math.max(this.invincible, 1.0); // 戻った直後にすぐぶつからないように
  }

  // ───────── ライバルカー ─────────

  _updateRivalSpawn(dt) {
    if (this.fx.infinite > 0 || this.t < C.startGrace) return;
    if (this.obstacles.some((o) => o.rival && !o.knocked)) return;
    this.rivalTimer -= dt;
    if (this.rivalTimer > 0) return;
    const R = C.rival;
    this.rivalTimer = rand(R.every[0], R.every[1]);
    const lanes = [];
    for (let l = 0; l < C.lanes; l++) if (l !== this.lane) lanes.push(l);
    const lane = pick(lanes);
    const o = makeObstacle('rival', lane, this.viewH + 1.0); // 画面の下（後ろ）から来る
    o.passed = true;
    o.rival = {
      state: 'approach', lane, toLane: lane, blink: 0,
      laneTimer: rand(R.laneChange[0], R.laneChange[1]),
      raceTime: rand(R.raceTime[0], R.raceTime[1]),
      phase: rand(0, Math.PI * 2),
    };
    this.obstacles.push(o);
    this.texts.banner('ライバル登場！', { color: '#ff3b6b', size: 0.9, life: 1.5, y: 0.26 });
    this.audio.event();
    this.vib.pulse(20);
  }

  /** ライバルは自車との位置関係で動く（道路のスクロールとは別） */
  _updateRival(o, i, dt, phw, phh) {
    const R = C.rival, r = o.rival, T = o.type;
    if (r.state === 'approach') {
      o.y -= R.approachSpeed * dt;
      if (o.y <= this.playerY - R.holdAhead[1]) r.state = 'race';
    } else if (r.state === 'race') {
      // 自車の少し前を行ったり来たりする。近づいた時に同じレーンにいれば体当たりできる
      const mid = (R.holdAhead[0] + R.holdAhead[1]) / 2, amp = (R.holdAhead[1] - R.holdAhead[0]) / 2;
      const ahead = mid + amp * Math.sin(this.t * R.drift + r.phase);
      o.y = damp(o.y, this.playerY - ahead, 2.5, dt);
      if (r.blink > 0) {
        r.blink -= dt;
        if (r.blink <= 0) r.lane = r.toLane;
      } else {
        r.laneTimer -= dt;
        if (r.laneTimer <= 0) {
          r.laneTimer = rand(R.laneChange[0], R.laneChange[1]);
          // 半分は自車のレーンへ寄せてくる（競り合い）。ウインカーで予告してから動く
          let to = Math.random() < 0.5 ? this.lane : r.lane + (Math.random() < 0.5 ? -1 : 1);
          to = clamp(to, 0, C.lanes - 1);
          if (to === r.lane) to = r.lane === 0 ? 1 : r.lane === C.lanes - 1 ? C.lanes - 2 : r.lane + 1;
          r.toLane = to;
          r.blink = R.blink;
        }
      }
      r.raceTime -= dt;
      if (r.raceTime <= 0 && r.blink <= 0) {
        r.state = 'escape';
        const p = this.toPx(o.x, Math.max(1, o.y));
        this.texts.popup('ライバル、先に行った！', p.x, p.y, { color: '#ff9fb8', size: 15, life: 1.0, vy: -30 });
      }
    } else {
      o.y -= R.escapeSpeed * dt;
      if (o.y < -2) { this.obstacles.splice(i, 1); return; }
    }
    o.x = damp(o.x, r.lane + 0.5, 6, dt);

    // ライバルは前の障害物をはね飛ばして進む
    for (const b of this.obstacles) {
      if (b === o || b.knocked || b.rival || b.type.item) continue;
      if (Math.abs(b.x - o.x) < (T.w + b.type.w) * 0.45 && Math.abs(b.y - o.y) < (T.h + b.type.h) * 0.45) {
        b.knocked = true;
        const side = b.x < o.x ? -1 : 1;
        b.vx = side * rand(3, 5); b.vy = -rand(3, 6); b.vr = side * rand(5, 10);
        const p = this.toPx(b.x, b.y);
        this.particles.burst(Math.round(6 * this.fxMul) + 2, p.x, p.y, {
          speed: [80, 220], life: [0.2, 0.4], size: [1.5, 2.5], colors: SPARK_COLORS, shape: 'spark', drag: 3, additive: true,
        });
      }
    }

    // 自車とぶつかった：ふつうの衝突（加速）＋ライバル撃破ボーナス
    if (Math.abs(o.x - this.playerX) < phw + (T.w * T.hit) / 2 && Math.abs(o.y - this.playerY) < phh + (T.h * T.hit) / 2) {
      if (this.invincible > 0 || this.fx.star > 0) this.bump(o);
      else this.crash(o);
      this.rivalDown(o);
    }
  }

  rivalDown(o) {
    this.rivalsBeaten++;
    const gain = C.score.crash * C.rival.scoreMul * this.effMult * this.scoreMul();
    this.addScore(gain, true);
    const p = this.toPx(o.x, o.y);
    this.explode(p.x, p.y, 1.7);
    this.texts.banner('ライバル撃破！', { color: '#ff3b6b', size: 1.0, life: 1.5, y: 0.3 });
    this.texts.popup(`+${formatInt(gain)}`, p.x, p.y - 40, { color: '#ffe14d', size: 22, life: 1.0 });
    this.particles.burst(Math.round(40 * this.fxMul) + 6, p.x, p.y, {
      speed: [150, 480], life: [0.5, 1.1], size: [5, 9], colors: ['#ff3b6b', '#ffd23f', '#ffffff'],
      shape: 'confetti', gravity: 300, drag: 1.5,
    });
    this.audio.levelUp();
  }

  /** 爆発。x, y は画面のピクセル、size は 1 が基本（レーン幅くらいの火の玉） */
  explode(x, y, size = 1) {
    const R = this.laneW * 0.95 * size;
    const lowQ = this.quality === 0;
    const puffs = [], blobs = [];
    const smoke = ['#2b2730', '#3b3540', '#4a4350', '#1f1c24'];
    const fire = ['#ff7a1a', '#ffb11a', '#ff4a1a', '#ffe14d'];
    for (let i = 0; i < (lowQ ? 4 : 7); i++) puffs.push({ a: rand(0, Math.PI * 2), d: rand(0.3, 0.9), r: rand(0.35, 0.6), c: pick(smoke) });
    for (let i = 0; i < (lowQ ? 5 : 10); i++) blobs.push({ a: rand(0, Math.PI * 2), d: rand(0.8, 1.9), r: rand(0.12, 0.26), c: pick(fire) });
    if (this.explosions.length >= 6) this.explosions.shift();
    this.explosions.push({ x, y, age: 0, life: 0.95, R, puffs, blobs });
    // 火の粉と破片
    this.particles.burst(Math.round(34 * size * this.fxMul) + 6, x, y, {
      speed: [180, 640 * size], life: [0.35, 0.9], size: [2, 4], colors: ['#ffffff', '#ffe14d', '#ff9f1a', '#ff4a1a'],
      shape: 'spark', drag: 2.2, additive: true, gravity: 300,
    });
    this.particles.burst(Math.round(14 * size * this.fxMul) + 3, x, y, {
      speed: [120, 420], life: [0.6, 1.2], size: [4, 8], colors: ['#2a2a33', '#555562', '#ff7a1a'],
      shape: 'square', gravity: 700, drag: 0.8,
    });
    this.trauma = Math.min(1, this.trauma + 0.25 * size);
  }

  _updateExplosions(dt) {
    // 道路と一緒に少し流れる（速すぎる時は流れすぎないように上限）
    const vy = Math.min(this.scrollSpeed * this.laneW * 0.3, this.H * 1.2);
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.age += dt;
      e.y += vy * dt;
      if (e.age >= e.life) this.explosions.splice(i, 1);
    }
  }

  /** 無敵中に当たった障害物：はじき飛ばして少しだけ得点 */
  bump(o) {
    this.knock(o, 0.8);
    const p = this.toPx(o.x, o.y);
    this.particles.burst(Math.round(8 * this.fxMul) + 2, p.x, p.y, {
      speed: [80, 260], life: [0.2, 0.45], size: [1.5, 2.5], colors: SPARK_COLORS, shape: 'spark', drag: 3, additive: true,
    });
    const gain = C.score.bump * this.effMult * this.scoreMul();
    this.addScore(gain, false);
    this.texts.popup(`+${formatInt(gain)}`, p.x, p.y, { color: '#ffffff', size: 15, life: 0.6 });
    this.audio.bump();
  }

  nearMiss(o, gap) {
    const perfect = gap < C.perfectGap;
    this.nearMisses++;
    this.addCombo(1);
    const gain = C.score.nearMiss * this.effMult * (1 + this.combo * C.score.comboStep) *
      (perfect ? C.score.perfectBonus : 1) * this.scoreMul();
    this.addScore(gain, true);
    const s = this.stageIndex;
    const side = o.x < this.playerX ? -1 : 1;
    const p = this.toPx(this.playerX + side * C.player.w * 0.55, this.playerY);
    this.particles.burst(Math.round((10 + s * 5) * this.fxMul) + 3, p.x, p.y, {
      angle: side < 0 ? Math.PI : 0, spread: 0.9, speed: [120, 360], life: [0.25, 0.55],
      size: [1.5, 2.5], colors: perfect ? ['#ffe14d', '#ffffff'] : ['#5ef1ff', '#ffffff', '#b4ff39'],
      shape: 'spark', drag: 3, additive: true,
    });
    this.texts.popup(perfect ? 'ギリギリ！！' : 'ニアミス！', p.x, p.y - 30, { color: perfect ? '#ffe14d' : '#7cff6b', size: 18 + s * 3 });
    this.texts.popup(`+${formatInt(gain)}`, p.x, p.y - 4, { color: '#ffffff', size: 15 + s * 2, life: 0.8, vy: -50 });
    this.audio.nearMiss(perfect, s);
    this.vib.nearMiss();
  }

  onStageUp(s) {
    const info = STAGE_UP[s];
    this.audio.setStage(s);
    if (!info) return;
    this.texts.banner(info.text, { color: info.color, size: 1.15, life: 1.8 });
    if (info.sub) this.texts.banner(info.sub, { color: info.subColor, size: 0.8, life: 1.8 });
    if (info.sound === 'chaos') { this.audio.chaos(); this.vib.chaos(); } else this.audio.levelUp();
    const c = this.toPx(1.5, this.viewH * 0.4);
    this.particles.burst(Math.round(50 * this.fxMul), c.x, c.y, {
      speed: [150, 520], life: [0.6, 1.3], size: [5, 10], colors: [info.color, '#ffffff', '#5ef1ff'],
      shape: 'confetti', gravity: 300, drag: 1.5,
    });
  }

  // ───────── イベント・雰囲気 ─────────

  _updateEvents(dt) {
    this.eventTimer -= dt;
    if (this.eventTimer > 0) return;
    const s = this.stageIndex;
    this.eventTimer = rand(C.events.min, C.events.max) * (1 - 0.07 * s);
    const ev = this.eventPicker.next((e) => (e.minStage || 0) <= s);
    ev.apply(this);
    this.texts.banner(ev.text, { color: ev.color, size: ev.size, life: 1.7, y: 0.3 });
    this.audio.event();
    this.vib.pulse(25);
    const c = this.toPx(1.5, this.viewH * 0.3);
    this.particles.burst(Math.round(36 * this.fxMul), c.x, c.y, {
      speed: [120, 420], life: [0.6, 1.2], size: [5, 9], colors: [ev.color, '#ffffff'],
      shape: 'confetti', gravity: 280, drag: 1.5,
    });
  }

  goldRain() {
    for (let i = 0; i < 3; i++) {
      this.particles.burst(Math.round(18 * this.fxMul), rand(0, this.W), -10, {
        angle: Math.PI / 2, spread: 0.5, speed: [80, 260], life: [1.0, 1.8], size: [6, 11],
        colors: ['#ffe14d', '#ffd000', '#fff3a0'], shape: 'confetti', gravity: 220, jitter: 60,
      });
    }
  }

  _updateAmbient(dt) {
    const s = this.stageIndex;
    const W = this.W, H = this.H, L = this.laneW;
    // スピード線
    const lineRate = C.speedLines[s] * this.fxl.lines * PERF.qualityMul[this.quality] *
      (this.fx.megaBoost > 0 ? 2.2 : 1) * (this.fx.ultra > 0 ? 2 : 1) * Math.min(5, Math.sqrt(this.comboMul));
    this.lineAcc += lineRate * dt;
    while (this.lineAcc >= 1) {
      this.lineAcc -= 1;
      if (this.lines.length < 70) {
        this.lines.push({ x: rand(0, W), y: -rand(0, H * 0.3), len: L * rand(0.8, 1.8) * (1 + s * 0.3), w: rand(1, 2.5), a: rand(0.25, 0.6) });
      }
    }
    const lv = Math.min(this.scrollSpeed * L * 1.7, H * 7) * dt; // 速すぎて一度も描かれない線にしない
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const l = this.lines[i];
      l.y += lv;
      if (l.y > H + l.len) this.lines.splice(i, 1);
    }
    // カオス以降：画面全体に紙吹雪
    const amb = (C.ambientSparks[s] + (this.fx.chaos > 0 ? 20 : 0)) * this.fxMul;
    this.ambientAcc += amb * dt;
    if (this.ambientAcc >= 1) {
      const n = Math.floor(this.ambientAcc);
      this.ambientAcc -= n;
      const hue = Math.floor(rand(0, 360));
      this.particles.burst(n, rand(0, W), -10, {
        angle: Math.PI / 2, spread: 0.4, speed: [80, 220], life: [1.5, 2.6], size: [4, 8],
        colors: [`hsl(${hue},100%,65%)`, '#ffffff'], shape: 'confetti', follow: 0.25, jitter: 20,
      });
    }
    // ABSURD：画面を横切る巨大な数字
    const every = C.giantEvery[s];
    if (every > 0 && this.stim.giantAlpha > 0) {
      this.giantTimer -= dt;
      if (this.giantTimer <= 0) {
        this.giantTimer = every * rand(0.8, 1.2);
        const text = pick([formatInt(this.kmh), `x${this.effMult.toFixed(1)}`, formatInt(this.score), 'DOPA!', 'ドカン！', '！！！！']);
        const size = H * rand(0.16, 0.24);
        this.ctx.font = `italic 900 ${size}px ${GAME_FONT}`;
        const w = this.ctx.measureText(text).width;
        const dir = Math.random() < 0.5 ? 1 : -1;
        this.giants.push({
          text, size, w, y: H * rand(0.18, 0.7), x: dir > 0 ? -w / 2 : W + w / 2,
          vx: dir * W * rand(0.4, 0.7), color: `hsl(${Math.floor(rand(0, 360))},100%,65%)`,
        });
      }
    }
    for (let i = this.giants.length - 1; i >= 0; i--) {
      const gi = this.giants[i];
      gi.x += gi.vx * dt;
      if (gi.x < -gi.w || gi.x > W + gi.w) this.giants.splice(i, 1);
    }
  }

  /** 画面揺れ。乱数ではなく複数の sin を重ねて、ガタガタしすぎないようにする */
  shake() {
    const amp = Math.min(16, this.stim.shake * this.trauma * this.trauma * (1 + this.stageIndex * 0.2));
    if (amp < 0.1) return { x: 0, y: 0 };
    const t = this.t;
    return {
      x: (amp * (Math.sin(t * 53) + Math.sin(t * 31.7) * 0.6)) / 1.6,
      y: (amp * (Math.sin(t * 47.3) + Math.sin(t * 23.1) * 0.6)) / 1.6,
    };
  }

  render() {
    this.renderer.draw();
  }
}

export const crashRacer = {
  id: 'crashRacer',
  title: 'クラッシュレーサー',
  create(env) { return new CrashRacer(env); },
};
