// Музыкальная сетка ролика: где допустимы границы сцен. Чистые функции без импортов —
// их проверяет grid.test.ts (node --experimental-strip-types), их же зовёт script.ts при сборке.

export type MusicGrid = { beatSec: number; barSec: number; downbeatsSec: number[] };

/** Допустимые точки смены сцены: сильные доли и середины тактов (сильная доля + 2 доли). */
export function gridPoints(g: MusicGrid): number[] {
  const pts: number[] = [];
  for (const d of g.downbeatsSec) pts.push(d, d + g.barSec / 2);
  return pts.sort((a, b) => a - b);
}

export type OffGrid = { t: number; nearest: number; deltaSec: number };

/** Времена, не попадающие на сетку точнее tolSec (по умолчанию 2 мс — меньше 1/10 кадра). */
export function offGrid(times: number[], g: MusicGrid, tolSec = 0.002): OffGrid[] {
  const pts = gridPoints(g);
  const bad: OffGrid[] = [];
  for (const t of times) {
    let nearest = pts[0];
    for (const p of pts) if (Math.abs(p - t) < Math.abs(nearest - t)) nearest = p;
    const deltaSec = t - nearest;
    if (Math.abs(deltaSec) > tolSec) bad.push({ t, nearest, deltaSec });
  }
  return bad;
}

/** Сетка внутренне согласована: доли идут через barSec, barSec = 4 доли. */
export function gridProblems(g: MusicGrid): string[] {
  const out: string[] = [];
  if (Math.abs(g.barSec - 4 * g.beatSec) > 0.002) out.push(`barSec ${g.barSec} ≠ 4 × beatSec ${g.beatSec}`);
  for (let i = 1; i < g.downbeatsSec.length; i++) {
    const step = g.downbeatsSec[i] - g.downbeatsSec[i - 1];
    if (Math.abs(step - g.barSec) > 0.003) out.push(`между долями ${i - 1} и ${i}: ${step.toFixed(3)} с ≠ такт ${g.barSec}`);
  }
  return out;
}
