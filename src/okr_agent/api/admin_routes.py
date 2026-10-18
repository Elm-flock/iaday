"""Rutas de la extension admin (docs/ai/agent-contract-admin.md): /v1/admin/chat, /v1/admin/digest-summary, /v1/help/answer.

Misma autenticacion HMAC (dependency `authenticated_body`), mismo envelope de error y mismo limite de body (64 KiB)
que los endpoints base.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ..agent.admin.runner import run_admin
from .admin_schemas import AdminChatRequest, DigestRequest, HelpAnswerRequest
from .auth import authenticated_body


def build_admin_router(parse_body) -> APIRouter:
    router = APIRouter()

    async def _handle(request: Request, feature: str, model: type[BaseModel], raw: bytes):
        payload = parse_body(raw, model)
        body = await run_admin(request.app.state.runtime, feature, payload, request.state.trace_id)
        return JSONResponse(body, headers={"X-Trace-Id": request.state.trace_id})

    @router.post("/v1/admin/chat")
    async def admin_chat(request: Request, raw: bytes = Depends(authenticated_body)):
        return await _handle(request, "admin_chat", AdminChatRequest, raw)

    @router.post("/v1/admin/digest-summary")
    async def admin_digest(request: Request, raw: bytes = Depends(authenticated_body)):
        return await _handle(request, "admin_digest", DigestRequest, raw)

    @router.post("/v1/help/answer")
    async def help_answer(request: Request, raw: bytes = Depends(authenticated_body)):
        return await _handle(request, "help_answer", HelpAnswerRequest, raw)

    return router
