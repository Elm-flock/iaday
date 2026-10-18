"""Paso 3 (Verify): fidelidad determinista + legibilidad + juez; UNA regeneracion; si falla, original."""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from dataclasses import dataclass, field
from typing import Any, override

from google.adk.agents import BaseAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event

from ...api.errors import AgentError, output_invalid
from ...guards import readability
from ...guards.pii import unmask_obj
from ..schemas import JudgeOut
from ..subagents.generate import FEATURES, REGENERATE_KEY
from ..subagents.judge import JUDGE_KEY
from ..usage import PipelineRun, get_run
from .common import InvalidOutput, regen_note, structured_call

logger = logging.getLogger("okr_agent.verify")

JUDGE_DOWN_CODES = {"MODEL_UNAVAILABLE", "RATE_LIMITED", "OUTPUT_INVALID"}


@dataclass
class Evaluation:
    missing: list[str] = field(default_factory=list)
    problems: list[str] = field(default_factory=list)
    readability_value: float | None = None
    readability_min: float | None = None
    long_words: list[str] = field(default_factory=list)
    jargon: list[str] = field(default_factory=list)  # jerga sin explicar en el glosario (chequeo blando)
    judge_verdict: str = "SKIPPED"
    judge_reasons: list[str] = field(default_factory=list)

    @property
    def numbers_ok(self) -> bool:
        return not self.missing and not self.problems

    @property
    def readability_ok(self) -> bool:
        return self.readability_min is None or (
            self.readability_value is not None and self.readability_value >= self.readability_min
        )

    @property
    def deterministic_ok(self) -> bool:
        return self.numbers_ok and self.readability_ok

    @property
    def judge_unfaithful(self) -> bool:
        return self.judge_verdict == "UNFAITHFUL"

    @property
    def jargon_ok(self) -> bool:
        return not self.jargon

    @property
    def hard_ok(self) -> bool:
        """Sin fallas duras: la salida es utilizable (si no, se devuelve el texto original)."""
        return self.deterministic_ok and self.judge_verdict != "UNFAITHFUL"

    @property
    def passed(self) -> bool:
        """Todo OK, incluida la jerga explicada. Si no, se regenera una vez."""
        return self.hard_ok and self.jargon_ok

    def reasons(self) -> list[str]:
        out: list[str] = []
        if self.missing:
            out.append(
                "Faltan estos datos del original (deben aparecer tal cual): " + ", ".join(self.missing)
            )
        out += self.problems
        if not self.readability_ok:
            out.append(
                f"La legibilidad (Szigriszt-Pazos {self.readability_value}) está por debajo del mínimo "
                f"{self.readability_min}: usá oraciones más cortas y palabras más simples."
            )
            if self.long_words:
                out.append(
                    "Reemplazá estas palabras largas por sinónimos cortos y comunes de 1 a 3 sílabas "
                    "(sin tocar números ni fechas): " + ", ".join(self.long_words) + "."
                )
        if self.jargon:
            out.append(
                "Estos términos técnicos, de jerga de negocio o en otro idioma siguen en el texto sin "
                "explicación: " + ", ".join(f'"{t}"' for t in self.jargon) + ". Por cada uno: o lo "
                "reemplazás por palabras comunes en español, o lo dejás y agregás al glosario una "
                "entrada con ese término y una explicación de una frase simple. "
                "El glosario nunca puede quedar vacío si dejás alguno."
            )
        if self.judge_unfaithful:
            out += [f"El revisor indicó: {r}" for r in self.judge_reasons] or [
                "El revisor consideró que la versión no es fiel al original."
            ]
        return out


class VerifyAgent(BaseAgent):
    """sub_agents = [judge, regenerate_<feature>]"""

    @override
    async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        run = get_run()
        spec = run.spec
        masked = run.masked
        judge_agent, regen_agent = self.sub_agents[0], self.sub_agents[1]
        schema, _ = FEATURES[run.feature]

        out = run.generated
        regenerated = False
        evaluation = await self._evaluate(run, ctx, judge_agent, out)

        if not evaluation.passed:
            logger.info("verify: regenerando; motivos=%s", evaluation.reasons())
            regenerated = True
            try:
                out = await structured_call(
                    regen_agent,
                    ctx,
                    key=REGENERATE_KEY,
                    schema=schema,
                    step="REGENERATE",
                    prompt=run.prompts.get(spec.generate_prompt_id(masked)),
                    variables=spec.generate_vars(masked),
                    check=lambda o: spec.check_schema(masked, o),
                    note=regen_note(evaluation.reasons()),
                )
            except InvalidOutput:
                raise output_invalid("REGENERATE") from None
            out = spec.normalize(masked, out)
            evaluation = await self._evaluate(run, ctx, judge_agent, out)

        verification_failed = not evaluation.hard_ok
        jargon_left = evaluation.jargon if not verification_failed else []
        if verification_failed:
            logger.info("verify: respaldo al original; motivos=%s", evaluation.reasons())
        judge_skipped = evaluation.judge_verdict == "SKIPPED" and evaluation.deterministic_ok

        if verification_failed:
            result = spec.fallback_result(run.request)  # texto original, ya sin enmascarar
            only_readability = (
                evaluation.numbers_ok and not evaluation.judge_unfaithful and not evaluation.readability_ok
            )
            reason = "READABILITY_BELOW_MIN" if only_readability else "VERIFICATION_FAILED"
            needs_review = True
        else:
            result = unmask_obj(spec.result(run.request, out), run.pii)
            needs_review = False
            reason = None
            if judge_skipped:
                needs_review, reason = True, "VERIFICATION_FAILED"
            elif jargon_left:  # sigue habiendo jerga sin explicar tras la regeneracion: una persona decide
                logger.info("verify: jerga sin explicar tras regenerar: %s", jargon_left)
                needs_review, reason = True, "VERIFICATION_FAILED"
            elif run.sensitive:
                needs_review, reason = True, "SENSITIVE_CONTENT"
        run.outcome = {
            "result": result,
            "needs_review": needs_review,
            "reason": reason,
            "missing": evaluation.missing,
            "numbers_preserved": evaluation.numbers_ok,
            "judge": {"verdict": evaluation.judge_verdict, "reasons": evaluation.judge_reasons},
            "regenerated": regenerated,
            "unexplained_jargon": jargon_left,
            "fell_back_to_original": verification_failed,
        }
        return
        yield  # pragma: no cover

    async def _evaluate(
        self, run: PipelineRun, ctx: InvocationContext, judge_agent: Any, out: Any
    ) -> Evaluation:
        spec, masked = run.spec, run.masked
        ev = Evaluation()
        ev.missing, ev.problems = spec.preservation(masked, out)

        # Legibilidad de la salida (con el texto ya desenmascarado, como lo recibe la persona)
        result_now = unmask_obj(spec.result(run.request, out), run.pii)
        metrics = readability.compute_metrics(spec.result_text(result_now), spec.glossary_terms(result_now))
        ev.readability_value = metrics["szigrisztPazos"]
        ev.long_words = readability.long_words(spec.result_text(result_now))
        ev.readability_min = spec.readability_min(run.request, run.cfg)
        ev.jargon = spec.unexplained_jargon(masked, result_now, run.jargon)

        if not ev.deterministic_ok:
            ev.judge_verdict = "SKIPPED"
            ev.judge_reasons = ["No se ejecutó: falló una verificación determinista."]
            return ev

        try:
            verdict = await structured_call(
                judge_agent,
                ctx,
                key=JUDGE_KEY,
                schema=JudgeOut,
                step="JUDGE",
                prompt=run.prompts.get(spec.judge_prompt_id),
                variables=spec.judge_vars(masked, out),
            )
            ev.judge_verdict = verdict.verdict
            ev.judge_reasons = verdict.reasons if verdict.verdict == "UNFAITHFUL" else []
        except AgentError as exc:
            if exc.code not in JUDGE_DOWN_CODES:
                raise
            ev.judge_verdict = "SKIPPED"
            ev.judge_reasons = ["El revisor no respondió."]
        except InvalidOutput:
            ev.judge_verdict = "SKIPPED"
            ev.judge_reasons = ["El revisor no devolvió un formato válido."]
        return ev
