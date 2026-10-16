#!/usr/bin/env python3
# Распознавание с таймингами слов для voice/align.mjs (задача 007): движки fasterwhisper и whisperx.
# Запуск только из align.mjs: $ASR_PYTHON voice/asr_py.py <engine> <lang> <model> <out.json> <wav16k>...
# Модель грузится один раз на пакет. Вывод: { "<wav>": { "words": [{text,start,end}], "transcript": "…" } }.
#   fasterwhisper — faster-whisper (MIT), word_timestamps=True (тайминги из cross-attention Whisper);
#   whisperx      — WhisperX (BSD-2): тот же транскрипт faster-whisper + принудительное выравнивание wav2vec2 (CTC)
#                   моделью языка из whisperx.alignment (для uk — модель по умолчанию WhisperX).
# Устройство — CPU, int8 (Mac: CUDA нет). Детерминизм: temperature=0, beam_size=5.
import json
import sys


def load16k(path):
    # 16 кГц моно s16 (готовит align.mjs через ffmpeg) → float32. Свой декодер: faster-whisper 1.2.1 зовёт
    # av.open(metadata_errors=…), которого нет в установленном PyAV — декодирование через av падает.
    import wave

    import numpy as np

    with wave.open(path, "rb") as w:
        if w.getframerate() != 16000 or w.getnchannels() != 1 or w.getsampwidth() != 2:
            raise SystemExit(f"{path}: ожидается 16 кГц моно 16 бит")
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0


def fw_words(segments):
    out = []
    for s in segments:
        for w in s.words or []:
            out.append({"text": w.word.strip(), "start": float(w.start), "end": float(w.end)})
    return out


def main():
    engine, lang, model_name, out_path, *wavs = sys.argv[1:]
    result = {}
    if engine == "fasterwhisper":
        from faster_whisper import WhisperModel

        model = WhisperModel(model_name, device="cpu", compute_type="int8")
        for wav in wavs:
            segs, _info = model.transcribe(load16k(wav), language=lang, word_timestamps=True, beam_size=5, temperature=0.0, vad_filter=False)
            segs = list(segs)
            result[wav] = {"words": fw_words(segs), "transcript": " ".join(s.text.strip() for s in segs)}
    elif engine == "whisperx":
        import whisperx

        model = whisperx.load_model(model_name, device="cpu", compute_type="int8", language=lang, asr_options={"beam_size": 5, "temperatures": [0.0]})
        align_model, meta = whisperx.load_align_model(language_code=lang, device="cpu")
        for wav in wavs:
            audio = whisperx.load_audio(wav)
            tr = model.transcribe(audio, batch_size=4, language=lang)
            al = whisperx.align(tr["segments"], align_model, meta, audio, device="cpu", return_char_alignments=False)
            words = []
            for w in al.get("word_segments", []):
                # слово без тайминга (не выровнено wav2vec2: цифры, символы) — оставляем без времени, align.mjs интерполирует
                words.append({"text": w["word"].strip(), "start": w.get("start"), "end": w.get("end")})
            result[wav] = {"words": words, "transcript": " ".join(s["text"].strip() for s in tr["segments"]), "alignModel": meta.get("language")}
        result["_meta"] = {"alignModelName": getattr(align_model, "name_or_path", None) or str(type(align_model).__name__)}
    else:
        raise SystemExit(f"неизвестный движок {engine}")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)


if __name__ == "__main__":
    main()
