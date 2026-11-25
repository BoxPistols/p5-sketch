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
// 色は古い刷りに寄せて、全体に一段暗く彩度を落とす（褪せた朱、茶がかった墨、焼けた和紙）
const INK = [36, 28, 22], SHU = [172, 66, 44], PAPER = [226, 212, 184];
// 立体にするための色。朱と墨の陰、木口（断面）、樹皮
const SHU_DARK = [124, 50, 34], WALL = [214, 198, 168], ROOF_TOP = [78, 66, 56];
const KOGUCHI = [218, 196, 156], BARK = [70, 54, 42], BARK_LIGHT = [104, 84, 64], NAWA = [164, 138, 88];
const AI = [52, 70, 88], OUDO = [194, 172, 128], KASUMI = [232, 220, 192], LATEWOOD = [160, 124, 82];
const STONE = [150, 140, 122], STONE_TOP = [178, 168, 148];
const TOWER_BASE = 634;           // 基壇の上面。塔は地面の帯の中に立つ
let backdrop, patina;

let paused = false, reducedMotion = false, meter;
let everStarted = false; // 一度でも動かしたか。幕は最初の案内にだけ使う
let ui = {};

// 塔の状態。各層の横ずれ x と速度 v（地面からの相対）
const STORIES = 5;
const TOWER_X = 400, STORY_H = 104;     // 塔が主役。画面の左寄りに大きく立てる
const storyWidth = (i) => 132 - i * 14; // 上の層ほど細い
let tower;
let ground = { x: 0, v: 0 };
let quakeTime = 0;          // 残りの地震時間（秒）
let dragShake = 0;

// 年輪
let rings, ringR = 2, age = 0, yearClock = 0, growthDip = 0;
let ringLog = [];                // 1 年ごとの輪の記録。断面に触れたときの説明に使う
let ringCard, learnDialog;
let shinbokuAt = null;           // 御神木になった瞬間（millis）。注連縄を張る演出と告知に使う                     // その年の輪を説明する札（DOM）
let yearQuake = 0, yearStorm = 0; // その年に受けた揺れと嵐の大きさ
const RING_MAX = 150;             // 断面の半径（画面上）。塔が主役だが、年輪が読める大きさは保つ
const RS = 3;                     // 年輪は 3 倍の解像度で描いて取っておき、虫眼鏡で拡大して見せる
const MAX_AGE = 1000;             // 数えるのは千年まで
const GROW_TAU = 260;             // 太り方の時定数。三百年で断面の 7 割、五百年で 8 割半、千年でほぼいっぱい
const SHINBOKU_AGE = 300;         // この樹齢から御神木（注連縄を張る）。明確な定義は無く、三百年から五百年を目安にする

let drops = [];
// 雨・雪・風が何をしているかを絵で見せるための状態
let snowCover = 0;   // 屋根に積もった雪（0〜1）。降れば積もり、止めば解ける
let wetness = 0;     // 地面の濡れ（0〜1）
let splashes = [];   // 軒から落ちた雨が地面で跳ねた跡（雨落ち）
let gusts = [];      // 風の筋

function setup() {
  pixelDensity(DENSITY);
  frameRate(FPS);
  // キャンバスを包む枠。解説ボタンをキャンバスの右上に重ねるため
  const stage = createDiv('').id('stage');
  createCanvas(W, H).parent(stage);
  textFont('"Hiragino Mincho ProN", "Yu Mincho", serif'); // 明朝で、版本の文字に寄せる
  backdrop = makeBackdrop();
  patina = makePatina();
  rings = createGraphics((RING_MAX * 2 + 20) * RS, (RING_MAX * 2 + 20) * RS);
  rings.pixelDensity(DENSITY);
  resetTower();
  resetRings();
  buildUI();
  setupMeter();
  // ?age=800 のように付けると、その樹齢から始める（確認・共有用）
  const startAge = Number(new URLSearchParams(location.search).get('age')) || 0;
  for (let i = 0; i < min(startAge, MAX_AGE); i++) addRing();
  if (age >= SHINBOKU_AGE) shinbokuAt = -1e9; // 最初から御神木なら演出は飛ばす
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
  ringR = 2; age = 0; growthDip = 0; ringLog = []; shinbokuAt = null;
  // 髄（中心）
  rings.noStroke();
  rings.fill(...INK, 200);
  rings.circle(rings.width / 2, rings.height / 2, 3 * RS);
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
  // 既定は毎秒 25 年。若木のうちは自動でゆっくり進むので、御神木までおよそ 17 秒、千年までおよそ 45 秒
  ui.speed = row('時の速さ', createSlider(0, 120, 25, 1));
  ui.speedText = createSpan('').parent(ui.speed.parent()).class('readout');
  ui.speed.input(updateSpeedText);
  updateSpeedText();
  ui.core = row('心柱', createCheckbox('', true));
  // 二択なので、両方が常に見えるラジオにする（横に並ぶ切り替え）
  ui.build = row('組み方', createRadio('build'));
  ui.build.option('wood', '木組み（継手・仕口）');
  ui.build.option('nail', '釘で固める');
  ui.build.selected('wood');
  ui.build.class('seg');
  ui.build.changed(resetTower);
  const btns = createDiv('').parent(panel).class('row');
  ui.play = createButton('止める（スペース）').parent(btns).class('play').mousePressed(togglePause);
  createButton('地震を起こす').parent(btns).mousePressed(startQuake);
  createButton('建て直す').parent(btns).mousePressed(resetTower);
  createButton('年輪を新しく').parent(btns).mousePressed(resetRings);
  createButton('百年進める').parent(btns).mousePressed(() => { for (let i = 0; i < 100; i++) addRing(); });
  ui.max = createButton('すべて最大').parent(btns).mousePressed(toggleMax); // いちばん強い操作なので右端に置く

  const css = createElement('style', `
    body { flex-direction: column; gap: 10px; }
    #panel { display:flex; flex-wrap:wrap; gap:6px 18px; max-width:min(${W}px, calc(100vw - 32px)); box-sizing:border-box; padding:10px 14px;
      font:13px/1.4 serif; color:#2a2522; background:#cdbf9f; border-radius:4px; }
    #panel .row { display:flex; align-items:center; gap:8px; }
    #panel input[type=range] { width:120px; accent-color:rgb(${SHU}); }
    #panel button, #panel select { font:inherit; padding:3px 10px; background:#e2d6ba;
      border:1px solid #2a2522; border-radius:3px; cursor:pointer; }
    #panel input[type=checkbox] { accent-color:rgb(${INK}); width:16px; height:16px; } /* OS の青を使わず墨色に */
    #panel .readout { min-width:6.5em; color:#4a3f34; font-size:12px; }
    #panel .seg { display:inline-flex; border:1px solid #2a2522; border-radius:3px; overflow:hidden; }
    #panel .seg label { position:relative; display:inline-flex; cursor:pointer; }
    #panel .seg label + label { border-left:1px solid #2a2522; }
    #panel .seg input { position:absolute; opacity:0; inset:0; margin:0; cursor:pointer; }
    #panel .seg span { padding:3px 12px; background:#e2d6ba; }
    #panel .seg input:checked + span { background:rgb(${INK}); color:#efe4cc; }
    #panel .seg input:focus-visible + span { outline:2px solid rgb(${SHU}); outline-offset:-3px; }
    #panel button:hover, #panel button.play { background:rgb(${SHU}); color:#fff; border-color:rgb(${SHU}); }
    #panel button:focus-visible, #panel select:focus-visible, #panel input:focus-visible { outline:2px solid rgb(${SHU}); outline-offset:2px; }`);
  css.parent(document.head);
  buildLearn();
  // 止まっている間にパネルを触ったら、1 枚描き直して変化を見せる
  panel.elt.addEventListener('input', () => { if (!isLooping()) redraw(); });
  panel.elt.addEventListener('click', () => { if (!isLooping()) redraw(); });
}

// 地震は 3 秒揺れる。年輪に残るのは揺れが始まった年の 1 本だけ（時を速めても、何十年も揺れ続けたことにはしない）
// 若木のうちは時をゆっくり進める（芽から百五十年かけて、2.5 割の速さから等速へ）。育ちの様子が見えるように
function youthPace() {
  return 0.25 + 0.75 * min(1, age / 150);
}

function updateSpeedText() {
  if (ui.speedText) ui.speedText.html(`毎秒 ${ui.speed.value()} 年`);
}

function selectLearnTab(n, focus = false) {
  const tabs = selectAll('#learn [role=tab]'), panels = selectAll('#learn [role=tabpanel]');
  tabs.forEach((t, i) => { t.attribute('aria-selected', String(i === n)); t.attribute('tabindex', i === n ? '0' : '-1'); });
  panels.forEach((p, i) => (i === n ? p.removeAttribute('hidden') : p.attribute('hidden', '')));
  select('#learn .body').elt.scrollTop = 0;
  if (focus) tabs[n].elt.focus();
}

function startQuake() { quakeTime = 3; quakeRecorded = false; }
let quakeRecorded = false;

// すべて最大：地震・雨・雪・風・時の速さを一度に最大にし、地震を起こし続ける。もう一度押すと元の値に戻す
let maxSaved = null, maxCalm = 0;
function toggleMax() {
  const keys = ['quake', 'rain', 'snow', 'wind', 'speed'];
  if (maxSaved) {
    keys.forEach((k) => ui[k].value(maxSaved[k]));
    maxSaved = null;
    quakeTime = 0;
    ui.max.html('すべて最大');
  } else {
    maxSaved = Object.fromEntries(keys.map((k) => [k, ui[k].value()]));
    ui.quake.value(1); ui.rain.value(1); ui.snow.value(1); ui.wind.value(1); ui.speed.value(120);
    ui.max.html('元に戻す');
  }
  updateSpeedText(); // 値をコードで変えたときは input が起きないので、表示を合わせる
  if (!isLooping()) redraw();
}

// 一時停止の切り替え。スペースキー・パネルのボタン・停止中の画面クリックから呼ぶ
function togglePause() {
  paused = !paused;
  if (!paused) everStarted = true;
  ui.play.html(paused ? '動かす（スペース）' : '止める（スペース）');
  updateLoop();
  redraw();
}

function drawPausedMark() {
  const x = W / 2, y = 30;
  noStroke(); fill(...KASUMI, 235);
  rect(x - 125, y - 15, 250, 30);
  noFill(); stroke(...INK); strokeWeight(1.2);
  rect(x - 125, y - 15, 250, 30);
  noStroke(); fill(...INK);
  rect(x - 108, y - 7, 4, 14); rect(x - 100, y - 7, 4, 14); // 一時停止の印
  textAlign(LEFT, CENTER); textSize(14);
  text("止めています　スペースで再開", x - 88, y);
  textAlign(LEFT, BASELINE);
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

  if (!paused) { // 止まっている間の描き直しでは時間を進めない
    stepGround(dt);
    stepTower(dt);
    stepYears(dt);
    stepWeatherState(dt);
  }

  image(backdrop, 0, 0); // 空・霞・地面・和紙は最初に一度だけ描いたものを貼る
  drawTitle();
  drawWetGround();
  drawWeather();
  drawTower();
  drawSnowCaps();
  drawGusts();
  drawRings();
  drawWeatherCaption();
  image(patina, 0, 0); // 風化の層（四隅の暗がり・しみ・折り目）を最後に重ねる
  // 止まっているときは、始め方を画面の真ん中で伝える（「視差効果を減らす」設定だと最初から止まる）
  // 最初は幕で始め方を案内する。動かした後の一時停止は絵を覆わず、止まっていることだけ示す（止めて年輪を読めるように）
  if (paused) everStarted ? drawPausedMark() : drawPausedVeil();

  updateCursor();
  recordFrame(performance.now() - started);
}

// マウスの形で、触れる場所を示す。丸窓は拡大して読める、塔の上は左右にドラッグして揺らせる
let cursorNow = '';
function updateCursor() {
  let c = 'default';
  if (dist(mouseX, mouseY, INSET.x, INSET.y) < INSET.r && age >= 1) c = 'zoom-in';
  else if (mouseX >= 0 && mouseX < 760 && mouseY > 40 && mouseY < 650) c = 'ew-resize';
  if (c !== cursorNow) { cursor(c); cursorNow = c; }
}

function stepGround(dt) {
  // 地面の揺れ：いくつかの周期を重ね、ノイズで不規則にする
  let target = 0;
  // すべて最大の間は、3 秒揺れて 3 秒静まるのを繰り返す。揺れるたびに 1 本ずつ朱の輪が残る
  if (maxSaved && quakeTime <= 0) { maxCalm -= dt; if (maxCalm <= 0) { startQuake(); maxCalm = 3; } }
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
      f += wind * 18 * (1 + snowCover * 0.5) * (i + 1) / STORIES; // 雪を載せた屋根は風も強く受ける
      // 心柱：各層を全体の平均へ引き寄せ、層ごとの暴れを抑える
      if (core) f += -60 * (tower.x[i] - avg) - 3 * tower.v[i] * 0.5;
      tower.v[i] += f * h / (1 + snowCover * 0.8); // 雪の重みで層が重くなり、揺れがゆっくり大きくなる
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
  yearClock += dt * ui.speed.value() * youthPace();
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
  if (age === SHINBOKU_AGE) shinbokuAt = millis(); // ここから御神木。注連縄が張られる
  // 年輪は中心（髄）が最初の年で、樹皮のすぐ内側の形成層が毎年その外側に新しい輪を足す。
  // 雨の多い年は太く、雪の多い年・嵐の年は細る（平均がほぼ 1 になる係数）。
  // 地震で傷んだ木は、その後の数年の成長が落ちる（growthDip）
  const w = max(0.3, (1.4 + ui.rain.value() * 2.2 - ui.snow.value() * 0.9 - yearStorm * 0.5 + noise(age * 0.3) * 1.2) / 2.5) * (1 - growthDip);
  // 太るほど 1 年の輪は細くなる。目安の半径は 1 - exp(-年 / GROW_TAU) で、断面の縁へ近づき続ける。
  // 天候で太さは揺れるが、目安から離れすぎないよう少しずつ引き戻す。外周に輪が積み重ならない
  // 止めずに育ち続け、太るほど輪は細くなる。上限で止めると、その後の地震が輪に残らない
  const target = (RING_MAX - 4) * (1 - exp(-age / GROW_TAU));
  const prevTarget = (RING_MAX - 4) * (1 - exp(-(age - 1) / GROW_TAU));
  let r = ringR + max(0.05, (target - prevTarget) * w);
  r = min(RING_MAX - 4, lerp(r, max(target, 2), 0.04));
  const step = r - ringR;
  const cx = rings.width / 2, cy = rings.height / 2;
  // ひとつの地震で残す朱の輪は 1 本まで
  const scar = quakeRecorded ? 0 : constrain(yearQuake, 0, 3);
  if (scar > 0.6) quakeRecorded = true;
  growthDip = scar > 0.6 ? min(0.6, growthDip + scar * 0.15) : growthDip * 0.8;
  rings.noFill();
  // 晩材の帯：若い太い輪では、秋に締まった濃い部分を幅のある帯で描く
  if (step > 0.5 && scar <= 0.6) {
    rings.stroke(...LATEWOOD, 70);
    rings.strokeWeight(step * 0.45 * RS);
    ringPath(cx, cy, r - step * 0.2, 0);
  }
  // 晩材の境（濃い線）。輪が細い老木では線を淡くし、重なって真っ黒にならないようにする
  rings.stroke(...(scar > 0.6 ? SHU : INK), scar > 0.6 ? 200 : map(step, 0.15, 1.2, 45, 120, true) * (0.4 + 1.6 * pow(noise(age * 0.07 + 50), 2)) + yearStorm * 40);
  rings.strokeWeight((scar > 0.6 ? 1.3 : step < 0.5 ? 0.5 : 0.8) * RS);
  ringPath(cx, cy, r, scar);
  ringLog.push({ r, rain: ui.rain.value(), snow: ui.snow.value(), storm: yearStorm, scar, step });
  ringR = r;
}

// 1 本の輪の形。幹は真円ではないので、角度ごとにノイズで少し歪める。地震の年は輪が乱れる
function ringPath(cx, cy, r, scar) {
  rings.beginShape();
  for (let a = 0; a < TWO_PI; a += TWO_PI / 140) {
    const n = noise(cos(a) * 1.3 + 10, sin(a) * 1.3 + 10, r * 0.01);
    const jag = scar > 0.6 ? (noise(a * 9, age) - 0.5) * scar * 1.2 : 0;
    const rr = r * (0.94 + n * 0.08) + jag;
    rings.vertex(cx + rr * RS * cos(a), cy + rr * RS * sin(a));
  }
  rings.endShape(CLOSE);
}

// 立っている生きた木。樹齢 0 年の芽から育ち、幹が太く高くなる。
// 伐った丸太や切り株は年輪を増やさない（形成層は生きた木にしかない）ので、断面は幹を輪切りにした「見立て」として丸窓（こま絵）に描く
const TREE_X = 985, TREE_BASE = 632;
const FOLIAGE = [78, 94, 60], FOLIAGE_DARK = [52, 64, 44], FOLIAGE_LIGHT = [122, 136, 92], MOSS = [96, 104, 66];
const CANOPY_RIGHT = W - 20;          // 樹冠がはみ出さない右端
const INSET = { x: 760, y: 470, r: 90 };   // 断面の丸窓。塔と木のあいだの低いところ（樹冠と重ならない）

function treeShape() {
  const tr = ringR * 0.55 + 1;                             // 根元の幹の半径（画面上）。千年でもおよそ 80px
  const h = age < 1 ? 0 : 10 + 330 * (1 - exp(-age / 200)); // 幹（枝分かれまで）の高さ。樹冠を足しても画面に収まる
  return { tr, h, top: TREE_BASE - h };
}

// 幹の高さ y での半径。上ほど細る
function trunkRadiusAt(y, tr, h) {
  return lerp(tr, tr * 0.3, constrain((TREE_BASE - y) / max(h, 1), 0, 1));
}

function drawRings() {
  const { tr, h, top } = treeShape();
  const cx = TREE_X;
  if (age < 8) drawSprout(cx);
  else drawTree(cx, tr, h, top);

  // 輪切りにする高さ（胸の高さ）。そこから丸窓へ点線で結ぶ
  const sy = TREE_BASE - min(h * 0.4, 120);
  if (age >= 8) {
    const rr = trunkRadiusAt(sy, tr, h);
    drawingContext.setLineDash([4, 4]);
    noFill(); stroke(...INK, 150); strokeWeight(1);
    ellipse(cx, sy, rr * 2, rr * 0.5);
    line(cx - rr, sy, INSET.x + INSET.r, INSET.y);
    drawingContext.setLineDash([]);
  }
  const s = drawInset();

  if (age >= SHINBOKU_AGE) {
    const since = millis() - shinbokuAt;
    const ny = TREE_BASE - min(h * 0.2, 70); // 見本の御神木のように、注連縄は幹の低いところに
    const nr = trunkRadiusAt(ny, tr, h);
    drawShimenawa(cx, nr, nr * 0.28, ny, constrain(since / 1800, 0, 1));
    // 御神木になった知らせ。4 秒かけて消える
    if (since < 4000) {
      const a = since < 3000 ? 255 : map(since, 3000, 4000, 255, 0);
      const bx = cx - 60, by = 360;
      fill(...KASUMI, a * 0.92); stroke(...INK, a); strokeWeight(1.2);
      rectMode(CENTER); rect(bx, by, 300, 50); rectMode(CORNER);
      noStroke(); fill(...SHU, a); textAlign(CENTER, CENTER); textSize(17);
      text(`樹齢${kanjiNumber(SHINBOKU_AGE)}年　御神木になる`, bx, by - 8);
      fill(...INK, a * 0.8); textSize(11);
      text('長い年月を生きた木は、注連縄を張って祀られる', bx, by + 12);
      textAlign(LEFT, BASELINE);
    }
  }
  readRingUnderPointer(s);

  // 題箋（右上）。樹齢は漢数字の縦書き
  const name = age < 10 ? '芽生え' : age < 100 ? '若木' : age < SHINBOKU_AGE ? '木' : '御神木';
  drawCartouche(W - 70, 26, `${name}　樹齢${kanjiNumber(age)}年`, 18);
  noStroke(); fill(...INK, 160); textAlign(RIGHT, BASELINE); textSize(12);
  text('丸窓の断面にマウスを置くと、その年の輪を読める。朱の輪は地震の年', W - 30, 710);
  textAlign(LEFT, BASELINE);
}

// 芽：土から出た茎と二枚の葉
function drawSprout(cx) {
  const sh = 6 + age * 3;
  stroke(...FOLIAGE); strokeWeight(2); noFill();
  line(cx, TREE_BASE, cx, TREE_BASE - sh);
  fill(...FOLIAGE_LIGHT); stroke(...INK); strokeWeight(1);
  push(); translate(cx, TREE_BASE - sh);
  rotate(-0.5); ellipse(-7, 0, 14, 6);
  rotate(1.0); ellipse(7, 0, 14, 6);
  pop();
  noStroke(); fill(...INK, 30);
  ellipse(cx, TREE_BASE + 2, 30, 6);
}

function drawTree(cx, tr, h, top) {
  const wind = ui.wind.value();
  const sway = wind * 5 + ground.x * 0.3 + sin(frameCount * 0.05) * wind * 2;
  // 樹冠の大きさ。右端と上端からはみ出さないよう上限を付ける
  const cw = min(CANOPY_RIGHT - cx, 30 + h * 0.8);
  const ch = min(top - 24, 40 + h * 0.72);
  const ccy = top - ch * 0.35; // 樹冠の中心
  // 地面の影（光は左上から）
  noStroke(); fill(...INK, 36);
  ellipse(cx + tr * 0.6 + 30, TREE_BASE + 6, tr * 4 + cw, 20);

  // 奥の葉：暗い色で、枝の後ろに置く
  drawCanopy(cx + sway * 0.6, ccy, cw, ch, 0, FOLIAGE_DARK);

  // 枝：幹の上で数本に分かれ、外と上へ伸びる。墨の太い線の上に樹皮色の線を重ねて輪郭にする
  const limbs = constrain(floor(2 + h / 70), 2, 6);
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 0; k < limbs; k++) {
      const u = limbs === 1 ? 0 : k / (limbs - 1) * 2 - 1; // -1..1
      const bx = cx + u * tr * 0.25, by = top + h * 0.06;
      // 枝先は樹冠の内側で止め、手前の葉で覆う
      const ex = cx + u * cw * 0.5 + sway, ey = ccy - ch * (0.05 + 0.2 * (1 - abs(u)));
      const mx = lerp(bx, ex, 0.4) + u * 10, my = lerp(by, ey, 0.6) + 12;
      const wgt = max(2, tr * 0.35 * (1 - abs(u) * 0.35));
      stroke(...(pass ? BARK : INK)); strokeWeight(pass ? wgt : wgt + 2.5); noFill();
      bezier(bx, by, mx, my, mx, my, ex, ey);
    }
  }

  // 幹：根元が張り、枝分かれまで少しずつ細る。左が明るく右が暗い
  const ctx = drawingContext;
  const grad = ctx.createLinearGradient(cx - tr, 0, cx + tr, 0);
  grad.addColorStop(0, `rgb(${BARK_LIGHT})`);
  grad.addColorStop(0.4, `rgb(${BARK})`);
  grad.addColorStop(1, `rgb(${INK})`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(cx - tr * 1.35, TREE_BASE);
  ctx.quadraticCurveTo(cx - tr, TREE_BASE - tr * 0.4, cx - tr * 0.95, TREE_BASE - tr);
  ctx.lineTo(cx - trunkRadiusAt(top, tr, h), top);
  ctx.lineTo(cx + trunkRadiusAt(top, tr, h), top);
  ctx.lineTo(cx + tr * 0.95, TREE_BASE - tr);
  ctx.quadraticCurveTo(cx + tr, TREE_BASE - tr * 0.4, cx + tr * 1.35, TREE_BASE);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = `rgb(${INK})`; ctx.lineWidth = 1.4; ctx.stroke(); // 版画の墨線
  // 樹皮の縦の筋と、根元の苔
  const n = constrain(floor(tr / 4), 2, 18);
  noFill();
  for (let k = 1; k < n; k++) {
    const u = k / n * 2 - 1;
    stroke(...INK, 90); strokeWeight(1);
    beginShape();
    for (let s = 0; s <= 8; s++) {
      const y = lerp(TREE_BASE - tr * 0.3, top + 2, s / 8);
      vertex(cx + u * trunkRadiusAt(y, tr, h) * 0.92 + (noise(k * 3.1, s * 0.7) - 0.5) * 3, y);
    }
    endShape();
    if (age > 150) { // 老木には苔が付く
      stroke(...MOSS, 150); strokeWeight(2);
      const my = TREE_BASE - tr * 0.3 - noise(k * 1.7) * h * 0.5;
      line(cx + u * trunkRadiusAt(my, tr, h) * 0.9, my, cx + u * trunkRadiusAt(my, tr, h) * 0.9, my + 6 + noise(k) * 12);
    }
  }

  // 手前の葉
  drawCanopy(cx + sway, ccy + ch * 0.08, cw * 0.92, ch * 0.9, 1, FOLIAGE);
}

// 樹冠：墨の輪郭をもつ平らな葉のかたまりを、楕円の範囲に散らして重ねる（浮世絵の葉の描き方）
function drawCanopy(x, y, cw, ch, layer, col) {
  const count = constrain(floor(6 + age / 25), 6, 22);
  for (let i = 0; i < count; i++) {
    // 位置は毎フレーム同じになるよう、ノイズから決める
    const a = noise(i * 2.3, layer * 7) * TWO_PI * 2;
    const rr = sqrt(noise(i * 5.1, layer * 3 + 1));
    const px = x + cos(a) * rr * cw * 0.8;
    const py = y + sin(a) * rr * ch * 0.45;
    const sz = (0.24 + noise(i * 1.9, layer) * 0.2) * min(cw * 1.3, ch * 1.7);
    fill(...col); stroke(...INK); strokeWeight(1.1);
    beginShape();
    for (let k = 0; k < 16; k++) {
      const t = k / 16 * TWO_PI;
      const bump = 0.82 + 0.18 * abs(sin(t * 3.5 + i)); // 縁を波打たせる
      vertex(px + cos(t) * sz * 0.62 * bump, py + sin(t) * sz * 0.42 * bump);
    }
    endShape(CLOSE);
    // 葉の刷り目
    stroke(...FOLIAGE_LIGHT, 170); strokeWeight(1);
    for (let k = -1; k <= 1; k++) line(px + k * sz * 0.18, py - sz * 0.08, px + k * sz * 0.22, py + sz * 0.12);
  }
}

// 丸窓（こま絵）に、幹を胸の高さで輪切りにした断面を描く。木の太さに合わせて拡大し、若木でも輪が読める
// 戻り値は 断面 1 px（画面上の年輪の単位）あたりの丸窓での大きさ
function drawInset() {
  const { x, y, r } = INSET;
  const s = min(6, (r - 10) / (ringR + 4));
  const ctx = drawingContext;
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, TWO_PI); ctx.clip();
  noStroke(); fill(...KASUMI);
  circle(x, y, r * 2);
  fill(...BARK);
  circle(x, y, (ringR + 4) * s * 2);
  fill(...KOGUCHI);
  circle(x, y, (ringR + 1) * s * 2);
  const gw = (rings.width / RS) * s;
  image(rings, x - gw / 2, y - gw / 2, gw, gw);
  ctx.restore();
  // 二重の墨の枠
  noFill(); stroke(...INK); strokeWeight(1.6);
  circle(x, y, r * 2);
  strokeWeight(0.8);
  circle(x, y, r * 2 + 8);
  noStroke(); fill(...INK, 190); textAlign(CENTER, TOP); textSize(12);
  text(age < 1 ? '輪切りの見立て　まだ輪は無い' : '輪切りの見立て（胸の高さ）　触れると年輪を読める', x, y + r + 10);
  // いまの天気で、今年の輪がどうなるか。雨は太く、雪や嵐は細くする（addRing と同じ式の向き）
  const rain = ui.rain.value(), snow = ui.snow.value(), storm = abs(ui.wind.value()) * (rain + snow);
  const g = 1.4 + rain * 2.2 - snow * 0.9 - storm * 0.5;
  const why = g > 2.3 ? '太め（雨が多い）' : g < 1.1 ? (snow > storm ? '細め（雪で寒い）' : '細め（嵐）') : 'ふつう';
  fill(...(g < 1.1 ? SHU : INK), 200);
  text(`今年の輪：${why}`, x, y + r + 26);
  // 虫眼鏡の印：丸窓に触れると拡大して読めることを、触る前から示す
  if (age >= 1) {
    const bx = x + r * 0.74, by = y + r * 0.74;
    fill(...KASUMI); stroke(...INK); strokeWeight(1.4);
    circle(bx, by, 30);
    noFill(); strokeWeight(2);
    circle(bx - 2, by - 2, 12);
    line(bx + 2.5, by + 2.5, bx + 8, by + 8);
  }
  textAlign(LEFT, BASELINE);
  return s;
}

// 注連縄と紙垂。幹の手前の半周に縄を巻き、白い紙垂を垂らす
// p は 0→1 の進み。縄が左から右へ張られ、紙垂が順に下がる
function drawShimenawa(cx, rx, ry, y, p = 1) {
  const sk = constrain(rx / 150, 0.5, 1); // 細い幹では縄も紙垂も小さく
  noFill();
  stroke(...NAWA); strokeWeight(10 * sk);
  beginShape();
  for (let s = 0; s <= 24 * p; s++) { const th = (s / 24) * PI; vertex(cx - (rx + 3) * cos(th), y + ry * sin(th)); }
  endShape();
  // 縄のより目
  stroke(...INK, 100); strokeWeight(1);
  for (let s = 1; s < 30 * p; s++) {
    const th = (s / 30) * PI;
    const x = cx - (rx + 3) * cos(th), yy = y + ry * sin(th);
    line(x - 3 * sk, yy - 4 * sk, x + 3 * sk, yy + 4 * sk);
  }
  // 紙垂（稲妻形）を 4 枚
  for (let k = 0; k < 4; k++) {
    const th = PI * (0.2 + k * 0.2);
    if (th / PI > p) break; // 縄がそこまで張られてから下げる
    push();
    translate(cx - (rx + 3) * cos(th) - 8 * sk, y + ry * sin(th) + 5 * sk);
    scale(sk);
    fill(255); stroke(...INK, 120); strokeWeight(1);
    beginShape();
    vertex(0, 0); vertex(10, 0); vertex(10, 10); vertex(16, 10); vertex(16, 22); vertex(22, 22); vertex(22, 36);
    vertex(12, 36); vertex(12, 22); vertex(6, 22); vertex(6, 10); vertex(0, 10);
    endShape(CLOSE);
    pop();
  }
}

// --- 年輪を読む -------------------------------------------------------------------
// 丸窓の断面にマウスや指を置くと、その位置の輪を強調し、何年目のどんな年かを札で示す
// s は丸窓の拡大率（drawInset の戻り値）
function readRingUnderPointer(s) {
  const inside = mouseX >= 0 && mouseX <= W && mouseY >= 0 && mouseY <= H;
  const d = dist(mouseX, mouseY, INSET.x, INSET.y) / s; // 断面の中心からの距離（年輪の単位）
  if (!inside || ringLog.length === 0 || d > ringR + 1 || dist(mouseX, mouseY, INSET.x, INSET.y) > INSET.r) { ringCard.hide(); return; }
  // 距離より外側にある最初の輪 = 指している輪
  let lo = 0, hi = ringLog.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (ringLog[m].r < d) lo = m + 1; else hi = m; }
  const k = lo + 1; // 何年目か（中心から数えて k 本目）
  const ring = ringLog[lo];
  // 輪を朱で強調し、髄（中心）に印を付ける
  noFill(); stroke(...SHU); strokeWeight(2);
  circle(INSET.x, INSET.y, ring.r * s * 2);
  noStroke(); fill(...SHU);
  circle(INSET.x, INSET.y, 4);
  // 丸窓が小さく見えるほど輪が詰まるので、そのときだけ虫眼鏡を出す
  const loupe = s < 2;
  if (loupe) drawLoupe(s, ring);
  showRingCard(k, ring, INSET.x - 140, loupe ? INSET.y - INSET.r - 2 * 70 - 34 - 130 : INSET.y - INSET.r - 120);
}

// 虫眼鏡：3 倍の解像度で描いた年輪から指している場所を切り出し、丸窓の下に大きく見せる
function drawLoupe(s, ring) {
  const LR = 70;
  const lx = INSET.x, ly = INSET.y - INSET.r - LR - 34; // 丸窓の上の空に出す
  const gx = rings.width / 2 + ((mouseX - INSET.x) / s) * RS;
  const gy = rings.height / 2 + ((mouseY - INSET.y) / s) * RS;
  stroke(...INK, 120); strokeWeight(1);
  line(lx, ly + LR, mouseX, mouseY);
  const ctx = drawingContext;
  ctx.save();
  ctx.beginPath(); ctx.arc(lx, ly, LR, 0, TWO_PI); ctx.clip();
  noStroke(); fill(...BARK);
  circle(lx, ly, LR * 2);
  fill(...KOGUCHI);
  circle(lx - (gx - rings.width / 2), ly - (gy - rings.height / 2), (ringR + 1) * RS * 2);
  ctx.drawImage(rings.elt ?? rings.canvas, gx - LR, gy - LR, LR * 2, LR * 2, lx - LR, ly - LR, LR * 2, LR * 2);
  noFill(); stroke(...SHU); strokeWeight(2);
  circle(lx - (gx - rings.width / 2), ly - (gy - rings.height / 2), ring.r * RS * 2);
  ctx.restore();
  noFill(); stroke(...INK); strokeWeight(2.5);
  circle(lx, ly, LR * 2);
  noStroke(); fill(...INK, 170); textAlign(CENTER, TOP); textSize(11);
  text(`${(RS / s).toFixed(1)} 倍に拡大`, lx, ly + LR + 6);
  textAlign(LEFT, BASELINE);
}

function describeYear(k, ring) {
  const lines = [];
  if (k === 1) lines.push('髄のすぐ外。この木が芽を出した最初の年の輪。');
  else if (k === age) lines.push('いちばん外側。今年、樹皮のすぐ内側の形成層がつくった輪。');
  else lines.push(`中心から数えて ${k} 本目。この外側に、より新しい輪が ${age - k} 本ある。`);
  if (ring.scar > 0.6) lines.push('地震を受けた年（朱の輪）。傷んだ木は、この後の数年の輪が細くなる。');
  if (ring.rain > 0.6) lines.push('雨の多い年。よく育ち、輪が太い。');
  if (ring.snow > 0.4) lines.push('雪の多い寒い年。育ちが鈍り、輪が細い。');
  if (ring.storm > 0.5) lines.push('嵐の年。風雨に耐えて輪が細る。');
  if (lines.length === 1) lines.push('穏やかな年。');
  return lines;
}

function showRingCard(k, ring, leftX, topY) {
  const box = document.querySelector('canvas').getBoundingClientRect();
  const scale = box.width / W;
  ringCard.html('');
  createElement('strong', `${kanjiNumber(k)}年目の輪`).parent(ringCard);
  for (const t of describeYear(k, ring)) createP(t).parent(ringCard);
  // 札は丸窓（と虫眼鏡）の上に出し、輪を隠さない
  ringCard.show();
  ringCard.position(box.left + window.scrollX + leftX * scale, box.top + window.scrollY + topY * scale);
}

// 止まっている間も、断面の上でマウスを動かしたら読めるようにする
function mouseMoved() {
  if (!isLooping()) redraw();
}

// 開いて読める説明の欄を 1 つ作る。facts は [見出し, 本文]、sources は [名前, URL]
// 五重塔と年輪は並列なので、ダイアログの中でタブにする。tabs にタブを足し、本文は選んだものだけ見せる
function learnSection(body, tabs, label, title, facts, sources) {
  const n = tabs.elt.children.length, first = n === 0;
  const sec = createElement('section').parent(body).id(`learn-panel-${n}`)
    .attribute('role', 'tabpanel').attribute('aria-labelledby', `learn-tab-${n}`);
  if (!first) sec.attribute('hidden', '');
  const tab = createButton(label).parent(tabs).id(`learn-tab-${n}`).attribute('role', 'tab')
    .attribute('aria-controls', `learn-panel-${n}`).attribute('aria-selected', String(first)).attribute('tabindex', first ? '0' : '-1');
  tab.mousePressed(() => selectLearnTab(n));
  createElement('h2', title).parent(sec);
  const dl = createElement('dl').parent(sec);
  for (const [t, d] of facts) {
    const pair = createDiv('').parent(dl); // 見出しと本文を組にして、同じ列に並べる
    createElement('dt', t).parent(pair);
    createElement('dd', d).parent(pair);
  }
  const src = createP('出典: ').parent(sec).class('src');
  for (const [label, url] of sources) createA(url, label, '_blank').parent(src).attribute('rel', 'noopener');
}

// 学べる説明。パネルの下に、開いて読める欄を置く（五重塔・年輪）
function buildLearn() {
  ringCard = createDiv('').id('ringcard').hide();

  // 解説はダイアログに収める。画面の下に置くと、窓の高さによっては見切れるため
  learnDialog = createElement('dialog').id('learn').attribute('aria-labelledby', 'learn-title');
  const head = createDiv('').parent(learnDialog).class('head');
  createElement('h1', '解説').parent(head).id('learn-title');
  createButton('閉じる').parent(head).class('close').mousePressed(() => learnDialog.elt.close());
  const tabs = createDiv('').parent(head).class('tabs').attribute('role', 'tablist').attribute('aria-label', '解説の種類');
  // 左右の矢印キーでタブを移る（タブの決まった操作）
  tabs.elt.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const all = [...tabs.elt.children], i = all.indexOf(document.activeElement);
    selectLearnTab((i + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length, true);
    e.preventDefault();
  });
  const body = createDiv('').parent(learnDialog).class('body');
  // 外側（背景）をクリックしたら閉じる
  learnDialog.elt.addEventListener('click', (e) => { if (e.target === learnDialog.elt) learnDialog.elt.close(); });

  // 開くボタン：右上の題箋と同じ札の形に、和綴じ本の図柄と縦書きの「解説」
  const open = createButton('').parent(select('#stage')).id('learn-open').attribute('aria-label', '解説を読む（五重塔と年輪のしくみ）');
  open.html(`<svg viewBox="0 0 24 28" aria-hidden="true">
      <rect x="4" y="2" width="17" height="24" fill="none" stroke="currentColor" stroke-width="1.6"/>
      <line x1="8" y1="2" x2="8" y2="26" stroke="currentColor" stroke-width="1"/>
      <g fill="currentColor"><circle cx="6" cy="6" r="1"/><circle cx="6" cy="11" r="1"/><circle cx="6" cy="16.5" r="1"/><circle cx="6" cy="22" r="1"/></g>
      <rect x="13" y="5" width="5" height="12" fill="none" stroke="currentColor" stroke-width="1"/>
    </svg><span>解説</span>`);
  open.mousePressed(() => learnDialog.elt.showModal());

  // 五重塔のしくみ：地震と雨・雪・風への強さ。作品で単純化したところは、そうと書く
  learnSection(body, tabs, '五重塔のしくみ', '地震と雨・雪・風への強さ', [
    ['各層は積み重ねてあるだけ', '五重塔の各層は一つずつ独立して組まれ、下の層の上に載っている。一階から最上階までを貫く通し柱は無い。地震では各層が別々に、少しずつずれながら揺れる。'],
    ['心柱は塔に縛られていない', '塔の真ん中を貫く心柱は、多くの塔で各層と構造的に切り離され、上の方でわずかに接するだけになっている。地震では心柱と各層が別々に揺れ、その動きの食い違いが塔全体の揺れを抑えると考えられている。仕組みの詳しいところは、実際の塔の観測や模型の振動実験で今も調べられている。'],
    ['木組みは揺れを吸う', '継手・仕口で木と木を組んだ接合部は、揺れると擦れ合い、少しずつめり込みながら力を受け流す。釘や金物で硬く固めた建物は、しなる余地が少ないぶん、同じ揺れで接合部や部材に力が集まりやすい。'],
    ['深い軒は雨から木を守る', '屋根を柱から大きく張り出すと、雨が柱や壁にかかりにくくなる。木は濡れたままだと腐りやすいので、雨をかけないこと、濡れてもすぐ乾くことが長持ちにつながる。反りのある屋根は、雨や雪解けの水を軒先へ流して落とす。'],
    ['古い木はすぐには弱らない', '木材は伐ってから数百年は強さが上がり、その後ゆるやかに下がるとされる。ただし樹種によって違い、古い材の強さはまだ十分には分かっていない。'],
    ['この作品での表し方', '五つの層をばねでつなぎ、毎フレーム揺れを計算している。木組みはやわらかく擦れて揺れを吸うばね、釘は硬く揺れを吸わないばねとして、層の間のずれが大きいと傷みが積もる。心柱は各層を全体の平均へ引き寄せる力として足している。風は塔を横から押す力、雨や雪は軒で受けて外へ流す粒として描いている。実際の塔の揺れ方をそのまま再現したものではない。'],
  ], [
    ['国土交通省 観光庁 多言語解説文（五重塔）', 'https://www.mlit.go.jp/tagengo-db/common/001553333.pdf'],
    ['関西大学 薬師寺東塔の振動観測', 'https://wps.itc.kansai-u.ac.jp/eisuken/wp-content/uploads/sites/318/2024/10/01%E8%96%AC%E5%B8%AB%E5%AF%BA%E6%9D%B1%E5%A1%94%E6%8C%AF%E5%8B%95%E8%A6%B3%E6%B8%AC.pdf'],
    ['防災科学技術研究所 五重塔模型の振動台実験（2006）', 'https://www.bosai.go.jp/info/press/2006/pdf/gojyu2006.pdf'],
    ['国土技術政策総合研究所 長持ち住宅の手引き', 'https://www.nilim.go.jp/lab/hcg/nagamoti/dist/pdf/resident.pdf'],
    ['立命館大学 古材の強度に関する論文', 'https://ritsumei.repo.nii.ac.jp/record/8954/files/dmuch2_20.pdf'],
  ]);

  learnSection(body, tabs, '年輪のしくみ', '木が一年ずつ刻むもの', [
    ['伐った木は年輪が増えない', '年輪をつくる形成層は、生きている木の樹皮のすぐ内側にしかない。伐った丸太や切り株は、ほとんどの場合もう太らない。この作品で断面を丸窓に描いているのは、立っている木の幹を輪切りにしたらこう見える、という見立てだから。'],
    ['中心がいちばん古い', '年輪は、樹皮のすぐ内側にある形成層が毎年つくる。新しい木の層は古い層の外側に重なるので、中心（髄）が最初の年で、外側ほど新しい。'],
    ['1 年は淡い帯と濃い線でできている', '春に育つ部分（早材）は細胞が大きく壁が薄いので淡い。夏から秋に育つ部分（晩材）は細胞が小さく壁が厚いので濃い。この濃い部分の外側が 1 年の区切りになる。'],
    ['太るほど 1 年の輪は細くなる', '幹の周りが長くなるほど、同じだけ育っても輪の幅は薄く延ばされる。千年を超える木の外側の輪は、1 ミリに満たないこともある。'],
    ['輪の太さは、その年の天気の記録', '暖かく雨の多い年は太く、寒い年や乾いた年は細い。同じ地域の木は太さの並びが似るので、年代のわかった木と照らし合わせると、木が伐られた年まで決められる（年輪年代法）。'],
    ['法隆寺五重塔の心柱は 594 年に伐られた', '解体修理のときに切り取られた心柱（ヒノキ）の円盤を年輪年代法で調べ、伐採年は 594 年とされた。ただし塔のほかの部材は 7 世紀後半のもので、建立の年代はまだ議論がある。'],
    ['傷は輪に残る', '地震や嵐で傷んだ木は、その後の数年の輪が細くなったり乱れたりすることがある。この作品の朱の輪は、その跡を目に見えるように強めたもの。'],
  ], [
    ['長野県林業総合センター「年輪の話」', 'https://www.pref.nagano.lg.jp/ringyosogo/joho/kids/nenrin.html'],
    ['北海道立総合研究機構 林産試験場の資料', 'https://www.hro.or.jp/upload/9781/8910-4.pdf'],
    ['光谷拓実「法隆寺五重塔心柱の年輪年代」（奈良文化財研究所, 2001）', 'https://sitereports.nabunken.go.jp/article/10011'],
  ]);

  createElement('style', `
    #ringcard { position:absolute; width:280px; padding:10px 12px; background:rgb(${KASUMI}); color:rgb(${INK});
      border:1.5px solid rgb(${INK}); box-shadow:3px 3px 0 rgba(${INK},0.25); font:13px/1.6 "Hiragino Mincho ProN","Yu Mincho",serif;
      pointer-events:none; z-index:2; }
    #ringcard strong { display:block; font-size:16px; font-weight:normal; color:rgb(${SHU}); margin-bottom:2px; }
    #ringcard p { margin:0; }
    #stage { position:relative; line-height:0; }
    #learn-open { position:absolute; right:6.7%; top:3.6%; display:flex; flex-direction:column; align-items:center; gap:4px;
      padding:8px 6px 10px; background:rgb(${KASUMI}); color:rgb(${INK}); border:1.5px solid rgb(${INK});
      outline:0.8px solid rgb(${INK}); outline-offset:-5px; cursor:pointer; font:15px/1.2 "Hiragino Mincho ProN","Yu Mincho",serif; }
    #learn-open svg { width:22px; height:26px; }
    #learn-open span { writing-mode:vertical-rl; letter-spacing:0.15em; }
    #learn-open:hover { color:rgb(${SHU}); }
    #learn-open:focus-visible { outline:2px solid rgb(${SHU}); outline-offset:3px; }
    #learn { width:min(980px, calc(100vw - 32px)); max-height:min(86vh, 900px); padding:0; box-sizing:border-box;
      background:#d6c8a8; color:#2a2522; border:1.5px solid rgb(${INK}); font:14px/1.8 "Hiragino Mincho ProN","Yu Mincho",serif; }
    #learn::backdrop { background:rgba(36, 28, 22, 0.55); }
    #learn .head { position:sticky; top:0; display:flex; justify-content:space-between; align-items:center;
      padding:10px 18px; background:#cdbf9f; border-bottom:1px solid rgba(${INK},0.4); }
    #learn h1 { font-size:18px; font-weight:normal; margin:0; }
    #learn .tabs { display:flex; gap:0; margin:0 auto 0 28px; align-self:flex-end; margin-bottom:-11px; }
    #learn [role=tab] { font:inherit; font-size:15px; padding:6px 18px 8px; background:transparent; color:#5e5244;
      border:1px solid transparent; border-bottom:none; cursor:pointer; }
    #learn [role=tab][aria-selected=true] { background:#d6c8a8; color:rgb(${INK}); border-color:rgba(${INK},0.4); }
    #learn [role=tab]:hover { color:rgb(${SHU}); }
    #learn [role=tab]:focus-visible { outline:2px solid rgb(${SHU}); outline-offset:-3px; }
    #learn .head button.close { order:3; font:inherit; padding:2px 12px; background:#e2d6ba; border:1px solid #2a2522; border-radius:3px; cursor:pointer; }
    #learn .head button.close:focus-visible { outline:2px solid rgb(${SHU}); outline-offset:2px; }
    #learn .body { padding:4px 18px 18px; }
    #learn h2 { font-size:13px; font-weight:normal; color:#5e5244; margin:14px 0 0; }
    #learn dl { display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:4px 28px; margin:6px 0 4px; }
    #learn dt { color:rgb(${SHU}); margin-top:8px; }
    #learn dd { margin:0; }
    #learn .src { font-size:12px; color:#5e5244; margin:10px 0 0; }
    #learn .src a { color:inherit; margin-right:14px; }`).parent(document.head);
}

// --- 五重塔 ----------------------------------------------------------------------
function drawTower() {
  const baseX = TOWER_X, groundY = TOWER_BASE, sh = STORY_H;
  // 基壇：石を積んだ台。塔はこの上に載り、台ごと地面の帯の中に据わる。地震では台ごと揺れる
  const bx = baseX + ground.x, bw2 = 100, bh = 16, bdx = 34, bdy = -18;
  noStroke(); fill(...INK, 40); // 地面に落ちる影（光は左上から）
  ellipse(bx + 60 + tower.x[STORIES - 1] * 0.3, groundY + bh + 4, 330, 18);
  stroke(...INK); strokeWeight(1.2);
  fill(...STONE_TOP);
  quad(bx - bw2, groundY, bx + bw2, groundY, bx + bw2 + bdx, groundY + bdy, bx - bw2 + bdx, groundY + bdy);
  fill(STONE[0] - 30, STONE[1] - 30, STONE[2] - 30); // 右の側面は陰
  quad(bx + bw2, groundY, bx + bw2 + bdx, groundY + bdy, bx + bw2 + bdx, groundY + bdy + bh, bx + bw2, groundY + bh);
  fill(...STONE);
  rect(bx - bw2, groundY, bw2 * 2, bh);
  // 切石の目地
  stroke(...INK, 110); strokeWeight(0.8);
  for (let jx = bx - bw2 + 28; jx < bx + bw2; jx += 28) line(jx, groundY, jx, groundY + bh);

  const fall = tower.fallen;
  let prevX = ground.x;
  for (let i = 0; i < STORIES; i++) {
    const x = tower.x[i];
    const tilt = atan2(x - prevX, sh) + fall * (i + 1) * 0.12;
    const y = groundY - i * sh + fall * i * sh * 0.55;
    const bw = storyWidth(i), ew = bw * 1.9;
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
function stepWeatherState(dt) {
  const rain = ui.rain.value(), snow = ui.snow.value();
  snowCover = constrain(snowCover + (snow > 0.05 ? snow * 0.5 : -0.2) * dt, 0, snow > 0.05 ? 0.3 + snow * 0.7 : 1); // 降る量に見合うところまで積もる
  wetness = constrain(wetness + (rain > 0.05 ? rain * 0.6 : -0.12) * dt, 0, 1);
  for (const sp of splashes) sp.t -= dt * 2;
  splashes = splashes.filter((sp) => sp.t > 0);
  // 風の筋：風の強さに応じた本数を、風の向きに流す
  const wind = ui.wind.value(), want = floor(abs(wind) * 14);
  while (gusts.length < want) gusts.push({ x: random(W), y: random(60, 600), len: random(40, 110), sp: random(0.7, 1.3) });
  if (gusts.length > want) gusts.length = want;
  for (const g of gusts) {
    g.x += wind * 14 * g.sp;
    if (g.x > W + 120) g.x = -120; else if (g.x < -120) g.x = W + 120;
  }
}

// 濡れた地面。いちばん下の軒の下だけは乾いたまま残り、深い軒が足元を守っていることが見える
function drawWetGround() {
  if (wetness < 0.02 || tower.fallen > 0) return;
  const e = eaveLines()[0];
  const y0 = 640, a = 85 * wetness;
  noStroke();
  // 濡れた土の色を、軒の下の境目と左右の端でぼかしながら細い短冊で塗る（四角い板に見えないように）
  for (let x = 0; x < 760; x += 6) {
    const edge = min(abs(x - (e.x1 - 6)), abs(x - (e.x2 + 6)));
    const inside = x > e.x1 - 6 && x < e.x2 + 6;
    if (inside) continue;
    const k = min(1, edge / 36) * min(1, x / 60, (760 - x) / 60);
    for (let j = 0; j < 4; j++) { fill(70, 54, 40, a * k * (1 - j * 0.24)); rect(x, y0 + j * 9, 6, 9); }
  }
  // 雨落ち：軒先の真下で水が跳ねる
  stroke(...AI, 200); strokeWeight(1); noFill();
  for (const sp of splashes) {
    const r = (1 - sp.t) * 10 + 2;
    arc(sp.x, 652, r * 2, r * 0.7, PI, TWO_PI);
  }
  // 乾いた足元の境目に、細い墨の点線
  stroke(...INK, 90 * wetness);
  for (const x of [e.x1 - 6, e.x2 + 6]) for (let y = y0; y < y0 + 36; y += 6) line(x, y, x, y + 3);
}

// 屋根に積もった雪。積もるほど塔は重くなる
function drawSnowCaps() {
  if (snowCover < 0.02 || tower.fallen > 0) return;
  const th = 2 + snowCover * 7;
  for (const e of eaveLines()) {
    const w = e.x2 - e.x1, y = e.y - 10;
    fill(244, 238, 226); stroke(...INK, 150); strokeWeight(1);
    beginShape();
    for (let k = 0; k <= 16; k++) {
      const u = k / 16, x = e.x1 + 14 + (w - 28) * u;
      // 屋根の反りに合わせて、真ん中ほど高く積もる
      vertex(x, y - 6 * sin(PI * u) - th * pow(sin(PI * u), 0.6));
    }
    for (let k = 16; k >= 0; k--) vertex(e.x1 + 14 + (w - 28) * k / 16, y - 6 * sin(PI * k / 16));
    endShape(CLOSE);
  }
}

function drawGusts() {
  if (!gusts.length) return;
  const wind = ui.wind.value();
  stroke(...INK, 70 + 90 * abs(wind)); strokeWeight(1.2); noFill();
  for (const g of gusts) {
    // 浮世絵の風の筋のように、少し波打つ細い線
    beginShape();
    for (let k = 0; k <= 8; k++) vertex(g.x - Math.sign(wind) * g.len * k / 8, g.y + sin(k * 0.8 + frameCount * 0.1 + g.y) * 2);
    endShape();
  }
}

// いま雨・雪・風が何をしているかを、塔の足元に一行で書く
function drawWeatherCaption() {
  const rain = ui.rain.value(), snow = ui.snow.value(), wind = abs(ui.wind.value());
  const parts = [];
  if (rain > 0.05) parts.push('雨：軒が受けて外へ落とし、足元は乾く');
  if (snow > 0.05) parts.push(`雪：屋根に積もり、塔が重くなる ${floor(snowCover * 100)}%`);
  if (wind > 0.05) parts.push(ui.build.value() === 'nail' ? '風：釘の塔は硬く、しならない' : '風：木組みがしなって受け流す');
  noStroke(); fill(...INK, 190); textAlign(LEFT, BASELINE); textSize(12);
  text(parts.length ? parts.join('　') : '雨・雪・風のスライダーを動かすと、塔と年輪が応える', 40, 712);
}

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
    if (!d.slide && d.x < 760) {
      for (const e of eaves) {
        if (d.y > e.y - 4 && d.y < e.y + 4 && d.x > e.x1 && d.x < e.x2) {
          // 深い軒が受けて、外へ流す
          d.slide = true; d.vx = d.x < e.cx ? -2 : 2; d.vy = 0.5; break;
        }
      }
    }
    if (d.y > 650 || d.x < -20 || d.x > W + 20) {
      if (d.slide && !d.snow && d.y > 650 && splashes.length < 60) splashes.push({ x: d.x, t: 1 }); // 軒の外で地面に落ちる
      Object.assign(d, newDrop(-10));
    }
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
    const bw = storyWidth(i), ew = bw * 1.9, cx = TOWER_X + tower.x[i];
    out.push({ y: TOWER_BASE - i * STORY_H - STORY_H + 14, x1: cx - ew / 2, x2: cx + ew / 2, cx });
  }
  return out;
}

function drawTitle() {
  // 題箋（左上）。浮世絵の題名の札のように、縦書きで枠に入れる
  drawCartouche(40, 26, '木は覚えている', 24);
  drawCartouche(88, 26, '五重塔と心柱と年輪', 12, true);
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

// 風化の層。古い刷りの焼けと汚れを、透明な画像に一度だけ描いて最後に重ねる
function makePatina() {
  const g = createGraphics(W, H);
  g.pixelDensity(DENSITY);
  g.clear();
  const c = g.drawingContext;
  randomSeed(19);
  // 紙の焼け：大きく淡い茶のむら
  g.noStroke();
  for (let i = 0; i < 14; i++) {
    g.fill(120, 86, 46, random(6, 14));
    g.ellipse(random(W), random(H), random(160, 420), random(120, 300));
  }
  // しみ（狐色の点）
  for (let i = 0; i < 70; i++) {
    const r = random(1.5, 7);
    g.fill(128, 88, 44, random(18, 50));
    g.circle(random(W), random(H), r);
    g.fill(128, 88, 44, 10);
    g.circle(random(W), random(H), r * 3);
  }
  // 擦れ：明るい細い傷
  g.stroke(240, 230, 205, 40); g.strokeWeight(1);
  for (let i = 0; i < 40; i++) {
    const x = random(W), y = random(H), a = random(-0.3, 0.3);
    g.line(x, y, x + cos(a) * random(10, 50), y + sin(a) * random(10, 50));
  }
  // 折り目：版画を半分に畳んだ跡。暗い線と明るい線を並べる
  const fx = W * 0.58;
  g.stroke(60, 40, 20, 40); g.strokeWeight(1.5); g.line(fx, 0, fx + 3, H);
  g.stroke(250, 240, 215, 50); g.strokeWeight(1); g.line(fx + 2, 0, fx + 5, H);
  // 四隅の暗がり
  const grad = c.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.72);
  grad.addColorStop(0, 'rgba(60, 40, 20, 0)');
  grad.addColorStop(1, 'rgba(60, 40, 20, 0.42)');
  c.fillStyle = grad;
  c.fillRect(0, 0, W, H);
  randomSeed(Date.now());
  return g;
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
  // 上の段を短く重ね、端が段になった霞にする（一本の帯だと UI の部品に見える）
  for (const [x, y, w, h] of [[430, 220, 380, 26], [-30, 300, 250, 22], [560, 520, 360, 24], [-30, 470, 200, 20]]) {
    g.rect(x + w * 0.18, y - h * 0.7, w * 0.5, h, h / 2);
    g.rect(x, y, w, h, h / 2);
    g.noStroke(); g.rect(x + w * 0.18 + h / 2, y - 1, w * 0.5 - h, 3); g.stroke(...INK, 110); // 重なりの線を消す
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
  if (learnDialog?.elt.open) return; // 解説を開いている間は作品を触らない
  // 画面のクリックで始めるのは最初の幕だけ。止めた後は、年輪を読むためのクリックで動き出さないようにする
  if (paused && !everStarted && mouseX >= 0 && mouseX <= W && mouseY >= 0 && mouseY <= H) togglePause();
}

function mouseDragged() {
  if (learnDialog?.elt.open) return;
  if (mouseX < 760 && mouseY < H && abs(dragShake) < 1) quakeRecorded = false; // 手で揺らし始めたら、新しい地震として 1 本残す
  if (mouseX < 760 && mouseY < H) dragShake = constrain(dragShake + movedX * 0.8, -40, 40);
}

function keyPressed() {
  if (learnDialog?.elt.open) return; // スペースなどは解説の操作に使う
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
