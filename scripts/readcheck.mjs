#!/usr/bin/env node
// Проверка читаемости текстов ролика (идея: lemo-opuscar core/render/readcheck.mjs, MIT; код свой).
//
//   node scripts/readcheck.mjs <CompositionId> [--props JSON] [--step N] [--cps N] [--min-hold S]
//   node scripts/readcheck.mjs --self-test          позитивный контроль на ReadcheckFixture
//
// Что делает: бандлит проект (@remotion/bundler), открывает headless Chromium на бандле и ставит кадры тем же
// механизмом, что renderer Remotion (remotion_setBundleMode → remotion_setFrame → ожидание remotion_renderReady,
// т.е. все delayRender закрыты). Скриншоты НЕ снимаются, видео не декодируется (remotion_videoEnabled=false):
// меряется только DOM. Каждый N-й кадр (по умолчанию 2-й) по всем <Readable id text> собирается:
//   - прямоугольники текстовых узлов (Range.getClientRects, после transform);
//   - произведение computed opacity всех предков ≥ 0.9, visibility;
//   - обрезка предками: overflow ≠ visible (по осям) и clip-path: inset(...) — пересечением прямоугольников
//     с em-полосой строки (высота font-size по центру бокса строки: content area шрифта выше букв);
//   - целиком ли в кадре; пересечение с safe zones Reels (src/labs/safe-zones.ts) — тоже по em-полосам строк.
// Кадр «читаемый» = opacity ≥ 0.9, текст не обрезан предками (в пределах кадра) и целиком в кадре.
// Метрика: самый длинный непрерывный отрезок читаемости vs требуемое = max(minHold, символы/cps + 0.5 с).
// Нарушения: SHORT (читаем, но меньше нужного), OUT_OF_FRAME (видимый текст режется краем кадра),
//            UNSAFE (читаемый текст заходит в safe zone), NEVER (ни разу не читаем целиком и не OUT_OF_FRAME).
// Не проверяется: перекрытие другими слоями (z-order), mask-image, clip-path кроме inset, контраст.
//
// ПОРОГИ — ГИПОТЕЗА (калибруются на эталоне): cps=12 (украинский, медленнее латиницы 15), minHold=1.0 с, +0.5 с.
// Выход: таблица + out/qa/readcheck-<Comp>.json. Код выхода: 0 — нарушений нет; 1 — есть нарушения
// (или self-test не совпал с ожиданием); 2 — проверка не выполнена (нет ни одного Readable и т.п.) — это не «зелёный».
//
// Опирается на внутренние модули @remotion/renderer (set-props-and-env, seek-to-frame, puppeteer-evaluate) —
// версия зафиксирована в package.json; при другой версии скрипт отказывается работать (см. RENDERER_VERSION).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { RenderInternals, openBrowser, selectComposition } from '@remotion/renderer';
import { NoReactInternals } from 'remotion/no-react';
import { SAFE } from '../src/labs/safe-zones.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RENDERER_VERSION = '4.0.534';
const ATTR = { id: 'data-readable-id', text: 'data-readable-text' }; // = READABLE_ATTR в src/qa/Readable.tsx
const OPACITY_MIN = 0.9;
const PAD_SEC = 0.5;
const TOL = 0.5; // px

// Ожидание позитивного контроля (src/qa/ReadcheckFixture.tsx)
const SELF_TEST = { comp: 'ReadcheckFixture', expect: { 'fx.short': ['SHORT'], 'fx.edge': ['OUT_OF_FRAME'], 'fx.bottom': ['UNSAFE'], 'fx.ok': [] } };

// ---------------------------------------------------------------- аргументы
const argv = process.argv.slice(2);
const opt = (k) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : undefined;
};
const selfTest = argv.includes('--self-test');
const compId = selfTest ? SELF_TEST.comp : argv[0];
if (!compId || compId.startsWith('--')) {
  console.error('Использование: node scripts/readcheck.mjs <CompositionId> [--props JSON] [--step N] [--cps N] [--min-hold S] | --self-test');
  process.exit(2);
}
const STEP = Number(opt('--step') ?? 2);
const CPS = Number(opt('--cps') ?? 12);
const MIN_HOLD = Number(opt('--min-hold') ?? 1.0);
const thresholdsAreDefault = opt('--cps') === undefined && opt('--min-hold') === undefined;
if (!Number.isInteger(STEP) || STEP < 1 || !(CPS > 0) || !(MIN_HOLD >= 0)) {
  console.error('readcheck: --step — целое ≥ 1, --cps > 0, --min-hold ≥ 0');
  process.exit(2);
}
let inputProps = {};
if (opt('--props')) {
  try {
    inputProps = JSON.parse(opt('--props'));
  } catch (e) {
    console.error(`readcheck: --props не JSON: ${e.message}`);
    process.exit(2);
  }
}

// ---------------------------------------------------------------- внутренности renderer (фиксированная версия)
const req = createRequire(import.meta.url);
const rendererPkg = req('@remotion/renderer/package.json');
if (rendererPkg.version !== RENDERER_VERSION) {
  console.error(`readcheck: @remotion/renderer ${rendererPkg.version} ≠ ${RENDERER_VERSION}. Скрипт использует внутренние модули renderer — сверить seek-to-frame/set-props-and-env и обновить RENDERER_VERSION.`);
  process.exit(2);
}
const rendererDist = dirname(req.resolve('@remotion/renderer'));
const { setPropsAndEnv } = req(join(rendererDist, 'set-props-and-env.js'));
const { seekToFrame } = req(join(rendererDist, 'seek-to-frame.js'));
const { puppeteerEvaluateWithCatch } = req(join(rendererDist, 'puppeteer-evaluate.js'));

// remotion.config.ts — единственный источник webpack-override (yaml как текст) и настроек браузера
await import('../remotion.config.ts');
const { ConfigInternals } = await import('@remotion/cli/config');

// ---------------------------------------------------------------- сбор в странице (сериализуется в браузер)
function collect(attrId, attrText, W, H) {
  const parseLen = (v, ref) => (v.endsWith('%') ? (parseFloat(v) / 100) * ref : parseFloat(v) || 0);
  const inter = (a, b) => ({ l: Math.max(a.l, b.l), t: Math.max(a.t, b.t), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) });
  const area = (a) => Math.max(0, a.r - a.l) * Math.max(0, a.b - a.t);
  const FRAME = { l: 0, t: 0, r: W, b: H };
  let unknownClip = 0;
  // ограничение предков: прямоугольник клипа (∩ всех) + произведение opacity
  const chainOf = (start) => {
    let clip = { l: -1e9, t: -1e9, r: 1e9, b: 1e9 };
    let opacity = 1;
    let hidden = false;
    for (let e = start; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.visibility === 'hidden' || cs.visibility === 'collapse') hidden = true;
      if (cs.display === 'contents') continue;
      opacity *= parseFloat(cs.opacity);
      const br = e.getBoundingClientRect();
      const box = { l: br.left, t: br.top, r: br.right, b: br.bottom };
      const ox = cs.overflowX !== 'visible';
      const oy = cs.overflowY !== 'visible';
      if (ox || oy) clip = inter(clip, { l: ox ? box.l : -1e9, r: ox ? box.r : 1e9, t: oy ? box.t : -1e9, b: oy ? box.b : 1e9 });
      const cp = cs.clipPath;
      if (cp && cp !== 'none') {
        const m = cp.match(/^inset\(([^)]*?)(?:\s+round\s[^)]*)?\)/);
        if (m) {
          const v = m[1].trim().split(/\s+/);
          const [t, r, b, l] = v.length === 1 ? [v[0], v[0], v[0], v[0]] : v.length === 2 ? [v[0], v[1], v[0], v[1]] : v.length === 3 ? [v[0], v[1], v[2], v[1]] : v;
          // проценты — от бокса элемента без transform; переводим в экранный масштаб
          const w0 = e.offsetWidth || br.width;
          const h0 = e.offsetHeight || br.height;
          const sx = w0 ? br.width / w0 : 1;
          const sy = h0 ? br.height / h0 : 1;
          clip = inter(clip, {
            l: box.l + parseLen(l, w0) * sx,
            r: box.r - parseLen(r, w0) * sx,
            t: box.t + parseLen(t, h0) * sy,
            b: box.b - parseLen(b, h0) * sy,
          });
        } else unknownClip++;
      }
    }
    return { clip, opacity, hidden };
  };
  const out = [];
  for (const el of document.querySelectorAll(`[${attrId}]`)) {
    const rects = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (!n.textContent.trim()) continue;
      const rg = document.createRange();
      rg.selectNodeContents(n);
      const ch = chainOf(n.parentElement);
      const fontPx = parseFloat(getComputedStyle(n.parentElement).fontSize);
      for (const rc of rg.getClientRects()) if (rc.width > 0 && rc.height > 0) rects.push({ r: { l: rc.left, t: rc.top, r: rc.right, b: rc.bottom }, fontPx, ...ch });
    }
    if (!rects.length) {
      out.push({ id: el.getAttribute(attrId), text: el.getAttribute(attrText), present: false });
      continue;
    }
    let minOpacity = 1;
    let hidden = false;
    let contentOk = true; // не обрезан предками в пределах кадра
    let visibleArea = 0;
    const u = { l: 1e9, t: 1e9, r: -1e9, b: -1e9 };
    for (const x of rects) {
      minOpacity = Math.min(minOpacity, x.opacity);
      hidden ||= x.hidden;
      // обрезку предками меряем по em-полосе строки (font-size по центру бокса): бокс текстового узла —
      // это content area шрифта (у display-шрифтов ~1.3em), и маски строк (MaskLine) законно срезают её
      // пустые поля, не трогая буквы
      const pad = Math.max(0, (x.r.b - x.r.t - x.fontPx) / 2);
      const em = { l: x.r.l, r: x.r.r, t: x.r.t + pad, b: x.r.b - pad };
      const inFrame = inter(em, FRAME);
      const shown = inter(inFrame, x.clip);
      visibleArea += area(shown);
      if (area(inFrame) - area(shown) > 1) contentOk = false;
      // бокс текста для кадра и safe zones — тоже по em-полосе (ближе к буквам, чем content area)
      u.l = Math.min(u.l, em.l);
      u.t = Math.min(u.t, em.t);
      u.r = Math.max(u.r, em.r);
      u.b = Math.max(u.b, em.b);
    }
    out.push({ id: el.getAttribute(attrId), text: el.getAttribute(attrText), present: true, minOpacity, hidden, contentOk, visibleArea, box: u });
  }
  return { items: out, unknownClip };
}

// ---------------------------------------------------------------- прогон
const t0 = Date.now();
const log = (s) => process.stdout.write(s);
const gl = process.env.REMOTION_GL ?? 'angle'; // та же логика, что в remotion.config.ts
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE ?? null;
const chromiumOptions = { gl };

log(`readcheck ${compId}: бандл… `);
const bundleDir = join(ROOT, 'out', 'qa', 'bundle');
// производное; копия public с симлинками не перезаписывается поверх старой (EEXIST) — пересобираем с нуля
rmSync(bundleDir, { recursive: true, force: true });
const serveDir = await bundle({
  entryPoint: join(ROOT, 'src', 'index.ts'),
  rootDir: ROOT,
  publicDir: join(ROOT, 'public'),
  outDir: bundleDir,
  webpackOverride: ConfigInternals.getWebpackOverrideFn(),
  enableCaching: true,
});
const tBundle = Date.now();
log(`${((tBundle - t0) / 1000).toFixed(1)} с\n`);

const { server, cleanupServer } = await RenderInternals.makeOrReuseServer(
  undefined,
  {
    webpackConfigOrServeUrl: serveDir,
    port: null,
    remotionRoot: ROOT,
    offthreadVideoThreads: 1,
    logLevel: 'error',
    indent: false,
    offthreadVideoCacheSizeInBytes: null,
    binariesDirectory: null,
    forceIPv4: false,
    sampleRate: 48000,
  },
  { onDownload: null },
);
const browser = await openBrowser('chrome', { browserExecutable, chromiumOptions, logLevel: 'error' });

let exitCode = 0;
let result;
try {
  const composition = await selectComposition({ serveUrl: server.serveUrl, id: compId, inputProps, puppeteerInstance: browser, browserExecutable, chromiumOptions, logLevel: 'error' });
  const { fps, durationInFrames: D, width: W, height: H } = composition;
  const ser = (data) => NoReactInternals.serializeJSONWithSpecialTypes({ data, indent: undefined, staticBase: null }).serializedString;
  const timeout = 60000;
  const page = await browser.newPage({ context: server.sourceMap, logLevel: 'error', indent: false, pageIndex: 0, onBrowserLog: null, onLog: RenderInternals.defaultOnLog });
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await setPropsAndEnv({
    serializedInputPropsWithCustomSchema: ser(inputProps),
    envVariables: {},
    page,
    serveUrl: server.serveUrl,
    initialFrame: 0,
    timeoutInMilliseconds: timeout,
    proxyPort: server.offthreadPort,
    retriesRemaining: 2,
    audioEnabled: false,
    videoEnabled: false, // DOM-проверка: кадры видео не нужны
    indent: false,
    logLevel: 'error',
    onServeUrlVisited: () => undefined,
    isMainTab: true,
    mediaCacheSizeInBytes: null,
    initialMemoryAvailable: null,
    darkMode: false,
    sampleRate: 48000,
  });
  await puppeteerEvaluateWithCatch({
    pageFunction: (id, props, dur, f, h, w) => {
      window.remotion_setBundleMode({
        type: 'composition',
        compositionName: id,
        serializedResolvedPropsWithSchema: props,
        compositionDurationInFrames: dur,
        compositionFps: f,
        compositionHeight: h,
        compositionWidth: w,
        compositionDefaultCodec: null,
        compositionDefaultOutName: null,
        compositionDefaultVideoImageFormat: null,
        compositionDefaultPixelFormat: null,
        compositionDefaultProResProfile: null,
        compositionDefaultSampleRate: null,
      });
    },
    args: [composition.id, ser(composition.props ?? {}), D, fps, H, W],
    frame: null,
    page,
    timeoutInMilliseconds: timeout,
  });

  // ---- обход кадров
  const frames = [];
  for (let f = 0; f < D; f += STEP) frames.push(f);
  const tracks = new Map(); // key id\0text → данные
  let unknownClipFrames = 0;
  const zoneOf = (b) => {
    const z = [];
    if (b.t < SAFE.top - TOL) z.push({ zone: 'top', px: Math.round(SAFE.top - b.t) });
    if (b.b > H - SAFE.bottom + TOL) z.push({ zone: 'bottom', px: Math.round(b.b - (H - SAFE.bottom)) });
    if (b.r > W - SAFE.right + TOL) z.push({ zone: 'right', px: Math.round(b.r - (W - SAFE.right)) });
    return z;
  };
  const tLoop = Date.now();
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    await seekToFrame({ frame: f, page, composition: composition.id, timeoutInMilliseconds: timeout, logLevel: 'error', indent: false, attempt: 0 });
    const { value } = await puppeteerEvaluateWithCatch({ pageFunction: collect, args: [ATTR.id, ATTR.text, W, H], frame: f, page, timeoutInMilliseconds: timeout });
    if (value.unknownClip) unknownClipFrames++;
    const span = (Math.min(f + STEP, D) - f) / fps;
    const seenNow = new Map();
    for (const it of value.items) {
      const key = `${it.id}\u0000${it.text}`;
      // одинаковые id+text в одном кадре: считаем читаемым, если читаем хотя бы один экземпляр
      const st = (() => {
        if (!it.present) return { readable: false, out: false, box: null };
        const opOk = it.minOpacity >= OPACITY_MIN && !it.hidden;
        const inFrame = it.box.l >= -TOL && it.box.t >= -TOL && it.box.r <= W + TOL && it.box.b <= H + TOL;
        return { readable: opOk && it.contentOk && inFrame && it.visibleArea > 0, out: opOk && it.contentOk && !inFrame && it.visibleArea > 0, box: it.box };
      })();
      const prev = seenNow.get(key);
      if (!prev || (st.readable && !prev.readable)) seenNow.set(key, { it, st });
      if (!tracks.has(key)) tracks.set(key, { id: it.id, text: it.text, samples: [], dup: false });
      else if (prev) tracks.get(key).dup = true;
    }
    for (const [key, { st }] of seenNow) tracks.get(key).samples.push({ f, span, ...st });
    if (i % 50 === 0 || i === frames.length - 1) log(`\r  кадр ${f}/${D - 1}  (${i + 1}/${frames.length}), ${((Date.now() - tLoop) / 1000).toFixed(0)} с`);
  }
  log('\n');
  const tDone = Date.now();

  if (!tracks.size) {
    console.error(`readcheck: NOT CHECKED — в ${compId} нет ни одного <Readable>. Это не «зелёный».`);
    exitCode = 2;
  } else {
    // ---- метрики
    const chars = (s) => [...s].filter((c) => !/\s/.test(c)).length;
    const texts = [];
    for (const tr of tracks.values()) {
      const n = chars(tr.text);
      const need = Math.max(MIN_HOLD, n / CPS + PAD_SEC);
      let best = 0;
      let bestFrom = null;
      let run = 0;
      let runFrom = null;
      let total = 0;
      let lastF = null;
      let firstVisible = null;
      let outSec = 0;
      let outFrom = null;
      const unsafe = new Map(); // zone → { sec, maxPx, from }
      for (const s of tr.samples) {
        const contiguous = lastF !== null && s.f === lastF + STEP;
        if (s.readable) {
          if (!contiguous || run === 0) {
            run = 0;
            runFrom = s.f;
          }
          run += s.span;
          total += s.span;
          firstVisible ??= s.f;
          if (run > best + 1e-9) {
            best = run;
            bestFrom = runFrom;
          }
          for (const z of zoneOf(s.box)) {
            const u = unsafe.get(z.zone) ?? { sec: 0, maxPx: 0, from: s.f };
            u.sec += s.span;
            u.maxPx = Math.max(u.maxPx, z.px);
            unsafe.set(z.zone, u);
          }
        } else run = 0;
        if (s.out) {
          outSec += s.span;
          outFrom ??= s.f;
        }
        lastF = s.f;
      }
      const v = [];
      if (outSec > 0) v.push('OUT_OF_FRAME');
      if (best === 0 && outSec === 0) v.push('NEVER');
      if (best > 0 && best + 1e-9 < need) v.push('SHORT');
      if (unsafe.size) v.push('UNSAFE');
      texts.push({
        id: tr.id,
        text: tr.text,
        chars: n,
        needSec: +need.toFixed(3),
        longestSec: +best.toFixed(3),
        longestFromSec: bestFrom === null ? null : +(bestFrom / fps).toFixed(3),
        totalReadableSec: +total.toFixed(3),
        firstReadableSec: firstVisible === null ? null : +(firstVisible / fps).toFixed(3),
        outOfFrameSec: +outSec.toFixed(3),
        outOfFrameFromSec: outFrom === null ? null : +(outFrom / fps).toFixed(3),
        unsafe: [...unsafe].map(([zone, u]) => ({ zone, sec: +u.sec.toFixed(3), maxPx: u.maxPx, fromSec: +(u.from / fps).toFixed(3) })),
        duplicateInstances: tr.dup,
        violations: v,
      });
    }
    texts.sort((a, b) => (a.firstReadableSec ?? a.outOfFrameFromSec ?? 1e9) - (b.firstReadableSec ?? b.outOfFrameFromSec ?? 1e9));

    // ---- таблица
    const hyp = thresholdsAreDefault ? ' (ГИПОТЕЗА: пороги по умолчанию, не откалиброваны)' : ' (пороги заданы флагами)';
    console.log(`\nПороги: cps=${CPS}, minHold=${MIN_HOLD} с, +${PAD_SEC} с${hyp}; шаг ${STEP} кадр(а) = ±${(STEP / fps).toFixed(3)} с точность`);
    console.log(`Safe zones (src/labs/safe-zones.ts): верх ${SAFE.top}, низ ${SAFE.bottom}, право ${SAFE.right} px\n`);
    const pad = (s, n) => String(s).padEnd(n);
    console.log(`${pad('статус', 22)}${pad('id', 26)}${pad('с', 7)}${pad('симв', 6)}${pad('нужно', 7)}${pad('держит', 8)}текст`);
    for (const x of texts) {
      const st = x.violations.length ? x.violations.join(',') : 'OK';
      const at = x.longestFromSec ?? x.outOfFrameFromSec ?? '—';
      const extra = x.unsafe.map((u) => ` [${u.zone} +${u.maxPx}px ${u.sec.toFixed(2)}с]`).join('');
      console.log(`${pad(st, 22)}${pad(x.id, 26)}${pad(at, 7)}${pad(x.chars, 6)}${pad(x.needSec.toFixed(2), 7)}${pad(x.longestSec.toFixed(2), 8)}${JSON.stringify(x.text.slice(0, 40))}${extra}`);
    }
    const nViol = texts.reduce((s, x) => s + x.violations.length, 0);
    const counts = {};
    for (const x of texts) for (const v of x.violations) counts[v] = (counts[v] ?? 0) + 1;
    console.log(`\nТекстов: ${texts.length}; нарушений: ${nViol} ${JSON.stringify(counts)}`);
    if (unknownClipFrames) console.log(`Внимание: clip-path не-inset встречен на ${unknownClipFrames} кадрах — такой клип не учитывается.`);
    const timing = { bundleSec: +((tBundle - t0) / 1000).toFixed(1), framesSec: +((tDone - tLoop) / 1000).toFixed(1), totalSec: +((tDone - t0) / 1000).toFixed(1), sampledFrames: frames.length };
    console.log(`Время: бандл ${timing.bundleSec} с, кадры ${timing.framesSec} с (${frames.length} шт.), всего ${timing.totalSec} с`);

    result = {
      composition: compId,
      generatedAt: new Date().toISOString(),
      params: { step: STEP, fps, durationInFrames: D, cps: CPS, minHoldSec: MIN_HOLD, padSec: PAD_SEC, opacityMin: OPACITY_MIN, thresholdsAreHypothesis: thresholdsAreDefault, safe: SAFE },
      notChecked: ['перекрытие другими слоями (z-order)', 'mask-image', 'clip-path кроме inset', 'контраст'],
      timing,
      summary: { texts: texts.length, violations: nViol, byType: counts },
      texts,
    };
    const outDir = join(ROOT, 'out', 'qa');
    mkdirSync(outDir, { recursive: true });
    const outFile = join(outDir, `readcheck-${compId}.json`);
    writeFileSync(outFile, JSON.stringify(result, null, 2));
    console.log(outFile);
    exitCode = nViol ? 1 : 0;

    // ---- позитивный контроль
    if (selfTest) {
      const problems = [];
      const ids = new Set(texts.map((x) => x.id));
      for (const [id, exp] of Object.entries(SELF_TEST.expect)) {
        const got = texts.find((x) => x.id === id)?.violations ?? null;
        if (!got) problems.push(`${id}: не найден`);
        else if (JSON.stringify([...got].sort()) !== JSON.stringify([...exp].sort())) problems.push(`${id}: ждали ${JSON.stringify(exp)}, получили ${JSON.stringify(got)}`);
      }
      for (const id of ids) if (!(id in SELF_TEST.expect)) problems.push(`${id}: лишний текст в фикстуре`);
      const expTotal = Object.values(SELF_TEST.expect).reduce((s, v) => s + v.length, 0);
      if (nViol !== expTotal) problems.push(`нарушений ${nViol}, ждали ровно ${expTotal}`);
      if (problems.length) {
        console.error(`\nSELF-TEST ПРОВАЛ (проверка сломана или фикстура изменена):\n  - ${problems.join('\n  - ')}`);
        exitCode = 1;
      } else {
        console.log(`\nSELF-TEST OK: найдено ровно ожидаемое (SHORT, OUT_OF_FRAME, UNSAFE; fx.ok без нарушений)`);
        exitCode = 0;
      }
    }
  }
} catch (e) {
  console.error(`readcheck: ошибка — ${e.stack ?? e}`);
  exitCode = 2;
} finally {
  await browser.close({ silent: true }).catch(() => undefined);
  await cleanupServer(true).catch(() => undefined);
}
process.exit(exitCode);
