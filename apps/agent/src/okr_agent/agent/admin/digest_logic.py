"""Novedades (digest): hechos priorizados, render para el prompt, fidelidad de numeros/nombres y plantilla determinista.

Garantia: ningun numero que no este en los hechos llega a la persona. Si el LLM no la cumple tras una regeneracion,
se devuelve la plantilla (`fallbackUsed=true`), nunca un error por fidelidad.
"""

from __future__ import annotations

import json
import re
from typing import Any

from ...api.admin_schemas import DigestFacts
from ...guards.fidelity import canonical_number
from ..features import raw_enum_tokens
from .text import normalize, sanitize_untrusted

# Orden de prioridad (REQ-DIG-1): ciclos a cerrar, solicitudes de adaptacion, check-ins vencidos, KRs en rojo, ...
PRIORITY = (
    "cyclesToClose",
    "adaptationRequestsOpen",
    "overdueCheckIns",
    "krsInRed",
    "cyclesEndingSoon",
    "draftsNotPublishable",
    "usersWithoutTeam",
    "teamsWithoutLead",
    "adaptationsNeedingReview",
    "recentSensitiveChanges",
)
MAX_ITEMS = 8

_ATTR = {
    "cyclesToClose": "cycles_to_close",
    "adaptationRequestsOpen": "adaptation_requests_open",
    "overdueCheckIns": "overdue_check_ins",
    "krsInRed": "krs_in_red",
    "cyclesEndingSoon": "cycles_ending_soon",
    "draftsNotPublishable": "drafts_not_publishable",
    "usersWithoutTeam": "users_without_team",
    "teamsWithoutLead": "teams_without_lead",
    "adaptationsNeedingReview": "adaptations_needing_review",
    "recentSensitiveChanges": "recent_sensitive_changes",
}
SENSITIVE_LABEL = {
    "USER_ROLE_CHANGED": "cambio de rol de una persona",
    "USER_DEACTIVATED": "usuario desactivado",
    "KR_TARGET_CHANGED": "cambio de meta de un resultado clave",
    "CYCLE_THRESHOLDS_CHANGED": "cambio de umbrales de un ciclo",
}

_NUM = re.compile(r"(?<![A-Za-z])\d+(?:[.,]\d+)*")
_QUOTED = re.compile(r"«([^»]+)»")
_CAP_WORD = re.compile(r"(?<![\w])([A-ZÁÉÍÓÚÑ][\wáéíóúñÁÉÍÓÚÑ]+)")
_SENTENCE_START = re.compile(r"(?:^|[.!?¡¿]\s+|«)\s*$")
_STOP_CAPS = frozenset(
    normalize(w)
    for w in (
        "enero febrero marzo abril mayo junio julio agosto septiembre setiembre octubre noviembre diciembre "
        "lunes martes miercoles jueves viernes sabado domingo hoy"
    ).split()
)


def group(facts: DigestFacts, key: str) -> Any:
    return getattr(facts, _ATTR[key])


def active_keys(facts: DigestFacts) -> list[str]:
    out = []
    for key in PRIORITY:
        g = group(facts, key)
        if g is not None and g.count > 0:
            out.append(key)
    return out


def _group_json(facts: DigestFacts, key: str) -> dict:
    return group(facts, key).model_dump(by_alias=True, mode="json")


def _strings(obj: Any) -> list[str]:
    if isinstance(obj, str):
        return [obj]
    if isinstance(obj, dict):
        return [s for v in obj.values() for s in _strings(v)]
    if isinstance(obj, list):
        return [s for v in obj for s in _strings(v)]
    return []


def allowed_numbers(facts: DigestFacts, key: str) -> set[str]:
    """Numeros que el texto de `key` puede usar: todo digito presente en los hechos de ese grupo."""
    raw = json.dumps(_group_json(facts, key), ensure_ascii=False)
    return {canonical_number(m) for m in _NUM.findall(raw)}


def all_fact_numbers(facts: DigestFacts) -> set[str]:
    out: set[str] = set()
    for key in PRIORITY:
        if group(facts, key) is not None:
            out |= allowed_numbers(facts, key)
    return out


def render_facts(facts: DigestFacts, keys: list[str]) -> str:
    """Hechos como texto plano (una linea por ejemplo, saneado): son DATOS no confiables."""
    s = sanitize_untrusted
    lines: list[str] = []
    for key in keys:
        g = group(facts, key)
        lines.append(f"## {key} (total: {g.count})")
        if key == "adaptationRequestsOpen":
            lines.append(f"- vencidas: {g.overdue_count}; sin asignar: {g.unassigned_count}")
        for ex in getattr(g, "examples", []):
            d = ex.model_dump(by_alias=True, mode="json")
            if key == "recentSensitiveChanges":
                d["action"] = SENSITIVE_LABEL.get(d["action"], d["action"])
            lines.append("- " + "; ".join(f"{k}: {s(str(v), 150)}" for k, v in d.items()))
    return "\n".join(lines)


# ----------------------------------------------------------------------------- fidelidad


def _names_allowed(facts: DigestFacts, key: str) -> tuple[set[str], list[str]]:
    texts = [normalize(t) for t in _strings(_group_json(facts, key))]
    words = {w for t in texts for w in re.findall(r"[a-z0-9ñ]+", t)}
    return words, texts


def unknown_names_in(text: str, facts: DigestFacts, key: str) -> list[str]:
    """Nombres propios citados que no vienen de los ejemplos del grupo: «titulos» y palabras con mayuscula."""
    words, texts = _names_allowed(facts, key)
    bad: list[str] = []
    for q in _QUOTED.findall(text):
        nq = normalize(q)
        if nq and not any(nq in t for t in texts):
            bad.append(q)
    rest = _QUOTED.sub(" ", text)
    for m in _CAP_WORD.finditer(rest):
        word = m.group(1)
        if word.isupper() or _SENTENCE_START.search(rest[: m.start()]):
            continue  # siglas (KR, OKR) y palabras al inicio de oracion
        nw = normalize(word)
        if nw in _STOP_CAPS or nw in words:
            continue
        bad.append(word)
    return list(dict.fromkeys(bad))


def unknown_numbers_in(text: str, allowed: set[str]) -> list[str]:
    bad = [m for m in _NUM.findall(text) if canonical_number(m) not in allowed]
    return list(dict.fromkeys(bad))


def check_summary(summary: dict, facts: DigestFacts, keys: list[str]) -> dict:
    """Devuelve {problems, unknown_numbers, unknown_names}. `summary` = {headline, items:[{factKey,text}]}."""
    problems: list[str] = []
    unknown_nums: list[str] = []
    unknown_names: list[str] = []
    headline = str(summary.get("headline", ""))
    items = summary.get("items", [])
    expected = keys[:MAX_ITEMS]
    got = [i.get("factKey") for i in items]
    if got != expected:
        problems.append(
            f"`items` debe tener exactamente un item por factKey con count > 0, en este orden: {', '.join(expected)}."
        )
    if len(headline) > 200 or not headline.strip():
        problems.append("`headline` debe tener entre 1 y 200 caracteres.")
    head_allowed = {str(len(keys))} | {canonical_number(str(group(facts, k).count)) for k in keys}
    head_bad = unknown_numbers_in(headline, head_allowed)
    unknown_nums += head_bad
    for item in items:
        key, text = item.get("factKey"), str(item.get("text", ""))
        if len(text) > 300 or not text.strip():
            problems.append(f"El texto de {key} debe tener entre 1 y 300 caracteres.")
        if key not in keys:
            continue
        nums = unknown_numbers_in(text, allowed_numbers(facts, key))
        names = unknown_names_in(text, facts, key)
        unknown_nums += nums
        unknown_names += names
        raw = raw_enum_tokens(text)
        if raw:
            problems.append(f"{key}: no uses codigos internos ({', '.join(raw)}); decilo en español.")
    if unknown_nums:
        problems.append(
            "Usaste numeros que NO estan en los hechos: " + ", ".join(dict.fromkeys(unknown_nums)) + "."
        )
    if unknown_names:
        problems.append(
            "Nombraste personas, titulos o ciclos que NO estan en los ejemplos: "
            + ", ".join(dict.fromkeys(unknown_names))
            + "."
        )
    return {
        "problems": problems,
        "unknown_numbers": list(dict.fromkeys(unknown_nums)),
        "unknown_names": list(dict.fromkeys(unknown_names)),
    }


# ----------------------------------------------------------------------------- plantilla determinista


def _pl(n: int, one: str, many: str) -> str:
    return one if n == 1 else many


def _trunc(text: str, n: int = 300) -> str:
    return text if len(text) <= n else text[: n - 1].rstrip() + "…"


def template_text(facts: DigestFacts, key: str) -> str:
    g = group(facts, key)
    n = g.count
    ex = g.examples[0] if getattr(g, "examples", None) else None
    if key == "cyclesToClose":
        t = (
            f"{n} ciclo activo ya terminó y falta cerrarlo."
            if n == 1
            else f"{n} ciclos activos ya terminaron y falta cerrarlos."
        )
        if ex:
            t += f" El primero es {ex.cycle_name}, que terminó hace {ex.days_past} días."
    elif key == "adaptationRequestsOpen":
        t = (
            f"{n} {_pl(n, 'solicitud de documento adaptado está abierta', 'solicitudes de documento adaptado están abiertas')}: "
            f"{g.overdue_count} vencidas y {g.unassigned_count} sin asignar."
        )
    elif key == "overdueCheckIns":
        t = f"{n} {_pl(n, 'resultado clave tiene', 'resultados clave tienen')} el check-in vencido."
        if ex:
            worst = max(g.examples, key=lambda e: e.days_overdue)
            t += f" El más atrasado es «{worst.kr_title}», de {worst.owner_name}, con {worst.days_overdue} días."
    elif key == "krsInRed":
        t = f"{n} {_pl(n, 'resultado clave está', 'resultados clave están')} en riesgo."
        if ex:
            t += f" Por ejemplo, «{ex.kr_title}», de {ex.owner_name}."
    elif key == "cyclesEndingSoon":
        if n == 1 and ex:
            t = f"El ciclo {ex.cycle_name} termina en {ex.days_left} días."
        else:
            t = f"{n} ciclos terminan en las próximas dos semanas."
            if ex:
                t += f" El primero es {ex.cycle_name}, en {ex.days_left} días."
    elif key == "draftsNotPublishable":
        t = f"{n} {_pl(n, 'objetivo en borrador todavía no se puede publicar', 'objetivos en borrador todavía no se pueden publicar')}."
        if ex:
            t += f" Por ejemplo, «{ex.objective_title}», de {ex.owner_name}, tiene {ex.kr_count} resultados clave."
    elif key == "usersWithoutTeam":
        t = f"{n} {_pl(n, 'persona activa no tiene equipo', 'personas activas no tienen equipo')}."
        if ex:
            t += f" Por ejemplo, {ex.user_name}."
    elif key == "teamsWithoutLead":
        t = f"{n} {_pl(n, 'equipo no tiene líder', 'equipos no tienen líder')}."
        if ex:
            t += f" Por ejemplo, {ex.team_name}."
    elif key == "adaptationsNeedingReview":
        t = f"{n} {_pl(n, 'texto adaptado necesita', 'textos adaptados necesitan')} revisión humana."
    else:  # recentSensitiveChanges
        t = f"{n} {_pl(n, 'cambio sensible', 'cambios sensibles')} en las últimas 72 horas."
        if ex:
            t += f" El último: {SENSITIVE_LABEL.get(ex.action, ex.action)} ({ex.entity_label}), hecho por {ex.actor_name}."
    return _trunc(t)


def template_summary(facts: DigestFacts) -> dict:
    keys = active_keys(facts)
    if not keys:
        return {"headline": "No hay nada urgente hoy.", "items": []}
    n = len(keys)
    return {
        "headline": f"Hay {n} {_pl(n, 'tema', 'temas')} para revisar hoy.",
        "items": [{"factKey": k, "text": template_text(facts, k)} for k in keys[:MAX_ITEMS]],
    }
