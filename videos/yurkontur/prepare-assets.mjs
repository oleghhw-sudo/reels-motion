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

// 3. Стенд: «Два незалежних читання» (совпали / разошлись) и карточка задачи очереди
{
  const b = await launch(ROOT, { width: 1280, height: 1400 });
  try {
    await b.goto('file://' + STAND + '#/queue/T-doc3-rent', 6000);
    // pad — поля вокруг фрагмента (CSS px), чтобы не срезать подпись блока
    const rect = (expr, pad = 0) => b.evaluate(`(() => { const e = (${expr}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x - ${pad}, y: r.y - ${pad}, width: r.width + ${pad * 2}, height: r.height + ${pad * 2} }; })()`);
    const readingsBox = `(() => { const t = [...document.querySelectorAll('div')].find(e => e.textContent.trim().startsWith('Два незалежних читання') && e.getBoundingClientRect().height < 40); let p = t; while (p && p.getBoundingClientRect().height < 150) p = p.parentElement; return p; })()`;
    const card = `document.querySelector('.d-q-card')`;
    const save = async (name, r, how) => {
      if (!r) throw new Error(`Стенд: не найден фрагмент для ${name}`);
      const o = join(OUT, name);
      writeFileSync(o, await b.shot(r));
      add(o, 'YURKONTUR_STAND#/queue/T-doc3-rent', how);
      return r;
    };
    const cardR = await save('stand-queue-card.png', await rect(card), 'карточка задачи «Орендна плата за договором · doc3» до решения, CSS-клип ×1.5');
    const readR = await save('stand-readings-match.png', await rect(readingsBox, 10), 'блок «Два незалежних читання»: A и B совпали (та же задача), ×1.5');
    // координаты кнопки «Підтвердити» и значений A/B внутри карточки — для накладок курсора и позеленения (только накладки)
    const btn = await rect(`[...document.querySelectorAll('button')].find(x => x.textContent.trim().startsWith('Підтвердити'))`);
    writeFileSync(join(OUT, 'stand-queue-card.json'), JSON.stringify({ card: cardR, confirm: btn, readings: readR, scale: 1.5 }, null, 1));
    // клик «Підтвердити» → стенд закрывает задачу и открывает следующую («Комунальні · doc3»: читання розійшлися)
    await b.evaluate(`[...document.querySelectorAll('button')].find(x => x.textContent.trim().startsWith('Підтвердити')).click()`);
    await b.sleep(1200);
    const title = await b.evaluate(`document.querySelector('.d-q-card h3')?.textContent ?? ''`);
    if (!/Комунальні/.test(title)) throw new Error(`Стенд: после «Підтвердити» ожидалась задача «Комунальні», а открыта «${title}»`);
    await save('stand-readings-diff.png', await rect(readingsBox, 10), 'блок «Два незалежних читання» следующей задачи «Комунальні · doc3»: значення розійшлися, ×1.5');
  } finally {
    b.close();
  }
}
// 4. Стенд, блок 2: картка аптеки — План → Договір → лайтбокс скана. Меню ALI (левые 290 CSS px) в кадр не берём.
{
  const b = await launch(ROOT, { width: 1280, height: 720 });
  try {
    const CLIP = { x: 290, y: 0, width: 990, height: 720 };
    const rel = (r) => (r ? { x: r.x - CLIP.x, y: r.y - CLIP.y, w: r.width, h: r.height } : null);
    const rectOf = (expr) => b.evaluate(`(() => { const e = (${expr}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`);
    const geo = { clip: CLIP, scale: 1.5 };
    const save = async (name, how) => {
      const o = join(OUT, name);
      writeFileSync(o, await b.shot(CLIP));
      add(o, 'YURKONTUR_STAND', how);
    };
    await b.goto('file://' + STAND + '#/card/ANC-0412/plan', 6000);
    geo.tabs = rel(await rectOf(`[...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'План')?.parentElement`));
    geo.plan = rel(await rectOf(`[...document.querySelectorAll('img')].sort((a, z) => z.width * z.height - a.width * a.height)[0]`));
    await save('stand-b2-plan.png', '#/card/ANC-0412/plan — вкладка «План» (план з ALI, на стенде помечен «приклад»)');
    await b.goto('file://' + STAND + '#/card/doc1/contract', 3000);
    geo.rate = rel(await rectOf(`(() => { const t = [...document.querySelectorAll('div')].find(e => e.textContent.trim().startsWith('Ставка чинна') && e.getBoundingClientRect().height < 30); let p = t; while (p && p.getBoundingClientRect().height < 80) p = p.parentElement; return p; })()`));
    await save('stand-b2-contract.png', '#/card/doc1/contract — вкладка «Договір»: Ставка чинна, Діє до, Останній день заяви');
    const clicked = await b.evaluate(`(() => { const x = [...document.querySelectorAll('button')].find(e => /Показати в скані/.test(e.textContent)); if (!x) return false; x.click(); return true; })()`);
    if (!clicked) throw new Error('Стенд: нет кнопки «Показати в скані» на #/card/doc1/contract');
    await b.sleep(1500);
    await save('stand-b2-scan.png', '#/card/doc1/contract + клик «Показати в скані» — лайтбокс скана с рамкой');
    for (const k of ['tabs', 'plan', 'rate']) if (!geo[k]) throw new Error(`Стенд: не найден фрагмент ${k} для блока 2`);
    writeFileSync(join(OUT, 'stand-b2.json'), JSON.stringify(geo, null, 1));
    console.log('stand-b2.json:', JSON.stringify(geo));
  } finally {
    b.close();
  }
}
writeFileSync(join(ROOT, 'videos/yurkontur/assets.manifest.json'), JSON.stringify({ $comment: 'Производное: npm run yur:prepare (videos/yurkontur/prepare-assets.mjs). Ассеты в public/videos/yurkontur (gitignore).', generatedAt: new Date().toISOString(), items }, null, 1) + '\n');
console.log(`OK: ${items.length} ассетов → ${relative(ROOT, OUT)}`);
