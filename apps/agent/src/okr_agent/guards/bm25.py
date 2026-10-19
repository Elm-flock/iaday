"""BM25-lite sobre los fragmentos de manual que envia NestJS (pocos: <= 6).

Nest ya hizo el top-k; aca se usa para (1) ordenar los fragmentos en el prompt y (2) cortar SIN llamar al LLM cuando
ningun fragmento comparte un solo termino con la pregunta (no hay fuente que la respalde -> se rehusa).
Tokenizacion es: minusculas, sin tildes, sin stopwords, stemming de sufijos livianos.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from collections.abc import Sequence

from ..agent.admin.text import normalize

_WORD = re.compile(r"[a-z0-9ñ]+")
STOPWORDS = frozenset(
    """a al algo ante ahi aca asi aun aunque bajo cada como con contra cual cuando de del desde donde dos el ella
    ellos en entre era eres es esa ese eso esta estan este esto esta fue ha hace hacer hago han hay la las le les lo
    los me mi mis mucho muy ni no nos nosotros o otra otro para pero poco por porque que quien quiero se ser si
    sin sobre su sus te tengo tiene todo tu tus un una uno unos unas y ya yo puedo podes puede quiero queres
    necesito como cuales cuanto cuantos""".split()
)
_SUFFIXES = (
    "aciones",
    "acion",
    "amientos",
    "amiento",
    "adores",
    "ador",
    "ables",
    "able",
    "mente",
    "ando",
    "iendo",
    "ados",
    "adas",
    "ado",
    "ada",
    "ar",
    "er",
    "ir",
    "es",
    "s",
)


def stem(word: str) -> str:
    for suf in _SUFFIXES:
        if word.endswith(suf) and len(word) - len(suf) >= 3:
            return word[: -len(suf)]
    return word


def tokenize(text: str) -> list[str]:
    return [stem(w) for w in _WORD.findall(normalize(text)) if len(w) >= 2 and w not in STOPWORDS]


def rank(
    question: str, docs: Sequence[tuple[str, str, str]], k1: float = 1.2, b: float = 0.75
) -> list[tuple[float, str]]:
    """docs = (id, title, text). Devuelve [(score, id)] ordenado desc; el titulo pesa x2."""
    q_terms = set(tokenize(question))
    tokenized = {doc_id: tokenize(title) * 2 + tokenize(text) for doc_id, title, text in docs}
    n_docs = len(tokenized) or 1
    avg_len = sum(len(t) for t in tokenized.values()) / n_docs or 1.0
    df = Counter(term for toks in tokenized.values() for term in set(toks))
    scores: list[tuple[float, str]] = []
    for doc_id, toks in tokenized.items():
        tf = Counter(toks)
        score = 0.0
        for term in q_terms:
            if term not in tf:
                continue
            idf = math.log(1 + (n_docs - df[term] + 0.5) / (df[term] + 0.5))
            freq = tf[term]
            score += idf * (freq * (k1 + 1)) / (freq + k1 * (1 - b + b * len(toks) / avg_len))
        scores.append((score, doc_id))
    return sorted(scores, key=lambda s: (-s[0], s[1]))


def has_support(question: str, docs: Sequence[tuple[str, str, str]]) -> bool:
    """True si al menos un fragmento comparte un termino (con peso) con la pregunta."""
    ranked = rank(question, docs)
    return bool(ranked) and ranked[0][0] > 0
