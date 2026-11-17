// 障害物の種類・描き方・出し方。
// 大きさの単位はレーン幅。sprite に読み込んだ画像を入れると、図形の代わりに画像で描く。
import { CRASH_RACER as C } from '../../config.js';
import { rand, randInt, pick, weightedPick } from '../../utils/random.js';
import { clamp, lerp } from '../../utils/animation.js';

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 上向きに走る車（自車も他の車も同じ形）。中心が原点 */
export function drawCarShape(ctx, w, h, c) {
  if (c.glow) { ctx.shadowColor = c.glow; ctx.shadowBlur = 16; }
  ctx.fillStyle = c.body;
  roundRect(ctx, -w / 2, -h / 2, w, h, w * 0.28);
  ctx.fill();
  ctx.shadowBlur = 0;
  if (c.outline) {
    ctx.lineWidth = Math.max(1.5, w * 0.05);
    ctx.strokeStyle = c.outline;
    ctx.stroke();
  }
  if (c.stripe) {
    ctx.fillStyle = c.stripe;
    ctx.fillRect(-w * 0.08, -h * 0.47, w * 0.16, h * 0.94);
  }
  ctx.fillStyle = c.glass || 'rgba(12,18,32,0.88)';
  roundRect(ctx, -w * 0.36, -h * 0.25, w * 0.72, h * 0.2, w * 0.1); ctx.fill();
  roundRect(ctx, -w * 0.32, h * 0.17, w * 0.64, h * 0.13, w * 0.08); ctx.fill();
  ctx.fillStyle = c.head || '#fff6c2';
  ctx.fillRect(-w * 0.38, -h * 0.47, w * 0.2, h * 0.055);
  ctx.fillRect(w * 0.18, -h * 0.47, w * 0.2, h * 0.055);
  ctx.fillStyle = c.tail || '#ff2d55';
  ctx.fillRect(-w * 0.4, h * 0.41, w * 0.22, h * 0.05);
  ctx.fillRect(w * 0.18, h * 0.41, w * 0.22, h * 0.05);
}

const CAR_COLORS = ['#ff4f9a', '#ff8a3d', '#a46bff', '#4dff9a', '#eef0f5', '#3d8bff'];

export const OBSTACLE_TYPES = {
  car: {
    id: 'car', w: 0.5, h: 0.9, hit: 0.84, own: 0.08, sprite: null,
    draw(ctx, w, h, o) { drawCarShape(ctx, w, h, { body: o.color, stripe: 'rgba(0,0,0,0.18)' }); },
  },
  cone: {
    id: 'cone', w: 0.3, h: 0.34, hit: 0.75, own: 0, sprite: null,
    draw(ctx, w, h) {
      ctx.fillStyle = '#c24a10';
      ctx.fillRect(-w / 2, h * 0.3, w, h * 0.2);
      ctx.fillStyle = '#ff7a1a';
      ctx.beginPath();
      ctx.moveTo(0, -h / 2);
      ctx.lineTo(w * 0.4, h * 0.32);
      ctx.lineTo(-w * 0.4, h * 0.32);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-w * 0.17, -h * 0.06);
      ctx.lineTo(w * 0.17, -h * 0.06);
      ctx.lineTo(w * 0.24, h * 0.08);
      ctx.lineTo(-w * 0.24, h * 0.08);
      ctx.closePath();
      ctx.fill();
    },
  },
  barricade: {
    id: 'barricade', w: 0.8, h: 0.26, hit: 0.88, own: 0, sprite: null,
    draw(ctx, w, h) {
      ctx.fillStyle = '#3a3a44';
      ctx.fillRect(-w * 0.4, -h * 0.1, w * 0.06, h * 0.6);
      ctx.fillRect(w * 0.34, -h * 0.1, w * 0.06, h * 0.6);
      ctx.save();
      roundRect(ctx, -w / 2, -h / 2, w, h * 0.66, 3);
      ctx.clip();
      ctx.fillStyle = '#f4f4f4';
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = '#ff5a1f';
      const step = w * 0.18;
      for (let x = -w / 2 - h; x < w / 2 + h; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, -h / 2);
        ctx.lineTo(x + step * 0.5, -h / 2);
        ctx.lineTo(x + step * 0.5 + h * 0.66, h * 0.16);
        ctx.lineTo(x + h * 0.66, h * 0.16);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(-w * 0.42, -h * 0.5, h * 0.14, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(w * 0.42, -h * 0.5, h * 0.14, 0, Math.PI * 2); ctx.fill();
    },
  },
  debris: {
    id: 'debris', w: 0.38, h: 0.38, hit: 0.78, own: 0, sprite: null,
    draw(ctx, w) {
      ctx.fillStyle = '#121216';
      ctx.beginPath(); ctx.arc(0, 0, w / 2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#555562';
      ctx.lineWidth = w * 0.1;
      ctx.beginPath(); ctx.arc(0, 0, w * 0.32, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#8a8a96';
      ctx.beginPath(); ctx.arc(0, 0, w * 0.12, 0, Math.PI * 2); ctx.fill();
    },
  },
  mover: {
    id: 'mover', w: 0.5, h: 0.9, hit: 0.84, own: 0.05, sprite: null,
    draw(ctx, w, h, o, t) {
      drawCarShape(ctx, w, h, { body: '#ffd23f', stripe: '#1a1a1a' });
      // ゆっくりしたハザードの点滅（1.5Hz）。動く車だとわかるように
      if (Math.sin(t * Math.PI * 3) > 0) {
        ctx.fillStyle = '#ff8c1a';
        ctx.beginPath(); ctx.arc(-w * 0.46, 0, w * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(w * 0.46, 0, w * 0.1, 0, Math.PI * 2); ctx.fill();
      }
    },
  },
  // 取るアイテム（当たっても衝突にならない）
  star: {
    id: 'star', w: 0.56, h: 0.56, hit: 1.15, own: 0, item: true, sprite: null,
    draw(ctx, w, h, o, t) {
      const r = w / 2;
      ctx.rotate(Math.sin(t * 3) * 0.25);
      const s = 1 + Math.sin(t * 9) * 0.08;
      ctx.scale(s, s);
      ctx.shadowColor = '#ffe14d'; ctx.shadowBlur = 22;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5;
        const rr = i % 2 ? r * 0.45 : r;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fillStyle = '#ffe14d'; ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(2, w * 0.06); ctx.strokeStyle = '#ffffff'; ctx.stroke();
      ctx.fillStyle = '#17141a';
      ctx.fillRect(-r * 0.2, -r * 0.18, r * 0.1, r * 0.22);
      ctx.fillRect(r * 0.1, -r * 0.18, r * 0.1, r * 0.22);
    },
  },
  // ライバルカー（動きは crash-racer.js の _updateRival）
  rival: {
    id: 'rival', w: 0.54, h: 0.95, hit: 0.84, own: 0, sprite: null,
    draw(ctx, w, h, o, t) {
      drawCarShape(ctx, w, h, { body: '#1b1b24', stripe: '#ffd23f', outline: '#ff3b6b', glow: '#ff3b6b', head: '#ffffff', tail: '#ff2d55' });
      ctx.fillStyle = '#ffd23f';
      ctx.font = `italic 900 ${(w * 0.42).toFixed(1)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('R', 0, h * 0.06);
      // 車線変更の予告：ゆっくり点滅するウインカー（2.5Hz）
      const r = o.rival;
      if (r && r.blink > 0 && Math.sin(t * Math.PI * 5) > 0) {
        const x = r.toLane > r.lane ? w * 0.48 : -w * 0.48;
        ctx.fillStyle = '#ff9f1a';
        ctx.beginPath(); ctx.arc(x, -h * 0.4, w * 0.11, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x, h * 0.4, w * 0.11, 0, Math.PI * 2); ctx.fill();
      }
    },
  },
};

/** 画像素材に差し替える時に使う： setSprite('car', imageElement) */
export function setSprite(typeId, image) {
  if (OBSTACLE_TYPES[typeId]) OBSTACLE_TYPES[typeId].sprite = image;
}

export function makeObstacle(typeId, lane, y) {
  return {
    type: OBSTACLE_TYPES[typeId],
    x: lane + 0.5,
    y,
    color: typeId === 'car' ? pick(CAR_COLORS) : null,
    knocked: false, passed: false, alpha: 1,
    rot: 0, vx: 0, vy: 0, vr: 0,
    mover: null,
  };
}

/**
 * 障害物を「行」単位で出す。
 * - どの行も最低 1 レーンは空いている
 * - 2 レーンふさぐ行は 2 回までしか続けない、直後は間隔を長めにとる
 * - 動く車は単独で出す（空いているレーンに割り込まないように）
 */
export class RowSpawner {
  constructor(game) {
    this.g = game;
    this.reset();
  }
  reset() {
    this.timer = C.startGrace;
    this.doubleStreak = 0;
    this.lastOpen = 1;
  }
  update(dt) {
    if (this.g.fx.infinite > 0) { this.timer = Math.max(this.timer, 0.5); return; }
    // コンボで速くなるほど障害物も詰めて出す（めまぐるしさ）
    const fast = clamp(Math.sqrt(this.g.comboMul || 1), 1, C.comboSpeed.spawnMax);
    this.timer -= dt * (this.g.fx.star > 0 ? C.star.spawnRate : 1) * fast; // スター中は障害物多め（はね飛ばし放題）
    if (this.timer <= 0) this.timer = this.spawnRow();
  }

  /** 1 行出して、次の行までの秒数を返す */
  spawnRow() {
    const g = this.g;
    const s = g.stageIndex;
    const y = -1.2;
    const add = (o) => g.obstacles.push(o);
    let kind = weightedPick(Object.keys(C.rowWeights).map((k) => [k, C.rowWeights[k][s]]));
    if (kind === 'double' && this.doubleStreak >= 2) kind = 'single';
    if (kind === 'star' && (g.fx.star > 0 || g.obstacles.some((o) => o.type.id === 'star'))) kind = 'single';
    const gap = lerp(C.rowGap.slow, C.rowGap.fast, s / 4) * rand(C.rowGap.jitter[0], C.rowGap.jitter[1]);
    const types = C.singleTypes[s];
    if (kind !== 'double') this.doubleStreak = 0;

    switch (kind) {
      case 'double': {
        const open = clamp(this.lastOpen + randInt(-1, 1), 0, C.lanes - 1);
        for (let l = 0; l < C.lanes; l++) {
          if (l !== open) add(makeObstacle(pick(types), l, y + rand(-0.15, 0.15)));
        }
        this.lastOpen = open;
        this.doubleStreak++;
        return Math.max(gap, C.rowGap.minAfterDouble);
      }
      case 'mover': {
        const a = randInt(0, C.lanes - 2);
        const o = makeObstacle('mover', a, y);
        o.mover = { a, b: a + 1, phase: rand(0, Math.PI * 2), speed: rand(1.6, 2.4) };
        o.x = lerp(a, a + 1, (1 - Math.cos(o.mover.phase)) / 2) + 0.5;
        add(o);
        return gap * 1.15;
      }
      case 'cones': {
        const l = randInt(0, C.lanes - 1);
        add(makeObstacle('cone', l, y));
        add(makeObstacle('cone', l, y - 0.75));
        if (s >= 2 && Math.random() < 0.5) {
          const l2 = l === 1 ? (Math.random() < 0.5 ? 0 : 2) : 1;
          add(makeObstacle('cone', l2, y - 1.6));
        }
        return gap * 1.1;
      }
      case 'star': {
        add(makeObstacle('star', randInt(0, C.lanes - 1), y));
        return gap;
      }
      case 'zigzag': {
        const dir = Math.random() < 0.5 ? 1 : -1;
        for (let i = 0; i < C.lanes; i++) {
          const l = dir > 0 ? i : C.lanes - 1 - i;
          add(makeObstacle(pick(['cone', 'debris', 'car']), l, y - i * 1.6));
        }
        return gap * 1.6;
      }
      default: {
        const l = randInt(0, C.lanes - 1);
        add(makeObstacle(pick(types), l, y));
        return gap;
      }
    }
  }
}
