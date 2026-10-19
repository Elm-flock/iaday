"""Autenticacion HMAC (contrato v1, seccion 3) sobre el body CRUDO.

firma = "sha256=" + hex(HMAC_SHA256(secret, f"{timestamp}.{rawBody}"))
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import time
import uuid

from fastapi import Request

from .errors import unauthorized

logger = logging.getLogger("okr_agent.auth")

MAX_SKEW_S = 300


def sign(secret: str, timestamp: str, raw_body: bytes) -> str:
    """Firma segun contrato (la usan tests y herramientas de prueba)."""
    msg = timestamp.encode("utf-8") + b"." + raw_body
    return "sha256=" + hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).hexdigest()


def verify_signature(
    secret: str,
    timestamp: str | None,
    signature: str | None,
    trace_id: str | None,
    raw_body: bytes,
    now: float | None = None,
) -> str:
    """Devuelve el traceId normalizado si es valido; si no, lanza AgentError UNAUTHORIZED."""
    if not secret:
        logger.error("AGENT_SHARED_SECRET no configurado: se rechazan todos los pedidos /v1")
        raise unauthorized()
    if not timestamp or not signature or not trace_id:
        raise unauthorized()
    try:
        ts = int(timestamp)
        parsed = uuid.UUID(trace_id)
    except ValueError:
        raise unauthorized() from None
    current = time.time() if now is None else now
    if abs(current - ts) > MAX_SKEW_S:
        raise unauthorized()
    expected = sign(secret, timestamp, raw_body)
    if not hmac.compare_digest(expected.encode("utf-8"), signature.encode("utf-8")):
        raise unauthorized()
    return str(parsed)


async def authenticated_body(request: Request) -> bytes:
    """Dependency: lee el body crudo, verifica la firma y deja el traceId en request.state."""
    raw = await request.body()
    secret = request.app.state.runtime.settings.agent_shared_secret
    trace_id = verify_signature(
        secret,
        request.headers.get("x-agent-timestamp"),
        request.headers.get("x-agent-signature"),
        request.headers.get("x-trace-id"),
        raw,
    )
    request.state.trace_id = trace_id
    return raw
