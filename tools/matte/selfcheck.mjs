#!/usr/bin/env node
// tools/matte/selfcheck.mjs — самопроверка маски без правды (правило переключения на запасной движок, задачи 025/025-Б/026-А).
// По matte.mp4 (30 fps) в 270×480:
//   flickerFramePermille — средняя |m_t − m_{t−1}| по всему кадру (‰ от полной) по ИСХОДНЫМ кадрам: пары соседних кадров,
//                          пришедшие из одного исходного кадра (дубли при пересчёте 25 → 30 fps), из среднего и максимума исключены;
//   areaJumpMax          — максимальный скачок площади маски (> 127) между соседними исходными кадрами, доля кадра.
// Пороги — SELF_CHECK (одно место); превышение → предупреждение «проверь лист, перегнать --engine rvm», автоматически не перегоняем.
// Дубли вычисляются по времени (как fps-фильтр ffmpeg): исходный кадр s(i) = floor((i + 0.5) · srcFps / 30); контроль — synthetic
// видео 25 fps из двух чередующихся масок (tools/matte/calibrate.mjs --self-test-dup).
//   node tools/matte/selfcheck.mjs --id <id>   — пересчитать и записать в MATTE_DIR/<id>/matte.json → selfCheck
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SELF_CHECK = { flickerFramePermille: 20, areaJumpMax: 0.08 };
export const OUT_FPS = 30;

/** Индекс исходного кадра для кадра i выходного потока 30 fps (ffmpeg fps=30, округление near). */
export const sourceFrameOf = (i, srcFps, outFps = OUT_FPS) => Math.floor(((i + 0.5) * srcFps) / outFps);

/** Метрики по буферу gray-кадров TW×TH. srcFps — частота исходника (для исключения дублей). */
export const selfCheckFrom = (buf, TW, TH, srcFps) => {
  const n = Math.floor(buf.length / (TW * TH));
  let diffSum = 0, diffMax = 0, diffMaxAt = 0, areaJumpMax = 0, areaJumpAt = 0, prevArea = 0, pairsUsed = 0, pairsSkipped = 0;
  for (let i = 0; i < n; i++) {
    const o = i * TW * TH; let area = 0, d = 0;
    for (let p = 0; p < TW * TH; p++) { const v = buf[o + p]; if (v > 127) area++; if (i) d += Math.abs(v - buf[o - TW * TH + p]); }
    if (i) {
      if (sourceFrameOf(i, srcFps) === sourceFrameOf(i - 1, srcFps)) pairsSkipped++;
      else {
        pairsUsed++;
        const dm = d / (TW * TH * 255); diffSum += dm; if (dm > diffMax) { diffMax = dm; diffMaxAt = i; }
        const j = Math.abs(area - prevArea) / (TW * TH); if (j > areaJumpMax) { areaJumpMax = j; areaJumpAt = i; }
      }
    }
    prevArea = area;
  }
  const diffMean = pairsUsed ? diffSum / pairsUsed : 0;
  const warnings = [];
  if (diffMean * 1000 > SELF_CHECK.flickerFramePermille) warnings.push(`flickerFramePermille ${(diffMean * 1000).toFixed(1)} > ${SELF_CHECK.flickerFramePermille}`);
  if (areaJumpMax > SELF_CHECK.areaJumpMax) warnings.push(`areaJumpMax ${areaJumpMax.toFixed(3)} (кадр ${areaJumpAt}) > ${SELF_CHECK.areaJumpMax}`);
  return {
    flickerFramePermille: Math.round(diffMean * 10000) / 10, flickerFrameMaxPermille: Math.round(diffMax * 10000) / 10, flickerFrameMaxAt: diffMaxAt,
    areaJumpMax: Math.round(areaJumpMax * 1000) / 1000, areaJumpMaxAt: areaJumpAt,
    sourceFps: srcFps, frames: n, pairsUsed, pairsSkipped, thresholds: { ...SELF_CHECK }, warnings,
  };
};

/** Самопроверка по файлу matte.mp4 (декод в 270×480 gray). */
export const selfCheckFile = (mattePath, srcFps) => {
  const TW = 270, TH = 480;
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', mattePath, '-vf', `scale=${TW}:${TH}`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 2 ** 31 });
  if (r.status !== 0) return null;
  return selfCheckFrom(r.stdout, TW, TH, srcFps);
};

export const warnText = (sc, id, engine) => `  ⚠ самопроверка: ${sc.warnings.join('; ')} — проверь лист (npm run matte:sheet -- --id ${id})${engine === 'vision' ? ', возможно перегнать --engine rvm' : ''}`;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const args = process.argv.slice(2);
  const i = args.indexOf('--id');
  const id = i >= 0 ? args[i + 1] : undefined;
  if (!id) { console.error('использование: node tools/matte/selfcheck.mjs --id <id>'); process.exit(1); }
  const envText = existsSync(join(ROOT, '.env')) ? readFileSync(join(ROOT, '.env'), 'utf8') : '';
  const MATTE_DIR = process.env.MATTE_DIR ?? envText.match(/^MATTE_DIR=(.+)$/m)?.[1]?.trim().replace(/^"(.*)"$/, '$1');
  if (!MATTE_DIR) { console.error('MATTE_DIR не задан'); process.exit(1); }
  const mp = join(MATTE_DIR, id, 'matte.json');
  const man = JSON.parse(readFileSync(mp, 'utf8'));
  const before = man.selfCheck ?? null;
  const sc = selfCheckFile(join(MATTE_DIR, id, 'matte.mp4'), man.source.fps);
  man.selfCheck = sc;
  writeFileSync(mp, JSON.stringify(man, null, 2) + '\n');
  console.log(`${id} (${man.engine}, источник ${man.source.fps} fps): flickerFramePermille ${before?.flickerFramePermille ?? '—'} → ${sc.flickerFramePermille}; areaJumpMax ${before?.areaJumpMax ?? '—'} → ${sc.areaJumpMax}; пар ${sc.pairsUsed} (пропущено дублей ${sc.pairsSkipped}); ${sc.warnings.length ? 'ПРЕДУПРЕЖДЕНИЕ: ' + sc.warnings.join('; ') : 'без предупреждений'}`);
}
