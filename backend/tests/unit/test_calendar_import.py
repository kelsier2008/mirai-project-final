from datetime import date

import pytest

from app.services.calendar_import import (
    MAX_ROWS, CalendarCSVError, parse_calendar_csv, parse_club_ids,
)

HEADER = "day_date,title,start_time,end_time,submission_deadline\n"


def parse(text: str, **kw):
    return parse_calendar_csv(text.encode("utf-8"), **kw)


def test_valid_file_with_bom_blank_lines_and_optional_columns():
    result = parse("﻿" + HEADER
                   + "2026-11-03,Build night,16:00,18:00,2026-11-05T18:00:00+05:30\n"
                   + "\n"
                   + "2026-11-10,,,,\n")
    assert result.ok
    assert [r.line for r in result.rows] == [2, 4]
    first = result.rows[0]
    assert first.day_date == date(2026, 11, 3)
    assert first.start_time.hour == 16 and first.end_time.hour == 18
    assert first.submission_deadline.utcoffset().total_seconds() == 5.5 * 3600
    assert result.rows[1].title is None


def test_only_day_date_column_is_required_and_headers_are_case_insensitive():
    result = parse("Day_Date\n2026-12-01\n")
    assert result.ok and result.rows[0].day_date == date(2026, 12, 1)


def test_every_invalid_row_is_reported_with_its_line_number():
    result = parse(HEADER
                   + "2026-11-03,ok,,,\n"
                   + "03/11/2026,bad format,,,\n"
                   + "2026-02-30,not a date,,,\n"
                   + "2026-11-04,bad time,25:00,,\n"
                   + "2026-11-05,time order,18:00,17:00,\n"
                   + "2026-11-06,no tz,,,2026-11-07T10:00:00\n"
                   + "2026-11-08,deadline early,,,2026-11-01T10:00:00+05:30\n"
                   + ",missing date,,,\n")
    assert [e["line"] for e in result.errors] == [3, 4, 5, 6, 7, 8, 9]
    assert len(result.rows) == 1
    messages = " ".join(m for e in result.errors for m in e["errors"])
    for expected in ("YYYY-MM-DD", "real calendar date", "HH:MM", "later than start_time",
                     "timezone", "before day_date", "day_date is required"):
        assert expected in messages


def test_duplicate_rows_in_one_file_are_skipped_with_a_warning():
    result = parse(HEADER + "2026-11-03,Same,,,\n2026-11-03,same,,,\n")
    assert result.ok and len(result.rows) == 1
    assert "duplicate of line 2" in result.warnings[0]["warning"]


def test_past_dates_are_allowed_but_flagged():
    result = parse(HEADER + "2020-01-01,Old,,,\n", today=date(2026, 1, 1))
    assert result.ok and result.warnings[0]["warning"] == "date is in the past"


@pytest.mark.parametrize("raw, message", [
    (b"", "empty"),
    (b"\xff\xfe\x00bad", "UTF-8"),
    (b"title\nx\n", "day_date"),
    (b"day_date,colour\n2026-01-01,red\n", "Unknown column"),
    (b"day_date,day_date\n2026-01-01,2026-01-02\n", "Duplicate column"),
    (b"day_date\n", "no calendar rows"),
])
def test_file_level_problems_raise(raw, message):
    with pytest.raises(CalendarCSVError, match=message):
        parse_calendar_csv(raw)


def test_row_limit_and_size_limit():
    rows = "".join(f"2026-01-{(i % 28) + 1:02d},T{i},,,\n" for i in range(MAX_ROWS + 1))
    with pytest.raises(CalendarCSVError, match="limited"):
        parse(HEADER + rows)
    with pytest.raises(CalendarCSVError, match="2 MB"):
        parse_calendar_csv(b"x" * 2_000_001)


def test_extra_values_on_a_row_are_an_error():
    result = parse("day_date,title\n2026-11-03,a,b\n")
    assert result.errors and "values" in result.errors[0]["errors"][0]


def test_club_id_list_parsing():
    assert parse_club_ids(" 5, 2,5 ") == [2, 5]
    with pytest.raises(ValueError):
        parse_club_ids("1,abc")
    with pytest.raises(ValueError):
        parse_club_ids(" , ")
