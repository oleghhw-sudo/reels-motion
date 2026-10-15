// Тест фильтра политиков: node voice/politicians.test.mjs
// `--negative` — позитивный контроль (гейт 4): заведомо неверное ожидание ОБЯЗАНО упасть.
import { excludePoliticians, politicianMatches } from './politicians.mjs';

let failed = 0;
const expect = (name, cond, detail = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failed++;
};

// реальные названия из out/voice/candidates.json (--list, 2026-10-16)
const zel = { title: 'Volodomyr Zelensky', tags: ['male', 'old', 'Ukrainian'] };
const zelUk = { title: 'Зеленський', tags: ['male', 'narration'] };
const byTag = { title: 'Голос 7', tags: ['president', 'deep'] };
const commentator = { title: 'Александр Крапиневич', tags: ['male', 'announcer'] };
const character = { title: 'SHADOW FIEND DOTA 2', tags: ['character-voice'] };
const plain = { title: 'рената', tags: ['female', 'young'] };
const rasputin = { title: 'Распутин', tags: ['character'] };
const nick = { title: 'кличка Бобик', tags: [] };

expect('Volodomyr Zelensky → исключён', politicianMatches(zel).length > 0, politicianMatches(zel).join(','));
expect('Зеленський → исключён', politicianMatches(zelUk).length > 0, politicianMatches(zelUk).join(','));
expect('тег president → исключён', politicianMatches(byTag).length > 0);
expect('спортивный комментатор (не политик) → остаётся', politicianMatches(commentator).length === 0);
expect('персонаж игры → остаётся', politicianMatches(character).length === 0);
expect('обычный голос → остаётся', politicianMatches(plain).length === 0);
expect('Распутин (путин внутри слова) → остаётся', politicianMatches(rasputin).length === 0, politicianMatches(rasputin).join(','));
expect('«кличка» → остаётся', politicianMatches(nick).length === 0);
const { kept, excluded } = excludePoliticians([zel, plain, zelUk, character]);
expect('excludePoliticians: 2 остались, 2 исключены с причиной', kept.length === 2 && excluded.length === 2 && excluded.every((e) => e.excludedBy.length));

if (process.argv.includes('--negative')) {
  expect('ПОЗИТИВНЫЙ КОНТРОЛЬ: Зеленський проходит фильтр (заведомо неверно)', politicianMatches(zelUk).length === 0);
  expect('ПОЗИТИВНЫЙ КОНТРОЛЬ: персонаж исключён (заведомо неверно)', politicianMatches(character).length > 0);
}

if (failed) {
  console.error(`\nПРОВАЛ: ${failed}`);
  process.exit(1);
}
console.log('\nOK: politicians');
