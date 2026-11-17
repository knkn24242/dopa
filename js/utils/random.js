export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;

/** [[値, 重み], ...] から重みつきで 1 つ選ぶ */
export function weightedPick(entries) {
  let total = 0;
  for (const [, w] of entries) total += Math.max(0, w);
  if (total <= 0) return entries[0][0];
  let r = Math.random() * total;
  for (const [v, w] of entries) {
    r -= Math.max(0, w);
    if (r < 0) return v;
  }
  return entries[entries.length - 1][0];
}

/** 直近 memory 回と同じものを選ばない */
export class NoRepeatPicker {
  constructor(items, memory = 2) {
    this.items = items;
    this.memory = memory;
    this.recent = [];
  }
  next(filter = () => true) {
    let pool = this.items.filter((it) => filter(it) && !this.recent.includes(it));
    if (!pool.length) pool = this.items.filter(filter);
    if (!pool.length) pool = this.items;
    const it = pick(pool);
    this.recent.push(it);
    while (this.recent.length > this.memory) this.recent.shift();
    return it;
  }
}

/** 整数 → 0〜1 の決まった乱数（背景の建物などを毎フレーム同じ形で描くため） */
export function hash01(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
