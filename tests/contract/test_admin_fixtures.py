"""Contrato de la extension admin (docs/ai/agent-contract-admin.md): los fixtures de tests/contract/fixtures/admin
validan contra los schemas ESTRICTOS y el agente produce la misma forma. NestJS usa los mismos fixtures.
"""

import json
from pathlib import Path

import pytest

from okr_agent.api.admin_schemas import (
    AdminChatRequest,
    AdminChatResponse,
    DigestRequest,
    DigestResponse,
    HelpAnswerRequest,
    HelpAnswerResponse,
)
from okr_agent.api.schemas import ErrorResponse
from tests.admin.helpers import intent, planner_out
from tests.conftest import Boom, Hang, Text
from tests.contract.test_contract_fixtures import keys_only, shape

FIX = Path(__file__).parent / "fixtures" / "admin"
NAMES = [
    "chat-action-ok",
    "chat-query-audit",
    "chat-howto-ok",
    "chat-clarify",
    "chat-injection-rejected",
    "chat-plan-ungrounded",
    "chat-plan-repair",
    "digest-ok",
    "digest-fallback",
    "help-answer-ok",
    "help-answer-not-found",
    "error-model-unavailable",
]
REQ = {
    "/v1/admin/chat": AdminChatRequest,
    "/v1/admin/digest-summary": DigestRequest,
    "/v1/help/answer": HelpAnswerRequest,
}
RESP = {
    "/v1/admin/chat": AdminChatResponse,
    "/v1/admin/digest-summary": DigestResponse,
    "/v1/help/answer": HelpAnswerResponse,
}


def load(name):
    return json.loads((FIX / f"{name}.json").read_text(encoding="utf-8"))


def test_all_admin_fixtures_present():
    assert sorted(p.stem for p in FIX.glob("*.json")) == sorted(NAMES)


@pytest.mark.parametrize("name", NAMES)
def test_fixture_validates_against_strict_schemas(name):
    fx = load(name)
    REQ[fx["endpoint"]].model_validate(fx["request"])
    model = ErrorResponse if fx["status"] != 200 else RESP[fx["endpoint"]]
    parsed = model.model_validate(fx["response"])  # extra=forbid: un campo de mas o de menos falla
    dumped = parsed.model_dump(by_alias=True, mode="json")
    if fx["status"] == 200 and fx["endpoint"] == "/v1/admin/chat":
        if parsed.plan:
            dumped["plan"] = parsed.plan.model_dump(by_alias=True, mode="json", exclude_none=True)
        if parsed.query:
            dumped["query"] = parsed.query.model_dump(by_alias=True, mode="json", exclude_none=True)
    assert keys_only(dumped) == keys_only(fx["response"])


def test_new_usage_steps_are_only_in_admin_fixtures():
    steps = {u["step"] for n in NAMES for u in load(n)["response"]["usage"]}
    assert {"PLAN", "ANSWER", "SUMMARIZE", "REPAIR", "CLASSIFY"} >= steps


def test_ungrounded_fixture_is_really_ungrounded_and_action_fixture_is_grounded():
    from okr_agent.agent.admin.local_checks import admin_messages, check_plan
    from okr_agent.agent.admin.plan_models import Plan

    for name, expected in (("chat-action-ok", []), ("chat-plan-ungrounded", ["UNGROUNDED"])):
        fx = load(name)
        req = AdminChatRequest.model_validate(fx["request"])
        plan = Plan.model_validate(fx["response"]["plan"])
        issues = check_plan(plan, req.catalog, admin_messages(req.message, req.history))
        assert [i.code for i in issues] == expected
        assert [i["code"] for i in fx["response"]["checks"]["planLocalIssues"]] == expected


# ----------------------------------------------------------------------------- el agente produce la misma forma


def _mask_email(plan: dict) -> dict:
    p = json.loads(json.dumps(plan).replace("lucia.gomez@flockit.com.ar", "[EMAIL_1]"))
    return p


def _run(h, fx):
    r, tid = h.post(fx["endpoint"], fx["request"])
    return r, tid


def _check_shape(r, tid, fx):
    body = r.json()
    assert r.status_code == fx["status"], r.text
    assert keys_only(body) == keys_only(fx["response"])
    assert body["traceId"] == tid
    if fx["response"]["usage"]:
        assert shape(body["usage"]) == shape(fx["response"]["usage"])
    return body


def test_action_ok(ah):
    fx = load("chat-action-ok")
    ah.provider.script(ah.classify, intent("ACTION"))
    ah.provider.script(ah.planner, Text(planner_out(_mask_email(fx["response"]["plan"]))))
    r, tid = _run(ah, fx)
    body = _check_shape(r, tid, fx)
    assert body["plan"] == fx["response"]["plan"] and body["reply"] == fx["response"]["reply"]
    assert body["checks"] == fx["response"]["checks"]


def test_plan_ungrounded(ah):
    fx = load("chat-plan-ungrounded")
    bad = Text(planner_out(_mask_email(fx["response"]["plan"])))
    ah.provider.script(ah.classify, intent("ACTION"))
    ah.provider.script(ah.planner, bad, bad)
    r, tid = _run(ah, fx)
    body = _check_shape(r, tid, fx)
    assert body["checks"]["planLocalIssues"] == fx["response"]["checks"]["planLocalIssues"]
    assert [u["step"] for u in body["usage"]] == ["CLASSIFY", "PLAN", "REPAIR"]


def test_plan_repair(ah):
    fx = load("chat-plan-repair")
    ah.provider.script(ah.planner, Text(planner_out(_mask_email(fx["response"]["plan"]))))
    r, tid = _run(ah, fx)
    body = _check_shape(r, tid, fx)
    assert body["plan"] == fx["response"]["plan"] and [u["step"] for u in body["usage"]] == ["REPAIR"]


def test_query_audit(ah):
    fx = load("chat-query-audit")
    ah.provider.script(ah.classify, intent("QUERY"))
    ah.provider.script(ah.planner, Text(json.dumps(fx["response"]["query"], ensure_ascii=False)))
    r, tid = _run(ah, fx)
    body = _check_shape(r, tid, fx)
    assert body["query"] == fx["response"]["query"] and body["plan"] is None


def test_howto_ok(ah):
    fx = load("chat-howto-ok")
    ah.provider.script(ah.classify, intent("HOW_TO"))
    ah.provider.script(
        ah.gen,
        Text(
            json.dumps(
                {"answer": fx["response"]["reply"], "citations": fx["response"]["citations"], "found": True}
            )
        ),
    )
    r, tid = _run(ah, fx)
    body = _check_shape(r, tid, fx)
    assert body["reply"] == fx["response"]["reply"] and body["citations"] == fx["response"]["citations"]


def test_clarify(ah):
    fx = load("chat-clarify")
    ah.provider.script(ah.classify, intent("CLARIFY"))
    ah.provider.script(ah.gen, Text(json.dumps({"reply": fx["response"]["reply"]}, ensure_ascii=False)))
    r, tid = _run(ah, fx)
    body = _check_shape(r, tid, fx)
    assert body["reply"] == fx["response"]["reply"] and body["intent"] == "CLARIFY"


def test_injection_rejected(ah):
    fx = load("chat-injection-rejected")
    ah.provider.script(ah.classify, intent("ACTION", injection=True))
    r, tid = _run(ah, fx)
    body = _check_shape(r, tid, fx)
    assert body["error"] == fx["response"]["error"]


def test_error_model_unavailable(ah):
    fx = load("error-model-unavailable")
    ah.provider.script(ah.classify, intent("ACTION"))
    ah.provider.script(ah.planner, Hang(), Hang())
    ah.provider.script(ah.planner_fb, Boom(RuntimeError("x")))
    r, tid = _run(ah, fx)
    body = _check_shape(r, tid, fx)
    assert body["error"]["code"] == fx["response"]["error"]["code"]
    assert [u["step"] for u in body["usage"]] == [u["step"] for u in fx["response"]["usage"]]


def test_digest_ok_and_fallback(ah):
    ok = load("digest-ok")
    ah.provider.script(ah.summarize, Text(json.dumps(ok["response"]["summary"], ensure_ascii=False)))
    r, tid = _run(ah, ok)
    body = _check_shape(r, tid, ok)
    assert body["summary"] == ok["response"]["summary"] and body["checks"] == ok["response"]["checks"]

    fb = load("digest-fallback")
    bad = json.loads(json.dumps(fb["response"]["summary"]))
    bad["items"][0]["text"] = "9 resultados clave tienen el check-in vencido."
    ah.provider.script(ah.summarize, Text(json.dumps(bad)), Text(json.dumps(bad)))
    r, tid = _run(ah, fb)
    body = _check_shape(r, tid, fb)
    assert body["summary"] == fb["response"]["summary"] and body["checks"] == fb["response"]["checks"]


def test_help_answer_ok_and_not_found(ah):
    ok = load("help-answer-ok")
    ah.provider.script(
        ah.gen,
        Text(
            json.dumps(
                {"answer": ok["response"]["answer"], "citations": ok["response"]["citations"], "found": True}
            )
        ),
    )
    r, tid = _run(ah, ok)
    body = _check_shape(r, tid, ok)
    assert body["answer"] == ok["response"]["answer"] and body["citations"] == ok["response"]["citations"]

    nf = load("help-answer-not-found")
    r, tid = _run(ah, nf)
    body = _check_shape(r, tid, nf)
    assert body["found"] is False and body["answer"] == nf["response"]["answer"] and body["usage"] == []
