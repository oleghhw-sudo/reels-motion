// Позитивный контроль проверки LATIN_ONLY (решение Олега 2026-10-18): кириллица шрифтом latinOnly (Anton).
// readcheck LatinOnlyFixture обязан найти ровно 2 нарушения LATIN_ONLY: «ЇЖАК» в <Readable> и «ҐЕДЗЬ» вне его.
// Семейство задано напрямую (не через fontFor), чтобы до readcheck дошёл кадр: fontFor упал бы раньше — это проверено в src/theme/fonts.test.ts.
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { loadAllFonts } from '../theme/loadFonts.ts';
import { FONTS } from '../theme/fonts.ts';
import { Readable } from './Readable.tsx';

loadAllFonts();

export const LATIN_FIXTURE_FRAMES = 60;
const anton = `'${FONTS.Anton.family}'`;

export const LatinOnlyFixture: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: '#17161a', color: '#efeae0', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 80 }}>
    <Readable id="fx.latin" text="ЇЖАК">
      <div style={{ fontFamily: anton, fontSize: 220 }}>ЇЖАК</div>
    </Readable>
    <div style={{ fontFamily: anton, fontSize: 120 }}>ҐЕДЗЬ</div>
    <Readable id="fx.latin.ok" text="MIA">
      <div style={{ fontFamily: anton, fontSize: 160 }}>MIA</div>
    </Readable>
  </AbsoluteFill>
);
