// 振動（Navigator Vibration API）。iPhone の Safari など非対応の端末では何もしない。
let enabled = true;
let lastNear = 0;

function pulse(pattern) {
  if (!enabled) return;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
  } catch (_) { /* 非対応 */ }
}

export const vibration = {
  setEnabled(v) { enabled = !!v; },
  pulse,
  crash() { pulse(35); },
  nearMiss() {
    const now = performance.now();
    if (now - lastNear < 120) return;
    lastNear = now;
    pulse(10);
  },
  chaos() { pulse([60, 40, 90]); },
};
