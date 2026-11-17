// 画面の切り替え・設定画面・記録・PWA 登録。
import { store } from './settings.js';
import { audio } from './audio.js';
import { vibration } from './vibration.js';
import { GameManager, registerGame, listGames } from './game-manager.js';
import { Hud } from './hud.js';
import { crashRacer } from './games/crash-racer.js';
import { formatInt, easeOutCubic } from './utils/animation.js';
import { pick } from './utils/random.js';

registerGame(crashRacer);
// 新しいゲームはここに registerGame(...) を足す

const $ = (id) => document.getElementById(id);
const screens = {
  home: $('screen-home'),
  settings: $('screen-settings'),
  game: $('screen-game'),
  result: $('screen-result'),
};
let current = 'home';
let lastGameId = crashRacer.id;

const hud = new Hud($('hud'));
const manager = new GameManager({
  canvas: $('game-canvas'), hud, audio, vibration, getSettings: () => store.settings,
});
manager.onRequestFinish = () => finish(); // HP が 0 になって大クラッシュした時

function show(name) {
  for (const [k, el] of Object.entries(screens)) el.classList.toggle('is-active', k === name);
  current = name;
  if (name === 'home') refreshHome();
  if (name === 'settings') refreshSettings();
}

function applySettings() {
  const s = store.settings;
  audio.applySettings(s);
  vibration.setEnabled(s.vibrationEnabled);
  manager.applySettings(s);
}

// 最初の操作で音を使えるようにする（自動再生制限）
const unlock = () => { audio.unlock(); audio.applySettings(store.settings); };
window.addEventListener('pointerdown', unlock, true);
window.addEventListener('keydown', unlock, true);

// ───────── ゲーム ─────────

function play(id) {
  lastGameId = id;
  $('pause-overlay').hidden = true;
  show('game');
  manager.start(id);
  const hint = $('hint');
  hint.classList.remove('show');
  void hint.offsetWidth; // アニメーションを最初から
  hint.classList.add('show');
}

function pause() {
  if (current !== 'game' || !manager.running || manager.paused) return;
  manager.pause();
  $('pause-overlay').hidden = false;
}

function resume() {
  $('pause-overlay').hidden = true;
  manager.resume();
}

function finish() {
  const r = manager.finish();
  $('pause-overlay').hidden = true;
  if (!r) { show('home'); return; }
  const prevBest = saveRecord(lastGameId, r);
  showResult(r, prevBest);
}

function goHome() {
  manager.stop();
  $('pause-overlay').hidden = true;
  show('home');
}

function saveRecord(id, r) {
  const rec = store.record(id);
  const prev = rec.highScore || 0;
  rec.highScore = Math.max(prev, r.score);
  rec.highestSpeed = Math.max(rec.highestSpeed || 0, r.highestSpeed);
  rec.totalCrashes = (rec.totalCrashes || 0) + r.crashes;
  rec.totalNearMisses = (rec.totalNearMisses || 0) + r.nearMisses;
  rec.maxCombo = Math.max(rec.maxCombo || 0, r.maxCombo);
  rec.plays = (rec.plays || 0) + 1;
  store.persist();
  return prev;
}

let countRaf = 0;
function showResult(r, prevBest) {
  $('r-speed').textContent = `${formatInt(r.highestSpeed)} km/h`;
  $('r-crashes').textContent = formatInt(r.crashes);
  $('r-near').textContent = formatInt(r.nearMisses);
  $('r-combo').textContent = formatInt(r.maxCombo);
  const wreck = $('r-wreck');
  wreck.hidden = !r.wrecked;
  if (r.wrecked) wreck.textContent = `大クラッシュ！ ${formatInt(r.hits)} 回ぶつかった`;
  const best = $('r-best');
  if (r.score > prevBest && r.score > 0) {
    best.textContent = 'ベスト更新！';
    best.classList.add('is-new');
  } else {
    best.textContent = `ベスト ${formatInt(prevBest)}`;
    best.classList.remove('is-new');
  }
  show('result');
  audio.result();
  // スコアを 0.7 秒で数え上げる
  cancelAnimationFrame(countRaf);
  const el = $('r-score');
  const t0 = performance.now();
  const stepFn = (now) => {
    const k = Math.min(1, (now - t0) / 700);
    el.textContent = formatInt(r.score * easeOutCubic(k));
    if (k < 1) countRaf = requestAnimationFrame(stepFn);
  };
  countRaf = requestAnimationFrame(stepFn);
  // 描画が止まっている環境でも最終値は必ず出す
  setTimeout(() => { cancelAnimationFrame(countRaf); el.textContent = formatInt(r.score); }, 800);
}

// ───────── ホーム・設定 ─────────

function refreshHome() {
  $('home-best').textContent = formatInt(store.record('crashRacer').highScore);
}

function refreshSettings() {
  const s = store.settings;
  document.querySelectorAll('[data-toggle]').forEach((b) => b.setAttribute('aria-pressed', String(!!s[b.dataset.toggle])));
  document.querySelectorAll('[data-seg]').forEach((seg) => {
    seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === s[seg.dataset.seg])));
  });
  document.querySelectorAll('[data-range]').forEach((input) => {
    const key = input.dataset.range;
    input.value = String(s[key] * Number(input.dataset.scale));
    updateRangeOutput(key);
  });
  const rec = store.record('crashRacer');
  $('rec-highScore').textContent = formatInt(rec.highScore);
  $('rec-highestSpeed').textContent = `${formatInt(rec.highestSpeed)} km/h`;
  $('rec-totalCrashes').textContent = formatInt(rec.totalCrashes);
  $('rec-totalNearMisses').textContent = formatInt(rec.totalNearMisses);
}

function updateRangeOutput(key) {
  const out = $(`out-${key}`);
  if (!out) return;
  const v = store.settings[key];
  out.textContent = key === 'soundVolume' ? `${Math.round(v * 100)}%` : v.toFixed(1);
}

document.addEventListener('click', (e) => {
  const toggle = e.target.closest('[data-toggle]');
  if (toggle) {
    const key = toggle.dataset.toggle;
    store.set(key, !store.settings[key]);
    applySettings();
    refreshSettings();
    audio.ui();
    if (key === 'vibrationEnabled' && store.settings.vibrationEnabled) vibration.pulse(30);
    return;
  }
  const segBtn = e.target.closest('[data-seg] button');
  if (segBtn) {
    store.set(segBtn.parentElement.dataset.seg, segBtn.dataset.value);
    applySettings();
    refreshSettings();
    audio.ui();
    return;
  }
  const b = e.target.closest('[data-action]');
  if (!b) return;
  audio.ui();
  switch (b.dataset.action) {
    case 'play': play(crashRacer.id); break;
    case 'random': play(pick(listGames()).id); break; // 今は CRASH RACER だけ
    case 'settings': show('settings'); break;
    case 'home': goHome(); break;
    case 'pause': pause(); break;
    case 'resume': resume(); break;
    case 'finish': finish(); break;
    case 'again': play(lastGameId); break;
    case 'reset-records':
      if (window.confirm('クラッシュレーサーの記録を 0 に戻しますか？（元に戻せません）')) {
        store.resetRecords('crashRacer');
        refreshSettings();
      }
      break;
    default: break;
  }
});

document.addEventListener('input', (e) => {
  const input = e.target.closest('[data-range]');
  if (!input) return;
  const key = input.dataset.range;
  store.set(key, Number(input.value) / Number(input.dataset.scale));
  applySettings();
  updateRangeOutput(key);
  if (key === 'soundVolume') audio.ui();
});

// ───────── キーボード・画面の状態 ─────────

window.addEventListener('keydown', (e) => {
  if (current === 'game') {
    if (e.code === 'Escape' || e.code === 'KeyP') {
      e.preventDefault();
      if (manager.paused) resume(); else pause();
    } else if (manager.paused && (e.code === 'Space' || e.code === 'Enter')) {
      e.preventDefault();
      resume();
    }
  } else if (current === 'result' && e.code === 'Enter') {
    play(lastGameId);
  }
});

// アプリを離れたら一時停止し、戻ってきたら再開ボタンを押してもらう
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pause();
    audio.suspend();
  } else {
    audio.resume();
  }
});
window.addEventListener('pagehide', pause);

// ゲーム画面でのスクロール・拡大・長押しメニューを防ぐ
screens.game.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => { if (current === 'game') e.preventDefault(); });

// ───────── 起動 ─────────

applySettings();
show('home');

// PWA（https か localhost の時だけ使える）
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => { /* なくても遊べる */ });
  });
}

// 動作確認用（ブラウザのコンソールから状態を見る）
window.__dopa = { manager, store };
