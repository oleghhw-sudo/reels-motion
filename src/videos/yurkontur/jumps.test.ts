// Проверка скачков раскладки (правки Олега 08.11: «ни одного скачка между соседними кадрами» в блоках 2–3а):
//   node --experimental-strip-types --no-warnings src/videos/yurkontur/jumps.test.ts [--negative] [--from S --to S --fps N]
// Скачок — изменение за один кадр больше порога И больше 3× соседних изменений (плавное движение с easing — нет).
// --negative — позитивный контроль: смены раскладки за 1 кадр (как в сорванном аниматике) — проверка обязана упасть.
import { cardLayout } from './layout.ts';
import { EV } from './stage.ts';

const arg = (k: string, d: number) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? Number(process.argv[i + 1]) : d;
};
const negative = process.argv.includes('--negative');
const FROM = arg('--from', 19);
const TO = arg('--to', 54.5);
const FPS = arg('--fps', 30);
const move = negative ? 1 / FPS : undefined;

const metrics = ['x', 'y', 'w', 'h', 'labelPx', 'open', 'opacity', 'readA', 'textA', 'detailA', 'active', 'greenFill'] as const;
const MIN: Record<(typeof metrics)[number], number> = { x: 12, y: 12, w: 12, h: 12, labelPx: 3, open: 0.15, opacity: 0.5, readA: 0.3, textA: 0.3, detailA: 0.3, active: 0.3, greenFill: 0.3 };

const series = new Map<string, number[]>();
const visible = new Map<string, number[]>(); // видимость карточки (для текстовых рядов — «живость» × видимость)
const TEXT = new Set(['readA', 'textA', 'detailA', 'labelPx']);
const N = Math.round((TO - FROM) * FPS);
for (let i = 0; i <= N; i++) {
  const t = FROM + i / FPS;
  for (const c of cardLayout(t, { move, humanFillAt: EV.queue.human })) {
    const v = { x: c.rect.x, y: c.rect.y, w: c.rect.w, h: c.rect.h, labelPx: c.labelPx, open: c.open, opacity: c.opacity, readA: c.readA, textA: c.textA, detailA: c.detailA, active: c.active, greenFill: c.greenFill };
    for (const m of metrics) {
      const key = `${c.n.id}.${m}`;
      if (!series.has(key)) series.set(key, []);
      series.get(key)!.push(v[m]);
      if (!visible.has(key)) visible.set(key, []);
      visible.get(key)!.push(TEXT.has(m) ? c.vis * c.live : c.vis);
    }
  }
}
const jumps: string[] = [];
for (const [key, vals] of series) {
  const m = key.split('.')[1] as (typeof metrics)[number];
  const d = vals.slice(1).map((v, i) => Math.abs(v - vals[i]));
  const vis = visible.get(key)!;
  // крайние изменения ряда не судим (нет соседа с одной стороны)
  for (let i = 1; i < d.length - 1; i++) {
    if (Math.max(vis[i], vis[i + 1]) < 0.05) continue; // невидимое не считаем
    // текст карточки, которая сама быстро летит (проезд камеры), гаснет вместе с движением — это не скачок раскладки
    if (TEXT.has(m)) {
      const id = key.split('.')[0];
      const xs = series.get(`${id}.x`)!;
      const ys = series.get(`${id}.y`)!;
      if (Math.abs(xs[i + 1] - xs[i]) + Math.abs(ys[i + 1] - ys[i]) > 30) continue;
    }
    const nb = Math.max(d[i - 1] ?? 0, d[i + 1] ?? 0, 1e-6);
    if (d[i] > MIN[m] && d[i] > 3 * nb) jumps.push(`${key}: ${d[i].toFixed(2)} за кадр на ${(FROM + (i + 1) / FPS).toFixed(3)} с (соседние ${(d[i - 1] ?? 0).toFixed(2)} / ${(d[i + 1] ?? 0).toFixed(2)})`);
  }
}
console.log(`Кадров: ${N + 1} (${FROM}–${TO} с, ${FPS} fps), рядов: ${series.size}${negative ? ' · ПОЗИТИВНЫЙ КОНТРОЛЬ: смены раскладки за 1 кадр' : ''}`);
if (jumps.length) {
  console.error(`ПРОВАЛ: скачков ${jumps.length}`);
  for (const j of jumps.slice(0, 20)) console.error('  ✗ ' + j);
  process.exit(1);
}
console.log('OK: скачков раскладки нет');
