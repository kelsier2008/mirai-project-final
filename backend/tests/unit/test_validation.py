import pytest

from app.core.validation import clean_student_code, is_student_code


@pytest.mark.parametrize("code", ["S001", "2024CS017", "MIR-24-0193", "mir_2024_17", "a", "A1b2C3"])
def test_alphanumeric_student_codes_are_accepted(code):
    assert clean_student_code(f"  {code} ") == code


@pytest.mark.parametrize("code", ["S 001", "S001!", "-S001", "S001-", "S--001", "S_-1", "<b>", "x" * 41, "Ünï"])
def test_invalid_student_codes_are_rejected(code):
    with pytest.raises(ValueError):
        clean_student_code(code)
    assert not is_student_code(code)


def test_blank_student_code_means_none():
    assert clean_student_code("   ") is None
    assert clean_student_code(None) is None
