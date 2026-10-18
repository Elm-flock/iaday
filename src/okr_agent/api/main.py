"""FastAPI: /v1/adapt, /v1/okr-suggest, /v1/checkin-summary y /health (contrato v1)."""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from google.adk.models import BaseLlm
from pydantic import BaseModel, ValidationError

from .. import __version__
from ..agent.llm_factory import make_litellm_factory
from ..agent.models import load_models_config
from ..agent.pipeline import AgentRuntime, build_runtime, run_pipeline
from ..prompts.loader import PromptStore
from ..settings import Settings
from ..telemetry import init_telemetry, shutdown_telemetry
from .admin_routes import build_admin_router
from .auth import authenticated_body
from .errors import install_handlers, invalid_request
from .schemas import (
    CONTRACT_VERSION,
    AdaptRequest,
    CheckinSummaryRequest,
    HealthResponse,
    OkrSuggestRequest,
)

logger = logging.getLogger("okr_agent")

MAX_BODY_BYTES = 64 * 1024


def _parse_body(raw: bytes, model: type[BaseModel]) -> Any:
    if len(raw) > MAX_BODY_BYTES:
        raise invalid_request([{"path": "", "issue": "El body supera 64 KiB."}])
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise invalid_request([{"path": "", "issue": "El body no es JSON válido."}]) from None
    try:
        return model.model_validate(data)
    except ValidationError as exc:
        fields = [{"path": ".".join(str(p) for p in err["loc"]), "issue": err["msg"]} for err in exc.errors()]
        raise invalid_request(fields) from None


def create_app(
    settings: Settings | None = None,
    llm_factory: Callable[[str], BaseLlm] | None = None,
    runtime: AgentRuntime | None = None,
) -> FastAPI:
    """Arma la app. Falla al arrancar si models.yaml / prompts son invalidos (juez == familia generador)."""
    if runtime is None:
        settings = settings or Settings()
        logging.basicConfig(level=settings.agent_log_level.upper())
        cfg = load_models_config(settings.models_config_path, settings)
        prompts = PromptStore(settings.prompts_dir)
        factory = llm_factory or make_litellm_factory(settings, cfg)
        runtime = build_runtime(settings, cfg, prompts, factory)
    init_telemetry(runtime.settings)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        yield
        shutdown_telemetry()

    app = FastAPI(
        title="okr-platform-agent",
        version=__version__,
        description="Agente de accesibilidad cognitiva (contrato HTTP v1).",
        lifespan=lifespan,
    )
    app.state.runtime = runtime
    install_handlers(app)

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError):
        from .errors import error_response

        fields = [{"path": ".".join(str(p) for p in e["loc"]), "issue": e["msg"]} for e in exc.errors()]
        return error_response(invalid_request(fields), getattr(request.state, "trace_id", None))

    async def _handle(request: Request, feature: str, model: type[BaseModel], raw: bytes):
        payload = _parse_body(raw, model)
        body = await run_pipeline(runtime, feature, payload, request.state.trace_id)
        return JSONResponse(body, headers={"X-Trace-Id": request.state.trace_id})

    @app.post("/v1/adapt")
    async def adapt(request: Request, raw: bytes = Depends(authenticated_body)):
        return await _handle(request, "adapt", AdaptRequest, raw)

    @app.post("/v1/okr-suggest")
    async def okr_suggest(request: Request, raw: bytes = Depends(authenticated_body)):
        return await _handle(request, "okr_suggest", OkrSuggestRequest, raw)

    @app.post("/v1/checkin-summary")
    async def checkin_summary(request: Request, raw: bytes = Depends(authenticated_body)):
        return await _handle(request, "checkin_summary", CheckinSummaryRequest, raw)

    app.include_router(build_admin_router(_parse_body))

    @app.get("/health")
    async def health():
        rt = runtime
        body = {
            "status": "ok" if rt.settings.api_key_configured else "degraded",
            "contractVersion": CONTRACT_VERSION,
            "version": __version__,
            "models": {
                tier: {"model": tc.model, "fallback": rt.cfg.fallback_for(tier)}
                for tier, tc in rt.cfg.tiers.items()
            },
            "prompts": [p.ref() for p in rt.prompts.all()],
            "apiKeyConfigured": rt.settings.api_key_configured,
        }
        return JSONResponse(HealthResponse.model_validate(body).model_dump(by_alias=True, mode="json"))

    return app


def __getattr__(name: str):
    """`uvicorn okr_agent.api.main:app` -> la app se crea recien al pedirla (no al importar)."""
    if name == "app":
        app = create_app()
        globals()["app"] = app
        return app
    raise AttributeError(name)
