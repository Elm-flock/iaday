"""Carga de prompts versionados: prompts/<id>/v<N>.md con front-matter YAML.

- hash = sha256(archivo completo)[:12]
- render con string.Template ($var). NO usar el templating {var} de ADK: choca con las llaves
  del JSON de los prompts (por eso se entrega como InstructionProvider).
- Nunca se edita una version publicada: se agrega v2.md. La activa sale de prompts/active.yaml
  (id: version) o, si no existe, la mayor.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path
from string import Template

import yaml

_FRONT = re.compile(r"\A---\s*\n(.*?)\n---\s*\n?(.*)\Z", re.DOTALL)
_VERSION_FILE = re.compile(r"v(\d+)\.md\Z")

REQUIRED_PROMPTS = (
    "classify",
    "easy_read",
    "plain_language",
    "okr_suggest",
    "checkin_summary",
    "judge",
    "judge_suggest",
    "admin_classify",
    "admin_planner",
    "admin_query",
    "admin_reply",
    "help_answer",
    "digest_summary",
)


class PromptError(Exception):
    pass


@dataclass(frozen=True)
class Prompt:
    id: str
    version: str
    hash: str
    tier: str
    output_schema: str
    description: str
    template: str

    def render(self, **variables: object) -> str:
        values = {k: ("" if v is None else str(v)) for k, v in variables.items()}
        return Template(self.template).safe_substitute(values)

    def ref(self) -> dict:
        return {"id": self.id, "version": self.version, "hash": self.hash}


def parse_prompt(path: Path) -> Prompt:
    raw = path.read_text(encoding="utf-8")
    match = _FRONT.match(raw)
    if not match:
        raise PromptError(f"{path}: falta el front-matter YAML")
    meta = yaml.safe_load(match.group(1)) or {}
    for key in ("id", "version", "tier"):
        if key not in meta:
            raise PromptError(f"{path}: falta '{key}' en el front-matter")
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]
    return Prompt(
        id=str(meta["id"]),
        version=str(meta["version"]),
        hash=digest,
        tier=str(meta["tier"]),
        output_schema=str(meta.get("output_schema", "")),
        description=str(meta.get("description", "")),
        template=match.group(2).strip("\n"),
    )


class PromptStore:
    def __init__(self, directory: Path):
        self.directory = Path(directory)
        self._prompts: dict[str, Prompt] = {}
        self._load()

    def _load(self) -> None:
        if not self.directory.is_dir():
            raise PromptError(f"No existe la carpeta de prompts: {self.directory}")
        active: dict[str, str] = {}
        active_file = self.directory / "active.yaml"
        if active_file.exists():
            active = {
                str(k): str(v) for k, v in (yaml.safe_load(active_file.read_text("utf-8")) or {}).items()
            }
        for sub in sorted(p for p in self.directory.iterdir() if p.is_dir()):
            versions = {int(m.group(1)): f for f in sub.iterdir() if (m := _VERSION_FILE.match(f.name))}
            if not versions:
                continue
            wanted = active.get(sub.name)
            if wanted is not None:
                number = int(str(wanted).lstrip("v"))
                if number not in versions:
                    raise PromptError(f"{sub.name}: version activa {wanted} inexistente")
            else:
                number = max(versions)
            prompt = parse_prompt(versions[number])
            if prompt.id != sub.name:
                raise PromptError(f"{versions[number]}: id '{prompt.id}' != carpeta '{sub.name}'")
            self._prompts[prompt.id] = prompt
        missing = [p for p in REQUIRED_PROMPTS if p not in self._prompts]
        if missing:
            raise PromptError(f"Faltan prompts: {', '.join(missing)}")

    def get(self, prompt_id: str) -> Prompt:
        try:
            return self._prompts[prompt_id]
        except KeyError as exc:
            raise PromptError(f"Prompt desconocido: {prompt_id}") from exc

    def all(self) -> list[Prompt]:
        order = {pid: i for i, pid in enumerate(REQUIRED_PROMPTS)}
        return sorted(self._prompts.values(), key=lambda p: order.get(p.id, 99))
