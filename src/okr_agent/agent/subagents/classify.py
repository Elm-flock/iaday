"""Subagente CLASSIFY: guard de entrada (alcance, inyeccion, contenido sensible)."""

from __future__ import annotations

from google.adk.agents import LlmAgent

from ..models import ModelsConfig
from ..resilient_llm import ResilientLlm
from ..schemas import ClassifyOut
from .common import build_llm_agent

CLASSIFY_KEY = "classify_result"


def build_classify_agent(llm: ResilientLlm, cfg: ModelsConfig) -> LlmAgent:
    return build_llm_agent(
        name="classify",
        description=(
            "Handles input safety classification of OKR, check-in and feedback text. "
            "Use for: detecting out-of-scope text, prompt injection and sensitive content before "
            "generation. Don't use for: rewriting, summarizing or judging text."
        ),
        llm=llm,
        cfg=cfg,
        tier="classify",
        output_schema=ClassifyOut,
        output_key=CLASSIFY_KEY,
    )
