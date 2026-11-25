// Sandbox のページ（works/*/index.html の <script type="text/p5" id="source">）のコードの構文を調べる
// sketch.js は node --check で調べるが、Sandbox のコードは HTML の中にあるので、ここで取り出して調べる
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { Script } from 'node:vm';

const root = fileURLToPath(new URL('..', import.meta.url));
let failed = false;
for (const slug of readdirSync(join(root, 'works'))) {
  const page = join(root, 'works', slug, 'index.html');
  if (!existsSync(page)) continue;
  const m = /<script type="text\/p5" id="source">([\s\S]*?)<\/script>/.exec(readFileSync(page, 'utf8'));
  if (!m) continue;
  try {
    new Script(m[1], { filename: `works/${slug}/index.html#source` });
  } catch (e) {
    console.error(`works/${slug}: ${e.message}`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
