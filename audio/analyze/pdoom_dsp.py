# Ported from mexicat/pdoom-video @fa164b7 · MIT (c) 2026 Giacomo Magnanini — analysis/analyze.py, analysis/vocal_feats.py
# Оригиналы без правок — vendor/pdoom-analysis/ (LICENSE, VENDORED.md). Здесь — перенесённые функции обработки сигнала.
# Изменения при переносе (задача 021):
#   - band_onsets: окно энергии — «назад» (кадр f покрывает (f·hop − win, f·hop]), а не по центру: резкая атака в оригинале
#     находилась на win/2 раньше (5–6 мс), у нас — в пределах ±1 мс; при равных подъёмах берётся кадр наибольшего сырого
#     подъёма; полоса может быть не задана (весь спектр); добавлен абсолютный пол (тише −50 дБ от максимума — не онсет),
#     иначе пустой стем даёт «онсеты» из шума округления;
#   - drum_onsets: защита от пустых списков и хвоста у конца файла (в оригинале — исключение/NaN);
#   - vocal_feats/vocal_onsets: признаки считаются в памяти из переданного стема (в оригинале — кэш vocal_feats.npz на диске);
#     тихий вокальный стем (инструментал) → пустой список;
#   - norm01: нулевой сигнал → нули; frame_rms/smooth_env/strength01/band_sos — как в оригинале.
import math

import numpy as np
from scipy.ndimage import maximum_filter1d, median_filter, uniform_filter1d
from scipy.signal import butter, find_peaks, sosfiltfilt

FPS = 100


def band_sos(lo, hi, sr):
    if lo and hi:
        return butter(4, [lo, hi], btype="band", fs=sr, output="sos")
    if hi:
        return butter(4, hi, btype="low", fs=sr, output="sos")
    return butter(4, lo, btype="high", fs=sr, output="sos")


def frame_rms(x, sr, fps=FPS, win=2048):
    hop = sr / fps
    n = int(math.ceil(len(x) / sr * fps))
    pad = np.pad(x, (win // 2, win // 2 + int(hop) + 2))
    idx = (np.arange(n) * hop).astype(int)
    c = np.concatenate([[0.0], np.cumsum(pad.astype(np.float64) ** 2)])
    e = (c[idx + win] - c[idx]) / win
    return np.sqrt(np.maximum(e, 0))


def smooth_env(x, fps=FPS, attack=0.010, release=0.090):
    """One-pole follower: fast attack, slower release (visual friendly)."""
    aa = math.exp(-1 / (attack * fps))
    ar = math.exp(-1 / (release * fps))
    y = np.empty_like(x)
    s = 0.0
    for i, v in enumerate(x):
        a = aa if v > s else ar
        s = a * s + (1 - a) * v
        y[i] = s
    return y


def norm01(x, pct=99.0):
    ref = np.percentile(x, pct)
    if ref <= 1e-9:
        return np.zeros_like(x)
    return np.clip(x / ref, 0, 1)


def band_onsets(x, sr, lo, hi, win=0.010, hop_s=0.002, min_gap=0.08, rel_db=10.0, abs_floor_db=-50.0):
    """Onsets in a frequency band: steepest rise of the band's log-energy envelope.
    Returns (times, peak_db). Время — начало атаки (окно энергии смотрит назад)."""
    xb = sosfiltfilt(band_sos(lo, hi, sr), x) if (lo or hi) else np.asarray(x, dtype=np.float64)
    h = int(hop_s * sr)
    w = int(win * sr)
    c = np.concatenate([[0.0], np.cumsum(xb.astype(np.float64) ** 2)])
    end = np.minimum(np.arange(0, len(xb), h) + 1, len(xb))
    e = (c[end] - c[np.maximum(end - w, 0)]) / w
    db = 10 * np.log10(e + 1e-10)
    fps = sr / h  # exact frame rate (h is an integer number of samples)
    if len(db) < 8 or db.max() < -80:
        return np.array([]), np.array([])
    d_raw = np.diff(db, prepend=db[0])
    d = uniform_filter1d(d_raw, 3)
    lag = int(0.02 * fps)  # rise over ~20 ms
    rise = db - np.concatenate([np.full(lag, db[0]), db[:-lag]])
    floor = median_filter(db, int(1.0 * fps) | 1)
    pk, _ = find_peaks(rise, height=rel_db, distance=max(1, int(min_gap * fps)))
    times, strength = [], []
    top = db.max()
    for p in pk:
        a = max(0, p - lag)
        q = a + int(np.argmax(d[a:p + 1]))  # steepest slope within the rise window
        q0, q1 = max(0, q - 1), min(len(d_raw), q + 2)
        q = q0 + int(np.argmax(d_raw[q0:q1]))
        peak_db = db[p:p + int(0.03 * fps)].max()
        if peak_db < floor[p] + 3 or peak_db < top + abs_floor_db:
            continue
        times.append(q / fps - hop_s / 2)
        strength.append(peak_db)
    return np.array(times), np.array(strength)


def drum_onsets(d, sr):
    """Kick / snare / hat onsets from the drums stem."""
    empty = (np.array([]), np.array([]))
    if len(d) == 0 or np.sqrt(np.mean(d.astype(np.float64) ** 2)) < 1e-4:
        return empty, empty, empty
    # KICK: <120 Hz
    kt, kdb = band_onsets(d, sr, None, 120, win=0.012, min_gap=0.15, rel_db=12)
    # SNARE: candidates are 1.5-5 kHz attacks; a snare has a long noisy 0.5-5 kHz tail 40-120 ms after the attack.
    # Keep candidates whose tail is within 8 dB of the loudest tail in +-2.5 s and within 25 dB of the song-wide
    # level (rejects stem bleed). Kick-only beats / hats have tails 12-30 dB lower.
    st, sdb = band_onsets(d, sr, 1500, 5000, win=0.010, min_gap=0.15, rel_db=10)
    stail = np.array([])
    if len(st):
        xb = sosfiltfilt(band_sos(500, 5000, sr), d)
        e = np.sqrt(np.convolve(xb.astype(np.float64) ** 2, np.ones(441) / 441, mode="same"))

        def tail_db(t):
            seg = e[int((t + 0.04) * sr):int((t + 0.12) * sr)]
            return 20 * np.log10(seg.mean() + 1e-9) if len(seg) else -180.0

        tail = np.array([tail_db(t) for t in st])
        rel = np.array([tail[i] - tail[np.abs(st - st[i]) < 2.5].max() for i in range(len(st))])
        thr = np.percentile(tail, 95) - 25
        keep = (rel > -8) & (tail > thr)
        st, sdb, stail = st[keep], sdb[keep], tail[keep]
    # HAT: >7 kHz, short; drop those coinciding with snares (snare noise also reaches 7k+)
    # (and those within 30 ms of a kick: the kick's beater click reaches 10 kHz)
    ht, hdb = band_onsets(d, sr, 7000, None, win=0.006, min_gap=0.06, rel_db=9)
    for other, gap in ((st, 0.04), (kt, 0.03)):
        if len(other) and len(ht):
            dist = np.min(np.abs(ht[:, None] - other[None, :]), axis=1)
            keep = dist > gap
            ht, hdb = ht[keep], hdb[keep]
    return (kt, kdb), (st, stail), (ht, hdb)


def strength01(db_vals, lo_pct=5, hi_pct=95):
    if len(db_vals) == 0:
        return db_vals
    lo, hi = np.percentile(db_vals, lo_pct), np.percentile(db_vals, hi_pct)
    return np.clip((db_vals - lo) / (hi - lo + 1e-9) * 0.8 + 0.2, 0, 1)


VOC_SR = 22050
VOC_HOP = 110  # ~5 ms


def vocal_feats(y):
    """Признаки вокального стема (y — моно, 22050 Гц): rms (dB), pyin f0, спектральный поток (log-mel). hop 5 мс."""
    import librosa
    rms = librosa.feature.rms(y=y, frame_length=1024, hop_length=VOC_HOP, center=True)[0]
    S = np.abs(librosa.stft(y, n_fft=1024, hop_length=VOC_HOP, center=True)) ** 2
    mel = librosa.feature.melspectrogram(S=S, sr=VOC_SR, n_mels=96, fmax=8000)
    logmel = librosa.power_to_db(mel, ref=np.max)
    onset = librosa.onset.onset_strength(S=logmel, sr=VOC_SR, hop_length=VOC_HOP, lag=2, max_size=3)
    f0, vflag, _ = librosa.pyin(y, fmin=70, fmax=1000, sr=VOC_SR, frame_length=2048, hop_length=VOC_HOP, center=True)
    n = min(len(rms), len(f0), S.shape[1])
    return dict(hop_s=VOC_HOP / VOC_SR, rms_db=librosa.amplitude_to_db(rms[:n], ref=1.0), onset=onset[:n],
                f0=f0[:n], voiced=vflag[:n])


def vocal_onsets(y):
    """Vocal note onsets: log-mel spectral flux peaks (5 ms hop) plus pitch jumps > 0.8 semitone while voiced,
    restricted to active vocal frames. y — моно вокальный стем, 22050 Гц."""
    import librosa
    if len(y) < VOC_SR // 2 or np.sqrt(np.mean(y.astype(np.float64) ** 2)) < 10 ** (-50 / 20):
        return []
    f = vocal_feats(y)
    hop = float(f["hop_s"])
    on = f["onset"]
    rms = f["rms_db"]
    loc = maximum_filter1d(rms, int(2.0 / hop))
    active = (rms > -45) & (rms > loc - 25)
    if not active.any():
        return []
    thr = uniform_filter1d(on, int(0.4 / hop)) * 1.5 + 0.15 * np.percentile(on, 99)
    pk, _ = find_peaks(on, height=0, distance=int(0.09 / hop))
    pk = [p for p in pk if on[p] > thr[p] and active[min(len(active) - 1, p + int(0.03 / hop))]]
    t_flux = np.array(pk) * hop
    s_flux = np.array([on[p] for p in pk])
    # pitch jumps (legato note changes that have little spectral flux)
    midi = librosa.hz_to_midi(np.where(f["voiced"] > 0, f["f0"], np.nan))
    med = median_filter(np.nan_to_num(midi, nan=0), 9)
    jumps = []
    w = int(0.04 / hop)
    for i in range(w, len(med) - w):
        a, b = med[i - w], med[i + w]
        if a > 0 and b > 0 and abs(b - a) > 0.8 and active[i]:
            jumps.append(i)
    t_pitch, last = [], -1e9  # collapse runs
    for i in jumps:
        if i - last > int(0.1 / hop):
            t_pitch.append(i * hop)
        last = i
    ref = np.percentile(s_flux, 95) + 1e-9 if len(s_flux) else 1.0
    ts = list(zip(t_flux, s_flux / ref))
    for t in t_pitch:
        if len(t_flux) == 0 or np.min(np.abs(t_flux - t)) > 0.08:
            ts.append((t, 0.35))
    ts.sort()
    return [(float(t), float(min(1.0, max(0.1, s)))) for t, s in ts]
