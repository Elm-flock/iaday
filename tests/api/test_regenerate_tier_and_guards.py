"""Tier opcional `regenerate`, juez propio de sugerencias (judge_suggest) y guard de tokens enum (W2/W3/W5)."""

import copy
import json

import pytest

from tests.api.test_pipeline_okr_checkin import OKR_REQUEST, okr_output
from tests.conftest import (
    ADAPT_GOOD,
    ADAPT_LOSES_NUMBERS,
    ADAPT_REQUEST,
    CLASSIFY_OK,
    JUDGE_OK,
    Boom,
    Harness,
    Text,
)


@pytest.fixture
def hr() -> Harness:
    return Harness(regen_tier=True)


def models_by_step(body):
    return [(u["step"], u["model"], u["status"]) for u in body["usage"]]


def test_regenerate_uses_its_own_tier_model_and_generate_keeps_the_primary(hr):
    hr.provider.script(hr.classify, Text(CLASSIFY_OK))
    hr.provider.script(hr.gen, Text(ADAPT_LOSES_NUMBERS))
    hr.provider.script(hr.regen, Text(ADAPT_GOOD))
    hr.provider.script(hr.judge, Text(JUDGE_OK))
    r, _ = hr.post("/v1/adapt", ADAPT_REQUEST)
    b = r.json()
    assert r.status_code == 200 and b["checks"]["regenerated"] is True
    assert models_by_step(b) == [
        ("CLASSIFY", hr.classify, "OK"),
        ("GENERATE", hr.gen, "OK"),
        ("REGENERATE", hr.regen, "OK"),
        ("JUDGE", hr.judge, "OK"),
    ]
    assert hr.provider.calls_for(hr.gen_fb) == []


def test_regenerate_tier_keeps_retry_and_fallback_semantics_with_usage_per_attempt(hr):
    hr.provider.script(hr.classify, Text(CLASSIFY_OK))
    hr.provider.script(hr.gen, Text(ADAPT_LOSES_NUMBERS))
    hr.provider.script(hr.regen, Boom(RuntimeError("x")), Boom(RuntimeError("x")))
    hr.provider.script(hr.regen_fb, Text(ADAPT_GOOD))
    hr.provider.script(hr.judge, Text(JUDGE_OK))
    r, _ = hr.post("/v1/adapt", ADAPT_REQUEST)
    b = r.json()
    assert r.status_code == 200
    regen = [u for u in b["usage"] if u["step"] == "REGENERATE"]
    assert [(u["attempt"], u["model"], u["status"], u["isFallback"]) for u in regen] == [
        (1, hr.regen, "FAILED", False),
        (2, hr.regen, "FAILED", False),
        (3, hr.regen_fb, "OK", True),
    ]


def test_without_regenerate_tier_regenerate_falls_back_to_generate_models(h):
    h.provider.script(h.classify, Text(CLASSIFY_OK))
    h.provider.script(h.gen, Text(ADAPT_LOSES_NUMBERS), Text(ADAPT_GOOD))
    h.provider.script(h.judge, Text(JUDGE_OK))
    r, _ = h.post("/v1/adapt", ADAPT_REQUEST)
    assert [u["model"] for u in r.json()["usage"] if u["step"] == "REGENERATE"] == [h.gen]


def test_per_tier_timeout_overrides_the_default(hr):
    hr.cfg.tiers["regenerate"].timeout_s = 77
    assert hr.cfg.timeout_for("regenerate") == 77
    assert hr.cfg.timeout_for("generate") == hr.cfg.defaults.timeout_s
    assert hr.runtime.runners  # el runtime se armó con el tier


def test_okr_suggest_is_judged_with_its_own_prompt_not_the_fidelity_one(h):
    h.provider.script(h.classify, Text(CLASSIFY_OK))
    h.provider.script(h.gen, Text(okr_output()))
    h.provider.script(h.judge, Text(JUDGE_OK))
    r, _ = h.post("/v1/okr-suggest", OKR_REQUEST)
    assert r.status_code == 200
    judge_instruction = h.provider.calls_for(h.judge)[0]["instruction"]
    assert "una sugerencia está hecha para cambiar la redacción" in judge_instruction.lower()


def test_adapt_is_still_judged_with_the_fidelity_prompt(h):
    h.provider.script(h.classify, Text(CLASSIFY_OK))
    h.provider.script(h.gen, Text(ADAPT_GOOD))
    h.provider.script(h.judge, Text(JUDGE_OK))
    h.post("/v1/adapt", ADAPT_REQUEST)
    assert "revisor estricto" in h.provider.calls_for(h.judge)[0]["instruction"].lower()


def test_okr_suggest_empty_rationale_triggers_regenerate(h):
    bad = json.loads(okr_output())
    bad["objective"]["rationale"] = ""
    h.provider.script(h.classify, Text(CLASSIFY_OK))
    h.provider.script(h.gen, Text(json.dumps(bad)), Text(okr_output()))
    h.provider.script(h.judge, Text(JUDGE_OK))
    r, _ = h.post("/v1/okr-suggest", OKR_REQUEST)
    b = r.json()
    assert b["checks"]["regenerated"] is True and b["needsHumanReview"] is False
    assert 'rationale" del objetivo' in h.provider.calls_for(h.gen)[1]["instruction"]


def enum_request():
    req = copy.deepcopy(ADAPT_REQUEST)
    req["segments"] = [{"key": "checkin.status", "text": "NOT_STARTED"}]
    req["mustPreserve"] = []
    return req


def enum_output(text):
    return json.dumps({"segments": [{"key": "checkin.status", "text": text}], "glossary": []})


def test_bare_enum_token_echoed_raw_triggers_regenerate_with_hint(h):
    h.provider.script(h.classify, Text(CLASSIFY_OK))
    h.provider.script(
        h.gen,
        Text(enum_output("NOT_STARTED")),
        Text(enum_output("Todavía no empezamos. Falta dar el primer paso.")),
    )
    h.provider.script(h.judge, Text(JUDGE_OK))
    r, _ = h.post("/v1/adapt", enum_request())
    b = r.json()
    assert b["checks"]["regenerated"] is True
    assert b["result"]["segments"][0]["text"] == "Todavía no empezamos. Falta dar el primer paso."
    assert "código interno" in h.provider.calls_for(h.gen)[1]["instruction"]


def test_bare_enum_token_echoed_twice_falls_back_to_original_with_review(h):
    h.provider.script(h.classify, Text(CLASSIFY_OK))
    h.provider.script(h.gen, Text(enum_output("NOT_STARTED")), Text(enum_output("not_started")))
    r, _ = h.post("/v1/adapt", enum_request())
    b = r.json()
    assert b["needsHumanReview"] is True and b["reviewReason"] == "VERIFICATION_FAILED"


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("NOT_STARTED", True),
        ("STOP", True),
        (" AT_RISK ", True),
        ("No empezó", False),
        ("OK", False),
        ("P1", False),
    ],
)
def test_is_enum_token(text, expected):
    from okr_agent.agent.features import is_enum_token

    assert is_enum_token(text) is expected


# ----------------------------------------------------------------------------- enums tipados -> español


def test_checkin_prompt_sends_spanish_labels_not_raw_enums(h):
    from tests.api.test_pipeline_okr_checkin import CHECKIN_REQUEST, script_checkin, summary_output

    script_checkin(h, summary_output())
    r, _ = h.post("/v1/checkin-summary", CHECKIN_REQUEST)
    assert r.status_code == 200
    data = h.provider.calls_for(h.gen)[0]["instruction"].split("Check-ins en orden cronológico (JSON):")[1]
    for raw in ("RED", "YELLOW", "GREEN", "START", "CONTINUE", "STOP", "DERIVED"):
        assert f'"{raw}"' not in data
    for label in ("en riesgo", "requiere atención", "Iniciar", "Continuar", "calculado"):
        assert label in data or label in h.provider.calls_for(h.gen)[0]["instruction"]


def test_okr_prompt_sends_spanish_type_and_cycle(h):
    from tests.api.test_pipeline_okr_checkin import OKR_REQUEST, okr_output, script_okr

    script_okr(h, okr_output())
    h.post("/v1/okr-suggest", OKR_REQUEST)
    ins = h.provider.calls_for(h.gen)[0]["instruction"]
    assert "Horizonte del ciclo: trimestral" in ins
    assert '"type": "comprometido' in ins and '"COMMITTED"' not in ins


def test_checkin_summary_echoing_raw_enum_regenerates_then_ok(h):
    from tests.api.test_pipeline_okr_checkin import CHECKIN_REQUEST, script_checkin, summary_output

    raw = summary_output(
        "El KR está en RED y la acción es STOP. El tiempo bajó de 7,5 h a 5,5 h. La meta es 4 h. "
        "Se trata en el comité el 15/11."
    )
    script_checkin(h, raw, summary_output())
    r, _ = h.post("/v1/checkin-summary", CHECKIN_REQUEST)
    b = r.json()
    assert b["checks"]["regenerated"] is True and b["needsHumanReview"] is False
    assert "RED" not in b["result"]["summary"]
    assert "códigos internos (RED, STOP)" in h.provider.calls_for(h.gen)[1]["instruction"]


def test_okr_suggest_echoing_raw_enum_in_warning_is_rejected(h):
    from tests.api.test_pipeline_okr_checkin import OKR_REQUEST, okr_output, script_okr

    bad = json.loads(okr_output())
    bad["warnings"] = [{"code": "KR_IS_ACTIVITY", "message": "El objetivo COMMITTED tiene una tarea."}]
    script_okr(h, json.dumps(bad), okr_output())
    r, _ = h.post("/v1/okr-suggest", OKR_REQUEST)
    assert r.json()["checks"]["regenerated"] is True


def test_raw_enum_tokens_helper():
    from okr_agent.agent.features import raw_enum_tokens

    assert raw_enum_tokens("Está en RED y NOT_STARTED") == ["RED", "NOT_STARTED"]
    assert raw_enum_tokens("Pidieron STOP en el SLA", source="el equipo dijo STOP") == []
    assert raw_enum_tokens("El P1 del SLA y la API") == []
