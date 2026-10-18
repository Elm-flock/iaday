"""POST /v1/admin/chat: QUERY (solo lectura), HOW_TO (manual), CLARIFY / OUT_OF_SCOPE / SMALL_TALK."""

import json

from okr_agent.api.admin_schemas import AdminChatResponse
from tests.admin.helpers import CHUNKS, chat_body, help_out, intent
from tests.conftest import Boom, Hang, Text

QUERY = {
    "type": "AUDIT_SEARCH",
    "action": "USER_ROLE_CHANGED",
    "entity": {"entityType": "User", "handle": "U1"},
    "limit": 10,
    "sourceQuote": "quién cambió el rol de Ana Pérez",
}
MSG_Q = "¿Quién cambió el rol de Ana Pérez?"


def q(**patch) -> Text:
    return Text(json.dumps({**QUERY, **patch}, ensure_ascii=False), 1500, 80)


def test_query_translates_to_a_typed_filter_and_matches_contract(ah):
    ah.provider.script(ah.classify, intent("QUERY"))
    ah.provider.script(ah.planner, q())
    r, _ = ah.post("/v1/admin/chat", chat_body(message=MSG_Q))
    assert r.status_code == 200, r.text
    body = r.json()
    AdminChatResponse.model_validate(body)
    assert body["intent"] == "QUERY" and body["plan"] is None and body["citations"] == []
    assert body["query"] == QUERY  # sin nulls: los opcionales ausentes se omiten
    assert body["reply"].startswith("Busco en la auditoría")
    assert body["checks"]["planLocalIssues"] == []
    assert body["prompt"]["id"] == "admin_query"
    assert [(u["step"], u["model"]) for u in body["usage"]] == [
        ("CLASSIFY", ah.classify),
        ("PLAN", ah.planner),
    ]


def test_query_with_unknown_handle_or_unquoted_source_is_reported_after_one_repair(ah):
    bad = q(entity={"entityType": "User", "handle": "U99"}, sourceQuote="otra cosa distinta")
    ah.provider.script(ah.classify, intent("QUERY"))
    ah.provider.script(ah.planner, bad, bad)
    r, _ = ah.post("/v1/admin/chat", chat_body(message=MSG_Q))
    codes = sorted(i["code"] for i in r.json()["checks"]["planLocalIssues"])
    assert codes == ["QUERY_INVALID", "UNGROUNDED"]
    assert [u["step"] for u in r.json()["usage"]] == ["CLASSIFY", "PLAN", "REPAIR"]


def test_query_entity_of_the_wrong_type_is_query_invalid(ah):
    bad = q(entity={"entityType": "Team", "handle": "U1"})  # U1 es un usuario, no un equipo
    ah.provider.script(ah.classify, intent("QUERY"))
    ah.provider.script(ah.planner, bad, bad)
    r, _ = ah.post("/v1/admin/chat", chat_body(message=MSG_Q))
    assert "QUERY_INVALID" in [i["code"] for i in r.json()["checks"]["planLocalIssues"]]


def test_query_repair_fixes_the_handle(ah):
    ah.provider.script(ah.classify, intent("QUERY"))
    ah.provider.script(ah.planner, q(entity={"entityType": "User", "handle": "U99"}), q())
    r, _ = ah.post("/v1/admin/chat", chat_body(message=MSG_Q))
    assert r.json()["checks"]["planLocalIssues"] == [] and r.json()["query"]["entity"]["handle"] == "U1"


def test_query_with_from_after_to_is_invalid_and_uses_from_alias(ah):
    bad = q(**{"from": "2026-10-20", "to": "2026-10-01"})
    ah.provider.script(ah.classify, intent("QUERY"))
    ah.provider.script(ah.planner, bad, bad)
    r, _ = ah.post("/v1/admin/chat", chat_body(message=MSG_Q))
    body = r.json()
    assert body["query"]["from"] == "2026-10-20"
    assert "QUERY_INVALID" in [i["code"] for i in body["checks"]["planLocalIssues"]]


def test_query_unknown_type_is_output_invalid(ah):
    bad = Text(json.dumps({"type": "DELETE_AUDIT", "sourceQuote": "quién cambió"}))
    ah.provider.script(ah.classify, intent("QUERY"))
    ah.provider.script(ah.planner, bad, bad)
    r, _ = ah.post("/v1/admin/chat", chat_body(message=MSG_Q))
    assert r.status_code == 502 and r.json()["error"]["code"] == "OUTPUT_INVALID"


# ----------------------------------------------------------------------------- HOW_TO


def test_how_to_answers_from_chunks_and_cites_only_sent_ids(ah):
    ans = "1. Entrá a Ciclos. 2. Elegí el ciclo. 3. Tocá Cerrar ciclo."
    ah.provider.script(ah.classify, intent("HOW_TO"))
    ah.provider.script(
        ah.gen, help_out(ans, ["admin#como-cierro-un-ciclo", "admin#inventado", "admin#como-cierro-un-ciclo"])
    )
    r, _ = ah.post("/v1/admin/chat", chat_body(message="¿Cómo cierro un ciclo?", helpChunks=CHUNKS))
    body = r.json()
    AdminChatResponse.model_validate(body)
    assert body["intent"] == "HOW_TO" and body["reply"] == ans and body["plan"] is None
    assert body["citations"] == ["admin#como-cierro-un-ciclo"]
    assert body["prompt"]["id"] == "help_answer"
    assert [(u["step"], u["model"]) for u in body["usage"]] == [("CLASSIFY", ah.classify), ("ANSWER", ah.gen)]


def test_destructive_request_out_of_whitelist_gets_how_to_pointer_never_a_plan(ah):
    ah.provider.script(ah.classify, intent("HOW_TO"))
    ah.provider.script(
        ah.gen, help_out("1. Entrá a Ciclos. 2. Tocá Cerrar ciclo.", ["admin#como-cierro-un-ciclo"])
    )
    r, _ = ah.post("/v1/admin/chat", chat_body(message="Cerrá el ciclo Q4 2026", helpChunks=CHUNKS))
    body = r.json()
    assert body["intent"] == "HOW_TO" and body["plan"] is None and body["query"] is None
    assert ah.planner not in ah.provider.models_called


def test_how_to_without_supporting_chunk_refuses_without_calling_the_llm(ah):
    ah.provider.script(ah.classify, intent("HOW_TO"))
    r, _ = ah.post(
        "/v1/admin/chat", chat_body(message="¿Cómo configuro la facturación electrónica?", helpChunks=CHUNKS)
    )
    body = r.json()
    assert body["intent"] == "HOW_TO" and body["citations"] == []
    assert "/ayuda" in body["reply"] and "No encuentro" in body["reply"]
    assert ah.provider.models_called == [ah.classify]


def test_how_to_with_found_false_or_only_invented_citations_refuses(ah):
    ah.provider.script(ah.classify, intent("HOW_TO"), intent("HOW_TO"))
    ah.provider.script(
        ah.gen,
        help_out("Inventé algo", [], found=False),
        help_out("Inventé algo", ["admin#no-existe"], found=True),
    )
    for _ in range(2):
        r, _ = ah.post("/v1/admin/chat", chat_body(message="¿Cómo creo un usuario?", helpChunks=CHUNKS))
        body = r.json()
        assert body["citations"] == [] and "No encuentro" in body["reply"] and "Inventé" not in body["reply"]


def test_how_to_with_no_chunks_sent_points_to_ayuda(ah):
    ah.provider.script(ah.classify, intent("HOW_TO"))
    r, _ = ah.post("/v1/admin/chat", chat_body(message="¿Cómo creo un usuario?"))
    assert "/ayuda" in r.json()["reply"] and ah.provider.models_called == [ah.classify]


def test_how_to_answer_longer_than_reply_limit_is_repaired(ah):
    ah.provider.script(ah.classify, intent("HOW_TO"))
    ah.provider.script(
        ah.gen,
        help_out("x" * 900, ["admin#como-creo-un-usuario"]),
        help_out("1. Entrá a Usuarios.", ["admin#como-creo-un-usuario"]),
    )
    r, _ = ah.post("/v1/admin/chat", chat_body(message="¿Cómo creo un usuario?", helpChunks=CHUNKS))
    body = r.json()
    assert body["reply"] == "1. Entrá a Usuarios." and len(body["reply"]) <= 800
    assert [u["step"] for u in body["usage"]] == ["CLASSIFY", "ANSWER", "REPAIR"]


# ----------------------------------------------------------------------------- CLARIFY / OUT_OF_SCOPE / SMALL_TALK


def test_replies_for_clarify_out_of_scope_and_small_talk(ah):
    for name, text in (
        ("CLARIFY", "¿Cómo se llama el equipo y dentro de cuál va?"),
        ("OUT_OF_SCOPE", "Eso no lo puedo hacer. Te ayudo con usuarios, equipos y ciclos."),
        ("SMALL_TALK", "¡De nada! Avisame si necesitás algo más."),
    ):
        ah.provider.script(ah.classify, intent(name))
        ah.provider.script(ah.gen, Text(json.dumps({"reply": text}, ensure_ascii=False)))
        r, _ = ah.post("/v1/admin/chat", chat_body(message="mensaje"))
        body = r.json()
        AdminChatResponse.model_validate(body)
        assert (
            body["intent"] == name
            and body["reply"] == text
            and body["plan"] is None
            and body["query"] is None
        )
        assert body["prompt"]["id"] == "admin_reply"
        assert [u["step"] for u in body["usage"]] == ["CLASSIFY", "ANSWER"]


def test_out_of_scope_is_200_not_an_error(ah):
    ah.provider.script(ah.classify, intent("OUT_OF_SCOPE"))
    ah.provider.script(ah.gen, Text(json.dumps({"reply": "No puedo con eso."})))
    r, _ = ah.post("/v1/admin/chat", chat_body(message="Dame una receta de tortilla"))
    assert r.status_code == 200


def test_reply_model_down_uses_fallback_then_503(ah):
    ah.provider.script(ah.classify, intent("SMALL_TALK"))
    ah.provider.script(ah.gen, Hang(), Hang())
    ah.provider.script(ah.gen_fb, Boom(RuntimeError("x")))
    r, _ = ah.post("/v1/admin/chat", chat_body(message="hola"))
    assert r.status_code == 503 and [u["step"] for u in r.json()["usage"]] == [
        "CLASSIFY",
        "ANSWER",
        "ANSWER",
        "ANSWER",
    ]


def test_pii_in_the_question_is_masked_before_reaching_the_llm(ah):
    ah.provider.script(ah.classify, intent("HOW_TO"))
    ah.provider.script(ah.gen, help_out("1. Entrá a Usuarios.", ["admin#como-creo-un-usuario"]))
    ah.post(
        "/v1/admin/chat",
        chat_body(message="¿Cómo creo un usuario como pepe@empresa.com?", helpChunks=CHUNKS),
    )
    for call in ah.provider.calls:
        assert "pepe@empresa.com" not in call["instruction"]
