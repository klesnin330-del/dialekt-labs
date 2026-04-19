import os
import requests
from flask import Flask, Response, render_template, request, jsonify
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

# --- ЛР3: ссылки ---
LAB3_SHEET_EDIT_URL = "https://docs.google.com/spreadsheets/d/1WTbCv4YxW6OyHYZW4f0F1lQkNshqyTQ5Fu4lAGiY-mA/edit?usp=sharing"

# TSV (ВАЖНО: не pubhtml, а pub + output=tsv)
LAB3_SHEET_TSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQhB0NVyBGYG4nzX-H0LB9HOUHDBER3S9LrjCZQtPonNZQImkbNcKcgbKVw7WHFiHLntTK3XGq1lTDX/pub?gid=0&single=true&output=tsv"

# Apps Script endpoint
LAB3_ADD_ENDPOINT = "https://script.google.com/macros/s/AKfycbzCojNe4gKjuy4Zko1ujLqLiC48gbxFDDesBliXVPc-ffqbR0Hqys8W2PiIgu4kBH0/exec"


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

@app.get("/lab3/geocode")
def lab3_geocode():
    """
    Геокодинг через Nominatim (OSM).
    Нужен для вашего старого функционала поиска/подстановки координат.
    """
    q = (request.args.get("q") or request.args.get("query") or "").strip()
    if not q:
        return jsonify({"ok": False, "error": "empty query"}), 400

    # чтобы результаты были ближе к нужному региону
    query = f"{q}, Удмуртия, Россия"

    try:
        r = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": query, "format": "jsonv2", "limit": 1},
            headers={"User-Agent": "lab3-dialect-map/1.0"},
            timeout=20,
        )
        r.raise_for_status()
        data = r.json()
        if not data:
            return jsonify({"ok": False, "error": "not found"}), 404

        item = data[0]
        return jsonify({
            "ok": True,
            "lat": item.get("lat"),
            "lon": item.get("lon"),
            "display_name": item.get("display_name", "")
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

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


@app.route("/lab3")
def lab3():
    return render_template(
        "lab3.html",
        sheet_edit_url=LAB3_SHEET_EDIT_URL,
        sheet_public_url=LAB3_SHEET_TSV_URL,
    )


@app.route("/lab3/data")
def lab3_data():
    r = requests.get(LAB3_SHEET_TSV_URL, timeout=30)
    return Response(
        r.content,
        content_type="text/tab-separated-values; charset=utf-8",
        headers={"Cache-Control": "no-store"},
    )


@app.post("/lab3/append")
def lab3_append():
    """
    Прокси добавления строки через Apps Script (чтобы не было проблем CORS).
    """
    if not LAB3_ADD_ENDPOINT:
        return jsonify({"ok": False, "error": "LAB3_ADD_ENDPOINT is empty"}), 500

    data = request.get_json(force=True, silent=False) or {}
    payload = {"action": "append"}
    payload.update({k: "" if v is None else str(v) for k, v in data.items()})

    try:
        r = requests.post(LAB3_ADD_ENDPOINT, data=payload, timeout=30)
        return Response(
            r.content,
            status=r.status_code,
            content_type=r.headers.get("Content-Type", "text/plain; charset=utf-8"),
            headers={"Cache-Control": "no-store"},
        )
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True)