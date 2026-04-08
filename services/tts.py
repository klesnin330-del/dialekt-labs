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


def _map_voice_to_espeak_variant(voice: str) -> str:
    """
    Мапим выбор из UI в варианты espeak-ng.
    В espeak-ng можно задавать variant через +m/+f.
    """
    voice = (voice or "").lower()
    if "svetlana" in voice:
        return "ru+f3"   # более "женский" тембр
    return "ru+m3"       # более "мужской" тембр


def _synthesize_espeak(text: str, out_dir: str, voice: str, rate: str) -> str:
    os.makedirs(out_dir, exist_ok=True)
    filename = f"{uuid.uuid4().hex}.mp3"
    mp3_path = os.path.join(out_dir, filename)

    # скорость espeak: примерно 80..250, базово 150
    p = _parse_rate_percent(rate)
    speed = int(150 * (1 + p / 100))
    speed = max(80, min(250, speed))

    wav_tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
    espeak_voice = _map_voice_to_espeak_variant(voice)

    try:
        # 1) espeak-ng -> wav
        subprocess.run(
            ["espeak-ng", "-v", espeak_voice, "-s", str(speed), "-a", "200", "-w", wav_tmp, text],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        # 2) wav -> mp3 (делаем нормальный mp3 без “рваности”)
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", wav_tmp,
                "-ar", "44100",
                "-ac", "1",
                "-codec:a", "libmp3lame",
                "-b:a", "128k",
                mp3_path,
            ],
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
    if not text or not text.strip():
        raise ValueError("Пустой текст для синтеза речи.")

    engine = (os.getenv("TTS_ENGINE") or "edge").strip().lower()

    if engine == "edge":
        # красивый вариант (обычно работает локально)
        return _synthesize_edge_tts(text=text, out_dir=out_dir, voice=voice, rate=rate)

    if engine == "espeak":
        # стабильный вариант для хостинга
        return _synthesize_espeak(text=text, out_dir=out_dir, voice=voice, rate=rate)

    # fallback: если не поняли — используем espeak
    return _synthesize_espeak(text=text, out_dir=out_dir, voice=voice, rate=rate)