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

export const READABLE_ATTR = { id: 'data-readable-id', text: 'data-readable-text', voiced: 'data-readable-voiced' } as const;

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
export const Readable: React.FC<{ id: string; text: string; voiced?: boolean; children: React.ReactNode }> = ({ id, text, voiced, children }) => (
  <span {...{ [READABLE_ATTR.id]: id, [READABLE_ATTR.text]: text }} {...(voiced ? { [READABLE_ATTR.voiced]: '' } : {})} style={{ display: 'contents' }}>
    {children}
  </span>
);
