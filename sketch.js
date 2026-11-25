// グローバルモード。p5 Web Editor や OpenProcessing にそのまま貼っても動く
// キー操作: s = PNG で保存 / スペース = 一時停止・再開 / f = 負荷の表示・非表示

// --- 負荷の設定 -------------------------------------------------------------
const FPS = 30;      // 60 → 30 で描く回数が半分になる。滑らかさが足りなければ上げる
const DENSITY = 1;   // Retina では既定が 2 で、塗る画素が 4 倍になる。書き出しを高精細にしたいときだけ上げる

let paused = false;  // スペースで止めたか
let meter;           // 負荷表示（DOM。キャンバスに文字を描くと、それ自体が負荷になるため）

function setup() {
  pixelDensity(DENSITY);
  frameRate(FPS);
  createCanvas(800, 800);
  colorMode(HSB, 360, 100, 100, 100);
  background(0, 0, 8);
  setupMeter();

  // タブが裏に回ったら止める。ブラウザ任せだと、ウィンドウが隠れているだけでは止まらないことがある
  document.addEventListener('visibilitychange', updateLoop);
  // 「視差効果を減らす」設定では 1 フレームだけ描いて止める
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) paused = true;
  updateLoop();
}

function draw() {
  const started = performance.now();

  background(0, 0, 8, 6);
  noStroke();
  const t = frameCount * 0.02; // FPS を半分にしたぶん、1 フレームの進みを倍にして速さを保つ
  for (let i = 0; i < 12; i++) {
    const a = t + (TWO_PI / 12) * i;
    const r = 220 + 80 * sin(t * 2 + i);
    fill((i * 30 + frameCount * 2) % 360, 70, 95, 80);
    circle(width / 2 + r * cos(a), height / 2 + r * sin(a), 24);
  }

  recordFrame(performance.now() - started);
}

function keyPressed() {
  if (key === 's') saveCanvas('sketch', 'png');
  if (key === ' ') { paused = !paused; updateLoop(); }
  if (key === 'f') meter.hidden = !meter.hidden;
}

// 止める理由（自分で止めた・タブが裏）が 1 つでもあれば止める
function updateLoop() {
  const shouldRun = !paused && document.visibilityState === 'visible';
  if (shouldRun && !isLooping()) loop();
  if (!shouldRun && isLooping()) noLoop();
  if (meter && !shouldRun) meter.textContent = paused ? '一時停止中' : '停止中（タブが裏）';
}

// --- 負荷表示 ---------------------------------------------------------------
// draw() にかかった時間（ms）。1 フレームの持ち時間は 1000 / FPS ms（30fps なら 33ms）
let frameCost = 0;
let frameCount_ = 0;
let lastReport = 0;

function setupMeter() {
  meter = createDiv('').elt;
  meter.style.cssText =
    'position:fixed;left:8px;top:8px;font:12px/1.4 ui-monospace,monospace;' +
    'color:#ccc;background:#000a;padding:4px 8px;border-radius:4px;pointer-events:none';
  meter.hidden = true;
}

function recordFrame(ms) {
  frameCost += ms;
  frameCount_++;
  const now = performance.now();
  if (now - lastReport < 1000) return; // 表示の更新は 1 秒に 1 回だけ
  if (!meter.hidden) {
    const avg = frameCost / frameCount_;
    meter.textContent = `${frameRate().toFixed(0)} fps / 描画 ${avg.toFixed(1)} ms（持ち時間 ${(1000 / FPS).toFixed(0)} ms）`;
  }
  frameCost = 0;
  frameCount_ = 0;
  lastReport = now;
}
