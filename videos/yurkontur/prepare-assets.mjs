#!/usr/bin/env node
// Ассеты видео «Юридичний контур АНЦ» (задача 031) → public/videos/yurkontur/ (gitignore) + videos/yurkontur/assets.manifest.json.
// Только реальные фрагменты (новый интерфейс не рисуется): сканы s5_* из YURKONTUR_DIR, столбец «Название файла» legacy_2,
// вырезки стенда YURKONTUR_STAND (chrome-headless-shell Remotion по CDP, 1280×720·1.5 → кадр 1920×1080).
// Пути — только из окружения (env.manifest.json, гейт 2); нет переменной — громкий отказ.
// Запуск: YURKONTUR_DIR=… YURKONTUR_STAND=… YURKONTUR_LEGACY_DIR=… node videos/yurkontur/prepare-assets.mjs
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const need = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Не задан ${k} (env.manifest.json → data_dirs; npm run check -- --scope yurkontur)`);
  if (!existsSync(v)) throw new Error(`${k}=${v} не существует`);
  return v;
};
const Y = need('YURKONTUR_DIR');
const STAND = need('YURKONTUR_STAND');
const LEGACY = need('YURKONTUR_LEGACY_DIR');
const OUT = join(ROOT, 'public/videos/yurkontur');
mkdirSync(OUT, { recursive: true });
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const items = [];
const add = (out, src, how) => items.push({ file: relative(ROOT, out), source: src, how, sha256: sha(out) });

// 1. Фрагменты сканов (ПДн закрыты в источнике — presentation-mvp/REAL_FRAMES.md)
const REAL = join(Y, 'presentation-mvp/assets/real');
for (const f of ['s5_crop_1.png', 's5_crop_2.png', 's5_crop_3.png', 's5_crop_4.png', 's5_ctx_1.jpg', 's5_ctx_2.jpg', 's5_ctx_3.jpg', 's5_ctx_4.jpg']) {
  const o = join(OUT, f);
  copyFileSync(join(REAL, f), o);
  add(o, `YURKONTUR_DIR/presentation-mvp/assets/real/${f}`, 'копия');
}

// 2. legacy_2: столбец «Название файла», 25 строк (3024×1964 → x 748, y 620, 900×906)
{
  const o = join(OUT, 'legacy2-files.png');
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', join(LEGACY, 'legacy_2.png'), '-vf', 'crop=900:906:748:620', o], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg: вырезка legacy_2 не удалась');
  add(o, 'YURKONTUR_LEGACY_DIR/legacy_2.png', 'crop=900:906:748:620 (столбец «Название файла», 25 строк)');
}

// 3. Стенд — крупные фрагменты для показа с мелким текстом ≥ 20 px на кадре 1920×1080 (правки Олега 08.11):
//    съёмка deviceScaleFactor 3 (запас под наезды), PNG без пережатия; встроенные в стенд картинки (план, скан) — исходные
//    байты JPEG стенда без перекодирования. Геометрия фрагментов (в px картинки) → videos/yurkontur/stand-geometry.json.
const DPR = 3;
const geo = { dpr: DPR };
{
  const b = await launch(ROOT, { width: 1280, height: 1400, scale: DPR });
  try {
    const rectOf = (expr, pad = 0) => b.evaluate(`(() => { const e = (${expr}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x - ${pad}, y: r.y - ${pad}, width: r.width + ${pad * 2}, height: r.height + ${pad * 2} }; })()`);
    const inPx = (r, o) => ({ x: (r.x - o.x) * DPR, y: (r.y - o.y) * DPR, w: r.width * DPR, h: r.height * DPR });
    const save = async (name, clip, src, how) => {
      if (!clip) throw new Error(`Стенд: не найден фрагмент для ${name}`);
      const o = join(OUT, name);
      writeFileSync(o, await b.shot(clip));
      add(o, src, how);
      return { w: Math.round(clip.width * DPR), h: Math.round(clip.height * DPR) };
    };
    // 3а. очередь: карточка задачи и «Два незалежних читання»
    await b.goto('file://' + STAND + '#/queue/T-doc3-rent', 6000);
    const readingsBox = `(() => { const t = [...document.querySelectorAll('div')].find(e => e.textContent.trim().startsWith('Два незалежних читання') && e.getBoundingClientRect().height < 40); let p = t; while (p && p.getBoundingClientRect().height < 150) p = p.parentElement; return p; })()`;
    const cardR = await rectOf(`document.querySelector('.d-q-card')`);
    geo.card = await save('stand-queue-card.png', cardR, 'YURKONTUR_STAND#/queue/T-doc3-rent', 'карточка задачи «Орендна плата за договором · doc3» до решения, DPR 3');
    geo.card.confirm = inPx(await rectOf(`[...document.querySelectorAll('button')].find(x => x.textContent.trim().startsWith('Підтвердити'))`), cardR);
    geo.card.readings = inPx(await rectOf(readingsBox), cardR);
    geo.readingsMatch = await save('stand-readings-match.png', await rectOf(readingsBox, 10), 'YURKONTUR_STAND#/queue/T-doc3-rent', '«Два незалежних читання»: A и B совпали, DPR 3');
    await b.evaluate(`[...document.querySelectorAll('button')].find(x => x.textContent.trim().startsWith('Підтвердити')).click()`);
    await b.sleep(1200);
    const title = await b.evaluate(`document.querySelector('.d-q-card h3')?.textContent ?? ''`);
    if (!/Комунальні/.test(title)) throw new Error(`Стенд: после «Підтвердити» ожидалась задача «Комунальні», а открыта «${title}»`);
    geo.readingsDiff = await save('stand-readings-diff.png', await rectOf(readingsBox, 10), 'YURKONTUR_STAND#/queue/T-doc3-rent', '«Два незалежних читання» следующей задачи «Комунальні · doc3»: розійшлися, DPR 3');

    // 3б. блок 2: картка аптеки — Договір (поле «Ставка чинна») и скан по «Показати в скані» этого поля
    await b.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: DPR, mobile: false });
    await b.goto('file://' + STAND + '#/card/doc1/contract', 4000);
    const CLIP = { x: 290, y: 0, width: 990, height: 720 }; // без меню ALI (левые 290 CSS px)
    geo.contract = await save('stand-b2-contract.png', CLIP, 'YURKONTUR_STAND#/card/doc1/contract', 'вкладка «Договір» без меню ALI, DPR 3');
    geo.contract.tabs = inPx(await rectOf(`[...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'План')?.parentElement`), CLIP);
    geo.contract.rate = inPx(await rectOf(`(() => { const t = [...document.querySelectorAll('div')].find(e => e.textContent.trim().startsWith('Ставка чинна') && e.getBoundingClientRect().height < 30); let p = t; while (p && p.getBoundingClientRect().height < 80) p = p.parentElement; return p; })()`), CLIP);
    // «Показати в скані» в строке «Ставка за договором» списка «Усі поля договору»: у «Ставка чинна» (розраховано з ланцюга)
    // стенд рамки на скане не ставит — значение не прочитано с одной страницы, а выведено из ланцюга документов
    const clicked = await b.evaluate(`(() => { const row = [...document.querySelectorAll('.d-card-fact')].find(e => /^Ставка за договором/.test(e.textContent.trim())); const btn = row && [...row.querySelectorAll('button')].find(x => /Показати в скані/.test(x.textContent)); if (!btn) return false; btn.click(); return true; })()`);
    if (!clicked) throw new Error('Стенд: в строке «Ставка за договором» нет кнопки «Показати в скані»');
    await b.sleep(2500);
    const lb = await b.evaluate(`(() => { const img = [...document.querySelectorAll('.d-lb-fig img, img')].find(i => i.closest('.d-lb-fig')); if (!img) return null; const ir = img.getBoundingClientRect(); const k = img.naturalWidth / ir.width; const boxes = [...img.closest('.d-lb-fig').querySelectorAll('.d-lb-box')].map(e => { const r = e.getBoundingClientRect(); return { x: (r.x - ir.x) * k, y: (r.y - ir.y) * k, w: r.width * k, h: r.height * k }; }); return { src: img.src, w: img.naturalWidth, h: img.naturalHeight, boxes }; })()`);
    if (!lb || !lb.boxes.length) throw new Error('Стенд: лайтбокс скана без рамки .d-lb-box');
    const m = /^data:image\/(\w+);base64,(.*)$/.exec(lb.src);
    const scanOut = join(OUT, 'stand-b2-scan.' + (m[1] === 'jpeg' ? 'jpg' : m[1]));
    writeFileSync(scanOut, Buffer.from(m[2], 'base64'));
    add(scanOut, 'YURKONTUR_STAND#/card/doc1/contract → «Показати в скані» (Ставка за договором)', 'исходные байты скана из стенда, без перекодирования');
    geo.scan = { file: scanOut.split('/').pop(), w: lb.w, h: lb.h, boxes: lb.boxes };

    // 3в. блок 2: план приміщення — встроенная картинка вкладки «План» (2400×1197), обрезка до самого плана, без меню ALI
    await b.goto('file://' + STAND + '#/card/ANC-0412/plan', 4000);
    const pl = await b.evaluate(`(() => { const i = [...document.querySelectorAll('img')].sort((a, z) => z.width * z.height - a.width * a.height)[0]; return { src: i.src, w: i.naturalWidth, h: i.naturalHeight }; })()`);
    if (pl.w !== 2400 || pl.h !== 1197) throw new Error(`Стенд: картинка плана ${pl.w}×${pl.h}, ожидалась 2400×1197 — проверить обрезку`);
    const pm = /^data:image\/(\w+);base64,(.*)$/.exec(pl.src);
    const planSrc = join(OUT, 'stand-b2-plan-full.' + (pm[1] === 'jpeg' ? 'jpg' : pm[1]));
    writeFileSync(planSrc, Buffer.from(pm[2], 'base64'));
    const PLAN_CROP = { x: 896, y: 110, w: 648, h: 862 }; // сам план помещения (без меню ALI и легенды)
    const planOut = join(OUT, 'stand-b2-plan.png');
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', planSrc, '-vf', `crop=${PLAN_CROP.w}:${PLAN_CROP.h}:${PLAN_CROP.x}:${PLAN_CROP.y}`, planOut], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error('ffmpeg: обрезка плана не удалась');
    add(planOut, 'YURKONTUR_STAND#/card/ANC-0412/plan (встроенная картинка 2400×1197)', `crop=${PLAN_CROP.w}:${PLAN_CROP.h}:${PLAN_CROP.x}:${PLAN_CROP.y} → PNG (без пережатия)`);
    geo.plan = { w: PLAN_CROP.w, h: PLAN_CROP.h };
  } finally {
    b.close();
  }
}
writeFileSync(join(ROOT, 'videos/yurkontur/stand-geometry.json'), JSON.stringify(geo, null, 1) + '\n');
console.log('stand-geometry.json:', JSON.stringify(geo).slice(0, 400));

writeFileSync(join(ROOT, 'videos/yurkontur/assets.manifest.json'), JSON.stringify({ $comment: 'Производное: npm run yur:prepare (videos/yurkontur/prepare-assets.mjs). Ассеты в public/videos/yurkontur (gitignore).', generatedAt: new Date().toISOString(), items }, null, 1) + '\n');
console.log(`OK: ${items.length} ассетов → ${relative(ROOT, OUT)}`);
