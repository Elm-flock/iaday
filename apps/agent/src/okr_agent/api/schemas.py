"""Schemas del contrato HTTP v1 (docs/ai/agent-contract.md en el monorepo). camelCase en JSON."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from pydantic.alias_generators import to_camel

CONTRACT_VERSION = "1"

# PLAN / ANSWER / SUMMARIZE: solo los emiten los endpoints de la extension admin (agent-contract-admin.md 2.1)
Step = Literal["CLASSIFY", "GENERATE", "REPAIR", "JUDGE", "REGENERATE", "PLAN", "ANSWER", "SUMMARIZE"]
InfleszBand = Literal["MUY_DIFICIL", "ALGO_DIFICIL", "NORMAL", "BASTANTE_FACIL", "MUY_FACIL"]
ReviewReason = Literal["VERIFICATION_FAILED", "SENSITIVE_CONTENT", "READABILITY_BELOW_MIN"]


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")


class StrictCamelModel(BaseModel):
    """Para respuestas: extra=forbid asegura que no se desvien de la forma del contrato."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


# ----------------------------------------------------------------------------- requests

MustPreserveItem = Annotated[str, StringConstraints(max_length=64)]


class SegmentIn(CamelModel):
    key: str = Field(max_length=64, pattern=r"^[a-z0-9_.]+$")
    # Largo del texto (1-4000 / total 12000) lo valida el guard de entrada -> 422 INPUT_REJECTED
    text: str


class AdaptRequest(CamelModel):
    level: Literal["EASY_READ", "PLAIN"]
    entity_type: Literal["OBJECTIVE", "CHECK_IN", "FEEDBACK"]
    locale: Literal["es"] = "es"
    segments: list[SegmentIn] = Field(min_length=1, max_length=30)
    must_preserve: list[MustPreserveItem] = Field(default_factory=list, max_length=50)


class ObjectiveIn(CamelModel):
    title: str = Field(min_length=1, max_length=300)
    description: str | None = Field(default=None, max_length=2000)
    type: Literal["COMMITTED", "ASPIRATIONAL"]


class KeyResultDraftIn(CamelModel):
    title: str = Field(min_length=1, max_length=300)
    unit: str | None = None
    start_value: str | None = None
    target_value: str | None = None


class OkrSuggestRequest(CamelModel):
    cycle_kind: Literal["ANNUAL", "QUARTER"]
    objective: ObjectiveIn
    key_results: list[KeyResultDraftIn] = Field(default_factory=list, max_length=5)


class KeyResultIn(CamelModel):
    title: str = Field(max_length=300)
    scoring: Literal["DERIVED", "MANUAL"]
    unit: str | None = None
    start_value: str | None = None
    target_value: str | None = None
    current_value: str | None = None


class CheckInIn(CamelModel):
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    value: str | None = None
    score: float = Field(ge=0, le=1)
    band: Literal["RED", "YELLOW", "GREEN"]
    action: Literal["CONTINUE", "UPDATE", "START", "STOP"]
    note: str | None = Field(default=None, max_length=2000)


class CheckinSummaryRequest(CamelModel):
    level: Literal["STANDARD", "PLAIN"]
    key_result: KeyResultIn
    check_ins: list[CheckInIn] = Field(min_length=1, max_length=52)


# ----------------------------------------------------------------------------- common types


class UsageStep(StrictCamelModel):
    step: Step
    attempt: int = Field(ge=1)
    model: str
    is_fallback: bool
    prompt_id: str
    prompt_version: str
    prompt_hash: str
    input_tokens: int = Field(ge=0)
    output_tokens: int = Field(ge=0)
    latency_ms: int = Field(ge=0)
    cost_usd_est: float = Field(ge=0)
    status: Literal["OK", "FAILED"]
    error_code: str | None


class ReadabilityMetrics(StrictCamelModel):
    fernandez_huerta: float
    szigriszt_pazos: float
    inflesz_band: InfleszBand
    words: int
    sentences: int
    avg_sentence_length: float
    max_sentence_length: int
    unexplained_acronyms: list[str]


class JudgeCheck(StrictCamelModel):
    verdict: Literal["FAITHFUL", "UNFAITHFUL", "SKIPPED"]
    reasons: list[str]


class Checks(StrictCamelModel):
    pii_masked: int
    sensitive_content: bool
    numbers_preserved: bool
    missing_tokens: list[str]
    judge: JudgeCheck
    regenerated: bool


class PromptRef(StrictCamelModel):
    id: str
    version: str
    hash: str


class GlossaryEntry(StrictCamelModel):
    term: str
    explanation: str


class SegmentOutModel(StrictCamelModel):
    key: str
    text: str


# ----------------------------------------------------------------------------- responses


class AdaptResult(StrictCamelModel):
    level: Literal["EASY_READ", "PLAIN"]
    segments: list[SegmentOutModel]
    glossary: list[GlossaryEntry] = Field(max_length=15)


class AdaptReadability(StrictCamelModel):
    source: ReadabilityMetrics
    output: ReadabilityMetrics


class OutputReadability(StrictCamelModel):
    output: ReadabilityMetrics


class _BaseResponse(StrictCamelModel):
    trace_id: str
    needs_human_review: bool
    review_reason: ReviewReason | None
    checks: Checks
    prompt: PromptRef
    usage: list[UsageStep]


class AdaptResponse(_BaseResponse):
    result: AdaptResult
    readability: AdaptReadability


class OkrObjective(StrictCamelModel):
    title: str = Field(max_length=300)
    description: str | None
    rationale: str


class OkrKeyResult(StrictCamelModel):
    title: str
    unit: str | None
    start_value: str | None
    target_value: str | None
    rationale: str
    proposed_values: bool


class OkrWarning(StrictCamelModel):
    code: Literal["KR_IS_ACTIVITY", "KR_NOT_MEASURABLE", "OBJECTIVE_IS_METRIC", "TOO_MANY_KRS", "TOO_FEW_KRS"]
    message: str


class OkrSuggestResult(StrictCamelModel):
    objective: OkrObjective
    key_results: list[OkrKeyResult] = Field(max_length=5)
    warnings: list[OkrWarning]


class OkrSuggestResponse(_BaseResponse):
    result: OkrSuggestResult
    readability: OutputReadability


class CheckinSummaryResult(StrictCamelModel):
    summary: str = Field(max_length=1200)
    trend: Literal["IMPROVING", "STABLE", "DECLINING", "INSUFFICIENT_DATA"]
    highlights: list[str] = Field(max_length=5)
    risks: list[str] = Field(max_length=5)


class CheckinSummaryResponse(_BaseResponse):
    result: CheckinSummaryResult
    readability: OutputReadability


class ModelPair(StrictCamelModel):
    model: str
    fallback: str


class PromptInfo(StrictCamelModel):
    id: str
    version: str
    hash: str


class HealthResponse(StrictCamelModel):
    status: Literal["ok", "degraded"]
    contract_version: str
    version: str
    models: dict[str, ModelPair]
    prompts: list[PromptInfo]
    api_key_configured: bool


class ErrorBody(StrictCamelModel):
    code: Literal[
        "UNAUTHORIZED",
        "INVALID_REQUEST",
        "INPUT_REJECTED",
        "OUTPUT_INVALID",
        "MODEL_UNAVAILABLE",
        "RATE_LIMITED",
        "INTERNAL",
    ]
    message: str
    retryable: bool
    details: dict


class ErrorResponse(StrictCamelModel):
    trace_id: str | None
    error: ErrorBody
    usage: list[UsageStep]
