// Motion Prompt #007 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#007
//
// Count-up: число быстро растёт и «встаёт» на итоговое значение; чип-стрелка слева, полоса снизу.
// Перенос спецификации #007 в DOM (canvas-код не переносился): числа — в SPEC (countup.ts), всё от useCurrentFrame().
// Геометрия задана в px спецификации (ячейка 539×208 при шрифте 104) и масштабируется k = fontSize / 104.
// Ширина числа не дрожит: tabular-nums + невидимая копия итогового значения задаёт ширину, видимое — справа.
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { Readable } from '../qa/Readable.tsx';
import { SPEC, alpha, barFill, chipBob, chipScale, countValue, formatUk, isLanded, landScale } from './countup.ts';

export type CountUpTheme = {
  /** Цвет числа во время счёта (в спец. белый). */
  text: string;
  /** Цвет числа после приземления на 2.9 с (в спец. жёлтый). */
  accent: string;
  /** Градиент заполнения полосы слева направо (в спец. blue → mint). */
  bar: readonly [string, string];
  /** Подложка полосы (в спец. navy3). */
  track: string;
  /** Круг чипа (в спец. mint) и стрелка на нём (в спец. navy). */
  chip: string;
  chipInk: string;
};

/** Размер шрифта по умолчанию: 104 спецификации × 1080/539 — ячейка галереи растянута на ширину кадра 1080. */
export const COUNTUP_DEFAULT_FONT_SIZE = 208;

export type CountUpProps = {
  /** Стабильный id для readcheck. */
  id: string;
  target: number;
  from?: number;
  startSec?: number;
  suffix?: string;
  theme: CountUpTheme;
  showChip?: boolean;
  showBar?: boolean;
  fontFamily: string;
  fontSize?: number;
  /** Если задан — уход по спецификации: число и полоса 0.4 с, чип 0.3 с (с этого момента, в с от startSec). */
  exitAtSec?: number;
};

export const CountUp: React.FC<CountUpProps> = ({
  id,
  target,
  from = 0,
  startSec = 0,
  suffix = '',
  theme,
  showChip = true,
  showBar = true,
  fontFamily,
  fontSize = COUNTUP_DEFAULT_FONT_SIZE,
  exitAtSec,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps - startSec;
  const k = fontSize / SPEC.fontSize;

  const a = alpha(t, exitAtSec);
  const value = countValue(t, target, from);
  const pop = landScale(t);
  const ar = chipScale(t, exitAtSec);
  const bob = chipBob(t);
  const finalText = formatUk(target) + suffix;

  const numberStyle: React.CSSProperties = {
    fontFamily,
    fontWeight: 800,
    fontSize,
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  };

  return (
    <div style={{ position: 'relative', width: SPEC.cellW * k, height: SPEC.cellH * k }}>
      {/* число: центр в (cellW/2 + 42, 96), выравнивание вправо внутри ширины итогового значения */}
      <div
        style={{
          position: 'absolute',
          left: SPEC.numberCenterX * k,
          top: SPEC.numberCenterY * k,
          transform: 'translate(-50%, -50%)',
          display: 'grid',
        }}
      >
        <span style={{ ...numberStyle, gridArea: '1 / 1', visibility: 'hidden' }} aria-hidden>
          {finalText}
        </span>
        <span
          style={{
            ...numberStyle,
            gridArea: '1 / 1',
            textAlign: 'right',
            color: isLanded(t) ? theme.accent : theme.text,
            opacity: a,
            transform: `scale(${pop})`,
          }}
        >
          <Readable id={id} text={finalText}>
            {formatUk(value) + suffix}
          </Readable>
        </span>
        {showChip && ar > 0.01 ? (
          <svg
            width={2 * SPEC.chipR * k}
            height={2 * SPEC.chipR * k}
            viewBox={`${-SPEC.chipR} ${-SPEC.chipR} ${2 * SPEC.chipR} ${2 * SPEC.chipR}`}
            style={{
              position: 'absolute',
              left: -(SPEC.chipGap + SPEC.chipR) * k,
              top: `calc(50% + ${(-2 + bob - SPEC.chipR) * k}px)`,
              transform: `scale(${ar})`,
              overflow: 'visible',
            }}
          >
            <circle r={SPEC.chipR} fill={theme.chip} />
            <path d="M0,15 L0,-14 M-13,-1 L0,-15 L13,-1" stroke={theme.chipInk} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        ) : null}
      </div>
      {/* полоса 330×12 под числом, заполнение value / target */}
      {showBar ? (
        <div
          style={{
            position: 'absolute',
            left: (SPEC.cellW / 2 - SPEC.barW / 2) * k,
            top: SPEC.barY * k,
            width: SPEC.barW * k,
            height: SPEC.barH * k,
            borderRadius: (SPEC.barH / 2) * k,
            background: theme.track,
            opacity: a,
          }}
        >
          <div
            style={{
              width: Math.max(SPEC.barH, SPEC.barW * barFill(value, target)) * k,
              height: '100%',
              borderRadius: (SPEC.barH / 2) * k,
              // градиент — по всей длине полосы (как в спец.), а не по заполненной части
              background: `linear-gradient(90deg, ${theme.bar[0]}, ${theme.bar[1]}) 0 0 / ${SPEC.barW * k}px 100% no-repeat`,
            }}
          />
        </div>
      ) : null}
    </div>
  );
};
