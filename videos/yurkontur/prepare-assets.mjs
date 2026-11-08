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
// 2б. legacy_1…4 целиком, исходными байтами (блок 1: плоско, фрагментами в масштабе 1:1 — шрифт ≈ 21 px исходника ≥ 20 px)
for (const f of ['legacy_1.png', 'legacy_2.png', 'legacy_3.png', 'legacy_4.png']) {
  const o = join(OUT, f);
  copyFileSync(join(LEGACY, f), o);
  add(o, `YURKONTUR_LEGACY_DIR/${f}`, 'копия без изменений (блок 1)');
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
// 3г. Блоки 3б–3в: шкала «Чинна редакція на дату» и «Ставка чинна» в трёх редакциях (doc1), площа тричі (ANC-0412),
//     «Строки» (без строк «Зміна власника»), «Відхилення від еталона» (doc1). DPR 3, PNG.
{
  const b = await launch(ROOT, { width: 1280, height: 1600, scale: DPR });
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
    await b.goto('file://' + STAND + '#/card/doc1/contract', 6000);
    const scaleBox = `(() => { const t = [...document.querySelectorAll('span,div')].find(e => e.textContent.trim() === 'Чинна редакція на дату'); let p = t; while (p && !p.textContent.includes('Редакція діє')) p = p.parentElement; return p; })()`;
    const rateRow = `[...document.querySelectorAll('.d-card-fact')].find(e => /^Ставка чинна на/.test(e.textContent.trim()))`;
    geo.chain = [];
    for (const [i, d] of ['05.12.2013', '01.03.2015', '01.09.2015'].entries()) {
      await b.evaluate(`[...document.querySelectorAll('button')].find(x => x.textContent.trim() === '${d}').click()`);
      await b.sleep(700);
      const sr = await rectOf(scaleBox, 6);
      const rr = await rectOf(rateRow, 6);
      const scale = await save(`chain-scale-${i}.png`, sr, 'YURKONTUR_STAND#/card/doc1/contract', `шкала «Чинна редакція на дату», выбрана ${d}, DPR 3`);
      const rate = await save(`chain-rate-${i}.png`, rr, 'YURKONTUR_STAND#/card/doc1/contract', `«Ставка чинна на …» в редакции ${d}, DPR 3`);
      scale.btn = inPx(await rectOf(`[...document.querySelectorAll('button')].find(x => x.textContent.trim() === '${d}')`), sr);
      const val = await rectOf(`(() => { const row = ${rateRow}; return [...row.querySelectorAll('*')].find(e => e.textContent.includes('грн/міс') && e.children.length === 0); })()`);
      rate.value = inPx(val, rr);
      geo.chain.push({ date: d, scale, rate });
    }
    await b.goto('file://' + STAND + '#/card/ANC-0412/contract', 4000);
    const areaRow = `[...document.querySelectorAll('.d-card-fact')].find(e => /^Площа/.test(e.textContent.trim()))`;
    const ar = await rectOf(areaRow, 6);
    geo.area = await save('card-area.png', ar, 'YURKONTUR_STAND#/card/ANC-0412/contract', 'поле «Площа»: договір 111,2 · план БТІ 108,9 · ліцензія 111,2 · «БТІ відрізняється від договору», DPR 3');
    geo.area.bti = inPx(await rectOf(`(${areaRow}).querySelector('.is-diff')`), ar);
    geo.area.note = inPx(await rectOf(`(${areaRow}).querySelector('.a-warn')`), ar);
    // «Строки» — шире (1600 CSS): при 1280 колонка «Подія» сжата и текст стенда наезжает на дату
    await b.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1600, deviceScaleFactor: DPR, mobile: false });
    await b.goto('file://' + STAND + '#/deadlines', 4000);
    // только первые три строки таблицы: четвёртая — «Зміна власника» (запрет обещаний о внешних событиях)
    const rows = await b.evaluate(`[...document.querySelectorAll('tr')].filter(r => r.querySelector('td') && r.textContent.includes('ANC-')).slice(0, 4).map(r => { const q = r.getBoundingClientRect(); return { y: q.y, h: q.height, text: r.textContent.replace(/\\s+/g, ' ').slice(0, 80) }; })`);
    if (!rows.length || !/Зміна власника/.test(rows[3]?.text ?? '')) throw new Error('Стенд «Строки»: ожидалась 4-я строка «Зміна власника» — проверить обрезку: ' + JSON.stringify(rows.map((r) => r.text)));
    const top = await rectOf(`document.querySelector('h1')`);
    const dClip = { x: top.x - 8, y: top.y + top.height + 6, width: 1600 - (top.x - 8) - 24, height: rows[3].y - (top.y + top.height + 6) - 2 };
    geo.deadlines = await save('deadlines.png', dClip, 'YURKONTUR_STAND#/deadlines', 'вікна ≤ 30 / ≤ 90 / ≤ 180 днів и три первые строки (без «Зміна власника»), DPR 3');
    geo.deadlines.rows = rows.slice(0, 3).map((r) => ({ y: (r.y - dClip.y) * DPR, h: r.h * DPR, text: r.text }));
    // колонки таблицы (для проезда камеры к «Дата · Залишилось · Кому»)
    const th = await b.evaluate(`[...document.querySelectorAll('th')].map(e => { const r = e.getBoundingClientRect(); return { t: e.textContent.trim().split(/[ ,]/)[0], x: r.x, w: r.width }; })`);
    const col = (name) => { const c = th.find((x) => x.t.startsWith(name)); if (!c) throw new Error(`Стенд «Строки»: нет колонки «${name}»: ${JSON.stringify(th.map((x) => x.t))}`); return { x: (c.x - dClip.x) * DPR, w: c.w * DPR }; };
    geo.deadlines.cols = { event: col('Подія'), date: col('Дата'), who: col('Кому') };
    await b.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1600, deviceScaleFactor: DPR, mobile: false });
    await b.goto('file://' + STAND + '#/deviations/doc1', 4000);
    const vClip = { x: 296, y: 66, width: 932, height: 560 };
    geo.deviations = await save('deviations.png', vClip, 'YURKONTUR_STAND#/deviations/doc1', 'Відхилення від еталона: фильтры и первые пункты «Типовий договір 2025 ↔ Договір аптеки», DPR 3');
    const chip = await rectOf(`[...document.querySelectorAll('button,span,label')].find(e => e.textContent.trim().replace(/\\s+/g,' ') === '18 відхилення' || e.textContent.trim().replace(/\\s+/g,'') === '18відхилення')`);
    geo.deviations.chip = chip ? inPx(chip, vClip) : null;
    const oldTabs = await rectOf(`[...document.querySelectorAll('button,a,[role=tab]')].find(e => e.textContent.trim().replace(/\\s+/g,' ') === 'Старі договори')`);
    geo.deviations.tabsY = oldTabs ? (oldTabs.y - vClip.y) * DPR : null;
    // 032: вкладка «Новий договір на бланку орендодавця» (проєкт від орендодавця, демо-приклад) — на слова «і новий на його бланку»
    const clicked = await b.evaluate(`(() => { const e = [...document.querySelectorAll('button,a,[role=tab]')].find(e => e.textContent.trim().replace(/\\s+/g,' ') === 'Новий договір на бланку орендодавця'); if (!e) return false; e.click(); return true; })()`);
    if (!clicked) throw new Error('Стенд «Відхилення»: нет вкладки «Новий договір на бланку орендодавця»');
    await new Promise((r) => setTimeout(r, 1500));
    const tab = await rectOf(`[...document.querySelectorAll('button,a,[role=tab]')].find(e => e.textContent.trim().replace(/\\s+/g,' ') === 'Новий договір на бланку орендодавця')`, 2);
    const row = await rectOf(`[...document.querySelectorAll('tr')].find(r => r.textContent.includes('4.15'))`);
    if (!tab || !row) throw new Error('Стенд «Відхилення», новий договір: не найдены вкладка или строка п. 4.15');
    const nClip = { x: 296, y: tab.y - 12, width: 940, height: row.y + row.height + 8 - (tab.y - 12) };
    geo.deviationsNew = await save('deviations-new.png', nClip, 'YURKONTUR_STAND#/deviations/doc1 → вкладка «Новий договір на бланку орендодавця»', 'Проєкт від орендодавця (демо-приклад): вкладка и таблица пунктов до п. 4.15, DPR 3');
    geo.deviationsNew.tab = inPx(tab, nClip);
    geo.deviationsNew.row = inPx(row, nClip);
    // колонки строки п. 4.15: «Назва» … «Позиція» (для кадра «пункт · що в проєкті · позиція»)
    const cells = await b.evaluate(`(() => { const r = [...document.querySelectorAll('tr')].find(r => r.textContent.includes('4.15')); return [...r.children].map(c => { const q = c.getBoundingClientRect(); return { x: q.x, w: q.width, t: c.textContent.trim().replace(/\\s+/g,' ').slice(0, 40) }; }); })()`);
    const trs = await b.evaluate(`[...document.querySelectorAll('tr')].filter(r => r.querySelector('td')).map(r => { const q = r.getBoundingClientRect(); return { y: q.y, h: q.height }; })`);
    geo.deviationsNew.rows = trs.map((r) => ({ y: (r.y - nClip.y) * DPR, h: r.h * DPR }));
    // старые договоры: верх ряда вкладок (кадр начинается с него, без среза текста)
    geo.deviationsNew.cells = cells.map((c) => ({ x: (c.x - nClip.x) * DPR, w: c.w * DPR, text: c.t }));
  } finally {
    b.close();
  }
}
writeFileSync(join(ROOT, 'videos/yurkontur/stand-geometry.json'), JSON.stringify(geo, null, 1) + '\n');
console.log('stand-geometry.json:', JSON.stringify(geo).slice(0, 400));

writeFileSync(join(ROOT, 'videos/yurkontur/assets.manifest.json'), JSON.stringify({ $comment: 'Производное: npm run yur:prepare (videos/yurkontur/prepare-assets.mjs). Ассеты в public/videos/yurkontur (gitignore).', generatedAt: new Date().toISOString(), items }, null, 1) + '\n');
console.log(`OK: ${items.length} ассетов → ${relative(ROOT, OUT)}`);
