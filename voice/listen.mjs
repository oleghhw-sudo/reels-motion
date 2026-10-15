// out/voice/listen.html — статическая страница прослушки калибровки (открывается файлом, без сервера).
// По голосу — плееры фраз с текстом и подсветкой текущего слова по words.json (данные встроены в страницу:
// file:// не даёт fetch). Аудио — относительные пути <slug>/<n>.wav рядом со страницей.
// Подсветка идёт от audio.currentTime через requestAnimationFrame: это QA-страница в браузере, а не кадр
// Remotion — гейт 1 (всё в кадре — функция кадра) к ней не относится.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function writeListenPage({ outDir, voices, scale }) {
  const data = voices.map((v) => ({
    id: v.id,
    title: v.title,
    url: v.url,
    phrases: v.phrases.filter((p) => p.metrics).map((p) => ({ n: p.n, text: p.text, checks: p.checks, wav: p.wav, words: p.words, ok: p.metrics.ok, gapMs: p.metrics.end.gapMs, cps: p.metrics.tempo.cps })),
  }));
  const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Прослушка голоса</title>
<style>
  :root { --bg: #f6f4ef; --card: #ffffff; --ink: #1d1b18; --mute: #6f6a63; --line: #e2ddd3; --hi: #ffd34d; --hi-ink: #1d1b18; --bad: #c0392b; --ok: #2e8b57; }
  @media (prefers-color-scheme: dark) { :root { --bg: #17161a; --card: #222126; --ink: #efeae0; --mute: #9a948a; --line: #34323a; --hi: #d9a05b; --hi-ink: #17161a; --bad: #ff6b5c; --ok: #2edba8; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 -apple-system, "Segoe UI", system-ui, sans-serif; }
  main { max-width: 920px; margin: 0 auto; padding: 24px 16px 64px; }
  h1 { font-size: 24px; margin: 0 0 4px; } h2 { font-size: 20px; margin: 32px 0 8px; }
  .mute { color: var(--mute); font-size: 14px; } a { color: inherit; }
  .scale { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px 16px; margin: 16px 0; }
  .scale li { margin: 4px 0; }
  .ph { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px 16px; margin: 10px 0; }
  .ph header { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .n { font-weight: 700; } .tag { font-size: 13px; padding: 1px 8px; border-radius: 99px; border: 1px solid var(--line); }
  .tag.ok { color: var(--ok); } .tag.bad { color: var(--bad); }
  .text { margin: 6px 0; } audio { width: 100%; margin: 6px 0 2px; }
  .words { font-size: 22px; line-height: 1.6; }
  .w { padding: 0 3px; border-radius: 4px; cursor: pointer; }
  .w.on { background: var(--hi); color: var(--hi-ink); }
</style>
</head>
<body>
<main>
  <h1>Прослушка калибровки голоса</h1>
  <div class="mute">Задача 002 · модель s2.1-pro-free · подсветка — по таймингам alignment Fish (words.json). Клик по слову — перейти к нему. Оценки записывать в out/voice/report.md.</div>
  <div class="scale"><b>Шкала оценки (1–5)</b><ul>${scale.map(([k, v]) => `<li><b>${esc(k)}</b>: ${esc(v)}</li>`).join('')}</ul></div>
  <div id="root"></div>
</main>
<script id="data" type="application/json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
<script>
  const voices = JSON.parse(document.getElementById('data').textContent);
  const root = document.getElementById('root');
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  for (const v of voices) {
    const h = el('h2', '', v.title); root.append(h);
    const link = el('div', 'mute'); const a = el('a', '', v.url); a.href = v.url; a.target = '_blank'; link.append(a); root.append(link);
    for (const p of v.phrases) {
      const box = el('section', 'ph');
      const hd = el('header');
      hd.append(el('span', 'n', '#' + p.n), el('span', 'mute', p.checks), el('span', 'tag ' + (p.ok ? 'ok' : 'bad'), (p.ok ? 'метрики OK' : 'метрики FAIL') + ' · конец ' + p.gapMs + ' мс · ' + p.cps + ' cps'));
      box.append(hd, el('div', 'text', p.text));
      const audio = el('audio'); audio.controls = true; audio.preload = 'metadata'; audio.src = p.wav;
      const words = el('div', 'words');
      const spans = p.words.map((w) => { const s = el('span', 'w', w.text); s.title = w.start.toFixed(2) + '–' + w.end.toFixed(2) + ' с'; s.onclick = () => { audio.currentTime = w.start; audio.play(); }; words.append(s, ' '); return s; });
      let raf = 0;
      const paint = () => { const t = audio.currentTime; p.words.forEach((w, i) => spans[i].classList.toggle('on', t >= w.start && t < w.end)); };
      const loop = () => { paint(); if (!audio.paused) raf = requestAnimationFrame(loop); };
      audio.addEventListener('play', () => { cancelAnimationFrame(raf); loop(); });
      audio.addEventListener('pause', paint); audio.addEventListener('seeked', paint); audio.addEventListener('ended', paint);
      box.append(audio, words);
      root.append(box);
    }
  }
</script>
</body>
</html>
`;
  const file = join(outDir, 'listen.html');
  writeFileSync(file, html);
  return file;
}
