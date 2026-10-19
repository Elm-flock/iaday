"""Fixtures compartidas. NINGUN test toca la red: los LLM son FakeLlm scriptables."""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from collections import defaultdict, deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from google.adk.models import BaseLlm, LlmCapabilities, LlmRequest, LlmResponse
from google.genai import types

from okr_agent.agent.models import TierConfig, load_models_config
from okr_agent.agent.pipeline import build_runtime
from okr_agent.api.auth import sign
from okr_agent.api.main import create_app
from okr_agent.prompts.loader import PromptStore
from okr_agent.settings import Settings

ROOT = Path(__file__).resolve().parents[1]
SECRET = "s" * 48  # secreto de prueba (no real)


# ----------------------------------------------------------------------------- Fake LLM


@dataclass
class Text:
    text: str
    in_tokens: int = 100
    out_tokens: int = 50


@dataclass
class Call:
    """El modelo responde con llamadas a herramientas (varias en el mismo turno = llamadas paralelas)."""

    calls: list[tuple[str, dict]]
    in_tokens: int = 100
    out_tokens: int = 50


@dataclass
class Hang:
    """Nunca responde: fuerza el timeout del intento."""


@dataclass
class Boom:
    exc: BaseException


class UpstreamRateLimit(Exception):
    status_code = 429


class Provider:
    """Guion de respuestas por ID de modelo + registro de llamadas."""

    def __init__(self) -> None:
        self.queues: dict[str, deque] = defaultdict(deque)
        self.calls: list[dict[str, Any]] = []

    def script(self, model: str, *actions: Any) -> None:
        self.queues[model].extend(actions)

    def next_action(self, model: str) -> Any:
        q = self.queues[model]
        if not q:
            raise AssertionError(f"FakeLlm sin respuestas guionadas para {model}")
        return q.popleft()

    def calls_for(self, model: str) -> list[dict[str, Any]]:
        return [c for c in self.calls if c["model"] == model]

    @property
    def models_called(self) -> list[str]:
        return [c["model"] for c in self.calls]


class FakeLlm(BaseLlm):
    provider: Any = None

    @property
    def capabilities(self) -> LlmCapabilities:
        return LlmCapabilities(output_schema_and_tools=False)

    async def generate_content_async(self, llm_request: LlmRequest, stream: bool = False):
        model = llm_request.model or self.model
        instruction = ""
        if llm_request.config and llm_request.config.system_instruction:
            si = llm_request.config.system_instruction
            instruction = si if isinstance(si, str) else str(si)
        self.provider.calls.append(
            {"model": model, "instruction": instruction, "contents": llm_request.contents}
        )
        action = self.provider.next_action(model)
        if isinstance(action, Hang):
            await asyncio.sleep(3600)
        if isinstance(action, Boom):
            raise action.exc
        if isinstance(action, Call):
            parts = [types.Part(function_call=types.FunctionCall(name=n, args=a)) for n, a in action.calls]
            yield LlmResponse(
                content=types.Content(role="model", parts=parts),
                usage_metadata=types.GenerateContentResponseUsageMetadata(
                    prompt_token_count=action.in_tokens, candidates_token_count=action.out_tokens
                ),
            )
            return
        yield LlmResponse(
            content=types.Content(role="model", parts=[types.Part(text=action.text)]),
            usage_metadata=types.GenerateContentResponseUsageMetadata(
                prompt_token_count=action.in_tokens, candidates_token_count=action.out_tokens
            ),
        )


# ----------------------------------------------------------------------------- harness


class Harness:
    def __init__(
        self,
        settings: Settings | None = None,
        *,
        timeout_s: float = 0.2,
        max_concurrency: int = 4,
        regen_tier: bool = False,
        admin_tiers: bool = False,
        planner_mode: str = "schema",
    ):
        self.settings = settings or Settings(
            _env_file=None,
            agent_shared_secret=SECRET,
            nvidia_nim_api_key="test-key-placeholder",
            agent_max_concurrency=max_concurrency,
        )
        self.cfg = load_models_config(ROOT / "tests" / "fixtures" / "models.test.yaml", self.settings)
        if regen_tier:  # tier opcional `regenerate`: modelos propios para el paso REGENERATE
            self.cfg.tiers["regenerate"] = TierConfig(
                model="fam-g/regen-primary", fallback="fam-g/regen-fallback", max_tokens=2048
            )
        if admin_tiers:  # tiers de la extension admin: IDs propios para distinguir cada rol en el FakeLlm
            self.cfg.tiers["planner"] = TierConfig(
                model="fam-p/planner-primary",
                fallback="fam-p/planner-fallback",
                max_tokens=3072,
                temperature=0.0,
                mode=planner_mode,
                tools_fallback="fam-p/planner-tools-fallback",
            )
            self.cfg.tiers["summarize"] = TierConfig(
                model="fam-s/summarize-primary", fallback="fam-s/summarize-fallback", max_tokens=768
            )
        self.cfg.defaults.timeout_s = timeout_s
        self.cfg.defaults.backoff_s = 0
        self.prompts = PromptStore(ROOT / "prompts")
        self.provider = Provider()

        def factory(model_id: str) -> BaseLlm:
            return FakeLlm(model=model_id, provider=self.provider)

        self.runtime = build_runtime(self.settings, self.cfg, self.prompts, factory)
        self.app = create_app(runtime=self.runtime)
        self.client = TestClient(self.app, raise_server_exceptions=False)

    # modelos por tier
    @property
    def classify(self) -> str:
        return self.cfg.tiers["classify"].model

    @property
    def classify_fb(self) -> str:
        return self.cfg.tiers["classify"].fallback

    @property
    def gen(self) -> str:
        return self.cfg.tiers["generate"].model

    @property
    def gen_fb(self) -> str:
        return self.cfg.tiers["generate"].fallback

    @property
    def regen(self) -> str:
        return self.cfg.tiers["regenerate"].model

    @property
    def regen_fb(self) -> str:
        return self.cfg.tiers["regenerate"].fallback

    @property
    def planner(self) -> str:
        return self.cfg.tiers["planner"].model

    @property
    def planner_fb(self) -> str:
        return self.cfg.fallback_for("planner")

    @property
    def summarize(self) -> str:
        return self.cfg.tiers["summarize"].model

    @property
    def summarize_fb(self) -> str:
        return self.cfg.tiers["summarize"].fallback

    @property
    def judge(self) -> str:
        return self.cfg.tiers["judge"].model

    @property
    def judge_fb(self) -> str:
        return self.cfg.tiers["judge"].fallback

    def post(
        self,
        path: str,
        body: dict | bytes,
        *,
        secret: str | None = SECRET,
        timestamp: str | None = None,
        trace_id: str | None | bool = True,
        signature: str | None | bool = True,
    ):
        raw = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode("utf-8")
        ts = timestamp if timestamp is not None else str(int(time.time()))
        tid = str(uuid.uuid4()) if trace_id is True else trace_id
        headers = {"Content-Type": "application/json; charset=utf-8", "X-Agent-Timestamp": ts}
        if tid:
            headers["X-Trace-Id"] = tid
        if signature is True:
            headers["X-Agent-Signature"] = sign(secret or "", ts, raw)
        elif signature:
            headers["X-Agent-Signature"] = signature
        return self.client.post(path, content=raw, headers=headers), tid


@pytest.fixture
def h() -> Harness:
    return Harness()


@pytest.fixture
def ah() -> Harness:
    """Extension admin: tiers `planner` (modo schema) y `summarize` con IDs propios."""
    return Harness(admin_tiers=True)


@pytest.fixture
def ah_tools() -> Harness:
    """Extension admin con planner.mode = tools."""
    return Harness(admin_tiers=True, planner_mode="tools")


# ----------------------------------------------------------------------------- payloads / respuestas tipicas

CLASSIFY_OK = json.dumps(
    {"outOfScope": False, "injectionSuspected": False, "sensitive": False, "reason": "ok"}
)
JUDGE_OK = json.dumps({"verdict": "FAITHFUL", "reasons": []})
JUDGE_BAD = json.dumps({"verdict": "UNFAITHFUL", "reasons": ["cambia el sentido"]})

ADAPT_REQUEST = {
    "level": "EASY_READ",
    "entityType": "CHECK_IN",
    "locale": "es",
    "segments": [
        {
            "key": "checkin.kr_title",
            "text": "Reducir el tiempo medio de resolución de incidencias P1 de 8 h a 4 h",
        },
        {
            "key": "checkin.note",
            "text": "Bajamos a 5,5 h gracias al runbook; lo escalamos al comité el 15/11.",
        },
    ],
    "mustPreserve": ["8 h", "4 h", "5,5 h", "15/11"],
}

# Salida facil de leer que conserva 8 h, 4 h, 5,5 h y 15/11
ADAPT_GOOD = json.dumps(
    {
        "segments": [
            {
                "key": "checkin.kr_title",
                "text": "Queremos arreglar más rápido. Antes tardábamos 8 h. La meta es 4 h.",
            },
            {
                "key": "checkin.note",
                "text": "Ahora tardamos 5,5 h. Mejoramos con una guía. El 15/11 se lo contamos al comité.",
            },
        ],
        "glossary": [{"term": "comité", "explanation": "Un grupo que decide."}],
    },
    ensure_ascii=False,
)
# Pierde el 4 h y el 15/11
ADAPT_LOSES_NUMBERS = json.dumps(
    {
        "segments": [
            {
                "key": "checkin.kr_title",
                "text": "Queremos arreglar más rápido. Antes tardábamos 8 h.",
            },
            {"key": "checkin.note", "text": "Ahora tardamos 5,5 h. Mejoramos con una guía."},
        ],
        "glossary": [],
    },
    ensure_ascii=False,
)


def script_happy_adapt(h: Harness, generated: str = ADAPT_GOOD) -> None:
    h.provider.script(h.classify, Text(CLASSIFY_OK, 600, 38))
    h.provider.script(h.gen, Text(generated, 1480, 402))
    h.provider.script(h.judge, Text(JUDGE_OK, 1950, 96))
