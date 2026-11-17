// ゲーム中の数字表示（DOM）。文字が変わった時だけ書き換える。
import { damp, formatInt } from './utils/animation.js';

const STAGE_SCALE = [1, 1.05, 1.1, 1.14, 1.18]; // ステージが上がるとスコアが大きくなる

export class Hud {
  constructor(root) {
    this.root = root;
    const q = (s) => root.querySelector(s);
    this.el = {
      title: q('.hud-title'), score: q('.hud-score'), speed: q('.hud-speed-num'),
      mult: q('.hud-mult'), combo: q('.hud-combo'), fx: q('.hud-fx'),
      hp: q('.hud-hp-num'), hpBox: q('.hud-hp'), hpBar: q('.hud-hp-bar i'),
    };
    this.reset();
  }

  reset(title) {
    if (title) this.el.title.textContent = title;
    this.shown = 0;
    this.cache = {};
    this.bumpS = 0;
    this.comboS = 0;
    this.lastCombo = 0;
    this.root.dataset.stage = '0';
    this.el.score.style.fontSize = '';
    this.el.score.style.transform = '';
    this.el.combo.classList.remove('show');
    this._set('score', '0');
    this._set('fx', '');
    this.el.hpBox.classList.remove('hit');
  }

  _set(key, text) {
    if (this.cache[key] === text) return;
    this.cache[key] = text;
    this.el[key].textContent = text;
  }

  bump(amount) { this.bumpS = Math.min(0.28, this.bumpS + amount); }

  update(s, dt) {
    // 数字はすぐに追いつく速さで増やす（弾む演出は bump）
    this.shown = s.score - this.shown < 1 ? s.score : s.score - (s.score - this.shown) * Math.exp(-12 * dt);
    const txt = formatInt(this.shown);
    this._set('score', txt);
    const len = txt.length;
    // 桁が増えても枠からはみ出さない（幅の目安：1文字 ≒ 0.68em）
    const room = Math.max(120, this.el.score.parentElement.clientWidth || 240);
    const fs = len <= 6 ? '' : `${Math.max(14, Math.min(34, room / (len * 0.68 * 1.3)))}px`;
    if (this.cache.fs !== fs) { this.cache.fs = fs; this.el.score.style.fontSize = fs; }

    this.bumpS = damp(this.bumpS, 0, 9, dt);
    const sc = (STAGE_SCALE[s.stage] || 1) * (1 + this.bumpS);
    const tf = `scale(${sc.toFixed(3)})`;
    if (this.cache.tf !== tf) { this.cache.tf = tf; this.el.score.style.transform = tf; }

    this._set('speed', formatInt(s.kmh));
    this._set('mult', `x${s.mult.toFixed(1)}`);

    if (s.combo !== this.lastCombo) {
      if (s.combo > this.lastCombo) this.comboS = 0.4;
      this.lastCombo = s.combo;
      this.el.combo.classList.toggle('show', s.combo >= 2);
    }
    this._set('combo', `コンボ ${s.combo}`);
    this.comboS = damp(this.comboS, 0, 10, dt);
    const ct = `scale(${(1 + this.comboS).toFixed(3)})`;
    if (this.cache.ct !== ct) { this.cache.ct = ct; this.el.combo.style.transform = ct; }

    const st = String(s.stage);
    if (this.root.dataset.stage !== st) this.root.dataset.stage = st;
    this._set('fx', s.fx || '');

    // HP バー（減ると緑 → 黄 → 赤）
    if (s.hpMax) {
      const hp = Math.max(0, s.hp);
      if (this.cache.hpv !== hp) {
        if (this.cache.hpv !== undefined && hp < this.cache.hpv) {
          this.el.hpBox.classList.remove('hit');
          void this.el.hpBox.offsetWidth;
          this.el.hpBox.classList.add('hit');
        }
        this.cache.hpv = hp;
        const k = hp / s.hpMax;
        this.el.hpBar.style.transform = `scaleX(${k.toFixed(3)})`;
        this.el.hpBox.style.setProperty('--hp-color', k > 0.5 ? '#4dff9a' : k > 0.2 ? '#ffe14d' : '#ff4a3d');
      }
      this._set('hp', `HP ${hp}`);
    }
  }
}
