// 補間・イージング・文字演出
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
/** フレームレートに依存しない指数的な追従 */
export const damp = (cur, target, rate, dt) => target + (cur - target) * Math.exp(-rate * dt);
export const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

export function formatInt(n) {
  return Math.floor(Math.max(0, n)).toLocaleString('en-US');
}

export const GAME_FONT = '"Futura","Avenir Next Condensed","Arial Black","Impact","Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic UI","Meiryo",system-ui,sans-serif';

/** 飛び出す数字（popup）と画面中央の大きな文字（banner） */
export class TextFx {
  constructor() { this.items = []; }
  clear() { this.items.length = 0; }

  popup(text, x, y, { color = '#fff', size = 22, life = 0.9, vy = -70 } = {}) {
    if (this.items.length > 40) this.items.shift();
    this.items.push({ kind: 'popup', text, x, y, color, size, life, max: life, vy });
  }

  banner(text, { color = '#fff', size = 1, life = 1.6, y = 0.36 } = {}) {
    const stacked = this.items.filter((it) => it.kind === 'banner').length;
    this.items.push({ kind: 'banner', text, color, size, life, max: life, y: y + stacked * 0.085 });
  }

  update(dt) {
    const it = this.items;
    for (let i = it.length - 1; i >= 0; i--) {
      const p = it[i];
      p.life -= dt;
      if (p.life <= 0) { it.splice(i, 1); continue; }
      if (p.kind === 'popup') { p.y += p.vy * dt; p.vy *= Math.exp(-2.5 * dt); }
    }
  }

  draw(ctx, W, H, glow) {
    if (!this.items.length) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const unit = Math.min(W, 520) / 390;
    for (const p of this.items) {
      const age = p.max - p.life;
      const alpha = p.life < 0.3 ? p.life / 0.3 : 1;
      let scale, size, x, y;
      if (p.kind === 'popup') {
        scale = age < 0.18 ? 0.4 + 0.6 * easeOutBack(age / 0.18) : 1;
        size = p.size * unit * scale;
        x = p.x; y = p.y;
      } else {
        scale = age < 0.22 ? easeOutBack(age / 0.22) : 1 + (age - 0.22) * 0.06;
        size = 46 * p.size * unit * Math.max(0.01, scale);
        x = W / 2; y = H * p.y;
      }
      ctx.font = `italic 900 ${size.toFixed(1)}px ${GAME_FONT}`;
      const w = ctx.measureText(p.text).width;
      if (p.kind === 'banner' && w > W * 0.92) {
        size *= (W * 0.92) / w;
        ctx.font = `italic 900 ${size.toFixed(1)}px ${GAME_FONT}`;
      } else if (p.kind === 'popup') {
        x = clamp(x, w / 2 + 6, W - w / 2 - 6);
      }
      ctx.globalAlpha = alpha;
      ctx.lineWidth = Math.max(3, size * 0.16);
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(p.text, x, y);
      if (glow && p.kind === 'banner') { ctx.shadowColor = p.color; ctx.shadowBlur = 18; }
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, x, y);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }
}
