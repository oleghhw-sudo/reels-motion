// Запуск всех тестов src/motion и src/fx: npm run test:motion [-- --negative]
// Каждый *.test.ts идёт отдельным процессом (у каждого свой счётчик и exit), аргументы передаются всем.
// --negative: каждый тест-файл добавляет заведомо неверное ожидание — прогон ОБЯЗАН упасть (гейт 4).
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
// тесты src/motion и src/fx (задача 012-А) — одним прогоном
const DIRS = [DIR, join(DIR, '..', 'fx')];
const files = DIRS.flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.test.ts')).map((f) => join(d, f))).sort();
let bad = 0;
for (const f of files) {
  console.log(`\n── ${f.slice(join(DIR, "..").length + 1)}`);
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', f, ...process.argv.slice(2)], { stdio: 'inherit' });
  if (r.status !== 0) bad++;
}
console.log(`\n${bad ? `ПРОВАЛ: ${bad} из ${files.length} файлов` : `OK: ${files.length} файлов`}`);
process.exit(bad ? 1 : 0);
