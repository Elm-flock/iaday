"""Subagentes GENERATE / REGENERATE por feature (adapt, okr_suggest, checkin_summary).

Son dos instancias separadas por feature porque un agente ADK solo puede tener un padre y
cada paso (GENERATE vs REGENERATE) escribe en su propia output_key.
"""

from __future__ import annotations

from google.adk.agents import LlmAgent
from pydantic import BaseModel

from ..models import ModelsConfig
from ..resilient_llm import ResilientLlm
from ..schemas import AdaptOut, CheckinSummaryOut, OkrSuggestOut
from .common import build_llm_agent

GENERATE_KEY = "generate_result"
REGENERATE_KEY = "regenerate_result"

FEATURES: dict[str, tuple[type[BaseModel], str]] = {
    "adapt": (
        AdaptOut,
        "Handles rewriting of OKR, check-in and feedback text into easy-read or plain Spanish. "
        "Use for: adapting segments keeping every number, date and key. "
        "Don't use for: suggesting OKRs, summarizing check-in history or judging output.",
    ),
    "okr_suggest": (
        OkrSuggestOut,
        "Handles drafting a better wording of an objective and its key results. "
        "Use for: suggesting measurable KRs without changing existing start/target values. "
        "Don't use for: adapting text readability or summarizing check-ins.",
    ),
    "checkin_summary": (
        CheckinSummaryOut,
        "Handles summarizing the check-in history of one key result. "
        "Use for: a short factual summary of progress, highlights and risks. "
        "Don't use for: evaluating people, adapting text or suggesting OKRs.",
    ),
}


def build_generate_agent(
    feature: str, llm: ResilientLlm, cfg: ModelsConfig, *, regenerate: bool = False, tier: str = "generate"
) -> LlmAgent:
    schema, description = FEATURES[feature]
    prefix = "regenerate" if regenerate else "generate"
    return build_llm_agent(
        name=f"{prefix}_{feature}",
        description=description,
        llm=llm,
        cfg=cfg,
        tier=tier,
        output_schema=schema,
        output_key=REGENERATE_KEY if regenerate else GENERATE_KEY,
    )
