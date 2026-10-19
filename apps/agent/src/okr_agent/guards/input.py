"""Validacion determinista de entrada (largos y vacios). No llama a ningun LLM."""

from __future__ import annotations

from collections.abc import Sequence

MAX_SEGMENT_CHARS = 4000
MAX_TOTAL_CHARS = 12000


class InputRejected(Exception):
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


def validate_texts(texts: Sequence[str]) -> None:
    """Lanza InputRejected(EMPTY | TOO_LONG)."""
    if not any(t and t.strip() for t in texts):
        raise InputRejected("EMPTY")
    if any(len(t) > MAX_SEGMENT_CHARS for t in texts):
        raise InputRejected("TOO_LONG")
    if sum(len(t) for t in texts) > MAX_TOTAL_CHARS:
        raise InputRejected("TOO_LONG")
