"""Modo `tools` del planner: FunctionTools que SOLO REGISTRAN acciones propuestas. No ejecutan nada.

Cada `propose_*` valida los argumentos contra el modelo Pydantic de la accion (el modelo recibe el error en la
misma conversacion y puede corregir) y agrega la accion a `PipelineRun.scratch["proposed"]`. Despues el ensamblado es
determinista: acciones en orden de llamada + resumen + supuestos (`set_plan_summary`) o pregunta (`ask_clarification`).

Las funciones son `async` sin `await`: ADK ejecuta las llamadas paralelas de un mismo turno con gather y, al no ceder
el control, se registran en el orden en que el modelo las emitio.

Referencias a entidades: un string. "T2" (handle del catalogo) = EXISTING; "t1" (ref minuscula de una accion previa) = NEW.
"""

from __future__ import annotations

from typing import Any

from google.adk.tools import FunctionTool, ToolContext
from pydantic import TypeAdapter, ValidationError

from ..usage import get_run
from .plan_models import HANDLE_RE, REF_RE, EntityRef, PlanAction, PlannerOut

_ACTION_ADAPTER = TypeAdapter(PlanAction)
MAX_ACTIONS = 25


def _scratch() -> dict[str, Any]:
    run = get_run()
    return run.scratch.setdefault(
        "planner", {"proposed": [], "summary": "", "assumptions": [], "clarification": None}
    )


def _entity(value: str) -> dict[str, Any] | None:
    v = (value or "").strip()
    if not v:
        return None
    if HANDLE_RE.match(v):
        return {"kind": "EXISTING", "handle": v}
    if REF_RE.match(v):
        return {"kind": "NEW", "ref": v}
    return {"kind": "EXISTING", "handle": v}  # no valida: el modelo Pydantic lo rechaza con un mensaje claro


def _opt(value: str) -> str | None:
    v = (value or "").strip()
    return v or None


def _num(value: str) -> float | None:
    v = _opt(value)
    if v is None:
        return None
    try:
        return float(v.replace(",", "."))
    except ValueError:
        return float("nan")  # fuerza el rechazo de validacion


def _finish(tool_context: ToolContext | None) -> None:
    """Termina el bucle de herramientas de forma determinista (no depende de que el modelo emita un texto final)."""
    if tool_context is not None:
        tool_context.actions.skip_summarization = True


def _record(raw: dict[str, Any]) -> dict[str, Any]:
    state = _scratch()
    if state["clarification"]:
        return {"ok": False, "error": "Ya pediste una aclaracion: no propongas acciones."}
    if len(state["proposed"]) >= MAX_ACTIONS:
        return {"ok": False, "error": f"Maximo {MAX_ACTIONS} acciones por plan."}
    raw = {k: v for k, v in raw.items() if v is not None}
    try:
        action = _ACTION_ADAPTER.validate_python(raw)
    except ValidationError as exc:
        details = "; ".join(f"{'.'.join(str(p) for p in e['loc'][1:])}: {e['msg']}" for e in exc.errors()[:4])
        return {"ok": False, "error": f"Argumentos invalidos ({details}). Corregilos y volve a llamar."}
    if action in state["proposed"]:
        return {"ok": False, "error": "Esa accion ya esta registrada: no la repitas."}
    if state["summary"]:
        return {"ok": False, "error": "El plan ya esta cerrado: no propongas mas acciones."}
    state["proposed"].append(action)
    return {"ok": True, "position": len(state["proposed"])}


async def propose_create_user(ref: str, name: str, email: str, source_quote: str, role: str = "") -> dict:
    """Propone CREAR un usuario. ref: id corto minuscula (ej. "u1"). role: ADMIN, LEADER o MEMBER (vacio = MEMBER).
    source_quote: fragmento LITERAL del mensaje de la persona que pide esto."""
    return _record(
        {
            "type": "CREATE_USER",
            "ref": ref,
            "name": name,
            "email": email,
            "role": _opt(role),
            "sourceQuote": source_quote,
        }
    )


async def propose_create_team(ref: str, name: str, parent: str, source_quote: str) -> dict:
    """Propone CREAR un equipo dentro de otro. parent: handle del equipo padre (ej. "T2") o ref de uno creado antes."""
    return _record(
        {
            "type": "CREATE_TEAM",
            "ref": ref,
            "name": name,
            "parent": _entity(parent),
            "sourceQuote": source_quote,
        }
    )


async def propose_set_team_member(team: str, user: str, is_lead: bool, source_quote: str) -> dict:
    """Propone AGREGAR una persona a un equipo (o cambiar si es lider). team/user: handle o ref."""
    return _record(
        {
            "type": "SET_TEAM_MEMBER",
            "team": _entity(team),
            "user": _entity(user),
            "isLead": is_lead,
            "sourceQuote": source_quote,
        }
    )


async def propose_remove_team_member(team: str, user: str, source_quote: str) -> dict:
    """Propone QUITAR una persona de un equipo. team/user: handles existentes."""
    return _record(
        {
            "type": "REMOVE_TEAM_MEMBER",
            "team": _entity(team),
            "user": _entity(user),
            "sourceQuote": source_quote,
        }
    )


async def propose_create_cycle(
    ref: str,
    name: str,
    kind: str,
    start_date: str,
    end_date: str,
    source_quote: str,
    parent: str = "",
    check_in_cadence: str = "",
    committed_threshold: str = "",
    aspirational_threshold: str = "",
) -> dict:
    """Propone CREAR un ciclo. kind: ANNUAL o QUARTER. Fechas YYYY-MM-DD. parent: solo para QUARTER (handle del anual).
    check_in_cadence: WEEKLY, BIWEEKLY o MONTHLY (opcional). Umbrales entre 0.01 y 1 (opcionales)."""
    return _record(
        {
            "type": "CREATE_CYCLE",
            "ref": ref,
            "name": name,
            "kind": kind,
            "parent": _entity(parent),
            "startDate": start_date,
            "endDate": end_date,
            "checkInCadence": _opt(check_in_cadence),
            "committedThreshold": _num(committed_threshold),
            "aspirationalThreshold": _num(aspirational_threshold),
            "sourceQuote": source_quote,
        }
    )


async def propose_activate_cycle(cycle: str, source_quote: str) -> dict:
    """Propone ACTIVAR un ciclo en borrador (handle o ref)."""
    return _record({"type": "ACTIVATE_CYCLE", "cycle": _entity(cycle), "sourceQuote": source_quote})


async def propose_create_objective(
    ref: str,
    cycle: str,
    owner_kind: str,
    owner: str,
    title: str,
    origin: str,
    objective_type: str,
    source_quote: str,
    description: str = "",
    parent_objective: str = "",
) -> dict:
    """Propone CREAR un objetivo (queda en borrador). owner_kind: USER o TEAM; owner: handle o ref.
    origin: TOP_DOWN o BOTTOM_UP. objective_type: COMMITTED o ASPIRATIONAL.
    parent_objective: handle de un objetivo PUBLICADO existente (opcional)."""
    return _record(
        {
            "type": "CREATE_OBJECTIVE",
            "ref": ref,
            "cycle": _entity(cycle),
            "owner": {"kind": owner_kind, "entity": _entity(owner)},
            "title": title,
            "description": _opt(description),
            "origin": origin,
            "objectiveType": objective_type,
            "parentObjective": _entity(parent_objective),
            "sourceQuote": source_quote,
        }
    )


async def propose_create_key_result(
    ref: str,
    objective: str,
    owner: str,
    title: str,
    scoring: str,
    source_quote: str,
    unit: str = "",
    start_value: str = "",
    target_value: str = "",
) -> dict:
    """Propone CREAR un resultado clave. objective: handle u ref. owner: handle de usuario. scoring: DERIVED o MANUAL.
    start_value/target_value: numeros como texto, SOLO si scoring es DERIVED (target_value es obligatorio ahi)."""
    return _record(
        {
            "type": "CREATE_KEY_RESULT",
            "ref": ref,
            "objective": _entity(objective),
            "owner": _entity(owner),
            "title": title,
            "scoring": scoring,
            "unit": _opt(unit),
            "startValue": _opt(start_value),
            "targetValue": _opt(target_value),
            "sourceQuote": source_quote,
        }
    )


async def propose_set_key_result_owner(key_result: str, owner: str, source_quote: str) -> dict:
    """Propone CAMBIAR el responsable de un resultado clave existente (handle K..) por un usuario (handle U..)."""
    return _record(
        {
            "type": "SET_KEY_RESULT_OWNER",
            "keyResult": _entity(key_result),
            "owner": _entity(owner),
            "sourceQuote": source_quote,
        }
    )


async def set_plan_summary(
    summary: str, assumptions: list[str], tool_context: ToolContext | None = None
) -> dict:
    """CIERRA el plan: llamala UNA vez, al final, cuando ya propusiste todas las acciones. Define el resumen del plan
    (1 oracion, voseo, hasta 300 caracteres) y los supuestos a revisar (hasta 5)."""
    state = _scratch()
    if not state["proposed"]:
        return {"ok": False, "error": "Primero propone las acciones (propose_*)."}
    state["summary"] = (summary or "").strip()
    state["assumptions"] = [a.strip() for a in (assumptions or []) if a and a.strip()][:5]
    _finish(tool_context)
    return {"ok": True, "done": "Plan completo."}


async def ask_clarification(question: str, tool_context: ToolContext | None = None) -> dict:
    """Usala SOLO si el pedido es ambiguo (p. ej. dos personas con el mismo nombre) y NO se puede armar el plan."""
    state = _scratch()
    state["clarification"] = (question or "").strip()
    _finish(tool_context)
    return {"ok": True, "done": "Pregunta enviada."}


TOOL_FUNCTIONS = (
    propose_create_user,
    propose_create_team,
    propose_set_team_member,
    propose_remove_team_member,
    propose_create_cycle,
    propose_activate_cycle,
    propose_create_objective,
    propose_create_key_result,
    propose_set_key_result_owner,
    set_plan_summary,
    ask_clarification,
)


def build_tools() -> list[FunctionTool]:
    return [FunctionTool(fn) for fn in TOOL_FUNCTIONS]


def assemble() -> PlannerOut:
    """Arma la salida del planner con lo registrado. Lanza ValidationError/ValueError si no hay plan ni pregunta."""
    state = _scratch()
    actions = list(state["proposed"])
    summary = state["summary"] or default_summary(actions)
    return PlannerOut(
        summary=summary[:300],
        actions=actions,
        assumptions=state["assumptions"],
        clarification=state["clarification"],
    )


def default_summary(actions: list) -> str:
    n = len(actions)
    return f"Voy a ejecutar {n} {'acción' if n == 1 else 'acciones'}." if n else ""


def reset() -> None:
    get_run().scratch.pop("planner", None)


__all__ = ["EntityRef", "TOOL_FUNCTIONS", "assemble", "build_tools", "reset"]
