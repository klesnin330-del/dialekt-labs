import os
import requests

from flask import Flask, Response, jsonify, render_template, request
from werkzeug.utils import secure_filename

from services.speech_to_text import transcribe_audio
from services.phonetic_transcription import (
    text_to_phonetic_cyr,
    phonetic_cyr_to_latin,
)

app = Flask(__name__)

UPLOAD_FOLDER = "uploads"
RESULTS_FOLDER = "results"
ALLOWED_EXTENSIONS = {"wav", "mp3", "m4a", "ogg", "flac"}

app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["RESULTS_FOLDER"] = RESULTS_FOLDER

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(RESULTS_FOLDER, exist_ok=True)

# --- ЛР3: ссылки на таблицу (TSV) ---
LAB3_SHEET_TSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQhB0NVyBGYG4nzX-H0LB9HOUHDBER3S9LrjCZQtPonNZQImkbNcKcgbKVw7WHFiHLntTK3XGq1lTDX/pub?gid=0&single=true&output=tsv"
LAB3_SHEET_EDIT_URL = ""


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


# -------------------------
# ЛР1
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
                phon_cyr = text_to_phonetic_cyr(orthographic_text)
                phon_lat = phonetic_cyr_to_latin(phon_cyr)

                result = {
                    "filename": filename,
                    "orthographic_text": orthographic_text,
                    "phonetic_cyr": phon_cyr,
                    "phonetic_lat": phon_lat,
                }
            except Exception as e:
                error = f"Ошибка обработки файла: {str(e)}"
        else:
            error = "Недопустимый формат файла. Разрешены: wav, mp3, m4a, ogg, flac."

    return render_template("index.html", result=result, error=error)


# -------------------------
# ЛР3: карта
# -------------------------
@app.route("/lab3")
def lab3():
    return render_template(
        "lab3.html",
        sheet_edit_url=LAB3_SHEET_EDIT_URL,
        sheet_public_url=LAB3_SHEET_TSV_URL,
    )


@app.route("/lab3/data")
def lab3_data():
    # TSV через сервер: CORS + кодировка
    r = requests.get(LAB3_SHEET_TSV_URL, timeout=30)
    return Response(
        r.content,
        content_type="text/tab-separated-values; charset=utf-8",
        headers={"Cache-Control": "no-store"}
    )


# --- Геокодирование через сервер (чтобы было стабильно и без CORS) ---
_GEOCODE_CACHE = {}

@app.route("/lab3/geocode")
def lab3_geocode():
    q = (request.args.get("q") or "").strip()
    if not q:
        return jsonify(ok=False, error="missing q"), 400

    if q in _GEOCODE_CACHE:
        return jsonify(ok=True, **_GEOCODE_CACHE[q])

    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "format": "json",
        "limit": 1,
        "countrycodes": "ru",
        "q": q
    }
    headers = {
        "User-Agent": "DialectLab-Lab3/1.0 (educational project)"
    }

    try:
        r = requests.get(url, params=params, headers=headers, timeout=20)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        return jsonify(ok=False, error=f"geocode request failed: {str(e)}"), 502

    if not data:
        return jsonify(ok=False, error="not found"), 404

    lat = float(data[0]["lat"])
    lon = float(data[0]["lon"])
    display_name = data[0].get("display_name", "")

    res = {"lat": lat, "lon": lon, "display_name": display_name}
    _GEOCODE_CACHE[q] = res
    return jsonify(ok=True, **res)


if __name__ == "__main__":
    app.run(debug=True)