"""Especificacion por feature (adapt, okr_suggest, checkin_summary).

Cada FeatureSpec sabe: que textos validar/enmascarar, que prompt y variables usar, como verificar
la salida (fidelidad determinista), como armar el `result` del contrato y cual es el resultado de
respaldo (texto original) cuando la verificacion falla dos veces.
"""

from __future__ import annotations

import json
import re
from typing import Any

from ..api.schemas import AdaptRequest, CheckinSummaryRequest, OkrSuggestRequest
from ..guards import fidelity, readability
from ..guards import jargon as jargon_guard
from ..guards.pii import MaskTable, mask
from ..guards.trend import compute_trend
from .models import ModelsConfig
from .schemas import AdaptOut, CheckinSummaryOut, OkrSuggestOut

MAX_GLOSSARY = 15
MAX_LIST = 5
MAX_TITLE = 300
MAX_SUMMARY = 1200

# Token de enum/codigo interno suelto (p. ej. "NOT_STARTED", "STOP"): no es lenguaje para personas.
_ENUM_TOKEN = re.compile(r"^[A-Z_]{3,}$")


def is_enum_token(text: str) -> bool:
    return bool(_ENUM_TOKEN.match(text.strip()))


# Valores de enum del contrato (viajan tipados, NO son lenguaje para personas): se traducen en el prompt
# y la salida visible no puede repetirlos crudos.
BAND_LABELS = {"RED": "en riesgo", "YELLOW": "requiere atención", "GREEN": "en camino"}
ACTION_LABELS = {"CONTINUE": "Continuar", "UPDATE": "Actualizar", "START": "Iniciar", "STOP": "Detener"}
SCORING_LABELS = {"DERIVED": "calculado a partir del valor", "MANUAL": "puntaje cargado a mano"}
TREND_LABELS = {
    "IMPROVING": "mejorando",
    "STABLE": "estable",
    "DECLINING": "empeorando",
    "INSUFFICIENT_DATA": "datos insuficientes",
}
OBJECTIVE_TYPE_LABELS = {
    "COMMITTED": "comprometido (se espera cumplirlo por completo)",
    "ASPIRATIONAL": "aspiracional (ambicioso; cumplir una parte ya es un logro)",
}
CYCLE_LABELS = {"ANNUAL": "anual", "QUARTER": "trimestral"}
ENUM_VALUES = frozenset(
    {*BAND_LABELS, *ACTION_LABELS, *SCORING_LABELS, *TREND_LABELS, *OBJECTIVE_TYPE_LABELS, *CYCLE_LABELS}
    | {"EASY_READ", "PLAIN", "STANDARD", "OBJECTIVE", "CHECK_IN", "FEEDBACK"}
)
_UPPER_WORD = re.compile(r"\b[A-Z]+(?:_[A-Z]+)*\b")


def raw_enum_tokens(output: str, source: str = "") -> list[str]:
    """Tokens enum crudos (RED, STOP, NOT_STARTED...) en un texto visible que NO estaban en el origen."""
    src = set(_UPPER_WORD.findall(source))
    found: list[str] = []
    for w in _UPPER_WORD.findall(output):
        if (w in ENUM_VALUES or ("_" in w and len(w) >= 5)) and w not in src and w not in found:
            found.append(w)
    return found


def enum_problem(tokens: list[str]) -> list[str]:
    if not tokens:
        return []
    return [
        "El texto repite códigos internos ("
        + ", ".join(tokens)
        + "): no los uses; expresalos en español simple (por ejemplo en riesgo, requiere atención, "
        "en camino, continuar, detener)."
    ]


def _dumps(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=2)


def _m(text: str | None, table: MaskTable) -> str | None:
    return None if text is None else mask(text, table)


def _same_value(a: str | None, b: str | None) -> bool:
    if a is None or b is None:
        return a == b
    return fidelity.canonical_number(a) == fidelity.canonical_number(b) or a.strip() == b.strip()


class FeatureSpec:
    name = ""
    judge_prompt_id = "judge"  # la sugerencia de OKR tiene el suyo

    # Resultado de la verificacion adicional (no numeros): lista de problemas legibles
    def texts(self, req: Any) -> list[str]:
        raise NotImplementedError

    def mask(self, req: Any, table: MaskTable) -> Any:
        raise NotImplementedError

    def classify_text(self, masked: Any) -> str:
        raise NotImplementedError

    def generate_prompt_id(self, masked: Any) -> str:
        raise NotImplementedError

    def generate_vars(self, masked: Any) -> dict[str, Any]:
        raise NotImplementedError

    def normalize(self, masked: Any, out: Any) -> Any:
        """Ajustes deterministas de la salida (truncados, proposedValues). Devuelve el modelo."""
        return out

    def check_schema(self, masked: Any, out: Any) -> None:
        """Lanza ValueError si la salida no cumple una regla estructural del contrato."""

    def source_text(self, masked: Any) -> str:
        raise NotImplementedError

    def output_text(self, out: Any) -> str:
        raise NotImplementedError

    def preservation(self, masked: Any, out: Any) -> tuple[list[str], list[str]]:
        """(tokens faltantes, otros problemas)."""
        raise NotImplementedError

    def judge_vars(self, masked: Any, out: Any) -> dict[str, Any]:
        raise NotImplementedError

    def readability_min(self, req: Any, cfg: ModelsConfig) -> float | None:
        return None

    def result(self, req: Any, out: Any) -> dict:
        raise NotImplementedError

    def fallback_result(self, req: Any) -> dict:
        raise NotImplementedError

    def result_text(self, result: dict) -> str:
        """Texto (ya desenmascarado) del result, para metricas de legibilidad."""
        raise NotImplementedError

    def glossary_terms(self, result: dict) -> list[str]:
        return []

    def unexplained_jargon(self, masked: Any, result: dict, jargon: tuple[str, ...]) -> list[str]:
        """Jerga sin explicar en el texto visible (solo adapt). Chequeo interno, no es del contrato."""
        return []


class AdaptSpec(FeatureSpec):
    name = "adapt"

    def texts(self, req: AdaptRequest) -> list[str]:
        return [s.text for s in req.segments]

    def mask(self, req: AdaptRequest, table: MaskTable) -> AdaptRequest:
        return req.model_copy(
            update={
                "segments": [s.model_copy(update={"text": mask(s.text, table)}) for s in req.segments],
                "must_preserve": [mask(t, table) for t in req.must_preserve],
            }
        )

    def classify_text(self, masked: AdaptRequest) -> str:
        return "\n".join(f"{s.key}: {s.text}" for s in masked.segments)

    def generate_prompt_id(self, masked: AdaptRequest) -> str:
        return "easy_read" if masked.level == "EASY_READ" else "plain_language"

    def generate_vars(self, masked: AdaptRequest) -> dict[str, Any]:
        return {
            "entity_type": masked.entity_type,
            "segments_json": _dumps([{"key": s.key, "text": s.text} for s in masked.segments]),
            "must_preserve": ", ".join(f'"{t}"' for t in masked.must_preserve) or "(ninguno en particular)",
        }

    def normalize(self, masked: AdaptRequest, out: AdaptOut) -> AdaptOut:
        segments = [s.model_copy(update={"text": fidelity.format_thousands(s.text)}) for s in out.segments]
        return out.model_copy(update={"segments": segments, "glossary": out.glossary[:MAX_GLOSSARY]})

    def check_schema(self, masked: AdaptRequest, out: AdaptOut) -> None:
        expected = [s.key for s in masked.segments]
        got = [s.key for s in out.segments]
        if got != expected:
            raise ValueError(
                f"Las claves de los segmentos deben ser exactamente {expected} en ese orden; recibí {got}."
            )

    def source_text(self, masked: AdaptRequest) -> str:
        return "\n".join(s.text for s in masked.segments)

    def output_text(self, out: AdaptOut) -> str:
        return "\n".join(s.text for s in out.segments)

    def preservation(self, masked: AdaptRequest, out: AdaptOut) -> tuple[list[str], list[str]]:
        missing = fidelity.check_preservation(
            self.source_text(masked), self.output_text(out), masked.must_preserve
        )
        problems: list[str] = []
        by_key = {s.key: s.text for s in out.segments}
        for s in masked.segments:
            got = by_key.get(s.key)
            if is_enum_token(s.text) and got is not None and got.strip().upper() == s.text.strip().upper():
                problems.append(
                    f'El texto "{s.text.strip()}" ({s.key}) es un código interno: no lo repitas tal cual; '
                    "expresalo con palabras simples que entienda cualquier persona."
                )
        problems += enum_problem(raw_enum_tokens(self.output_text(out), self.source_text(masked)))
        return missing, problems

    def judge_vars(self, masked: AdaptRequest, out: AdaptOut) -> dict[str, Any]:
        return {
            "feature": f"adaptación de texto (nivel: {masked.level})",
            "source_json": _dumps([{"key": s.key, "text": s.text} for s in masked.segments]),
            "output_json": _dumps(
                {
                    "segments": [{"key": s.key, "text": s.text} for s in out.segments],
                    "glossary": [g.model_dump() for g in out.glossary],
                }
            ),
        }

    def readability_min(self, req: AdaptRequest, cfg: ModelsConfig) -> float | None:
        return cfg.readability_min.get(req.level)

    def result(self, req: AdaptRequest, out: AdaptOut) -> dict:
        return {
            "level": req.level,
            "segments": [{"key": s.key, "text": s.text} for s in out.segments],
            "glossary": [g.model_dump() for g in out.glossary[:MAX_GLOSSARY]],
        }

    def fallback_result(self, req: AdaptRequest) -> dict:
        return {
            "level": req.level,
            "segments": [{"key": s.key, "text": s.text} for s in req.segments],
            "glossary": [],
        }

    def result_text(self, result: dict) -> str:
        return readability.concat_text(s["text"] for s in result["segments"])

    def glossary_terms(self, result: dict) -> list[str]:
        return [g["term"] for g in result["glossary"]]

    def unexplained_jargon(self, masked: AdaptRequest, result: dict, jargon: tuple[str, ...]) -> list[str]:
        return jargon_guard.unexplained_jargon(
            "\n".join(s["text"] for s in result["segments"]),
            self.glossary_terms(result),
            "\n".join(s.text for s in masked.segments),
            jargon,
        )

    # texto del origen para metricas (no enmascarado)
    def source_metrics_text(self, req: AdaptRequest) -> str:
        return readability.concat_text(s.text for s in req.segments)


class OkrSuggestSpec(FeatureSpec):
    name = "okr_suggest"
    judge_prompt_id = "judge_suggest"

    def texts(self, req: OkrSuggestRequest) -> list[str]:
        out = [req.objective.title, req.objective.description or ""]
        out += [kr.title for kr in req.key_results]
        return out

    def mask(self, req: OkrSuggestRequest, table: MaskTable) -> OkrSuggestRequest:
        return req.model_copy(
            update={
                "objective": req.objective.model_copy(
                    update={
                        "title": mask(req.objective.title, table),
                        "description": _m(req.objective.description, table),
                    }
                ),
                "key_results": [
                    kr.model_copy(update={"title": mask(kr.title, table), "unit": _m(kr.unit, table)})
                    for kr in req.key_results
                ],
            }
        )

    def _draft(self, req: OkrSuggestRequest) -> dict:
        return {
            "objective": {
                "title": req.objective.title,
                "description": req.objective.description,
                "type": OBJECTIVE_TYPE_LABELS[req.objective.type],
            },
            "keyResults": [
                {
                    "title": kr.title,
                    "unit": kr.unit,
                    "startValue": kr.start_value,
                    "targetValue": kr.target_value,
                }
                for kr in req.key_results
            ],
        }

    def classify_text(self, masked: OkrSuggestRequest) -> str:
        return _dumps(self._draft(masked))

    def generate_prompt_id(self, masked: OkrSuggestRequest) -> str:
        return "okr_suggest"

    def generate_vars(self, masked: OkrSuggestRequest) -> dict[str, Any]:
        return {"cycle_kind": CYCLE_LABELS[masked.cycle_kind], "draft_json": _dumps(self._draft(masked))}

    def normalize(self, masked: OkrSuggestRequest, out: OkrSuggestOut) -> OkrSuggestOut:
        draft = masked.key_results
        krs = []
        for i, kr in enumerate(out.key_results[:5]):
            if i < len(draft):
                d = draft[i]
                proposed = kr.proposed_values or (
                    (d.start_value is None and kr.start_value is not None)
                    or (d.target_value is None and kr.target_value is not None)
                )
            else:
                proposed = kr.proposed_values or kr.start_value is not None or kr.target_value is not None
            krs.append(kr.model_copy(update={"title": kr.title[:MAX_TITLE], "proposed_values": proposed}))
        objective = out.objective.model_copy(update={"title": out.objective.title[:MAX_TITLE]})
        return out.model_copy(update={"objective": objective, "key_results": krs})

    def source_text(self, masked: OkrSuggestRequest) -> str:
        return "\n".join(self.texts(masked))

    def output_text(self, out: OkrSuggestOut) -> str:
        parts = [out.objective.title, out.objective.description or ""]
        parts += [kr.title for kr in out.key_results]
        return "\n".join(parts)

    def preservation(self, masked: OkrSuggestRequest, out: OkrSuggestOut) -> tuple[list[str], list[str]]:
        missing = fidelity.check_preservation(self.source_text(masked), self.output_text(out), [])
        problems: list[str] = []
        if not out.objective.rationale.strip():
            problems.append('Falta el "rationale" del objetivo: explicá en una frase qué cambiaste.')
        for i, kr_out in enumerate(out.key_results):
            if not kr_out.rationale.strip():
                problems.append(f'Falta el "rationale" del KR {i + 1}: explicá en una frase qué cambiaste.')
        for i, d in enumerate(masked.key_results):
            if i >= len(out.key_results):
                problems.append(f"Falta el KR {i + 1} del borrador (deben conservarse todos, en orden).")
                continue
            o = out.key_results[i]
            for label, draft_v, out_v in (
                ("startValue", d.start_value, o.start_value),
                ("targetValue", d.target_value, o.target_value),
            ):
                if draft_v is not None and not _same_value(draft_v, out_v):
                    token = f"KR {i + 1} {label}={draft_v}"
                    if token not in missing:
                        missing.append(token)
        shown = self.output_text(out) + " " + " ".join(w.message for w in out.warnings)
        problems += enum_problem(raw_enum_tokens(shown, self.source_text(masked)))
        return missing, problems

    def judge_vars(self, masked: OkrSuggestRequest, out: OkrSuggestOut) -> dict[str, Any]:
        return {
            "feature": "sugerencia de redacción de OKR",
            "source_json": _dumps(self._draft(masked)),
            "output_json": _dumps(self._result_dict(out)),
        }

    @staticmethod
    def _result_dict(out: OkrSuggestOut) -> dict:
        return {
            "objective": {
                "title": out.objective.title,
                "description": out.objective.description,
                "rationale": out.objective.rationale,
            },
            "keyResults": [
                {
                    "title": kr.title,
                    "unit": kr.unit,
                    "startValue": kr.start_value,
                    "targetValue": kr.target_value,
                    "rationale": kr.rationale,
                    "proposedValues": kr.proposed_values,
                }
                for kr in out.key_results
            ],
            "warnings": [{"code": w.code, "message": w.message} for w in out.warnings],
        }

    def result(self, req: OkrSuggestRequest, out: OkrSuggestOut) -> dict:
        return self._result_dict(out)

    def fallback_result(self, req: OkrSuggestRequest) -> dict:
        return {
            "objective": {
                "title": req.objective.title,
                "description": req.objective.description,
                "rationale": "",
            },
            "keyResults": [
                {
                    "title": kr.title,
                    "unit": kr.unit,
                    "startValue": kr.start_value,
                    "targetValue": kr.target_value,
                    "rationale": "",
                    "proposedValues": False,
                }
                for kr in req.key_results
            ],
            "warnings": [],
        }

    def result_text(self, result: dict) -> str:
        parts = [result["objective"]["title"], result["objective"].get("description") or ""]
        parts += [kr["title"] for kr in result["keyResults"]]
        return readability.concat_text(parts)


class CheckinSummarySpec(FeatureSpec):
    name = "checkin_summary"

    def texts(self, req: CheckinSummaryRequest) -> list[str]:
        return [req.key_result.title] + [c.note or "" for c in req.check_ins]

    def mask(self, req: CheckinSummaryRequest, table: MaskTable) -> CheckinSummaryRequest:
        return req.model_copy(
            update={
                "key_result": req.key_result.model_copy(
                    update={
                        "title": mask(req.key_result.title, table),
                        "unit": _m(req.key_result.unit, table),
                    }
                ),
                "check_ins": [c.model_copy(update={"note": _m(c.note, table)}) for c in req.check_ins],
            }
        )

    def _kr(self, req: CheckinSummaryRequest) -> dict:
        kr = req.key_result
        return {
            "title": kr.title,
            "scoring": SCORING_LABELS[kr.scoring],
            "unit": kr.unit,
            "startValue": kr.start_value,
            "targetValue": kr.target_value,
            "currentValue": kr.current_value,
        }

    def _checkins(self, req: CheckinSummaryRequest) -> list[dict]:
        return [
            {
                "date": c.date,
                "value": c.value,
                "score": c.score,
                "band": BAND_LABELS[c.band],
                "action": ACTION_LABELS[c.action],
                "note": c.note,
            }
            for c in req.check_ins
        ]

    def trend(self, req: CheckinSummaryRequest) -> str:
        return compute_trend([c.score for c in req.check_ins])

    def classify_text(self, masked: CheckinSummaryRequest) -> str:
        return _dumps({"keyResult": self._kr(masked), "checkIns": self._checkins(masked)})

    def generate_prompt_id(self, masked: CheckinSummaryRequest) -> str:
        return "checkin_summary"

    def generate_vars(self, masked: CheckinSummaryRequest) -> dict[str, Any]:
        style = (
            "Usá oraciones cortas (hasta 15 palabras) y palabras simples: lenguaje claro."
            if masked.level == "PLAIN"
            else "Usá un registro profesional estándar, conciso."
        )
        return {
            "trend": TREND_LABELS[self.trend(masked)],
            "style_rule": style,
            "keyresult_json": _dumps(self._kr(masked)),
            "checkins_json": _dumps(self._checkins(masked)),
        }

    def normalize(self, masked: CheckinSummaryRequest, out: CheckinSummaryOut) -> CheckinSummaryOut:
        return out.model_copy(
            update={
                "summary": out.summary[:MAX_SUMMARY],
                "highlights": out.highlights[:MAX_LIST],
                "risks": out.risks[:MAX_LIST],
            }
        )

    def source_text(self, masked: CheckinSummaryRequest) -> str:
        parts = [masked.key_result.title]
        for c in masked.check_ins:
            y, mo, d = c.date.split("-")
            parts.append(f"{c.date} {d}/{mo} {d}/{mo}/{y} {c.value or ''} {c.note or ''}")
        return "\n".join(parts)

    def output_text(self, out: CheckinSummaryOut) -> str:
        return "\n".join([out.summary, *out.highlights, *out.risks])

    def preservation(
        self, masked: CheckinSummaryRequest, out: CheckinSummaryOut
    ) -> tuple[list[str], list[str]]:
        kr = masked.key_result
        required = [v for v in (kr.target_value, kr.current_value) if v]
        missing = fidelity.check_required(required, self.output_text(out))
        problems = [
            f"La fecha {d} no figura en los datos de origen."
            for d in fidelity.invented_dates(self.source_text(masked), self.output_text(out))
        ]
        problems += enum_problem(raw_enum_tokens(self.output_text(out), self.source_text(masked)))
        return missing, problems

    def judge_vars(self, masked: CheckinSummaryRequest, out: CheckinSummaryOut) -> dict[str, Any]:
        return {
            "feature": "resumen de check-ins de un KR",
            "source_json": _dumps({"keyResult": self._kr(masked), "checkIns": self._checkins(masked)}),
            "output_json": _dumps({"summary": out.summary, "highlights": out.highlights, "risks": out.risks}),
        }

    def readability_min(self, req: CheckinSummaryRequest, cfg: ModelsConfig) -> float | None:
        return cfg.readability_min.get("PLAIN") if req.level == "PLAIN" else None

    def result(self, req: CheckinSummaryRequest, out: CheckinSummaryOut) -> dict:
        return {
            "summary": out.summary,
            "trend": self.trend(req),
            "highlights": out.highlights,
            "risks": out.risks,
        }

    def fallback_result(self, req: CheckinSummaryRequest) -> dict:
        return {
            "summary": "No pudimos generar un resumen verificado. Revisá el historial de check-ins.",
            "trend": self.trend(req),
            "highlights": [],
            "risks": [],
        }

    def result_text(self, result: dict) -> str:
        return readability.concat_text([result["summary"], *result["highlights"], *result["risks"]])


SPECS: dict[str, FeatureSpec] = {
    "adapt": AdaptSpec(),
    "okr_suggest": OkrSuggestSpec(),
    "checkin_summary": CheckinSummarySpec(),
}
