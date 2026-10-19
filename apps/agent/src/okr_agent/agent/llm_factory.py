"""Fabrica por defecto de modelos: LiteLlm de ADK apuntando a NVIDIA NIM ("nvidia_nim/<id>")."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from google.adk.models import BaseLlm

from ..settings import Settings
from .models import ModelsConfig


def litellm_options(cfg: ModelsConfig, model_id: str) -> dict[str, Any]:
    """Kwargs de litellm segun `model_options` (LiteLlm los aplica DESPUES del response_format de ADK)."""
    opts = cfg.options_for(model_id)
    out: dict[str, Any] = {}
    if opts.json_mode == "object":
        out["response_format"] = {"type": "json_object"}
    elif opts.json_mode == "none":
        out["response_format"] = None
    if opts.extra_body:
        out["extra_body"] = opts.extra_body
    return out


def make_litellm_factory(settings: Settings, cfg: ModelsConfig) -> Callable[[str], BaseLlm]:
    def factory(model_id: str) -> BaseLlm:
        from google.adk.models.lite_llm import LiteLlm

        kwargs: dict[str, Any] = {"api_base": cfg.api_base}
        if settings.nvidia_nim_api_key:
            kwargs["api_key"] = settings.nvidia_nim_api_key
        kwargs.update(litellm_options(cfg, model_id))
        return LiteLlm(model=f"{cfg.litellm_prefix}/{model_id}", **kwargs)

    return factory
