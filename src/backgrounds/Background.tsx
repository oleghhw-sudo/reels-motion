// Background — рендерит рецепт поверх пресета: слои снизу вверх, у каждого opacity/blend.
import React, { useMemo } from 'react';
import { AbsoluteFill } from 'remotion';
import type { Preset } from '../theme/presets.ts';
import { fontStack } from '../theme/loadFonts.ts';
import { resolveRecipe } from './recipes.ts';
import type { Recipe, ResolvedLayer } from './types.ts';
import { ShaderBase } from './layers/ShaderBase.tsx';
import { Solid, Gradient, Vignette, LightSweep, Glow } from './layers/simple.tsx';
import { Grain } from './layers/Grain.tsx';
import { Paper } from './layers/Paper.tsx';
import { GridPattern } from './layers/GridPattern.tsx';
import { NoiseField } from './layers/NoiseField.tsx';
import { TechLabels } from './layers/TechLabels.tsx';

function renderLayer(layer: ResolvedLayer, preset: Preset): React.ReactNode {
  switch (layer.type) {
    case 'shader':
      return <ShaderBase spec={layer} />;
    case 'solid':
      return <Solid spec={layer} />;
    case 'gradient':
      return <Gradient spec={layer} />;
    case 'grid':
      return <GridPattern spec={layer} />;
    case 'grain':
      return (
        <Grain
          spec={layer}
          frequency={layer.frequency ?? preset.grain.frequency}
          animated={layer.animated ?? preset.grain.animated}
        />
      );
    case 'vignette':
      return <Vignette spec={layer} />;
    case 'sweep':
      return <LightSweep spec={layer} />;
    case 'noiseField':
      return <NoiseField spec={layer} />;
    case 'glow':
      return <Glow spec={layer} />;
    case 'paper':
      return <Paper spec={layer} />;
    case 'techLabels':
      return <TechLabels spec={layer} fontFamily={fontStack(preset.fonts.mono)} />;
  }
}

export const Background: React.FC<{ recipe: Recipe; preset: Preset }> = ({ recipe, preset }) => {
  const layers = useMemo(() => resolveRecipe(recipe, preset), [recipe, preset]);
  return (
    <AbsoluteFill style={{ backgroundColor: preset.palette.bg, overflow: 'hidden' }}>
      {layers.map((layer, i) => {
        // Зерно: непрозрачность и бленд по умолчанию — из пресета, слой может ослабить множителем
        const isGrain = layer.type === 'grain';
        const opacity = isGrain ? preset.grain.opacity * (layer.opacity ?? 1) : (layer.opacity ?? 1);
        const blend = isGrain ? (layer.blend ?? preset.grain.blend) : (layer.blend ?? 'normal');
        return (
          <AbsoluteFill key={i} data-layer={layer.type} style={{ opacity, mixBlendMode: blend }}>
            {renderLayer(layer, preset)}
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
};
