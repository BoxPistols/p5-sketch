// 木は覚えている ― 五重塔と心柱の年輪
// 左: 五重塔。地震・雨・雪・風を受けて揺れる。木組み＋心柱なら倒れず、釘で固めると壊れる
// 右: 心柱の断面。時が経つと年輪が増え、起きた地震や嵐はその年の輪に跡として残る
// キー: s = PNG 保存 / スペース = 一時停止 / f = 負荷表示 / e = 地震
// 塔の上をドラッグすると、手で地面を揺らせる

// --- 負荷の設定 -------------------------------------------------------------
const FPS = 30;
const DENSITY = 1;
const MAX_DROPS = 260;      // 雨・雪の粒の上限。増やすほど重くなる

const W = 1200, H = 720;
const INK = [28, 24, 22], SHU = [196, 62, 42], PAPER = [240, 233, 218];

let paused = false, meter;
let ui = {};

// 塔の状態。各層の横ずれ x と速度 v（地面からの相対）
const STORIES = 5;
let tower;
let ground = { x: 0, v: 0 };
let quakeTime = 0;          // 残りの地震時間（秒）
let dragShake = 0;

// 年輪
let rings, ringR = 6, age = 0, yearClock = 0;
let yearQuake = 0, yearStorm = 0; // その年に受けた揺れと嵐の大きさ
const RING_MAX = 250;
const RC = { x: 900, y: 330 };    // 断面の中心（画面座標）

let drops = [];

function setup() {
  pixelDensity(DENSITY);
  frameRate(FPS);
  createCanvas(W, H);
  textFont('serif');
  rings = createGraphics(RING_MAX * 2 + 20, RING_MAX * 2 + 20);
  rings.pixelDensity(DENSITY);
  resetTower();
  resetRings();
  buildUI();
  setupMeter();
  document.addEventListener('visibilitychange', updateLoop);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) paused = true;
  updateLoop();
}

function resetTower() {
  tower = { x: Array(STORIES).fill(0), v: Array(STORIES).fill(0), damage: 0, fallen: 0 };
}

function resetRings() {
  rings.clear();
  ringR = 6; age = 0;
  // 髄（中心）
  rings.noStroke();
  rings.fill(...INK, 200);
  rings.circle(rings.width / 2, rings.height / 2, 6);
}

// --- 画面の部品（p5 の DOM） --------------------------------------------------
function buildUI() {
  const panel = createDiv('').id('panel');
  const row = (label, el) => {
    const r = createDiv('').parent(panel).class('row');
    createSpan(label).parent(r);
    el.parent(r);
    return el;
  };
  ui.quake = row('地震の強さ', createSlider(0, 1, 0.6, 0.01));
  ui.rain = row('雨', createSlider(0, 1, 0.3, 0.01));
  ui.snow = row('雪', createSlider(0, 1, 0, 0.01));
  ui.wind = row('風', createSlider(-1, 1, 0.2, 0.01));
  ui.speed = row('時の速さ（年/秒）', createSlider(0, 20, 4, 0.5));
  ui.core = row('心柱', createCheckbox('', true));
  ui.build = row('組み方', createSelect());
  ui.build.option('木組み（継手・仕口）', 'wood');
  ui.build.option('釘で固める', 'nail');
  ui.build.changed(resetTower);
  const btns = createDiv('').parent(panel).class('row');
  createButton('地震を起こす').parent(btns).mousePressed(startQuake);
  createButton('建て直す').parent(btns).mousePressed(resetTower);
  createButton('年輪を新しく').parent(btns).mousePressed(resetRings);

  const css = createElement('style', `
    body { flex-direction: column; gap: 10px; }
    #panel { display:flex; flex-wrap:wrap; gap:6px 18px; max-width:${W}px; padding:10px 14px;
      font:13px/1.4 serif; color:#2a2522; background:#e8dfcc; border-radius:4px; }
    #panel .row { display:flex; align-items:center; gap:8px; }
    #panel input[type=range] { width:120px; accent-color:rgb(${SHU}); }
    #panel button, #panel select { font:inherit; padding:3px 10px; background:#f4eee2;
      border:1px solid #2a2522; border-radius:3px; cursor:pointer; }
    #panel button:hover { background:rgb(${SHU}); color:#fff; }`);
  css.parent(document.head);
}

function startQuake() { quakeTime = 5; }

// --- 毎フレーム ----------------------------------------------------------------
function draw() {
  const started = performance.now();
  const dt = 1 / FPS;

  stepGround(dt);
  stepTower(dt);
  stepYears(dt);

  background(...PAPER);
  drawTitle();
  drawWeather();
  drawTower();
  drawRings();

  recordFrame(performance.now() - started);
}

function stepGround(dt) {
  // 地面の揺れ：いくつかの周期を重ね、ノイズで不規則にする
  let target = 0;
  if (quakeTime > 0) {
    quakeTime -= dt;
    const a = ui.quake.value() * 46 * min(1, quakeTime);
    const t = millis() / 1000;
    target = a * (sin(t * 9) * 0.6 + sin(t * 4.1) * 0.4) * (noise(t * 2) * 1.6);
  }
  target += dragShake;
  dragShake *= 0.85;
  ground.v = target - ground.x;
  ground.x = target;
  yearQuake = max(yearQuake, abs(ground.v) * 0.12 + abs(target) * 0.02);
}

function stepTower(dt) {
  const nail = ui.build.value() === 'nail';
  const k = nail ? 420 : 140;            // 釘で固めると硬い
  const c = nail ? 1.2 : 7;              // 木組みは擦れて揺れを吸う
  const core = ui.core.checked();
  const wind = ui.wind.value() * (1 + ui.rain.value() + ui.snow.value());
  const sub = 4;                          // 小刻みに計算して安定させる
  const h = dt / sub;
  for (let s = 0; s < sub; s++) {
    const avg = tower.x.reduce((a, b) => a + b, 0) / STORIES;
    for (let i = 0; i < STORIES; i++) {
      const below = i === 0 ? ground.x : tower.x[i - 1];
      const above = i === STORIES - 1 ? null : tower.x[i + 1];
      let f = -k * (tower.x[i] - below) - c * (tower.v[i] - (i === 0 ? ground.v / dt : tower.v[i - 1]));
      if (above !== null) f += k * (above - tower.x[i]);
      f += wind * 18 * (i + 1) / STORIES;
      // 心柱：各層を全体の平均へ引き寄せ、層ごとの暴れを抑える
      if (core) f += -60 * (tower.x[i] - avg) - 3 * tower.v[i] * 0.5;
      tower.v[i] += f * h;
    }
    for (let i = 0; i < STORIES; i++) tower.x[i] += tower.v[i] * h;
  }
  // 層の間のずれが大きいと傷む。釘はしなれないので傷みやすい
  let drift = 0;
  for (let i = 0; i < STORIES; i++) drift = max(drift, abs(tower.x[i] - (i ? tower.x[i - 1] : ground.x)));
  const limit = nail ? 7 : 22;
  if (drift > limit) tower.damage = min(1, tower.damage + (drift - limit) * (nail ? 0.01 : 0.002));
  if (tower.damage >= 1) tower.fallen = min(1, tower.fallen + dt * 0.6);
}

function stepYears(dt) {
  yearStorm = max(yearStorm, abs(ui.wind.value()) * (ui.rain.value() + ui.snow.value()));
  yearClock += dt * ui.speed.value();
  while (yearClock >= 1) {
    yearClock -= 1;
    addRing();
    yearQuake = 0; yearStorm = 0;
  }
}

// --- 年輪 ----------------------------------------------------------------------
function addRing() {
  if (ringR > RING_MAX - 4) return;
  age++;
  // 雨の多い年は太く、雪の多い年・嵐の年は細る
  const w = 1.4 + ui.rain.value() * 2.2 - ui.snow.value() * 0.9 - yearStorm * 0.5 + noise(age * 0.3) * 1.2;
  const r = ringR + max(0.6, w);
  const cx = rings.width / 2, cy = rings.height / 2;
  const scar = constrain(yearQuake, 0, 3);
  rings.noFill();
  // 晩材（濃い線）
  rings.stroke(...(scar > 0.6 ? SHU : INK), scar > 0.6 ? 200 : 110 + yearStorm * 60);
  rings.strokeWeight(scar > 0.6 ? 1.4 : 0.8);
  rings.beginShape();
  for (let a = 0; a < TWO_PI; a += TWO_PI / 140) {
    const n = noise(cos(a) * 1.3 + 10, sin(a) * 1.3 + 10, r * 0.01);
    const jag = scar > 0.6 ? (noise(a * 9, age) - 0.5) * scar * 4 : 0;
    const rr = r * (0.92 + n * 0.16) + jag;
    rings.vertex(cx + rr * cos(a), cy + rr * sin(a));
  }
  rings.endShape(CLOSE);
  // 地震の年は放射状のひび
  if (scar > 1.2) {
    const a = random(TWO_PI);
    rings.stroke(...SHU, 150);
    rings.line(cx + cos(a) * r * 0.6, cy + sin(a) * r * 0.6, cx + cos(a) * r, cy + sin(a) * r);
  }
  ringR = r;
}

function drawRings() {
  imageMode(CENTER);
  image(rings, RC.x, RC.y);
  imageMode(CORNER);
  noFill();
  stroke(...INK, 60);
  circle(RC.x, RC.y, RING_MAX * 2 + 4);
  noStroke();
  fill(...INK);
  textAlign(CENTER);
  textSize(15);
  text(`心柱の断面　樹齢 ${age} 年`, RC.x, RC.y + RING_MAX + 34);
  textSize(12);
  fill(...INK, 150);
  text('朱の輪は地震を受けた年。木はその年を覚えている', RC.x, RC.y + RING_MAX + 54);
}

// --- 五重塔 ----------------------------------------------------------------------
function drawTower() {
  const baseX = 300, groundY = 620, sh = 92;
  // 地面と礎石
  stroke(...INK); strokeWeight(2);
  line(30 + ground.x, groundY, 570 + ground.x, groundY);
  noStroke(); fill(...INK, 40);
  rect(baseX - 80 + ground.x, groundY, 160, 10);

  const fall = tower.fallen;
  let prevX = ground.x;
  for (let i = 0; i < STORIES; i++) {
    const x = tower.x[i];
    const tilt = atan2(x - prevX, sh) + fall * (i + 1) * 0.12;
    const y = groundY - i * sh + fall * i * sh * 0.55;
    const bw = 110 - i * 12, ew = bw * 1.9;
    push();
    translate(baseX + x, y);
    rotate(tilt);
    // 柱（朱）
    fill(...SHU); noStroke();
    rect(-bw / 2, -sh + 26, 8, sh - 26);
    rect(bw / 2 - 8, -sh + 26, 8, sh - 26);
    // 壁と貫
    stroke(...INK); strokeWeight(1);
    line(-bw / 2, -sh * 0.45, bw / 2, -sh * 0.45);
    // 屋根：反りのある深い軒
    fill(...INK); noStroke();
    beginShape();
    // p5 2.x で bezierVertex の引数が変わったため、反りの点は bezierPoint で自前に打つ
    for (let s = 0; s <= 10; s++) {
      const u = s / 10;
      vertex(bezierPoint(-ew / 2, -ew / 4, -bw / 3, 0, u), bezierPoint(-sh + 16, -sh + 24, -sh + 14, -sh + 4, u));
    }
    for (let s = 1; s <= 10; s++) {
      const u = s / 10;
      vertex(bezierPoint(0, bw / 3, ew / 4, ew / 2, u), bezierPoint(-sh + 4, -sh + 14, -sh + 24, -sh + 16, u));
    }
    vertex(ew / 2 - 6, -sh + 26);
    vertex(-ew / 2 + 6, -sh + 26);
    endShape(CLOSE);
    // 傷み：ひび
    if (tower.damage > 0.2) {
      stroke(...SHU, 255 * tower.damage); strokeWeight(1.5);
      line(-bw / 3, -sh * 0.3, -bw / 6, -sh * 0.1);
      line(bw / 4, -sh * 0.6, bw / 10, -sh * 0.35);
    }
    pop();
    prevX = x;
  }
  // 相輪
  const top = tower.x[STORIES - 1];
  stroke(...INK); strokeWeight(3);
  const ty = groundY - STORIES * sh + 4 + fall * STORIES * sh * 0.55;
  line(baseX + top, ty, baseX + top * 1.1, ty - 70);
  for (let j = 0; j < 6; j++) {
    strokeWeight(1.5);
    const yy = ty - 12 - j * 9;
    line(baseX + top * 1.05 - 8, yy, baseX + top * 1.05 + 8, yy);
  }
  // 心柱（透かして見せる）
  if (ui.core.checked()) {
    stroke(...SHU, 120); strokeWeight(5);
    noFill();
    beginShape();
    vertex(baseX + ground.x, groundY);
    for (let i = 0; i < STORIES; i++) vertex(baseX + tower.x[i], groundY - (i + 1) * sh + fall * i * sh * 0.55);
    endShape();
  }
  // 状態
  noStroke(); fill(...INK); textAlign(LEFT); textSize(13);
  const state = tower.fallen > 0 ? '倒壊' : tower.damage > 0.05 ? `傷み ${(tower.damage * 100).toFixed(0)}%` : '健在';
  text(`五重塔：${state}`, 40, 690);
  fill(...INK, 150);
  text('塔の上を左右にドラッグすると地面を揺らせる', 200, 690);
}

// --- 雨・雪・風 ------------------------------------------------------------------
function drawWeather() {
  const rain = ui.rain.value(), snow = ui.snow.value(), wind = ui.wind.value();
  const want = floor((rain + snow) * MAX_DROPS / 2);
  while (drops.length < want) drops.push(newDrop(random(H)));
  if (drops.length > want) drops.length = want;
  const eaves = eaveLines();
  strokeWeight(1);
  for (const d of drops) {
    if (d.slide) { d.vx *= 1.02; d.vy += 0.3; }
    else { d.vx = wind * (d.snow ? 2.5 : 4) + (d.snow ? sin(frameCount * 0.05 + d.seed) * 0.6 : 0); }
    d.x += d.vx; d.y += d.vy;
    if (!d.slide && d.x < 600) {
      for (const e of eaves) {
        if (d.y > e.y - 4 && d.y < e.y + 4 && d.x > e.x1 && d.x < e.x2) {
          // 深い軒が受けて、外へ流す
          d.slide = true; d.vx = d.x < e.cx ? -2 : 2; d.vy = 0.5; break;
        }
      }
    }
    if (d.y > 620 || d.x < -20 || d.x > W + 20) Object.assign(d, newDrop(-10));
    if (d.snow) { noStroke(); fill(...INK, d.slide ? 60 : 120); circle(d.x, d.y, 3); }
    else { stroke(...(d.slide ? SHU : INK), d.slide ? 160 : 70); line(d.x, d.y, d.x - d.vx, d.y - d.vy * 1.4); }
  }
}

function newDrop(y) {
  const snow = random() < ui.snow.value() / max(0.01, ui.rain.value() + ui.snow.value());
  return { x: random(-100, W), y, vx: 0, vy: snow ? random(1, 2) : random(7, 10), snow, slide: false, seed: random(100) };
}

function eaveLines() {
  const out = [];
  for (let i = 0; i < STORIES; i++) {
    const bw = 110 - i * 12, ew = bw * 1.9, cx = 300 + tower.x[i];
    out.push({ y: 620 - i * 92 - 92 + 14, x1: cx - ew / 2, x2: cx + ew / 2, cx });
  }
  return out;
}

function drawTitle() {
  noStroke(); fill(...INK); textAlign(LEFT); textSize(22);
  text('木は覚えている', 40, 48);
  textSize(12); fill(...INK, 150);
  text('五重塔の柔らかい構造と心柱、そして年輪', 40, 68);
}

// --- 操作 -------------------------------------------------------------------------
function mouseDragged() {
  if (mouseX < 600 && mouseY < H) dragShake = constrain(dragShake + movedX * 0.8, -40, 40);
}

function keyPressed() {
  if (key === 's') saveCanvas('ki-wa-oboete-iru', 'png');
  if (key === ' ') { paused = !paused; updateLoop(); return false; }
  if (key === 'f') meter.hidden = !meter.hidden;
  if (key === 'e') startQuake();
}

function updateLoop() {
  const shouldRun = !paused && document.visibilityState === 'visible';
  if (shouldRun && !isLooping()) loop();
  if (!shouldRun && isLooping()) noLoop();
  if (meter && !shouldRun) meter.textContent = paused ? '一時停止中' : '停止中（タブが裏）';
}

// --- 負荷表示 ---------------------------------------------------------------------
let frameCost = 0, frames = 0, lastReport = 0;

function setupMeter() {
  meter = createDiv('').elt;
  meter.style.cssText =
    'position:fixed;left:8px;top:8px;font:12px/1.4 ui-monospace,monospace;' +
    'color:#ccc;background:#000a;padding:4px 8px;border-radius:4px;pointer-events:none';
  meter.hidden = true;
}

function recordFrame(ms) {
  frameCost += ms; frames++;
  const now = performance.now();
  if (now - lastReport < 1000) return;
  if (!meter.hidden) {
    meter.textContent = `${frameRate().toFixed(0)} fps / 描画 ${(frameCost / frames).toFixed(1)} ms（持ち時間 ${(1000 / FPS).toFixed(0)} ms）`;
  }
  frameCost = 0; frames = 0; lastReport = now;
}
