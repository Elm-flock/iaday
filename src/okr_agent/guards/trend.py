"""Tendencia determinista de un KR a partir de los scores de sus check-ins."""

from __future__ import annotations

from collections.abc import Sequence

THRESHOLD = 0.05
WINDOW = 4


def _slope(values: Sequence[float]) -> float:
    n = len(values)
    mean_x = (n - 1) / 2
    mean_y = sum(values) / n
    num = sum((i - mean_x) * (v - mean_y) for i, v in enumerate(values))
    den = sum((i - mean_x) ** 2 for i in range(n))
    return num / den if den else 0.0


def compute_trend(scores: Sequence[float]) -> str:
    """Pendiente (por check-in) de los ultimos 4 scores: > +0.05 mejora, < -0.05 empeora."""
    if len(scores) < 2:
        return "INSUFFICIENT_DATA"
    slope = _slope(list(scores)[-WINDOW:])
    if slope > THRESHOLD:
        return "IMPROVING"
    if slope < -THRESHOLD:
        return "DECLINING"
    return "STABLE"
