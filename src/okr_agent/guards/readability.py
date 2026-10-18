"""Legibilidad en espanol: silabeo, Fernandez-Huerta, Szigriszt-Pazos, banda INFLESZ, siglas."""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence

_WORD = re.compile(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+")
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?…])\s+|\n+")
_ACRONYM = re.compile(r"(?<![\w])(?:[A-ZÁÉÍÓÚÑ]{2,}\d*|[A-Z]\d+)(?![\w])")

_STRONG = set("aeoáéóAEOÁÉÓ")
_WEAK_PLAIN = set("iuüIUÜ")
_WEAK_ACCENT = set("íúÍÚ")
_VOWELS = _STRONG | _WEAK_PLAIN | _WEAK_ACCENT


def count_syllables(word: str) -> int:
    """Silabeo aproximado del espanol (diptongos, hiatos con tilde, 'qu'/'gu' mudas)."""
    if not word:
        return 0
    w = re.sub(r"(?i)([qg])u(?=[eiéí])", r"\1", word)  # 'u' muda en que/qui/gue/gui
    syllables = 0
    i = 0
    n = len(w)
    while i < n:
        if w[i] not in _VOWELS:
            i += 1
            continue
        j = i
        while j < n and w[j] in _VOWELS:
            j += 1
        syllables += _group_syllables(w[i:j])
        i = j
    return max(syllables, 1)


def _group_syllables(group: str) -> int:
    count = 1
    for a, b in zip(group, group[1:], strict=False):
        a_strong = a in _STRONG or a in _WEAK_ACCENT
        b_strong = b in _STRONG or b in _WEAK_ACCENT
        if a_strong and b_strong:
            count += 1  # hiato: dos fuertes (la debil tildada cuenta como fuerte)
    return count


def band_for(szigriszt_pazos: float) -> str:
    if szigriszt_pazos < 40:
        return "MUY_DIFICIL"
    if szigriszt_pazos < 55:
        return "ALGO_DIFICIL"
    if szigriszt_pazos < 65:
        return "NORMAL"
    if szigriszt_pazos <= 80:
        return "BASTANTE_FACIL"
    return "MUY_FACIL"


def concat_text(parts: Iterable[str]) -> str:
    """Une segmentos cerrando cada uno con punto si no termina en puntuacion."""
    out: list[str] = []
    for p in parts:
        t = p.strip()
        if not t:
            continue
        if t[-1] not in ".!?…:;":
            t += "."
        out.append(t)
    return " ".join(out)


def _split_sentences(text: str) -> list[str]:
    return [s for s in (x.strip() for x in _SENTENCE_SPLIT.split(text)) if s and _WORD.search(s)]


def find_acronyms(text: str, glossary_terms: Sequence[str] = ()) -> list[str]:
    """Siglas (2+ mayusculas) sin explicacion entre parentesis ni en el glosario."""
    glossary = {t.strip().casefold() for t in glossary_terms}
    found: list[str] = []
    for m in _ACRONYM.finditer(text):
        sigla = m.group(0)
        if sigla in found or sigla.casefold() in glossary:
            continue
        before = text[: m.start()].rstrip()
        after = text[m.end() :].lstrip()
        explained = after.startswith("(") or (before.endswith("(") and after.startswith(")"))
        if not explained:
            found.append(sigla)
    return found


def long_words(text: str, min_syllables: int = 4, limit: int = 8) -> list[str]:
    """Palabras largas (>= min_syllables silabas) sin repetir, ordenadas de mayor a menor silabeo.

    Sirven de pista concreta al regenerar: lo que mas baja Szigriszt-Pazos son las palabras largas.
    """
    seen: dict[str, int] = {}
    for w in _WORD.findall(text):
        n = count_syllables(w)
        if n >= min_syllables and w.casefold() not in {k.casefold() for k in seen}:
            seen[w] = n
    return sorted(seen, key=lambda k: -seen[k])[:limit]


def compute_metrics(text: str, glossary_terms: Sequence[str] = ()) -> dict:
    """Devuelve el dict `ReadabilityMetrics` del contrato (camelCase)."""
    sentences = _split_sentences(text)
    words = _WORD.findall(text)
    n_words = len(words)
    n_sent = len(sentences)
    if n_words == 0 or n_sent == 0:
        return {
            "fernandezHuerta": 0.0,
            "szigrisztPazos": 0.0,
            "infleszBand": "MUY_DIFICIL",
            "words": n_words,
            "sentences": n_sent,
            "avgSentenceLength": 0.0,
            "maxSentenceLength": 0,
            "unexplainedAcronyms": find_acronyms(text, glossary_terms),
        }
    n_syl = sum(count_syllables(w) for w in words)
    syl_per_word = n_syl / n_words
    words_per_sent = n_words / n_sent
    sp = 206.835 - 62.3 * syl_per_word - words_per_sent
    fh = 206.84 - 60.0 * syl_per_word - 1.02 * words_per_sent
    sent_lengths = [len(_WORD.findall(s)) for s in sentences]
    return {
        "fernandezHuerta": round(fh, 1),
        "szigrisztPazos": round(sp, 1),
        "infleszBand": band_for(sp),
        "words": n_words,
        "sentences": n_sent,
        "avgSentenceLength": round(words_per_sent, 1),
        "maxSentenceLength": max(sent_lengths),
        "unexplainedAcronyms": find_acronyms(text, glossary_terms),
    }
