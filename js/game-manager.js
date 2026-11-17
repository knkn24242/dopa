// ゲームの登録と実行（ループ・一時停止・画面サイズ・性能に合わせた軽量化）。
// ゲームは { id, title, create(env) } を登録する。create が返すオブジェクトは
// start / update(dt) / render / resize(W,H,dpr) / setQuality(q) / applySettings(s) /
// onPause / onResume / getResult / destroy を持つ。
import { PERF } from './config.js';

const registry = new Map();
export function registerGame(def) { registry.set(def.id, def); }
export function listGames() { return [...registry.values()]; }

export class GameManager {
  constructor({ canvas, hud, audio, vibration, getSettings }) {
    this.canvas = canvas;
    // requestFinish：ゲーム側から「終わった」と知らせる（HP 0 など）。ループの外で onRequestFinish を呼ぶ
    this.onRequestFinish = null;
    this.env = {
      canvas, hud, audio, vibration, getSettings,
      requestFinish: () => setTimeout(() => { if (this.running && this.onRequestFinish) this.onRequestFinish(); }, 0),
    };
    this.game = null;
    this.running = false;
    this.paused = false;
    this.raf = 0;
    this.quality = 2;
    this._tick = this._tick.bind(this);
    this._resetPerf();
    if (typeof ResizeObserver === 'function') {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(canvas.parentElement);
    }
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
  }

  start(id) {
    this.stop();
    const def = registry.get(id);
    if (!def) throw new Error(`unknown game: ${id}`);
    this.currentId = id;
    this.game = def.create(this.env);
    this.game.setQuality(this.quality);
    this.resize();
    this.game.start();
    this.running = true;
    this.paused = false;
    this._resetPerf();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this._tick);
  }

  _tick(now) {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this._tick);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) return;
    this._measure(dt);
    dt = Math.min(dt, 1 / 20); // 長く止まった後でも一気に進めない
    if (!this.paused) this.game.update(dt);
    this.game.render();
  }

  pause() {
    if (!this.running || this.paused) return;
    this.paused = true;
    cancelAnimationFrame(this.raf); // 止まっている間は描画もしない
    this.raf = 0;
    this.game.onPause();
  }

  resume() {
    if (!this.running || !this.paused) return;
    this.paused = false;
    this.game.onResume();
    this.last = performance.now();
    this._resetPerf();
    this.raf = requestAnimationFrame(this._tick);
  }

  finish() {
    if (!this.game) return null;
    const r = this.game.getResult();
    this.stop();
    return r;
  }

  stop() {
    this.running = false;
    this.paused = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.game) { this.game.destroy(); this.game = null; }
  }

  applySettings(s) {
    if (this.game) this.game.applySettings(s);
  }

  resize() {
    if (!this.game) return;
    const rect = this.canvas.getBoundingClientRect();
    const W = Math.max(1, rect.width);
    const H = Math.max(1, rect.height);
    // 内部解像度は必要以上に上げない
    let dpr = Math.min(window.devicePixelRatio || 1, PERF.maxDpr[this.quality]);
    const maxPx = PERF.maxPixels[this.quality];
    if (W * H * dpr * dpr > maxPx) dpr = Math.sqrt(maxPx / (W * H));
    this.game.resize(W, H, dpr);
    if (this.paused) this.game.render();
  }

  _resetPerf() {
    this.perfTime = 0;
    this.perfFrames = 0;
    this.goodTime = 0;
    this.sinceChange = 0;
  }

  /** 1秒ごとに FPS を見て、重ければ 1 段軽く、余裕が続けば 1 段戻す */
  _measure(dt) {
    if (dt > 0.5) return; // 復帰直後などは数えない
    this.perfTime += dt;
    this.perfFrames++;
    this.sinceChange += dt;
    if (this.perfTime < 1) return;
    const fps = this.perfFrames / this.perfTime;
    this.perfTime = 0;
    this.perfFrames = 0;
    if (fps < PERF.downFps && this.quality > 0 && this.sinceChange > 2) {
      this._setQuality(this.quality - 1);
    } else if (fps > PERF.upFps) {
      this.goodTime += 1;
      if (this.goodTime >= PERF.upHoldSec && this.quality < 2) this._setQuality(this.quality + 1);
    } else {
      this.goodTime = 0;
    }
    this.lastFps = fps;
  }

  _setQuality(q) {
    this.quality = q;
    this.goodTime = 0;
    this.sinceChange = 0;
    if (this.game) { this.game.setQuality(q); this.resize(); }
  }
}
