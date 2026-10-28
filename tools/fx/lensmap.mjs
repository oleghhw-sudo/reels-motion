#!/usr/bin/env node
// tools/fx/lensmap.mjs — карта смещения для линзы O7 (cinematic-fx §3 O, задача 026-А): детерминированный PNG N×N,
// R/G = 128 − k·ρ³·(cos θ, sin θ)·127 (ρ — радиус 0…1): в центре без смещения, к краю преломление сильнее
// (feDisplacementMap тянет содержимое от центра → увеличение растёт к краю). B = 128, A = 255.
// Выход — модуль src/fx/talking/lensMap.ts с data URI (без загрузки файла в рендере → нет гонки, /docs/flickering).
//   node tools/fx/lensmap.mjs [--size 280] [--k 1]
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const N = Number(opt('--size', '280')), K = Number(opt('--k', '1'));
const img = Buffer.alloc(N * N * 3);
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const dx = (x + 0.5) / N * 2 - 1, dy = (y + 0.5) / N * 2 - 1;
  const rho = Math.min(1, Math.hypot(dx, dy));
  const th = Math.atan2(dy, dx);
  const m = K * rho * rho * rho;
  const o = (y * N + x) * 3;
  img[o] = Math.round(128 - m * Math.cos(th) * 127);
  img[o + 1] = Math.round(128 - m * Math.sin(th) * 127);
  img[o + 2] = 128;
}
const tmp = join(ROOT, 'out', 'lensmap.ppm');
mkdirSync(dirname(tmp), { recursive: true });
writeFileSync(tmp, Buffer.concat([Buffer.from(`P6\n${N} ${N}\n255\n`), img]));
const png = join(ROOT, 'out', 'lensmap.png');
const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', tmp, '-pix_fmt', 'rgb24', '-compression_level', '9', png]);
if (r.status !== 0) { console.error(r.stderr.toString()); process.exit(1); }
const b64 = readFileSync(png).toString('base64');
const out = join(ROOT, 'src', 'fx', 'talking', 'lensMap.ts');
writeFileSync(out, `// Сгенерировано tools/fx/lensmap.mjs --size ${N} --k ${K} (не править руками). Карта смещения линзы O7: R/G = 128 − ρ³·(cos θ, sin θ)·127.\nexport const LENS_MAP_SIZE = ${N};\nexport const LENS_MAP_K = ${K};\nexport const LENS_MAP = 'data:image/png;base64,${b64}';\n`);
rmSync(tmp, { force: true });
console.log(`✓ ${out.slice(ROOT.length + 1)}: ${N}×${N}, k ${K}, ${(b64.length / 1024).toFixed(0)} КБ base64`);
