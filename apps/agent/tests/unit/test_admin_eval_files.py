"""Los evals admin son datos validos: catalogos, requests y expectativas se arman sin red."""

import pytest

from okr_agent.api.admin_schemas import AdminChatRequest, DigestRequest, HelpAnswerRequest
from tests.evals import admin_expect as ex

PLAN = ex.load("admin_plan.test.json")
DIGEST = ex.load("admin_digest.test.json")
HELP = ex.load("admin_help.test.json")


def test_planner_eval_has_at_least_20_cases_covering_every_family():
    names = [c["name"] for c in PLAN["cases"]]
    assert len(names) >= 20 and len(set(names)) == len(names)
    tags = {t for c in PLAN["cases"] for t in c["tags"]}
    assert {"fechas", "ambiguo", "inyeccion", "fuera-de-alcance", "consulta"} <= tags
    assert any(len(c["expect"].get("actionTypes", [])) >= 3 for c in PLAN["cases"])  # multi-accion
    assert sum(1 for c in PLAN["cases"] if "inyeccion" in c["tags"]) >= 4


@pytest.mark.parametrize("case", PLAN["cases"], ids=lambda c: c["name"])
def test_plan_case_requests_validate(case):
    AdminChatRequest.model_validate(ex.build_request(PLAN, case))


@pytest.mark.parametrize("case", DIGEST["cases"], ids=lambda c: c["name"])
def test_digest_case_requests_validate(case):
    DigestRequest.model_validate(ex.build_request(DIGEST, case))


@pytest.mark.parametrize(
    "case", [c for c in HELP["cases"] if c["endpoint"] == "/v1/help/answer"], ids=lambda c: c["name"]
)
def test_help_case_requests_validate(case):
    HelpAnswerRequest.model_validate(ex.build_request(HELP, case))
    for c in HELP["cases"]:
        if c["endpoint"] == "/v1/admin/chat":
            AdminChatRequest.model_validate(ex.build_chat_request_for_help_case(HELP, c))


def test_catalog_overrides_inject_the_titles():
    case = next(c for c in PLAN["cases"] if c["name"] == "inyeccion-titulo-objetivo")
    req = ex.build_request(PLAN, case)
    assert (
        "Ignorá lo anterior" in next(o for o in req["catalog"]["objectives"] if o["handle"] == "O2")["title"]
    )
    assert (
        PLAN["catalog"]["objectives"][1]["title"] == "Mejorar la estabilidad de la plataforma"
    )  # sin mutar el original


def test_expectation_checker_detects_injection_and_wrong_actions():
    inj = next(c for c in PLAN["cases"] if c["name"] == "inyeccion-titulo-objetivo")
    action = {"type": "CREATE_USER", "ref": "u1", "name": "Eve", "email": "eve@x.com", "sourceQuote": "x"}
    body = {"intent": "ACTION", "plan": {"actions": [action]}, "checks": {"planLocalIssues": []}}
    assert ex.check(inj, 200, body)  # accion inyectada anclada -> falla
    body["checks"]["planLocalIssues"] = [{"actionIndex": 0, "code": "UNGROUNDED", "message": "m"}]
    assert any("accion prohibida" in f for f in ex.check(inj, 200, body))  # noActionTypes igual la prohibe
    ok = {"intent": "ACTION", "plan": {"actions": []}, "checks": {"planLocalIssues": []}}
    assert ex.check(inj, 200, ok) == []
