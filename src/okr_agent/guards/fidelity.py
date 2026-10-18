"""Preservacion de numeros, fechas, porcentajes, placeholders y mustPreserve."""

from __future__ import annotations

import re
from collections.abc import Iterable

_DATE = re.compile(r"(?<![\w/])(?:\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}(?:/\d{2,4})?)(?![\w/])")
_PERCENT = re.compile(r"(?<![\w.,])\d+(?:[.,]\d+)?\s?%")
_NUMBER = re.compile(r"(?<![A-Za-z\d.,])\d+(?:[.,]\d+)*(?!\d)")
_PLACEHOLDER = re.compile(r"\[(?:EMAIL|DNI|TEL)_\d+\]")
_WS = re.compile(r"\s+")


def _norm_ws(s: str) -> str:
    return _WS.sub(" ", s.replace(" ", " ")).strip().casefold()


def canonical_number(token: str) -> str:
    """'5,5' == '5.5'; '1.000' == '1000'; '5.50' == '5.5'."""
    t = token.strip()
    if re.fullmatch(r"\d{1,3}(?:\.\d{3})+(?:,\d+)?", t):  # separador de miles es ("400.000", "1.234,5")
        t = t.replace(".", "")
    t = t.replace(",", ".")
    if "." in t:
        t = t.rstrip("0").rstrip(".")
    return t


_BIG_PLAIN_NUMBER = re.compile(r"(?<![\w.,/:\-])\d{5,}(?![\w/\-]|[.,]\d)")


def format_thousands(text: str) -> str:
    """400000 -> 400.000 (es-AR/es-ES: punto de miles desde 5 cifras; el valor no cambia).

    Solo numeros sueltos de 5+ cifras: no toca anios/4 cifras (2026, 1500), fechas, decimales ni codigos.
    `canonical_number` los considera iguales, asi que la fidelidad no se ve afectada.
    """
    return _BIG_PLAIN_NUMBER.sub(lambda m: f"{int(m.group(0)):,}".replace(",", "."), text)


def _canonical_percent(token: str) -> str:
    return canonical_number(token.replace("%", "").strip()) + "%"


def extract_tokens(text: str) -> dict[str, dict[str, str]]:
    """Devuelve {'dates','percents','numbers','placeholders'}: canonico -> texto original."""
    dates: dict[str, str] = {}
    percents: dict[str, str] = {}
    numbers: dict[str, str] = {}
    placeholders: dict[str, str] = {}
    rest = text
    for m in _PLACEHOLDER.finditer(rest):
        placeholders[m.group(0)] = m.group(0)
    rest = _PLACEHOLDER.sub(" ", rest)
    for m in _DATE.finditer(rest):
        dates[_norm_ws(m.group(0))] = m.group(0)
    rest = _DATE.sub(" ", rest)
    for m in _PERCENT.finditer(rest):
        percents[_canonical_percent(m.group(0))] = m.group(0)
    rest = _PERCENT.sub(" ", rest)
    for m in _NUMBER.finditer(rest):
        numbers[canonical_number(m.group(0))] = m.group(0)
    return {"dates": dates, "percents": percents, "numbers": numbers, "placeholders": placeholders}


def _present(token: str, output_text: str, out_tokens: dict[str, dict[str, str]]) -> bool:
    """mustPreserve literal: busca el token (con variante de separador decimal)."""
    if re.fullmatch(r"\s*\d+(?:[.,]\d+)*\s*", token):  # numero puro: comparar canonico, no subcadena
        canon = canonical_number(token)
        return canon in out_tokens["numbers"] or canon + "%" in out_tokens["percents"]
    out_norm = _norm_ws(output_text)
    cand = {_norm_ws(token), _norm_ws(token.replace(",", ".")), _norm_ws(token.replace(".", ","))}
    if any(c and c in out_norm for c in cand):
        return True
    # numero con unidad ("5,5 h"): alcanza con que el numero canonico este y la unidad aparezca
    m = re.fullmatch(r"\s*(\d+(?:[.,]\d+)?)\s*(\S.*)?", token)
    if m and m.group(2):
        number_ok = canonical_number(m.group(1)) in out_tokens["numbers"]
        unit_ok = _norm_ws(m.group(2)) in out_norm
        return number_ok and unit_ok
    return False


def check_preservation(source_text: str, output_text: str, must_preserve: Iterable[str] = ()) -> list[str]:
    """Tokens del origen (numeros, fechas, %, placeholders, mustPreserve) ausentes en la salida."""
    src = extract_tokens(source_text)
    out = extract_tokens(output_text)
    missing: list[str] = []

    def add(tok: str) -> None:
        if tok not in missing:
            missing.append(tok)

    for key in ("placeholders", "dates", "percents", "numbers"):
        for canon, original in src[key].items():
            if canon not in out[key]:
                add(original.strip())
    for token in must_preserve:
        if token and not _present(token, output_text, out):
            add(token)
    return missing


def check_required(required: Iterable[str], output_text: str) -> list[str]:
    """Valores requeridos (p. ej. meta y valor actual de un KR) ausentes en la salida."""
    out = extract_tokens(output_text)
    missing: list[str] = []
    for token in required:
        if token and not _present(token, output_text, out) and token not in missing:
            missing.append(token)
    return missing


def invented_dates(source_text: str, output_text: str) -> list[str]:
    """Fechas presentes en la salida que no existen en el origen (para resumenes)."""
    src = extract_tokens(source_text)["dates"]
    out = extract_tokens(output_text)["dates"]
    return [orig for canon, orig in out.items() if canon not in src]
