// Сверка чисел экрана с json пакета (задача 020): npm run test:agent  (node --experimental-strip-types src/videos/agent-terminal/numbers.test.ts)
// `--negative` — позитивный контроль (гейт 4): подменяет O02.err в данных → сверка ОБЯЗАНА упасть (exit 1); если не упала — exit 2.
//
// Ожидания строятся НЕЗАВИСИМО от data.ts: json читается напрямую из ./data по путям из таблицы задачи
// «Числа экрана → источник» и форматируется format.ts (сам форматтер проверяется литералами ниже).
import { readFileSync } from 'node:fs';
import { PACK, PAGE_FAIL, PAGE_FULL, SUMY_KEY, ZONES_MEDIAN_KEY, ZONE_ORDER, frameSize, outlineOnFrame, planMap, screenNumbersFrom, segOnFrame, type Pack } from './data.ts';
import { MINUS, NBSP, THIN, area, areaBare, int, metres, num, pctInt, pctSigned, px, share } from './format.ts';

const negative = process.argv.includes('--negative');
let failed = 0;
let passed = 0;
const expect = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (cond) passed++;
  else failed++;
};
const raw = (name: string) => JSON.parse(readFileSync(new URL(`./data/${name}`, import.meta.url), 'utf8'));

// ---------------------------------------------------------------- 1. форматтер (литералы)
console.log('\nФорматтер uk-UA:');
expect('метры 9.25 → «9,25 м»', metres(9.25) === `9,25${NBSP}м`, JSON.stringify(metres(9.25)));
expect('метры 8.7 → «8,70 м»', metres(8.7) === `8,70${NBSP}м`);
expect('метры 3.582 → «3,58 м»', metres(3.582) === `3,58${NBSP}м`);
expect('площадь 99.29 → «99,3 м²»', area(99.29) === `99,3${NBSP}м²`);
expect('площадь 99.0 → «99,0 м²»', area(99.0) === `99,0${NBSP}м²`);
expect('площадь 0.94 → «0,9 м²», 2.2 → «2,2»', area(0.94) === `0,9${NBSP}м²` && areaBare(2.2) === '2,2');
expect('отклонение +0.29 → «+0,3 %»', pctSigned(0.29) === `+0,3${NBSP}%`, JSON.stringify(pctSigned(0.29)));
expect('отклонение −1.87 → «−1,9 %» (минус U+2212)', pctSigned(-1.87) === `${MINUS}1,9${NBSP}%`);
expect('отклонение −42.33 → «−42,3 %»', pctSigned(-42.33) === `${MINUS}42,3${NBSP}%`);
expect('отклонение −0.59 → «−0,6 %»', pctSigned(-0.59) === `${MINUS}0,6${NBSP}%`);
expect('доля 0.887 → «89 %», 0.65 → «65 %»', pctInt(0.887) === `89${NBSP}%` && pctInt(0.65) === `65${NBSP}%`);
expect('доли зон: 0.545 → «55 %», 0.025 → «2,5 %»', share(0.545) === `55${NBSP}%` && share(0.025) === `2,5${NBSP}%`, `${share(0.545)} ${share(0.025)}`);
expect('пиксели 10.51 → «10,5», 17.4 → «17,4»', px(10.51) === '10,5' && px(17.4) === '17,4');
expect('целое 1038 → «1 038» (U+202F)', int(1038) === `1${THIN}038`, JSON.stringify(int(1038)));
expect('целое 11 → «11», 0 → «0»', int(11) === '11' && int(0) === '0');
expect('нуль со знаком без знака', num(0.001, 1, { sign: true }) === '0,0');
expect('в строках нет обычного пробела U+0020 перед единицей', !metres(1).includes(' ') && !pctSigned(1).includes(' '));

// ---------------------------------------------------------------- 2. ожидания из json (таблица задачи)
const results = raw('results.json') as { id: string; name: string; area: number | null; truth: number | null; err: number | null; route: string; reasons: string[]; check: { value_m: number; measured_m: number; err_pct: number } | null }[];
const scale = raw('scale.json') as Record<string, { primary: { value_m: number } }>;
const stats = raw('stats.json');
const real = raw('real_examples.json');
const truth = raw('truth.json');
const geomO02 = raw('geometry-O02.json');
const by = (id: string) => results.find((r) => r.id === id)!;
const o02 = by('O02');
const o07 = by('O07');
const total = results.length;
const draft = results.filter((r) => r.route === 'чернетка').length;
const human = results.filter((r) => r.route === 'до людини').length;
const sanRoom = geomO02.rooms.find((r: { id: number }) => r.id === 6); // задача: rooms[id=6]
const sanTruth = truth.O02.rooms.find((r: { label: string }) => r.label === '2'); // задача: rooms[label=2]
const st = stats.sumy;
const EXPECT: Record<string, string> = {
  'pages.total': int(total),
  'counter.draft': int(draft),
  'counter.human': int(human),
  'start': `старт · ${int(total)} сторінок у черзі`,
  'page.none': `— / ${int(total)}`,
  'page.1': `сторінка 1 / ${int(total)}`,
  [`page.${total}`]: `сторінка ${int(total)} / ${int(total)}`,
  'zones.median': pctInt(stats[ZONES_MEDIAN_KEY].value),
  'zones.note': `медіана, ${int(stats[ZONES_MEDIAN_KEY].n)} аптек`,
  'o02.walls': `стіни: перегородки ~${px(geomO02.walls.thin_px)} px, капітальні ~${px(geomO02.walls.thick_px)} px`,
  'o02.outline': `контур знайдено · ${int(geomO02.outline.vertices)} вершин`,
  'o02.scale.label': metres(scale.O02.primary.value_m),
  'o02.scale.log': `масштаб: ${metres(scale.O02.primary.value_m)} з підпису на плані`,
  'o02.check.label': metres(o02.check!.value_m),
  'o02.check.result': `виміряно ${metres(o02.check!.measured_m)} · ${pctSigned(o02.check!.err_pct)}`,
  'o02.area': `площа ${area(o02.area!)} · експлікація ${area(o02.truth!)} · ${pctSigned(o02.err!)}`,
  'o02.san': `с/у: ${area(sanRoom.area_m2)} проти ${areaBare(sanTruth.m2)} — сантехніка дробить приміщення · позначено`,
  'chip.O01': `✓ ${pctSigned(by('O01').err!)}`,
  'chip.O02': `✓ ${pctSigned(o02.err!)}`,
  'o07.scale.label': metres(scale.O07.primary.value_m),
  'o07.check.label': metres(o07.check!.value_m),
  'o07.check.result': `виміряно ${metres(o07.check!.measured_m)} · ${pctSigned(o07.check!.err_pct)}`,
  'o07.area': `площа ${area(o07.area!)} · експлікація ${area(o07.truth!)} · ${pctSigned(o07.err!)}`,
  'sumy.title': `${real.sumy.title} · ${area(real.sumy.S)}`,
  'sumy.shares.log': `частки мережі для ${st.bucket} м²`,
  'sumy.shares': `зал ${share(st.target_shares.trade_hall)} · санвузол ${share(st.target_shares.sanitary)} · склад ${share(st.target_shares.storage)} · персонал ${share(st.target_shares.staff_room)}`,
  'sumy.truth': `звірка з креслярем: збіг ${pctInt(real.sumy.G2.acc)} площі`,
  'final': `${int(draft)} з ${int(total)} сторінок — чернетка автоматично · ${int(human)} — до людини з причиною · жодна хибна не пройшла`,
};
for (const r of results) {
  if (r.route === 'чернетка') continue;
  EXPECT[`chip.${r.id}`] = 'до людини';
  EXPECT[`pass.${r.id}`] = `${r.name} · до людини · ${r.reasons[0]}`;
}
EXPECT['pass.O01'] = `${by('O01').name} · чернетка · ✓ ${pctSigned(by('O01').err!)}`;

// данные под сверку: как есть, или с подменой (позитивный контроль)
let pack: Pack = PACK;
if (negative) {
  pack = structuredClone(PACK);
  const r = pack.results.find((x) => x.id === PAGE_FULL)!;
  const was = r.err;
  r.err = (r.err ?? 0) + 1;
  console.log(`\nПОЗИТИВНЫЙ КОНТРОЛЬ: results.json → O02.err подменён ${was} → ${r.err}; сверка обязана упасть`);
}
const S = screenNumbersFrom(pack);

console.log('\nЧисла экрана → источник:');
for (const [k, v] of Object.entries(EXPECT)) expect(`${k} = «${v}»`, S[k] === v, S[k] === v ? '' : `на экране «${S[k]}»`);
expect('в реестре нет ключей без значения', Object.values(S).every((v) => typeof v === 'string' && v.length > 0));
expect('все ожидаемые ключи есть в реестре', Object.keys(EXPECT).every((k) => k in S), Object.keys(EXPECT).filter((k) => !(k in S)).join(' '));

// причины reasons[0] (строка из results.json как есть): число внутри = err / check.err_pct того же объекта, 1 знак
console.log('\nПричины reasons[0]:');
for (const r of results) {
  const reason = r.reasons[0];
  if (!reason) continue;
  const m = reason.match(/([-−+]?\d+(?:,\d+)?)\s*%/);
  if (!m) {
    expect(`${r.id}: «${reason}» — без числа`, true);
    continue;
  }
  const shown = Number(m[1].replace(',', '.').replace('−', '-'));
  const src = reason.startsWith('площа') ? r.err : reason.startsWith('другий розмір') ? r.check?.err_pct : undefined;
  expect(`${r.id}: «${reason}» ↔ ${reason.startsWith('площа') ? 'err' : 'check.err_pct'} ${src}`, src !== undefined && src !== null && Math.abs(shown - Math.round(src * 10) / 10) < 1e-9);
}

// согласованность stats ↔ real_examples
console.log('\nСогласованность источников:');
expect('stats.sumy.S = real_examples.sumy.S', stats.sumy.S === real.sumy.S, `${stats.sumy.S} / ${real.sumy.S}`);
expect('stats.sumy.G2_acc = real_examples.sumy.G2.acc', stats.sumy.G2_acc === real.sumy.G2.acc, `${stats.sumy.G2_acc} / ${real.sumy.G2.acc}`);
expect('routes: чернетка + до людини = всего', draft + human === total, `${draft} + ${human} = ${total}`);
expect('таймлайн: 9 страниц прогона + O02 + O07 = все страницы', [PAGE_FULL, PAGE_FAIL, 'O01', 'O03', 'O04', 'O05', 'O06', 'O08', 'O09', 'O10', 'O11'].sort().join() === results.map((r) => r.id).sort().join());

// ---------------------------------------------------------------- 3. геометрия
console.log('\nГеометрия полотна:');
const inside = (pt: [number, number], w: number, h: number) => pt[0] >= 0 && pt[0] <= w && pt[1] >= 0 && pt[1] <= h;
for (const id of [PAGE_FULL, PAGE_FAIL]) {
  const { w, h } = frameSize(id);
  for (const which of ['primary', 'check'] as const) {
    const sg = segOnFrame(id, which);
    expect(`${id} линия ${which} ${JSON.stringify(sg)} внутри кадра ${w}×${h}`, inside(sg[0], w, h) && inside(sg[1], w, h));
  }
  const poly = outlineOnFrame(id);
  expect(`${id} контур (${poly.length} вершин) внутри кадра`, poly.every((p) => inside(p, w, h)));
}
expect('O02 кадр после crop = 813×712 (как png пакета)', frameSize(PAGE_FULL).w === 813 && frameSize(PAGE_FULL).h === 712, JSON.stringify(frameSize(PAGE_FULL)));
expect('O02 вершин контура = outline.vertices', outlineOnFrame(PAGE_FULL).length === geomO02.outline.vertices);

console.log('\nПлан Сум:');
const box = { x: 100, y: 100, w: 1000, h: 700 };
const M = planMap(box, pack);
expect(`вход ent ниже центроида на экране (θ=${M.theta}°): y ${M.ent[1].toFixed(1)} > ${M.centroid[1].toFixed(1)}`, M.ent[1] > M.centroid[1]);
const o = M.map([0, 0]);
const ex = M.map([1, 0]);
const ey = M.map([0, 1]);
const ax = [ex[0] - o[0], ex[1] - o[1]];
const ay = [ey[0] - o[0], ey[1] - o[1]];
const det = ax[0] * ay[1] - ax[1] * ay[0];
expect('без зеркала: det(метры→экран) = −s² (чистый поворот + переворот оси y экрана)', Math.abs(det + M.s * M.s) < 1e-6, `det ${det.toFixed(3)}, s² ${(M.s * M.s).toFixed(3)}`);
expect('равномерный масштаб: |ex| = |ey| = s', Math.abs(Math.hypot(...ax) - M.s) < 1e-6 && Math.abs(Math.hypot(...ay) - M.s) < 1e-6);
const sumy = pack.real[SUMY_KEY];
const allPts = sumy.contour[0].map(M.map);
expect('контур внутри box', allPts.every((p) => p[0] >= box.x - 1e-6 && p[0] <= box.x + box.w + 1e-6 && p[1] >= box.y - 1e-6 && p[1] <= box.y + box.h + 1e-6));
const san = pack.stats[SUMY_KEY].san_polygon_m[0];
const sx = san.map((p) => p[0]);
const sy = san.map((p) => p[1]);
const cx = sumy.contour[0].map((p) => p[0]);
const cy = sumy.contour[0].map((p) => p[1]);
const tol = 0.01; // м: углы обвода на ~2 мм за контуром — округление (архитектор)
expect('san_polygon_m в системе метров контура (bbox внутри bbox контура ± 1 см)', Math.min(...sx) >= Math.min(...cx) - tol && Math.max(...sx) <= Math.max(...cx) + tol && Math.min(...sy) >= Math.min(...cy) - tol && Math.max(...sy) <= Math.max(...cy) + tol);
const truthSan = (sumy.truth.find(([k]) => k === 'sanitary')?.[1] ?? [])[0] ?? [];
const tsx = truthSan.map((p) => p[0]);
const tsy = truthSan.map((p) => p[1]);
expect('bbox san_polygon_m ≈ bbox truth sanitary (± 1 см)', truthSan.length > 0 && Math.abs(Math.min(...sx) - Math.min(...tsx)) < tol && Math.abs(Math.max(...sx) - Math.max(...tsx)) < tol && Math.abs(Math.min(...sy) - Math.min(...tsy)) < tol && Math.abs(Math.max(...sy) - Math.max(...tsy)) < tol);
expect('g2 и truth содержат все 4 зоны', ZONE_ORDER.every((z) => sumy.g2.some(([k]) => k === z) && sumy.truth.some(([k]) => k === z)));

// ---------------------------------------------------------------- итог
console.log(`\n${passed} ✓, ${failed} ✗`);
if (negative) {
  if (failed > 0) {
    console.log('ПОЗИТИВНЫЙ КОНТРОЛЬ: подмена поймана, тест упал — как и должен (exit 1)');
    process.exit(1);
  }
  console.error('ОШИБКА ПОЗИТИВНОГО КОНТРОЛЯ: подмена O02.err не поймана (exit 2)');
  process.exit(2);
}
process.exit(failed ? 1 : 0);
