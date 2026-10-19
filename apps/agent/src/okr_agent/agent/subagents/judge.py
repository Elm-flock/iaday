"""Subagente JUDGE: LLM-as-judge de otra familia de modelos que el generador."""

from __future__ import annotations

from google.adk.agents import LlmAgent

from ..models import ModelsConfig
from ..resilient_llm import ResilientLlm
from ..schemas import JudgeOut
from .common import build_llm_agent

JUDGE_KEY = "judge_result"


def build_judge_agent(llm: ResilientLlm, cfg: ModelsConfig) -> LlmAgent:
    return build_llm_agent(
        name="judge",
        description=(
            "Handles faithfulness review of generated text against its source. "
            "Use for: deciding if an adapted, suggested or summarized text keeps the meaning and "
            "invents nothing. Don't use for: generating or rewriting text."
        ),
        llm=llm,
        cfg=cfg,
        tier="judge",
        output_schema=JudgeOut,
        output_key=JUDGE_KEY,
    )
