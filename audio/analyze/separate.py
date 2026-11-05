#!/usr/bin/env python3
"""audio/analyze/separate.py — стемы Demucs для анализатора трека (задача 021).

  AUDIO_MODELS_DIR=<кэш моделей> python separate.py <mix.wav 44.1 кГц> <stems_dir> [--model htdemucs_ft] [--segment S]

Отдельный процесс, чтобы пик памяти мерился целиком: analyze.py запускает его через `/usr/bin/time -l`.
Пишет <stems_dir>/{vocals,drums,bass,other}.wav (float32, 44.1 кГц, стерео).
Устройство — только CPU: пик RSS тогда честно покрывает всю память прогона (на MPS память GPU в RSS не видна).
shifts=0 — без случайного сдвига Demucs: результат повторяем от запуска к запуску.
"""
import os
import sys
import time


def die(msg, code=1):
    print(f"separate: {msg}", file=sys.stderr)
    sys.exit(code)


def main():
    args = sys.argv[1:]

    def opt(name, default=None):
        return args[args.index(name) + 1] if name in args and args.index(name) + 1 < len(args) else default

    pos = [a for i, a in enumerate(args) if not a.startswith("--") and (i == 0 or args[i - 1] not in ("--model", "--segment"))]
    if len(pos) != 2:
        die("использование: separate.py <mix.wav> <stems_dir> [--model htdemucs_ft] [--segment S]")
    wav_path, out_dir = pos
    model_name = opt("--model", "htdemucs_ft")
    segment = opt("--segment")
    cache = os.environ.get("AUDIO_MODELS_DIR")
    if not cache:
        die("AUDIO_MODELS_DIR не задан — каталог кэша моделей Demucs (env.manifest.json → data_dirs; гейт 2: дефолта нет)")
    os.makedirs(cache, exist_ok=True)
    os.environ["TORCH_HOME"] = cache  # до импорта torch: веса Demucs — в <cache>/hub/checkpoints

    import numpy as np
    import soundfile as sf
    import torch
    from demucs.apply import apply_model
    from demucs.pretrained import get_model

    t0 = time.time()
    y, sr = sf.read(wav_path, dtype="float32", always_2d=True)
    model = get_model(model_name)
    model.eval()
    if sr != model.samplerate:
        die(f"{wav_path}: {sr} Гц, модели нужно {model.samplerate} (analyze.py декодирует вход сам)")
    if y.shape[1] == 1:
        y = np.repeat(y, 2, axis=1)
    wav = torch.from_numpy(np.ascontiguousarray(y.T))  # [2, n]
    ref = wav.mean(0)
    mean, std = ref.mean(), ref.std() + 1e-8
    kw = dict(device="cpu", shifts=0, split=True, overlap=0.25, progress=False, num_workers=0)
    if segment:
        kw["segment"] = float(segment)
    with torch.no_grad():
        out = apply_model(model, ((wav - mean) / std)[None], **kw)[0]
    out = out * std + mean
    os.makedirs(out_dir, exist_ok=True)
    for name, src in zip(model.sources, out):
        sf.write(os.path.join(out_dir, f"{name}.wav"), src.numpy().T, sr, subtype="FLOAT")
    print(f"separate: {model_name}{' segment ' + segment if segment else ''}, {len(y) / sr:.1f} с аудио, "
          f"{time.time() - t0:.1f} с работы, стемы: {', '.join(model.sources)}")


if __name__ == "__main__":
    main()
