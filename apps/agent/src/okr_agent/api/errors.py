"""Envelope de error del contrato. Toda respuesta no-2xx tiene esta forma (nunca HTML ni stack)."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("okr_agent")

_HTTP = {
    "UNAUTHORIZED": 401,
    "INVALID_REQUEST": 400,
    "INPUT_REJECTED": 422,
    "OUTPUT_INVALID": 502,
    "MODEL_UNAVAILABLE": 503,
    "RATE_LIMITED": 429,
    "INTERNAL": 500,
}
_RETRYABLE = {
    "UNAUTHORIZED": False,
    "INVALID_REQUEST": False,
    "INPUT_REJECTED": False,
    "OUTPUT_INVALID": True,
    "MODEL_UNAVAILABLE": True,
    "RATE_LIMITED": True,
    "INTERNAL": True,
}


class AgentError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
        usage: list[dict] | None = None,
        retry_after: int | None = None,
        trace_id: str | None = None,
    ):
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message
        self.details = details or {}
        self.usage = usage or []
        self.retry_after = retry_after
        self.trace_id = trace_id

    @property
    def status(self) -> int:
        return _HTTP[self.code]

    @property
    def retryable(self) -> bool:
        return _RETRYABLE[self.code]


def unauthorized() -> AgentError:
    return AgentError("UNAUTHORIZED", "No autorizado.")


def invalid_request(fields: list[dict[str, str]], message: str = "El pedido no es válido.") -> AgentError:
    return AgentError("INVALID_REQUEST", message, {"fields": fields})


def input_rejected(reason: str) -> AgentError:
    messages = {
        "EMPTY": "El texto está vacío.",
        "TOO_LONG": "El texto es demasiado largo.",
        "OUT_OF_SCOPE": "El texto no parece contenido de OKRs, check-ins o feedback.",
        "INJECTION_SUSPECTED": "El texto no parece contenido de OKRs, check-ins o feedback.",
    }
    return AgentError("INPUT_REJECTED", messages.get(reason, "Entrada rechazada."), {"reason": reason})


def output_invalid(step: str) -> AgentError:
    return AgentError(
        "OUTPUT_INVALID",
        "La salida del generador no tiene el formato esperado.",
        {"step": step},
    )


def model_unavailable(step: str, message: str | None = None) -> AgentError:
    return AgentError(
        "MODEL_UNAVAILABLE",
        message or "El modelo no respondió a tiempo (primario y fallback).",
        {"step": step},
    )


def rate_limited(retry_after: int = 10) -> AgentError:
    return AgentError(
        "RATE_LIMITED",
        "Hay demasiados pedidos en curso. Probá de nuevo en unos segundos.",
        {"retryAfterSeconds": retry_after},
        retry_after=retry_after,
    )


def internal() -> AgentError:
    return AgentError("INTERNAL", "Error interno del agente.")


def error_response(err: AgentError, trace_id: str | None) -> JSONResponse:
    tid = trace_id or err.trace_id
    body = {
        "traceId": tid,
        "error": {
            "code": err.code,
            "message": err.message,
            "retryable": err.retryable,
            "details": err.details,
        },
        "usage": err.usage,
    }
    headers: dict[str, str] = {}
    if tid:
        headers["X-Trace-Id"] = tid
    if err.retry_after is not None:
        headers["Retry-After"] = str(err.retry_after)
    return JSONResponse(body, status_code=err.status, headers=headers)


def _trace_of(request: Request) -> str | None:
    return getattr(request.state, "trace_id", None)


def install_handlers(app: FastAPI) -> None:
    @app.exception_handler(AgentError)
    async def _agent_error(request: Request, exc: AgentError):
        return error_response(exc, _trace_of(request))

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException):
        err = AgentError("INVALID_REQUEST", "Ruta o método no válidos.", {})
        resp = error_response(err, _trace_of(request))
        resp.status_code = exc.status_code
        return resp

    @app.exception_handler(Exception)
    async def _unexpected(request: Request, exc: Exception):
        logger.exception("Excepcion no prevista")
        return error_response(internal(), _trace_of(request))
