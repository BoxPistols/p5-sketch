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
const AI = [43, 75, 111], OUDO = [214, 198, 158], KASUMI = [246, 238, 222], LATEWOOD = [176, 142, 98];
let backdrop;
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
let rings, ringR = 6, age = 0, yearClock = 0, growthDip = 0;
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
  textFont('"Hiragino Mincho ProN", "Yu Mincho", serif'); // 明朝で、版本の文字に寄せる
  backdrop = makeBackdrop();
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
  ringR = 6; age = 0; growthDip = 0;
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

  image(backdrop, 0, 0); // 空・霞・地面・和紙は最初に一度だけ描いたものを貼る
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
  if (age >= MAX_AGE) return; // 千年で断面がいっぱい。それ以上は輪を足さない
  age++;
  // 年輪は中心（髄）が最初の年で、樹皮のすぐ内側の形成層が毎年その外側に新しい輪を足す。
  // 雨の多い年は太く、雪の多い年・嵐の年は細る（平均がほぼ 1 になる係数）。
  // 地震で傷んだ木は、その後の数年の成長が落ちる（growthDip）
  const w = max(0.3, (1.4 + ui.rain.value() * 2.2 - ui.snow.value() * 0.9 - yearStorm * 0.5 + noise(age * 0.3) * 1.2) / 2.5) * (1 - growthDip);
  // 太るほど 1 年の輪は細くなる。目安の半径は 千年で断面いっぱい（r ∝ 年^0.75）。
  // 天候で太さは揺れるが、目安から離れすぎないよう少しずつ引き戻す。外周に輪が積み重ならない
  const target = (RING_MAX - 4) * pow(age / MAX_AGE, 0.75);
  const prevTarget = (RING_MAX - 4) * pow((age - 1) / MAX_AGE, 0.75);
  let r = ringR + max(0.05, (target - prevTarget) * w);
  r = min(RING_MAX - 4, lerp(r, max(target, 6), 0.04));
  const step = r - ringR;
  const cx = rings.width / 2, cy = rings.height / 2;
  const scar = constrain(yearQuake, 0, 3);
  growthDip = scar > 0.6 ? min(0.6, growthDip + scar * 0.15) : growthDip * 0.8;
  rings.noFill();
  // 晩材の帯：若い太い輪では、秋に締まった濃い部分を幅のある帯で描く
  if (step > 0.5 && scar <= 0.6) {
    rings.stroke(...LATEWOOD, 70);
    rings.strokeWeight(step * 0.45);
    ringPath(cx, cy, r - step * 0.2, 0);
  }
  // 晩材の境（濃い線）。輪が細い老木では線を淡くし、重なって真っ黒にならないようにする
  rings.stroke(...(scar > 0.6 ? SHU : INK), scar > 0.6 ? 200 : map(step, 0.15, 1.2, 8, 110, true) * (0.4 + 1.6 * pow(noise(age * 0.07 + 50), 2)) + yearStorm * 40);
  rings.strokeWeight(scar > 0.6 ? 1.2 : step < 0.5 ? 0.6 : 0.8);
  ringPath(cx, cy, r, scar);
  ringR = r;
}

// 1 本の輪の形。幹は真円ではないので、角度ごとにノイズで少し歪める。地震の年は輪が乱れる
function ringPath(cx, cy, r, scar) {
  rings.beginShape();
  for (let a = 0; a < TWO_PI; a += TWO_PI / 140) {
    const n = noise(cos(a) * 1.3 + 10, sin(a) * 1.3 + 10, r * 0.01);
    const jag = scar > 0.6 ? (noise(a * 9, age) - 0.5) * scar * 3 : 0;
    const rr = r * (0.94 + n * 0.08) + jag;
    rings.vertex(cx + rr * cos(a), cy + rr * sin(a));
  }
  rings.endShape(CLOSE);
}

// 心柱の丸太を斜め上から見る。上面が年輪、側面が樹皮。幹は樹齢とともに太く高くなる
const LOG_BASE_Y = 600;           // 丸太の底面の中心
function logShape() {
  const rx = ringR + 5;           // 樹皮の厚みを足す
  const ry = rx * SQ;
  const tall = 40 + ringR * 1.1;
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
  ctx.strokeStyle = `rgb(${INK})`; ctx.lineWidth = 1.5; ctx.stroke(); // 版画の墨線
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

  // 題箋（右上）。樹齢は漢数字の縦書き
  drawCartouche(W - 70, 26, `${age >= SHINBOKU_AGE ? '御神木' : '心柱の木'}　樹齢${kanjiNumber(age)}年`, 18);
  noStroke(); fill(...INK, 160); textAlign(RIGHT, BASELINE); textSize(12);
  text('朱の輪は地震を受けた年。木はその年を覚えている', W - 30, 710);
  textAlign(LEFT, BASELINE);
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
    // 平らな塗りに墨の輪郭線（浮世絵の主版）
    stroke(...INK); strokeWeight(1.2);
    fill(...WALL);
    rect(-bw / 2, -sh + 26, bw, sh - 26);
    fill(...SHU);
    rect(-bw / 2, -sh + 26, 8, sh - 26);
    rect(bw / 2 - 8, -sh + 26, 8, sh - 26);
    // 高欄（二層目から上）：縁の手すりと束
    if (i > 0) {
      strokeWeight(1);
      line(-bw / 2 - 10, -8, bw / 2 + 10, -8);
      for (let px = -bw / 2 - 10; px <= bw / 2 + 10; px += 10) line(px, -8, px, -1);
    }
    // 組物：軒を支える斗栱を、軒下に並ぶ小さな升で見せる
    fill(...WALL); strokeWeight(0.8);
    for (let kx = -bw / 2 - 6; kx < bw / 2 + 2; kx += 11) rect(kx, -sh + 26, 8, 5);
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
    // 瓦の筋：屋根の上面に、奥へ向かう平行線を刻む
    stroke(...INK, 120); strokeWeight(0.8);
    for (let tx = -ew / 2 + 10; tx < ew / 2; tx += 7) {
      const fy = -sh + 16 - (1 - abs(tx) / (ew / 2)) * 11;
      line(tx, fy, tx + dx * 0.9, fy + dy * 0.9 - (1 - abs(tx) / (ew / 2)) * 3);
    }
    noStroke();
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
    else { stroke(...(d.slide ? SHU : INK), d.slide ? 160 : 70); line(d.x, d.y, d.x - d.vx * 3, d.y - d.vy * 3.2); } // 広重の雨のように細く長い平行線
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
  // 題箋（左上）。浮世絵の題名の札のように、縦書きで枠に入れる
  drawCartouche(40, 26, '木は覚えている', 24);
  drawCartouche(88, 26, '五重塔と心柱と千年の年輪', 12, true);
}

// 縦書きの札。淡い地に墨の二重枠
function drawCartouche(x, y, str, size, plain = false) {
  const chars = [...str];
  const pad = size * 0.6, step = size * 1.12;
  const w = size + pad * 2, h = chars.length * step + pad * 2 - (step - size);
  if (!plain) {
    fill(...KASUMI); stroke(...INK); strokeWeight(1.5);
    rect(x, y, w, h);
    noFill(); strokeWeight(0.8);
    rect(x + 3, y + 3, w - 6, h - 6);
  }
  noStroke(); fill(...INK, plain ? 200 : 255); textSize(size); textAlign(CENTER, TOP);
  chars.forEach((c, i) => {
    if (c === '　') return;
    text(c, x + w / 2, y + pad + i * step);
  });
  textAlign(LEFT, BASELINE);
}

// 1000 までの数を漢数字にする（樹齢の題箋用）
function kanjiNumber(n) {
  if (n === 0) return '〇';
  const d = '〇一二三四五六七八九';
  let out = '';
  const th = floor(n / 1000), h = floor(n / 100) % 10, t = floor(n / 10) % 10, o = n % 10;
  if (th) out += (th > 1 ? d[th] : '') + '千';
  if (h) out += (h > 1 ? d[h] : '') + '百';
  if (t) out += (t > 1 ? d[t] : '') + '十';
  if (o) out += d[o];
  return out;
}

// 背景。最初に一度だけ描いて、毎フレームは貼るだけにする
function makeBackdrop() {
  const g = createGraphics(W, H);
  g.pixelDensity(DENSITY);
  g.background(...PAPER);
  // 和紙の繊維：短い横向きの淡い筋
  g.noStroke();
  randomSeed(7);
  for (let i = 0; i < 4000; i++) {
    g.fill(...INK, random(3, 10));
    g.rect(random(W), random(H), random(2, 6), 0.8);
  }
  // 一文字ぼかし：空の上端を藍で刷り、下へ消していく
  const c = g.drawingContext;
  const grad = c.createLinearGradient(0, 0, 0, 180);
  grad.addColorStop(0, `rgba(${AI}, 0.9)`);
  grad.addColorStop(0.4, `rgba(${AI}, 0.4)`);
  grad.addColorStop(1, `rgba(${AI}, 0)`);
  c.fillStyle = grad;
  c.fillRect(0, 0, W, 180);
  // すやり霞：平らな帯を墨の輪郭で
  g.fill(...KASUMI); g.stroke(...INK, 110); g.strokeWeight(1.2);
  for (const [x, y, w, h] of [[430, 220, 380, 26], [-30, 300, 250, 22], [560, 520, 360, 24], [-30, 470, 200, 20]]) {
    g.rect(x, y, w, h, h / 2);
  }
  // 地面：黄土の平らな帯
  g.noStroke(); g.fill(...OUDO);
  g.rect(0, 620, W, H - 620);
  g.stroke(...INK); g.strokeWeight(2);
  g.line(0, 620, W, 620);
  randomSeed(Date.now());
  return g;
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
