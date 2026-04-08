import asyncio
import os
import re
import subprocess
import tempfile
import uuid

try:
    import edge_tts
except Exception:
    edge_tts = None


def _parse_rate_percent(rate: str) -> int:
    """
    "+10%" -> 10, "-10%" -> -10, "+0%" -> 0
    """
    m = re.match(r"^\s*([+-]?\d+)\s*%\s*$", rate or "")
    return int(m.group(1)) if m else 0


def _synthesize_edge_tts(text: str, out_dir: str, voice: str, rate: str) -> str:
    if edge_tts is None:
        raise RuntimeError("edge-tts is not available in this environment")

    os.makedirs(out_dir, exist_ok=True)
    filename = f"{uuid.uuid4().hex}.mp3"
    out_path = os.path.join(out_dir, filename)

    async def _run():
        communicate = edge_tts.Communicate(text=text, voice=voice, rate=rate)
        await communicate.save(out_path)

    asyncio.run(_run())
    return filename


def _synthesize_espeak(text: str, out_dir: str, rate: str) -> str:
    """
    Оффлайн TTS через espeak-ng -> wav -> mp3 (через ffmpeg).
    Работает стабильно на хостинге, не требует внешних API.
    """
    os.makedirs(out_dir, exist_ok=True)
    filename = f"{uuid.uuid4().hex}.mp3"
    mp3_path = os.path.join(out_dir, filename)

    # скорость espeak: примерно 80..250, базово 150
    p = _parse_rate_percent(rate)
    speed = int(150 * (1 + p / 100))
    speed = max(80, min(250, speed))

    wav_tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name

    try:
        # 1) espeak-ng -> wav
        subprocess.run(
            ["espeak-ng", "-v", "ru", "-s", str(speed), "-w", wav_tmp, text],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        # 2) wav -> mp3
        subprocess.run(
            ["ffmpeg", "-y", "-i", wav_tmp, "-codec:a", "libmp3lame", "-qscale:a", "4", mp3_path],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        return filename
    finally:
        try:
            os.remove(wav_tmp)
        except OSError:
            pass


def synthesize_to_mp3(text: str, out_dir: str, voice: str = "ru-RU-DmitryNeural", rate: str = "+0%") -> str:
    """
    TTS_ENGINE:
      - edge   (как было, красиво, но может быть заблокирован => 403)
      - espeak (оффлайн, стабильный)
    По умолчанию: если edge падает, пробуем espeak.
    """
    if not text or not text.strip():
        raise ValueError("Пустой текст для синтеза речи.")

    engine = (os.getenv("TTS_ENGINE") or "edge").strip().lower()

    # 1) Пробуем edge-tts (если выбран или по умолчанию)
    if engine == "edge":
        try:
            return _synthesize_edge_tts(text=text, out_dir=out_dir, voice=voice, rate=rate)
        except Exception:
            # fallback на espeak (чтобы работало "железно")
            return _synthesize_espeak(text=text, out_dir=out_dir, rate=rate)

    # 2) Явно espeak
    if engine == "espeak":
        return _synthesize_espeak(text=text, out_dir=out_dir, rate=rate)

    raise ValueError(f"Unknown TTS_ENGINE: {engine}")