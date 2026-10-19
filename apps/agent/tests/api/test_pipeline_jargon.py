"""Jerga/anglicismos sin explicar en /v1/adapt: glosario vacio + jerga -> regenera una vez -> revision humana."""

import copy
import json

import pytest

from tests.conftest import CLASSIFY_OK, JUDGE_OK, Text

REQUEST = {
    "level": "PLAIN",
    "entityType": "OBJECTIVE",
    "locale": "es",
    "segments": [
        {
            "key": "objective.title",
            "text": "Construir un pipeline calificado de 400000 USD en clientes de alto valor",
        }
    ],
    "mustPreserve": ["400000 USD"],
}


def adapt_out(text: str, glossary: list[dict]) -> str:
    return json.dumps(
        {"segments": [{"key": "objective.title", "text": text}], "glossary": glossary}, ensure_ascii=False
    )


JARGON_NO_GLOSSARY = adapt_out("Queremos un pipeline de 400.000 USD. Son clientes que valen mucho.", [])
JARGON_EXPLAINED = adapt_out(
    "Queremos un pipeline de 400.000 USD. Son clientes que valen mucho.",
    [{"term": "pipeline", "explanation": "Lista de posibles ventas que todavía no se cerraron."}],
)
JARGON_REPLACED = adapt_out("Queremos 400.000 USD en posibles ventas. Son clientes que valen mucho.", [])


def steps(b):
    return [(u["step"], u["status"]) for u in b["usage"]]


@pytest.mark.parametrize("level", ["PLAIN", "EASY_READ"])
def test_empty_glossary_with_jargon_regenerates_once_and_gets_glossary(h, level):
    h.provider.script(h.classify, Text(CLASSIFY_OK))
    h.provider.script(h.gen, Text(JARGON_NO_GLOSSARY), Text(JARGON_EXPLAINED))
    h.provider.script(h.judge, Text(JUDGE_OK), Text(JUDGE_OK))
    r, _ = h.post("/v1/adapt", copy.deepcopy(REQUEST) | {"level": level})
    assert r.status_code == 200
    b = r.json()
    assert b["needsHumanReview"] is False and b["reviewReason"] is None
    assert b["checks"]["regenerated"] is True and b["checks"]["numbersPreserved"] is True
    assert [g["term"] for g in b["result"]["glossary"]] == ["pipeline"]
    assert "400.000 USD" in b["result"]["segments"][0]["text"]
    assert [s for s, _ in steps(b)].count("REGENERATE") == 1
    regen_instruction = h.provider.calls_for(h.gen)[1]["instruction"]
    assert "CORRECCIÓN NECESARIA" in regen_instruction and '"pipeline"' in regen_instruction
    assert "glosario" in regen_instruction
    # no se agrega ningun campo nuevo al contrato
    assert set(b["checks"]) == {
        "piiMasked",
        "sensitiveContent",
        "numbersPreserved",
        "missingTokens",
        "judge",
        "regenerated",
    }


def test_regeneration_that_replaces_the_jargon_also_passes(h):
    h.provider.script(h.classify, Text(CLASSIFY_OK))
    h.provider.script(h.gen, Text(JARGON_NO_GLOSSARY), Text(JARGON_REPLACED))
    h.provider.script(h.judge, Text(JUDGE_OK), Text(JUDGE_OK))
    r, _ = h.post("/v1/adapt", REQUEST)
    b = r.json()
    assert b["needsHumanReview"] is False and b["result"]["glossary"] == []


def test_jargon_still_unexplained_after_regeneration_keeps_text_and_needs_review(h):
    h.provider.script(h.classify, Text(CLASSIFY_OK))
    h.provider.script(h.gen, Text(JARGON_NO_GLOSSARY), Text(JARGON_NO_GLOSSARY))
    h.provider.script(h.judge, Text(JUDGE_OK), Text(JUDGE_OK))
    r, _ = h.post("/v1/adapt", REQUEST)
    assert r.status_code == 200
    b = r.json()
    assert b["needsHumanReview"] is True and b["reviewReason"] == "VERIFICATION_FAILED"
    # NO es el respaldo: se devuelve la version adaptada (los numeros se conservan) para que una persona decida
    assert b["result"]["segments"][0]["text"].startswith("Queremos un pipeline")
    assert b["checks"]["regenerated"] is True and b["checks"]["numbersPreserved"] is True
    assert [s for s, _ in steps(b)].count("REGENERATE") == 1  # una sola regeneracion


def test_explained_jargon_needs_no_regeneration(h):
    h.provider.script(h.classify, Text(CLASSIFY_OK))
    h.provider.script(h.gen, Text(JARGON_EXPLAINED))
    h.provider.script(h.judge, Text(JUDGE_OK))
    r, _ = h.post("/v1/adapt", REQUEST)
    b = r.json()
    assert b["needsHumanReview"] is False and b["checks"]["regenerated"] is False
    assert len(h.provider.calls_for(h.gen)) == 1


def test_lost_number_after_jargon_regeneration_still_falls_back_to_original(h):
    lost = adapt_out(
        "Queremos un pipeline de posibles ventas.", [{"term": "pipeline", "explanation": "Lista."}]
    )
    h.provider.script(h.classify, Text(CLASSIFY_OK))
    h.provider.script(h.gen, Text(JARGON_NO_GLOSSARY), Text(lost))
    h.provider.script(h.judge, Text(JUDGE_OK))
    r, _ = h.post("/v1/adapt", REQUEST)
    b = r.json()
    assert b["needsHumanReview"] is True and b["checks"]["numbersPreserved"] is False
    assert b["result"]["segments"] == REQUEST["segments"]  # falla dura: texto original


def test_plain_big_number_in_output_is_formatted_with_thousands_separator(h):
    raw = adapt_out(
        "Queremos un pipeline de 400000 USD. Son clientes que valen mucho.",
        [{"term": "pipeline", "explanation": "Lista de posibles ventas."}],
    )
    h.provider.script(h.classify, Text(CLASSIFY_OK))
    h.provider.script(h.gen, Text(raw))
    h.provider.script(h.judge, Text(JUDGE_OK))
    b = h.post("/v1/adapt", REQUEST)[0].json()
    assert "400.000 USD" in b["result"]["segments"][0]["text"] and b["checks"]["numbersPreserved"] is True
    assert b["needsHumanReview"] is False
