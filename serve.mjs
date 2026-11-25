// 依存なしの開発サーバー。ファイルを保存するとブラウザが自動で再読み込みする
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { execFile } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

// 起動オプション: --port <番号> / --open（ブラウザを開く） / --host（同じ LAN の端末から見られるようにする）
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(option('port') ?? process.env.PORT) || 5173;
const host = flag('host') ? '0.0.0.0' : '127.0.0.1';
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff2': 'font/woff2',
};
const reloadSnippet = `<script>new EventSource('/__reload').onmessage=()=>location.reload()</script>`;
const clients = new Set();

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/__reload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  let file = normalize(join(root, path));
  if (!file.startsWith(root)) return res.writeHead(403).end();
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    let body = await readFile(file);
    const ext = extname(file);
    if (ext === '.html') body = body.toString().replace('</body>', `${reloadSnippet}</body>`);
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).on('error', (err) => {
  // ポートが使用中なら、別の番号を案内して終わる
  if (err.code === 'EADDRINUSE') console.error(`ポート ${port} は使用中です。--port 5174 のように別の番号を指定してください`);
  else console.error(err);
  process.exit(1);
}).listen(port, host, () => {
  const url = `http://localhost:${port}`;
  console.log(`  ローカル: ${url}`);
  if (flag('host')) {
    for (const nets of Object.values(networkInterfaces())) {
      for (const n of nets ?? []) if (n.family === 'IPv4' && !n.internal) console.log(`  LAN:     http://${n.address}:${port}`);
    }
  }
  if (flag('open')) execFile(process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open', [url]);
});

let timer;
watch(root, { recursive: true }, (_, name) => {
  if (!name || name.startsWith('lib') || name.startsWith('.')) return;
  clearTimeout(timer);
  timer = setTimeout(() => clients.forEach((c) => c.write('data: reload\n\n')), 100);
});
