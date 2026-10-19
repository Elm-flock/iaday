"""ResilientLlm: timeout, 1 reintento con backoff, fallback, UsageStep por intento, limitador."""

import asyncio
import time

import pytest
from google.adk.models import LlmRequest

from okr_agent.agent.concurrency import ConcurrencyLimiter
from okr_agent.agent.resilient_llm import (
    ResilientLlm,
    classify_exception,
    extract_json_text,
)
from okr_agent.agent.usage import PipelineRun, StepContext, UsageCollector, current_run
from okr_agent.api.errors import AgentError
from tests.conftest import Boom, FakeLlm, Hang, Harness, Provider, Text, UpstreamRateLimit

PRIMARY, FALLBACK = "nvidia/primary", "meta/fallback"


def make(provider: Provider, h: Harness, *, max_retries=1, timeout_s=0.05, limiter=None, backoff_s=0.0):
    return ResilientLlm(
        llm_factory=lambda mid: FakeLlm(model=mid, provider=provider),
        limiter=limiter or ConcurrencyLimiter(4),
        model=PRIMARY,
        fallback_model=FALLBACK,
        tier="generate",
        timeout_s=timeout_s,
        max_retries=max_retries,
        backoff_s=backoff_s,
    )


async def call(llm: ResilientLlm, h: Harness, *, deadline_s=30.0):
    collector = UsageCollector(h.cfg)
    run = PipelineRun(
        feature="adapt",
        request=None,
        trace_id="t",
        collector=collector,
        deadline=time.monotonic() + deadline_s,
        prompts=h.prompts,
        cfg=h.cfg,
    )
    run.step_ctx = StepContext("GENERATE", "easy_read", "1", "abc123abc123")
    token = current_run.set(run)
    try:
        out = [r async for r in llm.generate_content_async(LlmRequest(model=PRIMARY, contents=[]))]
        return out, collector, None
    except AgentError as exc:
        return None, collector, exc
    finally:
        current_run.reset(token)


@pytest.fixture
def hh():
    return Harness()


async def test_success_first_attempt_records_usage(hh):
    p = Provider()
    p.script(PRIMARY, Text('{"a":1}', 120, 30))
    out, col, err = await call(make(p, hh), hh)
    assert err is None and len(out) == 1
    (step,) = col.steps
    assert step["step"] == "GENERATE" and step["attempt"] == 1
    assert step["model"] == PRIMARY and step["isFallback"] is False
    assert (step["inputTokens"], step["outputTokens"]) == (120, 30)
    assert step["status"] == "OK" and step["errorCode"] is None
    assert step["promptId"] == "easy_read" and step["promptHash"] == "abc123abc123"
    assert step["costUsdEst"] > 0


async def test_timeout_then_retry_succeeds_same_model(hh):
    p = Provider()
    p.script(PRIMARY, Hang(), Text('{"ok":true}'))
    out, col, err = await call(make(p, hh), hh)
    assert err is None
    assert [(s["attempt"], s["status"], s["errorCode"], s["model"]) for s in col.steps] == [
        (1, "FAILED", "TIMEOUT", PRIMARY),
        (2, "OK", None, PRIMARY),
    ]
    failed = col.steps[0]
    assert failed["inputTokens"] == 0 and failed["outputTokens"] == 0 and failed["costUsdEst"] == 0


async def test_primary_exhausted_falls_back_and_marks_is_fallback(hh):
    p = Provider()
    p.script(PRIMARY, Boom(RuntimeError("500")), Hang())
    p.script(FALLBACK, Text('{"ok":true}', 10, 5))
    out, col, err = await call(make(p, hh), hh)
    assert err is None
    assert [(s["attempt"], s["model"], s["isFallback"], s["errorCode"]) for s in col.steps] == [
        (1, PRIMARY, False, "UPSTREAM_ERROR"),
        (2, PRIMARY, False, "TIMEOUT"),
        (3, FALLBACK, True, None),
    ]


async def test_everything_fails_is_model_unavailable_with_usage(hh):
    p = Provider()
    p.script(PRIMARY, Hang(), Hang())
    p.script(FALLBACK, Boom(RuntimeError("down")))
    out, col, err = await call(make(p, hh), hh)
    assert out is None and err.code == "MODEL_UNAVAILABLE" and err.status == 503 and err.retryable
    assert err.details == {"step": "GENERATE"}
    assert len(col.steps) == 3 and all(s["status"] == "FAILED" for s in col.steps)


async def test_rate_limited_upstream_maps_to_rate_limited(hh):
    p = Provider()
    p.script(PRIMARY, Boom(UpstreamRateLimit()), Boom(UpstreamRateLimit()))
    p.script(FALLBACK, Boom(UpstreamRateLimit()))
    out, col, err = await call(make(p, hh), hh)
    assert err.code == "RATE_LIMITED" and err.status == 429 and err.retry_after == 10
    assert {s["errorCode"] for s in col.steps} == {"UPSTREAM_RATE_LIMITED"}


async def test_max_retries_zero_goes_straight_to_fallback(hh):
    p = Provider()
    p.script(PRIMARY, Boom(RuntimeError("x")))
    p.script(FALLBACK, Text('{"ok":1}'))
    out, col, err = await call(make(p, hh, max_retries=0), hh)
    assert err is None and [s["model"] for s in col.steps] == [PRIMARY, FALLBACK]


async def test_backoff_is_applied_between_retry_not_before_fallback(hh):
    p = Provider()
    p.script(PRIMARY, Boom(RuntimeError("x")), Boom(RuntimeError("x")))
    p.script(FALLBACK, Text('{"ok":1}'))
    t0 = time.monotonic()
    await call(make(p, hh, backoff_s=0.2), hh)
    elapsed = time.monotonic() - t0
    assert 0.18 <= elapsed < 0.38  # un solo backoff (entre intento 1 y 2)


async def test_deadline_exhausted_is_model_unavailable(hh):
    p = Provider()
    out, col, err = await call(make(p, hh), hh, deadline_s=-1)
    assert err.code == "MODEL_UNAVAILABLE"
    assert col.steps == []  # no se llego a llamar a nadie


async def test_deadline_caps_attempt_timeout(hh):
    p = Provider()
    p.script(PRIMARY, Hang())
    llm = make(p, hh, timeout_s=10, max_retries=0)
    t0 = time.monotonic()
    out, col, err = await call(llm, hh, deadline_s=0.15)
    assert time.monotonic() - t0 < 1.0
    assert err.code == "MODEL_UNAVAILABLE"
    assert col.steps[0]["errorCode"] == "TIMEOUT"


async def test_empty_response_counts_as_upstream_error_and_retries(hh):
    p = Provider()
    p.script(PRIMARY, Text("   ", 50, 0), Text('{"ok":1}'))
    out, col, err = await call(make(p, hh), hh)
    assert err is None
    assert [(s["status"], s["errorCode"]) for s in col.steps] == [
        ("FAILED", "UPSTREAM_ERROR"),
        ("OK", None),
    ]
    assert col.steps[0]["inputTokens"] == 50  # los tokens reportados se conservan


async def test_response_text_is_cleaned_of_think_and_fences(hh):
    p = Provider()
    p.script(PRIMARY, Text('<think>razono...</think>\n```json\n{"ok": true}\n```'))
    out, col, err = await call(make(p, hh), hh)
    assert out[0].content.parts[0].text == '{"ok": true}'
    assert col.last_text == '{"ok": true}'


async def test_limiter_times_out_with_rate_limited(hh):
    p = Provider()
    limiter = ConcurrencyLimiter(1, wait_timeout_s=0.05)
    p.script(PRIMARY, Text('{"ok":1}'))
    async with limiter.slot():  # alguien mas ocupa el unico turno
        out, col, err = await call(make(p, hh, limiter=limiter), hh)
    assert err.code == "RATE_LIMITED" and err.retry_after == 10
    assert col.steps == [] and p.calls == []


async def test_limiter_bounds_concurrency(hh):
    limiter = ConcurrencyLimiter(2, wait_timeout_s=2)
    running = peak = 0

    async def job():
        nonlocal running, peak
        async with limiter.slot():
            running += 1
            peak = max(peak, running)
            await asyncio.sleep(0.02)
            running -= 1

    await asyncio.gather(*(job() for _ in range(8)))
    assert peak == 2


def test_classify_exception_variants():
    class APITimeoutError(Exception): ...

    class RateLimitError(Exception): ...

    class E429(Exception):
        status_code = 429

    assert classify_exception(TimeoutError()) == "TIMEOUT"
    assert classify_exception(TimeoutError()) == "TIMEOUT"
    assert classify_exception(APITimeoutError()) == "TIMEOUT"
    assert classify_exception(RateLimitError()) == "UPSTREAM_RATE_LIMITED"
    assert classify_exception(E429()) == "UPSTREAM_RATE_LIMITED"
    assert classify_exception(RuntimeError()) == "UPSTREAM_ERROR"


@pytest.mark.parametrize(
    ("raw", "clean"),
    [
        ('{"a":1}', '{"a":1}'),
        ('```json\n{"a":1}\n```', '{"a":1}'),
        ('<think>x</think>{"a":1}', '{"a":1}'),
        ('Claro, aquí está: {"a":1} espero que sirva', '{"a":1}'),
        ("[1,2]", "[1,2]"),
        ("sin json", "sin json"),
        # diffusiongemma omite la llave inicial
        ('outOfScope": false, "reason": "ok"}', '{"outOfScope": false, "reason": "ok"}'),
        ('"outOfScope": false}', '{"outOfScope": false}'),
        ("termina en llave}", "termina en llave}"),
    ],
)
def test_extract_json_text(raw, clean):
    assert extract_json_text(raw) == clean
