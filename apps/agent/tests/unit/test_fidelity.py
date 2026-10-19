from okr_agent.guards.fidelity import (
    canonical_number,
    check_preservation,
    check_required,
    extract_tokens,
    invented_dates,
)

SRC = "Bajamos a 5,5 h; la meta es 4 h (antes 8 h). Lo vemos el 15/11 con el 100 % del equipo. Ver [EMAIL_1]."


def test_canonical_number():
    assert canonical_number("5,5") == canonical_number("5.5") == "5.5"
    assert canonical_number("1.000") == "1000"
    assert canonical_number("5.50") == "5.5"
    assert canonical_number("40") == "40"


def test_extract_tokens_kinds():
    t = extract_tokens(SRC + " Fecha 2026-10-01.")
    assert set(t["dates"].values()) == {"15/11", "2026-10-01"}
    assert set(t["percents"]) == {"100%"}
    assert {"5.5", "4", "8"} <= set(t["numbers"])
    assert "100" not in t["numbers"]  # el porcentaje no se cuenta dos veces
    assert set(t["placeholders"]) == {"[EMAIL_1]"}


def test_digits_glued_to_letters_are_not_numbers():
    assert extract_tokens("incidencias P1 y F2")["numbers"] == {}


def test_all_preserved_with_decimal_separator_variants():
    out = "Ahora tardamos 5.5 h. Meta: 4 h. Antes 8 h. El 15/11 lo vemos. Todo el 100% del equipo. [EMAIL_1]"
    assert check_preservation(SRC, out) == []


def test_missing_number_date_percent_and_placeholder_detected():
    out = "Ahora tardamos 5,5 h."
    missing = check_preservation(SRC, out)
    assert "4" in missing and "8" in missing
    assert "15/11" in missing
    assert "100 %" in missing
    assert "[EMAIL_1]" in missing
    assert "5,5" not in missing


def test_changed_value_counts_as_missing():
    assert check_preservation("La meta es 40", "La meta es 41") == ["40"]


def test_must_preserve_literal_and_unit_variants():
    out = "Antes 8 h, ahora 5.5 h, meta 4 h, el 15/11."
    assert check_preservation("", out, ["8 h", "5,5 h", "4 h", "15/11"]) == []
    assert check_preservation("", "Antes 8", ["8 h"]) == ["8 h"]
    assert check_preservation("", "Todo igual", ["meta KR-7"]) == ["meta KR-7"]


def test_must_preserve_is_whitespace_and_case_insensitive():
    assert check_preservation("", "Cobertura del 100 %", ["100 %"]) == []
    assert check_preservation("", "Meta Q4", ["meta q4"]) == []


def test_check_required_pure_numbers_use_canonical_not_substring():
    assert check_required(["4", "5.5"], "Ahora 5,5 h; meta 4 h.") == []
    assert check_required(["4"], "Meta 40 h.") == ["4"]
    assert check_required(["100"], "Cobertura del 100 %.") == []


def test_invented_dates():
    assert invented_dates("Se vio el 15/11.", "Se vio el 15/11 y el 20/12.") == ["20/12"]
    assert invented_dates("Se vio el 15/11.", "Sin fechas.") == []
