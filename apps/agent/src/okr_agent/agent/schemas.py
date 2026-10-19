"""Schemas Pydantic de las salidas de los LLM (output_schema de los subagentes ADK).

Se usan alias camelCase para que el JSON que produce el modelo tenga los mismos nombres que el contrato.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class _LlmModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")


class ClassifyOut(_LlmModel):
    out_of_scope: bool = False
    injection_suspected: bool = False
    sensitive: bool = False
    reason: str = ""


class SegmentOut(_LlmModel):
    key: str
    text: str


class GlossaryItem(_LlmModel):
    term: str
    explanation: str


class AdaptOut(_LlmModel):
    segments: list[SegmentOut]
    glossary: list[GlossaryItem] = Field(default_factory=list)


class OkrObjectiveOut(_LlmModel):
    title: str
    description: str | None = None
    rationale: str = ""


class OkrKeyResultOut(_LlmModel):
    title: str
    unit: str | None = None
    start_value: str | None = None
    target_value: str | None = None
    rationale: str = ""
    proposed_values: bool = False


class OkrWarningOut(_LlmModel):
    code: Literal[
        "KR_IS_ACTIVITY",
        "KR_NOT_MEASURABLE",
        "OBJECTIVE_IS_METRIC",
        "TOO_MANY_KRS",
        "TOO_FEW_KRS",
    ]
    message: str


class OkrSuggestOut(_LlmModel):
    objective: OkrObjectiveOut
    key_results: list[OkrKeyResultOut] = Field(default_factory=list)
    warnings: list[OkrWarningOut] = Field(default_factory=list)


class CheckinSummaryOut(_LlmModel):
    summary: str
    highlights: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)


class JudgeOut(_LlmModel):
    verdict: Literal["FAITHFUL", "UNFAITHFUL"]
    reasons: list[str] = Field(default_factory=list)


# ----------------------------------------------------------------------------- extension admin


class AdminIntentOut(_LlmModel):
    intent: Literal["ACTION", "QUERY", "HOW_TO", "CLARIFY", "OUT_OF_SCOPE", "SMALL_TALK"]
    injection_suspected: bool = False
    reason: str = ""


class ReplyOut(_LlmModel):
    reply: str


class HelpAnswerOut(_LlmModel):
    answer: str
    citations: list[str] = Field(default_factory=list)
    found: bool = False


class DigestItemOut(_LlmModel):
    fact_key: str
    text: str


class DigestSummaryOut(_LlmModel):
    headline: str
    items: list[DigestItemOut] = Field(default_factory=list)
