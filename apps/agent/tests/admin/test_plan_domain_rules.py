"""Bug asistente-planes: el planner proponia QUARTER sin ANNUAL padre e inventaba handles de planes no confirmados.

Todo con FakeLlm (sin red): chequeo local de jerarquia de ciclos, REPAIR que cambia de estrategia y ruteo del clasificador.
"""

import pytest

from okr_agent.agent.admin.local_checks import check_plan
from okr_agent.agent.admin.plan_models import Plan
from okr_agent.api.admin_schemas import Catalog
from tests.admin.helpers import CATALOG, chat_body, intent, planner_out
from tests.conftest import Text

MSG = "Creá el ciclo trimestral Q1 2027 del 1 de enero al 31 de marzo de 2027"
QUOTE = "Creá el ciclo trimestral Q1 2027"
HIST_PROPOSED = [
    {"role": "ADMIN", "text": "hace el ciclo anual 2027. " + MSG},
    {
        "role": "ASSISTANT",
        "text": "Preparé un plan con 1 paso. [Plan PROPUESTO, todavía sin confirmar: nada de esto existe aún]",
    },
]


def existing(handle):
    return {"kind": "EXISTING", "handle": handle}


def new(ref):
    return {"kind": "NEW", "ref": ref}


def quarter(parent=None, start="2027-01-01", end="2027-03-31", ref="c2"):
    a = {
        "type": "CREATE_CYCLE",
        "ref": ref,
        "name": "Q1 2027",
        "kind": "QUARTER",
        "startDate": start,
        "endDate": end,
        "sourceQuote": QUOTE,
    }
    if parent:
        a["parent"] = parent
    return a


def annual(ref="c1", start="2027-01-01", end="2027-12-31"):
    return {
        "type": "CREATE_CYCLE",
        "ref": ref,
        "name": "2027",
        "kind": "ANNUAL",
        "startDate": start,
        "endDate": end,
        "sourceQuote": QUOTE,
    }


def plan_of(*actions, assumptions=()):
    return {"summary": "Voy a crear el ciclo.", "assumptions": list(assumptions), "actions": list(actions)}


def issues_for(*actions):
    plan = Plan.model_validate(plan_of(*actions))
    return check_plan(plan, Catalog.model_validate(CATALOG), [MSG])


# ----------------------------------------------------------------------------- chequeo local de jerarquia
def test_quarter_without_parent_is_rejected():
    out = issues_for(quarter())
    assert [i.code for i in out] == ["DTO_INVALID"] and "ANNUAL como padre" in out[0].message


def test_quarter_under_new_annual_is_ok_and_annual_must_come_first():
    assert issues_for(annual(), quarter(new("c1"), ref="c2")) == []
    assert [i.code for i in issues_for(quarter(new("c1")), annual())] == ["UNKNOWN_REF"]


def test_quarter_under_existing_annual_that_covers_it_is_ok():
    assert issues_for(quarter(existing("C2"), "2026-04-01", "2026-06-30")) == []


@pytest.mark.parametrize(
    ("action", "needle"),
    [
        (quarter(existing("C2")), "dentro de las fechas"),  # C2 es 2026, el trimestre es 2027
        (quarter(existing("C1"), "2026-10-01", "2026-12-31"), "debe ser un ciclo ANNUAL"),  # C1 es QUARTER
        (quarter(existing("C2"), "2026-12-01", "2026-12-31"), "se solapa"),  # solapa con Q4 2026 (hijo de C2)
    ],
)
def test_quarter_domain_violations_use_catalog_data(action, needle):
    out = issues_for(action)
    assert [i.code for i in out] == ["DTO_INVALID"] and needle in out[0].message


def test_quarter_outside_a_new_annual_and_overlap_between_new_quarters():
    out = issues_for(annual(end="2027-02-28"), quarter(new("c1"), ref="c2"))
    assert "dentro de las fechas" in out[0].message
    both = issues_for(
        annual(), quarter(new("c1"), ref="c2"), quarter(new("c1"), "2027-03-01", "2027-06-30", "c3")
    )
    assert [i.code for i in both] == ["DTO_INVALID"] and "se solapa" in both[0].message


def test_annual_with_parent_still_rejected_once():
    out = issues_for({**annual(), "parent": existing("C2")})
    assert [i.code for i in out] == ["DTO_INVALID"] and "anual no tiene" in out[0].message


# ----------------------------------------------------------------------------- repair que cambia de estrategia
def test_repair_after_unknown_handle_gets_guidance_and_new_strategy_is_accepted(ah):
    invented = plan_of(quarter(existing("C9")), assumptions=["El ciclo 2027 ya existe como C9."])
    fixed = plan_of(
        annual(),
        quarter(new("c1"), ref="c2"),
        assumptions=["No hay un ciclo anual 2027 en el catálogo: lo creo primero."],
    )
    ah.provider.script(ah.classify, intent("ACTION"))
    ah.provider.script(
        ah.planner, Text(planner_out(invented), 2100, 380), Text(planner_out(fixed), 2100, 380)
    )
    r, _ = ah.post("/v1/admin/chat", chat_body(message=MSG, history=HIST_PROPOSED))
    assert r.status_code == 200, r.text
    body = r.json()
    assert [u["step"] for u in body["usage"]] == ["CLASSIFY", "PLAN", "REPAIR"]
    assert body["checks"]["planLocalIssues"] == []
    actions = body["plan"]["actions"]
    assert [(a["type"], a["kind"]) for a in actions] == [
        ("CREATE_CYCLE", "ANNUAL"),
        ("CREATE_CYCLE", "QUARTER"),
    ]
    assert actions[1]["parent"] == {"kind": "NEW", "ref": "c1"}
    note = ah.provider.calls_for(ah.planner)[1]["instruction"]
    assert "UNKNOWN_HANDLE" in note and "C9" in note
    assert "Cambiá de estrategia" in note and "NO EXISTE" in note
    assert "ciclos: C1, C2, C3" in note  # handles validos del catalogo actual


def test_repair_from_nest_also_carries_the_guidance(ah):
    repair = {
        "previousPlan": plan_of(quarter(existing("C3"))),
        "issues": [{"actionIndex": 0, "code": "UNKNOWN_HANDLE", "message": "el handle C3 no existe"}],
    }
    ah.provider.script(ah.planner, Text(planner_out(plan_of(annual(), quarter(new("c1"), ref="c2"))), 1, 1))
    r, _ = ah.post("/v1/admin/chat", chat_body(message=MSG, repair=repair))
    assert r.status_code == 200, r.text
    note = ah.provider.calls_for(ah.planner)[0]["instruction"]
    assert "Handles válidos ahora" in note and "Cambiá de estrategia" in note


def test_dto_invalid_hierarchy_note_mentions_domain_rules(ah):
    ah.provider.script(ah.classify, intent("ACTION"))
    ah.provider.script(
        ah.planner,
        Text(planner_out(plan_of(quarter())), 1, 1),
        Text(planner_out(plan_of(annual(), quarter(new("c1"), ref="c2"))), 1, 1),
    )
    r, _ = ah.post("/v1/admin/chat", chat_body(message=MSG))
    assert r.json()["checks"]["planLocalIssues"] == []
    assert "un QUARTER necesita un ANNUAL" in ah.provider.calls_for(ah.planner)[1]["instruction"]


# ----------------------------------------------------------------------------- prompts v2 / ruteo
def test_planner_v2_prompt_carries_domain_rules_and_history_markers(ah):
    ah.provider.script(ah.classify, intent("ACTION"))
    ah.provider.script(ah.planner, Text(planner_out(plan_of(annual(), quarter(new("c1"), ref="c2"))), 1, 1))
    r, _ = ah.post("/v1/admin/chat", chat_body(message="damelo nuevamente", history=HIST_PROPOSED))
    assert r.json()["prompt"]["version"] == "2"
    instr = ah.provider.calls_for(ah.planner)[0]["instruction"]
    assert "Plan PROPUESTO, todavía sin confirmar" in instr  # el historial anotado llega al planner
    for rule in (
        "NUNCA tiene padre",
        "SIEMPRE tiene como padre",
        "5 objetivos",
        "5 KRs",
        "NUNCA inventes un handle",
    ):
        assert rule in instr


def test_classifier_v2_routes_vague_followups_to_action_not_query(ah):
    """Con FakeLlm el modelo es guion: se verifica que el prompt v2 llega con la conversacion y las reglas, y que
    un ACTION del clasificador va al planner (no a la auditoria)."""
    hist = [
        {"role": "ADMIN", "text": MSG},
        {"role": "ASSISTANT", "text": "No pude armar el plan. [Plan INVÁLIDO: no se puede ejecutar]"},
    ]
    ah.provider.script(ah.classify, intent("ACTION"))
    ah.provider.script(ah.planner, Text(planner_out(plan_of(annual(), quarter(new("c1"), ref="c2"))), 1, 1))
    r, _ = ah.post("/v1/admin/chat", chat_body(message="busca lo que necesites", history=hist))
    body = r.json()
    assert body["intent"] == "ACTION" and body["query"] is None
    classify_call = ah.provider.calls_for(ah.classify)[0]["instruction"]
    assert "[Plan INVÁLIDO" in classify_call and "busca lo que necesites" in classify_call
    assert "NUNCA es QUERY" in classify_call and body["usage"][0]["step"] == "CLASSIFY"


def test_new_annual_that_duplicates_an_existing_covering_annual_is_rejected():
    cat = {
        **CATALOG,
        "cycles": [
            *CATALOG["cycles"],
            {
                **CATALOG["cycles"][1],
                "handle": "C4",
                "name": "2027",
                "startDate": "2027-01-01",
                "endDate": "2027-12-31",
                "status": "DRAFT",
            },
        ],
    }
    plan = Plan.model_validate(plan_of(annual(), quarter(new("c1"), ref="c2")))
    out = check_plan(plan, Catalog.model_validate(cat), [MSG])
    assert [i.code for i in out] == ["DTO_INVALID"] and "Ya existe el ciclo ANNUAL C4" in out[0].message
    assert out[0].action_index == 0
