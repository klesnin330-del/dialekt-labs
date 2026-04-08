import asyncio
import os
import uuid
import edge_tts


def synthesize_to_mp3(text: str, out_dir: str, voice: str = "ru-RU-DmitryNeural", rate: str = "+0%") -> str:
    """
    Генерирует mp3 с помощью edge-tts.
    Возвращает имя файла (без пути), сохранённого в out_dir.
    Требуется интернет.
    """
    if not text or not text.strip():
        raise ValueError("Пустой текст для синтеза речи.")

    os.makedirs(out_dir, exist_ok=True)

    filename = f"{uuid.uuid4().hex}.mp3"
    out_path = os.path.join(out_dir, filename)

    async def _run():
        communicate = edge_tts.Communicate(text=text, voice=voice, rate=rate)
        await communicate.save(out_path)

    # Запуск async-кода из синхронного Flask
    asyncio.run(_run())

    return filename