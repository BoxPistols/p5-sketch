// グローバルモード。p5 Web Editor や OpenProcessing にそのまま貼っても動く
// キー操作: s = PNG で保存 / スペース = 一時停止・再開

let running = true;

function setup() {
  createCanvas(800, 800);
  colorMode(HSB, 360, 100, 100, 100);
  background(0, 0, 8);
}

function draw() {
  background(0, 0, 8, 6);
  noStroke();
  const t = frameCount * 0.01;
  for (let i = 0; i < 12; i++) {
    const a = t + (TWO_PI / 12) * i;
    const r = 220 + 80 * sin(t * 2 + i);
    fill((i * 30 + frameCount) % 360, 70, 95, 80);
    circle(width / 2 + r * cos(a), height / 2 + r * sin(a), 24);
  }
}

function keyPressed() {
  if (key === 's') saveCanvas('sketch', 'png');
  if (key === ' ') {
    running = !running;
    running ? loop() : noLoop();
  }
}
