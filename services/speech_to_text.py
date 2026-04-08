import os
from faster_whisper import WhisperModel

_model = None

def _get_model():
    global _model
    if _model is None:
        model_name = os.getenv("WHISPER_MODEL", "tiny")
        compute_type = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
        _model = WhisperModel(model_name, device="cpu", compute_type=compute_type)
    return _model

def transcribe_audio(filepath: str) -> str:
    model = _get_model()
    segments, info = model.transcribe(
        filepath,
        language="ru",
        beam_size=1,
        vad_filter=True
    )
    return "".join(seg.text for seg in segments).strip()
