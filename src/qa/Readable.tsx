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

export const READABLE_ATTR = { id: 'data-readable-id', text: 'data-readable-text' } as const;

/**
 * Метка непрозрачного слоя, который может закрыть текст (вырезка героя и т.п.): ставится на <Img>.
 * readcheck берёт альфу картинки и считает долю букв <Readable>, закрытых ею, если слой нарисован ПОВЕРХ текста
 * (идёт после него в документе; z-index не учитывается). mask-image слоя не учитывается — оценка строже реальности.
 */
export const OCCLUDER_ATTR = { 'data-occluder': '' } as const;

export const Readable: React.FC<{ id: string; text: string; children: React.ReactNode }> = ({ id, text, children }) => (
  <span {...{ [READABLE_ATTR.id]: id, [READABLE_ATTR.text]: text }} style={{ display: 'contents' }}>
    {children}
  </span>
);
