// Тесты src/matte/face.ts (задача 025). Запуск: npm run test:matte [-- --negative]
// --negative — позитивный контроль (гейт 4): добавляет заведомо неверное ожидание и ОБЯЗАН упасть.
import { faceAt, faceDuration, loadFace } from './face.ts';

let failed = 0;
const expect = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failed++;
};
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;
const throws = (fn: () => unknown) => { try { fn(); return false; } catch { return true; } };

const json = {
  fps: 24, from: 8,
  frames: [
    { t: 0.5, cx: 600, cy: 700, w: 300, source: 'silhouette' }, // нарочно не по порядку
    { t: 0, cx: 500, cy: 600, w: 200, source: 'vision' },
    { t: 1, cx: 700, cy: 800, w: 400, source: 'hold' },
  ],
};
const tr = loadFace(json);
expect('loadFace: fps/from/кадры отсортированы по t', tr.fps === 24 && tr.from === 8 && tr.frames.map((f) => f.t).join() === '0,0.5,1');
expect('faceAt: до первого кадра — первый', faceAt(tr, -1).cx === 500 && faceAt(tr, -1).source === 'vision');
expect('faceAt: после последнего — последний', faceAt(tr, 5).w === 400 && faceAt(tr, 5).source === 'hold');
expect('faceAt: точно на кадре', faceAt(tr, 0.5).cx === 600 && faceAt(tr, 0.5).source === 'silhouette');
const m = faceAt(tr, 0.25);
expect('faceAt: середина 0…0.5 — линейно', near(m.cx, 550) && near(m.cy, 650) && near(m.w, 250), `cx ${m.cx} cy ${m.cy} w ${m.w}`);
expect('faceAt: source ближайшего кадра (0.2 → vision, 0.3 → silhouette)', faceAt(tr, 0.2).source === 'vision' && faceAt(tr, 0.3).source === 'silhouette');
expect('faceAt: 0.75 → cx 650, source hold', near(faceAt(tr, 0.75).cx, 650) && faceAt(tr, 0.75).source === 'hold');
expect('faceDuration: последний t + 1/fps', near(faceDuration(tr), 1 + 1 / 24));
expect('faceAt: пустая дорожка → none, w 0', faceAt({ fps: 30, from: 0, frames: [] }, 1).source === 'none' && faceAt({ fps: 30, from: 0, frames: [] }, 1).w === 0);
expect('loadFace: без fps — ошибка', throws(() => loadFace({ frames: [] })));
expect('loadFace: source не из списка — ошибка', throws(() => loadFace({ fps: 30, frames: [{ t: 0, cx: 1, cy: 1, w: 1, source: 'haar' }] })));
expect('loadFace: не число — ошибка', throws(() => loadFace({ fps: 30, frames: [{ t: 0, cx: '1', cy: 1, w: 1, source: 'vision' }] })));
expect('loadFace: без from → 0', loadFace({ fps: 30, frames: [] }).from === 0);

if (process.argv.includes('--negative')) {
  console.log('ПОЗИТИВНЫЙ КОНТРОЛЬ: заведомо неверное ожидание (faceAt(0.25).cx === 600) — обязано упасть');
  expect('negative: faceAt(0.25).cx === 600', faceAt(tr, 0.25).cx === 600);
}
console.log(failed ? `ПРОВАЛ: ${failed}` : 'OK');
process.exit(failed ? 1 : 0);
