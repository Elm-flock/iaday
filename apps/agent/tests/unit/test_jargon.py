"""Guard de jerga/anglicismos sin explicar + normalizacion de numeros es-AR (400.000 == 400000)."""

from pathlib import Path

import pytest

from okr_agent.guards.fidelity import canonical_number, check_preservation, format_thousands
from okr_agent.guards.jargon import load_jargon, unexplained_jargon

ROOT = Path(__file__).resolve().parents[2]
TERMS = load_jargon(ROOT / "config" / "jargon.yaml")


def test_config_loads_and_is_extensible(tmp_path):
    assert {"pipeline", "churn", "tasa de cierre", "ciclo de venta"} <= set(TERMS)
    f = tmp_path / "j.yaml"
    f.write_text("terms:\n  - Growth Hacking\n  - growth hacking\n", encoding="utf-8")
    assert load_jargon(f) == ("Growth Hacking",)  # sin duplicados (ignora mayusculas)
    f.write_text("terms: nope\n", encoding="utf-8")
    with pytest.raises(ValueError):
        load_jargon(f)
    with pytest.raises(ValueError):
        load_jargon(tmp_path / "missing.yaml")


def test_pipeline_flagged_when_glossary_is_empty():
    text = "Queremos un pipeline calificado de 400.000 USD."
    assert unexplained_jargon(text, [], text, TERMS) == ["pipeline"]


def test_not_flagged_when_explained_in_glossary():
    text = "Queremos un pipeline calificado de 400.000 USD."
    assert unexplained_jargon(text, ["Pipeline"], text, TERMS) == []
    # el glosario puede usar una frase mas larga
    assert unexplained_jargon(text, ["pipeline de ventas"], text, TERMS) == []


def test_multiword_terms_and_accents():
    text = "La Tasa de Conversión subió. El ciclo de venta es largo y la tasa de cierre baja."
    assert set(unexplained_jargon(text, [], "", TERMS)) == {
        "tasa de conversion",
        "ciclo de venta",
        "tasa de cierre",
    }
    assert (
        unexplained_jargon(text, ["tasa de conversión", "ciclo de ventas", "tasa de cierre"], "", TERMS) == []
    )


def test_plural_and_case_insensitive():
    found = unexplained_jargon("Hay 30 Leads nuevos y varios pipelines.", [], "", TERMS)
    assert set(found) == {"pipeline", "lead"}
    assert unexplained_jargon("Hay 30 leads.", ["lead"], "", TERMS) == []  # glosario singular, texto plural
    assert unexplained_jargon("Hay 30 lead.", ["leads"], "", TERMS) == []  # y al reves


def test_source_only_term_not_in_output_is_not_flagged():
    source = "Reducir el churn del pipeline."
    output = "Queremos que se vayan menos clientes."
    assert unexplained_jargon(output, [], source, TERMS) == []


def test_no_substring_false_positives():
    # 'lead' dentro de otra palabra, 'sprint' en 'esprintar' no cuentan
    assert unexplained_jargon("Es un buen leader y un spreadsheet.", [], "", TERMS) == []


def test_parenthetical_explanation_counts():
    assert unexplained_jargon("El churn (clientes que se van) bajó.", [], "", TERMS) == []


def test_source_jargon_listed_first():
    out = unexplained_jargon("Mejoramos el sprint y el pipeline.", [], "Cuidar el pipeline.", TERMS)
    assert out[0] == "pipeline" and set(out) == {"pipeline", "sprint"}


def test_no_terms_means_no_flags():
    assert unexplained_jargon("pipeline churn", [], "", ()) == []


# ------------------------------------------------------------------ numeros (separador de miles es-AR/es-ES)


def test_thousands_separator_equals_plain_number():
    assert canonical_number("400.000") == canonical_number("400000") == "400000"
    assert canonical_number("1.500.000") == "1500000"
    assert canonical_number("5,5") == "5.5" and canonical_number("5,5") != canonical_number("55")
    assert canonical_number("1.234,5") == "1234.5"


def test_fidelity_accepts_formatted_thousands_and_keeps_decimals():
    src = "Pipeline calificado de 400000 USD y 5,5 h."
    assert check_preservation(src, "Queremos 400.000 USD. Tardamos 5,5 h.", ["400000 USD", "5,5 h"]) == []
    assert check_preservation(src, "Queremos 400.000 USD. Tardamos 55 h.") == ["5,5"]
    assert check_preservation(src, "Queremos 40.000 USD. Tardamos 5,5 h.") == ["400000"]


def test_format_thousands_only_touches_big_plain_numbers():
    assert (
        format_thousands("Meta de 400000 USD y 1500000 clientes.")
        == "Meta de 400.000 USD y 1.500.000 clientes."
    )
    assert format_thousands("En 2026 subió 1500 y 5,5 h; fecha 2026-10-18 y 15/11/2026.") == (
        "En 2026 subió 1500 y 5,5 h; fecha 2026-10-18 y 15/11/2026."
    )
    assert (
        format_thousands("Ya está 400.000 y [TEL_1] y 123456,5.") == "Ya está 400.000 y [TEL_1] y 123456,5."
    )
    assert format_thousands("Llegamos a 400000.") == "Llegamos a 400.000."
