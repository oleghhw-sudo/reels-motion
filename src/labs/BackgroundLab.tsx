// Лаборатория фонов.
//  • BackgroundLab — 1080×1920@30, по 5 с на рецепт, все рецепты по очереди; подпись в safe-zone.
//  • BackgroundLabGrid — один кадр-постер: сетка 3×5 миниатюр всех рецептов с подписями.
// Пресет переключается пропом presetId (в Studio — панель props).
import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { PRESET_IDS, getPreset, type Preset } from '../theme/presets.ts';
import { fontStack, loadAllFonts } from '../theme/loadFonts.ts';
import { RECIPES } from '../backgrounds/recipes.ts';
import { Background } from '../backgrounds/Background.tsx';
import { SafeZones, SAFE } from './SafeZones.tsx';
import type { Recipe } from '../backgrounds/types.ts';

loadAllFonts();

export const SECONDS_PER_RECIPE = 5;
export const SAMPLE_UA = 'Ґрунтовно. Єдино. Її стиль.';

export const labSchema = z.object({
  presetId: z.enum(PRESET_IDS),
  showSafeZones: z.boolean(),
});
export type LabProps = z.infer<typeof labSchema>;

const Caption: React.FC<{ recipe: Recipe; preset: Preset; index: number }> = ({ recipe, preset, index }) => {
  const p = preset.palette;
  return (
    <div
      style={{
        position: 'absolute',
        left: SAFE.left + 16,
        right: SAFE.right + 16,
        top: SAFE.top + 40,
        bottom: SAFE.bottom + 40,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 36,
      }}
    >
      <div style={{ fontFamily: fontStack(preset.fonts.mono), fontSize: 30, letterSpacing: '0.12em', color: p.accent, textTransform: 'uppercase' }}>
        {String(index + 1).padStart(2, '0')} / {RECIPES.length} · {recipe.id}
      </div>
      <div
        style={{
          fontFamily: fontStack(preset.fonts.display),
          fontWeight: preset.displayWeight,
          fontSize: 118,
          // Ї/Й/Ґ над строкой: при 1.14 точки Ї касаются строки выше (QA 2026-10-09)
          lineHeight: 1.26,
          letterSpacing: '-0.02em',
          color: p.text,
        }}
      >
        {SAMPLE_UA}
      </div>
      <div style={{ fontFamily: fontStack(preset.fonts.body), fontSize: 40, lineHeight: 1.35, color: p.textMuted }}>
        {recipe.label} — {recipe.note}. Пресет «{preset.label}».
      </div>
      <div style={{ fontFamily: fontStack(preset.fonts.display), fontWeight: preset.displayWeight, fontSize: 72, color: p.accent }}>
        ґ є і ї ʼ — 01:23
      </div>
    </div>
  );
};

export const BackgroundLab: React.FC<LabProps> = ({ presetId, showSafeZones }) => {
  const { fps } = useVideoConfig();
  const preset = getPreset(presetId);
  const dur = SECONDS_PER_RECIPE * fps;
  return (
    <AbsoluteFill style={{ backgroundColor: preset.palette.bg }}>
      {RECIPES.map((recipe, i) => (
        <Sequence key={recipe.id} from={i * dur} durationInFrames={dur} name={recipe.id}>
          <Background recipe={recipe} preset={preset} />
          <Caption recipe={recipe} preset={preset} index={i} />
        </Sequence>
      ))}
      {showSafeZones ? <SafeZones color={preset.palette.accent} fontFamily={fontStack(preset.fonts.mono)} /> : null}
    </AbsoluteFill>
  );
};

// ——— Сетка-постер ———
const COLS = 3;
const ROWS = 5;
const THUMB_SCALE = 0.165; // 1080×1920 → 178×317

export const BackgroundLabGrid: React.FC<LabProps> = ({ presetId }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const preset = getPreset(presetId);
  const p = preset.palette;
  const cellW = width / COLS;
  const cellH = height / ROWS;
  const tw = 1080 * THUMB_SCALE;
  const th = 1920 * THUMB_SCALE;
  const cells: React.ReactNode[] = RECIPES.map((recipe, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    return (
      <div key={recipe.id} style={{ position: 'absolute', left: col * cellW, top: row * cellH, width: cellW, height: cellH }}>
        <div
          style={{
            position: 'absolute',
            left: 16,
            top: (cellH - th) / 2,
            width: tw,
            height: th,
            overflow: 'hidden',
            borderRadius: 6,
            outline: `1px solid ${p.surface}`,
          }}
        >
          <div style={{ width: 1080, height: 1920, transform: `scale(${THUMB_SCALE})`, transformOrigin: '0 0', position: 'relative' }}>
            <Background recipe={recipe} preset={preset} />
          </div>
        </div>
        <div style={{ position: 'absolute', left: 16 + tw + 14, right: 10, top: (cellH - th) / 2 + 4 }}>
          <div style={{ fontFamily: fontStack(preset.fonts.mono), fontSize: 17, color: p.accent }}>
            {String(i + 1).padStart(2, '0')}
          </div>
          <div style={{ fontFamily: fontStack(preset.fonts.display), fontWeight: preset.displayWeight, fontSize: 18, lineHeight: 1.15, color: p.text, marginTop: 6, overflowWrap: 'anywhere' }}>
            {recipe.label}
          </div>
          <div style={{ fontFamily: fontStack(preset.fonts.mono), fontSize: 14, color: p.textMuted, marginTop: 8, wordBreak: 'break-all' }}>
            {recipe.id}
          </div>
        </div>
      </div>
    );
  });
  // 15-я ячейка — легенда пресета
  const li = RECIPES.length;
  cells.push(
    <div key="legend" style={{ position: 'absolute', left: (li % COLS) * cellW + 16, top: Math.floor(li / COLS) * cellH + 30, width: cellW - 32 }}>
      <div style={{ fontFamily: fontStack(preset.fonts.display), fontWeight: preset.displayWeight, fontSize: 30, color: p.text }}>{preset.label}</div>
      <div style={{ fontFamily: fontStack(preset.fonts.body), fontSize: 18, color: p.textMuted, marginTop: 8 }}>{preset.intent}</div>
      <div style={{ display: 'flex', gap: 6, marginTop: 16, flexWrap: 'wrap' }}>
        {(['bg', 'surface', 'text', 'textMuted', 'accent', 'accent2', 'glow'] as const).map((k) => (
          <div key={k} style={{ width: 40, height: 40, borderRadius: 4, background: p[k], outline: `1px solid ${p.textMuted}` }} />
        ))}
      </div>
      <div style={{ fontFamily: fontStack(preset.fonts.display), fontWeight: preset.displayWeight, fontSize: 26, color: p.accent, marginTop: 16 }}>
        {SAMPLE_UA}
      </div>
      <div style={{ fontFamily: fontStack(preset.fonts.mono), fontSize: 14, color: p.textMuted, marginTop: 10 }}>frame {frame}</div>
    </div>,
  );
  return <AbsoluteFill style={{ backgroundColor: p.bg }}>{cells}</AbsoluteFill>;
};
