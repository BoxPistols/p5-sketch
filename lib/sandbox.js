// Sandbox のページ。左でスケッチのコードを書き換え、右の枠で動かす。
// コードはページの <script type="text/p5" id="source"> に置く（file:// で開いても読めるよう、別ファイルにしない）。
// 枠は srcdoc の iframe で、実行のたびに作り直す（前のスケッチの変数や draw() を残さない）。
(() => {
  const source = document.getElementById('source');
  const original = source.textContent.replace(/^\n/, '').replace(/\s+$/, '') + '\n';
  // p5.js はこのリポジトリの lib/ のものを使う。srcdoc の中では相対パスが解決できないので絶対 URL にする
  const p5Url = new URL('p5-2.4.0.min.js', document.currentScript.src).href;

  const code = document.getElementById('code');
  const stage = document.getElementById('stage');
  const status = document.getElementById('status');
  code.value = original;

  // 枠の中で動かすもの。エラーは親へ送って、コードの何行目かを出す
  const prelude = `<script>
    const report = (message, line) => parent.postMessage({ type: 'sketch-error', message, line }, '*');
    addEventListener('error', (e) => report(e.message, e.lineno));
    // p5 2.x は setup() を非同期で呼ぶので、setup() の中のエラーは Promise の拒否として届く。行番号はスタックから取る
    addEventListener('unhandledrejection', (e) => {
      const err = e.reason;
      const m = /about:srcdoc:(\\d+)/.exec(err?.stack ?? '');
      report(err?.message ?? String(err), m ? Number(m[1]) : 0);
    });
    // 最初のコマ（setup() と 1 回目の draw()）を描いたら親へ知らせる。親はそれまで「読み込み中」を出す
    const waitFirstFrame = () => {
      if (document.querySelector('canvas') && (typeof frameCount !== 'number' || frameCount > 0)) {
        parent.postMessage({ type: 'sketch-ready' }, '*');
      } else requestAnimationFrame(waitFirstFrame);
    };
    requestAnimationFrame(waitFirstFrame);
    // タブが裏に回ったら止め、戻ったら止める前の状態に戻す（noLoop() のスケッチを勝手に動かさない）
    let wasLooping = true;
    document.addEventListener('visibilitychange', () => {
      if (typeof isLooping !== 'function') return;
      if (document.hidden) { wasLooping = isLooping(); noLoop(); }
      else if (wasLooping) loop();
    });
  <\/script>`;
  const head = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;height:100%;background:transparent}body{display:flex;align-items:center;justify-content:center}canvas{display:block;max-width:100%;height:auto!important}</style>
${prelude}
<script src="${p5Url}"><\/script>
<script>
`;
  // エラーの行番号から、コードの 1 行目までの行数を引く
  const offset = head.split('\n').length - 1;

  // 新しい枠は描き始めるまで透明にしておき、描いたら前の枠と入れ替える（実行のたびに真っ黒にならないように）
  let pending = null;
  let fallback = 0;
  function show(frame) {
    if (frame !== pending) return;
    pending = null;
    clearTimeout(fallback);
    for (const old of stage.querySelectorAll('iframe')) if (old !== frame) old.remove();
    frame.classList.remove('pending');
    stage.classList.add('ready');
    status.textContent = '';
  }

  function run() {
    // 再実行では前の絵が残るので、押したことが分かるよう描き始めるまで出しておく
    status.textContent = '実行中';
    status.classList.remove('error');
    pending?.remove();
    const frame = document.createElement('iframe');
    frame.className = 'pending';
    frame.title = document.title + 'の実行結果';
    // 枠のコードから親のページを触れないよう sandbox にする。file:// では sandbox の枠が
    // lib/ の p5.js を読めない（origin が不透明になる）ので、手元で直接開いたときだけ外す
    if (location.protocol !== 'file:') frame.setAttribute('sandbox', 'allow-scripts allow-downloads');
    // </script> がコードに入っていても枠の中のスクリプトが切れないよう、エスケープする
    frame.srcdoc = head + code.value.replace(/<\/script/gi, '<\\/script') + '\n<\/script></head><body></body></html>';
    stage.append(frame);
    pending = frame;
    // 知らせが来ないスケッチ（canvas を作らない等）でも、いつまでも隠したままにしない
    clearTimeout(fallback);
    fallback = setTimeout(() => show(frame), 4000);
  }

  addEventListener('message', (e) => {
    const frame = [...stage.querySelectorAll('iframe')].find((f) => f.contentWindow === e.source);
    if (!frame) return;
    if (e.data?.type === 'sketch-ready') { show(frame); return; }
    if (e.data?.type !== 'sketch-error') return;
    // エラーなら描き始めないので、待たずに入れ替える
    show(frame);
    const line = e.data.line - offset;
    status.textContent = (line > 0 ? `${line} 行目: ` : '') + e.data.message;
    status.classList.add('error');
  });

  document.getElementById('run').addEventListener('click', run);
  document.getElementById('reset').addEventListener('click', () => {
    code.value = original;
    run();
  });
  // ⌘ / Ctrl + Enter で実行する。Tab は字下げにする（フォーカスを外すのは Esc のあとの Tab）
  let escaped = false;
  code.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      run();
      return;
    }
    if (e.key === 'Escape') { escaped = true; return; }
    if (e.key === 'Tab' && !e.shiftKey && !escaped) {
      e.preventDefault();
      code.setRangeText('  ', code.selectionStart, code.selectionEnd, 'end');
    }
    escaped = false;
  });

  run();
})();
