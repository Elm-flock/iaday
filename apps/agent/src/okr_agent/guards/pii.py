"""Enmascarado reversible de PII (emails, DNI/NIE, telefonos) antes de enviar texto a NVIDIA.

La tabla de reemplazo vive solo en memoria del request.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

_EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
_NIE = re.compile(r"(?<![\w])[XYZxyz][\s.-]?\d{7}[\s.-]?[A-Za-z](?![\w])")
_DNI = re.compile(r"(?<![\w])\d{8}[\s.-]?[A-Za-z](?![\w])")
# Telefonos: +34 / +54, moviles ES (6-9 + 8 digitos) y AR (area + 8 digitos, con 9 movil opcional)
_PHONE_ES = re.compile(r"(?<![\w/.,])(?:\+34[\s.-]?)?[6-9]\d{2}[\s.-]?\d{3}[\s.-]?\d{3}(?![\w%/])")
_PHONE_AR = re.compile(
    r"(?<![\w/.,])(?:\+54[\s.-]?)?(?:9[\s.-]?)?(?:11|[2-3]\d{2,3})[\s.-]?\d{4}[\s.-]?\d{4}(?![\w%/])"
)
_PLACEHOLDER = re.compile(r"\[(?:EMAIL|DNI|TEL)_\d+\]")


@dataclass
class MaskTable:
    mapping: dict[str, str] = field(default_factory=dict)
    counters: dict[str, int] = field(default_factory=dict)

    @property
    def count(self) -> int:
        return len(self.mapping)

    def placeholder_for(self, kind: str, original: str) -> str:
        for ph, value in self.mapping.items():
            if value == original and ph.startswith(f"[{kind}_"):
                return ph
        n = self.counters.get(kind, 0) + 1
        self.counters[kind] = n
        ph = f"[{kind}_{n}]"
        self.mapping[ph] = original
        return ph


def mask(text: str, table: MaskTable) -> str:
    """Reemplaza PII por [EMAIL_n] / [DNI_n] / [TEL_n] usando (y completando) la tabla."""
    out = text
    for kind, pattern in (
        ("EMAIL", _EMAIL),
        ("DNI", _NIE),
        ("DNI", _DNI),
        ("TEL", _PHONE_ES),
        ("TEL", _PHONE_AR),
    ):
        out = pattern.sub(lambda m, k=kind: table.placeholder_for(k, m.group(0)), out)
    return out


def unmask(text: str, table: MaskTable) -> str:
    out = text
    for ph, original in table.mapping.items():
        out = out.replace(ph, original)
    return out


def unmask_obj(obj: Any, table: MaskTable) -> Any:
    """Desenmascara recursivamente strings dentro de dict/list."""
    if isinstance(obj, str):
        return unmask(obj, table)
    if isinstance(obj, list):
        return [unmask_obj(x, table) for x in obj]
    if isinstance(obj, dict):
        return {k: unmask_obj(v, table) for k, v in obj.items()}
    return obj


def placeholders_in(text: str) -> set[str]:
    return set(_PLACEHOLDER.findall(text))
