#!/usr/bin/env python3
"""audio/analyze/analyze.py — анализатор трека (задача 021): сетка долей, огибающие, онсеты, кандидаты финального удара.

  AUDIO_MODELS_DIR=<кэш моделей> python analyze.py <in.wav|mp3> <out_dir> [--from S --to S] [--bpm-hint N]

Выход в <out_dir>:
  beats.json  {bpm, tempo: constant|variable, beatPeriod, firstDownbeat, beatsPerBar: 4, downbeatConfidence, beats[],
               bars[{index,start,loudnessDb}], sectionsCandidates[], gridDeviationMs, stemOffsetMs, source:{file,sha256,from,to}}
  audio.json  {fps: 100, duration, env:{rms,low,mid,high,vocal,drums,bass,other},
               onsets:{kick,snare,hat,vocal: [[t, strength]]}, finalHits:[{t,strength,bar,beat}]}
  clicks.wav  трек + клики на долях (сильная доля выше и громче) — прослушка человеком
  qa.png      спектрограмма барабанов, доли, сильные доли, онсеты
  work/       mix.wav (вход, декодированный ffmpeg один раз в WAV 44.1 кГц) и стемы Demucs — кэш, можно удалить

Все времена — секунды от начала отрезка (--from). Такт 1 открывается первой сильной долей; доли в такте — с 1.
Источник обработки сигнала — mexicat/pdoom-video @fa164b7 (MIT), см. pdoom_dsp.py и vendor/pdoom-analysis/VENDORED.md.
Что в оригинале задано руками, здесь измеряется: темп не ограничен 125–138 BPM, фаза такта — по малому барабану
и смене гармонии, секции — только кандидаты по скачку громкости такта, смещение стемов — кросс-корреляцией,
постоянство темпа — по отклонению онсетов от сетки.
Код выхода: 0 — готово; 3 — «сетка не найдена» (beats.json и audio.json не пишутся); 1 — ошибка среды/входа.
"""
import hashlib
import json
import math
import os
import re
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
SR = 44100
FPS = 100
BEATS_PER_BAR = 4
MODEL = "htdemucs_ft"
STEMS = ("vocals", "drums", "bass", "other")
OHOP = 32                      # шаг огибающей онсетов при 22050 Гц (1.45 мс), как в оригинале
OFPS = 22050 / OHOP
TEMPO_RANGE = (70.0, 180.0)    # поиск темпа без подсказки; вне диапазона — --bpm-hint
GRID_DEV_LIMIT_MS = 10.0       # beat-sync шаг 2: больше — темп переменный
SECTION_JUMP_DB = 4.0          # скачок громкости такта → кандидат границы секции
SNARE_RATIO = 2.0              # перевес малого барабана на 2 и 4 над 1 и 3, ниже — downbeatConfidence: low
HALFBAR_MARGIN = 1.1           # перевес выбранной фазы над соседней по гармонии+акценту (гипотеза, калибруется)
FINAL_HIT_MIN = 0.4            # «крупный» онсет: сила ≥ 0.4 от сильнейшего в последних 4 тактах (гипотеза)
MIN_ONSETS = 8                 # меньше точных онсетов — «сетка не найдена»


def die(msg, code=1):
    print(f"analyze: {msg}", file=sys.stderr)
    sys.exit(code)


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# --------------------------------------------------------------------------- вход и стемы
def decode(src, dst, t_from, t_to):
    """Вход → WAV 44.1 кГц стерео float одним проходом ffmpeg; отрезок — фильтром atrim (точно по сэмплам)."""
    af = []
    if t_from is not None or t_to is not None:
        parts = ([f"start={t_from}"] if t_from is not None else []) + ([f"end={t_to}"] if t_to is not None else [])
        af = ["-af", f"atrim={':'.join(parts)},asetpts=PTS-STARTPTS"]
    r = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), *af, "-ar", str(SR), "-ac", "2",
                        "-c:a", "pcm_f32le", str(dst)], capture_output=True, text=True)
    if r.returncode != 0:
        die(f"ffmpeg не декодировал {src}: {r.stderr.strip()[:400]}")


def ensure_stems(mix_wav, stems_dir):
    """Стемы Demucs с кэшем по sha256 входа. Расчёт — отдельным процессом через /usr/bin/time -l (пик памяти)."""
    meta_path = stems_dir / "stems.json"
    key = sha256_file(mix_wav)
    if meta_path.exists() and all((stems_dir / f"{n}.wav").exists() for n in STEMS):
        meta = json.loads(meta_path.read_text())
        if meta.get("mixSha256") == key and meta.get("model") == MODEL:
            print(f"стемы: из кэша {stems_dir} ({MODEL}; при расчёте: {fmt_mem(meta)})")
            return meta
    cmd = [sys.executable, str(HERE / "separate.py"), str(mix_wav), str(stems_dir), "--model", MODEL]
    timed = sys.platform == "darwin" and os.path.exists("/usr/bin/time")
    t0 = time.time()
    r = subprocess.run((["/usr/bin/time", "-l"] if timed else []) + cmd, capture_output=True, text=True)
    if r.returncode != 0:
        die(f"Demucs упал (код {r.returncode}):\n{r.stderr.strip()[-1500:]}")
    rss = re.search(r"(\d+)\s+maximum resident set size", r.stderr)
    foot = re.search(r"(\d+)\s+peak memory footprint", r.stderr)
    meta = dict(model=MODEL, mixSha256=key, seconds=round(time.time() - t0, 1),
                peakRssBytes=int(rss.group(1)) if rss else None,
                peakFootprintBytes=int(foot.group(1)) if foot else None)
    meta_path.write_text(json.dumps(meta, indent=1))
    print(f"стемы: Demucs {MODEL}, {meta['seconds']} с; {fmt_mem(meta)}")
    return meta


def fmt_mem(meta):
    rss, foot = meta.get("peakRssBytes"), meta.get("peakFootprintBytes")
    if rss is None:
        return "пик памяти не измерен (нет /usr/bin/time -l)"
    return (f"пик памяти (maximum resident set size) {rss / 2**30:.2f} ГБ = {rss} байт"
            + (f", peak memory footprint {foot / 2**30:.2f} ГБ" if foot else ""))


def stem_offset(mix, stems_sum, max_ms=50.0):
    """Задержка суммы стемов относительно микса (сэмплы, > 0 — стемы позже) кросс-корреляцией."""
    import numpy as np
    n = min(len(mix), len(stems_sum), 1 << 20)
    s0 = max(0, (min(len(mix), len(stems_sum)) - n) // 2)
    a, b = mix[s0:s0 + n].astype(np.float64), stems_sum[s0:s0 + n].astype(np.float64)
    if a.std() < 1e-6 or b.std() < 1e-6:
        return 0
    nfft = 1 << int(math.ceil(math.log2(2 * n)))
    c = np.fft.irfft(np.fft.rfft(b, nfft) * np.conj(np.fft.rfft(a, nfft)), nfft)
    m = int(max_ms / 1000 * SR)
    lags = np.concatenate([c[-m:], c[:m + 1]])
    return int(np.argmax(lags)) - m


def shift(x, k, n):
    """Сдвинуть сигнал на k сэмплов раньше (k > 0) и привести к длине n."""
    import numpy as np
    x = x[k:] if k > 0 else np.concatenate([np.zeros(-k, dtype=x.dtype), x])
    return x[:n] if len(x) >= n else np.pad(x, (0, n - len(x)))


# --------------------------------------------------------------------------- сетка
def onset_env(y):
    import librosa
    y22 = librosa.resample(y, orig_sr=SR, target_sr=22050)
    return librosa.onset.onset_strength(y=y22, sr=22050, hop_length=OHOP, lag=1, max_size=1)


def coarse_tempo(o):
    """Грубый темп: гребёнка автокорреляции огибающей онсетов (периоды 1–4 доли) × лог-нормальный приор у 120 BPM."""
    import numpy as np
    x = o - o.mean()
    n = len(x)
    max_lag = 4 * 60 / TEMPO_RANGE[0] * OFPS
    if n < 2 * max_lag:
        die(f"трек слишком короткий для поиска темпа: {n / OFPS:.1f} с, нужно ≥ {2 * max_lag / OFPS:.1f} с")
    nfft = 1 << int(math.ceil(math.log2(2 * n)))
    ac = np.fft.irfft(np.abs(np.fft.rfft(x, nfft)) ** 2)[:n]
    ac = ac / np.maximum(n - np.arange(n), 1)
    ac = ac / (ac[0] + 1e-12)
    bpms = np.arange(TEMPO_RANGE[0], TEMPO_RANGE[1] + 0.05, 0.1)
    lag = np.arange(n)
    comb = np.array([np.interp([k * 60 / b * OFPS for k in (1, 2, 3, 4)], lag, ac).mean() for b in bpms])
    score = comb * np.exp(-0.5 * np.log2(bpms / 120.0) ** 2)
    return float(bpms[int(np.argmax(score))])


def grid_scores(o, P, offs, duration):
    """Оценка сетки (как score() оригинала): средняя сила онсетов на долях, по вектору сдвигов offs."""
    import numpy as np
    k = np.arange(max(2, int(duration / P) - 1))
    idx = np.round((offs[:, None] + P * k[None, :]) * OFPS).astype(int).clip(1, len(o) - 2)
    return np.maximum(np.maximum(o[idx - 1], o[idx]), o[idx + 1]).mean(axis=1)


def fit_tempo(o, duration, bpm0, span=0.03):
    """Темп и фаза перебором вокруг bpm0 (шаг 0.02 BPM / 4 мс), затем уточнение (0.001 BPM / 1 мс) — как fit_grid оригинала."""
    import numpy as np
    best = (-1.0, bpm0, 0.0)
    for bpm in np.arange(bpm0 * (1 - span), bpm0 * (1 + span), 0.02):
        P = 60 / bpm
        offs = np.arange(0, P, 0.004)
        s = grid_scores(o, P, offs, duration)
        i = int(np.argmax(s))
        if s[i] > best[0]:
            best = (float(s[i]), float(bpm), float(offs[i]))
    _, bpm, off = best
    for b2 in np.arange(bpm - 0.02, bpm + 0.02, 0.001):
        P = 60 / b2
        offs = np.arange(off - 0.01, off + 0.01, 0.001)
        s = grid_scores(o, P, offs, duration)
        i = int(np.argmax(s))
        if s[i] > best[0]:
            best = (float(s[i]), float(b2), float(offs[i]))
    return best[1], best[2]


def refine_on_onsets(t, P, off):
    """Уточнение периода и фазы по точным временам атак: линейная регрессия t = off + n·P по онсетам у долей
    (в оригинале — только фаза, медианой остатков бочки). Возвращает (P, off, число использованных онсетов)."""
    import numpy as np
    used = 0
    for it in range(4):
        n = np.round((t - off) / P)
        res = t - (off + n * P)
        m = np.abs(res) < (0.06 if it == 0 else 0.04)
        used = int(m.sum())
        if used < MIN_ONSETS:
            return P, off, used
        if np.ptp(n[m]) >= 16:
            P, off = (float(v) for v in np.polyfit(n[m], t[m], 1))
        else:
            off = off + float(np.median(res[m]))
    return P, off, used


def grid_deviation_ms(t, P, off, duration):
    """Отклонение онсетов от ровной сетки шестнадцатых по окнам 15 с: максимум по окнам медианы |отклонения|.
    Ровный квантованный трек — единицы мс; случайные онсеты — около P/16 (≈ 29 мс при 130 BPM); дрейф темпа — растёт."""
    import numpy as np
    sub = P / 4
    r = t - off
    r = np.abs(r - np.round(r / sub) * sub)
    starts = list(np.arange(0, max(duration - 15.0, 0) + 1e-9, 7.5))
    if duration > 15 and duration - 15 - starts[-1] > 1.0:
        starts.append(duration - 15.0)
    vals = [float(np.median(r[(t >= s) & (t < s + 15)])) for s in starts if ((t >= s) & (t < s + 15)).sum() >= 6]
    return 1000 * (max(vals) if vals else float(np.median(r)))


def drifting_beats(t, P0, duration, win=16.0, step=4.0):
    """Переменный темп: доли по измеренным онсетам. В окнах win (шаг step) подбирается своя ровная сетка
    (перебор темпа ±1.5 % и фазы, затем регрессия по онсетам у долей); каждая доля берётся из сетки ближайшего окна.
    Следит за плавным уходом темпа; при скачках темпа внутри окна сетка окна — компромисс (видно на qa.png)."""
    import numpy as np
    centers = np.arange(win / 2, max(duration - win / 2, win / 2) + 1e-9, step)
    fits = []
    for c in centers:
        tt = t[(t >= c - win / 2) & (t < c + win / 2)]
        fit = None
        if len(tt) >= MIN_ONSETS:
            best = (-1.0, P0, c)
            for bpm in np.arange(60 / P0 * 0.985, 60 / P0 * 1.015, 0.02):
                P = 60 / bpm
                offs = np.arange(0, P, 0.003)
                r = (tt[None, :] - c - offs[:, None]) / P
                r = np.abs(r - np.round(r)) * P
                sc = np.maximum(0, 0.03 - r).sum(axis=1)
                i = int(np.argmax(sc))
                if sc[i] > best[0]:
                    best = (float(sc[i]), P, c + float(offs[i]))
            P, off, used = refine_on_onsets(tt, best[1], best[2])
            if used >= MIN_ONSETS:
                fit = (P, off)
        fits.append(fit)
    valid = [i for i, f in enumerate(fits) if f]
    if not valid:
        return np.array([])
    beats = []
    for wi, c in enumerate(centers):
        P, off = fits[min(valid, key=lambda i: abs(i - wi))]
        lo = 0.0 if wi == 0 else c - step / 2
        hi = duration if wi == len(centers) - 1 else c + step / 2
        k = np.arange(math.ceil((lo - off) / P), math.ceil((hi - off) / P))
        for b_ in off + P * k:
            if not beats or b_ - beats[-1] > 0.5 * P:   # на стыке окон доля не дублируется
                beats.append(float(b_))
    beats = np.array(beats)
    return beats[(beats >= 0) & (beats <= duration)]


# --------------------------------------------------------------------------- сильная доля
def downbeat_phase(beats, P, mix, harm, snare_t, om):
    """Фаза такта (какой индекс доли mod 4 — сильная).
    1) Малый барабан на 2 и 4 (как pos_hist оригинала): две позиции через две доли, обе заняты, перевес над
       остальными ≥ 2:1 — фиксирует фазу с точностью до полутакта. Нет такого рисунка → downbeatConfidence: low.
       Один удар на такт (трейлерный «импакт») рисунком 2 и 4 не считается: он идёт в акцент.
    2) Полутакт (в оригинале снят вручную по гармонии) и случай без рисунка: смена гармонии на доле (хрома стемов
       без барабанов) + акцент на доле (поток онсетов микса и пик громкости); слабый перевес → low."""
    import numpy as np
    import librosa
    from pdoom_dsp import frame_rms
    nb = len(beats)
    hist = np.zeros(4)
    if len(snare_t):
        j = np.clip(np.searchsorted(beats, snare_t), 1, nb - 1)
        i = np.where(np.abs(beats[j] - snare_t) < np.abs(beats[j - 1] - snare_t), j, j - 1)
        on_beat = np.abs(beats[i] - snare_t) < 0.2 * P
        hist = np.bincount(i[on_beat] % 4, minlength=4).astype(float)
    par = np.array([hist[0] + hist[2], hist[1] + hist[3]])
    bp = int(np.argmax(par))
    both = min(hist[bp], hist[bp + 2]) >= 0.4 * max(hist[bp], hist[bp + 2])
    snare_ratio = float(par[bp] / max(par[1 - bp], 0.5)) if par.sum() >= 4 else 0.0
    snare_ok = bool(par.sum() >= 4 and snare_ratio >= SNARE_RATIO and both)
    allowed = [p for p in range(4) if (bp - p) % 2 == 1] if snare_ok else [0, 1, 2, 3]

    # хрома доли — по кадрам, чьё окно (±46 мс) захватывает атаку своей доли и не захватывает атаку следующей
    y22 = librosa.resample(harm, orig_sr=SR, target_sr=22050)
    C = librosa.feature.chroma_stft(y=y22, sr=22050, n_fft=2048, hop_length=256, norm=None)  # без нормировки кадра: тихие кадры не весят
    ct = np.arange(C.shape[1]) * 256 / 22050
    edges = np.concatenate([beats, [beats[-1] + P]])
    cb = np.zeros((nb, 12))
    for i in range(nb):
        m = (ct >= edges[i]) & (ct < edges[i + 1] - 0.06)
        if m.any():
            v = C[:, m].mean(axis=1)
            cb[i] = v / (np.linalg.norm(v) + 1e-9)
    h = np.zeros(nb)
    h[1:] = 1 - np.sum(cb[1:] * cb[:-1], axis=1)
    e = frame_rms(mix, SR)
    a_rms = np.array([e[max(0, int((t - 0.03) * FPS)):int((t + 0.08) * FPS) + 1].max() for t in beats])
    a_flux = np.array([om[max(0, int((t - 0.03) * OFPS)):int((t + 0.05) * OFPS) + 1].max() for t in beats])
    idx = np.arange(nb)

    def by_phase(v, first=0):
        out = np.array([v[(idx % 4 == p) & (idx >= first)].mean() if ((idx % 4 == p) & (idx >= first)).any() else 0.0
                        for p in range(4)])
        return out / out.sum() if out.sum() > 1e-9 else np.full(4, 0.25)

    Hn, Fn, Ln = by_phase(h, 1), by_phase(a_flux), by_phase(a_rms)
    score = Hn + Fn + Ln
    p = max(allowed, key=lambda q: score[q])
    margin = float(score[p] / max(max(score[q] for q in allowed if q != p), 1e-9))
    conf = "high" if snare_ok and margin >= HALFBAR_MARGIN else "low"
    why = "рисунок 2 и 4 есть" if snare_ok else ("малых барабанов на долях < 4" if par.sum() < 4 else
                                                 "рисунка 2 и 4 нет (один удар на такт или перевес < 2:1)")
    print(f"сильная доля: малый барабан по позициям долей {hist.astype(int).tolist()} — {why}; "
          f"смена гармонии {[round(float(v), 3) for v in Hn]}, поток онсетов {[round(float(v), 3) for v in Fn]}, громкость {[round(float(v), 3) for v in Ln]}; "
          f"фаза {p}, перевес над следующей {margin:.2f} → downbeatConfidence: {conf}")
    return p, conf


# --------------------------------------------------------------------------- финальный удар
def final_hits(mix, P, beat_pos, raw_low, raw_rms):
    """3–5 кандидатов на финальный удар: последние крупные онсеты (полоса low < 150 Гц + общий rms) в четырёх тактах
    перед затуханием и в самом затухании, по убыванию силы. Сила 1.0 = самый сильный удар трека.
    Это данные для выбора на слух, не выбор."""
    import numpy as np
    from pdoom_dsp import band_onsets
    bt, _ = band_onsets(mix, SR, None, None, win=0.010, min_gap=0.12, rel_db=8)
    lt, _ = band_onsets(mix, SR, None, 150, win=0.012, min_gap=0.12, rel_db=10)
    # время удара — по широкополосной атаке (фильтр НЧ размывает фронт); низкий онсет без пары — как есть
    ts = list(bt) + [t for t in lt if len(bt) == 0 or np.min(np.abs(bt - t)) > 0.03]
    if not ts:
        return []
    ts = np.array(sorted(ts))
    ref_l, ref_r = np.percentile(raw_low, 99) + 1e-12, np.percentile(raw_rms, 99) + 1e-12

    def peak(env, t):
        return float(env[max(0, int(t * FPS)):int((t + 0.15) * FPS) + 1].max())

    s = np.array([0.5 * peak(raw_low, t) / ref_l + 0.5 * peak(raw_rms, t) / ref_r for t in ts])
    s = s / s.max()
    loud = np.nonzero(raw_rms / ref_r >= 0.1)[0]
    t_end = (loud[-1] / FPS) if len(loud) else ts[-1]
    half = np.nonzero(raw_rms / ref_r >= 0.5)[0]
    t_body = (half[-1] / FPS) if len(half) else t_end      # дальше — затухание
    region = [i for i in range(len(ts)) if t_body - 4 * BEATS_PER_BAR * P <= ts[i] <= t_end]
    kept = []  # не ближе доли друг к другу — остаётся сильнейший из соседей
    for i in sorted(region, key=lambda i: -s[i]):
        if all(abs(ts[i] - ts[j]) >= 0.9 * P for j in kept):
            kept.append(i)
    if not kept:
        return []
    top = max(s[i] for i in kept)
    big = sorted([i for i in kept if s[i] >= FINAL_HIT_MIN * top], key=lambda i: -ts[i])[:5]   # последние крупные
    picked = big if len(big) >= 3 else sorted(kept, key=lambda i: -s[i])[:3]
    out = []
    for i in sorted(picked, key=lambda i: -s[i]):
        pos = beat_pos(float(ts[i]))
        bar = int(math.floor(pos / BEATS_PER_BAR)) + 1
        beat = round(pos - (bar - 1) * BEATS_PER_BAR + 1, 2)
        if beat >= BEATS_PER_BAR + 1:
            bar, beat = bar + 1, round(beat - BEATS_PER_BAR, 2)
        out.append(dict(t=round(float(ts[i]), 3), strength=round(float(s[i]), 3), bar=bar, beat=beat))
    return out


# --------------------------------------------------------------------------- прослушка и картинка
def write_clicks(path, mix_st, beats, downbeat_idx):
    import numpy as np
    import soundfile as sf
    out = mix_st.astype(np.float64) * 0.7
    n = int(0.03 * SR)
    tt = np.arange(n) / SR
    for i, t in enumerate(beats):
        strong = (i - downbeat_idx) % BEATS_PER_BAR == 0
        click = (0.9 if strong else 0.45) * np.sin(2 * np.pi * (1760 if strong else 1100) * tt) * np.exp(-tt / 0.006)
        s0 = int(round(t * SR))
        seg = out[s0:s0 + n]
        seg += click[:len(seg), None]
    sf.write(str(path), np.clip(out, -1, 1), SR, subtype="PCM_16")


def make_plot(path, doc_b, doc_a, drums, mix, title):
    import numpy as np
    import librosa
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    dur = doc_a["duration"]
    row_s = 20.0
    rows = max(1, int(math.ceil(dur / row_s)))
    use_drums = np.sqrt(np.mean(drums.astype(np.float64) ** 2)) > 1e-4
    src = drums if use_drums else mix
    fig, ax = plt.subplots(rows + 1, 1, figsize=(22, 3.2 + 2.9 * rows), squeeze=False,
                           gridspec_kw=dict(height_ratios=[1.3] + [1] * rows))
    ax = ax[:, 0]
    t = np.arange(len(doc_a["env"]["rms"])) / FPS
    for k, c in [("rms", "k"), ("low", "tab:red"), ("drums", "tab:orange"), ("vocal", "tab:purple")]:
        ax[0].plot(t, doc_a["env"][k], color=c, lw=0.7, label=k)
    ld = np.array([b["loudnessDb"] for b in doc_b["bars"]]) if doc_b["bars"] else np.array([0.0])
    for b in doc_b["bars"]:
        ax[0].axvline(b["start"], color="gray", lw=0.5, alpha=0.6)
        ax[0].text(b["start"], 1.02, f"{b['index']}\n{b['loudnessDb']:.0f}", fontsize=6, va="bottom")
    for s in doc_b["sectionsCandidates"]:
        ax[0].axvline(s["start"], color="tab:red", lw=2)
    for i, fh in enumerate(doc_a["finalHits"]):
        ax[0].plot([fh["t"]], [0.5], marker="*", color="tab:green", ms=16)
        ax[0].text(fh["t"], 0.56, f"F{i + 1}", color="tab:green", fontsize=10)
    ax[0].set_xlim(0, dur)
    ax[0].set_ylim(0, 1.25)
    ax[0].legend(loc="upper right", fontsize=7)
    ax[0].set_title(f"{title} — {doc_b['bpm']} BPM ({doc_b['tempo']}), первая сильная доля {doc_b['firstDownbeat']} с, "
                    f"downbeatConfidence {doc_b['downbeatConfidence']}, отклонение сетки {doc_b['gridDeviationMs']} мс. "
                    f"Сверху: такт / громкость дБ (от {ld.min():.0f} до {ld.max():.0f}); красная — кандидат секции; F — финальный удар",
                    fontsize=9, loc="left")
    downs = {round(b["start"], 4) for b in doc_b["bars"]}
    for r in range(rows):
        t0, t1 = r * row_s, min(dur, (r + 1) * row_s)
        seg = src[int(t0 * SR):int(t1 * SR)]
        a_ = ax[r + 1]
        if len(seg) > 2048:
            S = librosa.amplitude_to_db(np.abs(librosa.stft(seg, n_fft=1024, hop_length=256)), ref=np.max)
            a_.imshow(S, origin="lower", aspect="auto", cmap="magma", vmin=-60, vmax=0,
                      extent=[t0, t0 + S.shape[1] * 256 / SR, 0, SR / 2])
        a_.set_ylim(0, 12000)
        a_.set_xlim(t0, t0 + row_s)
        a_.set_ylabel("стем барабанов" if use_drums else "микс (барабанов нет)", fontsize=8)
        for b in doc_b["beats"]:
            if t0 <= b <= t1:
                strong = round(b, 4) in downs
                a_.axvline(b, color="c" if strong else "w", lw=1.8 if strong else 0.5, alpha=0.9 if strong else 0.5)
        for name, y, c in [("kick", 1500, "tab:red"), ("snare", 5000, "w"), ("hat", 9500, "yellow")]:
            pts = [(ot, s) for ot, s in doc_a["onsets"][name] if t0 <= ot <= t1]
            if pts:
                a_.scatter([p[0] for p in pts], [y] * len(pts), marker="v", color=c, s=[18 + 60 * p[1] for p in pts])
        a_.set_xticks(np.arange(math.ceil(t0), t0 + row_s + 0.01, 1.0))
        a_.tick_params(labelsize=7)
    fig.tight_layout()
    fig.savefig(str(path), dpi=70)
    plt.close(fig)


# --------------------------------------------------------------------------- main
def main():
    args = sys.argv[1:]
    valued = ("--from", "--to", "--bpm-hint")

    def opt(name):
        return float(args[args.index(name) + 1]) if name in args and args.index(name) + 1 < len(args) else None

    unknown = [a for a in args if a.startswith("--") and a not in valued]
    pos = [a for i, a in enumerate(args) if not a.startswith("--") and (i == 0 or args[i - 1] not in valued)]
    if unknown or len(pos) != 2:
        die("использование: analyze.py <in.wav|mp3> <out_dir> [--from S --to S] [--bpm-hint N]"
            + (f" (неизвестно: {' '.join(unknown)})" if unknown else ""))
    src, out_dir = Path(pos[0]), Path(pos[1])
    t_from, t_to, bpm_hint = opt("--from"), opt("--to"), opt("--bpm-hint")
    if not src.is_file():
        die(f"файл {src} не найден")
    if not os.environ.get("AUDIO_MODELS_DIR"):
        die("AUDIO_MODELS_DIR не задан — каталог кэша моделей Demucs (env.manifest.json → data_dirs; гейт 2: дефолта нет)")
    t_start = time.time()
    work = out_dir / "work"
    (work / "stems").mkdir(parents=True, exist_ok=True)
    sys.path.insert(0, str(HERE))

    import numpy as np
    import soundfile as sf
    from scipy.signal import sosfiltfilt
    import pdoom_dsp as dsp

    mix_wav = work / "mix.wav"
    decode(src, mix_wav, t_from, t_to)
    mix_st, sr = sf.read(str(mix_wav), dtype="float32", always_2d=True)
    mix = mix_st.mean(axis=1)
    duration = len(mix) / SR
    print(f"вход: {src.name}, отрезок {t_from if t_from is not None else 0}–{t_to if t_to is not None else 'конец'}, {duration:.3f} с")
    if duration < 4:
        die(f"отрезок {duration:.2f} с — слишком короткий")
    ensure_stems(mix_wav, work / "stems")
    stems = {n: sf.read(str(work / "stems" / f"{n}.wav"), dtype="float32", always_2d=True)[0].mean(axis=1) for n in STEMS}
    off_smp = stem_offset(mix, sum(stems.values()))
    stems = {n: shift(y, off_smp, len(mix)) for n, y in stems.items()}
    print(f"смещение стемов к миксу: {off_smp} сэмплов = {off_smp / SR * 1000:.2f} мс (кросс-корреляция; стемы сдвинуты)")
    rms = lambda y: float(np.sqrt(np.mean(y.astype(np.float64) ** 2)))
    drums_ok = rms(stems["drums"]) > 0.05 * rms(mix) and rms(stems["drums"]) > 1e-4

    # сетка ---------------------------------------------------------------
    om = onset_env(mix)
    o = om / (np.percentile(om, 99) + 1e-9)
    if drums_ok:
        od = onset_env(stems["drums"])[:len(om)]
        o[:len(od)] += od / (np.percentile(od, 99) + 1e-9)
    bpm0 = bpm_hint if bpm_hint else coarse_tempo(o)
    bpm, off = fit_tempo(o, duration, bpm0)
    P = 60 / bpm
    print(f"темп: грубо {bpm0:.1f} BPM ({'подсказка' if bpm_hint else 'автокорреляция'}) → по огибающей онсетов {bpm:.3f} BPM, фаза {off:.4f} с")
    (kt, kdb), (st, sdb), (ht, hdb) = dsp.drum_onsets(stems["drums"], SR) if drums_ok else ((np.array([]),) * 2,) * 3
    mt, _ = dsp.band_onsets(mix, SR, None, None, win=0.010, min_gap=0.1, rel_db=8)
    cands = [("бочка и малый (стем барабанов)", np.sort(np.concatenate([kt, st]))), ("атаки микса", mt)]
    fits = []  # (разброс остатков, имя, онсеты, P, off, использовано)
    for name, t in cands:
        if len(t) >= MIN_ONSETS:
            P1, off1, used = refine_on_onsets(t, P, off)
            if used >= MIN_ONSETS:
                res = t - (off1 + np.round((t - off1) / P1) * P1)
                fits.append((float(np.median(np.abs(res[np.abs(res) < 0.04]))), name, t, P1, off1, used))
    if not fits:
        print(f"analyze: сетка не найдена — точных онсетов у долей меньше {MIN_ONSETS}; "
              f"бочек {len(kt)}, малых {len(st)}, атак микса {len(mt)}. beats.json и audio.json не записаны.", file=sys.stderr)
        sys.exit(3)
    # по умолчанию — барабаны; атаки микса — если барабанов нет или их онсеты вдвое размытее (клик-трек, перкуссия вне стема)
    pick = fits[0] if len(fits) == 1 or fits[0][0] <= 2 * fits[1][0] else fits[1]
    for f in fits:
        print(f"  онсеты «{f[1]}»: {f[5]} шт. у долей, {60 / f[3]:.3f} BPM, медиана |остатка| {1000 * f[0]:.1f} мс{' ← выбраны' if f is pick else ''}")
    _, ref_name, ref_t, P1, off1, used = pick
    P, off = P1, off1
    bpm = 60 / P
    dev_ms = grid_deviation_ms(ref_t, P, off, duration)
    tempo = "constant" if dev_ms <= GRID_DEV_LIMIT_MS else "variable"
    print(f"уточнение по онсетам ({ref_name}, {used} шт. у долей): {bpm:.3f} BPM, период {P:.5f} с; "
          f"отклонение от сетки по окнам 15 с: {dev_ms:.1f} мс (порог {GRID_DEV_LIMIT_MS:.0f}) → tempo: {tempo}")
    if tempo == "constant":
        k0 = math.ceil((-0.005 - off) / P)
        beats = np.maximum(off + P * np.arange(k0, int((duration - off) / P) + 1), 0.0)
    else:
        beats = drifting_beats(ref_t, P, duration)
        if len(beats) < 2 * BEATS_PER_BAR:
            print(f"analyze: сетка не найдена — темп переменный, измеренных долей {len(beats)}. "
                  "beats.json и audio.json не записаны.", file=sys.stderr)
            sys.exit(3)
        print(f"переменный темп: {len(beats)} долей по измеренным онсетам (периоды {np.diff(beats).min():.3f}–{np.diff(beats).max():.3f} с); "
              f"bpm в beats.json — средний по записи ({bpm:.3f}), считать по нему доли нельзя — только beats[]")

    # сильная доля, такты ---------------------------------------------------
    harm = stems["bass"] + stems["other"] + stems["vocals"]
    phase, conf = downbeat_phase(beats, P, mix, harm if rms(harm) > 0.05 * rms(mix) else mix, st, om)
    d_idx = phase  # индекс первой сильной доли в beats[]
    bar_starts = beats[d_idx::BEATS_PER_BAR]
    bars = []
    for i, s in enumerate(bar_starts):
        e = bar_starts[i + 1] if i + 1 < len(bar_starts) else min(duration, s + BEATS_PER_BAR * P)
        seg = mix[int(s * SR):int(e * SR)]
        if len(seg) < 0.05 * SR:
            continue
        bars.append(dict(index=i + 1, start=round(float(s), 4),
                         loudnessDb=round(max(-120.0, 20 * math.log10(rms(seg) + 1e-12)), 2),
                         _full=(e - s) >= 0.5 * BEATS_PER_BAR * P))
    sections = []
    for prev, cur in zip(bars, bars[1:]):
        delta = cur["loudnessDb"] - prev["loudnessDb"]
        if cur["_full"] and prev["_full"] and abs(delta) >= SECTION_JUMP_DB:
            sections.append(dict(bar=cur["index"], start=cur["start"], deltaDb=round(delta, 2), candidate=True))
    for b in bars:
        del b["_full"]

    def beat_pos(t):
        """Позиция в долях от первой сильной доли (дробная), по beats[] с линейным продолжением за края."""
        i = int(np.clip(np.searchsorted(beats, t, side="right") - 1, 0, len(beats) - 2))
        return (i - d_idx) + (t - beats[i]) / (beats[i + 1] - beats[i])

    # огибающие ---------------------------------------------------------------
    n = int(math.ceil(duration * FPS))
    raw = {"rms": dsp.frame_rms(mix, SR)[:n]}
    for name, (lo, hi) in {"low": (None, 150), "mid": (150, 2000), "high": (4000, None)}.items():
        raw[name] = dsp.frame_rms(sosfiltfilt(dsp.band_sos(lo, hi, SR), mix), SR)[:n]
    for s in ("vocal", "drums", "bass", "other"):
        raw[s] = dsp.frame_rms(stems["vocals" if s == "vocal" else s], SR)[:n]
    smooth = {k: dsp.smooth_env(v) for k, v in raw.items()}
    env = {k: [round(float(x), 3) for x in dsp.norm01(v)] for k, v in smooth.items()}

    # онсеты ---------------------------------------------------------------
    import librosa
    t_voc = time.time()
    voc = dsp.vocal_onsets(librosa.resample(stems["vocals"], orig_sr=SR, target_sr=dsp.VOC_SR))
    pack = lambda t, s: [[round(float(a), 3), round(float(b), 3)] for a, b in zip(t, s)]
    onsets = dict(kick=pack(kt, dsp.strength01(kdb)), snare=pack(st, dsp.strength01(sdb)),
                  hat=pack(ht, dsp.strength01(hdb)), vocal=[[round(t, 3), round(s, 3)] for t, s in voc])
    hits = final_hits(mix, P, beat_pos, smooth["low"], smooth["rms"])
    print(f"онсеты: бочка {len(kt)}, малый {len(st)}, хэт {len(ht)}, вокал {len(voc)} ({time.time() - t_voc:.1f} с на вокал)")
    print("финальный удар, кандидаты по убыванию силы: "
          + ("; ".join(f"{h['t']} с (сила {h['strength']}, такт {h['bar']} доля {h['beat']})" for h in hits) or "нет"))

    doc_b = dict(bpm=round(bpm, 3), tempo=tempo, beatPeriod=round(P, 6), firstDownbeat=round(float(beats[d_idx]), 4),
                 beatsPerBar=BEATS_PER_BAR, downbeatConfidence=conf, beats=[round(float(t), 4) for t in beats],
                 bars=bars, sectionsCandidates=sections, gridDeviationMs=round(dev_ms, 2),
                 stemOffsetMs=round(off_smp / SR * 1000, 3),
                 source=dict(file=src.name, sha256=sha256_file(src), **{"from": t_from, "to": t_to}))
    doc_a = dict(fps=FPS, duration=round(duration, 3), env=env, onsets=onsets, finalHits=hits)
    (out_dir / "beats.json").write_text(json.dumps(doc_b, ensure_ascii=False, separators=(",", ":")) + "\n")
    (out_dir / "audio.json").write_text(json.dumps(doc_a, ensure_ascii=False, separators=(",", ":")) + "\n")
    write_clicks(out_dir / "clicks.wav", mix_st, beats, d_idx)
    make_plot(out_dir / "qa.png", doc_b, doc_a, stems["drums"], mix, src.name)
    print(f"итог: {doc_b['bpm']} BPM, tempo {tempo}, первая сильная доля {doc_b['firstDownbeat']} с, долей {len(beats)}, "
          f"тактов {len(bars)}, кандидатов секций {len(sections)}")
    print(f"записано: {out_dir}/beats.json, audio.json, clicks.wav, qa.png; всего {time.time() - t_start:.1f} с")


if __name__ == "__main__":
    main()
