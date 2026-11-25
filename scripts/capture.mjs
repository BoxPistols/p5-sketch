// 作品の画面を撮り、works/<slug>/capture.png に保存する。一覧ページと README のサムネイルになる
// 使い方: pnpm capture            … 全作品
//        pnpm capture <slug>     … 1 作品だけ
// Chrome をヘッドレスで起動する。Chrome の場所が違うときは環境変数 CHROME で指定する
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const chrome = process.env.CHROME
  ?? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']
    .find((p) => existsSync(p));
if (!chrome) {
  console.error('Chrome が見つかりません。CHROME=/path/to/chrome pnpm capture のように指定してください');
  process.exit(1);
}

const only = process.argv[2];
const works = JSON.parse(readFileSync(join(root, 'works.json'), 'utf8')).filter((w) => !only || w.slug === only);
if (works.length === 0) {
  console.error(`works.json に ${only} がありません`);
  process.exit(1);
}

for (const w of works) {
  const page = pathToFileURL(join(root, 'works', w.slug, 'index.html')).href + (w.capture ?? '');
  const out = join(root, 'works', w.slug, 'capture.png');
  // 普段使っている Chrome のプロファイルとぶつからないよう、毎回使い捨てのプロファイルで起動する
  const profile = mkdtempSync(join(tmpdir(), 'p5-capture-'));
  execFileSync(chrome, [
    `--user-data-dir=${profile}`, '--headless=new', '--hide-scrollbars', '--window-size=1240,860',
    '--virtual-time-budget=3000', // 数フレーム描かせてから撮る
    // capture=1 を付けると、作品は「スペースキーで始める」の幕を出さずに動く
    `--screenshot=${out}`, page + (page.includes('?') ? '&' : '?') + 'capture=1',
  ], { stdio: 'ignore', timeout: 90_000 });
  rmSync(profile, { recursive: true, force: true });
  console.log(`撮りました: works/${w.slug}/capture.png`);
}
