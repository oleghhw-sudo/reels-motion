#!/usr/bin/env node
// npm run still -- <Composition> <frame> [--props '{"presetId":"ink-coral"}'] [--suffix name]
// → out/stills/<Composition>-<frame>[-suffix].png
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [comp, frameArg, ...rest] = process.argv.slice(2);
if (!comp || frameArg === undefined || !/^\d+$/.test(frameArg)) {
  console.error('Использование: npm run still -- <Composition> <frame> [--props JSON] [--suffix имя]');
  process.exit(1);
}
const pi = rest.indexOf('--props');
const si = rest.indexOf('--suffix');
const props = pi >= 0 ? rest[pi + 1] : undefined;
const suffix = si >= 0 ? `-${rest[si + 1]}` : '';
const outDir = join(ROOT, 'out', 'stills');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `${comp}-${frameArg}${suffix}.png`);
const args = ['remotion', 'still', 'src/index.ts', comp, out, `--frame=${frameArg}`, '--log=warn'];
if (props) args.push(`--props=${props}`);
const r = spawnSync('npx', args, { cwd: ROOT, stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(out);
