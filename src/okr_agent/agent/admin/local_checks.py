"""Checks deterministas del plan / consulta (agent-contract-admin.md 5.2 y 8.2). Mismos codigos que NestJS.

NestJS revalida todo: esto es la primera linea (permite UN REPAIR antes de responder) y alimenta
`checks.planLocalIssues`. Se corre DESPUES de desenmascarar la PII, contra los mensajes ADMIN originales.
"""

from __future__ import annotations

import re

from ...api.admin_schemas import Catalog
from ..admin.plan_models import (
    CREATES,
    HANDLE_RE,
    EntityRef,
    Plan,
    PlanAction,
    PlanIssue,
    ReadQuery,
    valid_iso_date,
)
from .text import quote_in_messages

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")

# campo de la accion -> tipo de entidad esperado
_REF_FIELDS: dict[str, dict[str, str]] = {
    "CREATE_TEAM": {"parent": "Team"},
    "SET_TEAM_MEMBER": {"team": "Team", "user": "User"},
    "REMOVE_TEAM_MEMBER": {"team": "Team", "user": "User"},
    "CREATE_CYCLE": {"parent": "Cycle"},
    "ACTIVATE_CYCLE": {"cycle": "Cycle"},
    "CREATE_OBJECTIVE": {"cycle": "Cycle", "parentObjective": "Objective"},
    "CREATE_KEY_RESULT": {"objective": "Objective", "owner": "User"},
    "SET_KEY_RESULT_OWNER": {"keyResult": "KeyResult", "owner": "User"},
}
_ATTR = {
    "parent": "parent",
    "team": "team",
    "user": "user",
    "cycle": "cycle",
    "parentObjective": "parent_objective",
    "objective": "objective",
    "owner": "owner",
    "keyResult": "key_result",
}
_EXISTING_ONLY = {("REMOVE_TEAM_MEMBER", "user"), ("REMOVE_TEAM_MEMBER", "team")}


def admin_messages(message: str, history: list) -> list[str]:
    """Mensajes ADMIN contra los que se ancla `sourceQuote`: el actual y los 3 ADMIN anteriores."""
    previous = [t.text for t in history if t.role == "ADMIN"][-3:]
    return [message, *previous]


def _check_ref(
    issues: list[PlanIssue],
    index: int,
    field: str,
    ref: EntityRef,
    expected: str,
    handles: dict[str, str],
    defined: dict[str, str],
) -> None:
    if ref.kind == "EXISTING":
        h = ref.handle or ""
        if not HANDLE_RE.match(h) or handles.get(h) != expected:
            issues.append(
                PlanIssue(
                    action_index=index,
                    code="UNKNOWN_HANDLE",
                    message=f"`{field}`: el handle {h} no existe en el catalogo o no es de tipo {expected}.",
                )
            )
    else:
        r = ref.ref or ""
        if defined.get(r) != expected:
            issues.append(
                PlanIssue(
                    action_index=index,
                    code="UNKNOWN_REF",
                    message=f"`{field}`: la referencia {r} no la crea una accion anterior de tipo {expected}.",
                )
            )


def _action_ref(action: PlanAction, wire_field: str) -> EntityRef | None:
    return getattr(action, _ATTR[wire_field], None)


def check_plan(plan: Plan, catalog: Catalog, adm_messages: list[str]) -> list[PlanIssue]:
    issues: list[PlanIssue] = []
    handles = catalog.handle_kinds()
    defined: dict[str, str] = {}
    seen_refs: set[str] = set()
    if len(plan.actions) > 25:
        issues.append(
            PlanIssue(action_index=None, code="TOO_MANY_ACTIONS", message="Hay mas de 25 acciones.")
        )
    for i, action in enumerate(plan.actions):
        t = action.type
        for wire_field, expected in _REF_FIELDS.get(t, {}).items():
            ref = _action_ref(action, wire_field)
            if ref is None:
                continue
            if (t, wire_field) in _EXISTING_ONLY and ref.kind != "EXISTING":
                issues.append(
                    PlanIssue(
                        action_index=i,
                        code="UNKNOWN_REF",
                        message=f"`{wire_field}`: solo admite entidades existentes.",
                    )
                )
                continue
            _check_ref(issues, i, wire_field, ref, expected, handles, defined)
        if t == "CREATE_OBJECTIVE":
            owner = action.owner
            _check_ref(
                issues,
                i,
                "owner.entity",
                owner.entity,
                "User" if owner.kind == "USER" else "Team",
                handles,
                defined,
            )
            parent = action.parent_objective
            if parent is not None and parent.kind == "NEW":
                issues.append(
                    PlanIssue(
                        action_index=i,
                        code="PARENT_NOT_PUBLISHED",
                        message="`parentObjective` debe ser un objetivo existente y publicado.",
                    )
                )
            elif parent is not None and parent.handle:
                obj = next((o for o in catalog.objectives if o.handle == parent.handle), None)
                if obj is not None and obj.status != "PUBLISHED":
                    issues.append(
                        PlanIssue(
                            action_index=i,
                            code="PARENT_NOT_PUBLISHED",
                            message=f"El objetivo {parent.handle} no esta publicado.",
                        )
                    )
        if t == "ACTIVATE_CYCLE" and action.cycle.kind == "EXISTING":
            cyc = next((c for c in catalog.cycles if c.handle == action.cycle.handle), None)
            if cyc is not None and cyc.status != "DRAFT":
                issues.append(
                    PlanIssue(
                        action_index=i,
                        code="CYCLE_NOT_EDITABLE",
                        message=f"El ciclo {cyc.handle} no esta en borrador: no se puede activar.",
                    )
                )
        # DTO basico (Nest valida el resto)
        if t == "CREATE_USER" and not _EMAIL.match(action.email):
            issues.append(
                PlanIssue(action_index=i, code="DTO_INVALID", message="`email`: no es un email valido.")
            )
        if t == "CREATE_CYCLE":
            if not (valid_iso_date(action.start_date) and valid_iso_date(action.end_date)):
                issues.append(
                    PlanIssue(
                        action_index=i, code="DTO_INVALID", message="Las fechas del ciclo no son validas."
                    )
                )
            elif action.start_date >= action.end_date:
                issues.append(
                    PlanIssue(
                        action_index=i,
                        code="DTO_INVALID",
                        message="`startDate` debe ser anterior a `endDate`.",
                    )
                )
            if action.kind == "ANNUAL" and action.parent is not None:
                issues.append(
                    PlanIssue(action_index=i, code="DTO_INVALID", message="Un ciclo anual no tiene `parent`.")
                )
        if t == "CREATE_KEY_RESULT" and action.scoring == "DERIVED" and action.target_value is None:
            issues.append(
                PlanIssue(action_index=i, code="DTO_INVALID", message="Un KR DERIVED necesita `targetValue`.")
            )
        if (
            t == "CREATE_KEY_RESULT"
            and action.scoring == "MANUAL"
            and (action.start_value is not None or action.target_value is not None)
        ):
            issues.append(
                PlanIssue(
                    action_index=i,
                    code="DTO_INVALID",
                    message="`startValue`/`targetValue` solo aplican a KRs DERIVED.",
                )
            )
        # refs creadas
        if t in CREATES:
            r = action.ref
            if r in seen_refs:
                issues.append(
                    PlanIssue(action_index=i, code="DUPLICATE_REF", message=f"La referencia {r} se repite.")
                )
            seen_refs.add(r)
            defined[r] = CREATES[t]
        # anclaje
        if not quote_in_messages(action.source_quote, adm_messages):
            issues.append(
                PlanIssue(
                    action_index=i,
                    code="UNGROUNDED",
                    message="`sourceQuote` no es un fragmento literal de un mensaje de la persona ADMIN.",
                )
            )
    return issues


def check_query(query: ReadQuery, catalog: Catalog, adm_messages: list[str]) -> list[PlanIssue]:
    issues: list[PlanIssue] = []
    handles = catalog.handle_kinds()

    def bad(msg: str) -> None:
        issues.append(PlanIssue(action_index=None, code="QUERY_INVALID", message=msg))

    if query.entity is not None:
        if handles.get(query.entity.handle) != query.entity.entity_type:
            bad(
                f"`entity`: el handle {query.entity.handle} no existe o no es de tipo {query.entity.entity_type}."
            )
    if query.actor is not None and handles.get(query.actor) != "User":
        bad(f"`actor`: el handle {query.actor} no es un usuario del catalogo.")
    for name, value in (("from", query.from_), ("to", query.to)):
        if value is not None and not valid_iso_date(value):
            bad(f"`{name}` no es una fecha valida.")
    if query.from_ and query.to and valid_iso_date(query.from_) and valid_iso_date(query.to):
        if query.from_ > query.to:
            bad("`from` debe ser anterior o igual a `to`.")
    if not quote_in_messages(query.source_quote, adm_messages):
        issues.append(
            PlanIssue(
                action_index=None,
                code="UNGROUNDED",
                message="`sourceQuote` no es un fragmento literal de un mensaje de la persona ADMIN.",
            )
        )
    return issues
