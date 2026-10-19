import pytest

from okr_agent.guards.readability import (
    band_for,
    compute_metrics,
    concat_text,
    count_syllables,
    find_acronyms,
)


@pytest.mark.parametrize(
    ("word", "expected"),
    [
        ("sol", 1),
        ("casa", 2),
        ("camino", 3),
        ("aire", 2),  # diptongo
        ("puerta", 2),
        ("país", 2),  # hiato por tilde
        ("poeta", 3),  # hiato fuerte+fuerte
        ("que", 1),  # 'u' muda
        ("guitarra", 3),
        ("oficina", 4),
        ("comité", 3),
        ("", 0),
    ],
)
def test_syllables(word, expected):
    assert count_syllables(word) == expected


@pytest.mark.parametrize(
    ("score", "band"),
    [
        (10, "MUY_DIFICIL"),
        (39.9, "MUY_DIFICIL"),
        (40, "ALGO_DIFICIL"),
        (54.9, "ALGO_DIFICIL"),
        (55, "NORMAL"),
        (64.9, "NORMAL"),
        (65, "BASTANTE_FACIL"),
        (80, "BASTANTE_FACIL"),
        (80.1, "MUY_FACIL"),
    ],
)
def test_inflesz_bands(score, band):
    assert band_for(score) == band


def test_easy_text_scores_higher_than_hard_text():
    easy = "El equipo bajó el tiempo. Ahora tarda 5 horas. La meta es 4 horas."
    hard = (
        "La implementación sistemática de procedimientos estandarizados de resolución de incidencias "
        "críticas, conjuntamente con la optimización contractual de proveedores, permitió disminuir "
        "considerablemente los tiempos medios de recuperación operativa."
    )
    me, mh = compute_metrics(easy), compute_metrics(hard)
    assert me["szigrisztPazos"] > mh["szigrisztPazos"] + 30
    assert me["fernandezHuerta"] > mh["fernandezHuerta"] + 30
    assert me["infleszBand"] in ("BASTANTE_FACIL", "MUY_FACIL")
    assert mh["infleszBand"] in ("MUY_DIFICIL", "ALGO_DIFICIL")


def test_metrics_counts_and_shape():
    m = compute_metrics("Hola mundo. Esto es una prueba larga de cinco palabras!")
    assert set(m) == {
        "fernandezHuerta",
        "szigrisztPazos",
        "infleszBand",
        "words",
        "sentences",
        "avgSentenceLength",
        "maxSentenceLength",
        "unexplainedAcronyms",
    }
    assert m["sentences"] == 2
    assert m["words"] == 10
    assert m["maxSentenceLength"] == 8
    assert m["avgSentenceLength"] == 5.0


def test_decimal_numbers_do_not_split_sentences():
    m = compute_metrics("Bajamos a 5.5 horas y a 5,5 horas.")
    assert m["sentences"] == 1


def test_empty_text():
    m = compute_metrics("")
    assert m["words"] == 0 and m["sentences"] == 0 and m["infleszBand"] == "MUY_DIFICIL"


def test_acronyms_unexplained_vs_explained():
    text = "El SLA del proveedor es lento. Pedimos el KPI (indicador clave). Hay un problema P1."
    assert find_acronyms(text) == ["SLA", "P1"]


def test_acronym_explained_in_parentheses_before_or_in_glossary():
    assert find_acronyms("Acuerdo de servicio (SLA) con el proveedor.") == []
    assert find_acronyms("El SLA es lento.", glossary_terms=["sla"]) == []


def test_concat_text_closes_segments():
    assert concat_text(["Uno", "Dos.", "  ", "Tres?"]) == "Uno. Dos. Tres?"


def test_long_words_orders_by_syllables_and_dedups():
    from okr_agent.guards.readability import long_words

    text = "Quiero reconocer tu liderazgo. Coordinaste a 4 equipos. Liderazgo y paz. Fue el 30/09."
    out = long_words(text)
    assert "coordinaste" in [w.lower() for w in out]
    assert [w.lower() for w in out].count("liderazgo") == 1
    assert "paz" not in out and "equipos" not in out
    assert long_words("") == []
