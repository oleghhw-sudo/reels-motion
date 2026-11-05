#!/usr/bin/env python3
"""audio/analyze/selftest.py — позитивные контроли анализатора на синтетике (задача 021, гейт 4).

  AUDIO_MODELS_DIR=<кэш> python selftest.py <out_dir> [--negative]

  (а) клик-трек 120 BPM, первая сильная доля 0.25 с → обязан вернуть 120.0 ± 0.05 BPM и 0.25 ± 0.005 с;
  (б) розовый шум 20 с → обязан вернуть tempo: "variable" или отказ «сетка не найдена» (код 3), а не уверенную сетку;
  (г) ритм с явным последним ударом на 16.25 с → кандидат финального удара № 1 в пределах ±10 мс.
Контроль (в) — сдвинутый на 100 мс эталон 1 — запускается отдельно через calibrate.py (нужен трек MIA).
--negative: ожидания заведомо неверные (121 BPM; шум «обязан» дать constant; удар на 16.30 с) — прогон ОБЯЗАН упасть.
Каждый случай — полный прогон analyze.py, включая Demucs (пик памяти печатается).
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
SR = 44100


def click_track(dur=20.0, bpm=120.0, first=0.25):
    y = np.zeros(int(dur * SR))
    tt = np.arange(int(0.03 * SR)) / SR
    for i, t in enumerate(np.arange(first, dur - 0.05, 60 / bpm)):
        strong = i % 4 == 0
        c = (0.9 if strong else 0.45) * np.sin(2 * np.pi * (1500 if strong else 1000) * tt) * np.exp(-tt / 0.005)
        s0 = int(round(t * SR))
        y[s0:s0 + len(c)] += c
    return y


def pink_noise(dur=20.0, seed=0):
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    spec = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    spec[1:] /= np.sqrt(f[1:])
    spec[0] = 0
    y = np.fft.irfft(spec, n)
    return 0.3 * y / np.abs(y).max()


def final_hit_track(dur=20.0, bpm=120.0, first=0.25, hit=16.25, seed=1):
    """Бочка на каждой доле, шум-«малый» на 2 и 4 до удара; на hit — большой удар (низ + шум), дальше затухание."""
    rng = np.random.default_rng(seed)
    y = np.zeros(int(dur * SR))

    def add(t, sig):
        s0 = int(round(t * SR))
        seg = y[s0:s0 + len(sig)]
        seg += sig[:len(seg)]

    tk = np.arange(int(0.25 * SR)) / SR
    kick = 0.5 * np.sin(2 * np.pi * (55 * tk + 40 * 0.03 * (1 - np.exp(-tk / 0.03)))) * np.exp(-tk / 0.07)
    ts = np.arange(int(0.15 * SR)) / SR
    for i, t in enumerate(np.arange(first, hit - 0.01, 60 / bpm)):
        add(t, kick)
        if i % 2 == 1:
            add(t, 0.25 * rng.standard_normal(len(ts)) * np.exp(-ts / 0.04))
    tb = np.arange(int(3.5 * SR)) / SR
    add(hit, 0.95 * np.sin(2 * np.pi * 50 * tb) * np.exp(-tb / 0.8) + 0.5 * rng.standard_normal(len(tb)) * np.exp(-tb / 0.25))
    return np.clip(y, -1, 1)


def analyze(name, y, out):
    d = out / name
    d.mkdir(parents=True, exist_ok=True)
    sf.write(str(d / "in.wav"), np.stack([y, y], axis=1), SR, subtype="PCM_16")
    r = subprocess.run([sys.executable, str(HERE / "analyze.py"), str(d / "in.wav"), str(d)], capture_output=True, text=True)
    lines = [l for l in (r.stdout + r.stderr).splitlines() if "Warning" not in l and l.strip()]
    print(f"--- {name}: код выхода {r.returncode}")
    for l in lines:
        if any(k in l for k in ("стемы:", "темп:", "уточнение", "сильная доля", "финальный", "итог", "сетка не найдена", "Traceback", "Error")):
            print("   ", l)
    doc = None
    if r.returncode == 0:
        doc = (json.loads((d / "beats.json").read_text()), json.loads((d / "audio.json").read_text()))
    return r.returncode, doc


def main():
    args = sys.argv[1:]
    negative = "--negative" in args
    pos = [a for a in args if not a.startswith("--")]
    if len(pos) != 1:
        print(__doc__, file=sys.stderr)
        sys.exit(1)
    out = Path(pos[0])
    exp_bpm, exp_hit = (121.0, 16.30) if negative else (120.0, 16.25)
    if negative:
        print("NEGATIVE: ожидания заведомо неверные — прогон ОБЯЗАН упасть (гейт 4).")
    failed = 0

    def expect(name, cond, detail):
        nonlocal failed
        print(f"  {'✓' if cond else '✗'} {name} — {detail}")
        failed += not cond

    code, doc = analyze("clicks-120", click_track(), out)
    if doc:
        b = doc[0]
        expect(f"(а) клик-трек: BPM {exp_bpm} ± 0.05", abs(b["bpm"] - exp_bpm) <= 0.05, f"измерено {b['bpm']}")
        expect("(а) клик-трек: первая сильная доля 0.25 ± 0.005 с", abs(b["firstDownbeat"] - 0.25) <= 0.005,
               f"измерено {b['firstDownbeat']} (downbeatConfidence {b['downbeatConfidence']}, tempo {b['tempo']})")
    else:
        expect("(а) клик-трек: анализ завершился", False, f"код {code}")

    code, doc = analyze("pink-noise", pink_noise(), out)
    got = "отказ «сетка не найдена» (код 3)" if code == 3 else (f"tempo {doc[0]['tempo']}, {doc[0]['bpm']} BPM" if doc else f"код {code}")
    refused = code == 3 or (doc is not None and doc[0]["tempo"] == "variable")
    if negative:
        expect("(б) розовый шум: [неверное ожидание] уверенная сетка constant", doc is not None and doc[0]["tempo"] == "constant", got)
    else:
        expect("(б) розовый шум: variable или отказ, не уверенная сетка", refused, got)

    code, doc = analyze("final-hit", final_hit_track(), out)
    if doc and doc[1]["finalHits"]:
        fh = doc[1]["finalHits"]
        expect(f"(г) финальный удар: кандидат № 1 = {exp_hit} ± 0.010 с", abs(fh[0]["t"] - exp_hit) <= 0.010,
               f"кандидаты: {[(h['t'], h['strength'], h['bar'], h['beat']) for h in fh]}")
        expect("(г) финальный удар: кандидатов 3–5, по убыванию силы",
               3 <= len(fh) <= 5 and all(fh[i]["strength"] >= fh[i + 1]["strength"] for i in range(len(fh) - 1)), f"{len(fh)} шт.")
    else:
        expect("(г) финальный удар: кандидаты есть", False, f"код {code}")

    print(f"\n{'ПРОВАЛ' if failed else 'OK'}: не выполнено ожиданий — {failed}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
