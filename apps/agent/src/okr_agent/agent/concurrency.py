"""Limitador de concurrencia hacia NVIDIA: semaforo con espera maxima (5 s -> RATE_LIMITED)."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from ..api.errors import rate_limited

DEFAULT_WAIT_S = 5.0


class ConcurrencyLimiter:
    def __init__(self, max_concurrency: int, wait_timeout_s: float = DEFAULT_WAIT_S):
        self._sem = asyncio.Semaphore(max_concurrency)
        self.max_concurrency = max_concurrency
        self.wait_timeout_s = wait_timeout_s

    @asynccontextmanager
    async def slot(self):
        try:
            await asyncio.wait_for(self._sem.acquire(), timeout=self.wait_timeout_s)
        except TimeoutError:
            raise rate_limited(retry_after=10) from None
        try:
            yield
        finally:
            self._sem.release()
