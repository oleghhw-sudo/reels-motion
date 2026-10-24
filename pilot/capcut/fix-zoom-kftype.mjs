#!/usr/bin/env node
// Задача 019, шаг 8 — точечная правка зума в проекте CapCut 9.5 (mac).
//
// Причина: capcut-cli 0.31.1 пишет ключевые кадры масштаба как property_type "UNIFORM_SCALE".
// Движок CapCut 9.5 (libvideoeditor.dylib, Lua-миграции new_version 74→77) знает только
// "KFTypeScale" (до 77.0.0) и «расщеплённые» "KFTypeScaleX"/"KFTypeScaleY" (с 77.0.0, при
// segment.uniform_scale.on = true). Строки "UNIFORM_SCALE" в движке нет — список сохраняется
// как неизвестный и не анимируется. Эталон: strings libvideoeditor.dylib (downgrade_keyframeType,
// downgrade_74_to_73_crop_scale), пример capcut-cli examples/keyframe-zoom.md (KFTypeScaleX),
// заметка lint uniform-scale-keyframe. См. docs/tasks/019-capcut-pilot.report.md, «Шаг 8».
//
// Что делает: в сегменте <segment> заменяет список UNIFORM_SCALE на два списка KFTypeScaleX и
// KFTypeScaleY с теми же значениями; последний кадр прижимает к концу сегмента
// (target_timerange.duration); segment.uniform_scale.on = true. Пишет атомарно (temp + fsync +
// rename) во ВСЕ копии таймлайна: <проект>/draft_info.json, <проект>/template-2.tmp,
// Timelines/<main_timeline_id>/draft_info.json и template-2.tmp. Копии обязаны быть байт-в-байт
// одинаковыми до записи (иначе отказ). CapCut должен быть закрыт (pgrep -x CapCut пуст).
//
// Запуск (гейт 2: корень проектов только из CAPCUT_PROJECTS_DIR):
//   CAPCUT_PROJECTS_DIR=… node pilot/capcut/fix-zoom-kftype.mjs <папка-проекта> <segment-id> --check
//   CAPCUT_PROJECTS_DIR=… node pilot/capcut/fix-zoom-kftype.mjs <папка-проекта> <segment-id> --apply
// --check: ничего не пишет; exit 1, если в сегменте есть UNIFORM_SCALE или нет KFTypeScaleX/Y
//          (позитивный контроль до правки — красный, после — зелёный).
// --apply: правка; затем повторяет проверку и печатает sha256 записанных файлов.

import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, fsyncSync, openSync, closeSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [projectName, segmentId, mode] = process.argv.slice(2);
if (!projectName || !segmentId || !['--check', '--apply'].includes(mode ?? '')) {
  console.error('использование: fix-zoom-kftype.mjs <папка-проекта> <segment-id> --check|--apply');
  process.exit(2);
}
const root = process.env.CAPCUT_PROJECTS_DIR;
if (!root) {
  console.error('CAPCUT_PROJECTS_DIR не задан (env.manifest.json → data_dirs); дефолта нет (гейт 2)');
  process.exit(2);
}
if (!existsSync(join(root, 'root_meta_info.json'))) {
  console.error(`в ${root} нет root_meta_info.json — это не корень проектов CapCut`);
  process.exit(2);
}
if (/[\\/]/.test(projectName)) {
  console.error('имя проекта — одна папка внутри CAPCUT_PROJECTS_DIR, без путей');
  process.exit(2);
}
const project = join(root, projectName);
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const hexId = () => randomUUID().replace(/-/g, '');

// Копии таймлайна: корень + вложенная (CapCut 9.x, Timelines/project.json → main_timeline_id).
const timelineFiles = [join(project, 'draft_info.json'), join(project, 'template-2.tmp')];
const projectJson = join(project, 'Timelines', 'project.json');
if (existsSync(projectJson)) {
  const main = JSON.parse(readFileSync(projectJson, 'utf8')).main_timeline_id;
  if (typeof main !== 'string' || !main) {
    console.error('Timelines/project.json без main_timeline_id');
    process.exit(2);
  }
  timelineFiles.push(join(project, 'Timelines', main, 'draft_info.json'), join(project, 'Timelines', main, 'template-2.tmp'));
}
for (const f of timelineFiles) {
  if (!existsSync(f)) {
    console.error(`нет файла ${f}`);
    process.exit(2);
  }
}
const raws = timelineFiles.map((f) => readFileSync(f));
const shas = raws.map(sha);
if (new Set(shas).size !== 1) {
  console.error('копии таймлайна различаются — отказ (сначала разобраться, какая авторитетна):');
  timelineFiles.forEach((f, i) => console.error(`  ${shas[i].slice(0, 16)}  ${f}`));
  process.exit(2);
}

const draft = JSON.parse(raws[0].toString('utf8'));
let segment = null;
let trackType = null;
for (const t of draft.tracks ?? []) {
  for (const s of t.segments ?? []) {
    if (s.id === segmentId) { segment = s; trackType = t.type; }
  }
}
if (!segment) {
  console.error(`сегмент ${segmentId} не найден`);
  process.exit(2);
}
if (trackType !== 'video') {
  console.error(`сегмент ${segmentId} на дорожке ${trackType}, а не video`);
  process.exit(2);
}

function describe(seg) {
  const lists = seg.common_keyframes ?? [];
  const uniform = lists.filter((l) => l.property_type === 'UNIFORM_SCALE');
  const sx = lists.find((l) => l.property_type === 'KFTypeScaleX');
  const sy = lists.find((l) => l.property_type === 'KFTypeScaleY');
  const problems = [];
  if (uniform.length) problems.push(`есть список UNIFORM_SCALE (${uniform.map((l) => l.keyframe_list.length).join('+')} кадров) — движок CapCut 9.5 его не знает`);
  if (!sx || !sx.keyframe_list?.length) problems.push('нет списка KFTypeScaleX');
  if (!sy || !sy.keyframe_list?.length) problems.push('нет списка KFTypeScaleY');
  if (sx && sy) {
    const same = JSON.stringify(sx.keyframe_list.map((k) => [k.time_offset, k.values])) === JSON.stringify(sy.keyframe_list.map((k) => [k.time_offset, k.values]));
    if (!same) problems.push('KFTypeScaleX и KFTypeScaleY расходятся по времени/значениям');
    const dur = seg.target_timerange?.duration ?? 0;
    for (const k of sx.keyframe_list) if (k.time_offset > dur) problems.push(`кадр KFTypeScaleX на ${k.time_offset} мкс позже конца сегмента (${dur} мкс)`);
  }
  if (seg.uniform_scale?.on !== true) problems.push('segment.uniform_scale.on != true');
  return { problems, lists: lists.map((l) => `${l.property_type}: ${l.keyframe_list.map((k) => `${k.time_offset}→${k.values.join(',')}`).join(' ')}`) };
}

const before = describe(segment);
console.log(`сегмент ${segmentId} (${trackType}), target ${JSON.stringify(segment.target_timerange)}`);
console.log('списки ключевых кадров:', before.lists.length ? before.lists : '(нет)');
if (mode === '--check') {
  if (before.problems.length) {
    console.log('ПРОБЛЕМЫ:');
    before.problems.forEach((p) => console.log('  - ' + p));
    process.exit(1);
  }
  console.log('OK: зум закодирован как KFTypeScaleX/KFTypeScaleY, UNIFORM_SCALE нет');
  process.exit(0);
}

// --apply
// pgrep: exit 0 = процесс есть (отказ), exit 1 = процесса нет (execFileSync бросает — это норма).
let capcutRunning = true;
try { execFileSync('pgrep', ['-x', 'CapCut'], { stdio: 'ignore' }); } catch { capcutRunning = false; }
if (capcutRunning) {
  console.error('отказ: CapCut запущен');
  process.exit(2);
}
// Не трогаем ничего, кроме этого сегмента, и только с одним UNIFORM_SCALE в нём.
const lists = segment.common_keyframes ?? [];
const uniform = lists.filter((l) => l.property_type === 'UNIFORM_SCALE');
if (uniform.length !== 1) {
  console.error(`ожидался ровно один список UNIFORM_SCALE, найдено ${uniform.length} — ничего не меняю`);
  process.exit(2);
}
if (lists.some((l) => l.property_type === 'KFTypeScaleX' || l.property_type === 'KFTypeScaleY')) {
  console.error('в сегменте уже есть KFTypeScaleX/Y — ничего не меняю');
  process.exit(2);
}
const duration = segment.target_timerange.duration;
const source = uniform[0].keyframe_list;
const makeList = (propertyType) => ({
  id: hexId(),
  keyframe_list: source.map((k) => ({
    ...k,
    id: hexId(),
    time_offset: Math.min(k.time_offset, duration), // последний кадр — ровно конец сегмента
    values: [...k.values],
    left_control: { ...(k.left_control ?? { x: 0.0, y: 0.0 }) },
    right_control: { ...(k.right_control ?? { x: 0.0, y: 0.0 }) },
  })),
  material_id: '',
  property_type: propertyType,
});
segment.common_keyframes = [
  ...lists.filter((l) => l.property_type !== 'UNIFORM_SCALE'),
  makeList('KFTypeScaleX'),
  makeList('KFTypeScaleY'),
];
segment.uniform_scale = { ...(segment.uniform_scale ?? {}), on: true, value: segment.uniform_scale?.value ?? 1.0 };

const after = describe(segment);
if (after.problems.length) {
  console.error('после правки остались проблемы — не пишу:', after.problems);
  process.exit(2);
}
const out = JSON.stringify(draft); // CapCut сам пишет компактный JSON без пробелов

// Атомарная запись во все копии: temp + fsync + rename; при сбое — откат уже переименованных.
const temps = timelineFiles.map((f) => f + '.step8.tmp');
const committed = [];
try {
  temps.forEach((tmp) => {
    const fd = openSync(tmp, 'w', 0o600);
    writeFileSync(fd, out);
    fsyncSync(fd);
    closeSync(fd);
  });
  timelineFiles.forEach((f, i) => { renameSync(temps[i], f); committed.push(i); });
} catch (e) {
  for (const i of committed) writeFileSync(timelineFiles[i], raws[i]);
  for (const tmp of temps) if (existsSync(tmp)) unlinkSync(tmp);
  console.error('ошибка записи, откат:', e.message);
  process.exit(2);
}
console.log('записано:');
timelineFiles.forEach((f) => console.log(`  ${sha(readFileSync(f)).slice(0, 16)}  ${f}`));
console.log('новые списки:', after.lists);
