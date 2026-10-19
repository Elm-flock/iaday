"""Piezas comunes de los subagentes LLM (patron ADK del proyecto).

- include_contents="none": todo el input entra por la instruccion (no hay historial).
- output_schema=<Pydantic>, output_key="<nombre>_result".
- La instruccion es un InstructionProvider (callable): NO pasa por el templating {var} de ADK.
- Los subagentes no usan AgentTool ni herramientas: el agente no escribe nada.
"""

from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.agents.readonly_context import ReadonlyContext
from google.genai import types
from pydantic import BaseModel

from ..models import ModelsConfig
from ..resilient_llm import ResilientLlm
from ..usage import get_run


def render_current_prompt(_ctx: ReadonlyContext) -> str:
    """InstructionProvider: renderiza el prompt que el paso actual dejo en el PipelineRun."""
    run = get_run()
    prompt = run.prompt_for_instruction
    if prompt is None:  # pragma: no cover - bug de integracion
        raise RuntimeError("El paso no definio el prompt a renderizar")
    return prompt.render(**run.vars)


def build_llm_agent(
    *,
    name: str,
    description: str,
    llm: ResilientLlm,
    cfg: ModelsConfig,
    tier: str,
    output_schema: type[BaseModel],
    output_key: str,
) -> LlmAgent:
    return LlmAgent(
        name=name,
        description=description,
        model=llm,
        instruction=render_current_prompt,
        include_contents="none",
        output_schema=output_schema,
        output_key=output_key,
        generate_content_config=types.GenerateContentConfig(
            temperature=cfg.temperature_for(tier),
            max_output_tokens=cfg.tiers[tier].max_tokens,
        ),
    )
