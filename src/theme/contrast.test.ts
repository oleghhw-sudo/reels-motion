// Тест контраста пресетов (WCAG 2.x). Запуск: npm run test:contrast
// Пороги: text/bg ≥ 7 (AAA), textMuted/bg ≥ 4.5 (AA), accent/bg ≥ 3 (крупный текст).
// `--negative` — позитивный контроль: подсовывает заведомо плохую пару и ОБЯЗАН упасть.

import { contrast, inSrgbGamut } from './color.ts';
import { PRESETS, type Preset } from './presets.ts';

type Rule = { fg: keyof Preset['palette']; min: number; why: string };
const RULES: Rule[] = [
  { fg: 'text', min: 7, why: 'основной текст, AAA' },
  { fg: 'textMuted', min: 4.5, why: 'вторичный текст, AA' },
  { fg: 'accent', min: 3, why: 'акцент для крупного текста' },
];

function checkPreset(p: Preset): string[] {
  const fails: string[] = [];
  const row: string[] = [];
  for (const r of RULES) {
    const c = contrast(p.palette[r.fg], p.palette.bg);
    row.push(`${r.fg}=${c.toFixed(2)}`);
    if (c < r.min) fails.push(`${p.id}: ${r.fg}/bg = ${c.toFixed(2)} < ${r.min} (${r.why})`);
  }
  for (const [k, v] of Object.entries(p.palette)) {
    if (!inSrgbGamut(v)) row.push(`[вне sRGB: ${k}]`);
  }
  console.log(`  ${p.id.padEnd(16)} ${row.join('  ')}`);
  return fails;
}

const negative = process.argv.includes('--negative');
let presets: Preset[] = Object.values(PRESETS);
if (negative) {
  console.log('ПОЗИТИВНЫЙ КОНТРОЛЬ: плохая пара серый-на-сером, тест обязан упасть');
  presets = [
    {
      ...PRESETS['graphite-lime'],
      id: 'BAD-grey-on-grey' as Preset['id'],
      palette: {
        ...PRESETS['graphite-lime'].palette,
        text: 'oklch(0.55 0 0)',
        textMuted: 'oklch(0.45 0 0)',
        accent: 'oklch(0.4 0.1 125)',
        bg: 'oklch(0.35 0 0)',
      },
    },
  ];
}

const fails = presets.flatMap(checkPreset);
if (fails.length) {
  console.error(`\nПРОВАЛ контраста (${fails.length}):`);
  for (const f of fails) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`\nOK: все ${presets.length} пресетов проходят пороги 7 / 4.5 / 3`);
