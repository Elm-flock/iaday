"""/v1/okr-suggest y /v1/checkin-summary de punta a punta."""

import copy
import json

from tests.conftest import CLASSIFY_OK, JUDGE_BAD, JUDGE_OK, Hang, Text

OKR_REQUEST = {
    "cycleKind": "QUARTER",
    "objective": {"title": "mejorar soporte", "description": None, "type": "COMMITTED"},
    "keyResults": [
        {"title": "hacer runbooks", "unit": None, "startValue": None, "targetValue": None},
        {
            "title": "bajar tiempo de resolución P1",
            "unit": "h",
            "startValue": "8",
            "targetValue": "4",
        },
    ],
}


def okr_output(*, kr2_start="8", kr2_target="4", extra_kr=False, kr1_proposed=False):
    krs = [
        {
            "title": "Cubrir con runbook el 100 % de los tipos de incidencia P1 recurrentes",
            "unit": "%",
            "startValue": "0",
            "targetValue": "100",
            "rationale": "Convierte la actividad en un resultado medible.",
            "proposedValues": kr1_proposed,
        },
        {
            "title": "Reducir el tiempo medio de resolución de incidencias P1 de 8 h a 4 h",
            "unit": "h",
            "startValue": kr2_start,
            "targetValue": kr2_target,
            "rationale": "Se mantiene la meta.",
            "proposedValues": False,
        },
    ]
    if extra_kr:
        krs.append(
            {
                "title": "Subir la satisfacción",
                "unit": "pts",
                "startValue": "60",
                "targetValue": "80",
                "rationale": "Nuevo.",
                "proposedValues": False,
            }
        )
    return json.dumps(
        {
            "objective": {
                "title": "Dar un soporte rápido y predecible en incidencias críticas",
                "description": "Que los equipos recuperen el servicio el mismo día.",
                "rationale": "Un objetivo describe el resultado buscado.",
            },
            "keyResults": krs,
            "warnings": [{"code": "KR_IS_ACTIVITY", "message": '"hacer runbooks" es una tarea.'}],
        },
        ensure_ascii=False,
    )


def script_okr(h, *gens):
    h.provider.script(h.classify, Text(CLASSIFY_OK, 540, 35))
    h.provider.script(h.gen, *[Text(g, 1320, 610) for g in gens])
    h.provider.script(h.judge, Text(JUDGE_OK, 1890, 120), Text(JUDGE_OK, 1890, 120))


def test_okr_suggest_happy_path_marks_proposed_values_deterministically(h):
    script_okr(h, okr_output())
    r, tid = h.post("/v1/okr-suggest", OKR_REQUEST)
    assert r.status_code == 200
    b = r.json()
    assert b["traceId"] == tid and b["needsHumanReview"] is False
    assert b["prompt"]["id"] == "okr_suggest"
    res = b["result"]
    assert res["objective"]["title"].startswith("Dar un soporte")
    assert [kr["proposedValues"] for kr in res["keyResults"]] == [
        True,
        False,
    ]  # null -> numeros nuevos
    assert (res["keyResults"][1]["startValue"], res["keyResults"][1]["targetValue"]) == ("8", "4")
    assert res["warnings"][0]["code"] == "KR_IS_ACTIVITY"
    assert set(b["readability"]) == {"output"}
    assert b["checks"]["numbersPreserved"] is True
    assert [u["step"] for u in b["usage"]] == ["CLASSIFY", "GENERATE", "JUDGE"]


def test_okr_suggest_can_append_new_krs_up_to_five(h):
    script_okr(h, okr_output(extra_kr=True))
    r, _ = h.post("/v1/okr-suggest", OKR_REQUEST)
    b = r.json()
    assert len(b["result"]["keyResults"]) == 3
    assert b["result"]["keyResults"][2]["proposedValues"] is True  # KR nuevo con numeros


def test_okr_suggest_changed_existing_value_regenerates_then_ok(h):
    script_okr(h, okr_output(kr2_target="5"), okr_output())
    r, _ = h.post("/v1/okr-suggest", OKR_REQUEST)
    b = r.json()
    assert b["needsHumanReview"] is False and b["checks"]["regenerated"] is True
    assert [u["step"] for u in b["usage"]] == ["CLASSIFY", "GENERATE", "REGENERATE", "JUDGE"]
    assert "targetValue=4" in h.provider.calls_for(h.gen)[1]["instruction"]


def test_okr_suggest_changed_value_twice_falls_back_to_the_draft(h):
    script_okr(h, okr_output(kr2_start="9"), okr_output(kr2_start="9"))
    r, _ = h.post("/v1/okr-suggest", OKR_REQUEST)
    b = r.json()
    assert b["needsHumanReview"] is True and b["reviewReason"] == "VERIFICATION_FAILED"
    assert b["checks"]["numbersPreserved"] is False
    assert any("startValue=8" in t for t in b["checks"]["missingTokens"])
    # resultado de respaldo = borrador sin tocar
    assert b["result"]["objective"]["title"] == "mejorar soporte"
    assert [kr["title"] for kr in b["result"]["keyResults"]] == [
        "hacer runbooks",
        "bajar tiempo de resolución P1",
    ]
    assert all(kr["proposedValues"] is False for kr in b["result"]["keyResults"])


def test_okr_suggest_dropping_a_draft_kr_fails_verification(h):
    one_kr = json.loads(okr_output())
    one_kr["keyResults"] = one_kr["keyResults"][:1]
    script_okr(h, json.dumps(one_kr), json.dumps(one_kr))
    r, _ = h.post("/v1/okr-suggest", OKR_REQUEST)
    assert r.json()["needsHumanReview"] is True


def test_okr_suggest_judge_unfaithful_twice(h):
    h.provider.script(h.classify, Text(CLASSIFY_OK))
    h.provider.script(h.gen, Text(okr_output()), Text(okr_output()))
    h.provider.script(h.judge, Text(JUDGE_BAD), Text(JUDGE_BAD))
    r, _ = h.post("/v1/okr-suggest", OKR_REQUEST)
    b = r.json()
    assert b["needsHumanReview"] is True and b["checks"]["judge"]["verdict"] == "UNFAITHFUL"


def test_okr_suggest_invalid_warning_code_is_schema_mismatch_then_repair(h):
    bad = json.loads(okr_output())
    bad["warnings"] = [{"code": "OTRA_COSA", "message": "x"}]
    script_okr(h, json.dumps(bad), okr_output())
    r, _ = h.post("/v1/okr-suggest", OKR_REQUEST)
    assert r.status_code == 200
    assert [(u["step"], u["errorCode"]) for u in r.json()["usage"][1:3]] == [
        ("GENERATE", "SCHEMA_MISMATCH"),
        ("REPAIR", None),
    ]


def test_okr_suggest_with_no_krs_and_long_title_is_truncated(h):
    req = copy.deepcopy(OKR_REQUEST) | {"keyResults": []}
    out = json.loads(okr_output())
    out["keyResults"] = []
    out["objective"]["title"] = "T" * 400
    script_okr(h, json.dumps(out))
    r, _ = h.post("/v1/okr-suggest", req)
    assert r.status_code == 200
    assert len(r.json()["result"]["objective"]["title"]) == 300


# ----------------------------------------------------------------------------- check-in summary

CHECKIN_REQUEST = {
    "level": "PLAIN",
    "keyResult": {
        "title": "Reducir el tiempo medio de resolución de incidencias P1 de 8 h a 4 h",
        "scoring": "DERIVED",
        "unit": "h",
        "startValue": "8",
        "targetValue": "4",
        "currentValue": "5.5",
    },
    "checkIns": [
        {
            "date": "2026-10-01",
            "value": "7.5",
            "score": 0.125,
            "band": "RED",
            "action": "START",
            "note": "Arrancamos el relevamiento.",
        },
        {
            "date": "2026-10-08",
            "value": "6.5",
            "score": 0.375,
            "band": "RED",
            "action": "CONTINUE",
            "note": "Primer runbook publicado.",
        },
        {
            "date": "2026-10-15",
            "value": "5.5",
            "score": 0.625,
            "band": "YELLOW",
            "action": "CONTINUE",
            "note": "El proveedor es el cuello de botella; se escala al comité el 15/11.",
        },
    ],
}


def summary_output(summary=None, highlights=None, risks=None):
    return json.dumps(
        {
            "summary": summary
            or "En tres semanas el tiempo bajó de 7,5 h a 5,5 h. La meta es 4 h. El avance viene de los runbooks. "
            "El freno es el proveedor. Se trata en el comité el 15/11.",
            "highlights": highlights or ["Se publicó el primer runbook."],
            "risks": risks or ["El proveedor limita la mejora."],
        },
        ensure_ascii=False,
    )


def script_checkin(h, *gens):
    h.provider.script(h.classify, Text(CLASSIFY_OK, 700, 36))
    h.provider.script(h.gen, *[Text(g, 1610, 290) for g in gens])
    h.provider.script(h.judge, Text(JUDGE_OK), Text(JUDGE_OK))


def test_checkin_summary_happy_path_trend_is_deterministic(h):
    script_checkin(h, summary_output())
    r, _ = h.post("/v1/checkin-summary", CHECKIN_REQUEST)
    assert r.status_code == 200
    b = r.json()
    assert b["result"]["trend"] == "IMPROVING"
    assert b["prompt"]["id"] == "checkin_summary"
    assert b["needsHumanReview"] is False and b["checks"]["numbersPreserved"] is True
    assert set(b["result"]) == {"summary", "trend", "highlights", "risks"}
    assert (
        "Tendencia calculada (informativa, no la modifiques): mejorando"
        in h.provider.calls_for(h.gen)[0]["instruction"]
    )  # el LLM recibe la tendencia calculada, en español


def test_checkin_summary_llm_cannot_override_trend(h):
    declining = copy.deepcopy(CHECKIN_REQUEST)
    for ci, score in zip(declining["checkIns"], (0.9, 0.6, 0.3), strict=True):
        ci["score"] = score
    out = json.loads(summary_output())
    out["trend"] = "IMPROVING"  # intento del modelo de imponer la tendencia: se ignora
    script_checkin(h, json.dumps(out))
    r, _ = h.post("/v1/checkin-summary", declining)
    assert r.json()["result"]["trend"] == "DECLINING"


def test_checkin_summary_single_checkin_is_insufficient_data(h):
    one = copy.deepcopy(CHECKIN_REQUEST)
    one["checkIns"] = one["checkIns"][:1]
    script_checkin(h, summary_output("Arrancó el relevamiento. La meta es 4 h y hoy está en 5,5 h."))
    r, _ = h.post("/v1/checkin-summary", one)
    assert r.json()["result"]["trend"] == "INSUFFICIENT_DATA"


def test_checkin_summary_missing_current_value_regenerates(h):
    no_current = summary_output("El tiempo bajó bastante. La meta es 4 h. Se trata en el comité el 15/11.")
    script_checkin(h, no_current, summary_output())
    r, _ = h.post("/v1/checkin-summary", CHECKIN_REQUEST)
    b = r.json()
    assert b["checks"]["regenerated"] is True and b["needsHumanReview"] is False
    assert "5.5" in h.provider.calls_for(h.gen)[1]["instruction"]


def test_checkin_summary_invented_date_fails_and_falls_back(h):
    invented = summary_output("Pasó de 7,5 h a 5,5 h. La meta es 4 h. Se resuelve el 20/12.")
    script_checkin(h, invented, invented)
    r, _ = h.post("/v1/checkin-summary", CHECKIN_REQUEST)
    b = r.json()
    assert b["needsHumanReview"] is True and b["checks"]["numbersPreserved"] is False
    assert b["result"]["highlights"] == [] and b["result"]["risks"] == []
    assert b["result"]["trend"] == "IMPROVING"  # la tendencia es determinista aun en el respaldo
    assert "verificado" in b["result"]["summary"]


def test_checkin_summary_standard_level_has_no_readability_floor(h):
    std = copy.deepcopy(CHECKIN_REQUEST) | {"level": "STANDARD"}
    hard = summary_output(
        "Institucionalmente consideramos extraordinariamente satisfactoria la disminución considerable "
        "del tiempo medio de resolución desde 7,5 h hasta 5,5 h respecto de la meta de 4 h, "
        "fundamentalmente gracias a procedimientos estandarizados de recuperación operativa."
    )
    script_checkin(h, hard)
    r, _ = h.post("/v1/checkin-summary", std)
    assert r.status_code == 200 and r.json()["needsHumanReview"] is False


def test_checkin_summary_plain_level_enforces_readability_floor(h):
    hard = summary_output(
        "Institucionalmente consideramos extraordinariamente satisfactoria la disminución considerable "
        "del tiempo medio de resolución desde 7,5 h hasta 5,5 h respecto de la meta de 4 h, "
        "fundamentalmente gracias a procedimientos estandarizados de recuperación operativa."
    )
    script_checkin(h, hard, hard)
    r, _ = h.post("/v1/checkin-summary", CHECKIN_REQUEST)
    b = r.json()
    assert b["needsHumanReview"] is True and b["reviewReason"] == "READABILITY_BELOW_MIN"


def test_checkin_summary_lists_and_length_are_clamped(h):
    big = summary_output(
        summary="Meta 4 h, hoy 5,5 h. " + "x" * 1500,
        highlights=[f"h{i}" for i in range(9)],
        risks=[f"r{i}" for i in range(9)],
    )
    script_checkin(h, big)
    r, _ = h.post("/v1/checkin-summary", CHECKIN_REQUEST | {"level": "STANDARD"})
    res = r.json()["result"]
    assert len(res["summary"]) <= 1200 and len(res["highlights"]) == 5 and len(res["risks"]) == 5


def test_checkin_summary_timeout_everywhere_is_503(h):
    h.provider.script(h.classify, Text(CLASSIFY_OK))
    h.provider.script(h.gen, Hang(), Hang())
    h.provider.script(h.gen_fb, Hang())
    r, _ = h.post("/v1/checkin-summary", CHECKIN_REQUEST)
    assert r.status_code == 503 and r.json()["error"]["details"] == {"step": "GENERATE"}


def test_checkin_notes_pii_masked_before_llm(h):
    req = copy.deepcopy(CHECKIN_REQUEST)
    req["checkIns"][0]["note"] = "Coordinar con ana@empresa.com el relevamiento."
    script_checkin(h, summary_output())
    r, _ = h.post("/v1/checkin-summary", req)
    assert r.status_code == 200 and r.json()["checks"]["piiMasked"] == 1
    for c in h.provider.calls:
        assert "ana@empresa.com" not in c["instruction"]
