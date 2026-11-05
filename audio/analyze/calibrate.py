#!/usr/bin/env python3
"""audio/analyze/calibrate.py — сверка анализа с эталонными ударами (задача 021, калибровка).

  python calibrate.py <dir с beats.json и audio.json> (--yaml <outro.yaml> | --hits "0.917,2.752,…" --bpm 130.81)
                      [--tol-ms 33.34] [--bpm-tol 0.1]

Критерий задачи: BPM в пределах ±bpm-tol; каждый удар совпадает с ближайшей сильной долей ИЛИ онсетом бочки
в пределах ±tol-ms (1 кадр при 30 fps). Справочно (в критерий не входят): ближайшая доля сетки и ближайший
онсет «малого» класса (широкополосный удар с шумовым хвостом).
--yaml читает music.hits и music.bpm; файл только читается (гейт 5).
Код выхода: 0 — эталон пройден; 1 — не пройден (таблица печатается в обоих случаях).
"""
import json
import sys
from pathlib import Path


def main():
    args = sys.argv[1:]
    valued = ("--yaml", "--hits", "--bpm", "--tol-ms", "--bpm-tol")

    def opt(name, default=None):
        return args[args.index(name) + 1] if name in args and args.index(name) + 1 < len(args) else default

    pos = [a for i, a in enumerate(args) if not a.startswith("--") and (i == 0 or args[i - 1] not in valued)]
    if len(pos) != 1 or not (opt("--yaml") or (opt("--hits") and opt("--bpm"))):
        print(__doc__, file=sys.stderr)
        sys.exit(1)
    d = Path(pos[0])
    beats = json.loads((d / "beats.json").read_text())
    audio = json.loads((d / "audio.json").read_text())
    if opt("--yaml"):
        import yaml
        music = yaml.safe_load(Path(opt("--yaml")).read_text())["music"]
        hits, bpm_ref = [float(h) for h in music["hits"]], float(music["bpm"])
    else:
        hits, bpm_ref = [float(h) for h in opt("--hits").split(",")], float(opt("--bpm"))
    tol, bpm_tol = float(opt("--tol-ms", "33.34")), float(opt("--bpm-tol", "0.1"))

    def nearest(ts, t):
        return min(ts, key=lambda x: abs(x - t)) if ts else None

    downs = [b["start"] for b in beats["bars"]]
    kicks = [o[0] for o in audio["onsets"]["kick"]]
    snares = [o[0] for o in audio["onsets"]["snare"]]
    ms = lambda v, h: None if v is None else (v - h) * 1000
    cell = lambda v, h: "нет" if v is None else f"{v:.3f} ({ms(v, h):+.1f})"
    print(f"{d}: {beats['bpm']} BPM, tempo {beats['tempo']}, первая сильная доля {beats['firstDownbeat']} с, "
          f"downbeatConfidence {beats['downbeatConfidence']}, отклонение сетки {beats['gridDeviationMs']} мс")
    print("| № | удар, с | сильная доля (Δ мс) | онсет бочки (Δ мс) | критерий ±%.1f мс | доля сетки (Δ мс) | онсет «малого» класса (Δ мс) |" % tol)
    print("|---|---|---|---|---|---|---|")
    failed, grid_bad, snare_bad = 0, 0, 0
    for i, h in enumerate(hits, 1):
        db, k, b, s = nearest(downs, h), nearest(kicks, h), nearest(beats["beats"], h), nearest(snares, h)
        best = min(abs(ms(v, h)) for v in (db, k) if v is not None) if (db is not None or k is not None) else float("inf")
        ok = best <= tol
        failed += not ok
        grid_bad += b is None or abs(ms(b, h)) > tol
        snare_bad += s is None or abs(ms(s, h)) > tol
        print(f"| {i} | {h:.3f} | {cell(db, h)} | {cell(k, h)} | {'да' if ok else 'НЕТ'} | {cell(b, h)} | {cell(s, h)} |")
    bpm_ok = abs(beats["bpm"] - bpm_ref) <= bpm_tol
    n = len(hits)
    print(f"BPM: измерено {beats['bpm']}, эталон {bpm_ref} ± {bpm_tol} → {'да' if bpm_ok else 'НЕТ'} (разница {beats['bpm'] - bpm_ref:+.3f})")
    print(f"удары по критерию (сильная доля или бочка): {n - failed}/{n}; справочно — у доли сетки: {n - grid_bad}/{n}, "
          f"у онсета «малого» класса: {n - snare_bad}/{n}")
    passed = bpm_ok and failed == 0
    print("ЭТАЛОН ПРОЙДЕН" if passed else "ЭТАЛОН НЕ ПРОЙДЕН")
    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    main()
