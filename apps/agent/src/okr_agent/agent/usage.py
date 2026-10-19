"""Registro de uso: una entrada por CADA intento de llamada a un LLM (exito o error)."""

from __future__ import annotations

import time
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from .models import ModelsConfig, estimate_cost_usd

if TYPE_CHECKING:
    from ..guards.pii import MaskTable
    from ..prompts.loader import Prompt


@dataclass
class StepContext:
    step: str  # CLASSIFY | GENERATE | REPAIR | JUDGE | REGENERATE
    prompt_id: str
    prompt_version: str
    prompt_hash: str


class UsageCollector:
    def __init__(self, cfg: ModelsConfig):
        self._cfg = cfg
        self.steps: list[dict] = []
        self._attempts: dict[str, int] = {}
        self.last_text: str = ""  # ultima salida cruda de un LLM (para el paso REPAIR)

    def next_attempt(self, step: str) -> int:
        n = self._attempts.get(step, 0) + 1
        self._attempts[step] = n
        return n

    def record(
        self,
        ctx: StepContext,
        *,
        attempt: int,
        model: str,
        is_fallback: bool,
        input_tokens: int,
        output_tokens: int,
        latency_ms: int,
        status: str,
        error_code: str | None,
    ) -> None:
        self.steps.append(
            {
                "step": ctx.step,
                "attempt": attempt,
                "model": model,
                "isFallback": is_fallback,
                "promptId": ctx.prompt_id,
                "promptVersion": ctx.prompt_version,
                "promptHash": ctx.prompt_hash,
                "inputTokens": input_tokens,
                "outputTokens": output_tokens,
                "latencyMs": latency_ms,
                "costUsdEst": estimate_cost_usd(self._cfg, model, input_tokens, output_tokens),
                "status": status,
                "errorCode": error_code,
            }
        )

    def mark_last_failed(self, step: str, error_code: str) -> None:
        """La salida del intento llego pero no parseo/valido: el intento cuenta como FAILED."""
        for entry in reversed(self.steps):
            if entry["step"] == step and entry["status"] == "OK":
                entry["status"] = "FAILED"
                entry["errorCode"] = error_code
                return

    def snapshot(self) -> list[dict]:
        return [dict(s) for s in self.steps]


@dataclass
class PipelineRun:
    """Estado mutable de UN pedido. Vive en un ContextVar; los agentes ADK lo leen de ahi."""

    feature: str  # adapt | okr_suggest | checkin_summary | admin_chat | admin_digest | help_answer
    request: Any  # modelo Pydantic del pedido
    trace_id: str
    collector: UsageCollector
    deadline: float  # time.monotonic() absoluto
    prompts: Any  # PromptStore
    cfg: ModelsConfig
    pii: MaskTable | None = None
    jargon: tuple[str, ...] = ()  # terminos de config/jargon.yaml
    step_ctx: StepContext | None = None
    vars: dict[str, Any] = field(default_factory=dict)  # variables de render por prompt
    prompt_for_instruction: Prompt | None = None
    spec: Any = None  # FeatureSpec
    masked: Any = None  # pedido con PII enmascarada
    # resultados intermedios
    sensitive: bool = False
    generated: Any = None
    outcome: dict[str, Any] | None = None  # lo arma VerifyStep
    # estado de un paso (p. ej. acciones propuestas por el planner en modo tools)
    scratch: dict[str, Any] = field(default_factory=dict)

    def remaining(self) -> float:
        return self.deadline - time.monotonic()


current_run: ContextVar[PipelineRun | None] = ContextVar("current_run", default=None)


def get_run() -> PipelineRun:
    run = current_run.get()
    if run is None:  # pragma: no cover - bug de integracion
        raise RuntimeError("No hay un PipelineRun activo")
    return run
