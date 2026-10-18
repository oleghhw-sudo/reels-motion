// Ported from Leonxlnx/cinetic @ecfa6605 · MIT (c) 2026 Leonxlnx — skills/cinetic/assets/remotion-starter/src/lib/{anim,pace}.ts
// SPR.glide, SPR.camera — Rieranthony/product-film-skill @fe11efc4 · MIT (c) 2026 Rieranthony (kit/move.ts, kit/camera.ts).
// Именованные токены движения: сцены берут кривые и пружины ТОЛЬКО отсюда (E.*, SPR.*), сырых bezier/чисел пружин в сценах нет.
// Числа — стартовые гипотезы источника, калибруются на эталоне (CLAUDE.md, .claude/skills/living-motion).
// Изменения при переносе:
//   - всё время — секунды (t = frame / fps). Кадры cinetic даны при 60 fps → секунды через f60(n) = n / 60;
//   - durFor/peak/… возвращают секунды без округления (округление до кадра — у вызывающего: Math.round(s * fps));
//   - arriveK и squash/hitPulse принимают секунды; arriveK — ещё и fps (порог «1 px за кадр» зависит от частоты);
//   - inertia: v0 в px/с, decay — за кадр 60 fps (как в источнике), settle — секунды;
//   - SPR в формате SpringConfig ({stiffness, damping, mass}) для step/track из ./spring.ts;
//   - нет зависимостей от timeline.ts (FPS, PACE_NAME): темп передаётся параметром.
// Тексты лицензий — THIRD-PARTY-LICENSES.md.
import { Easing } from 'remotion';
import { clamp } from './index.ts';
import type { SpringConfig } from './spring.ts';

export type Ease = (t: number) => number;

/** Кадры 60 fps → секунды (числа cinetic записаны в кадрах при 60 fps). */
export const f60 = (n: number): number => n / 60;

/**
 * Настоящий экспоненциальный ease-out, нормированный на точное попадание в 1: 1 − e^(−k t).
 * k = 6: половина пути на 12 % времени, 90 % — на 38 %.
 */
const expOut = (k: number): Ease => {
  const n = 1 - Math.exp(-k);
  return (t) => (t <= 0 ? 0 : t >= 1 ? 1 : (1 - Math.exp(-k * t)) / n);
};

/** Кривые по ощущению. Входы тормозят, выходы разгоняются; в обе стороны — только камера. */
export const E = {
  out: Easing.bezier(0.16, 1, 0.3, 1), // expo-out: появления (никогда для фейд-аута)
  outSoft: Easing.bezier(0.22, 1, 0.36, 1), // quint-out: мягкая посадка
  in: Easing.bezier(0.7, 0, 0.84, 0), // expo-in: имплозии, резкий уход
  exit: Easing.bezier(0.55, 0.055, 0.675, 0.19), // cubic-in: разгон в склейку
  inOut: Easing.bezier(0.87, 0, 0.13, 1), // expo-in-out: хлёст, сдвиг локапа
  smooth: Easing.bezier(0.65, 0, 0.35, 1), // cubic-in-out: дрейф, фейды 0.17–0.23 с
  ui: Easing.bezier(0.4, 0, 0.2, 1), // мелкие изменения UI
  cam: Easing.bezier(0.48, 0.1, 0, 0.9), // камера: медленный старт, пик ≈27 %, долгая посадка
  glide: Easing.bezier(0.47, 0.2, 0.15, 1), // перемещения 150–350 px с мягкой посадкой
  rest: Easing.bezier(0.45, 0, 0.1, 1), // старт с нулевой скоростью, конец в покое: цепочка после другого движения
  contact: Easing.bezier(0.55, 0, 0.9, 0.55), // разгон В удар (заканчивается со скоростью)
  whip: Easing.bezier(0.6, 0, 0.15, 1), // хлёст от детали к детали
  dolly: Easing.bezier(0.35, 0, 0.65, 1), // медленный наезд в паузе
  type: Easing.bezier(0.5, 1, 0.89, 1), // quad-out: печать, вдвое быстрее в начале
  expo: expOut(6), // экспоненциальное скольжение удерживаемой строки (только по горизонтали)
  linear: (t: number) => t, // только дрейф и часы
} satisfies Record<string, Ease>;

/**
 * Пружины. По умолчанию — критическое демпфирование; перелёт — только для ударов, на тексте — никогда
 * (snap, pop, land, word, detent, micro на текст не ставить). Перелёт ограничивать, где он может задеть соседа.
 */
export const SPR = {
  snap: { damping: 18, stiffness: 260, mass: 0.7 }, // защёлкивание, малый перелёт (≈6 %)
  pop: { damping: 11, stiffness: 180, mass: 0.6 }, // 14 % перелёта: только настоящее приземление (≤ 2 за ролик)
  land: { damping: 14.5, stiffness: 200, mass: 1 }, // ≈15 %: только приземление (≤ 2 за ролик)
  micro: { damping: 30, stiffness: 500, mass: 0.6 }, // чипы, бейджи
  firm: { damping: 24, stiffness: 140, mass: 1 }, // появления UI, без перелёта
  soft: { damping: 26, stiffness: 120, mass: 1 }, // весомо, без перелёта
  heavy: { damping: 30, stiffness: 90, mass: 1.4 }, // крупные объекты
  calm: { damping: 16, stiffness: 64, mass: 1 }, // критическая, без перелёта: единственная для текста
  word: { damping: 20, stiffness: 170, mass: 0.9 }, // слова, входящие в паз (ограничивать у паза); только crisp
  detent: { damping: 24, stiffness: 380, mass: 0.6 }, // барабан/пикер щёлкает на место
  slam: { stiffness: 1156, damping: 34, mass: 1 }, // ω 34, ζ 0.5 (≈16 % перелёта): имя-слэм 1.9→1 карточки аутро MIA (прототип 008, решение Олега «Динамика v2»); не для обычного текста
  stamp: { stiffness: 900, damping: 27, mass: 1 }, // ω 30, ζ 0.45: номер-штамп 2.2→1 (прототип 008)
  glide: { stiffness: 150, damping: 20, mass: 1 }, // magic move (product-film move.ts)
  camera: { damping: 30, mass: 1.2, stiffness: 120 }, // камера: тяжёлая, без перелёта (product-film camera.ts)
} satisfies Record<string, SpringConfig>;

export type PaceName = 'calm' | 'crisp';
/** Темп ролика. Все длительности — секунды (в cinetic — кадры 60 fps); rise/exitLift — em, blur — px, лимиты — штуки. */
export type Pace = {
  wordDur: number;
  stagger: number;
  rise: number;
  blur: number;
  ease: 'outSoft' | 'out';
  exit: 'together' | 'words';
  exitDur: number;
  exitLift: number;
  holdBase: number;
  holdPerWord: number;
  holdMin: number;
  readMax: number;
  gapMin: number;
  gapMax: number;
  maxNewWords: number;
  maxVisibleBuild: number;
  maxVisibleReplace: number;
  maxWordsPerSec: number;
  avgWordsPerSec: number;
  maxWords: number;
  textShare: number;
  freeRun: number;
  maxGap: number;
  accentDur: number;
  recentreDur: number;
  recentreLead: number;
  move: { base: number; perPx: number; camMin: number; camMax: number };
  fx: {
    mask: { stagger: number; dur: number; exitDur: number };
    typePerChar: number;
    scramble: { stagger: number; rate: number; fadeIn: number };
    roll: { dur: number; roll: number };
    morph: number;
    iris: number;
  };
};

/** Два профиля темпа (cinetic pace.ts), в секундах. Паузы чтения калибрует readcheck — он главнее (CLAUDE.md). */
export const PACE: Record<PaceName, Pace> = {
  calm: {
    wordDur: f60(36), stagger: f60(11), rise: 0.2, blur: 0, ease: 'outSoft', exit: 'together', exitDur: f60(24), exitLift: 0.12,
    holdBase: f60(42), holdPerWord: f60(8), holdMin: f60(60), readMax: f60(150), gapMin: f60(30), gapMax: f60(90),
    maxNewWords: 4, maxVisibleBuild: 8, maxVisibleReplace: 5, maxWordsPerSec: 1.2, avgWordsPerSec: 0.9, maxWords: 30, textShare: 0.65,
    freeRun: f60(90), maxGap: f60(72), accentDur: f60(24), recentreDur: f60(96), recentreLead: f60(36),
    move: { base: 0.5, perPx: 0.0016, camMin: 0.9, camMax: 3.0 },
    fx: { mask: { stagger: f60(10), dur: f60(38), exitDur: f60(22) }, typePerChar: f60(3), scramble: { stagger: f60(5), rate: 1.0, fadeIn: f60(16) }, roll: { dur: f60(90), roll: f60(18) }, morph: f60(52), iris: f60(32) },
  },
  crisp: {
    wordDur: f60(26), stagger: f60(6), rise: 0.32, blur: 8, ease: 'out', exit: 'words', exitDur: f60(16), exitLift: 0.19,
    holdBase: f60(36), holdPerWord: f60(6), holdMin: f60(42), readMax: f60(120), gapMin: f60(18), gapMax: f60(90),
    maxNewWords: 5, maxVisibleBuild: 10, maxVisibleReplace: 10, maxWordsPerSec: 2.0, avgWordsPerSec: 1.2, maxWords: 35, textShare: 0.8,
    freeRun: f60(60), maxGap: f60(48), accentDur: f60(14), recentreDur: f60(60), recentreLead: f60(20),
    move: { base: 0.35, perPx: 0.00135, camMin: 0.6, camMax: 2.4 },
    fx: { mask: { stagger: f60(5), dur: f60(30), exitDur: f60(16) }, typePerChar: f60(2), scramble: { stagger: f60(3), rate: 1.5, fadeIn: f60(10) }, roll: { dur: f60(60), roll: f60(14) }, morph: f60(40), iris: f60(24) },
  },
};

/** Кривая, на которой поднимается слово этого темпа (calm: E.outSoft, crisp: E.out). */
export const easeOf = (p: Pace): Ease => E[p.ease];

/** Сколько держится фрагмент из words слов после появления, с: max(holdMin, holdBase + holdPerWord · words). */
export const holdFor = (words: number, p: Pace): number => Math.max(p.holdMin, p.holdBase + p.holdPerWord * words);
/** От старта первого слова до полного входа последнего, с: (words − 1) · stagger + wordDur. */
export const revealFor = (words: number, p: Pace): number => Math.max(0, words - 1) * p.stagger + p.wordDur;

/**
 * Длительность движения на px пикселей, с: calm 0.5 с + 1.6 мс/px (камера 0.9–3.0 с), crisp 0.35 с + 1.35 мс/px (0.6–2.4 с).
 * Без округления; кадры — Math.round(durFor(...) * fps).
 */
export const durFor = (px: number, camera = false, p: Pace = PACE.calm): number => {
  const s = p.move.base + p.move.perPx * Math.abs(px);
  return camera ? clamp(s, p.move.camMin, p.move.camMax) : s;
};

/**
 * Огибающая всех акцентов через t секунд после метки: четверть синуса за attack, затем экспонента с постоянной tau.
 * 0..1, умножать на амплитуду. По умолчанию attack = 2 кадра, tau = 5 кадров при 60 fps.
 */
export const hitPulse = (t: number, attack = f60(2), tau = f60(5)): number =>
  t <= 0 || t > attack + 6 * tau ? 0 : t < attack ? Math.sin((t / attack) * (Math.PI / 2)) : Math.exp(-(t - attack) / tau);

/** Блюр входа по прогрессу p (0..1), px при p = 0; уходит к 60 % движения — текст садится резким. */
export const blurIn = (p: number, px: number): number => px * clamp(1 - p / 0.6);
/** Блюр выхода по прогрессу q: начинается, только когда элемент уже движется (q > 0.3). */
export const blurOut = (q: number, px: number): number => px * clamp((q - 0.3) / 0.7);

/**
 * Вертикальные движения текста: headless Chromium округляет вертикаль слоя текста до целых пикселей, и хвост ease-out
 * идёт ступеньками. arrive обрывает движение на доле k кривой, пока оно ещё ≈0.5–1 px/кадр; depart — то же для старта выхода.
 */
export const arrive = (p: number, k = 0.94): number => clamp(p / k);
export const depart = (q: number, k = 0.06): number => clamp((q - k) / (1 - k));
/** k для arrive(): точка кривой, где шаг падает ниже 1 px/кадр для движения на px за dur секунд при fps. */
export const arriveK = (px: number, dur: number, fps: number, ease: Ease = E.out): number => {
  const n = Math.max(1, Math.round(dur * fps));
  for (let i = 1; i <= n; i++) if (Math.abs(px) * (ease(i / n) - ease((i - 1) / n)) < 1) return clamp(ease((i - 1) / n), 0.5, 1);
  return 1;
};

/** Сплющивание при посадке через t секунд после контакта: шире на 8 %, ниже на 10 %, возврат ≈8 кадров 60 fps. Якорь — у кромки. */
export const squash = (t: number): { along: number; across: number } => {
  const k = hitPulse(t, f60(1), f60(4));
  return { along: 1 - 0.1 * k, across: 1 + 0.08 * k };
};

/** Сдвиг старта i-го из n элементов, разложенных на span секунд (0 для первого, span для последнего); ease формирует промежутки. */
export const stagger = (i: number, n: number, span: number, ease: Ease = E.linear): number => (n > 1 ? span * ease(clamp(i / (n - 1))) : 0);

/**
 * Инерционная прокрутка замкнутой формой: с момента start скорость v0 (px/с) теряет (1 − decay) за каждый кадр 60 fps.
 * До start — постоянная v0 (кадр может открыться на пике скорости). x — px от положения в start, v — px/с,
 * total — полный путь, settle — секунды до остатка < 0.5 px.
 */
export const inertia = (t: number, start: number, v0: number, decay = 0.89): { x: number; v: number; total: number; settle: number } => {
  const tau = -1 / Math.log(clamp(decay, 1e-6, 0.999999)) / 60; // с
  const n = t - start;
  const total = v0 * tau;
  const settle = Math.abs(total) > 0.5 ? tau * Math.log(Math.abs(total) / 0.5) : 0;
  if (n <= 0) return { x: v0 * n, v: v0, total, settle };
  const k = Math.exp(-n / tau);
  return { x: total * (1 - k), v: v0 * k, total, settle };
};

/** Детерминированное псевдослучайное [0, 1) от числа или строки (FNV-1a + перемешивание): рендер обязан повторяться, недетерминированный генератор запрещён (гейт 1). */
export const rand = (seed: number | string): number => {
  const s = String(seed);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
