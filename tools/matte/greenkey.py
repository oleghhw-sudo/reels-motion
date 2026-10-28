#!/usr/bin/env python
# tools/matte/greenkey.py — правда из green screen (задача 025-Б): ключ по цвету в HSV + подавление зелёного ореола.
# Не движок маски, а способ получить правду, не зависящую от Vision/RVM. Нужен python с numpy
# (например RVM_DIR/.venv/bin/python). Выход в MATTE_DIR/<id>/ в формате matte.mjs: matte.mp4, person.mov, face.json
# (все кадры none — лицо здесь не ищем), matte.json (engine greenkey, цвет фона, параметры).
#   python tools/matte/greenkey.py --in <video> --out <MATTE_DIR/id> --crop x,y,w,h [--from S --to S]
#          [--hue-tol 28] [--sat-min 0.22] [--val-min 0.12] [--k-lo 0.35 --k-hi 0.75] [--despill 1]
# Сила ключа k = hue·sat·val (каждый множитель 0…1); alpha = 1 − smoothstep(k, k_lo, k_hi). Цвет фона — медиана
# четырёх угловых окон первого кадра (или --bg RRGGBB). Ореол: G := min(G, max(R, B)) там, где alpha > 0 (despill).
import argparse, hashlib, json, os, subprocess, sys, time
import numpy as np

p = argparse.ArgumentParser()
p.add_argument('--in', dest='inp', required=True); p.add_argument('--out', required=True)
p.add_argument('--crop', required=True); p.add_argument('--from', dest='frm', type=float, default=0); p.add_argument('--to', type=float, default=None)
p.add_argument('--bg', default=None); p.add_argument('--hue-tol', type=float, default=28); p.add_argument('--sat-min', type=float, default=0.22)
p.add_argument('--val-min', type=float, default=0.12); p.add_argument('--k-lo', type=float, default=0.35); p.add_argument('--k-hi', type=float, default=0.75)
p.add_argument('--despill', type=int, default=1); p.add_argument('--fps', type=int, default=30)
a = p.parse_args()
W, H = 1080, 1920
cx, cy, cw, ch = (int(v) for v in a.crop.split(','))
os.makedirs(a.out, exist_ok=True)
ff = ['ffmpeg', '-v', 'error', '-nostdin']
if a.frm: ff += ['-ss', str(a.frm)]
if a.to is not None: ff += ['-t', str(a.to - a.frm)]
ff += ['-i', a.inp, '-vf', f'crop={cw}:{ch}:{cx}:{cy},scale={W}:{H},fps={a.fps}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
src = subprocess.Popen(ff, stdout=subprocess.PIPE)
matte_path = os.path.join(a.out, 'matte.mp4'); person_path = os.path.join(a.out, 'person.mov')
enc_m = subprocess.Popen(['ffmpeg', '-v', 'error', '-nostdin', '-y', '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', f'{W}x{H}', '-r', str(a.fps), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '10', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', matte_path], stdin=subprocess.PIPE)
enc_p = subprocess.Popen(['ffmpeg', '-v', 'error', '-nostdin', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{W}x{H}', '-r', str(a.fps), '-i', '-', '-c:v', 'prores_videotoolbox', '-profile:v', '4444', '-pix_fmt', 'bgra', '-alpha_quality', '1', person_path], stdin=subprocess.PIPE)

def rgb2hsv(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = rgb.max(-1); mn = rgb.min(-1); d = mx - mn
    s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    h = np.zeros_like(mx)
    m = d > 1e-6
    rc = np.where(m, (mx - r) / np.maximum(d, 1e-6), 0); gc = np.where(m, (mx - g) / np.maximum(d, 1e-6), 0); bc = np.where(m, (mx - b) / np.maximum(d, 1e-6), 0)
    h = np.where(mx == r, bc - gc, np.where(mx == g, 2 + rc - bc, 4 + gc - rc))
    h = (h / 6.0) % 1.0
    return h * 360, s, mx

smooth = lambda x: (lambda t: t * t * (3 - 2 * t))(np.clip(x, 0, 1))
n = 0; bg = None; t0 = time.time(); area = []
while True:
    buf = src.stdout.read(W * H * 3)
    if len(buf) < W * H * 3: break
    rgb = np.frombuffer(buf, np.uint8).reshape(H, W, 3).astype(np.float32) / 255
    if bg is None:
        if a.bg: bg = np.array([int(a.bg[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255
        else:
            k = 120; pats = [rgb[:k, :k], rgb[:k, -k:], rgb[-k:, :k], rgb[-k:, -k:]]
            bg = np.median(np.concatenate([q.reshape(-1, 3) for q in pats]), axis=0)
        bh, bs, bv = rgb2hsv(bg[None, None, :]); bh = float(bh[0, 0]); bs = float(bs[0, 0]); bv = float(bv[0, 0])
    h, s, v = rgb2hsv(rgb)
    dh = np.abs(((h - bh + 180) % 360) - 180)
    k = np.clip(1 - dh / a.hue_tol, 0, 1) * np.clip((s - a.sat_min) / 0.15, 0, 1) * np.clip((v - a.val_min) / 0.08, 0, 1)
    alpha = 1 - smooth((k - a.k_lo) / (a.k_hi - a.k_lo))
    if a.despill:
        g = rgb[..., 1]; lim = np.maximum(rgb[..., 0], rgb[..., 2])
        rgb[..., 1] = np.where((alpha > 0) & (g > lim), lim, g)
    a8 = (alpha * 255 + 0.5).astype(np.uint8)
    enc_m.stdin.write(a8.tobytes())
    rgba = np.concatenate([(rgb * 255 + 0.5).astype(np.uint8), a8[..., None]], axis=-1)
    enc_p.stdin.write(rgba.tobytes())
    area.append(float((a8 > 127).mean())); n += 1
    if n % 60 == 0: print(f'  кадр {n}…', file=sys.stderr)
enc_m.stdin.close(); enc_p.stdin.close(); enc_m.wait(); enc_p.wait(); src.wait()
sec = time.time() - t0
sha = lambda f: hashlib.sha256(open(f, 'rb').read()).hexdigest()
dur = n / a.fps
params = {'hueTol': a.hue_tol, 'satMin': a.sat_min, 'valMin': a.val_min, 'kLo': a.k_lo, 'kHi': a.k_hi, 'despill': a.despill, 'bgRGB': [round(float(x) * 255) for x in bg], 'bgHSV': [round(bh, 1), round(bs, 3), round(bv, 3)]}
json.dump({'id': os.path.basename(a.out), 'engine': 'greenkey', 'engineVersion': {'script': 'tools/matte/greenkey.py 1.0.0'}, 'params': params,
           'source': {'file': os.path.abspath(a.inp), 'sha256': sha(a.inp), 'from': a.frm, 'to': a.to, 'fps': a.fps, 'crop': {'x': cx, 'y': cy, 'w': cw, 'h': ch}, 'framesRead': n},
           'durationSec': dur, 'renderSecPerSec': round(sec / max(dur, 1e-6), 2),
           'outputs': {'matte.mp4': {'sha256': sha(matte_path), 'frames': n}, 'person.mov': {'sha256': sha(person_path), 'frames': n, 'encoder': 'prores_videotoolbox'}},
           'areaMeanPct': round(100 * float(np.mean(area)), 2)}, open(os.path.join(a.out, 'matte.json'), 'w'), indent=2, ensure_ascii=False)
json.dump({'fps': a.fps, 'from': a.frm, 'frames': [{'t': round(i / a.fps, 4), 'cx': None, 'cy': None, 'w': None, 'source': 'none'} for i in range(n)], 'coords': 'лицо не искалось (правда green screen)'}, open(os.path.join(a.out, 'face.json'), 'w'))
print(f'greenkey: {n} кадров за {sec:.1f} с; фон RGB {params["bgRGB"]} HSV {params["bgHSV"]}; площадь маски в среднем {100 * float(np.mean(area)):.1f} %', file=sys.stderr)
