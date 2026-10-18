"""Paso 2 (GenerateStep): corre el generador de la feature con REPAIR ante salida invalida."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import override

from google.adk.agents import BaseAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event

from ...api.errors import output_invalid
from ..subagents.generate import FEATURES, GENERATE_KEY
from ..usage import get_run
from .common import InvalidOutput, structured_call


class GenerateStepAgent(BaseAgent):
    @override
    async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        run = get_run()
        spec = run.spec
        schema, _ = FEATURES[run.feature]
        masked = run.masked
        try:
            out = await structured_call(
                self.sub_agents[0],
                ctx,
                key=GENERATE_KEY,
                schema=schema,
                step="GENERATE",
                prompt=run.prompts.get(spec.generate_prompt_id(masked)),
                variables=spec.generate_vars(masked),
                check=lambda o: spec.check_schema(masked, o),
            )
        except InvalidOutput:
            raise output_invalid("GENERATE") from None
        run.generated = spec.normalize(masked, out)
        return
        yield  # pragma: no cover
