"""Evals contra NVIDIA NIM REAL. No corren por defecto: `pytest -m eval` y exigen NVIDIA_NIM_API_KEY.

Gastan tokens (free tier de build.nvidia.com). Se corre el pipeline completo con la app real
(sin FakeLlm) y se verifican las expectativas de evals/*.test.json.
(`adk eval` no se usa: evalua un agente conversacional, no este pipeline HTTP con HMAC y guards.)
"""

import json
import os
import time
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from okr_agent.api.auth import sign
from okr_agent.api.main import create_app
from okr_agent.settings import Settings

ROOT = Path(__file__).resolve().parents[2]
# los evals admin_* tienen su propio runner (tests/evals/test_admin_evals.py)
EVAL_FILES = sorted(f for f in (ROOT / "evals").glob("*.test.json") if not f.name.startswith("admin_"))
SECRET = "eval-" + "x" * 48

pytestmark = pytest.mark.eval


def _cases():
    for f in EVAL_FILES:
        data = json.loads(f.read_text(encoding="utf-8"))
        for case in data["cases"]:
            yield pytest.param(case, id=f"{f.stem}:{case['name']}")


@pytest.fixture(scope="module")
def client():
    settings = Settings(agent_shared_secret=SECRET)
    if not settings.api_key_configured:
        pytest.skip("Falta NVIDIA_NIM_API_KEY (definila en .env o en el entorno)")
    return TestClient(create_app(settings), raise_server_exceptions=False)


@pytest.mark.parametrize("case", _cases())
def test_eval_case(client, case):
    raw = json.dumps(case["request"], ensure_ascii=False).encode("utf-8")
    ts = str(int(time.time()))
    headers = {
        "Content-Type": "application/json",
        "X-Agent-Timestamp": ts,
        "X-Agent-Signature": sign(SECRET, ts, raw),
        "X-Trace-Id": str(uuid.uuid4()),
    }
    r = client.post(case["endpoint"], content=raw, headers=headers)
    exp = case["expect"]
    body = r.json()
    usage = body.get("usage", [])
    total_cost = sum(u["costUsdEst"] for u in usage)
    print(
        f"\n[{case['name']}] status={r.status_code} needsHumanReview={body.get('needsHumanReview')} "
        f"costEst=${total_cost:.6f}"
    )
    for u in usage:
        print(
            f"   {u['step']:<10} {u['model']:<38} {u['status']:<6} {u['latencyMs']:>6}ms "
            f"in={u['inputTokens']:<5} out={u['outputTokens']:<5} ${u['costUsdEst']:.6f} {u['errorCode'] or ''}"
        )
    assert r.status_code == exp["status"], r.text
    if "rejectReason" in exp:
        assert body["error"]["details"]["reason"] == exp["rejectReason"], body["error"]
        return
    if "numbersPreserved" in exp:
        assert body["checks"]["numbersPreserved"] is exp["numbersPreserved"], body["checks"]
    if "trend" in exp:
        assert body["result"]["trend"] == exp["trend"]
    if "minSzigriszt" in exp:
        assert body["readability"]["output"]["szigrisztPazos"] >= exp["minSzigriszt"], body["readability"][
            "output"
        ]
    if "needsHumanReview" in exp:
        assert body["needsHumanReview"] is exp["needsHumanReview"], body.get("reviewReason")
    if exp.get("suggestionDiffers"):  # una sugerencia DEBE cambiar un borrador pobre (no devolverlo igual)
        res, req = body["result"], case["request"]
        assert res["objective"]["title"].strip() != req["objective"]["title"].strip(), res["objective"]
        assert any(
            k["title"].strip() != d["title"].strip()
            for k, d in zip(res["keyResults"], req["keyResults"], strict=False)
        ), res["keyResults"]
    if exp.get("rationaleNonEmpty"):
        res = body["result"]
        assert res["objective"]["rationale"].strip(), res["objective"]
        assert all(k["rationale"].strip() for k in res["keyResults"]), res["keyResults"]
    if exp.get("noRawEnumTokens"):  # el texto visible no repite códigos internos (RED, STOP, COMMITTED...)
        from okr_agent.agent.features import raw_enum_tokens

        def strings(o, key=""):
            if isinstance(o, str):
                if key not in ("trend", "code", "level"):
                    yield o
            elif isinstance(o, dict):
                for k, v in o.items():
                    yield from strings(v, k)
            elif isinstance(o, list):
                for v in o:
                    yield from strings(v, key)

        visible = " ".join(strings(body["result"]))
        src = " ".join(strings(case["request"]))
        assert raw_enum_tokens(visible, src) == [], visible
    if exp.get(
        "noUnexplainedJargon"
    ):  # jerga/anglicismos del texto o bien reemplazados, o bien en el glosario
        from okr_agent.guards.jargon import load_jargon, unexplained_jargon

        res = body["result"]
        text = " ".join(s["text"] for s in res["segments"])
        terms = load_jargon(ROOT / "config" / "jargon.yaml")
        src = " ".join(s["text"] for s in case["request"]["segments"])
        left = unexplained_jargon(text, [g["term"] for g in res["glossary"]], src, terms)
        print(f"   glossary={[g['term'] for g in res['glossary']]} unexplainedJargon={left}")
        assert left == [], (left, res)
    for token in exp.get("outputContains", []):
        assert token in " ".join(s["text"] for s in body["result"]["segments"]), body["result"]["segments"]
    if exp.get("noRawEnum"):  # W2: ningun segmento de salida repite un token enum del origen
        sources = {s["key"]: s["text"] for s in case["request"]["segments"]}
        for seg in body["result"]["segments"]:
            assert seg["text"].strip().upper() != sources[seg["key"]].strip().upper(), seg
    for start, target in exp.get("keepValues", []):
        krs = body["result"]["keyResults"]
        assert any(k["startValue"] == start and k["targetValue"] == target for k in krs)
    key = os.environ.get("NVIDIA_NIM_API_KEY") or Settings().nvidia_nim_api_key
    assert key and key not in r.text
