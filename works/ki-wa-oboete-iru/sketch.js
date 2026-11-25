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
// 立体にするための色。朱と墨の陰、木口（断面）、樹皮
const SHU_DARK = [142, 44, 30], WALL = [226, 215, 194], ROOF_TOP = [74, 64, 58];
const KOGUCHI = [233, 217, 184], BARK = [74, 58, 46], BARK_LIGHT = [112, 92, 72], NAWA = [176, 150, 96];
const SQ = 0.35;                  // 丸太の上面を斜めから見たときの縦のつぶれ

let paused = false, reducedMotion = false, meter;
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
const MAX_AGE = 1000;             // 千年で断面がいっぱいになる
const SHINBOKU_AGE = 500;         // この樹齢から御神木（注連縄を張る）
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
  // ?age=800 のように付けると、その樹齢から始める（確認・共有用）
  const startAge = Number(new URLSearchParams(location.search).get('age')) || 0;
  for (let i = 0; i < min(startAge, MAX_AGE); i++) addRing();
  document.addEventListener('visibilitychange', updateLoop);
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // ?capture=1（pnpm capture が付ける）のときは止めずに撮らせる
  if (reducedMotion && !new URLSearchParams(location.search).has('capture')) { paused = true; ui.play.html('動かす（スペース）'); }
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
  ui.speed = row('時の速さ（年/秒）', createSlider(0, 60, 8, 1)); // 千年を最速 17 秒ほどで
  ui.core = row('心柱', createCheckbox('', true));
  ui.build = row('組み方', createSelect());
  ui.build.option('木組み（継手・仕口）', 'wood');
  ui.build.option('釘で固める', 'nail');
  ui.build.changed(resetTower);
  const btns = createDiv('').parent(panel).class('row');
  ui.play = createButton('止める（スペース）').parent(btns).class('play').mousePressed(togglePause);
  createButton('地震を起こす').parent(btns).mousePressed(startQuake);
  createButton('建て直す').parent(btns).mousePressed(resetTower);
  createButton('年輪を新しく').parent(btns).mousePressed(resetRings);
  createButton('百年進める').parent(btns).mousePressed(() => { for (let i = 0; i < 100; i++) addRing(); });

  const css = createElement('style', `
    body { flex-direction: column; gap: 10px; }
    #panel { display:flex; flex-wrap:wrap; gap:6px 18px; max-width:min(${W}px, calc(100vw - 32px)); box-sizing:border-box; padding:10px 14px;
      font:13px/1.4 serif; color:#2a2522; background:#e8dfcc; border-radius:4px; }
    #panel .row { display:flex; align-items:center; gap:8px; }
    #panel input[type=range] { width:120px; accent-color:rgb(${SHU}); }
    #panel button, #panel select { font:inherit; padding:3px 10px; background:#f4eee2;
      border:1px solid #2a2522; border-radius:3px; cursor:pointer; }
    #panel button:hover, #panel button.play { background:rgb(${SHU}); color:#fff; border-color:rgb(${SHU}); }
    #panel button:focus-visible, #panel select:focus-visible, #panel input:focus-visible { outline:2px solid rgb(${SHU}); outline-offset:2px; }`);
  css.parent(document.head);
  // 止まっている間にパネルを触ったら、1 枚描き直して変化を見せる
  panel.elt.addEventListener('input', () => { if (!isLooping()) redraw(); });
  panel.elt.addEventListener('click', () => { if (!isLooping()) redraw(); });
}

function startQuake() { quakeTime = 5; }

// 一時停止の切り替え。スペースキー・パネルのボタン・停止中の画面クリックから呼ぶ
function togglePause() {
  paused = !paused;
  ui.play.html(paused ? '動かす（スペース）' : '止める（スペース）');
  updateLoop();
  redraw();
}

function drawPausedVeil() {
  noStroke(); fill(...PAPER, 170);
  rect(0, 0, W, H);
  fill(...INK); textAlign(CENTER, CENTER); textSize(30);
  text('スペースキーで始める', W / 2, H / 2 - 14);
  textSize(14); fill(...INK, 170);
  text('画面のクリックでも始まります', W / 2, H / 2 + 22);
  if (reducedMotion) text('「視差効果を減らす」設定がオンのため、止めた状態で開いています', W / 2, H / 2 + 44);
  textAlign(LEFT, BASELINE);
}

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
  // 止まっているときは、始め方を画面の真ん中で伝える（「視差効果を減らす」設定だと最初から止まる）
  if (paused) drawPausedVeil();

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
  if (age >= MAX_AGE) return;
  age++;
  // 雨の多い年は太く、雪の多い年・嵐の年は細る（平均がほぼ 1 になる係数）
  const w = max(0.3, (1.4 + ui.rain.value() * 2.2 - ui.snow.value() * 0.9 - yearStorm * 0.5 + noise(age * 0.3) * 1.2) / 2.5);
  // 実際の木と同じく、太るほど 1 年の輪は細くなる。千年で断面いっぱいになる曲線（r ∝ 年^0.75）
  const base = 0.75 * RING_MAX / MAX_AGE * pow(age / MAX_AGE, -0.25);
  const r = min(RING_MAX - 2, ringR + base * w);
  const step = r - ringR;
  const cx = rings.width / 2, cy = rings.height / 2;
  const scar = constrain(yearQuake, 0, 3);
  rings.noFill();
  // 晩材（濃い線）。輪が細い老木では線を淡くし、重なって真っ黒にならないようにする
  rings.stroke(...(scar > 0.6 ? SHU : INK), scar > 0.6 ? 200 : map(step, 0.15, 1.2, 8, 110, true) * (0.4 + 1.6 * pow(noise(age * 0.07 + 50), 2)) + yearStorm * 40); // 細い輪ほど淡く、気候の波で濃淡の帯を作る
  rings.strokeWeight(scar > 0.6 ? 1.4 : step < 0.5 ? 0.6 : 0.8);
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

// 心柱の丸太を斜め上から見る。上面が年輪、側面が樹皮。幹は樹齢とともに太く高くなる
const LOG_BASE_Y = 560;           // 丸太の底面の中心
function logShape() {
  const rx = ringR + 5;           // 樹皮の厚みを足す
  const ry = rx * SQ;
  const tall = 40 + ringR * 1.3;
  return { rx, ry, top: LOG_BASE_Y - tall, bottom: LOG_BASE_Y };
}

function drawRings() {
  const { rx, ry, top, bottom } = logShape();
  const cx = RC.x;
  // 地面の影（光が左上なので右へ）
  noStroke(); fill(...INK, 30);
  ellipse(cx + rx * 0.1, bottom + ry * 0.5, rx * 2.0, ry * 1.3); // 千年の太さでも画面の右端からはみ出さない幅

  // 側面（樹皮）。左が明るく右が暗いグラデーションで円柱に見せる
  const ctx = drawingContext;
  const grad = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
  grad.addColorStop(0, `rgb(${BARK_LIGHT})`);
  grad.addColorStop(0.35, `rgb(${BARK})`);
  grad.addColorStop(1, `rgb(${INK})`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(cx - rx, top);
  ctx.lineTo(cx - rx, bottom);
  ctx.ellipse(cx, bottom, rx, ry, 0, PI, 0, true); // 底面の手前側の弧
  ctx.lineTo(cx + rx, top);
  ctx.closePath();
  ctx.fill();
  // 樹皮の縦の割れ目。手前の半周だけ、円柱に沿って間隔が詰まる
  stroke(...INK, 110); strokeWeight(1); noFill();
  for (let k = 1; k < 28; k++) {
    const th = (k / 28) * PI;
    const x0 = cx - rx * cos(th);
    const off = ry * sin(th);
    beginShape();
    for (let s = 0; s <= 6; s++) {
      const y = lerp(top, bottom, s / 6) + off;
      vertex(x0 + (noise(k * 3.1, s * 0.7) - 0.5) * 5 * sin(th), y);
    }
    endShape();
  }

  // 上面（木口）。年輪の画像を縦につぶして貼る
  noStroke(); fill(...KOGUCHI);
  ellipse(cx, top, rx * 2, ry * 2);
  const gw = rings.width; // 年輪の画像は実寸で、上面の楕円にちょうど重なる
  image(rings, cx - gw / 2, top - (gw * SQ) / 2, gw, gw * SQ);
  noFill(); stroke(...BARK); strokeWeight(5);
  ellipse(cx, top, rx * 2, ry * 2);

  if (age >= SHINBOKU_AGE) drawShimenawa(cx, rx, ry, lerp(top, bottom, 0.38));

  noStroke(); fill(...INK); textAlign(CENTER); textSize(15);
  text(`${age >= SHINBOKU_AGE ? '御神木' : '心柱の木'}　樹齢 ${age} 年`, cx, 682);
  textSize(12); fill(...INK, 150);
  text('朱の輪は地震を受けた年。木はその年を覚えている', cx, 700);
}

// 注連縄と紙垂。幹の手前の半周に縄を巻き、白い紙垂を垂らす
function drawShimenawa(cx, rx, ry, y) {
  noFill();
  stroke(...NAWA); strokeWeight(10);
  beginShape();
  for (let s = 0; s <= 24; s++) { const th = (s / 24) * PI; vertex(cx - (rx + 3) * cos(th), y + ry * sin(th)); }
  endShape();
  // 縄のより目
  stroke(...INK, 100); strokeWeight(1);
  for (let s = 1; s < 30; s++) {
    const th = (s / 30) * PI;
    const x = cx - (rx + 3) * cos(th), yy = y + ry * sin(th);
    line(x - 3, yy - 4, x + 3, yy + 4);
  }
  // 紙垂（稲妻形）を 4 枚
  for (let k = 0; k < 4; k++) {
    const th = PI * (0.2 + k * 0.2);
    push();
    translate(cx - (rx + 3) * cos(th) - 8, y + ry * sin(th) + 5);
    fill(255); stroke(...INK, 120); strokeWeight(1);
    beginShape();
    vertex(0, 0); vertex(10, 0); vertex(10, 10); vertex(16, 10); vertex(16, 22); vertex(22, 22); vertex(22, 36);
    vertex(12, 36); vertex(12, 22); vertex(6, 22); vertex(6, 10); vertex(0, 10);
    endShape(CLOSE);
    pop();
  }
}

// --- 五重塔 ----------------------------------------------------------------------
function drawTower() {
  const baseX = 300, groundY = 620, sh = 92;
  // 地面と礎石
  stroke(...INK); strokeWeight(2);
  line(30 + ground.x, groundY, 570 + ground.x, groundY);
  noStroke(); fill(...INK, 40);
  rect(baseX - 80 + ground.x, groundY, 160, 10);
  // 地面に落ちる影。光が左上なので右へ伸び、塔の揺れについていく
  fill(...INK, 28);
  ellipse(baseX + 40 + ground.x + tower.x[STORIES - 1] * 0.4, groundY + 6, 300, 16);

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
    // 立体：右奥へ下がる側面。光は左上から当たるので、側面は陰になる
    const dx = bw * 0.22, dy = -bw * 0.12;
    noStroke();
    fill(...INK, 70);
    quad(bw / 2, -sh + 26, bw / 2 + dx, -sh + 26 + dy, bw / 2 + dx, dy, bw / 2, 0);
    fill(...SHU_DARK);
    quad(bw / 2 + dx - 6, -sh + 26 + dy, bw / 2 + dx, -sh + 26 + dy, bw / 2 + dx, dy, bw / 2 + dx - 6, dy);
    // 正面の壁（塊に見せる）と柱（朱）
    fill(...WALL);
    rect(-bw / 2, -sh + 26, bw, sh - 26);
    fill(...SHU);
    rect(-bw / 2, -sh + 26, 8, sh - 26);
    rect(bw / 2 - 8, -sh + 26, 8, sh - 26);
    // 貫
    stroke(...INK); strokeWeight(1);
    line(-bw / 2, -sh * 0.45, bw / 2, -sh * 0.45);
    // 屋根の上面：前の稜線から奥へ。正面より淡い墨で、面の向きの違いを出す
    noStroke();
    fill(...ROOF_TOP);
    quad(-ew / 2, -sh + 16, 0, -sh + 4, dx, -sh + 4 + dy * 1.6, ew / 2 + dx, -sh + 16 + dy);
    quad(0, -sh + 4, ew / 2, -sh + 16, ew / 2 + dx, -sh + 16 + dy, dx, -sh + 4 + dy * 1.6);
    // 屋根：反りのある深い軒
    fill(...INK);
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
    // 垂木の小口：軒先に並ぶ小さな明るい点で、軒の厚みを見せる
    fill(...PAPER, 150);
    for (let rx = -ew / 2 + 14; rx < ew / 2 - 12; rx += 9) rect(rx, -sh + 22, 3, 2);
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
// 停止中に画面をクリックしたら始める
function mousePressed() {
  if (paused && mouseX >= 0 && mouseX <= W && mouseY >= 0 && mouseY <= H) togglePause();
}

function mouseDragged() {
  if (mouseX < 600 && mouseY < H) dragShake = constrain(dragShake + movedX * 0.8, -40, 40);
}

function keyPressed() {
  if (key === 's') saveCanvas('ki-wa-oboete-iru', 'png');
  if (key === ' ') { togglePause(); return false; }
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
