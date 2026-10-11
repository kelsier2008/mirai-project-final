"""Guards for the migration files: ordered, tracked and non-destructive."""
import re

from app.migrate import MIGRATIONS_DIR, migration_files
from workers.tasks_schedule import _versioned

FILES = migration_files()


def test_migrations_are_numbered_and_unique():
    numbers = [p.name[:3] for p in FILES]
    assert numbers == sorted(numbers) and len(set(numbers)) == len(numbers)
    assert FILES[0].name == "001_init.sql"


def test_later_migrations_never_drop_or_delete_data():
    for path in FILES[1:]:
        sql = re.sub(r"--[^\n]*", "", path.read_text()).upper()
        for forbidden in ("DROP TABLE", "TRUNCATE", "DELETE FROM", "DROP COLUMN"):
            assert forbidden not in sql, f"{path.name} contains {forbidden}"


def test_later_migrations_are_rerunnable():
    """A pre-tracking database is baselined by re-running 002+, so every
    CREATE TABLE / ADD COLUMN / CREATE INDEX must be idempotent."""
    for path in FILES[1:]:
        sql = re.sub(r"--[^\n]*", "", path.read_text())
        assert not re.search(r"CREATE TABLE (?!IF NOT EXISTS)", sql), path.name
        assert not re.search(r"ADD COLUMN (?!IF NOT EXISTS)", sql), path.name
        assert not re.search(r"CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)", sql), path.name


def test_rescheduled_reminders_get_a_new_dedupe_key():
    sql = _versioned("club_day.upcoming")
    assert "schedule_version > 1" in sql and "':v'" in sql
    assert sql.startswith("'club_day.upcoming:' || d.id::text")
