"""Modelos Pydantic del plan y de las consultas de solo lectura (agent-contract-admin.md, secciones 3-5).

Sirven de `output_schema` del planner y de modelo de respuesta (camelCase en JSON). `extra="forbid"`:
un campo inventado (p. ej. `password`) invalida la salida del LLM y dispara el REPAIR.

Whitelist v1 (aprobada): crear usuario / equipo / ciclo / objetivo / KR, agregar-quitar miembro y asignar lider,
activar ciclo y cambiar el responsable de un KR. Las acciones marcadas con aviso (adaptation-requests, v1.1) NO estan
en el agente hasta que el modulo exista: un tipo fuera de esta union es una salida invalida.

AMBIGUEDAD DEL CONTRATO: la tabla 4.3 da a CREATE_OBJECTIVE un campo `type` (COMMITTED|ASPIRATIONAL) que choca con el
discriminador `type` de la accion. En JSON no pueden convivir: el agente lo emite como `objectiveType`.
"""

from __future__ import annotations

import re
from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel

HANDLE_RE = re.compile(r"^[UTCOKR][0-9]{1,4}$")
REF_RE = re.compile(r"^[a-z][a-z0-9]{0,15}$")
HANDLE_PATTERN = r"^[UTCOKR][0-9]{1,4}$"
REF_PATTERN = r"^[a-z][a-z0-9]{0,15}$"
ISO_DATE_PATTERN = r"^\d{4}-\d{2}-\d{2}$"

Handle = Annotated[str, Field(pattern=HANDLE_PATTERN)]
IsoDate = Annotated[str, Field(pattern=ISO_DATE_PATTERN)]

# Prefijo de handle -> tipo de entidad
HANDLE_KINDS = {
    "U": "User",
    "T": "Team",
    "C": "Cycle",
    "O": "Objective",
    "K": "KeyResult",
    "R": "AdaptationRequest",
}

# tipo de accion -> tipo de entidad que crea
CREATES = {
    "CREATE_USER": "User",
    "CREATE_TEAM": "Team",
    "CREATE_CYCLE": "Cycle",
    "CREATE_OBJECTIVE": "Objective",
    "CREATE_KEY_RESULT": "KeyResult",
}

WHITELIST = (
    "CREATE_USER",
    "CREATE_TEAM",
    "SET_TEAM_MEMBER",
    "REMOVE_TEAM_MEMBER",
    "CREATE_CYCLE",
    "ACTIVATE_CYCLE",
    "CREATE_OBJECTIVE",
    "CREATE_KEY_RESULT",
    "SET_KEY_RESULT_OWNER",
)


def valid_iso_date(value: str) -> bool:
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return bool(re.fullmatch(ISO_DATE_PATTERN, value))


class _Strict(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class EntityRef(_Strict):
    kind: Literal["EXISTING", "NEW"]
    handle: Handle | None = None
    ref: Annotated[str, Field(pattern=REF_PATTERN)] | None = None

    @model_validator(mode="after")
    def _coherent(self) -> EntityRef:
        if self.kind == "EXISTING" and (self.handle is None or self.ref is not None):
            raise ValueError("EXISTING lleva solo `handle`.")
        if self.kind == "NEW" and (self.ref is None or self.handle is not None):
            raise ValueError("NEW lleva solo `ref`.")
        return self


class OwnerRef(_Strict):
    kind: Literal["USER", "TEAM"]
    entity: EntityRef


Quote = Annotated[str, Field(min_length=3, max_length=200)]
Ref = Annotated[str, Field(pattern=REF_PATTERN)]
Decimal2 = Annotated[float, Field(ge=0.01, le=1)]
DecimalStr = Annotated[str, Field(pattern=r"^-?\d+(\.\d+)?$")]


class CreateUser(_Strict):
    type: Literal["CREATE_USER"]
    ref: Ref
    name: Annotated[str, Field(min_length=1, max_length=120)]
    email: Annotated[
        str, Field(min_length=3, max_length=254)
    ]  # formato: lo valida local_checks tras desenmascarar
    role: Literal["ADMIN", "LEADER", "MEMBER"] | None = None
    source_quote: Quote


class CreateTeam(_Strict):
    type: Literal["CREATE_TEAM"]
    ref: Ref
    name: Annotated[str, Field(min_length=1, max_length=120)]
    parent: EntityRef
    source_quote: Quote


class SetTeamMember(_Strict):
    type: Literal["SET_TEAM_MEMBER"]
    team: EntityRef
    user: EntityRef
    is_lead: bool
    source_quote: Quote


class RemoveTeamMember(_Strict):
    type: Literal["REMOVE_TEAM_MEMBER"]
    team: EntityRef
    user: EntityRef
    source_quote: Quote


class CreateCycle(_Strict):
    type: Literal["CREATE_CYCLE"]
    ref: Ref
    name: Annotated[str, Field(min_length=1, max_length=120)]
    kind: Literal["ANNUAL", "QUARTER"]
    parent: EntityRef | None = None
    start_date: IsoDate
    end_date: IsoDate
    check_in_cadence: Literal["WEEKLY", "BIWEEKLY", "MONTHLY"] | None = None
    committed_threshold: Decimal2 | None = None
    aspirational_threshold: Decimal2 | None = None
    source_quote: Quote

    @field_validator("committed_threshold", "aspirational_threshold")
    @classmethod
    def _two_decimals(cls, v: float | None) -> float | None:
        if v is not None and abs(round(v, 2) - v) > 1e-9:
            raise ValueError("Maximo 2 decimales.")
        return v


class ActivateCycle(_Strict):
    type: Literal["ACTIVATE_CYCLE"]
    cycle: EntityRef
    source_quote: Quote


class CreateObjective(_Strict):
    type: Literal["CREATE_OBJECTIVE"]
    ref: Ref
    cycle: EntityRef
    owner: OwnerRef
    title: Annotated[str, Field(min_length=3, max_length=200)]
    description: Annotated[str, Field(max_length=2000)] | None = None
    origin: Literal["TOP_DOWN", "BOTTOM_UP"]
    objective_type: Literal[
        "COMMITTED", "ASPIRATIONAL"
    ]  # `type` en la tabla del contrato (choca con el discriminador)
    parent_objective: EntityRef | None = None
    source_quote: Quote


class CreateKeyResult(_Strict):
    type: Literal["CREATE_KEY_RESULT"]
    ref: Ref
    objective: EntityRef
    owner: EntityRef
    title: Annotated[str, Field(min_length=1, max_length=200)]
    scoring: Literal["DERIVED", "MANUAL"]
    unit: Annotated[str, Field(max_length=40)] | None = None
    start_value: DecimalStr | None = None
    target_value: DecimalStr | None = None
    source_quote: Quote


class SetKeyResultOwner(_Strict):
    type: Literal["SET_KEY_RESULT_OWNER"]
    key_result: EntityRef
    owner: EntityRef
    source_quote: Quote


PlanAction = Annotated[
    CreateUser
    | CreateTeam
    | SetTeamMember
    | RemoveTeamMember
    | CreateCycle
    | ActivateCycle
    | CreateObjective
    | CreateKeyResult
    | SetKeyResultOwner,
    Field(discriminator="type"),
]

Assumption = Annotated[str, Field(max_length=200)]


class Plan(_Strict):
    summary: Annotated[str, Field(min_length=1, max_length=300)]
    actions: Annotated[list[PlanAction], Field(min_length=1, max_length=25)]
    assumptions: Annotated[list[Assumption], Field(max_length=5)] = Field(default_factory=list)


class PlannerOut(_Strict):
    """Salida del planner (modo schema). Un Plan, o una pregunta aclaratoria cuando el catalogo es ambiguo
    (p. ej. dos "Lucia"): el clasificador no ve el catalogo, el planner si."""

    summary: Annotated[str, Field(max_length=300)] = ""
    actions: Annotated[list[PlanAction], Field(max_length=25)] = Field(default_factory=list)
    assumptions: Annotated[list[Assumption], Field(max_length=5)] = Field(default_factory=list)
    clarification: Annotated[str, Field(max_length=500)] | None = None

    @model_validator(mode="after")
    def _plan_or_question(self) -> PlannerOut:
        if self.clarification and self.clarification.strip():
            return self
        if not self.actions:
            raise ValueError("Falta `actions` (o `clarification` si hay ambiguedad).")
        if not self.summary.strip():
            raise ValueError("Falta `summary`.")
        return self

    @property
    def is_clarification(self) -> bool:
        return bool(self.clarification and self.clarification.strip())

    def to_plan(self) -> Plan:
        return Plan(summary=self.summary, actions=self.actions, assumptions=self.assumptions)


class AuditEntity(_Strict):
    entity_type: Literal["User", "Team", "Cycle", "Objective", "KeyResult"]
    handle: Handle


class ReadQuery(_Strict):
    """AUDIT_SEARCH: la unica consulta v1 (ADAPTATION_REQUESTS_LIST es v1.1 y depende de otro modulo)."""

    type: Literal["AUDIT_SEARCH"]
    action: Annotated[str, Field(pattern=r"^[A-Z][A-Z_]{2,63}$")] | None = None
    entity: AuditEntity | None = None
    actor: Handle | None = None
    from_: Annotated[str, Field(pattern=ISO_DATE_PATTERN)] | None = Field(default=None, alias="from")
    to: IsoDate | None = None
    limit: Annotated[int, Field(ge=1, le=20)] = 10
    source_quote: Quote


class PlanIssue(_Strict):
    action_index: int | None = None
    code: str
    message: str
