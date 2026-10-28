#!/usr/bin/env python
# tools/matte/rvm-matte.py — запасной движок маски: RobustVideoMatting (PeterL1n, GPL-3.0) как ВНЕШНИЙ инструмент.
# Сам RVM (код + веса) живёт вне репо в RVM_DIR (env.manifest.json → data_dirs); здесь только вызов через subprocess
# из tools/matte/matte.mjs. Выход тот же, что у vision-matte segment: <out>/raw.y8 (uint8, work W×H на кадр) + info.json.
# Кадры читаются через ffmpeg (автоповорот по метаданным, тот же crop 9:16, что у Vision), сеть — на устройстве mps,
# при ошибке — cpu с предупреждением. Лицо RVM не ищет: его даёт vision-matte segment --no-mask.
import argparse, json, os, subprocess, sys, time

p = argparse.ArgumentParser()
p.add_argument('--rvm-dir', required=True)
p.add_argument('--in', dest='inp', required=True)
p.add_argument('--out', required=True)
p.add_argument('--from', dest='frm', type=float, default=0)
p.add_argument('--to', type=float, default=None)
p.add_argument('--fps', type=float, required=True)
p.add_argument('--crop', required=True, help='x,y,w,h в координатах повёрнутого кадра')
p.add_argument('--work', default='360x640')
p.add_argument('--variant', default='resnet50', choices=['resnet50', 'mobilenetv3'])
p.add_argument('--downsample', type=float, default=0.25)
p.add_argument('--device', default='mps')
p.add_argument('--proc', default='1080x1920', help='размер кадра на входе сети')
a = p.parse_args()

import torch
sys.path.insert(0, a.rvm_dir)
from model import MattingNetwork  # noqa: E402  (код RVM, вне репо)

W, H = (int(v) for v in a.work.split('x'))
PW, PH = (int(v) for v in a.proc.split('x'))
cx, cy, cw, ch = (int(v) for v in a.crop.split(','))
weights = os.path.join(a.rvm_dir, f'rvm_{a.variant}.pth')
if not os.path.isfile(weights):
    sys.exit(f'rvm-matte: нет весов {weights}')

device = a.device
try:
    if device == 'mps' and not torch.backends.mps.is_available():
        raise RuntimeError('mps недоступен')
    model = MattingNetwork(a.variant).eval().to(device)
    model.load_state_dict(torch.load(weights, map_location=device))
except Exception as e:  # noqa: BLE001
    print(f'rvm-matte: ПРЕДУПРЕЖДЕНИЕ: устройство {device} не поднялось ({e}), перехожу на cpu', file=sys.stderr)
    device = 'cpu'
    model = MattingNetwork(a.variant).eval().to(device)
    model.load_state_dict(torch.load(weights, map_location=device))

cmd = ['ffmpeg', '-v', 'error', '-nostdin']
if a.frm: cmd += ['-ss', str(a.frm)]
if a.to is not None: cmd += ['-t', str(a.to - a.frm)]
cmd += ['-i', a.inp, '-vf', f'crop={cw}:{ch}:{cx}:{cy},scale={PW}:{PH}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
ff = subprocess.Popen(cmd, stdout=subprocess.PIPE)
os.makedirs(a.out, exist_ok=True)
raw = open(os.path.join(a.out, 'raw.y8'), 'wb')
rec = [None] * 4
n = 0
t0 = time.time()
frame_bytes = PW * PH * 3
with torch.no_grad():
    while True:
        buf = ff.stdout.read(frame_bytes)
        if len(buf) < frame_bytes: break
        src = torch.frombuffer(bytearray(buf), dtype=torch.uint8).view(1, PH, PW, 3).permute(0, 3, 1, 2).to(device).float() / 255
        fgr, pha, *rec = model(src, *rec, a.downsample)
        small = torch.nn.functional.interpolate(pha, size=(H, W), mode='area')
        raw.write((small[0, 0] * 255).round().clamp(0, 255).to(torch.uint8).cpu().numpy().tobytes())
        n += 1
        if n % 60 == 0: print(f'  кадр {n}…', file=sys.stderr)
raw.close()
ff.wait()
sec = time.time() - t0
commit = subprocess.run(['git', '-C', a.rvm_dir, 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip()
info = {'engine': 'rvm', 'rvmCommit': commit, 'variant': a.variant, 'weights': os.path.basename(weights), 'downsample': a.downsample,
        'device': device, 'torch': torch.__version__, 'proc': [PW, PH], 'work': {'w': W, 'h': H}, 'crop': {'x': cx, 'y': cy, 'w': cw, 'h': ch},
        'fps': a.fps, 'from': a.frm, 'to': a.to, 'frames': n, 'seconds': round(sec, 2)}
json.dump(info, open(os.path.join(a.out, 'info.json'), 'w'), indent=1)
print(f'rvm-matte: {n} кадров за {sec:.1f} с ({n / max(sec, 1e-6):.1f} к/с), {a.variant} ds={a.downsample} {device}', file=sys.stderr)
