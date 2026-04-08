FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    wget \
    unzip \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN python -m pip install --upgrade pip && pip install -r requirements.txt

# Скачиваем маленькую русскую модель Vosk на этапе сборки (это делает Render, не твой ПК)
RUN mkdir -p /app/models \
    && cd /app/models \
    && wget --tries=5 --timeout=30 --waitretry=5 -O vosk.zip https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip \
    && unzip vosk.zip \
    && rm vosk.zip

ENV STT_ENGINE=vosk
ENV VOSK_MODEL_PATH=/app/models/vosk-model-small-ru-0.22

COPY . .

EXPOSE 10000

CMD ["sh", "-c", "gunicorn app:app --bind 0.0.0.0:${PORT:-10000} --workers 1 --threads 1 --timeout 300 --max-requests 50 --max-requests-jitter 10"]