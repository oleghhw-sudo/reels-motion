// Тест ядра «живой анимации» (задача 011-А): spring, color, tokens, sync, camera, move.
// Запуск: npm run test:motion (вместе с motion.test.ts); `-- --negative` — позитивный контроль, ОБЯЗАН упасть (гейт 4).
//
// REF — эталон, посчитанный ИСХОДНЫМ кодом на закреплённых коммитах (только для подсчёта, в проект не входит):
//   cinetic @ecfa6605 (lib/anim, sync, color, camera; FPS = 60 → кадры), product-film-skill @fe11efc4 (kit/spring, move,
//   camera, time), Barty-Bart @3d83d98 (motion.js в node:vm) — через `npx tsx ref.ts` (tsx 4.23.15), см. отчёт 011.
// Числа cinetic в кадрах 60 fps: наши функции зовутся с секундами (f / 60), результат сравнивается в кадрах.
import { step, track, critical, ctrack, vis, type Key } from './spring.ts';
import { mixColor } from './color.ts';
import { E, SPR, PACE, f60, hitPulse, squash, durFor, arrive, depart, arriveK, stagger, inertia, blurIn, blurOut, rand, holdFor, revealFor } from './tokens.ts';
import { peak, delayTo, hit, settleOf, at, b, gridFromBeats } from './sync.ts';
import { camera, project, worldTransform, lc, breath, dip, toScreen, type CameraKey, type Shot } from './camera.ts';
import { move, swapIn, center, type Rect } from './move.ts';

// prettier-ignore
const REF = {"step": {"snap": [0, 0.062284377633891275, 0.29424851347055747, 0.7174477119095477, 1.05538448082075, 1.006050654083979, 0.9978618100600427, 1.0000109015986023, 1.0000001882719218, 1.0000000000000122], "calm": [0, 0.011513204799194932, 0.061551935550104964, 0.1912078645890012, 0.47506905321389603, 0.7689217620241717, 0.9084218055563291, 0.9877044761785129, 0.9992820753931969, 0.9999999567157739], "heavy": [0, 0.011178192419229904, 0.05723934026118094, 0.16860643479974435, 0.39778911919882487, 0.6457559341194836, 0.7935341932157893, 0.9300256634207679, 0.9834689927956166, 0.9998480440374118], "firm": [0, 0.02390171786637707, 0.11860595048430678, 0.32891436575396804, 0.6783516652349004, 0.9129256156991961, 0.9786968904170872, 0.9988600662925055, 0.999978621670047, 0.9999999999513938], "under": [0, 0.018669244506526184, 0.10440547345507933, 0.34029984660829826, 0.8494256348541123, 1.1616499216592624, 1.0745905665950333, 0.979006626780466, 1.0025847862685933, 1.000002794114033]}, "track": [3.2891436575396793, 4.117551984058175, 5.251855101129501, 6.783516652349004, 8.632342027636703, 13.215271255116438, 30.269415313968167, 24.555525210821855, 5.81328697576566, 24.999915288078043], "critical": {"stiffness": 144, "damping": 24}, "E": {"out": [0, 0.28105581777497757, 0.4943906170638785, 0.7521260716767134, 0.8771741996332688, 0.9584218137135134, 0.9879649117309378, 0.9976770670744136, 0.9998783478324412, 1], "outSoft": [0, 0.21503348807468056, 0.40109689551880867, 0.6739780744775791, 0.8321920574974279, 0.9429164808732573, 0.9836753867316049, 0.9968942173251462, 0.9998395258792807, 1], "in": [0, 1.430833082153188e-05, 0.00012165216755895631, 0.0011087818208960448, 0.004321982364745213, 0.018718153692668524, 0.060244396895752325, 0.17437769884205576, 0.5056093829361212, 1], "exit": [0, 0.005369907865549467, 0.011625525821066419, 0.02790760269136963, 0.05188740543285995, 0.11372160103626881, 0.23315115910343537, 0.44668603141170504, 0.7583159490871649, 1], "inOut": [0, 0.0011697743504707578, 0.0049995301835291306, 0.023352506332134326, 0.06433554532693535, 0.25197018570541313, 0.8450637075106319, 0.9599411134797674, 0.9950004698164708, 1], "smooth": [0, 0.0020945983437099876, 0.008942503210206041, 0.04153548351035058, 0.11238634715817147, 0.36300022775716445, 0.7478840125017185, 0.9292032960787394, 0.9910574967897939, 1], "ui": [0, 0.005770212235124774, 0.025863014891412992, 0.1339467750761098, 0.367295708285991, 0.7042707363824094, 0.8759679094528102, 0.959367736739376, 0.9943539287368762, 1], "cam": [0, 0.014100524786041872, 0.03791200859458605, 0.14631696711704842, 0.48224765866260627, 0.7772521008823231, 0.8918264168806751, 0.9528566133714861, 0.9869327251885321, 1], "glide": [0, 0.025165983069364246, 0.05990782540624131, 0.17609097315585479, 0.4077691985055492, 0.7610409440225809, 0.9064210717924835, 0.970337699217837, 0.9959598898649479, 1], "rest": [0, 0.004614747818400875, 0.021082598864832616, 0.1193310862829259, 0.3966264623542714, 0.7543348616597476, 0.9001816763104723, 0.967657612227937, 0.9955293438187577, 1], "contact": [0, 0.001530875494795532, 0.006189979198526046, 0.025341022105171224, 0.058502785962679466, 0.1376515955707012, 0.258621528027402, 0.43467415424542005, 0.6993538438563575, 1], "whip": [0, 0.0025151889496745853, 0.011042845600241564, 0.05559906414015603, 0.17434741278445753, 0.6385673624433534, 0.8736775472255793, 0.9616791864245707, 0.9948986944923484, 1], "dolly": [0, 0.006673508143650033, 0.026130276394942455, 0.09944467566157819, 0.21066156591815188, 0.4233671646755408, 0.6515298319568044, 0.849021143458696, 0.9738697236050575, 1], "type": [0, 0.09741123374362526, 0.18968775916719668, 0.3590679113641339, 0.508536241786918, 0.6959857626125099, 0.8396098012874469, 0.938847491881003, 0.9916694233469977, 1], "expo": [0, 0.25982582314295194, 0.4523095271308762, 0.7005422587364879, 0.8367752703010528, 0.9351123991550837, 0.9750932921731345, 0.9913483102436086, 0.9979571074095985, 1], "linear": [0, 0.05, 0.1, 0.2, 0.3, 0.45, 0.6, 0.75, 0.9, 1]}, "hitPulse": [0, 0.7071067811865475, 0.9238795325112867, 1, 0.8187307530779818, 0.5488116360940265, 0.20189651799465538, 0.02732372244729256, 0.0024787521766663585, 0], "hitPulse_1_4": [0, 0.7071067811865475, 1, 0.7788007830714049, 0.4723665527410147, 0.1737739434504451, 0.02351774585600911, 0.003182780796509667, 0.0024787521766663585], "squash": [{"along": 1, "across": 1}, {"along": 0.9292893218813453, "across": 1.0565685424949238}, {"along": 0.9, "across": 1.08}, {"along": 0.9221199216928595, "across": 1.0623040626457123}, {"along": 0.9527633447258985, "across": 1.0377893242192813}, {"along": 0.9826226056549555, "across": 1.0139019154760356}, {"along": 0.9976482254143991, "across": 1.0018814196684807}, {"along": 0.9997521247823333, "across": 1.0001983001741332}], "durFor": [[30, 21], [34, 24], [44, 33], [88, 70], [145, 118], [54, 36], [180, 144]], "arrive": [[0, 0, 0, 0], [0.053191489361702135, 0.0625, 0, 0], [0.10638297872340427, 0.125, 0.042553191489361715, 0], [0.21276595744680854, 0.25, 0.14893617021276598, 0], [0.3191489361702128, 0.37499999999999994, 0.2553191489361702, 0.12499999999999997], [0.4787234042553192, 0.5625, 0.41489361702127664, 0.3125], [0.6382978723404256, 0.7499999999999999, 0.574468085106383, 0.49999999999999994], [0.797872340425532, 0.9375, 0.7340425531914894, 0.6875], [0.9574468085106383, 1, 0.8936170212765959, 0.8749999999999999], [1, 1, 1, 1]], "arriveK": [0.8818739008940717, 0.9649156133279283, 0.7421970445476672, 0.9812818463073316, 0.5], "stagger": [[0, 0, 0], [6, 19.814935227790663, 0], [12, 23.322698526325713, 0], [18, 23.944249609785928, 0], [24, 24, 0]], "inertia": [{"x": -200, "v": 20, "total": 171.6240027364467, "settle": 51}, {"x": 0, "v": 20, "total": 171.6240027364467, "settle": 51}, {"x": 18.878640301009135, "v": 17.8, "total": 171.6240027364467, "settle": 51}, {"x": 75.78813932088099, "v": 11.168118898000001, "total": 171.6240027364467, "settle": 51}, {"x": 118.10868687057038, "v": 6.236343985993238, "total": 171.6240027364467, "settle": 51}, {"x": 166.42071040615062, "v": 0.6063595123447254, "total": 171.6240027364467, "settle": 51}, {"x": 171.46624944644742, "v": 0.01838359291054666, "total": 171.6240027364467, "settle": 51}, {"x": 171.6238577328335, "v": 1.689782441503507e-05, "total": 171.6240027364467, "settle": 51}], "blur": [[10, 0], [9.166666666666666, 0], [8.333333333333332, 0], [6.666666666666666, 0], [5, 0], [2.5, 2.1428571428571432], [0, 4.2857142857142865], [0, 6.428571428571429], [0, 8.571428571428573], [0, 10]], "rand": [0.3942956554237753, 0.33251127949915826, 0.15985374082811177, 0.9212649611290544, 0.7944838530384004, 0.26828136551193893], "peak": [0, 40, 12, 17, 60], "delayTo": [10, 5, 75, 30, 51, 11, 5], "settleOf": [18, 38, 34, 26], "mixColor": ["rgb(99, 99, 99)", "rgb(181, 157, 144)", "rgb(208, 168, 0)", "rgb(214, 210, 202)", "rgb(214, 40, 40)"], "lc": [{"ax": 100, "ay": 200, "sx": 540, "sy": 960, "k": 1, "yaw": 0, "pitch": 0, "roll": 0}, {"ax": 175, "ay": 137.5, "sx": 480, "sy": 895, "k": 1.3160740129524924, "yaw": 0, "pitch": 0, "roll": -1}, {"ax": 250, "ay": 75, "sx": 420, "sy": 830, "k": 1.7320508075688772, "yaw": 0, "pitch": 0, "roll": -2}, {"ax": 400, "ay": -50, "sx": 300, "sy": 700, "k": 2.9999999999999996, "yaw": 0, "pitch": 0, "roll": -4}], "breath": [[1, 1], [1.0125, 1.025], [1.025, 1.05]], "dip": [1, 0.91, 0.8200000000000001, 0.91, 1], "toScreen": {"x": -870, "y": 910}, "pcamera": [{"x": 0, "y": 0, "zoom": 1}, {"x": 0, "y": 0, "zoom": 1}, {"x": 0, "y": 0, "zoom": 1}, {"x": 0, "y": 0, "zoom": 1}, {"x": 0, "y": 0, "zoom": 1}, {"x": 0, "y": 0, "zoom": 1}, {"x": 0, "y": 0, "zoom": 1}, {"x": 140.6638741055298, "y": -70.3319370527649, "zoom": 1.9049295395124468}, {"x": 191.947419855963, "y": -95.9737099279815, "zoom": 2.4094492853961063}, {"x": -47.766124486670975, "y": 78.38894616785706, "zoom": 1.2078718596579903}], "project": {"x": 820, "y": 760}, "worldTransform": "translate(960px, 540px) scale(2) translate(-100px, 40px)", "move": [{"x": 0, "y": 0, "w": 100, "h": 100}, {"x": 0, "y": 0, "w": 100, "h": 100}, {"x": 0, "y": 0, "w": 100, "h": 100}, {"x": 0, "y": 0, "w": 100, "h": 100}, {"x": 114.70244004541105, "y": 19.11707334090184, "w": 291.17073340901845, "h": 77.0595119909178}, {"x": 270.66687357515485, "y": 45.11114559585914, "w": 551.1114559585915, "h": 45.86662528496903}, {"x": 302.8335239833899, "y": 50.472253997231654, "w": 604.7225399723166, "h": 39.43329520332202}, {"x": 300.31170674888193, "y": 50.051951124813655, "w": 600.5195112481365, "h": 39.93765865022362}, {"x": 299.9925549508456, "y": 49.99875915847427, "w": 599.9875915847426, "h": 40.00148900983088}, {"x": 300.00000001869734, "y": 50.00000000311622, "w": 600.0000000311622, "h": 39.99999999626054}], "swapIn": [{"opacity": 0, "filter": "blur(10px)", "visible": false}, {"opacity": 0, "filter": "blur(10px)", "visible": false}, {"opacity": 0.5000000000000001, "filter": "blur(4.999999999999999px)", "visible": true}, {"opacity": 1, "visible": true}, {"opacity": 1, "visible": true}, {"opacity": 0.5000000000000007, "filter": "blur(4.999999999999993px)", "visible": true}, {"opacity": 2.220446049250313e-16, "filter": "blur(9.999999999999998px)", "visible": true}, {"opacity": 0, "filter": "blur(10px)", "visible": false}], "center": {"x": 600, "y": 70}, "at": [0.9603610580230869, 1.4190415870346302, 3.0244234385750324, 7.496558596437581, 0.043], "bbVis": [{"o": 0, "blur": 12, "s": 0.94, "a": 0, "b": 0}, {"o": 0, "blur": 12, "s": 0.94, "a": 0, "b": 0}, {"o": 0.3077492034592627, "blur": 8.307009558488847, "s": 0.9584649522075557, "a": 0.3077492034592627, "b": 0}, {"o": 0.875, "blur": 1.5, "s": 0.9924999999999999, "a": 0.875, "b": 0}, {"o": 1, "blur": 0, "s": 1, "a": 1, "b": 0}, {"o": 1, "blur": 0, "s": 1, "a": 1, "b": 0}, {"o": 1, "blur": 0, "s": 1, "a": 1, "b": 0}, {"o": 0.19849537037037002, "blur": 7.694444444444449, "s": 0.9759548611111111, "a": 1, "b": 0.80150462962963}, {"o": 0.004629629629629539, "blur": 9.555555555555557, "s": 0.9701388888888889, "a": 1, "b": 0.9953703703703705}, {"o": 0, "blur": 9.600000000000001, "s": 0.97, "a": 1, "b": 1}], "bbVisOpts": [{"o": 0.2085468749999999, "blur": 6.331625000000001, "s": 0.9525128125, "a": 0.2085468749999999, "b": 0}, {"o": 0.9232343749999999, "blur": 0.6141250000000005, "s": 0.9953940625, "a": 0.9232343749999999, "b": 0}, {"o": 0.21599999999999964, "blur": 5.0176000000000025, "s": 0.97648, "a": 1, "b": 0.7840000000000004}], "bbS": [[0.18455308335303156, 0.054977241662413356, 0.08310681165587885], [0.8802199869165046, 0.44217459962892547, 0.5023369118684737], [1.0033761894518463, 0.8882907071839568, 0.8772891961686167]], "ctrackRef": [["rgb(217, 160, 91)", "rgb(23, 22, 26)"], ["rgb(217, 160, 91)", "rgb(23, 22, 26)"], ["rgb(217, 160, 91)", "rgb(23, 22, 26)"], ["rgb(217, 160, 91)", "rgb(23, 22, 26)"], ["rgb(189, 158, 133)", "rgb(34, 50, 47)"], ["rgb(129, 147, 199)", "rgb(48, 112, 91)"], ["rgb(91, 135, 232)", "rgb(52, 155, 122)"], ["rgb(64, 125, 252)", "rgb(50, 197, 152)"], ["rgb(59, 123, 255)", "rgb(47, 214, 164)"], ["rgb(59, 123, 255)", "rgb(46, 219, 168)"]]};

let failed = 0;
const expect = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failed++;
};
const EPS = 1e-9;
const near = (a: number, b: number, eps = EPS) => Math.abs(a - b) <= eps;
const worst = (pairs: [number, number][]) => pairs.reduce((m, [a, b]) => Math.max(m, Math.abs(a - b)), 0);
const cmp = (name: string, pairs: [number, number][], eps = EPS) => {
  const w = worst(pairs);
  expect(`${name}: ${pairs.length} точек = эталон (±${eps})`, w <= eps, `макс. расхождение ${w.toExponential(2)}`);
};
const objPairs = (ours: Record<string, number | undefined>, ref: Record<string, number>) =>
  Object.keys(ref).map((k) => [ours[k] ?? NaN, ref[k]] as [number, number]);

const T = [0, 0.02, 0.05, 0.1, 0.2, 0.35, 0.5, 0.8, 1.2, 2.5];
const P = [0, 0.05, 0.1, 0.2, 0.3, 0.45, 0.6, 0.75, 0.9, 1];

// ---------------------------------------------------------------- spring (product-film)
const CFG = { snap: SPR.snap, calm: SPR.calm, heavy: SPR.heavy, firm: SPR.firm, under: { stiffness: 100, damping: 10, mass: 1 } };
for (const [k, c] of Object.entries(CFG)) cmp(`step ${k}`, T.map((t, i) => [step(t, c), REF.step[k as keyof typeof REF.step][i]]));
const TK: Key[] = [[0, 0], [0.2, 10], [0.6, 40], [1.0, -5], [1.4, 25]];
cmp('track (4 смены цели, SPR.firm)', T.map((t, i) => [track(t + 0.3, TK, SPR.firm), REF.track[i]]));
cmp('critical(12)', objPairs(critical(12) as unknown as Record<string, number>, REF.critical));
const MC = [['#000000', '#ffffff', 0.5], ['#d9a05b', '#3b7bff', 0.25], ['#ff0000', '#00ff00', 0.5], ['#17161a', '#efeae0', 0.9], ['#d62828', '#f7c600', 0]] as const;
const mc = MC.map(([a, c, t]) => mixColor(a, c, t));
expect('mixColor (OKLab) = эталон cinetic на 5 парах', mc.every((v, i) => v === REF.mixColor[i]), JSON.stringify(mc));

// свойства track / пружин
const one: Key[] = [[0, 3], [0.5, 11]];
expect('track: в момент события = v0', track(0.5, one, SPR.firm) === 3 && track(0.2, one, SPR.firm) === 3);
expect('track: t → ∞ → цель', near(track(30, one, SPR.firm), 11, 1e-9), String(track(30, one, SPR.firm)));
const overshoot = (c: { stiffness: number; damping: number; mass?: number }) => {
  let m = 0;
  for (let t = 0; t <= 5; t += 1 / 2000) m = Math.max(m, step(t, c));
  return m - 1;
};
for (const k of ['calm', 'firm', 'soft', 'heavy', 'camera'] as const) {
  const o = overshoot(SPR[k]);
  expect(`SPR.${k}: перелёт 0`, o <= 1e-12, `max step − 1 = ${o.toExponential(2)}`);
}
const os = overshoot(SPR.snap);
expect('SPR.snap: перелёт ≈ 6 % (±1 %)', Math.abs(os - 0.06) <= 0.01, `${(os * 100).toFixed(2)} %`);
expect('step: clamp обрезает перелёт', step(0.2, { ...SPR.snap, clamp: true }) === 1 && step(0.2, SPR.snap) > 1);

// ctrack (OKLab) — без перелёта равен смеси cinetic mixColor на шаге пружины
const ctr = T.map((t) => [ctrack(t, [[0, '#d9a05b'], [0.1, '#3b7bff']], SPR.calm), ctrack(t, [[0, '#17161a'], [0.1, '#2edba8']], SPR.heavy)]);
const ctrOk = ctr.every((row, i) => row[0] === REF.ctrackRef[i][0] && row[1] === REF.ctrackRef[i][1]);
expect('ctrack = mixColor(c0, c1, step) cinetic на 10 точках (calm, heavy)', ctrOk, ctrOk ? '' : JSON.stringify(ctr.slice(0, 3)));
expect('ctrack: до события — исходный цвет, после — цель', ctrack(0, [[0, '#17161a'], [0.5, '#efeae0']], SPR.firm) === 'rgb(23, 22, 26)' && ctrack(20, [[0, '#17161a'], [0.5, '#efeae0']], SPR.firm) === 'rgb(239, 234, 224)');

// vis (Barty-Bart) и S оригинала против step
const VT = [0, 0.05, 0.1, 0.2, 0.33, 0.5, 1.0, 1.05, 1.1, 1.2];
cmp('vis (умолчания источника)', VT.flatMap((t, i) => objPairs(vis(t, 0, 1) as unknown as Record<string, number>, REF.bbVis[i])));
cmp('vis (свои din/lin/lout/blur)', [0.1, 0.3, 1.02].flatMap((t, i) => objPairs(vis(t, 0.05, 1, { din: 0.02, lin: 0.4, lout: 0.05, blur: 8 }) as unknown as Record<string, number>, REF.bbVisOpts[i])));
const wz = (w: number, z: number) => ({ stiffness: w * w, damping: 2 * z * w, mass: 1 });
cmp('step = S(τ, w, z) Barty-Bart (недо-, критич., передемпф.)', [0.05, 0.2, 0.5].flatMap((t, i) => [
  [step(t, wz(15, 0.84)), REF.bbS[i][0]], [step(t, wz(7.5, 1)), REF.bbS[i][1]], [step(t, wz(10, 1.3)), REF.bbS[i][2]],
] as [number, number][]));

// ---------------------------------------------------------------- tokens (cinetic anim/pace)
for (const [k, e] of Object.entries(E)) cmp(`E.${k}`, P.map((p, i) => [e(p), REF.E[k as keyof typeof REF.E][i]]));
cmp('hitPulse (умолчания)', [0, 1, 1.5, 2, 3, 5, 10, 20, 32, 33].map((f, i) => [hitPulse(f60(f)), REF.hitPulse[i]]));
cmp('hitPulse(attack 1, tau 4 кадра)', [0, 0.5, 1, 2, 4, 8, 16, 24, 25].map((f, i) => [hitPulse(f60(f), f60(1), f60(4)), REF.hitPulse_1_4[i]]));
cmp('squash', [0, 0.5, 1, 2, 4, 8, 16, 25].flatMap((f, i) => objPairs(squash(f60(f)), REF.squash[i])));
const DF: [number, boolean][] = [[0, false], [40, false], [150, false], [600, false], [1200, true], [100, true], [3000, true]];
const dfOk = DF.every(([px, cam], i) => Math.round(durFor(px, cam, PACE.calm) * 60) === REF.durFor[i][0] && Math.round(durFor(px, cam, PACE.crisp) * 60) === REF.durFor[i][1]);
expect('durFor calm/crisp: кадры 60 fps = эталон на 7 точках', dfOk, JSON.stringify(DF.map(([px, cam]) => [Math.round(durFor(px, cam, PACE.calm) * 60), Math.round(durFor(px, cam, PACE.crisp) * 60)])));
cmp('arrive / depart', P.flatMap((p, i) => [[arrive(p), REF.arrive[i][0]], [arrive(p, 0.8), REF.arrive[i][1]], [depart(p), REF.arrive[i][2]], [depart(p, 0.2), REF.arrive[i][3]]] as [number, number][]));
cmp('arriveK', ([[40, 36], [140, 36], [20, 36], [400, 60], [5, 20]] as const).map(([px, d], i) => [arriveK(px, f60(d), 60, E.out), REF.arriveK[i]]));
cmp('stagger (кадры)', [0, 1, 2, 3, 4].flatMap((i) => [[stagger(i, 5, f60(24)) * 60, REF.stagger[i][0]], [stagger(i, 5, f60(24), E.out) * 60, REF.stagger[i][1]], [stagger(i, 1, f60(24)) * 60, REF.stagger[i][2]]] as [number, number][]), 1e-9);
const IN = [-10, 0, 1, 5, 10, 30, 60, 120].map((f) => inertia(f60(f), 0, 20 * 60, 0.89));
cmp('inertia x / v / total', IN.flatMap((r, i) => [[r.x, REF.inertia[i].x], [r.v / 60, REF.inertia[i].v], [r.total, REF.inertia[i].total]] as [number, number][]), 1e-9);
expect('inertia settle: ceil(с · 60) = кадры эталона', IN.every((r, i) => Math.ceil(r.settle * 60 - 1e-9) === REF.inertia[i].settle), `${Math.ceil(IN[0].settle * 60 - 1e-9)} / ${REF.inertia[0].settle}`);
cmp('blurIn / blurOut', P.flatMap((p, i) => [[blurIn(p, 10), REF.blur[i][0]], [blurOut(p, 10), REF.blur[i][1]]] as [number, number][]));
cmp('rand (FNV)', ([0, 1, 42, 'word', 'ґєіїʼ', 123456789] as const).map((s, i) => [rand(s), REF.rand[i]]), 0);
expect('holdFor/revealFor calm: 4 слова = 74 / 69 кадров', Math.round(holdFor(4, PACE.calm) * 60) === 74 && Math.round(revealFor(4, PACE.calm) * 60) === 69);

// ---------------------------------------------------------------- sync (cinetic sync, product-film time)
const PK = [[0, 36, 'out'], [10, 70, 'inOut'], [0, 24, 'smooth'], [5, 50, 'cam'], [0, 60, 'exit']] as const;
const pk = PK.map(([a, bb, e]) => Math.round(peak(f60(a), f60(bb), E[e]) * 60));
expect('peak: кадр пика = эталон на 5 кривых', pk.every((v, i) => v === REF.peak[i]), `${JSON.stringify(pk)} / ${JSON.stringify(REF.peak)}`);
const DT = [['snap', 1], ['snap', 0.5], ['calm', 1], ['calm', 0.9], ['firm', 1], ['micro', 1], ['pop', 0.5]] as const;
const dt = DT.map(([k, thr]) => Math.round(delayTo(SPR[k], thr, 60) * 60));
// spring() Remotion = замкнутая форма для ζ ≤ 1 (расхождение ~1e-16), а у передемпфированных (firm, ζ = 1.014) отходит
// от точного решения на ~2e-4 — это сдвигает касание порога 0.9995 на 2 кадра. Наш delayTo считает по той же step(),
// которую рисует track, поэтому для ζ > 1 сверяется с собственной кривой, а расхождение с Remotion выводится числом.
const zeta = (c: { stiffness: number; damping: number; mass?: number }) => c.damping / (2 * Math.sqrt(c.stiffness * (c.mass ?? 1)));
const under = DT.map((d, i) => i).filter((i) => zeta(SPR[DT[i][0]]) <= 1);
expect(`delayTo (ζ ≤ 1: ${under.map((i) => DT[i].join('@')).join(', ')}): кадр = эталон`, under.every((i) => dt[i] === REF.delayTo[i]), `наши ${JSON.stringify(dt)} / эталон ${JSON.stringify(REF.delayTo)}`);
const over = DT.map((d, i) => i).filter((i) => zeta(SPR[DT[i][0]]) > 1);
expect(`delayTo (ζ > 1: ${over.map((i) => DT[i].join('@')).join(', ')}): первый кадр, где step ≥ thr − 5e-4`, over.every((i) => { const f = dt[i]; const [k, thr] = DT[i]; return step(f / 60, SPR[k]) >= thr - 5e-4 && step((f - 1) / 60, SPR[k]) < thr - 5e-4; }), `наши ${over.map((i) => dt[i])} кадров, spring() Remotion ${over.map((i) => REF.delayTo[i])}`);
expect('hit = start + delayTo', near(hit(2, SPR.snap, 1, 60), 2 + delayTo(SPR.snap, 1, 60)));
const SO = [[0, 36, 'out'], [12, 60, 'outSoft'], [0, 40, 'smooth'], [3, 33, 'glide']] as const;
const so = SO.map(([a, bb, e]) => Math.round(settleOf(f60(a), f60(bb), E[e]) * 60));
expect('settleOf: кадр 0.97 пути = эталон на 4 кривых', so.every((v, i) => v === REF.settleOf[i]), `${JSON.stringify(so)} / ${JSON.stringify(REF.settleOf)}`);
const G = { bpm: 130.81, firstBeat: 0.043, pickupBeats: 2, beatsPerBar: 4 };
cmp('at (сетка тактов product-film)', ([[1, 1, 0], [1, 2, 0], [2, 1, 0.5], [4, 3, 0.25], [0, 3, 0]] as const).map(([bar, bt, f], i) => [at(G, bar, bt, f), REF.at[i]]));
const gb = gridFromBeats({ bpm: 130.81, firstDownbeat: 6.464, beatsPerBar: 4, beats: [], bars: [] });
expect('gridFromBeats (формат beat-sync): такт 1 доля 1 = firstDownbeat, такт 2 = +4 доли', near(b(gb)(1), 6.464) && near(b(gb)(2), 6.464 + 4 * 60 / 130.81));
let threw = '';
try { gridFromBeats({ bpm: '130', firstDownbeat: 1, beatsPerBar: 4 }); } catch (e) { threw = (e as Error).message; }
expect('gridFromBeats: нечисловое поле — громкая ошибка', /bpm/.test(threw), threw);

// ---------------------------------------------------------------- camera
const s1: Shot = { ax: 100, ay: 200, sx: 540, sy: 960, k: 1, roll: 0 };
const s2: Shot = { ax: 400, ay: -50, sx: 300, sy: 700, k: 3, roll: -4 };
cmp('lc (смесь кадров, k в лог-пространстве)', [0, 0.25, 0.5, 1].flatMap((t, i) => objPairs(lc(s1, s2, t) as unknown as Record<string, number>, REF.lc[i])));
cmp('breath / dip', [...[0, 0.5, 1].flatMap((t, i) => [[breath(t), REF.breath[i][0]], [breath(t, 0.05), REF.breath[i][1]]] as [number, number][]), ...[0, 0.25, 0.5, 0.75, 1].map((t, i) => [dip(t), REF.dip[i]] as [number, number])]);
cmp('toScreen', objPairs(toScreen(s2, { x: 10, y: 20 }), REF.toScreen));
const CK: CameraKey[] = [[0, 0, 0, 1], [0.5, 200, -100, 2.5], [1.5, -50, 80, 1.2]];
cmp('camera (ключи на пружине, зум в лог-пространстве)', T.flatMap((t, i) => objPairs(camera(t, CK), REF.pcamera[i])));
const F169 = { width: 1920, height: 1080 };
cmp('project (кадр 1920×1080 как в источнике)', objPairs(project({ x: 100, y: -40, zoom: 2 }, 30, 70, F169), REF.project));
expect('worldTransform = строка источника', worldTransform({ x: 100, y: -40, zoom: 2 }, F169) === REF.worldTransform, worldTransform({ x: 100, y: -40, zoom: 2 }, F169));
const v9 = project({ x: 0, y: 0, zoom: 1 }, 0, 0, { width: 1080, height: 1920 });
expect('project: центр мира в центре кадра 1080×1920', v9.x === 540 && v9.y === 960);

// ---------------------------------------------------------------- move
const r1: Rect = { x: 0, y: 0, w: 100, h: 100 };
const r2: Rect = { x: 300, y: 50, w: 600, h: 40 };
cmp('move (magic move, SPR.glide)', T.flatMap((t, i) => objPairs(move(t, 0.1, r1, r2), REF.move[i])));
const SW = [0, 0.18, 0.27, 0.36, 0.5, 0.95, 1.0, 1.05];
const swOk = SW.every((t, i) => { const o = swapIn(t, 0, 1); const r = REF.swapIn[i] as { opacity: number; filter?: string; visible: boolean }; return near(o.opacity, r.opacity) && o.filter === r.filter && o.visible === r.visible; });
expect('swapIn: opacity / filter / visible = эталон на 8 точках', swOk);
cmp('center', objPairs(center(r2), REF.center));

// ---------------------------------------------------------------- детерминизм
const runAll = () => JSON.stringify([T.map((t) => [track(t, TK, SPR.snap), ctrack(t, [[0, '#000'], [0.2, '#fff']], SPR.firm), camera(t, CK), move(t, 0, r1, r2), vis(t, 0, 1)]), rand('x')]);
expect('детерминизм: два прогона совпадают побитно', runAll() === runAll());

// ---------------------------------------------------------------- позитивный контроль
if (process.argv.includes('--negative')) {
  expect('ПОЗИТИВНЫЙ КОНТРОЛЬ: step(0.2, SPR.snap) = эталон calm (заведомо неверно)', near(step(0.2, SPR.snap), REF.step.calm[4]), `${step(0.2, SPR.snap)} vs ${REF.step.calm[4]}`);
}

if (failed) {
  console.error(`\nПРОВАЛ: ${failed}`);
  process.exit(1);
}
console.log('\nOK: kit (spring, color, tokens, sync, camera, move)');
