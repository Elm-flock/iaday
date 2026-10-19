"""Auth HMAC, validacion de pedidos, /health y envelope de error sobre HTTP real (TestClient)."""

import json
import time

import pytest

from okr_agent.api.schemas import ErrorResponse, HealthResponse
from tests.conftest import ADAPT_REQUEST, SECRET, Harness, script_happy_adapt

PATHS = ["/v1/adapt", "/v1/okr-suggest", "/v1/checkin-summary"]


# ----------------------------------------------------------------------------- HMAC sobre HTTP


def assert_unauthorized(r, h):
    assert r.status_code == 401
    e = r.json()
    ErrorResponse.model_validate(e)
    assert e["error"]["code"] == "UNAUTHORIZED" and e["error"]["retryable"] is False
    assert e["error"]["details"] == {} and e["usage"] == [] and e["traceId"] is None
    assert h.provider.calls == []  # ni un LLM


@pytest.mark.parametrize("path", PATHS)
def test_valid_signature_is_accepted_on_every_v1_route(h, path):
    r, _ = h.post(path, {"cualquier": "cosa"})
    assert r.status_code == 400  # paso la auth; falla el schema, no la firma


def test_bad_signature_401(h):
    r, _ = h.post("/v1/adapt", ADAPT_REQUEST, signature="sha256=" + "0" * 64)
    assert_unauthorized(r, h)


def test_signature_with_wrong_secret_401(h):
    r, _ = h.post("/v1/adapt", ADAPT_REQUEST, secret="otro" * 12)
    assert_unauthorized(r, h)


def test_body_tampered_after_signing_401(h):
    from okr_agent.api.auth import sign

    raw = json.dumps(ADAPT_REQUEST).encode()
    ts = str(int(time.time()))
    sig = sign(SECRET, ts, raw)
    r, _ = h.post("/v1/adapt", raw + b" ", timestamp=ts, signature=sig)
    assert_unauthorized(r, h)


@pytest.mark.parametrize("delta", [301, -301, 3600])
def test_timestamp_skew_401(h, delta):
    ts = str(int(time.time()) + delta)
    r, _ = h.post("/v1/adapt", ADAPT_REQUEST, timestamp=ts)
    assert_unauthorized(r, h)


def test_timestamp_inside_window_ok(h):
    script_happy_adapt(h)
    r, _ = h.post("/v1/adapt", ADAPT_REQUEST, timestamp=str(int(time.time()) - 290))
    assert r.status_code == 200


def test_missing_signature_header_401(h):
    r, _ = h.post("/v1/adapt", ADAPT_REQUEST, signature=None)
    assert_unauthorized(r, h)


def test_missing_timestamp_header_401(h):
    r = h.client.post(
        "/v1/adapt",
        content=b"{}",
        headers={
            "X-Agent-Signature": "sha256=aa",
            "X-Trace-Id": "3b1f6c2e-8f4d-4a51-9a63-2d7f0c9e5b10",
        },
    )
    assert_unauthorized(r, h)


def test_missing_trace_id_401(h):
    r, _ = h.post("/v1/adapt", ADAPT_REQUEST, trace_id=None)
    assert_unauthorized(r, h)


def test_non_uuid_trace_id_401(h):
    r, _ = h.post("/v1/adapt", ADAPT_REQUEST, trace_id="no-soy-uuid")
    assert_unauthorized(r, h)


def test_agent_without_configured_secret_rejects_everything():
    from okr_agent.settings import Settings

    hh = Harness(Settings(_env_file=None, nvidia_nim_api_key="x", agent_shared_secret=""))
    r, _ = hh.post("/v1/adapt", ADAPT_REQUEST, secret="")
    assert_unauthorized(r, hh)


def test_health_needs_no_signature(h):
    assert h.client.get("/health").status_code == 200


# ----------------------------------------------------------------------------- validacion de pedidos (400)


def test_body_not_json_is_400_invalid_request_with_trace(h):
    r, tid = h.post("/v1/adapt", b"esto no es json")
    assert r.status_code == 400
    e = r.json()
    ErrorResponse.model_validate(e)
    assert e["error"]["code"] == "INVALID_REQUEST" and e["error"]["retryable"] is False
    assert e["traceId"] == tid and e["usage"] == []
    assert h.provider.calls == []


def test_schema_violation_lists_fields_with_paths(h):
    bad = {
        "level": "NOPE",
        "entityType": "CHECK_IN",
        "locale": "en",
        "segments": [{"key": "Bad Key!", "text": "x"}],
    }
    r, _ = h.post("/v1/adapt", bad)
    assert r.status_code == 400
    fields = r.json()["error"]["details"]["fields"]
    paths = {f["path"] for f in fields}
    assert {"level", "locale", "segments.0.key"} <= paths
    assert all(f["issue"] for f in fields)


@pytest.mark.parametrize(
    "mutate",
    [
        lambda b: b.update(segments=[]),
        lambda b: b.update(segments=[{"key": f"k{i}", "text": "x"} for i in range(31)]),
        lambda b: b.update(mustPreserve=["x"] * 51),
        lambda b: b.update(mustPreserve=["y" * 65]),
        lambda b: b.pop("level"),
    ],
)
def test_adapt_schema_limits(h, mutate):
    body = json.loads(json.dumps(ADAPT_REQUEST))
    mutate(body)
    r, _ = h.post("/v1/adapt", body)
    assert r.status_code == 400 and r.json()["error"]["code"] == "INVALID_REQUEST"


def test_body_over_64_kib_is_invalid_request(h):
    body = json.loads(json.dumps(ADAPT_REQUEST))
    body["mustPreserve"] = []
    body["segments"] = [{"key": f"k{i}", "text": "a" * 3000} for i in range(30)]  # ~90 KB
    r, _ = h.post("/v1/adapt", body)
    assert r.status_code == 400
    assert "64 KiB" in r.json()["error"]["details"]["fields"][0]["issue"]
    assert h.provider.calls == []


def test_okr_suggest_schema_violation(h):
    r, _ = h.post(
        "/v1/okr-suggest",
        {"cycleKind": "WEEKLY", "objective": {"title": "", "type": "X"}, "keyResults": []},
    )
    paths = {f["path"] for f in r.json()["error"]["details"]["fields"]}
    assert {"cycleKind", "objective.title", "objective.type"} <= paths


def test_checkin_summary_schema_violation(h):
    r, _ = h.post(
        "/v1/checkin-summary",
        {"level": "PLAIN", "keyResult": {"title": "t", "scoring": "DERIVED"}, "checkIns": []},
    )
    assert r.status_code == 400
    assert any(f["path"] == "checkIns" for f in r.json()["error"]["details"]["fields"])


def test_unauthenticated_oversize_does_not_leak_validation_details(h):
    r, _ = h.post("/v1/adapt", b"x" * 100_000, signature="sha256=" + "1" * 64)
    assert_unauthorized(r, h)


# ----------------------------------------------------------------------------- health / rutas


def test_health_shape_and_no_secrets(h):
    r = h.client.get("/health")
    assert r.status_code == 200
    body = r.json()
    HealthResponse.model_validate(body)
    assert body["status"] == "ok" and body["contractVersion"] == "1" and body["version"] == "0.1.0"
    assert set(body["models"]) == {"classify", "generate", "judge"}
    assert body["models"]["judge"]["model"] == h.judge
    assert [p["id"] for p in body["prompts"]] == [
        "classify",
        "easy_read",
        "plain_language",
        "okr_suggest",
        "checkin_summary",
        "judge",
        "judge_suggest",
        "admin_classify",
        "admin_planner",
        "admin_query",
        "admin_reply",
        "help_answer",
        "digest_summary",
    ]
    assert all(len(p["hash"]) == 12 for p in body["prompts"])
    assert body["apiKeyConfigured"] is True
    assert SECRET not in r.text and "test-key-placeholder" not in r.text
    assert h.provider.calls == []  # /health no consume tokens


def test_health_degraded_without_api_key():
    from okr_agent.settings import Settings

    hh = Harness(Settings(_env_file=None, agent_shared_secret=SECRET, nvidia_nim_api_key=""))
    r = hh.client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "degraded" and r.json()["apiKeyConfigured"] is False


def test_unknown_route_and_method_still_return_json_envelope(h):
    r = h.client.get("/nada")
    assert r.status_code == 404 and r.headers["content-type"].startswith("application/json")
    ErrorResponse.model_validate(r.json())
    r = h.client.get("/v1/adapt")  # metodo no permitido
    assert r.status_code == 405
    ErrorResponse.model_validate(r.json())
    assert "<html" not in r.text.lower()


def test_error_responses_never_contain_secret(h):
    r, _ = h.post("/v1/adapt", ADAPT_REQUEST, signature="sha256=" + "0" * 64)
    assert SECRET not in r.text
