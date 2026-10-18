"""Schemas HTTP de la extension admin (docs/ai/agent-contract-admin.md, v1). camelCase en JSON.

Pedidos: validan forma, handles y duplicados (INVALID_REQUEST). Los largos de texto de la persona (1-2000) NO se
validan aca: los rechaza el guard de entrada con 422 INPUT_REJECTED (EMPTY | TOO_LONG), como pide el contrato.
Respuestas: `extra="forbid"` (un campo de mas o de menos rompe el test de contrato).
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field, StringConstraints, field_validator, model_validator

from ..agent.admin.plan_models import (
    HANDLE_KINDS,
    HANDLE_PATTERN,
    ISO_DATE_PATTERN,
    Handle,
    Plan,
    PlanIssue,
    ReadQuery,
)
from .schemas import CamelModel, PromptRef, StrictCamelModel, UsageStep

# ----------------------------------------------------------------------------- catalogo (3.4)

Role = Literal["ADMIN", "LEADER", "MEMBER"]


class CatalogUser(CamelModel):
    handle: Handle
    name: str = Field(max_length=200)
    role: Role
    active: bool
    teams: list[Handle] = Field(default_factory=list)


class CatalogTeam(CamelModel):
    handle: Handle
    name: str = Field(max_length=200)
    parent: Handle | None = None
    leads: list[Handle] = Field(default_factory=list)
    member_count: int = Field(default=0, ge=0)


class CatalogCycle(CamelModel):
    handle: Handle
    name: str = Field(max_length=200)
    kind: Literal["ANNUAL", "QUARTER"]
    status: Literal["DRAFT", "ACTIVE", "CLOSED"]
    parent: Handle | None = None
    start_date: Annotated[str, Field(pattern=ISO_DATE_PATTERN)]
    end_date: Annotated[str, Field(pattern=ISO_DATE_PATTERN)]


class CatalogObjective(CamelModel):
    handle: Handle
    title: str = Field(max_length=400)
    cycle: Handle
    owner_user: Handle | None = None
    owner_team: Handle | None = None
    status: Literal["DRAFT", "PUBLISHED"]
    kr_count: int = Field(default=0, ge=0)


class CatalogKeyResult(CamelModel):
    handle: Handle
    objective: Handle
    title: str = Field(max_length=400)
    owner: Handle


class CatalogAdaptationRequest(CamelModel):
    """v1.1 (modulo adaptation-requests): se acepta pero el agente v1 no propone acciones sobre ellas."""

    handle: Handle
    status: str
    entity_kind: str = ""
    preferred_format: str = ""
    due_date: str = ""
    assignee: Handle | None = None


class Catalog(CamelModel):
    users: list[CatalogUser] = Field(default_factory=list, max_length=500)
    teams: list[CatalogTeam] = Field(default_factory=list, max_length=200)
    cycles: list[CatalogCycle] = Field(default_factory=list, max_length=50)
    objectives: list[CatalogObjective] = Field(default_factory=list, max_length=300)
    key_results: list[CatalogKeyResult] = Field(default_factory=list, max_length=600)
    adaptation_requests: list[CatalogAdaptationRequest] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def _handles(self) -> Catalog:
        seen: set[str] = set()
        groups = (
            ("U", self.users),
            ("T", self.teams),
            ("C", self.cycles),
            ("O", self.objectives),
            ("K", self.key_results),
            ("R", self.adaptation_requests),
        )
        for prefix, items in groups:
            for item in items:
                h = item.handle
                if h[0] != prefix:
                    raise ValueError(
                        f"El handle {h} no corresponde a {HANDLE_KINDS[prefix]} (prefijo {prefix})."
                    )
                if h in seen:
                    raise ValueError(f"Handle duplicado: {h}.")
                seen.add(h)
        return self

    def handle_kinds(self) -> dict[str, str]:
        """handle -> tipo de entidad (User, Team, ...)."""
        return {
            item.handle: HANDLE_KINDS[item.handle[0]]
            for items in (
                self.users,
                self.teams,
                self.cycles,
                self.objectives,
                self.key_results,
                self.adaptation_requests,
            )
            for item in items
        }


class HelpChunk(CamelModel):
    id: str = Field(pattern=r"^(admin|usuario)#[a-z0-9-]+$")
    manual: Literal["ADMIN", "USUARIO"]
    title: str = Field(max_length=300)
    text: str = Field(min_length=1, max_length=3000)
    url: str = Field(max_length=300)


class ChatTurn(CamelModel):
    role: Literal["ADMIN", "ASSISTANT"]
    text: str = Field(min_length=1, max_length=2000)


class Repair(CamelModel):
    previous_plan: Plan
    issues: list[PlanIssue] = Field(default_factory=list, max_length=50)


class AdminChatRequest(CamelModel):
    locale: Literal["es"] = "es"
    today: str = Field(pattern=ISO_DATE_PATTERN)
    message: str  # 1-2000: lo valida el guard (422 INPUT_REJECTED)
    history: list[ChatTurn] = Field(default_factory=list, max_length=10)
    catalog: Catalog = Field(default_factory=Catalog)
    catalog_truncated: bool = False
    help_chunks: list[HelpChunk] = Field(default_factory=list, max_length=6)
    repair: Repair | None = None

    @field_validator("help_chunks")
    @classmethod
    def _chunk_ids_unique(cls, v: list[HelpChunk]) -> list[HelpChunk]:
        ids = [c.id for c in v]
        if len(set(ids)) != len(ids):
            raise ValueError("Ids de helpChunks duplicados.")
        return v


class HelpAnswerRequest(CamelModel):
    locale: Literal["es"] = "es"
    audience: Literal["ADMIN", "LEADER", "MEMBER"]
    question: str  # 1-500: lo valida el guard
    chunks: list[HelpChunk] = Field(min_length=1, max_length=6)


# ----------------------------------------------------------------------------- digest (6)

Count = Annotated[int, Field(ge=0)]
Str = Annotated[str, StringConstraints(max_length=400)]


class OverdueExample(CamelModel):
    kr_title: Str
    objective_title: Str
    owner_name: Str
    days_overdue: Count


class KrRedExample(CamelModel):
    kr_title: Str
    objective_title: Str
    owner_name: Str


class CycleEndingExample(CamelModel):
    cycle_name: Str
    end_date: str
    days_left: Count


class CycleToCloseExample(CamelModel):
    cycle_name: Str
    end_date: str
    days_past: Count


class DraftExample(CamelModel):
    objective_title: Str
    owner_name: Str
    kr_count: Count
    owner_objective_count: Count


class UserExample(CamelModel):
    user_name: Str


class TeamExample(CamelModel):
    team_name: Str


class AdaptationOpenExample(CamelModel):
    entity_kind: Str = ""
    preferred_format: Str = ""
    due_date: str = ""
    days_left: int = 0


class SensitiveExample(CamelModel):
    action: Literal["USER_ROLE_CHANGED", "USER_DEACTIVATED", "KR_TARGET_CHANGED", "CYCLE_THRESHOLDS_CHANGED"]
    actor_name: Str
    entity_label: Str
    at: str


class OverdueGroup(CamelModel):
    count: Count = 0
    examples: list[OverdueExample] = Field(default_factory=list, max_length=5)


class KrRedGroup(CamelModel):
    count: Count = 0
    examples: list[KrRedExample] = Field(default_factory=list, max_length=5)


class CycleEndingGroup(CamelModel):
    count: Count = 0
    examples: list[CycleEndingExample] = Field(default_factory=list, max_length=5)


class CycleToCloseGroup(CamelModel):
    count: Count = 0
    examples: list[CycleToCloseExample] = Field(default_factory=list, max_length=5)


class DraftGroup(CamelModel):
    count: Count = 0
    examples: list[DraftExample] = Field(default_factory=list, max_length=5)


class UserGroup(CamelModel):
    count: Count = 0
    examples: list[UserExample] = Field(default_factory=list, max_length=5)


class TeamGroup(CamelModel):
    count: Count = 0
    examples: list[TeamExample] = Field(default_factory=list, max_length=5)


class CountOnlyGroup(CamelModel):
    count: Count = 0


class AdaptationOpenGroup(CamelModel):
    count: Count = 0
    overdue_count: Count = 0
    unassigned_count: Count = 0
    examples: list[AdaptationOpenExample] = Field(default_factory=list, max_length=5)


class SensitiveGroup(CamelModel):
    count: Count = 0
    examples: list[SensitiveExample] = Field(default_factory=list, max_length=5)


class DigestFacts(CamelModel):
    overdue_check_ins: OverdueGroup = Field(default_factory=OverdueGroup)
    krs_in_red: KrRedGroup = Field(default_factory=KrRedGroup)
    cycles_ending_soon: CycleEndingGroup = Field(default_factory=CycleEndingGroup)
    cycles_to_close: CycleToCloseGroup = Field(default_factory=CycleToCloseGroup)
    drafts_not_publishable: DraftGroup = Field(default_factory=DraftGroup)
    users_without_team: UserGroup = Field(default_factory=UserGroup)
    teams_without_lead: TeamGroup = Field(default_factory=TeamGroup)
    adaptations_needing_review: CountOnlyGroup = Field(default_factory=CountOnlyGroup)
    adaptation_requests_open: AdaptationOpenGroup | None = None
    recent_sensitive_changes: SensitiveGroup = Field(default_factory=SensitiveGroup)


class DigestRequest(CamelModel):
    locale: Literal["es"] = "es"
    today: str = Field(pattern=ISO_DATE_PATTERN)
    facts: DigestFacts


# ----------------------------------------------------------------------------- respuestas


class ChatChecks(StrictCamelModel):
    pii_masked: int
    injection_suspected: Literal[False] = False
    plan_local_issues: list[PlanIssue]


Intent = Literal["ACTION", "QUERY", "HOW_TO", "CLARIFY", "OUT_OF_SCOPE", "SMALL_TALK"]


class AdminChatResponse(StrictCamelModel):
    trace_id: str
    intent: Intent
    reply: str = Field(min_length=1, max_length=800)
    plan: Plan | None
    query: ReadQuery | None
    citations: list[str]
    checks: ChatChecks
    prompt: PromptRef
    usage: list[UsageStep]


class DigestItem(StrictCamelModel):
    fact_key: str
    text: str = Field(max_length=300)


class DigestSummary(StrictCamelModel):
    headline: str = Field(max_length=200)
    items: list[DigestItem] = Field(max_length=8)


class DigestChecks(StrictCamelModel):
    numbers_faithful: bool
    unknown_numbers: list[str]
    unknown_names: list[str]
    fallback_used: bool


class DigestResponse(StrictCamelModel):
    trace_id: str
    summary: DigestSummary
    checks: DigestChecks
    prompt: PromptRef
    usage: list[UsageStep]


class HelpAnswerResponse(StrictCamelModel):
    trace_id: str
    answer: str = Field(max_length=1200)
    citations: list[str]
    found: bool
    prompt: PromptRef
    usage: list[UsageStep]


__all__ = [
    "HANDLE_PATTERN",
    "AdminChatRequest",
    "AdminChatResponse",
    "DigestRequest",
    "DigestResponse",
    "HelpAnswerRequest",
    "HelpAnswerResponse",
]
