"""Tests de contrato: los ejemplos JSON de docs/ai/agent-contract.md (copiados como fixtures) deben
validar contra los schemas del agente, y el agente debe producir la MISMA forma.

Los mismos fixtures viven en okr-platform-back/okr-platform/test/fixtures/agent/ (lado NestJS).
"""

import json
from pathlib import Path

import pytest

from okr_agent.api.schemas import (
    AdaptRequest,
    AdaptResponse,
    CheckinSummaryRequest,
    CheckinSummaryResponse,
    ErrorResponse,
    HealthResponse,
    OkrSuggestRequest,
    OkrSuggestResponse,
)
from tests.conftest import CLASSIFY_OK, JUDGE_OK, Text

FIX = Path(__file__).parent / "fixtures"


def load(name: str):
    return json.loads((FIX / f"{name}.json").read_text(encoding="utf-8"))


def shape(obj):
    """Forma estructural: claves de dicts (recursivo) y forma del primer elemento de las listas."""
    if isinstance(obj, dict):
        return {k: shape(v) for k, v in sorted(obj.items())}
    if isinstance(obj, list):
        return [shape(obj[0])] if obj else []
    return type(obj).__name__ if obj is not None else "null"


def keys_only(obj):
    if isinstance(obj, dict):
        return {k: keys_only(v) for k, v in sorted(obj.items())}
    if isinstance(obj, list):
        if obj and isinstance(obj[0], dict | list):
            return [keys_only(obj[0])]
        return "list"  # lista vacia o de escalares: no hay estructura que comparar
    return None


# ----------------------------------------------------------------------------- fixtures vs schemas


@pytest.mark.parametrize(
    ("name", "model"),
    [
        ("adapt.request", AdaptRequest),
        ("okr-suggest.request", OkrSuggestRequest),
        ("checkin-summary.request", CheckinSummaryRequest),
        ("adapt.response", AdaptResponse),
        ("okr-suggest.response", OkrSuggestResponse),
        ("checkin-summary.response", CheckinSummaryResponse),
        ("health.response", HealthResponse),
        ("error.input-rejected", ErrorResponse),
    ],
)
def test_fixture_validates_against_schema(name, model):
    data = load(name)
    parsed = model.model_validate(data)  # extra=forbid en respuestas: cualquier campo de mas/menos falla
    if name.endswith("response") or name.startswith("error"):
        again = parsed.model_dump(by_alias=True, mode="json")
        assert keys_only(again) == keys_only(data)


def test_all_contract_fixtures_present():
    assert sorted(p.stem for p in FIX.glob("*.json")) == sorted(
        [
            "adapt.request",
            "adapt.response",
            "checkin-summary.request",
            "checkin-summary.response",
            "error.input-rejected",
            "health.response",
            "okr-suggest.request",
            "okr-suggest.response",
        ]
    )


# ----------------------------------------------------------------------------- el agente produce la misma forma


def _script(h, generated: dict, *, judge=JUDGE_OK):
    h.provider.script(h.classify, Text(CLASSIFY_OK, 600, 38))
    h.provider.script(h.gen, Text(json.dumps(generated, ensure_ascii=False), 1480, 402))
    h.provider.script(h.judge, Text(judge, 1950, 96))


def test_adapt_response_has_contract_shape(h):
    fixture = load("adapt.response")
    _script(h, fixture["result"] | {"segments": fixture["result"]["segments"]})
    r, tid = h.post("/v1/adapt", load("adapt.request"))
    assert r.status_code == 200, r.text
    body = r.json()
    assert keys_only(body) == keys_only(fixture)
    assert body["traceId"] == tid
    assert shape(body["usage"]) == shape(fixture["usage"])
    assert body["result"]["segments"] == fixture["result"]["segments"]
    assert body["result"]["glossary"] == fixture["result"]["glossary"]
    assert body["needsHumanReview"] is False  # el ejemplo del contrato pasa todas las verificaciones


def test_okr_suggest_response_has_contract_shape(h):
    fixture = load("okr-suggest.response")
    _script(h, fixture["result"])
    r, _ = h.post("/v1/okr-suggest", load("okr-suggest.request"))
    assert r.status_code == 200, r.text
    body = r.json()
    assert keys_only(body) == keys_only(fixture)
    assert body["result"] == fixture["result"]
    assert body["needsHumanReview"] is False


def test_checkin_summary_response_has_contract_shape(h):
    fixture = load("checkin-summary.response")
    _script(h, {k: fixture["result"][k] for k in ("summary", "highlights", "risks")})
    r, _ = h.post("/v1/checkin-summary", load("checkin-summary.request"))
    assert r.status_code == 200, r.text
    body = r.json()
    assert keys_only(body) == keys_only(fixture)
    assert body["result"] == fixture["result"]  # incluye trend IMPROVING calculado por el agente
    assert body["needsHumanReview"] is False


def test_health_has_contract_shape(h):
    body = h.client.get("/health").json()
    assert keys_only(body) == keys_only(load("health.response"))
    assert shape(body["models"]) == shape(load("health.response")["models"])


def test_input_rejected_error_has_contract_shape(h):
    h.provider.script(
        h.classify,
        Text(
            json.dumps({"outOfScope": False, "injectionSuspected": True, "sensitive": False, "reason": "x"}),
            420,
            30,
        ),
    )
    r, tid = h.post("/v1/adapt", load("adapt.request"))
    body = r.json()
    fixture = load("error.input-rejected")
    assert r.status_code == 422
    assert keys_only(body) == keys_only(fixture)
    assert body["error"] == fixture["error"]
    assert shape(body["usage"]) == shape(fixture["usage"])
    assert r.headers["X-Trace-Id"] == tid


def test_every_usage_step_has_all_contract_fields(h):
    fixture = load("adapt.response")
    _script(h, fixture["result"])
    r, _ = h.post("/v1/adapt", load("adapt.request"))
    required = set(fixture["usage"][0])
    for step in r.json()["usage"]:
        assert set(step) == required
        assert step["costUsdEst"] >= 0 and step["latencyMs"] >= 0
