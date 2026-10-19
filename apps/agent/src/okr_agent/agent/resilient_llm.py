"""ResilientLlm: BaseLlm de ADK que envuelve a LiteLlm con timeout, 1 reintento con backoff y fallback.

Cada intento (exitoso o no) queda registrado como UsageStep en el UsageCollector del pedido.
El modelo de ADK ve un unico `generate_content_async`; toda la resiliencia es transparente.
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
from collections.abc import AsyncGenerator, Callable
from typing import Any

from google.adk.models import BaseLlm, LlmCapabilities, LlmRequest, LlmResponse
from pydantic import PrivateAttr

from ..api.errors import AgentError, model_unavailable, rate_limited
from .concurrency import ConcurrencyLimiter
from .usage import get_run

logger = logging.getLogger("okr_agent.llm")

TIMEOUT = "TIMEOUT"
UPSTREAM_ERROR = "UPSTREAM_ERROR"
UPSTREAM_RATE_LIMITED = "UPSTREAM_RATE_LIMITED"

_THINK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
_FENCE = re.compile(r"^```[a-zA-Z0-9_-]*\s*\n?(.*?)\n?```\s*$", re.DOTALL)


def classify_exception(exc: BaseException) -> str:
    """Mapea errores de litellm/httpx/asyncio a los errorCode del contrato."""
    name = type(exc).__name__.lower()
    if isinstance(exc, TimeoutError | asyncio.TimeoutError) or "timeout" in name:
        return TIMEOUT
    status = getattr(exc, "status_code", None)
    if status == 429 or "ratelimit" in name:
        return UPSTREAM_RATE_LIMITED
    return UPSTREAM_ERROR


def extract_json_text(text: str) -> str:
    """Limpia ruido tipico de modelos: <think>, bloques ```json y prosa alrededor del objeto JSON."""
    t = _THINK.sub("", text).strip()
    fenced = _FENCE.match(t)
    if fenced:
        t = fenced.group(1).strip()
    if t and t[0] not in "{[":
        start, end = t.find("{"), t.rfind("}")
        if start != -1 and end > start:
            t = t[start : end + 1]
        elif start == -1 and t.endswith("}") and '":' in t:
            # diffusiongemma a veces omite la llave inicial: `outOfScope": false, ...}` -> se restituye
            t = "{" + t if t.startswith('"') else '{"' + t
    return t


def _response_text(resp: LlmResponse) -> str:
    if not resp.content or not resp.content.parts:
        return ""
    return "".join(p.text for p in resp.content.parts if p.text and not p.thought)


def _has_content(resp: LlmResponse) -> bool:
    """Texto util O una llamada a herramienta (el planner en modo tools responde solo con function_call)."""
    if _response_text(resp).strip():
        return True
    return bool(resp.content and resp.content.parts and any(p.function_call for p in resp.content.parts))


def _clean_response(resp: LlmResponse) -> LlmResponse:
    if not resp.content or not resp.content.parts:
        return resp
    parts = []
    for part in resp.content.parts:
        if part.text and not part.thought:
            part = part.model_copy(update={"text": extract_json_text(part.text)})
        parts.append(part)
    return resp.model_copy(update={"content": resp.content.model_copy(update={"parts": parts})})


class ResilientLlm(BaseLlm):
    """`model` = ID de NIM del primario (sin prefijo litellm). `fallback_model` = ID del fallback."""

    fallback_model: str | None = None
    tier: str = ""
    timeout_s: float = 20.0
    max_retries: int = 1
    backoff_s: float = 1.5

    _factory: Callable[[str], BaseLlm] | None = PrivateAttr(default=None)
    _limiter: ConcurrencyLimiter | None = PrivateAttr(default=None)
    _primary: BaseLlm | None = PrivateAttr(default=None)
    _fallback: BaseLlm | None = PrivateAttr(default=None)

    def __init__(self, *, llm_factory: Callable[[str], BaseLlm], limiter: ConcurrencyLimiter, **data: Any):
        super().__init__(**data)
        self._factory = llm_factory
        self._limiter = limiter
        self._primary = llm_factory(self.model)
        self._fallback = llm_factory(self.fallback_model) if self.fallback_model else None

    @property
    def capabilities(self) -> LlmCapabilities:
        return LlmCapabilities(output_schema_and_tools=False)

    @classmethod
    def supported_models(cls) -> list[str]:
        return []

    def _plan(self) -> list[tuple[BaseLlm, str, bool]]:
        assert self._primary is not None
        plan: list[tuple[BaseLlm, str, bool]] = [(self._primary, self.model, False)] * (
            1 + max(self.max_retries, 0)
        )
        if self._fallback is not None and self.fallback_model:
            plan.append((self._fallback, self.fallback_model, True))
        return plan

    @staticmethod
    async def _drain(llm: BaseLlm, request: LlmRequest) -> list[LlmResponse]:
        req = request.model_copy(update={"model": llm.model})
        return [r async for r in llm.generate_content_async(req, stream=False)]

    async def generate_content_async(  # type: ignore[override]
        self, llm_request: LlmRequest, stream: bool = False
    ) -> AsyncGenerator[LlmResponse, None]:
        run = get_run()
        ctx = run.step_ctx
        assert ctx is not None and self._limiter is not None
        collector = run.collector
        last_code: str = UPSTREAM_ERROR
        plan = self._plan()

        for index, (llm, effective_model, is_fallback) in enumerate(plan):
            if index > 0 and not is_fallback and self.backoff_s > 0:
                await asyncio.sleep(min(self.backoff_s, max(run.remaining(), 0)))
            remaining = run.remaining()
            if remaining <= 0:
                raise model_unavailable(ctx.step, "Se agotó el tiempo total del pedido.")

            started = time.monotonic()
            responses: list[LlmResponse] | None = None
            code: str | None = None
            async with self._limiter.slot():
                attempt = collector.next_attempt(ctx.step)
                try:
                    responses = await asyncio.wait_for(
                        self._drain(llm, llm_request), timeout=min(self.timeout_s, remaining)
                    )
                except AgentError:
                    raise
                except Exception as exc:  # noqa: BLE001 - se clasifica y se registra
                    code = classify_exception(exc)
                    logger.warning(
                        "LLM %s intento %s fallo: %s (%s)",
                        effective_model,
                        attempt,
                        code,
                        type(exc).__name__,
                    )
            latency_ms = int((time.monotonic() - started) * 1000)

            if responses is not None:
                final = next((r for r in reversed(responses) if not r.partial), None)
                usage = next((r.usage_metadata for r in reversed(responses) if r.usage_metadata), None)
                in_tok = int(getattr(usage, "prompt_token_count", 0) or 0)
                out_tok = int(getattr(usage, "candidates_token_count", 0) or 0)
                if final is None or final.error_code or not _has_content(final):
                    code = UPSTREAM_ERROR
                else:
                    collector.record(
                        ctx,
                        attempt=attempt,
                        model=effective_model,
                        is_fallback=is_fallback,
                        input_tokens=in_tok,
                        output_tokens=out_tok,
                        latency_ms=latency_ms,
                        status="OK",
                        error_code=None,
                    )
                    cleaned = _clean_response(final)
                    collector.last_text = _response_text(cleaned)
                    yield cleaned
                    return
                collector.record(
                    ctx,
                    attempt=attempt,
                    model=effective_model,
                    is_fallback=is_fallback,
                    input_tokens=in_tok,
                    output_tokens=out_tok,
                    latency_ms=latency_ms,
                    status="FAILED",
                    error_code=code,
                )
            else:
                collector.record(
                    ctx,
                    attempt=attempt,
                    model=effective_model,
                    is_fallback=is_fallback,
                    input_tokens=0,
                    output_tokens=0,
                    latency_ms=latency_ms,
                    status="FAILED",
                    error_code=code,
                )
            last_code = code or UPSTREAM_ERROR

        if last_code == UPSTREAM_RATE_LIMITED:
            raise rate_limited(retry_after=10)
        raise model_unavailable(ctx.step)
