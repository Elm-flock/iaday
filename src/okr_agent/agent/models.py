"""Carga de config/models.yaml, overrides por entorno, validacion de familias y costo estimado."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field

from ..settings import Settings

TIERS = ("classify", "generate", "judge")
# si falta: regenerate/planner/summarize usan `generate`
OPTIONAL_TIERS = ("regenerate", "planner", "summarize")
PlannerMode = Literal["schema", "tools"]


class ConfigError(Exception):
    pass


class Defaults(BaseModel):
    timeout_s: float = 20
    max_retries: int = 1
    backoff_s: float = 1.5
    temperature: float = 0.2


class TierConfig(BaseModel):
    model: str
    fallback: str
    max_tokens: int = 1024
    temperature: float | None = None
    timeout_s: float | None = None  # por intento; si falta rige defaults.timeout_s
    # solo tier `planner`: schema (output_schema) | tools (FunctionTools que solo registran)
    mode: PlannerMode | None = None
    tools_fallback: str | None = None  # solo tier `planner`: fallback propio del modo tools


class Price(BaseModel):
    input: float
    output: float


class ModelOptions(BaseModel):
    """Opciones por modelo (ID de NIM). El comportamiento de NIM varia por modelo.

    json_mode: "schema" (default, lo que envia ADK con output_schema: response_format json_schema),
               "object" (response_format json_object) o "none" (sin response_format; se valida con Pydantic).
    extra_body: se envia tal cual en el body (p. ej. chat_template_kwargs.enable_thinking=false).
    """

    json_mode: Literal["schema", "object", "none"] = "schema"
    extra_body: dict[str, Any] | None = None


class ModelsConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")

    api_base: str = "https://integrate.api.nvidia.com/v1"
    litellm_prefix: str = "nvidia_nim"
    defaults: Defaults = Defaults()
    tiers: dict[str, TierConfig]
    readability_min: dict[str, float] = Field(default_factory=lambda: {"EASY_READ": 65, "PLAIN": 55})
    pricing_usd_per_1m: dict[str, Price] = Field(default_factory=dict)
    model_options: dict[str, ModelOptions] = Field(default_factory=dict)

    def options_for(self, model: str) -> ModelOptions:
        return self.model_options.get(model) or ModelOptions()

    def timeout_for(self, tier: str) -> float:
        t = self.tiers[tier].timeout_s
        return self.defaults.timeout_s if t is None else t

    def regenerate_tier(self) -> str:
        return "regenerate" if "regenerate" in self.tiers else "generate"

    def planner_tier(self) -> str:
        return "planner" if "planner" in self.tiers else "generate"

    def summarize_tier(self) -> str:
        return "summarize" if "summarize" in self.tiers else "generate"

    def planner_mode(self) -> PlannerMode:
        return (self.tiers["planner"].mode if "planner" in self.tiers else None) or "schema"

    def fallback_for(self, tier: str) -> str:
        """Fallback efectivo: el planner en modo tools puede tener uno propio (`tools_fallback`)."""
        tc = self.tiers[tier]
        if tier == "planner" and self.planner_mode() == "tools" and tc.tools_fallback:
            return tc.tools_fallback
        return tc.fallback

    def temperature_for(self, tier: str) -> float:
        t = self.tiers[tier].temperature
        return self.defaults.temperature if t is None else t

    def price_for(self, model: str) -> Price:
        return self.pricing_usd_per_1m.get(model) or self.pricing_usd_per_1m.get(
            "default", Price(input=0.5, output=1.5)
        )


def family(model_id: str) -> str:
    """Familia = prefijo antes de '/'."""
    return model_id.split("/", 1)[0].lower()


def validate_families(cfg: ModelsConfig) -> None:
    """El juez (modelo y fallback) no puede compartir familia con el generador (modelo ni fallback)."""
    for tier in TIERS:
        if tier not in cfg.tiers:
            raise ConfigError(f"Falta el tier '{tier}' en models.yaml")
    gen: set[str] = set()
    # planner/summarize no entran: sus pipelines (admin) no usan juez.
    for tier in ("generate", "regenerate"):
        if tier in cfg.tiers:
            gen |= {family(cfg.tiers[tier].model), family(cfg.tiers[tier].fallback)}
    judge = {family(cfg.tiers["judge"].model), family(cfg.tiers["judge"].fallback)}
    clash = gen & judge
    if clash:
        raise ConfigError(
            "El juez debe ser de otra familia que el generador; familias en comun: "
            + ", ".join(sorted(clash))
        )


def load_models_config(path: Path, settings: Settings | None = None) -> ModelsConfig:
    try:
        raw = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        raise ConfigError(f"No se pudo leer {path}: {exc}") from exc
    try:
        cfg = ModelsConfig.model_validate(raw)
    except Exception as exc:  # pydantic ValidationError
        raise ConfigError(f"models.yaml invalido: {exc}") from exc
    if settings is not None:
        for tier in (*TIERS, *OPTIONAL_TIERS):
            if tier not in cfg.tiers:
                continue
            model = getattr(settings, f"agent_model_{tier}")
            fallback = getattr(settings, f"agent_model_{tier}_fallback")
            if model:
                cfg.tiers[tier].model = model
            if fallback:
                cfg.tiers[tier].fallback = fallback
        if settings.agent_planner_mode and "planner" in cfg.tiers:
            cfg.tiers["planner"].mode = settings.agent_planner_mode
        if settings.nvidia_nim_api_base:
            cfg.api_base = settings.nvidia_nim_api_base
    validate_families(cfg)
    return cfg


def estimate_cost_usd(cfg: ModelsConfig, model: str, input_tokens: int, output_tokens: int) -> float:
    price = cfg.price_for(model)
    cost = (input_tokens * price.input + output_tokens * price.output) / 1_000_000
    return round(cost, 8)
