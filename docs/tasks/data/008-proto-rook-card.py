# Прототип «живой» карточки ROOK: взгляд → свип на пистолет → speed ramp → impact frame → карточка.
# Только для показа приёмов Олегу; в проект не идёт. Детерминирован: шум по номеру кадра.
import numpy as np, math, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops
W, H, FPS = 1920, 1080, 24
C = '/tmp/claude-0/cards/'
OUT = '/tmp/claude-0/proto/frames'; os.makedirs(OUT, exist_ok=True)
look = [Image.open(f'/tmp/claude-0/proto/look/{i:03d}.jpg').convert('RGB') for i in range(1, 12)]
gun = [Image.open(f'/tmp/claude-0/proto/gun/{i:03d}.jpg').convert('RGB') for i in range(1, 45)]
YEL, DOT, RED = (247, 198, 0), (220, 140, 0), (225, 20, 10)
FA = ImageFont.truetype(C + 'Anton-Regular.ttf.ttf', 270)
FO = ImageFont.truetype(C + 'Oswald.ttf', 66)
FN = ImageFont.truetype(C + 'Oswald.ttf', 50)
HIT = 55; CARD_END = HIT + 34; TOTAL = CARD_END + 4

def clamp(x, a=0, b=1): return max(a, min(b, x))
def ease_out(x): x = clamp(x); return 1 - (1 - x) ** 3
def ease_in(x): x = clamp(x); return x ** 3
def spring(t, w=26, z=0.45):  # шаг пружины 0→1 с перелётом (t в секундах)
    if t <= 0: return 0.0
    wd = w * math.sqrt(1 - z * z)
    return 1 - math.exp(-z * w * t) * (math.cos(wd * t) + z / math.sqrt(1 - z * z) * math.sin(wd * t))

def zoom(img, s, cx=0.5, cy=0.5, dx=0, dy=0):
    w, h = img.size; nw, nh = int(w * s), int(h * s)
    im = img.resize((nw, nh), Image.BILINEAR)
    x0 = int(nw * cx - w * cx - dx); y0 = int(nh * cy - h * cy - dy)
    canvas = Image.new('RGB', (w, h), (0, 0, 0)); canvas.paste(im, (-x0, -y0)); return canvas

def smear(img, k, dirx=1):  # направленный размыв по X (свип)
    a = np.asarray(img).astype(np.float32); k = max(1, int(k))
    cs = np.cumsum(np.pad(a, ((0, 0), (k, 0), (0, 0)), mode='edge'), axis=1)
    b = (cs[:, k:] - cs[:, :-k]) / k
    b = np.roll(b, int(dirx * k * 0.35), axis=1)
    return Image.fromarray(np.clip(b, 0, 255).astype(np.uint8))

def ca(img, d):  # хроматическая аберрация (#111)
    if d < 0.5: return img
    r, g, b = img.split(); d = int(d)
    r = ImageChops.offset(r, d, 0); b = ImageChops.offset(b, -d, 0)
    return Image.merge('RGB', (r, g, b))

def grain(img, f, amt=10):
    rng = np.random.default_rng(1000 + f)
    n = rng.normal(0, amt, (H // 2, W // 2, 1)).astype(np.float32)
    n = np.repeat(np.repeat(n, 2, 0), 2, 1)
    a = np.asarray(img).astype(np.float32) + n
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

def grade(img, sat=1.0, con=1.0, warm=0):
    a = np.asarray(img).astype(np.float32)
    g = a.mean(2, keepdims=True); a = g + (a - g) * sat; a = (a - 128) * con + 128
    a[..., 0] += warm; a[..., 2] -= warm
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

def vignette():
    y, x = np.mgrid[0:H, 0:W]; d = np.sqrt(((x - W / 2) / (W / 2)) ** 2 + ((y - H / 2) / (H / 2)) ** 2)
    return np.clip(1 - 0.35 * (d - 0.55), 0.55, 1)[..., None].astype(np.float32)
VIG = vignette()
def vig(img): return Image.fromarray(np.clip(np.asarray(img).astype(np.float32) * VIG, 0, 255).astype(np.uint8))

def shake(f0, f, amp=22, decay=0.72):
    k = f - f0
    if k < 0 or k > 12: return 0, 0
    rng = np.random.default_rng(77 + k); a = amp * decay ** k
    return float(rng.uniform(-a, a)), float(rng.uniform(-a, a))

# --- карточка: статичные слои
cut = Image.open(C + 'DARK_cut.png').convert('RGBA'); cut = cut.crop(cut.split()[-1].getbbox())
FIG_H = 1240; s = FIG_H / cut.height; cut = cut.resize((int(cut.width * s), FIG_H), Image.LANCZOS)
def solid(a):
    a = a.point(lambda v: 255 if v > 200 else 0).filter(ImageFilter.MinFilter(15)).filter(ImageFilter.MaxFilter(15))
    return a.filter(ImageFilter.GaussianBlur(8)).point(lambda v: 255 if v > 128 else 0)
pad = 60
figL = Image.new('RGBA', (cut.width + 2 * pad, cut.height + 2 * pad), (0, 0, 0, 0)); figL.paste(cut, (pad, pad), cut)
sa = solid(figL.split()[-1])
def ring(px, col):
    m = sa.filter(ImageFilter.MaxFilter(px * 2 + 1)).filter(ImageFilter.GaussianBlur(1.2))
    l = Image.new('RGBA', figL.size, col + (0,)); l.putalpha(m); return l
BLK, WHT = ring(22, (0, 0, 0)), ring(13, (255, 255, 255))
FIG_X, FIG_Y = W - figL.width + 40, H - figL.height + 120

def halftone_bg():
    im = Image.new('RGB', (W, H), YEL); d = ImageDraw.Draw(im); st = 22
    for y in range(-st, H + st, st):
        for x in range(-st, W + st, st):
            xx = x + (st / 2 if (y // st) % 2 else 0); r = 7 * (0.25 + 0.75 * (1 - xx / W))
            d.ellipse((xx - r, y - r, xx + r, y + r), fill=DOT)
    return im
BG = halftone_bg()
CX, CY = int(W * 0.72), int(H * 0.45)
def rays(im, ang):
    d = ImageDraw.Draw(im, 'RGBA'); n = 18
    for i in range(n):
        a0 = ang + 2 * math.pi * i / n; a1 = a0 + math.pi / n
        d.polygon([(CX, CY), (CX + 3000 * math.cos(a0), CY + 3000 * math.sin(a0)), (CX + 3000 * math.cos(a1), CY + 3000 * math.sin(a1))], fill=(0, 0, 0, 28))

def impact_frame(bgc=RED):  # аниме impact frame: цветной фон, линии скорости, фигура в жёсткий ч/б
    im = Image.new('RGB', (W, H), bgc); d = ImageDraw.Draw(im)
    for i in range(40):
        ang = i * 2 * math.pi / 40 + 0.05
        d.polygon([(CX, CY), (CX + 2600 * math.cos(ang - 0.012), CY + 2600 * math.sin(ang - 0.012)), (CX + 2600 * math.cos(ang + 0.012), CY + 2600 * math.sin(ang + 0.012))], fill=(0, 0, 0))
    g = cut.convert('L').filter(ImageFilter.GaussianBlur(1.5)); a = cut.split()[-1].point(lambda v: 255 if v > 128 else 0)
    post = g.point(lambda v: 255 if v > 95 else 0).convert('RGB')
    ring_ = sa.filter(ImageFilter.MaxFilter(25)).crop((pad, pad, pad + cut.width, pad + cut.height))
    im.paste((255, 255, 255), (FIG_X + pad, FIG_Y + pad), ring_)
    im.paste(post, (FIG_X + pad, FIG_Y + pad), a)
    return im
IMPACT = impact_frame(); IMPACT2 = impact_frame(YEL)

def text_slam(im, f):
    d = ImageDraw.Draw(im)
    name, tx, ty = 'ROOK', 110, 260
    k = f - (HIT + 3)
    if k >= 0:
        t = k / FPS; sc = 1 + 0.9 * (1 - spring(t, 34, 0.5))  # 1.9 → 1 с перелётом
        for gi, ga in ((2, 70), (1, 130), (0, 255)):  # шлейф (моушн-блюр)
            s2 = sc * (1 + 0.18 * gi * max(0, 1 - t * 6))
            if gi and t > 0.09: continue
            F = ImageFont.truetype(C + 'Anton-Regular.ttf.ttf', max(10, int(270 * s2)))
            bw = d.textlength(name, font=F); bx = tx + (d.textlength(name, font=FA) - bw) / 2; by = ty + (270 - 270 * s2) / 2
            layer = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ld = ImageDraw.Draw(layer)
            for o in range(14, 0, -2): ld.text((bx + o, by + o), name, font=F, fill=(0, 0, 0, ga))
            ld.text((bx, by), name, font=F, fill=(255, 255, 255, ga), stroke_width=8, stroke_fill=(0, 0, 0, ga))
            im.paste(layer, (0, 0), layer)
    # номер — штамп
    k2 = f - (HIT + 5)
    if k2 >= 0:
        sc = 1 + 1.2 * (1 - spring(k2 / FPS, 30, 0.45))
        F = ImageFont.truetype(C + 'Oswald.ttf', int(50 * sc)); d.text((tx, ty - 70 - 25 * (sc - 1)), '#2', font=F, fill=(0, 0, 0))
    # подпись — маска-раскрытие (#005) в плашке
    k3 = f - (HIT + 4)
    if k3 >= 0:
        p = ease_out(k3 / 7); tag = 'THE HUNTER'; tw = d.textlength(tag, font=FO); bx, by = tx, ty + 345
        wfull = tw + 36; wcur = int(wfull * p)
        d.rectangle((bx - 18, by - 8, bx - 18 + wcur, by + 88), fill=(0, 0, 0))
        layer = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ld = ImageDraw.Draw(layer); ld.text((bx - (1 - p) * 60, by), tag, font=FO, fill=YEL + (255,))
        m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).rectangle((bx - 18, by - 8, bx - 18 + wcur, by + 88), fill=255)
        im.paste(layer, (0, 0), ImageChops.multiply(layer.split()[-1], m))

def card(f):
    k = f - HIT; t = k / FPS
    im = BG.copy(); rays(im, 0.004 * k)
    # раскрытие фона кругом из центра фигуры: под ним стоп-кадр в ч/б
    r = 2400 * ease_out((k - 1) / 4)
    if r < 2300:
        under = grade(gun[-1], sat=0, con=1.4)
        m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).ellipse((CX - r, CY - r, CX + r, CY + r), fill=255)
        im = Image.composite(im, under, m)
    # фигура: поп с пружиной + медленный дрейф (параллакс)
    sc = 1 + 0.14 * (1 - spring(max(0, t - 0.04), 24, 0.5)) + 0.0012 * k
    drift = 0.6 * k
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for L, off in ((BLK, (18, 18)), (BLK, (0, 0)), (WHT, (0, 0)), (figL, (0, 0))):
        LL = L if L is not BLK or off == (0, 0) else Image.new('RGBA', L.size, (0, 0, 0, 0))
        if L is BLK and off != (0, 0):
            LL = Image.new('RGBA', L.size, (0, 0, 0, 255)); LL.putalpha(L.split()[-1])
        Ls = LL.resize((int(L.width * sc), int(L.height * sc)), Image.BILINEAR)
        x = int(FIG_X - (Ls.width - L.width) * 0.45 + off[0] + drift); y = int(FIG_Y - (Ls.height - L.height) * 0.6 + off[1])
        layer.paste(Ls, (x, y), Ls)
    im.paste(layer, (0, 0), layer)
    text_slam(im, f)
    # общий наезд камеры по карточке + удар-тряска
    sx, sy = shake(HIT + 1, f); sx2, sy2 = shake(HIT + 3, f, amp=12)
    im = zoom(im, 1.0 + 0.035 * ease_out(k / 34), 0.4, 0.5, sx + sx2, sy + sy2)
    im = ca(im, 14 * (0.7 ** max(0, k - 1)))
    return im

frames = []
for f in range(TOTAL):
    if f < 11:  # взгляд ROOK: лёгкий наезд, тёплый грейд
        im = zoom(look[f], 1.0 + 0.004 * f, 0.45, 0.4)
        im = grade(im, 1.05, 1.08, 4)
        if f >= 9: im = smear(im, 60 * (f - 8), 1)  # свип-выход
    elif f < HIT:  # пистолет: speed ramp в конце + разгоняющийся наезд
        k = f - 11
        if k < 34: src = k
        else: src = 34 + (k - 34) * 0.55  # замедление последних 10 кадров
        i0 = int(src); a = src - i0; i1 = min(i0 + 1, 43)
        im = Image.blend(gun[i0], gun[i1], a)
        z = 1.0 + 0.16 * ease_in((k) / 44)
        im = zoom(im, z, 0.62, 0.4)
        im = grade(im, 1.0 - 0.6 * ease_in(k / 44), 1.05 + 0.25 * ease_in(k / 44), 4)
        if k < 2: im = smear(im, 120 - 60 * k, 1)  # свип-вход
        im = ca(im, 10 * ease_in(k / 44))
        if k >= 42: im = Image.blend(im, Image.new('RGB', (W, H), (255, 255, 255)), 0.35 * (k - 41))
    elif f == HIT:
        im = Image.blend(gun[-1], Image.new('RGB', (W, H), (255, 255, 255)), 0.9)
    elif f in (HIT + 1, HIT + 2):
        im = IMPACT.copy() if f == HIT + 1 else IMPACT2.copy()
        sx, sy = shake(HIT, f, 30); im = zoom(im, 1.06, 0.7, 0.45, sx, sy)
    elif f < CARD_END:
        im = card(f)
    else:  # свип-выход в следующий план
        k = f - CARD_END + 1
        im = smear(card(CARD_END - 1), 90 * k, -1)
        im = Image.blend(im, Image.new('RGB', (W, H), (0, 0, 0)), 0.22 * k)
    im = grain(vig(im), f, 9)
    im.save(f'{OUT}/{f:03d}.png')
print('frames', TOTAL)
