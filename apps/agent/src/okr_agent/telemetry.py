"""Telemetria opcional: Langfuse (v3+/OTel) + instrumentacion OpenInference de Google ADK.

Sin LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY todo es no-op y el servicio funciona igual.
Cada pedido abre un span raiz con `okr.trace_id` y `session.id` = X-Trace-Id para cruzar
la fila LlmCall de NestJS con la traza de Langfuse.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Iterator
from contextlib import contextmanager

from .settings import Settings

logger = logging.getLogger("okr_agent.telemetry")

_enabled = False
_client = None


def init_telemetry(settings: Settings) -> bool:
    """Inicializa Langfuse + GoogleADKInstrumentor si hay credenciales. Devuelve si quedo activo."""
    global _enabled, _client
    if not settings.langfuse_enabled:
        _enabled = False
        return False
    try:
        # El cliente de Langfuse lee estas variables del entorno
        os.environ.setdefault("LANGFUSE_PUBLIC_KEY", settings.langfuse_public_key)
        os.environ.setdefault("LANGFUSE_SECRET_KEY", settings.langfuse_secret_key)
        if settings.langfuse_host:
            os.environ.setdefault("LANGFUSE_HOST", settings.langfuse_host)
        from langfuse import get_client
        from openinference.instrumentation.google_adk import GoogleADKInstrumentor

        _client = get_client()
        GoogleADKInstrumentor().instrument()
        _enabled = True
        logger.info("Telemetria Langfuse activa")
    except Exception:  # noqa: BLE001 - la telemetria nunca debe tumbar el servicio
        logger.exception("No se pudo inicializar Langfuse; se continua sin telemetria")
        _enabled = False
    return _enabled


def shutdown_telemetry() -> None:
    if _enabled and _client is not None:
        try:
            _client.flush()
        except Exception:  # noqa: BLE001
            logger.exception("Error al hacer flush de Langfuse")


@contextmanager
def request_span(feature: str, trace_id: str) -> Iterator[None]:
    """Span raiz del pedido (no-op si la telemetria esta apagada)."""
    if not _enabled or _client is None:
        yield
        return
    from langfuse import propagate_attributes
    from opentelemetry import trace

    with _client.start_as_current_observation(name=f"okr-agent.{feature}", as_type="span"):
        with propagate_attributes(session_id=trace_id, metadata={"feature": feature}):
            span = trace.get_current_span()
            span.set_attribute("okr.trace_id", trace_id)
            span.set_attribute("session.id", trace_id)
            yield
