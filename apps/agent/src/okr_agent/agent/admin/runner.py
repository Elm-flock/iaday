"""Ejecucion de un pedido de la extension admin (chat | digest | help) y armado de la respuesta del contrato."""

from __future__ import annotations

import logging
import time
from typing import Any

from google.adk.agents import BaseAgent
from google.adk.agents.run_config import RunConfig
from google.adk.runners import InMemoryRunner
from google.genai import types

from ...api.admin_schemas import (
    AdminChatResponse,
    DigestResponse,
    HelpAnswerResponse,
)
from ...api.errors import AgentError, internal
from ...telemetry import request_span
from ..models import ModelsConfig
from ..resilient_llm import ResilientLlm
from ..usage import PipelineRun, UsageCollector, current_run
from .agents import (
    AdminChatAgent,
    DigestAgent,
    HelpAnswerAgent,
    build_chat_subagents,
    build_digest_subagent,
    build_help_agent,
)

logger = logging.getLogger("okr_agent.admin")

APP_PREFIX = "okr_agent"
USER_ID = "nest"
TRIGGER = "Procesá el pedido descrito en las instrucciones y respondé solo con lo pedido."
MAX_LLM_CALLS = 24  # tope de seguridad del bucle de herramientas (modo tools)

ADMIN_FEATURES = ("admin_chat", "admin_digest", "help_answer")


def build_admin_runners(llms: dict[str, ResilientLlm], cfg: ModelsConfig) -> dict[str, InMemoryRunner]:
    agents: dict[str, BaseAgent] = {
        "admin_chat": AdminChatAgent(
            name="admin_chat_pipeline",
            description="Classifies an admin chat turn and plans, queries, answers from the manual or replies.",
            sub_agents=build_chat_subagents(llms, cfg),
        ),
        "admin_digest": DigestAgent(
            name="admin_digest_pipeline",
            description="Writes the admin news summary and verifies numbers and names against the facts.",
            sub_agents=[build_digest_subagent(llms, cfg)],
        ),
        "help_answer": HelpAnswerAgent(
            name="help_answer_pipeline",
            description="Answers a how-to question using only the manual fragments sent with the request.",
            sub_agents=[build_help_agent(llms, cfg)],
        ),
    }
    return {
        feature: InMemoryRunner(agent=agent, app_name=f"{APP_PREFIX}_{feature}")
        for feature, agent in agents.items()
    }


def build_chat_response(run: PipelineRun) -> dict[str, Any]:
    o = run.outcome or {}
    body = {
        "traceId": run.trace_id,
        "intent": o["intent"],
        "reply": o["reply"],
        "plan": o["plan"],
        "query": o["query"],
        "citations": o["citations"],
        "checks": {
            "piiMasked": run.pii.count if run.pii else 0,
            "injectionSuspected": False,
            "planLocalIssues": [i.model_dump(by_alias=True, mode="json") for i in o["issues"]],
        },
        "prompt": o["prompt"],
        "usage": run.collector.snapshot(),
    }
    model = AdminChatResponse.model_validate(body)  # red de seguridad: forma == contrato
    out = model.model_dump(by_alias=True, mode="json")
    # los opcionales ausentes se OMITEN dentro de plan/query (el contrato no define nulls en acciones)
    out["plan"] = model.plan.model_dump(by_alias=True, mode="json", exclude_none=True) if model.plan else None
    out["query"] = (
        model.query.model_dump(by_alias=True, mode="json", exclude_none=True) if model.query else None
    )
    return out


def build_digest_response(run: PipelineRun) -> dict[str, Any]:
    o = run.outcome or {}
    body = {
        "traceId": run.trace_id,
        "summary": o["summary"],
        "checks": o["checks"],
        "prompt": o["prompt"],
        "usage": run.collector.snapshot(),
    }
    return DigestResponse.model_validate(body).model_dump(by_alias=True, mode="json")


def build_help_response(run: PipelineRun) -> dict[str, Any]:
    o = run.outcome or {}
    body = {
        "traceId": run.trace_id,
        "answer": o["answer"],
        "citations": o["citations"],
        "found": o["found"],
        "prompt": o["prompt"],
        "usage": run.collector.snapshot(),
    }
    return HelpAnswerResponse.model_validate(body).model_dump(by_alias=True, mode="json")


_BUILDERS = {
    "admin_chat": build_chat_response,
    "admin_digest": build_digest_response,
    "help_answer": build_help_response,
}


async def run_admin(rt: Any, feature: str, request: Any, trace_id: str) -> dict[str, Any]:
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
        spec=None,
    )
    token = current_run.set(run)
    runner = rt.admin_runners[feature]
    try:
        with request_span(feature, trace_id):
            session = await runner.session_service.create_session(app_name=runner.app_name, user_id=USER_ID)
            try:
                message = types.Content(role="user", parts=[types.Part(text=TRIGGER)])
                async for _event in runner.run_async(
                    user_id=USER_ID,
                    session_id=session.id,
                    new_message=message,
                    run_config=RunConfig(max_llm_calls=MAX_LLM_CALLS),
                ):
                    pass
            finally:
                await runner.session_service.delete_session(
                    app_name=runner.app_name, user_id=USER_ID, session_id=session.id
                )
        if run.outcome is None:
            raise internal()
        return _BUILDERS[feature](run)
    except AgentError as exc:
        exc.usage = collector.snapshot()
        exc.trace_id = trace_id
        raise
    except Exception as exc:  # noqa: BLE001 - nunca un 500 crudo
        logger.exception("Fallo no previsto en el pipeline admin (%s)", type(exc).__name__)
        err = internal()
        err.usage = collector.snapshot()
        err.trace_id = trace_id
        raise err from exc
    finally:
        current_run.reset(token)
