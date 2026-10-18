"""Ejecucion estructurada de un subagente LLM: parseo con Pydantic + un unico paso REPAIR."""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any, TypeVar

from google.adk.agents import LlmAgent
from google.adk.agents.invocation_context import InvocationContext
from pydantic import BaseModel, ValidationError

from ...prompts.loader import Prompt
from ..usage import PipelineRun, StepContext, get_run

T = TypeVar("T", bound=BaseModel)


class InvalidOutput(Exception):
    """La salida no parseo / no valido ni despues del REPAIR."""

    def __init__(self, code: str, detail: str):
        super().__init__(f"{code}: {detail}")
        self.code = code
        self.detail = detail


def _error_code(exc: Exception) -> str:
    if isinstance(exc, ValidationError):
        if any(e.get("type") == "json_invalid" for e in exc.errors()):
            return "INVALID_JSON"
        return "SCHEMA_MISMATCH"
    if isinstance(exc, json.JSONDecodeError):
        return "INVALID_JSON"
    return "SCHEMA_MISMATCH"


def _repair_note(error: str, previous: str) -> str:
    return (
        "\n\nCORRECCIÓN NECESARIA: tu respuesta anterior no cumplió el formato pedido.\n"
        f"Problema: {error[:600]}\n"
        f"Respuesta anterior (truncada):\n<<<\n{previous[:1500]}\n>>>\n"
        "Devolvé SOLO el JSON corregido, con la forma exacta indicada arriba."
    )


def regen_note(problems: list[str]) -> str:
    joined = "\n- ".join(problems)
    return (
        "\n\nCORRECCIÓN NECESARIA: tu versión anterior fue rechazada por estos motivos:\n"
        f"- {joined}\n"
        "Generá una nueva versión que los corrija, respetando todas las reglas anteriores. "
        "Al simplificar palabras NO elimines ni reemplaces ningún número, porcentaje, fecha o unidad "
        "del original "
        '(por ejemplo "el 100 %" no puede pasar a "todo").'
    )


async def _consume(agent: LlmAgent, ctx: InvocationContext, key: str) -> Any:
    """Corre el subagente y devuelve lo que dejo en state_delta[key] (None si nada)."""
    result: Any = None
    async for event in agent.run_async(ctx):
        delta = event.actions.state_delta if event.actions else None
        if delta and key in delta:
            result = delta[key]
    return result


def set_step(run: PipelineRun, step: str, prompt: Prompt, variables: dict[str, Any]) -> None:
    run.step_ctx = StepContext(step, prompt.id, prompt.version, prompt.hash)
    run.prompt_for_instruction = prompt
    run.vars = variables


async def structured_call(
    agent: LlmAgent,
    ctx: InvocationContext,
    *,
    key: str,
    schema: type[T],
    step: str,
    prompt: Prompt,
    variables: dict[str, Any],
    check: Callable[[T], None] | None = None,
    note: str = "",
) -> T:
    """Llama al subagente; si la salida es invalida hace UN reintento REPAIR con el error.

    Lanza AgentError (modelo caido / rate limit) o InvalidOutput (despues del REPAIR).
    """
    run = get_run()
    step_label = step
    correction = note
    for round_ in (1, 2):
        set_step(run, step_label, prompt, {**variables, "correction_note": correction})
        run.collector.last_text = ""
        try:
            raw = await _consume(agent, ctx, key)
            if raw is None:
                raise ValueError("el modelo no devolvió contenido")
            obj = schema.model_validate(raw)
            if check is not None:
                check(obj)
            return obj
        except (ValidationError, ValueError) as exc:
            code = _error_code(exc)
            run.collector.mark_last_failed(step_label, code)
            if round_ == 2:
                raise InvalidOutput(code, str(exc)) from exc
            previous = run.collector.last_text
            correction = note + _repair_note(str(exc), previous)
            step_label = "REPAIR"
    raise AssertionError("unreachable")  # pragma: no cover
