// Приёмы динамики v2 аутро MIA (каталог motion-prompt, локальный; тайминги — docs/tasks/data/008-proto-rook-card.py).
// Всё — функция номера кадра; случайность — только rand(seed) из src/motion/tokens.ts (гейт 1).
//   #111 хроматическое двоение — SVG-фильтр: R сдвигается вправо, B влево;
//   #043 смаз-склейка — горизонтальное размытие + сдвиг по направлению;
//   #024 удар камеры — тряска с экспоненциальным затуханием;
//   #118 зерно — тайлы с seed, «на двойках»; виньетка.
import React from 'react';
import { AbsoluteFill, staticFile, useCurrentFrame } from 'remotion';
import { rand } from '../../motion/tokens.ts';
import { MANIFEST, asset } from './script.ts';

/** Тряска k кадров после удара: амплитуда amp·decay^k, направление — rand(seed); после maxK кадров — 0. */
export const shake = (k: number, amp: number, decay: number, seed: string, maxK = 12): [number, number] => {
  if (k < 0 || k > maxK) return [0, 0];
  const a = amp * decay ** k;
  return [(rand(`${seed}:${k}:x`) * 2 - 1) * a, (rand(`${seed}:${k}:y`) * 2 - 1) * a];
};

/** SVG-фильтры одного слоя: хроматика (px) и горизонтальный смаз (px, ширина «размыва»). id уникален в кадре. */
export const Filters: React.FC<{ id: string; ca: number; smear: number }> = ({ id, ca, smear }) => (
  <svg width={0} height={0} style={{ position: 'absolute' }}>
    <defs>
      {ca >= 0.5 ? (
        <filter id={`${id}-ca`} x="-2%" y="0" width="104%" height="100%" colorInterpolationFilters="sRGB">
          <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
          <feOffset in="r" dx={ca} dy={0} result="r2" />
          <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
          <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
          <feOffset in="b" dx={-ca} dy={0} result="b2" />
          <feComposite in="r2" in2="g" operator="arithmetic" k1={0} k2={1} k3={1} k4={0} result="rg" />
          <feComposite in="rg" in2="b2" operator="arithmetic" k1={0} k2={1} k3={1} k4={0} />
        </filter>
      ) : null}
      {smear >= 1 ? (
        <filter id={`${id}-sm`} x="-10%" y="0" width="120%" height="100%">
          <feGaussianBlur stdDeviation={`${smear / 3} 0`} edgeMode="duplicate" />
        </filter>
      ) : null}
    </defs>
  </svg>
);
export const filterCss = (id: string, ca: number, smear: number, extra = ''): string =>
  [ca >= 0.5 ? `url(#${id}-ca)` : '', smear >= 1 ? `url(#${id}-sm)` : '', extra].filter(Boolean).join(' ') || 'none';

export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.07 }) => {
  const f = useCurrentFrame();
  const tile = MANIFEST.grain[Math.floor(f / 2) % MANIFEST.grain.length];
  if (opacity <= 0.001) return null;
  return <AbsoluteFill style={{ backgroundImage: `url(${staticFile(asset(tile))})`, backgroundSize: '512px 512px', opacity, mixBlendMode: 'overlay', pointerEvents: 'none' }} />;
};

/** Виньетка как в прототипе: к краям темнее до 0.55. */
export const Vignette: React.FC = () => (
  <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.42) 100%)', pointerEvents: 'none' }} />
);

export const White: React.FC<{ a: number }> = ({ a }) => (a > 0.001 ? <AbsoluteFill style={{ backgroundColor: '#fff', opacity: Math.min(1, a) }} /> : null);
