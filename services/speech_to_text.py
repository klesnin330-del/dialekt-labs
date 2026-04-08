import json
import os
import subprocess
import tempfile
import wave

# --- Faster-Whisper (локальный вариант) ---
_fw_model = None

def _fw_get_model():
    global _fw_model
    if _fw_model is None:
        from faster_whisper import WhisperModel
        model_name = os.getenv("WHISPER_MODEL", "tiny")
        compute_type = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
        _fw_model = WhisperModel(model_name, device="cpu", compute_type=compute_type)
    return _fw_model

def _transcribe_faster_whisper(filepath: str) -> str:
    model = _fw_get_model()
    segments, info = model.transcribe(
        filepath,
        language="ru",
        beam_size=1,
        vad_filter=True,
    )
    return "".join(seg.text for seg in segments).strip()


# --- Vosk (хостинг-стабильный вариант) ---
_vosk_model = None

def _vosk_get_model():
    global _vosk_model
    if _vosk_model is None:
        from vosk import Model
        model_path = os.getenv("VOSK_MODEL_PATH", os.path.join("models", "vosk-model-small-ru-0.22"))
        if not os.path.isdir(model_path):
            raise FileNotFoundError(f"Vosk model not found at: {model_path}")
        _vosk_model = Model(model_path)
    return _vosk_model

def _convert_to_wav16k_mono(src_path: str) -> str:
    out_path = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
    cmd = [
        "ffmpeg", "-y",
        "-i", src_path,
        "-ar", "16000",
        "-ac", "1",
        "-f", "wav",
        out_path,
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return out_path

def _transcribe_vosk(filepath: str) -> str:
    from vosk import KaldiRecognizer

    wav_path = _convert_to_wav16k_mono(filepath)
    try:
        wf = wave.open(wav_path, "rb")
        rec = KaldiRecognizer(_vosk_get_model(), wf.getframerate())
        rec.SetWords(False)

        parts = []
        while True:
            data = wf.readframes(4000)
            if len(data) == 0:
                break
            if rec.AcceptWaveform(data):
                parts.append(json.loads(rec.Result()).get("text", ""))

        parts.append(json.loads(rec.FinalResult()).get("text", ""))
        wf.close()

        return " ".join(p for p in parts if p).strip()
    finally:
        try:
            os.remove(wav_path)
        except OSError:
            pass


def transcribe_audio(filepath: str) -> str:
    """
    STT_ENGINE:
      - vosk
      - fasterwhisper
      - auto (по умолчанию): если есть модель Vosk -> Vosk, иначе faster-whisper
    """
    engine = os.getenv("STT_ENGINE", "auto").lower().strip()

    if engine == "vosk":
        return _transcribe_vosk(filepath)

    if engine in ("fasterwhisper", "faster-whisper", "whisper"):
        return _transcribe_faster_whisper(filepath)

    # auto:
    model_path = os.getenv("VOSK_MODEL_PATH", os.path.join("models", "vosk-model-small-ru-0.22"))
    if os.path.isdir(model_path):
        return _transcribe_vosk(filepath)
    return _transcribe_faster_whisper(filepath)