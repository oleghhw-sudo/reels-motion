// Фильтр голосов политиков (CLAUDE.md «Голос»: голоса политиков и госдеятелей не использовать нигде).
// ТОЛЬКО политики: известные люди не из политики и персонажи НЕ исключаются — выбор за Олегом.
// Сопоставление — без регистра, шаблон с НАЧАЛА слова (распутин ≠ путин), по title + description + tags голоса.
// Список эвристический: найденное печатается и попадает в отчёт, чтобы человек видел каждое исключение.

/** Корни фамилий политиков/госдеятелей (укр. / рус. / лат. написания) и слова-должности. */
export const POLITICIAN_PATTERNS = [
  // Украина
  'зеленськ', 'зеленск', 'zelensk', 'zelenskiy', 'zelenskyy',
  'порошенк', 'poroshenk', 'тимошенк', 'tymoshenk', 'tymoshenko', 'timoshenk',
  'янукович', 'yanukovych', 'ющенк', 'yushchenk', 'кучма', 'kuchma', 'кравчук', 'kravchuk',
  'шмигал', 'шмыгал', 'shmyhal', 'кулеба', 'kuleba', 'єрмак', 'ермак', 'yermak',
  'арахамі', 'арахами', 'arakhami', 'гончаренк', 'honcharenk', 'медведчук', 'medvedchuk',
  'тягнибок', 'ляшко', 'lyashko', 'разумков', 'razumkov', 'стефанчук', 'безугл', 'bezuhla',
  'гройсман', 'groysman', 'яценюк', 'yatsenyuk', 'турчинов', 'turchynov', 'аваков', 'avakov',
  'кличко', 'klitschko', 'klychko', 'арестович', 'arestovych', 'подоляк', 'podolyak', 'podoliak',
  'резніков', 'резников', 'reznikov', 'данилов', 'danilov', 'буданов', 'budanov', 'залужн', 'zaluzhn',
  'саакашвіл', 'саакашвил', 'saakashvil',
  // Россия / Беларусь
  'путін', 'путин', 'putin', 'медведев', 'medvedev', 'лукашенк', 'lukashenk', 'жириновск', 'zhirinovsk',
  'шойгу', 'shoigu', 'лавров', 'lavrov', 'навальн', 'navaln', 'пєсков', 'песков', 'peskov',
  // США / мир
  'трамп', 'trump', 'байден', 'biden', 'обама', 'obama', 'клінтон', 'клинтон', 'clinton',
  'макрон', 'macron', 'меркель', 'merkel', 'черчил', 'churchill', 'гітлер', 'гитлер', 'hitler',
  'сталін', 'сталин', 'stalin', 'ленін', 'ленин', 'lenin',
  // должности
  'президент', 'president', 'депутат', 'deputy', 'міністр', 'министр', 'minister',
  'прем’єр', "прем'єр", 'премьер', 'prime minister', 'сенатор', 'senator', 'політик', 'политик', 'politician',
];

/** Совпавшие шаблоны для голоса (пусто — не политик). */
export function politicianMatches(voice) {
  const hay = [voice.title, voice.description, ...(voice.tags ?? [])].filter(Boolean).join(' \u0001 ').toLowerCase();
  return POLITICIAN_PATTERNS.filter((p) => new RegExp(`(^|[^\\p{L}])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').test(hay));
}

/** Делит список на допущенные и исключённые (с причиной). */
export function excludePoliticians(voices) {
  const kept = [];
  const excluded = [];
  for (const v of voices) {
    const m = politicianMatches(v);
    if (m.length) excluded.push({ ...v, excludedBy: m });
    else kept.push(v);
  }
  return { kept, excluded };
}
