// Кроп 9:16 живых планов: окно 1080 px по ширине высокой версии исходника (assets: *.port.mp4, высота 1920).
// Значение — центр окна по горизонтали в долях ширины исходника (0..1). Выбор Олега — outro.yaml →
// episodes.<ep>.vertical.crops (ключи-псевдонимы ниже). V7/V1/V3 (погоня, динамика v2) — новые варианты, по умолчанию B.
export type CropVariant = 'A' | 'B' | 'C';
export const CROP_VARIANTS: Record<string, Record<CropVariant, number> & { why: string }> = {
  'V7_f24-45': { A: 0.4, B: 0.52, C: 0.66, why: 'погоня: A — Subaru, B — Subaru и BMW (центр действия), C — BMW' },
  'V1_f180-201': { A: 0.42, B: 0.55, C: 0.72, why: 'капот Subaru: A — MIA за стеклом, B — капот и MIA, C — BMW сзади' },
  'V3_f228-260': { A: 0.4, B: 0.5, C: 0.6, why: 'переворот в воздухе: A — левее, B — машина по центру, C — правее' },
  'V5_f2-24': { A: 0.48, B: 0.4, C: 0.58, why: 'MIA крупно: A — лицо по центру, B/C — сдвиг влево/вправо' },
  'V10_f97-108': { A: 0.64, B: 0.46, C: 0.3, why: 'A — ROOK (DARK), B — ROOK и MIA частично, C — MIA вниз головой' },
  'V10_f150-193': { A: 0.62, B: 0.5, C: 0.35, why: 'A — рука с пистолетом и ROOK, B — пистолет и MIA, C — MIA' },
  'V9_f157-168': { A: 0.5, B: 0.42, C: 0.58, why: 'JAX крупно: A — лицо по центру, B/C — сдвиг' },
  'V12_f1-12': { A: 0.66, B: 0.55, C: 0.75, why: 'HALE профиль: A — лицо и гарнитура, B — больше неба перед лицом, C — затылок' },
  'V12_f317-360': { A: 0.55, B: 0.32, C: 0.7, why: 'A — HALE и заряд, B — HALE, C — заряд с огоньком' },
  'V5_f239-282': { A: 0.4, B: 0.3, C: 0.5, why: 'дверь ангара: A — дверь с прорезью, B — дверь крупнее без прорези, C — дверь левее и стена' },
  'V5_f283-347': { A: 0.4, B: 0.3, C: 0.5, why: 'финал на той же двери (как затишье)' },
};

/** Псевдонимы outro.yaml vertical.crops → ключ плана (исходник_fот-до). */
export const CROP_ALIAS: Record<string, string> = {
  V7: 'V7_f24-45', V1: 'V1_f180-201', V3: 'V3_f228-260',
  V10_look: 'V10_f97-108', V10_gun: 'V10_f150-193', V9: 'V9_f157-168',
  V12_profile: 'V12_f1-12', V12_charge: 'V12_f317-360', V5_lull: 'V5_f239-282', V5_final: 'V5_f283-347',
};

/** Вариант для плана: явный override (стиллы выбора) → выбор Олега в outro.yaml → B. */
export function cropFor(key: string, chosen: Record<string, CropVariant>, override?: CropVariant): CropVariant {
  if (override) return override;
  for (const [alias, k] of Object.entries(CROP_ALIAS)) if (k === key && chosen[alias]) return chosen[alias];
  return 'B';
}
