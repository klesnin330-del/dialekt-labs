import re


def _simple_phonetic_word_cyr(word: str) -> str:
    w = word.lower()

    replacements = {
        "ё": "йо",
        "е": "йэ",
        "ю": "йу",
        "я": "йа",
    }
    for old, new in replacements.items():
        w = w.replace(old, new)

    return w


def text_to_phonetic_cyr(text: str) -> str:
    """
    Упрощённая "транскрипция" в кириллице:
    - ё->йо, е->йэ, ю->йу, я->йа
    Это учебная функция (чтобы всегда работало автоматически).
    """
    tokens = re.findall(r"[а-яА-ЯёЁ\-]+|[.,!?;:]", text)
    out = []
    for t in tokens:
        if re.match(r"[а-яА-ЯёЁ\-]+", t):
            out.append(_simple_phonetic_word_cyr(t))
        else:
            out.append(t)
    return " ".join(out)


_LAT_MAP = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d",
    "е": "e", "ё": "yo", "ж": "zh", "з": "z", "и": "i",
    "й": "y", "к": "k", "л": "l", "м": "m", "н": "n",
    "о": "o", "п": "p", "р": "r", "с": "s", "т": "t",
    "у": "u", "ф": "f", "х": "kh", "ц": "ts", "ч": "ch",
    "ш": "sh", "щ": "shch", "ъ": "", "ы": "y", "ь": "",
    "э": "e", "ю": "yu", "я": "ya",
    "-": "-",
}


def phonetic_cyr_to_latin(text: str) -> str:
    """
    Транслитерация кириллицы -> латиница (упрощённо, без диакритики).
    Подходит для "латиницы ниже" в отчёте/демонстрации.
    """
    res = []
    for ch in text.lower():
        if ch in _LAT_MAP:
            res.append(_LAT_MAP[ch])
        else:
            res.append(ch)
    return "".join(res)