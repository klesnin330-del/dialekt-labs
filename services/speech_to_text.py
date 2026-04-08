import whisper


model = whisper.load_model("base")


def transcribe_audio(filepath):
    result = model.transcribe(filepath, language="ru")
    text = result.get("text", "").strip()
    return text