// 粒子。オブジェクトを使い回し（プール）、上限 cap を超えて増やさない。
import { rand, pick } from './random.js';

export class ParticleSystem {
  constructor() {
    this.items = [];
    this.pool = [];
    this.cap = 300;
  }
  setCap(n) { this.cap = Math.max(20, n | 0); }
  clear() { while (this.items.length) this.pool.push(this.items.pop()); }
  get count() { return this.items.length; }

  spawn() {
    if (this.items.length >= this.cap) return null;
    const p = this.pool.pop() || {};
    p.x = 0; p.y = 0; p.vx = 0; p.vy = 0; p.g = 0; p.drag = 0;
    p.life = 0.6; p.max = 0.6; p.size = 3; p.color = '#fff'; p.shape = 'dot';
    p.rot = 0; p.vr = 0; p.follow = 0; p.add = false;
    this.items.push(p);
    return p;
  }

  /**
   * まとめて出す。
   * opt: angle(なしなら全方向), spread, speed[min,max], life[min,max], size[min,max],
   *      colors[], shape('dot'|'square'|'spark'|'confetti'), gravity, drag, follow(道路と一緒に流れる割合), additive, jitter
   */
  burst(n, x, y, opt) {
    for (let i = 0; i < n; i++) {
      const p = this.spawn();
      if (!p) return;
      const a = opt.angle != null ? opt.angle + rand(-(opt.spread || 0), opt.spread || 0) : rand(0, Math.PI * 2);
      const sp = rand(opt.speed[0], opt.speed[1]);
      const j = opt.jitter || 0;
      p.x = x + rand(-j, j);
      p.y = y + rand(-j, j);
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.life = p.max = rand(opt.life[0], opt.life[1]);
      p.size = rand(opt.size[0], opt.size[1]);
      p.color = pick(opt.colors);
      p.shape = opt.shape || 'dot';
      p.g = opt.gravity || 0;
      p.drag = opt.drag || 0;
      p.follow = opt.follow || 0;
      p.vr = rand(-12, 12);
      p.add = !!opt.additive;
    }
  }

  update(dt, scrollPx) {
    const it = this.items;
    for (let i = it.length - 1; i >= 0; i--) {
      const p = it[i];
      p.life -= dt;
      if (p.life <= 0) {
        it[i] = it[it.length - 1];
        it.pop();
        this.pool.push(p);
        continue;
      }
      if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += (p.vy + scrollPx * p.follow) * dt;
      p.rot += p.vr * dt;
    }
  }

  draw(ctx, allowAdditive) {
    if (!this.items.length) return;
    ctx.save();
    // 通常の粒子 → 加算合成の粒子の順に描く（合成モードの切り替えを2回で済ませる）
    for (let pass = 0; pass < 2; pass++) {
      const additive = pass === 1;
      if (additive) {
        if (!allowAdditive) break;
        ctx.globalCompositeOperation = 'lighter';
      }
      for (const p of this.items) {
        if (p.add !== additive && allowAdditive) continue;
        if (!allowAdditive && pass === 1) continue;
        const a = p.life / p.max;
        ctx.globalAlpha = a;
        switch (p.shape) {
          case 'spark': {
            ctx.strokeStyle = p.color;
            ctx.lineWidth = p.size;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045);
            ctx.stroke();
            break;
          }
          case 'square':
          case 'confetti': {
            const s = p.size;
            ctx.fillStyle = p.color;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            if (p.shape === 'confetti') ctx.fillRect(-s / 2, -s * 0.3 * Math.abs(Math.cos(p.rot * 1.3)) - 0.5, s, s * 0.6 * Math.abs(Math.cos(p.rot * 1.3)) + 1);
            else ctx.fillRect(-s / 2, -s / 2, s, s);
            ctx.restore();
            break;
          }
          default: {
            const s = p.size * (0.4 + 0.6 * a);
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
          }
        }
      }
    }
    ctx.restore();
  }
}
