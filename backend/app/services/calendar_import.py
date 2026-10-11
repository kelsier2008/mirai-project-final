"""Academic-calendar CSV parsing and validation (no database access).

Columns
- day_date             required, YYYY-MM-DD
- title                optional, up to 160 characters
- start_time           optional, HH:MM (24-hour)
- end_time             optional, HH:MM, later than start_time
- submission_deadline  optional, ISO 8601 date-time WITH timezone,
                       e.g. 2026-11-03T18:00:00+05:30, not before day_date

Every row is checked and every problem is reported with its line number, so a
coordinator can fix the whole file at once. Callers must not write anything
when `errors` is non-empty.
"""
import csv
import io
import re
from dataclasses import dataclass, field
from datetime import date, datetime, time

MAX_BYTES = 2_000_000
MAX_ROWS = 500
REQUIRED_COLUMNS = ("day_date",)
OPTIONAL_COLUMNS = ("title", "start_time", "end_time", "submission_deadline")
ALLOWED_COLUMNS = REQUIRED_COLUMNS + OPTIONAL_COLUMNS
TITLE_MAX = 160

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")

TEMPLATE = (
    "day_date,title,start_time,end_time,submission_deadline\n"
    "2026-11-03,Robotics build night,16:00,18:00,2026-11-05T18:00:00+05:30\n"
    "2026-11-10,Design review,,,\n"
)


class CalendarCSVError(ValueError):
    """The file as a whole cannot be read (encoding, headers, size)."""


@dataclass
class CalendarRow:
    line: int
    day_date: date
    title: str | None
    start_time: time | None
    end_time: time | None
    submission_deadline: datetime | None

    def as_dict(self) -> dict:
        return {
            "line": self.line,
            "day_date": self.day_date.isoformat(),
            "title": self.title,
            "start_time": self.start_time.strftime("%H:%M") if self.start_time else None,
            "end_time": self.end_time.strftime("%H:%M") if self.end_time else None,
            "submission_deadline": self.submission_deadline.isoformat() if self.submission_deadline else None,
        }


@dataclass
class ParseResult:
    rows: list[CalendarRow] = field(default_factory=list)
    errors: list[dict] = field(default_factory=list)  # [{"line": 3, "errors": [...]}]
    warnings: list[dict] = field(default_factory=list)
    columns: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors


def _parse_time(value: str, name: str, problems: list[str]) -> time | None:
    if not value:
        return None
    if not _TIME_RE.fullmatch(value):
        problems.append(f"{name} must be HH:MM in 24-hour time (got '{value[:20]}')")
        return None
    return time.fromisoformat(value)


def parse_calendar_csv(raw: bytes, *, today: date | None = None) -> ParseResult:
    if len(raw) > MAX_BYTES:
        raise CalendarCSVError("Calendar file must be 2 MB or smaller")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise CalendarCSVError("Calendar file must be UTF-8 encoded text") from exc
    if not text.strip():
        raise CalendarCSVError("Calendar file is empty")
    if "\x00" in text:
        raise CalendarCSVError("Calendar file looks binary, not CSV")

    try:
        reader = csv.reader(io.StringIO(text))
        header = next(reader, None)
    except csv.Error as exc:
        raise CalendarCSVError(f"Could not read CSV header: {exc}") from exc
    if not header:
        raise CalendarCSVError("CSV has no header row")
    columns = [h.strip().lower() for h in header]
    seen = set()
    duplicates = sorted({c for c in columns if c in seen or seen.add(c)})
    if duplicates:
        raise CalendarCSVError(f"Duplicate column(s): {', '.join(duplicates)}")
    unknown = [c for c in columns if c and c not in ALLOWED_COLUMNS]
    if unknown:
        raise CalendarCSVError(
            f"Unknown column(s): {', '.join(unknown)}. Allowed columns: {', '.join(ALLOWED_COLUMNS)}"
        )
    missing = [c for c in REQUIRED_COLUMNS if c not in columns]
    if missing:
        raise CalendarCSVError(f"CSV must include the column(s): {', '.join(missing)}")

    result = ParseResult(columns=columns)
    seen_keys: dict[tuple, int] = {}
    data_rows = 0
    try:
        for line, values in enumerate(reader, start=2):
            if not any(v.strip() for v in values):
                continue  # blank line
            data_rows += 1
            if data_rows > MAX_ROWS:
                raise CalendarCSVError(f"Import is limited to {MAX_ROWS} calendar rows")
            problems: list[str] = []
            if len(values) > len(columns):
                problems.append(f"row has {len(values)} values but the header has {len(columns)} columns")
            row = {c: (values[i].strip() if i < len(values) else "") for i, c in enumerate(columns) if c}

            day = None
            raw_day = row.get("day_date", "")
            if not raw_day:
                problems.append("day_date is required")
            elif not _DATE_RE.fullmatch(raw_day):
                problems.append(f"day_date must be YYYY-MM-DD (got '{raw_day[:20]}')")
            else:
                try:
                    day = date.fromisoformat(raw_day)
                except ValueError:
                    problems.append(f"day_date '{raw_day}' is not a real calendar date")

            title = row.get("title") or None
            if title and len(title) > TITLE_MAX:
                problems.append(f"title is longer than {TITLE_MAX} characters")

            start = _parse_time(row.get("start_time", ""), "start_time", problems)
            end = _parse_time(row.get("end_time", ""), "end_time", problems)
            if start and end and end <= start:
                problems.append("end_time must be later than start_time")

            deadline = None
            raw_deadline = row.get("submission_deadline", "")
            if raw_deadline:
                try:
                    deadline = datetime.fromisoformat(raw_deadline.replace("Z", "+00:00"))
                except ValueError:
                    problems.append(
                        "submission_deadline must be an ISO date-time such as 2026-11-05T18:00:00+05:30"
                    )
                else:
                    if deadline.utcoffset() is None:
                        problems.append("submission_deadline must include a timezone offset, e.g. +05:30")
                        deadline = None
                    elif day and deadline.date() < day:
                        problems.append("submission_deadline cannot be before day_date")

            if problems:
                result.errors.append({"line": line, "errors": problems})
                continue
            key = (day, (title or "").lower())
            if key in seen_keys:
                result.warnings.append({
                    "line": line,
                    "warning": f"duplicate of line {seen_keys[key]} in this file; it will be skipped",
                })
                continue
            seen_keys[key] = line
            if today and day < today:
                result.warnings.append({"line": line, "warning": "date is in the past"})
            result.rows.append(CalendarRow(line, day, title, start, end, deadline))
    except csv.Error as exc:
        raise CalendarCSVError(f"Malformed CSV near line {reader.line_num}: {exc}") from exc

    if data_rows == 0:
        raise CalendarCSVError("CSV has no calendar rows")
    return result


def parse_club_ids(value: str) -> list[int]:
    ids = set()
    for piece in value.split(","):
        piece = piece.strip()
        if not piece:
            continue
        if not piece.isdigit():
            raise ValueError(f"'{piece[:20]}' is not a club ID")
        ids.add(int(piece))
    if not ids or len(ids) > 50:
        raise ValueError("Select between 1 and 50 clubs")
    return sorted(ids)
