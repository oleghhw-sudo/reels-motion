// Запуск всех тестов src/motion: npm run test:motion [-- --negative]
// Каждый *.test.ts идёт отдельным процессом (у каждого свой счётчик и exit), аргументы передаются всем.
// --negative: каждый тест-файл добавляет заведомо неверное ожидание — прогон ОБЯЗАН упасть (гейт 4).
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(DIR).filter((f) => f.endsWith('.test.ts')).sort();
let bad = 0;
for (const f of files) {
  console.log(`\n── ${f}`);
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(DIR, f), ...process.argv.slice(2)], { stdio: 'inherit' });
  if (r.status !== 0) bad++;
}
console.log(`\n${bad ? `ПРОВАЛ: ${bad} из ${files.length} файлов` : `OK: ${files.length} файлов`}`);
process.exit(bad ? 1 : 0);
