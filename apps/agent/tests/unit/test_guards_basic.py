import pytest

from okr_agent.guards.input import InputRejected, validate_texts
from okr_agent.guards.pii import MaskTable, mask, placeholders_in, unmask, unmask_obj
from okr_agent.guards.trend import compute_trend


class TestInputGuard:
    def test_empty_list_of_blank_texts(self):
        with pytest.raises(InputRejected) as e:
            validate_texts(["", "   ", "\n"])
        assert e.value.reason == "EMPTY"

    def test_segment_too_long(self):
        with pytest.raises(InputRejected) as e:
            validate_texts(["a" * 4001])
        assert e.value.reason == "TOO_LONG"

    def test_total_too_long(self):
        with pytest.raises(InputRejected) as e:
            validate_texts(["a" * 4000] * 4)  # 16000 > 12000
        assert e.value.reason == "TOO_LONG"

    def test_ok_at_the_limits(self):
        validate_texts(["a" * 4000, "b" * 4000, "c" * 4000])  # 12000 exactos

    def test_one_non_blank_is_enough(self):
        validate_texts(["", "algo"])


class TestPii:
    def test_masks_email_dni_nie_and_phones(self):
        t = MaskTable()
        text = (
            "Escribile a ana.perez@empresa.com o a bob@x.org. DNI 12345678Z, NIE X1234567L. "
            "Tel +34 612 345 678 o 11 5555-1234."
        )
        out = mask(text, t)
        assert "ana.perez@empresa.com" not in out
        assert "12345678Z" not in out
        assert "X1234567L" not in out
        assert "612 345 678" not in out
        assert "5555-1234" not in out
        assert t.count == 6
        assert placeholders_in(out) >= {"[EMAIL_1]", "[EMAIL_2]", "[DNI_1]", "[DNI_2]"}

    def test_roundtrip(self):
        t = MaskTable()
        text = "Mail ana@x.com y ana@x.com otra vez, DNI 12345678Z."
        masked = mask(text, t)
        assert t.count == 2  # el mismo email reutiliza placeholder
        assert unmask(masked, t) == text

    def test_does_not_touch_dates_percentages_or_short_numbers(self):
        t = MaskTable()
        text = "Subimos de 40 a 75 % el 15/11/2026; meta 1.250,5 y 2026-10-01."
        assert mask(text, t) == text
        assert t.count == 0

    def test_unmask_obj_recursive(self):
        t = MaskTable()
        masked = mask("ana@x.com", t)
        out = unmask_obj({"a": [masked, {"b": f"hola {masked}"}], "n": 3}, t)
        assert out == {"a": ["ana@x.com", {"b": "hola ana@x.com"}], "n": 3}


class TestTrend:
    def test_insufficient(self):
        assert compute_trend([]) == "INSUFFICIENT_DATA"
        assert compute_trend([0.5]) == "INSUFFICIENT_DATA"

    def test_improving_declining_stable(self):
        assert compute_trend([0.125, 0.375, 0.625]) == "IMPROVING"
        assert compute_trend([0.8, 0.6, 0.4]) == "DECLINING"
        assert compute_trend([0.5, 0.5, 0.52, 0.5]) == "STABLE"

    def test_only_last_four_count(self):
        # historial viejo muy malo pero los ultimos 4 estables
        assert compute_trend([0.0, 0.0, 0.9, 0.9, 0.9, 0.9]) == "STABLE"

    def test_threshold_is_exclusive(self):
        assert compute_trend([0.0, 0.05]) == "STABLE"
        assert compute_trend([0.0, 0.0501]) == "IMPROVING"
