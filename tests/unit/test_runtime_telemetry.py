"""Arranque del servicio, fabrica real de LiteLlm (sin red) y telemetria opcional."""

import sys
import types
from pathlib import Path

import pytest

from okr_agent import telemetry
from okr_agent.agent.llm_factory import make_litellm_factory
from okr_agent.agent.models import ConfigError, load_models_config
from okr_agent.agent.resilient_llm import ResilientLlm
from okr_agent.api.main import create_app
from okr_agent.settings import Settings

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(autouse=True)
def reset_telemetry():
    yield
    telemetry._enabled = False
    telemetry._client = None


# ----------------------------------------------------------------------------- arranque


def test_create_app_with_real_litellm_factory_builds_without_network():
    settings = Settings(_env_file=None, agent_shared_secret="s" * 40, nvidia_nim_api_key="placeholder")
    app = create_app(settings)  # LiteLlm real; no se hace ninguna llamada
    runtime = app.state.runtime
    assert set(runtime.runners) == {"adapt", "okr_suggest", "checkin_summary"}
    assert runtime.limiter.max_concurrency == 4


def test_litellm_factory_uses_nvidia_nim_prefix_base_and_key():
    settings = Settings(_env_file=None, nvidia_nim_api_key="placeholder")
    cfg = load_models_config(ROOT / "config" / "models.yaml", settings)
    llm = make_litellm_factory(settings, cfg)("meta/llama-3.3-70b-instruct")
    assert llm.model == "nvidia_nim/meta/llama-3.3-70b-instruct"
    assert llm._additional_args["api_base"] == "https://integrate.api.nvidia.com/v1"
    assert llm._additional_args["api_key"] == "placeholder"


def test_litellm_factory_omits_api_key_when_not_configured():
    settings = Settings(_env_file=None)
    cfg = load_models_config(ROOT / "config" / "models.yaml", settings)
    llm = make_litellm_factory(settings, cfg)("meta/llama-3.3-70b-instruct")
    assert "api_key" not in llm._additional_args


def test_service_refuses_to_start_when_judge_shares_family_with_generator():
    settings = Settings(_env_file=None, agent_model_judge="nvidia/mismo-proveedor")
    with pytest.raises(ConfigError):
        create_app(settings)


def test_app_attribute_is_lazy_and_cached(monkeypatch):
    import okr_agent.api.main as main

    created = []
    monkeypatch.setattr(main, "create_app", lambda: created.append(1) or "APP")
    main.__dict__.pop("app", None)
    assert main.app == "APP" and main.app == "APP"
    assert len(created) == 1
    main.__dict__.pop("app", None)


def test_resilient_llm_declares_no_output_schema_with_tools():
    from tests.conftest import FakeLlm, Provider

    llm = ResilientLlm(
        llm_factory=lambda m: FakeLlm(model=m, provider=Provider()),
        limiter=None,  # type: ignore[arg-type]
        model="a/b",
        fallback_model=None,
    )
    assert llm.capabilities.output_schema_and_tools is False
    assert len(llm._plan()) == 2  # primario x (1 + max_retries), sin fallback


# ----------------------------------------------------------------------------- telemetria


def test_telemetry_is_noop_without_langfuse_env():
    assert telemetry.init_telemetry(Settings(_env_file=None)) is False
    with telemetry.request_span("adapt", "tid"):
        pass
    telemetry.shutdown_telemetry()  # no explota


def test_telemetry_initializes_langfuse_and_adk_instrumentor(monkeypatch):
    calls = {}

    class FakeClient:
        def flush(self):
            calls["flush"] = True

    class FakeInstrumentor:
        def instrument(self):
            calls["instrument"] = True

    monkeypatch.setitem(sys.modules, "langfuse", types.SimpleNamespace(get_client=lambda: FakeClient()))
    monkeypatch.setitem(
        sys.modules,
        "openinference.instrumentation.google_adk",
        types.SimpleNamespace(GoogleADKInstrumentor=FakeInstrumentor),
    )
    monkeypatch.delenv("LANGFUSE_PUBLIC_KEY", raising=False)
    monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)
    s = Settings(
        _env_file=None,
        langfuse_public_key="pk-placeholder",
        langfuse_secret_key="sk-placeholder",
        langfuse_host="http://lf:3000",
    )
    assert telemetry.init_telemetry(s) is True
    assert calls == {"instrument": True}
    telemetry.shutdown_telemetry()
    assert calls["flush"] is True
    import os

    assert os.environ["LANGFUSE_HOST"] == "http://lf:3000"
    monkeypatch.delenv("LANGFUSE_PUBLIC_KEY", raising=False)
    monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)
    monkeypatch.delenv("LANGFUSE_HOST", raising=False)


def test_telemetry_failure_never_breaks_startup(monkeypatch):
    def boom():
        raise RuntimeError("langfuse caido")

    monkeypatch.setitem(sys.modules, "langfuse", types.SimpleNamespace(get_client=boom))
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk")
    s = Settings(_env_file=None, langfuse_public_key="pk", langfuse_secret_key="sk")
    assert telemetry.init_telemetry(s) is False


def test_request_span_sets_okr_trace_id_attribute(monkeypatch):
    attrs = {}
    spans = []

    class FakeSpan:
        def set_attribute(self, k, v):
            attrs[k] = v

    class Ctx:
        def __enter__(self):
            spans.append("enter")

        def __exit__(self, *a):
            spans.append("exit")

    class FakeClient:
        def start_as_current_observation(self, **kw):
            spans.append(kw["name"])
            return Ctx()

    pa_calls = {}

    def fake_propagate(**kw):
        pa_calls.update(kw)
        return Ctx()

    monkeypatch.setitem(sys.modules, "langfuse", types.SimpleNamespace(propagate_attributes=fake_propagate))
    import opentelemetry.trace as ot

    monkeypatch.setattr(ot, "get_current_span", lambda: FakeSpan())
    telemetry._enabled, telemetry._client = True, FakeClient()
    with telemetry.request_span("adapt", "3b1f6c2e-8f4d-4a51-9a63-2d7f0c9e5b10"):
        pass
    assert attrs["okr.trace_id"] == "3b1f6c2e-8f4d-4a51-9a63-2d7f0c9e5b10"
    assert attrs["session.id"] == "3b1f6c2e-8f4d-4a51-9a63-2d7f0c9e5b10"
    assert pa_calls["session_id"] == "3b1f6c2e-8f4d-4a51-9a63-2d7f0c9e5b10"
    assert spans[0] == "okr-agent.adapt"
