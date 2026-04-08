import os

from flask import Flask, render_template, request, send_from_directory
from werkzeug.utils import secure_filename

from services.speech_to_text import transcribe_audio
from services.phonetic_transcription import (
    text_to_phonetic,
    apply_simple_dialect_rules,
    phonetic_to_pronounceable_text,
)
from services.tts import synthesize_to_mp3

app = Flask(__name__)

UPLOAD_FOLDER = "uploads"
RESULTS_FOLDER = "results"      # сейчас не обязателен, но оставим
GENERATED_FOLDER = "generated"  # сюда ЛР2 будет сохранять mp3

ALLOWED_EXTENSIONS = {"wav", "mp3", "m4a", "ogg", "flac"}

app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["RESULTS_FOLDER"] = RESULTS_FOLDER
app.config["GENERATED_FOLDER"] = GENERATED_FOLDER


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


# -------------------------
# ЛР1: Транскрипция (аудио -> текст + транскрипция)
# -------------------------
@app.route("/", methods=["GET", "POST"])
def index():
    result = None
    error = None

    if request.method == "POST":
        if "audio_file" not in request.files:
            error = "Файл не был отправлен."
            return render_template("index.html", result=result, error=error)

        file = request.files["audio_file"]

        if file.filename == "":
            error = "Выберите аудиофайл."
            return render_template("index.html", result=result, error=error)

        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
            file.save(filepath)

            try:
                orthographic_text = transcribe_audio(filepath)
                phonetic_text = text_to_phonetic(orthographic_text)

                result = {
                    "filename": filename,
                    "orthographic_text": orthographic_text,
                    "phonetic_text": phonetic_text,
                }
            except Exception as e:
                error = f"Ошибка обработки файла: {str(e)}"
        else:
            error = "Недопустимый формат файла. Разрешены: wav, mp3, m4a, ogg, flac."

    return render_template("index.html", result=result, error=error)


# -------------------------
# Раздача сгенерированных mp3 (ЛР2)
# -------------------------
@app.route("/generated/<path:filename>")
def generated_file(filename):
    return send_from_directory(app.config["GENERATED_FOLDER"], filename)


# -------------------------
# ЛР2: Генерация речи (текст/транскрипция -> mp3)
# -------------------------
@app.route("/lab2", methods=["GET", "POST"])
def lab2():
    error = None
    result = None

    # значения по умолчанию для формы
    voice = request.form.get("voice", "ru-RU-DmitryNeural")
    rate = request.form.get("rate", "+0%")
    input_mode = request.form.get("input_mode", "orth")  # orth | phon
    dialect = request.form.get("dialect") == "1"
    form_text = request.form.get("text", "")

    if request.method == "POST":
        try:
            text = (form_text or "").strip()
            if not text:
                raise ValueError("Введите текст.")

            # готовим текст для синтеза речи
            if input_mode == "orth":
                tts_text = apply_simple_dialect_rules(text) if dialect else text
            else:
                # режим "транскрипция"
                tts_text = phonetic_to_pronounceable_text(text)

            filename = synthesize_to_mp3(
                text=tts_text,
                out_dir=app.config["GENERATED_FOLDER"],
                voice=voice,
                rate=rate,
            )

            result = {
                "tts_text": tts_text,
                "audio_url": f"/generated/{filename}",
            }

        except Exception as e:
            error = str(e)

    return render_template(
        "lab2.html",
        error=error,
        result=result,
        voice=voice,
        rate=rate,
        form_text=form_text,
        dialect=dialect,
    )


if __name__ == "__main__":
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    os.makedirs(RESULTS_FOLDER, exist_ok=True)
    os.makedirs(GENERATED_FOLDER, exist_ok=True)

    app.run(debug=True)