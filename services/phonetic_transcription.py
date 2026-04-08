import re


def simple_phonetic_word(word):
    word = word.lower()

    replacements = {
        "ё": "йо",
        "е": "йэ",
        "ю": "йу",
        "я": "йа",
        "ч": "ч",
        "щ": "щ",
        "ж": "ж",
        "ш": "ш",
        "ц": "ц",
    }

    for old, new in replacements.items():
        word = word.replace(old, new)

    return word


def text_to_phonetic(text):
    words = re.findall(r"[а-яА-ЯёЁ\-]+|[.,!?;:]", text)

    result = []
    for token in words:
        if re.match(r"[а-яА-ЯёЁ\-]+", token):
            result.append(simple_phonetic_word(token))
        else:
            result.append(token)

    return " ".join(result)

def apply_simple_dialect_rules(text: str) -> str:
    """
    Очень упрощённая имитация "диалектной" записи через орфографические замены.
    Это не научная модель диалекта, а демонстрационный модуль для ЛР2.
    """
    t = text.lower()

    rules = {
        "что": "што",
        "чтобы": "штобы",
        "конечно": "канешно",
        "его": "ево",
        "сегодня": "севодня",
        "теперь": "теперя",
    }

    for a, b in rules.items():
        t = t.replace(a, b)

    return t


def phonetic_to_pronounceable_text(phonetic_text: str) -> str:
    """
    Берём нашу "транскрипцию" из ЛР1 (где ё->йо, е->йэ, я->йа, ю->йу)
    и оставляем её как 'произносимую' запись для TTS.
    """
    return phonetic_text.strip()