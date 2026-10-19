// Тесты src/fx (задача 012-А). Запуск: npm run test:motion (вместе с src/motion/*.test.ts);
// `-- --negative` — позитивный контроль (гейт 4): добавляет заведомо неверное ожидание и ОБЯЗАН упасть.
// Эталон — числа ROOK из финала ep01 (src/videos/mia-outro/{fx,MiaOutro}.tsx @2f3856c, отчёт 008 «Speed ramp»).
import { RAMP, decayAt, remapSpeed, sampleProfile, tauFromPerFrame, whipSmear } from './core.ts';
import { BLAST, HIT, LEAD, SLAM, STAMP, TAG, WHIP } from './presets.ts';
import { hitEnvelope, leadFlash, leadIn, shakeAt } from './hit.ts';
import { slam, stamp, tagReveal } from './text.ts';
import { E } from '../motion/tokens.ts';

let failed = 0;
const expect = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failed++;
};
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;
const FPS = 24;
const F = (k: number) => k / FPS;

// ---------------------------------------------------------------- core
const tau = tauFromPerFrame(0.72, 24);
expect('tauFromPerFrame: exp(−k/24/τ) = 0.72^k (k = 0…14)', Array.from({ length: 15 }, (_, k) => near(decayAt(F(k), tau), 0.72 ** k, 1e-12)).every(Boolean));
expect('decayAt: до события 0', decayAt(-0.01, tau) === 0);
expect('sampleProfile: концы и середина', sampleProfile([120, 60], 0) === 120 && sampleProfile([120, 60], 1) === 60 && sampleProfile([120, 60], 0.5) === 90 && sampleProfile([7], 0.3) === 7 && sampleProfile([], 0.3) === 0);
expect('sampleProfile: 3 отсчёта, p за пределами клампится', sampleProfile([90, 180, 270], 0.5) === 180 && sampleProfile([90, 180, 270], 2) === 270 && sampleProfile([90, 180, 270], -1) === 90);

// remapSpeed = livePos ep01 (отчёт 008: V3 33→22 шаги 2.25, затем 0.55; V10 44→44; V9 12→11)
const SLOW = Math.round(RAMP.slowDur * FPS);
expect('RAMP: 9 кадров @24, ×0.55', SLOW === 9 && RAMP.slow === 0.55);
const v3 = Array.from({ length: 22 }, (_, i) => remapSpeed(i, 22, 33, SLOW, RAMP.slow));
expect('remapSpeed V3 33→22: старт 0, конец 32 (последний кадр исходника)', v3[0] === 0 && near(v3[21], 32));
expect('remapSpeed V3: быстрые шаги 2.254, медленные 0.55', near(v3[1] - v3[0], (32 - 0.55 * 9) / 12) && near(v3[21] - v3[20], 0.55) && near(v3[13] - v3[12], 0.55));
expect('remapSpeed V3: монотонно', v3.every((p, i) => i === 0 || p > v3[i - 1]));
const v10 = Array.from({ length: 44 }, (_, i) => remapSpeed(i, 44, 44, SLOW, RAMP.slow));
expect('remapSpeed V10 44→44: 0 → 43, медленный хвост 0.55', v10[0] === 0 && near(v10[43], 43) && near(v10[43] - v10[42], 0.55));
const v9 = Array.from({ length: 11 }, (_, i) => remapSpeed(i, 11, 12, SLOW, RAMP.slow));
expect('remapSpeed V9 12→11 (быстрый участок < 3): весь план ×0.55 от конца', near(v9[10], 11) && near(v9[0], 11 - 0.55 * 10) && near(v9[5] - v9[4], 0.55));
const v60 = remapSpeed(59, 60, 48, Math.round(RAMP.slowDur * 60), RAMP.slow);
expect('remapSpeed @60 fps: slowFrames от fps вызывающего (23 кадра), конец на последнем кадре', Math.round(RAMP.slowDur * 60) === 23 && near(v60, 47));

// whipSmear (#043) при 24 fps = Cut ep01
const cutsIn = { inDir: 1, outDir: 0, outIsCard: false };
const cutsOut = { inDir: 0, outDir: -1, outIsCard: false };
const cutsCard = { inDir: 0, outDir: 1, outIsCard: true };
const dur22 = F(22);
expect('whipSmear вход: 120, 60, затем 0; направление +1', whipSmear(F(0), dur22, cutsIn, FPS, WHIP).px === 120 && whipSmear(F(1), dur22, cutsIn, FPS, WHIP).px === 60 && whipSmear(F(1), dur22, cutsIn, FPS, WHIP).dir === 1 && whipSmear(F(2), dur22, cutsIn, FPS, WHIP).px === 0);
expect('whipSmear выход: кадры n−2, n−1 → 60, 120; направление −1; без затемнения', whipSmear(F(20), dur22, cutsOut, FPS, WHIP).px === 60 && whipSmear(F(21), dur22, cutsOut, FPS, WHIP).px === 120 && whipSmear(F(21), dur22, cutsOut, FPS, WHIP).dir === -1 && whipSmear(F(21), dur22, cutsOut, FPS, WHIP).dark === 0 && whipSmear(F(19), dur22, cutsOut, FPS, WHIP).px === 0);
const oc = [19, 20, 21].map((k) => whipSmear(F(k), dur22, cutsCard, FPS, WHIP));
expect('whipSmear выход из карточки: 90/180/270 px, затемнение 0.22/0.44/0.66', oc.map((s) => s.px).join() === '90,180,270' && oc.every((s, i) => near(s.dark, 0.22 * (i + 1), 1e-12)));
expect('whipSmear без склеек: 0', whipSmear(F(0), dur22, { inDir: 0, outDir: 0, outIsCard: false }, FPS, WHIP).px === 0);
expect('whipSmear @60 fps: вход 5 кадров, 120 → 90 → 60', whipSmear(0, 1, cutsIn, 60, WHIP).px === 120 && whipSmear(2 / 60, 1, cutsIn, 60, WHIP).px === 90 && whipSmear(4 / 60, 1, cutsIn, 60, WHIP).px === 60 && whipSmear(5 / 60, 1, cutsIn, 60, WHIP).px === 0);

// ---------------------------------------------------------------- удар (hitEnvelope) — анатомия ROOK при 24 fps
const L = (k: number) => hitEnvelope(F(k), FPS, HIT.L, 'card3');
expect('L: до удара — before', L(-1).phase === 'before' && L(-1).flash === 0 && L(-1).shake[0] === 0);
expect('L k=0: вспышка 90 %, без тряски', L(0).phase === 'flash' && L(0).flash === 0.9 && L(0).shake[0] === 0 && L(0).ca === 0);
expect('L k=1: impact-кадр красный, тряска ≤ 30·0.72', L(1).phase === 'impact' && L(1).impactFirst && Math.hypot(...L(1).shake) <= 30 * 0.72 * Math.SQRT2 + 1e-9 && Math.hypot(...L(1).shake) > 0);
expect('L k=2: impact-кадр цвета героя', L(2).phase === 'impact' && !L(2).impactFirst);
expect('L k=3: отдача, хроматика 14·0.7² = 6.86', L(3).phase === 'recoil' && near(L(3).ca, 14 * 0.7 ** 2, 1e-9));
expect('L k=10: хроматика 14·0.7⁹', near(L(10).ca, 14 * 0.7 ** 9, 1e-9));
expect('L раскрытие: k=1 → 0, k=3 → E.out(0.5), k≥5 → 1', L(1).reveal === 0 && near(L(3).reveal, E.out(0.5)) && L(5).reveal === 1 && L(20).reveal === 1);
expect('L тряска отдачи: k=3 амплитуда ≤ 22·0.72² + 12 и > 0', Math.abs(L(3).shake[0]) <= 22 * 0.72 ** 2 + 12 + 1e-9 && Math.hypot(...L(3).shake) > 0);
expect('L тряска: после 12 кадров отдачи и 12 кадров посадки — 0 (k=16)', L(16).shake[0] === 0 && L(16).shake[1] === 0);
expect('детерминизм: тот же seed → те же числа; другой seed → другие', L(4).shake[0] === hitEnvelope(F(4), FPS, HIT.L, 'card3').shake[0] && L(4).shake[0] !== hitEnvelope(F(4), FPS, HIT.L, 'card4').shake[0]);
// shakeAt = shake(k, amp, decay, seed) ep01: ключ seed:k:x
const s1 = shakeAt(F(5), FPS, HIT.L.impactShake, 'card3:impact');
expect('shakeAt k=5: |x|,|y| ≤ 30·0.72⁵, не 0', Math.abs(s1[0]) <= 30 * 0.72 ** 5 + 1e-9 && Math.abs(s1[1]) <= 30 * 0.72 ** 5 + 1e-9 && Math.hypot(...s1) > 0);
expect('shakeAt: за пределом maxDur (k=13 при 12) — 0; до старта — 0', shakeAt(F(13), FPS, HIT.L.impactShake, 's')[0] === 0 && shakeAt(F(12), FPS, HIT.L.impactShake, 's')[0] !== 0 && shakeAt(-F(1), FPS, HIT.L.impactShake, 's')[0] === 0);

const M = (k: number) => hitEnvelope(F(k), FPS, HIT.M, 'm');
expect('M: вспышка 60 % в k=0, k=1 — сразу отдача (без impact-кадров), хроматика 6', M(0).flash === 0.6 && M(1).phase === 'recoil' && near(M(1).ca, 6) && M(1).reveal === 1);
expect('M: тряска 12 px, 8 кадров (k=9 → 0, k=8 ≠ 0)', Math.abs(M(1).shake[0]) <= 12 && M(9).shake[0] === 0 && M(8).shake[0] !== 0);
const S = (k: number) => hitEnvelope(F(k), FPS, HIT.S, 's');
expect('S: без вспышки и тряски, zoom-punch 1.07 в k=0, возврат к 1 к k=9', S(0).flash === 0 && S(0).shake[0] === 0 && near(S(0).zoom, 1.07) && S(4).zoom > 1 && S(4).zoom < 1.07 && near(S(9).zoom, 1) && near(S(20).zoom, 1));
const B = (k: number) => hitEnvelope(F(k), FPS, BLAST, 'final');
expect('BLAST (финал ep01): 3 белых кадра, с k=3 тряска ≤ 40, без хроматики', B(0).flash === 1 && B(2).flash === 1 && B(3).flash === 0 && B(3).phase === 'recoil' && Math.abs(B(3).shake[0]) <= 40 && Math.hypot(...B(3).shake) > 0 && B(3).ca === 0 && B(18).shake[0] === 0);
// fps-независимость: фазы по миллисекундам
const flash60 = Array.from({ length: 6 }, (_, k) => hitEnvelope(k / 60, 60, HIT.L, 'x').phase).filter((p) => p === 'flash').length;
const impact60 = Array.from({ length: 12 }, (_, k) => hitEnvelope(k / 60, 60, HIT.L, 'x').phase).filter((p) => p === 'impact').length;
expect('@60 fps: вспышка 2 кадра (42 мс), impact 5 кадров (83 мс)', flash60 === 2 && impact60 === 5, `${flash60} / ${impact60}`);

// ---------------------------------------------------------------- подвод
const l0 = leadIn(0);
const l1 = leadIn(1);
expect('leadIn p=0: без обработки', l0.zoom === 1 && l0.saturate === 1 && l0.contrast === 1.05 && l0.ca === 0);
expect('leadIn p=1: наезд 1.16, насыщенность 0.4, контраст 1.3, хроматика 10', near(l1.zoom, 1.16) && near(l1.saturate, 0.4) && near(l1.contrast, 1.3) && near(l1.ca, 10));
expect('leadIn: по кривой LEAD.ease (E.in), p=0.5 между', leadIn(0.5).ca === 10 * LEAD.ease(0.5) && leadIn(0.5).ca > 0 && leadIn(0.5).ca < 10);
expect('leadFlash: за 2 кадра 0.35, за 1 — 0.7, за 3 и в 0 — 0', leadFlash(F(2), FPS) === 0.35 && leadFlash(F(1), FPS) === 0.7 && leadFlash(F(3), FPS) === 0 && leadFlash(0, FPS) === 0);
expect('leadFlash @60 fps: 5 кадров от 0.35 к 0.7', leadFlash(5 / 60, 60) === 0.35 && leadFlash(1 / 60, 60) === 0.7 && leadFlash(6 / 60, 60) === 0);

// ---------------------------------------------------------------- display-текст
expect('slam: до входа null', slam(-F(1)) === null);
const s0 = slam(0)!;
expect('slam t=0: масштаб 1.9, полёт полупрозрачен (0.45), шлейф 2 копии: дальняя α 70/255 первой, ближняя 130/255', near(s0.scale, 1.9) && s0.opacity === 0.45 && s0.trail.length === 2 && near(s0.trail[0].alpha, 70 / 255) && near(s0.trail[1].alpha, 130 / 255) && s0.trail[0].scale > s0.trail[1].scale && s0.trail[1].scale > s0.scale);
expect('slam t=0.1: шлейфа нет; t=1 → 1 (±1e-3), непрозрачно', slam(0.1)!.trail.length === 0 && near(slam(1)!.scale, 1, 1e-3) && slam(1)!.opacity === 1);
let mn = 9;
for (let t = 0; t <= 1; t += 1 / 2400) mn = Math.min(mn, slam(t)!.scale);
expect('slam: перелёт SPR.slam ≈ 16 % пути (мин. масштаб 0.83–0.88)', mn > 0.83 && mn < 0.88, mn.toFixed(4));
expect('SLAM/STAMP/TAG — числа ROOK', SLAM.from === 1.9 && STAMP.from === 2.2 && near(TAG.dur, 7 / 24) && TAG.slide === 60);
expect('stamp: null до входа, 2.2 в t=0, → 1', stamp(-0.01) === null && near(stamp(0)!, 2.2) && near(stamp(1.5)!, 1, 1e-3));
const tg0 = tagReveal(0)!;
const tg7 = tagReveal(F(7))!;
expect('tagReveal: t=0 → p 0, сдвиг −60; t=7 к → p 1, сдвиг 0; дальше 1', tg0.p === 0 && tg0.slide === -60 && tg7.p === 1 && tg7.slide === 0 && tagReveal(1)!.p === 1 && tagReveal(-0.01) === null);
expect('tagReveal: середина по E.out', near(tagReveal(F(3.5))!.p, E.out(0.5)));

// ---------------------------------------------------------------- позитивный контроль
if (process.argv.includes('--negative')) {
  expect('НЕГАТИВ (должен упасть): remapSpeed V3 последний кадр = 31', near(v3[21], 31));
}

console.log(failed ? `\nПРОВАЛ: ${failed}` : '\nOK: fx');
process.exit(failed ? 1 : 0);
