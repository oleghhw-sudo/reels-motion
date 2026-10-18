// Эталон задачи 011-А (не часть проекта, не запускается проектом). Воспроизвести: клоны в ./cinetic, ./pfs, ./bb на коммитах
// из docs/tasks/011-living-motion-kit.md, рядом node_modules (remotion), затем `npx -y tsx 011-ref.ts > ref.json`.

// Эталонные числа задачи 011-А: исходники cinetic @ecfa660 и product-film-skill @fe11efc как есть (FPS=60 у cinetic).
// Только чтение их функций; результат — JSON для констант в src/motion/kit.test.ts.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as A from './cinetic/skills/cinetic/assets/remotion-starter/src/lib/anim';
import * as SY from './cinetic/skills/cinetic/assets/remotion-starter/src/lib/sync';
import * as CO from './cinetic/skills/cinetic/assets/remotion-starter/src/lib/color';
import * as CA from './cinetic/skills/cinetic/assets/remotion-starter/src/lib/camera';
import * as SP from './pfs/plugins/product-film/skills/product-film/templates/kit/spring';
import * as MV from './pfs/plugins/product-film/skills/product-film/templates/kit/move';
import * as PC from './pfs/plugins/product-film/skills/product-film/templates/kit/camera';
// time.ts импортирует хуки remotion — сам файл грузится, at() — чистая функция
import * as TI from './pfs/plugins/product-film/skills/product-film/templates/kit/time';

const ctx: any = { window: {}, Math, isFinite, Infinity, parseInt };
vm.createContext(ctx);
vm.runInContext(readFileSync('./bb/skills/motion-broll/engine/motion.js', 'utf8').replace(/M\.scene = [\s\S]*?\n};\n/, ''), ctx);
const BB = ctx.window.M;

const T = [0, 0.02, 0.05, 0.1, 0.2, 0.35, 0.5, 0.8, 1.2, 2.5];
const P = [0, 0.05, 0.1, 0.2, 0.3, 0.45, 0.6, 0.75, 0.9, 1];
const cfgs = { snap: A.SPR.snap, calm: A.SPR.calm, heavy: A.SPR.heavy, firm: A.SPR.firm, under: { stiffness: 100, damping: 10, mass: 1 } };
const out: Record<string, unknown> = {};

out.step = Object.fromEntries(Object.entries(cfgs).map(([k, c]) => [k, T.map((t) => SP.step(t, c as SP.SpringConfig))]));
const keys = [[0.2, 10], [0.6, 40], [1.0, -5], [1.4, 25]] as const;
const tkeys: SP.Key[] = [[0, 0], ...keys];
out.track = T.map((t) => SP.track(t + 0.3, tkeys, A.SPR.firm as SP.SpringConfig));
out.critical = SP.critical(12);
out.E = Object.fromEntries(Object.entries(A.E).map(([k, e]) => [k, P.map((p) => e(p))]));
out.hitPulse = [0, 1, 1.5, 2, 3, 5, 10, 20, 32, 33].map((f) => A.hitPulse(f));
out.hitPulse_1_4 = [0, 0.5, 1, 2, 4, 8, 16, 24, 25].map((f) => A.hitPulse(f, 1, 4));
out.squash = [0, 0.5, 1, 2, 4, 8, 16, 25].map((f) => A.squash(f));
out.durFor = [[0, false], [40, false], [150, false], [600, false], [1200, true], [100, true], [3000, true]].map(([px, cam]) => [A.durFor(px as number, cam as boolean, A.PACE.calm), A.durFor(px as number, cam as boolean, A.PACE.crisp)]);
out.arrive = P.map((p) => [A.arrive(p), A.arrive(p, 0.8), A.depart(p), A.depart(p, 0.2)]);
out.arriveK = [[40, 36], [140, 36], [20, 36], [400, 60], [5, 20]].map(([px, d]) => A.arriveK(px, d, A.E.out));
out.stagger = [0, 1, 2, 3, 4].map((i) => [A.stagger(i, 5, 24), A.stagger(i, 5, 24, A.E.out), A.stagger(i, 1, 24)]);
out.inertia = [-10, 0, 1, 5, 10, 30, 60, 120].map((f) => A.inertia(f, 0, 20, 0.89));
out.blur = P.map((p) => [A.blurIn(p, 10), A.blurOut(p, 10)]);
out.rand = [0, 1, 42, 'word', 'ґєіїʼ', 123456789].map((s) => A.rand(s));
out.peak = [[0, 36, 'out'], [10, 70, 'inOut'], [0, 24, 'smooth'], [5, 50, 'cam'], [0, 60, 'exit']].map(([a, b, e]) => SY.peak(a as number, b as number, A.E[e as keyof typeof A.E]));
out.delayTo = [['snap', 1], ['snap', 0.5], ['calm', 1], ['calm', 0.9], ['firm', 1], ['micro', 1], ['pop', 0.5]].map(([k, thr]) => SY.delayTo(A.SPR[k as keyof typeof A.SPR], thr as number));
out.settleOf = [[0, 36, 'out'], [12, 60, 'outSoft'], [0, 40, 'smooth'], [3, 33, 'glide']].map(([a, b, e]) => SY.settleOf(a as number, b as number, A.E[e as keyof typeof A.E]));
out.mixColor = [['#000000', '#ffffff', 0.5], ['#d9a05b', '#3b7bff', 0.25], ['#ff0000', '#00ff00', 0.5], ['#17161a', '#efeae0', 0.9], ['#d62828', '#f7c600', 0]].map(([a, b, t]) => CO.mixColor(a as string, b as string, t as number));
const s1: CA.Shot = { ax: 100, ay: 200, sx: 540, sy: 960, k: 1, roll: 0 };
const s2: CA.Shot = { ax: 400, ay: -50, sx: 300, sy: 700, k: 3, roll: -4 };
out.lc = [0, 0.25, 0.5, 1].map((t) => CA.lc(s1, s2, t));
out.breath = [0, 0.5, 1].map((t) => [CA.breath(t), CA.breath(t, 0.05)]);
out.dip = [0, 0.25, 0.5, 0.75, 1].map((t) => CA.dip(t));
out.toScreen = CA.toScreen(s2, { x: 10, y: 20 });
const ck: PC.CameraKey[] = [[0, 0, 0, 1], [0.5, 200, -100, 2.5], [1.5, -50, 80, 1.2]];
out.pcamera = T.map((t) => PC.camera(t, ck));
out.project = PC.project({ x: 100, y: -40, zoom: 2 }, 30, 70);
out.worldTransform = PC.worldTransform({ x: 100, y: -40, zoom: 2 });
const r1: MV.Rect = { x: 0, y: 0, w: 100, h: 100 };
const r2: MV.Rect = { x: 300, y: 50, w: 600, h: 40 };
out.move = T.map((t) => MV.move(t, 0.1, r1, r2));
out.swapIn = [0, 0.18, 0.27, 0.36, 0.5, 0.95, 1.0, 1.05].map((t) => MV.swapIn(t, 0, 1));
out.center = MV.center(r2);
const g = { bpm: 130.81, firstBeat: 0.043, pickupBeats: 2, beatsPerBar: 4 };
out.at = [[1, 1, 0], [1, 2, 0], [2, 1, 0.5], [4, 3, 0.25], [0, 3, 0]].map(([b, bt, f]) => TI.at(g, b, bt, f));
out.bbVis = [0, 0.05, 0.1, 0.2, 0.33, 0.5, 1.0, 1.05, 1.1, 1.2].map((t) => BB.vis(t, 0, 1));
out.bbVisOpts = [0.1, 0.3, 1.02].map((t) => BB.vis(t, 0.05, 1, { din: 0.02, lin: 0.4, lout: 0.05, blur: 8 }));
out.bbS = [0.05, 0.2, 0.5].map((t) => [BB.S(t, 15, 0.84), BB.S(t, 7.5, 1), BB.S(t, 10, 1.3)]);
out.ctrackRef = T.map((t) => [CO.mixColor('#d9a05b', '#3b7bff', SP.step(t - 0.1, A.SPR.calm as SP.SpringConfig)), CO.mixColor('#17161a', '#2edba8', SP.step(t - 0.1, A.SPR.heavy as SP.SpringConfig))]);
console.log(JSON.stringify(out));
