"""Paso 1 (InputGuard): validacion determinista, enmascarado de PII y clasificador LLM (fail-closed)."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import override

from google.adk.agents import BaseAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event

from ...api.errors import input_rejected, model_unavailable
from ...guards.input import InputRejected, validate_texts
from ...guards.pii import MaskTable
from ..schemas import ClassifyOut
from ..subagents.classify import CLASSIFY_KEY
from ..usage import get_run
from .common import InvalidOutput, structured_call


class InputGuardAgent(BaseAgent):
    """Custom agent. Si rechaza, lanza AgentError(INPUT_REJECTED) y el SequentialAgent se corta
    (los pasos siguientes no corren y nunca se llama al generador)."""

    @override
    async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        run = get_run()
        spec = run.spec

        try:
            validate_texts(spec.texts(run.request))
        except InputRejected as exc:
            raise input_rejected(exc.reason) from None

        run.pii = MaskTable()
        run.masked = spec.mask(run.request, run.pii)

        classify = self.sub_agents[0]
        try:
            out = await structured_call(
                classify,
                ctx,
                key=CLASSIFY_KEY,
                schema=ClassifyOut,
                step="CLASSIFY",
                prompt=run.prompts.get("classify"),
                variables={
                    "feature": run.feature,
                    "entity_type": getattr(run.masked, "entity_type", "-"),
                    "text": spec.classify_text(run.masked),
                },
            )
        except InvalidOutput:
            # Fail-closed: sin guard no se genera.
            raise model_unavailable(
                "CLASSIFY", "El clasificador de entrada no respondió con un formato válido."
            ) from None

        if out.injection_suspected:
            raise input_rejected("INJECTION_SUSPECTED")
        if out.out_of_scope:
            raise input_rejected("OUT_OF_SCOPE")
        run.sensitive = out.sensitive
        return
        yield  # pragma: no cover - convierte el metodo en async generator
