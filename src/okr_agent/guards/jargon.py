"""Jerga y anglicismos sin explicar (adapt EASY_READ / PLAIN).

Un texto "en lenguaje claro" que conserva "pipeline", "churn" o "tasa de cierre" sin explicarlos NO es claro.
`find_acronyms` solo ve SIGLAS EN MAYUSCULAS; este guard cubre el resto con una lista configurable
(`config/jargon.yaml`, extensible sin tocar codigo).

Decision: NO hay heuristica de "palabra que parece inglesa" (sh/ck/-ing/k/w...): en espanol rioplatense
aparecen "show", "marketing"... pero tambien nombres propios y marcas; los falsos positivos disparan
regeneraciones y revisiones humanas innecesarias. Solo lista curada.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable, Sequence
from functools import lru_cache
from pathlib import Path

import yaml

_WS = re.compile(r"\s+")


def _norm(text: str) -> str:
    """casefold + sin tildes + espacios colapsados ('Tasa  de Conversión' -> 'tasa de conversion')."""
    decomposed = unicodedata.normalize("NFD", text.casefold())
    plain = "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
    return _WS.sub(" ", plain).strip()


def _pattern(term: str) -> re.Pattern[str]:
    """Frase completa, palabra entera, plural opcional (s/es) en la ultima palabra."""
    words = [re.escape(w) for w in _norm(term).split(" ")]
    body = r"\s+".join(words)
    return re.compile(rf"(?<![a-z0-9]){body}(?:e?s)?(?![a-z0-9])")


@lru_cache(maxsize=8)
def _compiled(terms: tuple[str, ...]) -> tuple[tuple[str, re.Pattern[str]], ...]:
    return tuple((t, _pattern(t)) for t in terms)


def load_jargon(path: Path) -> tuple[str, ...]:
    """Lee `terms:` de config/jargon.yaml. Archivo ausente o invalido -> ValueError (falla al arrancar)."""
    try:
        raw = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
    except (OSError, yaml.YAMLError) as exc:
        raise ValueError(f"No se pudo leer {path}: {exc}") from exc
    terms = raw.get("terms")
    if not isinstance(terms, list) or not all(isinstance(t, str) and t.strip() for t in terms):
        raise ValueError(f"{path}: 'terms' debe ser una lista de textos no vacios")
    seen: dict[str, str] = {}
    for t in terms:
        seen.setdefault(_norm(t), t.strip())
    return tuple(seen.values())


def unexplained_jargon(
    text: str,
    glossary_terms: Sequence[str] = (),
    source_text: str = "",
    terms: Iterable[str] = (),
) -> list[str]:
    """Terminos de `terms` presentes en `text` que NO estan explicados.

    Explicado = aparece en algun termino del glosario (ignora mayusculas/tildes/plural; el glosario puede
    decir "pipeline de ventas") o va seguido de un parentesis explicativo. Un termino que esta solo en
    `source_text` y no en `text` NO se marca. Los terminos que ya estaban en el origen van primero.
    """
    norm_text = _norm(text)
    norm_glossary = [_norm(g) for g in glossary_terms if g and g.strip()]
    norm_source = _norm(source_text)
    found: list[str] = []
    for term, pat in _compiled(tuple(terms)):
        match = pat.search(norm_text)
        if not match:
            continue
        if any(pat.search(g) for g in norm_glossary):
            continue
        if norm_text[match.end() :].lstrip().startswith("("):
            continue
        found.append(term)
    found.sort(key=lambda t: 0 if _in_source(t, norm_source) else 1)
    return found


def _in_source(term: str, norm_source: str) -> bool:
    return bool(norm_source) and bool(_pattern(term).search(norm_source))
