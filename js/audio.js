// 効果音・BGM を Web Audio API で合成する（音声ファイルなしで成立する）。
// AudioContext は最初のユーザー操作で作る（ブラウザの自動再生制限のため）。
// 音量が際限なく大きくならないよう、コンプレッサー・同時発音数・同じ音の連打間隔で抑える。

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.7;
    this.sfxOnly = false;
    this.voices = 0;
    this.last = Object.create(null);
    this.engine = null;
    this.bgmOn = false;
    this.bgmTimer = 0;
    this.stage = 0;
  }

  /** 最初のタップ／キー入力で呼ぶ。2回目以降は止まっていたら再開するだけ */
  unlock() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (_) { this.ctx = null; return; }
    const c = this.ctx;
    this.master = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    this.master.connect(comp);
    comp.connect(c.destination);
    this.sfxBus = c.createGain();
    this.sfxBus.connect(this.master);
    this.bgmBus = c.createGain(); // 将来 BGM ファイルを足す時もここにつなぐ
    this.bgmBus.connect(this.master);
    const len = c.sampleRate * 2; // 2 秒分（長い爆発音でも途中で切れないように）
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // iOS の無音解除
    try {
      const b = c.createBuffer(1, 1, 22050);
      const s = c.createBufferSource();
      s.buffer = b; s.connect(c.destination); s.start(0);
    } catch (_) { /* 無視 */ }
    this._applyGains();
    this.resume();
  }

  applySettings(s) {
    this.enabled = !!s.soundEnabled;
    this.volume = Number(s.soundVolume) || 0;
    this.sfxOnly = !!s.sfxOnly;
    if (!this.ctx) return;
    this._applyGains();
    if (!this.enabled) { this.engineStop(); this.bgmStop(); }
    if (this.sfxOnly) this.bgmStop();
  }

  _applyGains() {
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.enabled ? this.volume * 0.8 : 0, t, 0.03);
    this.bgmBus.gain.setTargetAtTime(this.sfxOnly ? 0 : 0.5, t, 0.05);
  }

  get ok() {
    return !!this.ctx && this.enabled && this.volume > 0.001 && this.ctx.state === 'running';
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); }
  setStage(s) { this.stage = s; }

  /** 同じ音の連打と、同時発音数の上限 */
  _gate(name, gapMs) {
    if (!this.ok) return false;
    const now = performance.now();
    if (now - (this.last[name] || 0) < gapMs) return false;
    if (this.voices > 28) return false;
    this.last[name] = now;
    return true;
  }

  _tone(o) {
    const c = this.ctx;
    const t = (o.at ?? c.currentTime) + (o.delay || 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain ?? 0.2, t + (o.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    let f = null;
    if (o.lp) {
      f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lp;
      osc.connect(f); f.connect(g);
    } else {
      osc.connect(g);
    }
    g.connect(o.bus || this.sfxBus);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
    this.voices++;
    osc.onended = () => {
      this.voices--;
      try { g.disconnect(); if (f) f.disconnect(); } catch (_) { /* 無視 */ }
    };
  }

  _noise(o) {
    const c = this.ctx;
    const t = (o.at ?? c.currentTime) + (o.delay || 0);
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = o.filter || 'lowpass';
    f.Q.value = o.q ?? 1;
    f.frequency.setValueAtTime(o.f0 || 2000, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain ?? 0.2, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f); f.connect(g); g.connect(o.bus || this.sfxBus);
    src.start(t, Math.random() * 0.5, o.dur + 0.05);
    this.voices++;
    src.onended = () => {
      this.voices--;
      try { g.disconnect(); f.disconnect(); } catch (_) { /* 無視 */ }
    };
  }

  // ───────── 効果音 ─────────

  ui() {
    if (!this._gate('ui', 60)) return;
    this._tone({ type: 'square', f0: 880, f1: 1320, dur: 0.06, gain: 0.05 });
  }

  go() {
    if (!this._gate('go', 300)) return;
    [60, 67, 72].forEach((n, i) => this._tone({ type: 'square', f0: midi(n), dur: 0.1, gain: 0.06, delay: i * 0.07 }));
  }

  /** 加速音（レーン移動の「シュッ」） */
  move(dir, stage) {
    if (!this._gate('move', 35)) return;
    const base = 480 + stage * 60;
    this._tone({ type: 'triangle', f0: base, f1: base * (dir > 0 ? 1.6 : 1.35), dur: 0.07, gain: 0.08 });
    this._noise({ dur: 0.08, gain: 0.04, filter: 'bandpass', f0: 2500, f1: 5000, q: 1.5 });
  }

  wall() {
    if (!this._gate('wall', 80)) return;
    this._tone({ type: 'sine', f0: 180, f1: 110, dur: 0.07, gain: 0.08 });
  }

  crash(stage) {
    if (!this._gate('crash', 50)) return;
    const k = 1 + stage * 0.12;
    this._noise({ dur: 0.42, gain: 0.5, filter: 'lowpass', f0: 4200, f1: 180, q: 0.8 });
    // 爆発：低いドーンと、長く尾を引くゴォォ
    this._noise({ dur: 1.1, gain: 0.42, filter: 'lowpass', f0: 900, f1: 60, q: 0.7, delay: 0.02 });
    this._tone({ type: 'sine', f0: 90, f1: 28, dur: 0.7, gain: 0.5, attack: 0.004 });
    this._tone({ type: 'sine', f0: 160 * k, f1: 38, dur: 0.32, gain: 0.55, attack: 0.002 });
    this._tone({ type: 'square', f0: 620 * k, f1: 150, dur: 0.16, gain: 0.1 });
    // 「速くなった」ことを伝える上昇音
    this._tone({ type: 'sawtooth', f0: 220 * k, f1: 1400 * k, dur: 0.22, gain: 0.05 + Math.min(stage, 4) * 0.01, delay: 0.06, lp: 3000 });
  }

  bump() {
    if (!this._gate('bump', 60)) return;
    this._noise({ dur: 0.1, gain: 0.15, filter: 'bandpass', f0: 1200, q: 1.2 });
    this._tone({ type: 'triangle', f0: 900, f1: 500, dur: 0.06, gain: 0.06 });
  }

  nearMiss(perfect, stage) {
    if (!this._gate('near', 50)) return;
    this._noise({ dur: 0.2, gain: 0.16, filter: 'bandpass', f0: 900, f1: 5200, q: 2 });
    this._tone({ type: 'sine', f0: 1100 + stage * 80, f1: 1900 + stage * 120, dur: 0.1, gain: 0.11 });
    if (perfect) this._tone({ type: 'triangle', f0: midi(96), dur: 0.18, gain: 0.09, delay: 0.06 });
  }

  combo(n) {
    if (!this._gate('combo', 40)) return;
    const i = Math.max(0, n - 2);
    const note = 72 + PENTA[i % PENTA.length] + 12 * Math.min(1, Math.floor(i / PENTA.length));
    this._tone({ type: 'triangle', f0: midi(note), dur: 0.14, gain: 0.08, delay: 0.03 });
  }

  /** スコア加算音（数字がジャラジャラ増える） */
  scoreRoll() {
    if (!this._gate('roll', 300)) return;
    for (let i = 0; i < 10; i++) {
      this._tone({ type: 'square', f0: 1400 + i * 120, dur: 0.035, gain: 0.04, delay: i * 0.04 });
    }
  }

  levelUp() {
    if (!this._gate('level', 200)) return;
    [0, 4, 7, 12].forEach((s, i) => this._tone({ type: 'square', f0: midi(64 + s), dur: 0.12, gain: 0.07, delay: i * 0.07 }));
  }

  chaos() {
    if (!this._gate('chaos', 300)) return;
    this._tone({ type: 'sawtooth', f0: 90, f1: 1800, dur: 0.9, gain: 0.1, lp: 4000 });
    this._noise({ dur: 0.9, gain: 0.16, filter: 'lowpass', f0: 300, f1: 6000 });
    [60, 64, 67, 71].forEach((n) => this._tone({ type: 'triangle', f0: midi(n + 12), dur: 0.6, gain: 0.05, delay: 0.5 }));
  }

  event() {
    if (!this._gate('event', 150)) return;
    [67, 71, 74, 79].forEach((n, i) => this._tone({ type: 'square', f0: midi(n), dur: 0.09, gain: 0.06, delay: i * 0.05 }));
  }

  result() {
    if (!this._gate('result', 300)) return;
    [72, 76, 79, 84].forEach((n, i) => this._tone({ type: 'triangle', f0: midi(n), dur: 0.2, gain: 0.07, delay: i * 0.09 }));
  }

  // ───────── エンジン音（速度でピッチが上がる） ─────────

  engineStart() {
    if (!this.ok || this.engine) return;
    const c = this.ctx;
    // のこぎり波＋少しずらしたのこぎり波（うなり）＋1 オクターブ下の矩形波。LFO で音量をゆらしてゴロゴロさせる
    const o1 = c.createOscillator(); o1.type = 'sawtooth';
    const o3 = c.createOscillator(); o3.type = 'sawtooth';
    const o2 = c.createOscillator(); o2.type = 'square';
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 4;
    const g = c.createGain(); g.gain.value = 0;
    const trem = c.createGain(); trem.gain.value = 1;
    const lfo = c.createOscillator(); lfo.type = 'triangle'; lfo.frequency.value = 9;
    const lfoAmt = c.createGain(); lfoAmt.gain.value = 0.35;
    lfo.connect(lfoAmt); lfoAmt.connect(trem.gain);
    o1.connect(f); o2.connect(f); o3.connect(f); f.connect(trem); trem.connect(g); g.connect(this.sfxBus);
    o1.start(); o2.start(); o3.start(); lfo.start();
    g.gain.setTargetAtTime(0.035, c.currentTime, 0.1);
    this.engine = { o1, o2, o3, lfo, lfoAmt, f, g };
    this.engineSet(1);
  }

  /**
   * speed = 実際の速さの倍率（1 = 最初の速さ）。音の高さは速さに比例して上がり続ける
   * （1 倍で 48Hz のうなり → 10 倍で 480Hz → 50 倍以上で 2.6kHz 近い高音）
   */
  engineSet(speed) {
    if (!this.engine || !this.ctx) return;
    const e = this.engine;
    const t = this.ctx.currentTime;
    const v = Math.max(1, speed);
    const fr = Math.min(48 * v, 2600);
    e.o1.frequency.setTargetAtTime(fr, t, 0.06);
    e.o3.frequency.setTargetAtTime(fr * 1.013, t, 0.06);   // 少しずらして「うなり」
    e.o2.frequency.setTargetAtTime(fr * 0.5, t, 0.06);
    e.f.frequency.setTargetAtTime(Math.min(fr * 5 + 300, 9000), t, 0.06);
    e.lfo.frequency.setTargetAtTime(Math.min(8 + v * 0.8, 45), t, 0.1); // 速いほど細かく震える
    e.lfoAmt.gain.setTargetAtTime(Math.max(0.12, 0.35 - v * 0.006), t, 0.1);
    e.g.gain.setTargetAtTime(Math.min(0.035 + v * 0.0006, 0.06), t, 0.1);
  }

  engineStop() {
    if (!this.engine) return;
    const { o1, o2, o3, lfo, g } = this.engine;
    this.engine = null;
    try {
      const t = this.ctx.currentTime;
      g.gain.setTargetAtTime(0, t, 0.05);
      o1.stop(t + 0.3); o2.stop(t + 0.3); o3.stop(t + 0.3); lfo.stop(t + 0.3);
      o1.onended = () => { try { g.disconnect(); } catch (_) { /* 無視 */ } };
    } catch (_) { /* 無視 */ }
  }

  // ───────── BGM（シンセのループ。ステージでテンポと音数が増える） ─────────

  bgmStart() {
    if (!this.ok || this.sfxOnly || this.bgmOn) return;
    this.bgmOn = true;
    this.step = 0;
    this.nextT = this.ctx.currentTime + 0.06;
    this.bgmTimer = setInterval(() => this._schedule(), 40);
  }

  bgmStop() {
    this.bgmOn = false;
    clearInterval(this.bgmTimer);
    this.bgmTimer = 0;
  }

  _schedule() {
    if (!this.ok) return;
    const c = this.ctx;
    const sp = 60 / (112 + this.stage * 10) / 4; // 16分音符
    if (this.nextT < c.currentTime) this.nextT = c.currentTime + 0.02;
    while (this.nextT < c.currentTime + 0.12) {
      this._bgmStep(this.step, this.nextT);
      this.nextT += sp;
      this.step = (this.step + 1) % 64;
    }
  }

  _bgmStep(s, t) {
    const st = this.stage;
    const bus = this.bgmBus;
    const root = [45, 45, 41, 43][Math.floor(s / 16) % 4];
    if (s % 4 === 0) this._tone({ at: t, type: 'sine', f0: 150, f1: 42, dur: 0.16, gain: 0.45, bus });
    if (st >= 1 && s % 8 === 4) this._noise({ at: t, dur: 0.12, gain: 0.16, filter: 'bandpass', f0: 1800, q: 0.7, bus });
    if (s % 2 === 1) this._noise({ at: t, dur: 0.03, gain: 0.04 + st * 0.01, filter: 'highpass', f0: 7000, bus });
    if (s % 4 === 2 || (st >= 2 && s % 4 === 3)) this._tone({ at: t, type: 'sawtooth', f0: midi(root), dur: 0.11, gain: 0.1, lp: 600 + st * 250, bus });
    if (st >= 1 && s % 2 === 0) {
      const arp = [0, 7, 12, 15, 19, 15, 12, 7];
      this._tone({ at: t, type: 'triangle', f0: midi(root + 24 + arp[(s / 2) % 8]), dur: 0.09, gain: 0.04, bus });
    }
    if (st >= 3 && s % 16 === 0) {
      [12, 16, 19].forEach((n) => this._tone({ at: t, type: 'square', f0: midi(root + 24 + n), dur: 0.3, gain: 0.025, lp: 2500, bus }));
    }
  }
}

export const audio = new AudioEngine();
