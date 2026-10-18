"""Configuracion del servicio por variables de entorno (nunca hardcodear secretos)."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    nvidia_nim_api_key: str = ""
    nvidia_nim_api_base: str | None = None

    agent_shared_secret: str = ""
    agent_port: int = 8088
    agent_max_concurrency: int = Field(default=4, ge=1)
    agent_request_deadline_s: float = Field(default=120.0, gt=0)
    agent_log_level: str = "INFO"
    agent_home: Path | None = None

    agent_model_classify: str | None = None
    agent_model_classify_fallback: str | None = None
    agent_model_generate: str | None = None
    agent_model_generate_fallback: str | None = None
    agent_model_regenerate: str | None = None
    agent_model_regenerate_fallback: str | None = None
    agent_model_planner: str | None = None
    agent_model_planner_fallback: str | None = None
    agent_model_summarize: str | None = None
    agent_model_summarize_fallback: str | None = None
    agent_planner_mode: Literal["schema", "tools"] | None = None  # pisa planner.mode de models.yaml
    agent_model_judge: str | None = None
    agent_model_judge_fallback: str | None = None

    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_host: str = ""

    @property
    def home(self) -> Path:
        return self.agent_home or _REPO_ROOT

    @property
    def models_config_path(self) -> Path:
        return self.home / "config" / "models.yaml"

    @property
    def jargon_config_path(self) -> Path:
        return self.home / "config" / "jargon.yaml"

    @property
    def prompts_dir(self) -> Path:
        return self.home / "prompts"

    @property
    def api_key_configured(self) -> bool:
        return bool(self.nvidia_nim_api_key.strip())

    @property
    def langfuse_enabled(self) -> bool:
        return bool(self.langfuse_public_key and self.langfuse_secret_key)
