"""Pipeline ADK por feature: SequentialAgent([InputGuard, GenerateStep, Verify]) + ejecucion de un pedido."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any

from google.adk.agents import SequentialAgent
from google.adk.runners import InMemoryRunner
from google.genai import types

from ..api.errors import AgentError, internal
from ..api.schemas import (
    AdaptResponse,
    CheckinSummaryResponse,
    OkrSuggestResponse,
)
from ..guards import readability
from ..guards.jargon import load_jargon
from ..prompts.loader import PromptStore
from ..settings import Settings
from ..telemetry import request_span
from .concurrency import ConcurrencyLimiter
from .features import SPECS
from .models import ModelsConfig
from .resilient_llm import ResilientLlm
from .steps.generate_step import GenerateStepAgent
from .steps.input_guard import InputGuardAgent
from .steps.verify import VerifyAgent
from .subagents.classify import build_classify_agent
from .subagents.generate import build_generate_agent
from .subagents.judge import build_judge_agent
from .usage import PipelineRun, UsageCollector, current_run

logger = logging.getLogger("okr_agent.pipeline")

APP_PREFIX = "okr_agent"
USER_ID = "nest"
TRIGGER = "Procesá el pedido descrito en las instrucciones y respondé solo con el JSON pedido."

RESPONSE_MODELS = {
    "adapt": AdaptResponse,
    "okr_suggest": OkrSuggestResponse,
    "checkin_summary": CheckinSummaryResponse,
}


@dataclass
class AgentRuntime:
    settings: Settings
    cfg: ModelsConfig
    prompts: PromptStore
    limiter: ConcurrencyLimiter
    runners: dict[str, InMemoryRunner]
    # extension admin (chat | digest | help)
    admin_runners: dict[str, InMemoryRunner] = field(default_factory=dict)
    jargon: tuple[str, ...] = ()  # config/jargon.yaml


def build_tier_llms(cfg: ModelsConfig, limiter: ConcurrencyLimiter, llm_factory) -> dict[str, ResilientLlm]:
    return {
        tier: ResilientLlm(
            llm_factory=llm_factory,
            limiter=limiter,
            model=tc.model,
            fallback_model=cfg.fallback_for(tier),
            tier=tier,
            timeout_s=cfg.timeout_for(tier),
            max_retries=cfg.defaults.max_retries,
            backoff_s=cfg.defaults.backoff_s,
        )
        for tier, tc in cfg.tiers.items()
    }


def build_pipeline(feature: str, llms: dict[str, ResilientLlm], cfg: ModelsConfig) -> SequentialAgent:
    guard = InputGuardAgent(
        name=f"input_guard_{feature}",
        description="Validates, masks PII and classifies the input before generation.",
        sub_agents=[build_classify_agent(llms["classify"], cfg)],
    )
    generate = GenerateStepAgent(
        name=f"generate_step_{feature}",
        description="Runs the generator subagent with a single JSON repair retry.",
        sub_agents=[build_generate_agent(feature, llms["generate"], cfg)],
    )
    verify = VerifyAgent(
        name=f"verify_{feature}",
        description="Verifies fidelity, readability and judge verdict; regenerates once.",
        sub_agents=[
            build_judge_agent(llms["judge"], cfg),
            build_generate_agent(
                feature, llms[cfg.regenerate_tier()], cfg, regenerate=True, tier=cfg.regenerate_tier()
            ),
        ],
    )
    return SequentialAgent(
        name=f"{feature}_pipeline",
        description=f"Accessibility pipeline for {feature}.",
        sub_agents=[guard, generate, verify],
    )


def build_runtime(settings: Settings, cfg: ModelsConfig, prompts: PromptStore, llm_factory) -> AgentRuntime:
    limiter = ConcurrencyLimiter(settings.agent_max_concurrency)
    llms = build_tier_llms(cfg, limiter, llm_factory)
    runners = {
        feature: InMemoryRunner(agent=build_pipeline(feature, llms, cfg), app_name=f"{APP_PREFIX}_{feature}")
        for feature in SPECS
    }
    jargon = load_jargon(settings.jargon_config_path)
    from .admin.runner import build_admin_runners  # import diferido: evita ciclo con api.admin_schemas

    return AgentRuntime(
        settings=settings,
        cfg=cfg,
        prompts=prompts,
        limiter=limiter,
        runners=runners,
        admin_runners=build_admin_runners(llms, cfg),
        jargon=jargon,
    )


def _build_response(run: PipelineRun) -> dict[str, Any]:
    spec, outcome = run.spec, run.outcome
    assert outcome is not None
    result = outcome["result"]
    glossary = spec.glossary_terms(result)
    out_metrics = readability.compute_metrics(spec.result_text(result), glossary)
    prompt = run.prompts.get(spec.generate_prompt_id(run.masked)).ref()
    body: dict[str, Any] = {
        "traceId": run.trace_id,
        "needsHumanReview": outcome["needs_review"],
        "reviewReason": outcome["reason"],
        "result": result,
        "checks": {
            "piiMasked": run.pii.count if run.pii else 0,
            "sensitiveContent": run.sensitive,
            "numbersPreserved": outcome["numbers_preserved"],
            "missingTokens": outcome["missing"],
            "judge": outcome["judge"],
            "regenerated": outcome["regenerated"],
        },
        "prompt": prompt,
        "usage": run.collector.snapshot(),
    }
    if run.feature == "adapt":
        body["readability"] = {
            "source": readability.compute_metrics(spec.source_metrics_text(run.request)),
            "output": out_metrics,
        }
    else:
        body["readability"] = {"output": out_metrics}
    model = RESPONSE_MODELS[run.feature].model_validate(body)  # red de seguridad: forma == contrato
    return model.model_dump(by_alias=True, mode="json")


async def run_pipeline(rt: AgentRuntime, feature: str, request: Any, trace_id: str) -> dict[str, Any]:
    collector = UsageCollector(rt.cfg)
    run = PipelineRun(
        feature=feature,
        request=request,
        trace_id=trace_id,
        collector=collector,
        deadline=time.monotonic() + rt.settings.agent_request_deadline_s,
        prompts=rt.prompts,
        cfg=rt.cfg,
        jargon=rt.jargon,
        spec=SPECS[feature],
    )
    token = current_run.set(run)
    runner = rt.runners[feature]
    try:
        with request_span(feature, trace_id):
            session = await runner.session_service.create_session(app_name=runner.app_name, user_id=USER_ID)
            try:
                message = types.Content(role="user", parts=[types.Part(text=TRIGGER)])
                async for _event in runner.run_async(
                    user_id=USER_ID, session_id=session.id, new_message=message
                ):
                    pass
            finally:
                await runner.session_service.delete_session(
                    app_name=runner.app_name, user_id=USER_ID, session_id=session.id
                )
        if run.outcome is None:
            raise internal()
        return _build_response(run)
    except AgentError as exc:
        exc.usage = collector.snapshot()
        exc.trace_id = trace_id
        raise
    except Exception as exc:  # noqa: BLE001 - nunca un 500 crudo
        logger.exception("Fallo no previsto en el pipeline (%s)", type(exc).__name__)
        err = internal()
        err.usage = collector.snapshot()
        err.trace_id = trace_id
        raise err from exc
    finally:
        current_run.reset(token)
