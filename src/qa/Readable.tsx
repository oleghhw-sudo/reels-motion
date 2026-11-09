// Метка текстового блока для проверки читаемости (scripts/readcheck.mjs).
// В рендере прозрачна: обёртка `display: contents` не создаёт бокса и не меняет раскладку
// (flex/grid-дети остаются детьми родителя), стилей не наследует сверх родителя.
// Проверка меряет не бокс обёртки (его нет), а прямоугольники текстовых узлов внутри неё
// (Range.getClientRects) — с учётом transform, overflow и clip-path предков.
//
// id   — стабильный идентификатор блока в ролике (в отчёте и json).
// text — ПОЛНЫЙ текст, который зритель должен прочитать (по нему считается требуемое время),
//        даже если в DOM он разбит на строки/спаны или проявляется по частям.
import React from 'react';

export const READABLE_ATTR = { id: 'data-readable-id', text: 'data-readable-text', voiced: 'data-readable-voiced', credit: 'data-readable-credit' } as const;

/**
 * Метка непрозрачного слоя, который может закрыть текст (вырезка героя и т.п.): ставится на <Img>.
 * readcheck берёт альфу картинки и считает долю букв <Readable>, закрытых ею, если слой нарисован ПОВЕРХ текста
 * (идёт после него в документе; z-index не учитывается). mask-image слоя не учитывается — оценка строже реальности.
 */
export const OCCLUDER_ATTR = { 'data-occluder': '' } as const;

/**
 * voiced — текст, который одновременно звучит голосом (субтитры диктора): держится ровно столько, сколько звучит фраза,
 * поэтому readcheck не проверяет для него время чтения (SHORT); остальные проверки (кадр, safe zones, размер) — как обычно.
 */
/**
 * credit — обязательная служебная подпись (атрибуция лицензии CC BY и т.п., решение Олега 09.11): её не читают за время
 * показа, она просто должна быть в кадре. readcheck не судит для неё время чтения (SHORT), а порог мелкого текста (SMALL)
 * для неё — 20 px вместо --min-px; кадр, safe zones и перекрытие проверяются как обычно.
 */
export const Readable: React.FC<{ id: string; text: string; voiced?: boolean; credit?: boolean; children: React.ReactNode }> = ({ id, text, voiced, credit, children }) => (
  <span {...{ [READABLE_ATTR.id]: id, [READABLE_ATTR.text]: text }} {...(voiced ? { [READABLE_ATTR.voiced]: '' } : {})} {...(credit ? { [READABLE_ATTR.credit]: '' } : {})} style={{ display: 'contents' }}>
    {children}
  </span>
);
