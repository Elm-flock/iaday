"""Evals de la extension admin contra NVIDIA NIM REAL (`pytest -m eval -s tests/evals/test_admin_evals.py`).

Gastan tokens y el free tier devuelve 429 en rafagas: los pedidos se espacian (EVAL_SLEEP_S, 4 s por defecto) y un
RATE_LIMITED se reintenta tras una pausa (se informa aparte: es infraestructura, no calidad del modelo).

Planner en AMBOS modos sin tocar models.yaml:  AGENT_PLANNER_MODE=schema|tools
Filtros: `-k plan`, `-k digest`, `-k help`. Resumen por corrida al final (modo, exactitud, latencia, tokens, costo).
Si EVAL_RESULTS_FILE esta definido, agrega una linea JSON con el resumen.
"""

import json
import os
import statistics
import time
import uuid

import pytest
from fastapi.testclient import TestClient

from okr_agent.api.auth import sign
from okr_agent.api.main import create_app
from okr_agent.settings import Settings
from tests.evals import admin_expect as ex

SECRET = "eval-" + "x" * 48
SLEEP_S = float(os.environ.get("EVAL_SLEEP_S", "4"))
RATE_LIMIT_PAUSE_S = float(os.environ.get("EVAL_429_PAUSE_S", "25"))

pytestmark = pytest.mark.eval

SUITES = {name: ex.load(f"{name}.test.json") for name in ("admin_plan", "admin_digest", "admin_help")}
RESULTS: dict[str, list[dict]] = {name: [] for name in SUITES}


def _cases():
    for suite_name, suite in SUITES.items():
        for case in suite["cases"]:
            yield pytest.param(suite_name, case, id=f"{suite_name.replace('admin_', '')}:{case['name']}")


@pytest.fixture(scope="module")
def client():
    settings = Settings(agent_shared_secret=SECRET)
    if not settings.api_key_configured:
        pytest.skip("Falta NVIDIA_NIM_API_KEY (definila en .env o en el entorno)")
    app = create_app(settings)
    c = TestClient(app, raise_server_exceptions=False)
    c.mode = app.state.runtime.cfg.planner_mode()  # type: ignore[attr-defined]
    return c


@pytest.fixture(scope="module", autouse=True)
def _summary(request):
    yield
    mode = getattr(request.module, "_MODE", "?")
    lines = [f"\n===== RESUMEN EVALS ADMIN (planner.mode={mode}) ====="]
    out = {"mode": mode, "suites": {}}
    for name, rows in RESULTS.items():
        if not rows:
            continue
        done = [r for r in rows if not r["infra"]]
        ok = sum(1 for r in done if r["ok"])
        lat = [r["wallMs"] for r in done] or [0]
        agg = {
            "cases": len(rows),
            "infraErrors": len(rows) - len(done),
            "passed": ok,
            "evaluated": len(done),
            "accuracy": round(ok / len(done), 3) if done else None,
            "wallMsMean": int(statistics.mean(lat)),
            "wallMsP50": int(statistics.median(lat)),
            "wallMsMax": max(lat),
            "inTokens": sum(r["in"] for r in done),
            "outTokens": sum(r["out"] for r in done),
            "costUsdEst": round(sum(r["cost"] for r in done), 6),
            "repairs": sum(r["repairs"] for r in done),
            "fallbackAttempts": sum(r["fallbacks"] for r in done),
            "failedAttempts": sum(r["failedAttempts"] for r in done),
            "failures": [r["name"] for r in done if not r["ok"]],
        }
        out["suites"][name] = agg
        lines.append(f"{name}: " + json.dumps(agg, ensure_ascii=False))
    print("\n".join(lines))
    path = os.environ.get("EVAL_RESULTS_FILE")
    if path:
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(out, ensure_ascii=False) + "\n")


def _post(client, endpoint: str, payload: dict):
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    ts = str(int(time.time()))
    headers = {
        "Content-Type": "application/json",
        "X-Agent-Timestamp": ts,
        "X-Agent-Signature": sign(SECRET, ts, raw),
        "X-Trace-Id": str(uuid.uuid4()),
    }
    return client.post(endpoint, content=raw, headers=headers)


@pytest.mark.parametrize(("suite_name", "case"), _cases())
def test_admin_eval_case(client, suite_name, case):
    import tests.evals.test_admin_evals as me

    me._MODE = client.mode
    suite = SUITES[suite_name]
    endpoint = case["endpoint"]
    if suite_name == "admin_help" and endpoint == "/v1/admin/chat":
        payload = ex.build_chat_request_for_help_case(suite, case)
    else:
        payload = ex.build_request(suite, case)
    time.sleep(SLEEP_S)
    started = time.monotonic()
    r = _post(client, endpoint, payload)
    retries = 0
    while (
        r.status_code in (429, 503)
        and r.json().get("error", {}).get("code") in ("RATE_LIMITED", "MODEL_UNAVAILABLE")
        and retries < 2
    ):
        retries += 1
        time.sleep(RATE_LIMIT_PAUSE_S)
        r = _post(client, endpoint, payload)
    wall_ms = int((time.monotonic() - started) * 1000)
    body = r.json()
    usage = body.get("usage", [])
    infra = (
        r.status_code in (429, 503, 502)
        and "error" in body
        and body["error"]["code"]
        in (
            "RATE_LIMITED",
            "MODEL_UNAVAILABLE",
        )
        and case["expect"].get("status") not in (429, 503)
    )
    if suite_name == "admin_plan":
        fails = ex.check(case, r.status_code, body)
    elif suite_name == "admin_digest":
        fails = ex.check_digest(case, r.status_code, body)
    else:
        fails = ex.check_help(case, r.status_code, body, [c["id"] for c in suite["chunks"]])
    row = {
        "name": case["name"],
        "ok": not fails,
        "infra": infra,
        "wallMs": wall_ms,
        "in": sum(u["inputTokens"] for u in usage),
        "out": sum(u["outputTokens"] for u in usage),
        "cost": sum(u["costUsdEst"] for u in usage),
        "repairs": sum(1 for u in usage if u["step"] == "REPAIR"),
        "fallbacks": sum(1 for u in usage if u["isFallback"]),
        "failedAttempts": sum(1 for u in usage if u["status"] == "FAILED"),
    }
    RESULTS[suite_name].append(row)
    print(
        f"\n[{suite_name}:{case['name']}] {'PASS' if not fails else 'FAIL'}{' (infra)' if infra else ''} "
        f"http={r.status_code} intent={body.get('intent')} wall={wall_ms}ms retries={retries} "
        f"in={row['in']} out={row['out']} cost=${row['cost']:.6f}"
    )
    for u in usage:
        print(
            f"   {u['step']:<10} {u['model']:<38} {u['status']:<6} {u['latencyMs']:>6}ms "
            f"in={u['inputTokens']:<5} out={u['outputTokens']:<5} {u['errorCode'] or ''}"
        )
    for f in fails:
        print(f"   FALLA: {f}")
    if suite_name == "admin_plan" and body.get("plan"):
        print("   acciones:", [a["type"] for a in body["plan"]["actions"]])
    key = os.environ.get("NVIDIA_NIM_API_KEY") or Settings().nvidia_nim_api_key
    assert key and key not in r.text
    if infra:
        pytest.skip("error de infraestructura (free tier): no cuenta para la exactitud")
    assert not fails, fails
