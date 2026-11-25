// 新しい作品のひな形を works/<slug>/ に作り、works.json に登録する
// 使い方: pnpm new <slug> "<題名>"
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const PAGES_URL = 'https://boxpistols.github.io/p5-sketch/'; // GitHub Pages で公開したときの URL（og:image は絶対 URL が要る）
const [slug, title = slug] = process.argv.slice(2);
if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
  console.error('使い方: pnpm new <slug> "<題名>"（slug は英小文字・数字・ハイフン。URL になる）');
  process.exit(1);
}
const dir = join(root, 'works', slug);
if (existsSync(dir)) {
  console.error(`works/${slug} はもうあります`);
  process.exit(1);
}
mkdirSync(dir, { recursive: true });

writeFileSync(join(dir, 'index.html'), `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${title}（p5.js の作品）">
  <link rel="icon" href="../../favicon.svg" type="image/svg+xml">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${title}">
  <meta property="og:url" content="${PAGES_URL}works/${slug}/">
  <meta property="og:image" content="${PAGES_URL}works/${slug}/capture.png">
  <meta name="twitter:card" content="summary_large_image">
  <style>
    html, body { margin: 0; min-height: 100%; background: #111; }
    body { display: flex; align-items: center; justify-content: center; }
    canvas { display: block; max-width: 100vw; height: auto !important; }
  </style>
  <script src="../../lib/p5-2.4.0.min.js"></script>
  <script src="sketch.js"></script>
</head>
<body></body>
</html>
`);

writeFileSync(join(dir, 'sketch.js'), `// ${title}
// グローバルモード。p5 Web Editor や OpenProcessing にそのまま貼っても動く
// キー: s = PNG 保存 / スペース = 一時停止

const FPS = 30;     // CPU を食わないよう 30fps
const DENSITY = 1;  // Retina でも画素を増やさない
let paused = false;

function setup() {
  pixelDensity(DENSITY);
  frameRate(FPS);
  createCanvas(800, 800);
  // タブが裏に回ったら止める
  document.addEventListener('visibilitychange', () => (document.hidden || paused ? noLoop() : loop()));
}

function draw() {
  background(17);
  noStroke();
  fill(240);
  circle(width / 2 + 200 * cos(frameCount * 0.03), height / 2, 40);
}

function keyPressed() {
  if (key === 's') saveCanvas('${slug}', 'png');
  if (key === ' ') { paused = !paused; paused ? noLoop() : loop(); return false; }
}
`);

const listPath = join(root, 'works.json');
const works = JSON.parse(readFileSync(listPath, 'utf8'));
works.unshift({ slug, title, summary: '', created: new Date().toISOString().slice(0, 10) });
writeFileSync(listPath, JSON.stringify(works, null, 2) + '\n');

console.log(`作りました: works/${slug}/（works.json の先頭に登録）`);
console.log(`開く: http://localhost:5173/works/${slug}/`);
