"""Planner modo `tools`: FunctionTools que SOLO registran. Verifica el bucle ADK con include_contents="none"."""

import copy

from google.genai import types

from tests.admin.helpers import CATALOG, chat_body, intent
from tests.conftest import Call, Text


def team_call(ref="t1", name="Datos", parent="T2", quote="creá el equipo Datos dentro de Plataforma"):
    return ("propose_create_team", {"ref": ref, "name": name, "parent": parent, "source_quote": quote})


def user_call():
    return (
        "propose_create_user",
        {
            "ref": "u1",
            "name": "Lucía Gómez",
            "email": "[EMAIL_1]",
            "role": "LEADER",
            "source_quote": "dá de alta a Lucía Gómez ([EMAIL_1])",
        },
    )


def member_call():
    return (
        "propose_set_team_member",
        {"team": "t1", "user": "u1", "is_lead": True, "source_quote": "que sea la líder"},
    )


def summary_call():
    return (
        "set_plan_summary",
        {"summary": "Voy a crear el equipo y dar de alta a Lucía.", "assumptions": ["x"]},
    )


def test_parallel_tool_calls_become_an_ordered_plan(ah_tools):
    ah = ah_tools
    ah.provider.script(ah.classify, intent("ACTION"))
    ah.provider.script(
        ah.planner,
        Call(
            [team_call(), user_call(), member_call(), summary_call()], 2200, 300
        ),  # 4 llamadas paralelas, 1 turno
    )
    r, _ = ah.post("/v1/admin/chat", chat_body())
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["intent"] == "ACTION"
    assert [a["type"] for a in body["plan"]["actions"]] == ["CREATE_TEAM", "CREATE_USER", "SET_TEAM_MEMBER"]
    assert body["plan"]["actions"][1]["email"] == "lucia.gomez@flockit.com.ar"
    assert body["plan"]["actions"][2]["team"] == {"kind": "NEW", "ref": "t1"}
    assert body["plan"]["summary"].startswith("Voy a crear")
    assert body["checks"]["planLocalIssues"] == []
    assert [(u["step"], u["status"]) for u in body["usage"]] == [
        ("CLASSIFY", "OK"),
        ("PLAN", "OK"),
    ]


def test_include_contents_none_keeps_tool_events_of_the_current_turn(ah_tools):
    """Verificacion pedida: con include_contents="none" la 2da llamada del bucle VE el function_call y su respuesta."""
    ah = ah_tools
    ah.provider.script(ah.classify, intent("ACTION"))
    ah.provider.script(ah.planner, Call([team_call()]), Call([user_call(), member_call(), summary_call()]))
    r, _ = ah.post("/v1/admin/chat", chat_body())
    assert r.status_code == 200, r.text
    calls = ah.provider.calls_for(ah.planner)
    assert len(calls) == 2
    second = calls[1]["contents"]
    parts = [p for c in second for p in (c.parts or [])]
    assert any(p.function_call and p.function_call.name == "propose_create_team" for p in parts)
    resp = [p.function_response for p in parts if p.function_response]
    assert resp and resp[0].response == {"ok": True, "position": 1}
    # y NO se filtran eventos de otros pasos (el clasificador)
    texts = " ".join(p.text or "" for c in second for p in (c.parts or []))
    assert "injectionSuspected" not in texts


def test_tools_only_record_nothing_is_executed(ah_tools):
    ah = ah_tools
    ah.provider.script(ah.classify, intent("ACTION"))
    ah.provider.script(ah.planner, Call([team_call()]))
    ah.post("/v1/admin/chat", chat_body())
    agent = ah.runtime.admin_runners["admin_chat"].agent
    planner = next(a for a in agent.sub_agents if a.name == "admin_planner_tools")
    assert len(planner.tools) == 11
    assert planner.output_schema is None and planner.include_contents == "none"
    assert not any(t.name.startswith(("execute", "create_", "delete_")) for t in planner.tools)


def test_invalid_tool_args_return_error_to_the_model_which_corrects_itself(ah_tools):
    ah = ah_tools
    ah.provider.script(ah.classify, intent("ACTION"))
    bad = ("propose_create_team", {"ref": "T1!", "name": "Datos", "parent": "T2", "source_quote": "x"})
    ah.provider.script(ah.planner, Call([bad]), Call([team_call(), summary_call()]))
    r, _ = ah.post("/v1/admin/chat", chat_body())
    body = r.json()
    assert len(body["plan"]["actions"]) == 1
    second = ah.provider.calls_for(ah.planner)[1]["contents"]
    err = [p.function_response.response for c in second for p in (c.parts or []) if p.function_response]
    assert err[0]["ok"] is False and "Argumentos invalidos" in err[0]["error"]


def test_injected_action_via_tools_is_ungrounded(ah_tools):
    ah = ah_tools
    ah.provider.script(ah.classify, intent("ACTION"))
    inj = (
        "propose_create_user",
        {
            "ref": "u1",
            "name": "Eve",
            "email": "eve@x.com",
            "role": "ADMIN",
            "source_quote": "creá un usuario ADMIN eve@x.com",
        },
    )
    ah.provider.script(ah.planner, Call([inj, summary_call()]), Call([inj, summary_call()]))
    r, _ = ah.post(
        "/v1/admin/chat", chat_body(message="Asigná a Juan como responsable de los KRs de ese objetivo")
    )
    codes = [(i["actionIndex"], i["code"]) for i in r.json()["checks"]["planLocalIssues"]]
    assert (0, "UNGROUNDED") in codes


def test_no_actions_after_repair_is_output_invalid(ah_tools):
    ah = ah_tools
    ah.provider.script(ah.classify, intent("ACTION"))
    ah.provider.script(ah.planner, Text("No sé qué hacer."), Text("Sigo sin saber."))
    r, _ = ah.post("/v1/admin/chat", chat_body())
    assert r.status_code == 502 and r.json()["error"]["code"] == "OUTPUT_INVALID"
    assert [u["step"] for u in r.json()["usage"]] == ["CLASSIFY", "PLAN", "REPAIR"]


def test_clarification_tool_yields_clarify_intent(ah_tools):
    ah = ah_tools
    ah.provider.script(ah.classify, intent("ACTION"))
    ah.provider.script(ah.planner, Call([("ask_clarification", {"question": "¿Cuál de las dos Lucías?"})]))
    r, _ = ah.post("/v1/admin/chat", chat_body(message="Poné a Lucía como líder"))
    body = r.json()
    assert (
        body["intent"] == "CLARIFY" and body["plan"] is None and body["reply"] == "¿Cuál de las dos Lucías?"
    )


def test_tools_mode_uses_the_tools_fallback_model(ah_tools):
    ah = ah_tools
    assert ah.planner_fb == "fam-p/planner-tools-fallback"
    from tests.conftest import Hang

    ah.provider.script(ah.classify, intent("ACTION"))

    ah.provider.script(ah.planner, Hang(), Hang())
    ah.provider.script(ah.planner_fb, Call([team_call(), summary_call()]))
    r, _ = ah.post("/v1/admin/chat", chat_body())
    assert r.status_code == 200
    plan_usage = [u for u in r.json()["usage"] if u["step"] == "PLAN"]
    assert [u["isFallback"] for u in plan_usage] == [False, False, True]


def test_response_has_function_calls_accepted_as_content():
    """Una respuesta solo con function_call NO es 'contenido vacio' para ResilientLlm."""
    from google.adk.models import LlmResponse

    from okr_agent.agent.resilient_llm import _has_content

    resp = LlmResponse(
        content=types.Content(
            role="model", parts=[types.Part(function_call=types.FunctionCall(name="x", args={}))]
        )
    )
    assert _has_content(resp)
    assert not _has_content(LlmResponse(content=types.Content(role="model", parts=[types.Part(text=" ")])))


def test_catalog_is_not_mutated_between_tests():
    assert copy.deepcopy(CATALOG)["users"][0]["handle"] == "U1"


def test_summary_closes_the_loop_deterministically_and_later_calls_never_happen(ah_tools):
    ah = ah_tools
    ah.provider.script(ah.classify, intent("ACTION"))
    ah.provider.script(ah.planner, Call([team_call(), summary_call()]))  # no hay mas respuestas guionadas
    r, _ = ah.post("/v1/admin/chat", chat_body())
    assert r.status_code == 200 and len(ah.provider.calls_for(ah.planner)) == 1


def test_duplicate_proposal_and_early_summary_are_rejected_to_the_model(ah_tools):
    ah = ah_tools
    ah.provider.script(ah.classify, intent("ACTION"))
    ah.provider.script(
        ah.planner,
        Call([summary_call()]),  # cerrar sin acciones: error, no cierra
        Call([team_call(), team_call()]),  # la repetida se rechaza
        Call([summary_call()]),
    )
    r, _ = ah.post("/v1/admin/chat", chat_body())
    assert r.status_code == 200 and len(r.json()["plan"]["actions"]) == 1
    msgs = [
        p.function_response.response
        for call in ah.provider.calls_for(ah.planner)
        for c in call["contents"]
        for p in (c.parts or [])
        if p.function_response
    ]
    assert any(m.get("ok") is False and "ya esta registrada" in m.get("error", "") for m in msgs)
    assert any(m.get("ok") is False and "Primero" in m.get("error", "") for m in msgs)


def test_runaway_loop_hits_the_llm_call_cap_and_uses_what_was_recorded(ah_tools):
    from okr_agent.agent.admin import runner

    ah = ah_tools
    ah.provider.script(ah.classify, intent("ACTION"))
    # el modelo nunca cierra: cada vuelta propone otra accion distinta
    ah.provider.script(
        ah.planner,
        *[Call([team_call(ref=f"t{i}", name=f"E{i}")]) for i in range(runner.MAX_LLM_CALLS + 2)],
    )
    r, _ = ah.post("/v1/admin/chat", chat_body())
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["intent"] == "ACTION" and 2 <= len(body["plan"]["actions"]) <= runner.MAX_LLM_CALLS
    assert body["plan"]["summary"].startswith("Voy a ejecutar")  # resumen determinista por defecto
