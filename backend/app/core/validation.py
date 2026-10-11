"""Shared input rules so the API and the frontend validate identifiers the same way."""
import re

# Student IDs / roll numbers: letters and digits, optionally separated by single
# hyphens or underscores (e.g. S001, 2024CS017, MIR-24-0193, mir_2024_17).
STUDENT_CODE_PATTERN = r"^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$"
STUDENT_CODE_MAX = 40
_STUDENT_CODE = re.compile(STUDENT_CODE_PATTERN)


def clean_student_code(value: str | None) -> str | None:
    """Strip surrounding space; return None for blank; raise ValueError when invalid."""
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    if len(value) > STUDENT_CODE_MAX or not _STUDENT_CODE.fullmatch(value):
        raise ValueError(
            "Student ID may contain letters and numbers, optionally separated by "
            f"single hyphens or underscores (max {STUDENT_CODE_MAX} characters)"
        )
    return value


def is_student_code(value: str) -> bool:
    try:
        return clean_student_code(value) is not None
    except ValueError:
        return False
