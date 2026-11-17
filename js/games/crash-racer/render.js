// CRASH RACER の描画。ゲームの状態は読むだけで変えない。
import { CRASH_RACER as C } from '../../config.js';
import { hash01 } from '../../utils/random.js';
import { GAME_FONT, clamp } from '../../utils/animation.js';
import { drawCarShape, roundRect } from './obstacles.js';

export class RacerRenderer {
  constructor(game) {
    this.g = game;
    this.vignette = null;
  }

  onResize() {
    const g = this.g;
    const r = Math.hypot(g.W, g.H) / 2;
    const grad = g.ctx.createRadialGradient(g.W / 2, g.H * 0.6, r * 0.35, g.W / 2, g.H * 0.55, r * 1.05);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.6)');
    this.vignette = grad;
  }

  palette() {
    const g = this.g;
    const s = g.stageIndex;
    const st = C.stages[s];
    let shift = 0;
    if (s === 1 && g.peakLevel >= C.backgroundShiftAt) shift = -30; // 5回目で背景の色が変わる
    const cycle = (st.cycle + (g.fx.chaos > 0 ? 30 : 0)) * g.stim.hueSpeed;
    shift += g.t * cycle;
    const bg = ((st.bg + shift) % 360 + 360) % 360;
    const ed = ((st.edge + shift) % 360 + 360) % 360;
    const ln = ((st.lane + shift) % 360 + 360) % 360;
    return {
      bg: `hsl(${bg},${st.sat}%,8%)`,
      bld: `hsl(${bg},${st.sat + 6}%,15%)`,
      win: `hsla(${ed},100%,70%,0.55)`,
      road: `hsl(${bg},${Math.max(6, st.sat - 10)}%,15%)`,
      edge: `hsl(${ed},100%,60%)`,
      lane: s >= 2 ? `hsl(${ln},100%,72%)` : 'rgba(228,232,242,0.85)',
      grid: `hsla(${ed},100%,60%,0.16)`,
      edgeHue: ed,
      neon: s >= 2,
    };
  }

  draw() {
    const g = this.g;
    const ctx = g.ctx;
    const W = g.W, H = g.H;
    const pal = this.palette();
    const glow = g.quality >= 1;
    ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);

    const sh = g.shake();
    ctx.save();
    ctx.translate(sh.x, sh.y);
    this.drawScenery(pal);
    this.drawRoad(pal, glow);
    this.drawSpeedLines();
    this.drawGiants();
    for (const o of g.obstacles) this.drawObstacle(o);
    this.drawTrail(pal);
    this.drawPlayer(pal, glow);
    this.drawExplosions(glow);
    g.particles.draw(ctx, glow);
    ctx.restore();

    g.texts.draw(ctx, W, H, glow);

    ctx.globalAlpha = 1;
    if (g.stageIndex >= 2 && this.vignette) {
      ctx.globalAlpha = Math.min(1, 0.45 + g.stageIndex * 0.12);
      ctx.fillStyle = this.vignette;
      ctx.fillRect(0, 0, W, H);
    }
    if (g.screenFlash > 0) {
      ctx.globalAlpha = g.screenFlash;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalAlpha = 1;
  }

  /** 道路の両わき：遠くのビル（ゆっくり）と街灯（速い）のパララックス */
  drawScenery(pal) {
    const g = this.g, ctx = g.ctx, H = g.H, L = g.laneW;
    const sides = [[-20, g.roadX - 4], [g.roadX + g.roadW + 4, g.W + 20]];
    if (sides[0][1] - sides[0][0] < 24) return;
    const distPx = g.distance * L;

    // 遠景：ビル
    const sp1 = L * 1.3;
    const d1 = distPx * 0.4;
    const base1 = Math.floor(d1 / sp1);
    const off1 = d1 - base1 * sp1;
    const n1 = Math.ceil(H / sp1) + 2;
    for (let k = -1; k < n1; k++) {
      const id = base1 - k;
      const y = k * sp1 + off1 - sp1;
      for (let si = 0; si < 2; si++) {
        const [x0, x1] = sides[si];
        const w = x1 - x0;
        const h1 = hash01(id * 3 + si * 101);
        const bw = w * (0.35 + h1 * 0.5);
        const bx = si === 0 ? x0 + (w - bw) * hash01(id + 5) * 0.7 : x0 + (w - bw) * (0.3 + hash01(id + 9) * 0.7);
        const bh = sp1 * (0.55 + h1 * 0.35);
        ctx.fillStyle = pal.bld;
        ctx.fillRect(bx, y, bw, bh);
        ctx.fillStyle = pal.win;
        const ww = Math.max(2, bw * 0.14);
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 3; c++) {
            if (hash01(id * 13 + r * 7 + c + si * 31) > 0.55) {
              ctx.fillRect(bx + bw * (0.12 + c * 0.3), y + bh * (0.15 + r * 0.27), ww, ww);
            }
          }
        }
      }
    }

    // 近景：街灯
    const sp2 = L * 2.4;
    const base2 = Math.floor(distPx / sp2);
    const off2 = distPx - base2 * sp2;
    const n2 = Math.ceil(H / sp2) + 2;
    for (let k = -1; k < n2; k++) {
      const y = k * sp2 + off2 - sp2;
      for (let si = 0; si < 2; si++) {
        const lx = si === 0 ? g.roadX - 10 : g.roadX + g.roadW + 10;
        ctx.fillStyle = 'rgba(160,165,185,0.5)';
        ctx.fillRect(lx - 1.5, y, 3, L * 0.5);
        ctx.fillStyle = pal.edge;
        ctx.beginPath();
        ctx.arc(lx, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawRoad(pal, glow) {
    const g = this.g, ctx = g.ctx, H = g.H, L = g.laneW;
    const x0 = g.roadX, w = g.roadW;
    ctx.fillStyle = pal.road;
    ctx.fillRect(x0, -30, w, H + 60);

    const P = L * 1.5;
    const off = (g.distance * L) % P;

    // TURBO 以降：レトロな横線グリッド
    if (pal.neon) {
      ctx.fillStyle = pal.grid;
      for (let y = off - P; y < H + 30; y += P / 2) ctx.fillRect(x0, y, w, 2);
    }

    // 道路の端（ネオン）
    if (glow && pal.neon) { ctx.shadowColor = pal.edge; ctx.shadowBlur = 14; }
    ctx.fillStyle = pal.edge;
    ctx.fillRect(x0 - 4, -30, 4, H + 60);
    ctx.fillRect(x0 + w, -30, 4, H + 60);
    ctx.shadowBlur = 0;

    // 車線の破線。速いほど長く伸びて、INFINITE ROAD 中は1本の線になる
    ctx.fillStyle = pal.lane;
    const continuous = g.fx.infinite > 0;
    const dash = continuous ? P : clamp(L * 0.55 + g.scrollSpeed * L * 0.05, L * 0.55, P * 0.92);
    for (let i = 1; i < C.lanes; i++) {
      const x = x0 + i * L - 2;
      if (continuous) { ctx.fillRect(x, -30, 4, H + 60); continue; }
      for (let y = off - P; y < H + 30; y += P) ctx.fillRect(x, y, 4, dash);
    }
  }

  drawSpeedLines() {
    const g = this.g, ctx = g.ctx;
    if (!g.lines.length) return;
    ctx.strokeStyle = '#ffffff';
    for (const l of g.lines) {
      ctx.globalAlpha = l.a;
      ctx.lineWidth = l.w;
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(l.x, l.y + l.len);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawGiants() {
    const g = this.g, ctx = g.ctx;
    if (!g.giants.length) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = g.stim.giantAlpha;
    for (const gi of g.giants) {
      ctx.font = `italic 900 ${gi.size}px ${GAME_FONT}`;
      ctx.fillStyle = gi.color;
      ctx.fillText(gi.text, gi.x, gi.y);
    }
    ctx.restore();
  }

  /** 爆発：煙 → 火の玉 → 火のかたまり → 衝撃波の輪（g.explosions は crash-racer.js が足す） */
  drawExplosions(glow) {
    const g = this.g, ctx = g.ctx;
    if (!g.explosions.length) return;
    const easeOut = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
    ctx.save();
    for (const e of g.explosions) {
      const t = e.age / e.life;
      const R = e.R;
      // 煙（ふつうの合成）
      ctx.globalCompositeOperation = 'source-over';
      for (const p of e.puffs) {
        const d = p.d * R * easeOut(e.age / 0.5);
        const x = e.x + Math.cos(p.a) * d, y = e.y + Math.sin(p.a) * d - e.age * R * 0.6;
        const r = R * p.r * (0.5 + t * 0.9);
        ctx.globalAlpha = 0.5 * (1 - t);
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      if (glow) ctx.globalCompositeOperation = 'lighter';
      // 火の玉
      const ft = e.age / 0.55;
      if (ft < 1) {
        const r = R * (0.35 + 0.75 * easeOut(e.age / 0.16));
        const grd = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
        grd.addColorStop(0, '#ffffff');
        grd.addColorStop(0.25, '#fff2a8');
        grd.addColorStop(0.5, '#ffb11a');
        grd.addColorStop(0.78, 'rgba(255,72,20,0.85)');
        grd.addColorStop(1, 'rgba(255,40,20,0)');
        ctx.globalAlpha = 1 - ft * ft;
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.fill();
      }
      // 外へ飛ぶ火のかたまり
      for (const b of e.blobs) {
        const d = b.d * R * easeOut(e.age / 0.4);
        const r = R * b.r * Math.max(0, 1 - t * 1.3);
        if (r <= 0.5) continue;
        ctx.globalAlpha = Math.max(0, 1 - t * 1.2);
        ctx.fillStyle = b.c;
        ctx.beginPath(); ctx.arc(e.x + Math.cos(b.a) * d, e.y + Math.sin(b.a) * d, r, 0, Math.PI * 2); ctx.fill();
      }
      // 衝撃波の輪
      const st = e.age / 0.42;
      if (st < 1) {
        ctx.globalAlpha = (1 - st) * 0.9;
        ctx.strokeStyle = st < 0.3 ? '#ffffff' : '#ffcf5a';
        ctx.lineWidth = Math.max(1.5, R * 0.2 * (1 - st));
        ctx.beginPath(); ctx.arc(e.x, e.y, R * (0.4 + 2.8 * easeOut(st)), 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawObstacle(o) {
    const g = this.g, ctx = g.ctx, L = g.laneW, T = o.type;
    const w = T.w * L, h = T.h * L;
    const cx = g.roadX + o.x * L, cy = o.y * L;
    if (cy < -h || cy > g.H + h) return;
    ctx.save();
    ctx.translate(cx, cy);
    if (o.rot) ctx.rotate(o.rot);
    ctx.globalAlpha = Math.max(0, o.alpha);
    if (T.sprite && T.sprite.complete && T.sprite.naturalWidth) ctx.drawImage(T.sprite, -w / 2, -h / 2, w, h);
    else T.draw(ctx, w, h, o, g.t);
    ctx.restore();
  }

  /** 残像。少し前の横位置を、下にずらして重ねる */
  drawTrail(pal) {
    const g = this.g, ctx = g.ctx, L = g.laneW;
    const n = Math.round(C.trail[g.stageIndex] * g.fxl.trail * (g.quality === 0 ? 0.5 : 1));
    if (n <= 0) return;
    const w = C.player.w * L, h = C.player.h * L;
    const hist = g.history;
    const stepY = L * (0.14 + 0.04 * g.stageIndex);
    for (let i = n; i >= 1; i--) {
      const idx = hist.length - 1 - i * 2;
      if (idx < 0) continue;
      const cx = g.roadX + hist[idx] * L;
      const cy = g.playerY * L + i * stepY;
      ctx.globalAlpha = (1 - i / (n + 1)) * 0.35;
      ctx.fillStyle = g.stageIndex >= 3 ? `hsl(${(pal.edgeHue + i * 32) % 360},100%,60%)` : pal.edge;
      roundRect(ctx, cx - w / 2, cy - h / 2, w, h, w * 0.28);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawPlayer(pal, glow) {
    const g = this.g, ctx = g.ctx, L = g.laneW;
    const w = C.player.w * L, h = C.player.h * L;
    const cx = g.roadX + g.playerX * L, cy = g.playerY * L;
    ctx.save();
    ctx.translate(cx, cy);

    // 派手になってきたら、自車の周りを少し暗くして見失わないようにする
    if (g.stageIndex >= 2) {
      const r = h * 1.1;
      const sp = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
      sp.addColorStop(0, 'rgba(0,0,0,0.55)');
      sp.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sp;
      ctx.fillRect(-r, -r, r * 2, r * 2);
    }

    ctx.rotate(g.wrecked ? g.wreckSpin : clamp(g.tilt, -0.4, 0.4)); // 大クラッシュ中はくるくる回る
    if (g.wrecked) ctx.globalAlpha = Math.max(0.15, g.wreckTimer / C.hp.wreckTime);
    if (g.wrecked) {
      // 何もしない（オーラ・無敵の輪は出さない）
    } else if (g.fx.star > 0) {
      // スター中：虹色のオーラ（色が回るだけで点滅はしない）。残り 2 秒で薄くなっていく
      const k = Math.min(1, g.fx.star / 2);
      const hue = (g.t * 240) % 360;
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.45 * k;
      ctx.shadowColor = `hsl(${hue},100%,60%)`;
      ctx.shadowBlur = 24;
      ctx.lineWidth = 4;
      ctx.strokeStyle = `hsl(${hue},100%,65%)`;
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 1.0, h * 0.75, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (g.invincible > 0) {
      ctx.globalAlpha = g.stim.blink ? 0.6 + 0.4 * Math.cos(g.t * Math.PI * 3) ** 2 /* 3Hz のゆるい明滅 */ : 0.75;
      ctx.strokeStyle = pal.edge;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.9, h * 0.68, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    drawCarShape(ctx, w, h, {
      body: '#29e7ff', stripe: '#0b4f66', glass: 'rgba(6,24,40,0.9)',
      outline: g.stageIndex >= 3 ? '#ffffff' : null,
      glow: glow ? '#29e7ff' : null,
    });
    if (g.whiteFlash > 0) {
      ctx.globalAlpha = g.whiteFlash;
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, -w / 2, -h / 2, w, h, w * 0.28);
      ctx.fill();
    }
    ctx.restore();
  }
}
