"""Apply backend/migrations/*.sql in filename order, each exactly once.

Run: python -m app.migrate   (the API also runs this at startup when AUTO_MIGRATE=1)

- Applied files are recorded in schema_migrations, so restarts do no repeat work.
- Each file runs in its own transaction: a failing file leaves nothing half-applied
  and stops the run with the file name in the log.
- A PostgreSQL advisory lock serialises concurrent starters (several API workers,
  a migrate container and an API starting together).
- Databases created before tracking existed (docker initdb, the local launcher or
  the Render bootstrap) are baselined: 001 is recorded as applied and 002+ run
  again, which is safe because every later file is written to be idempotent.
"""
import asyncio
import logging
import os
import sys
from pathlib import Path

import asyncpg

log = logging.getLogger("app.migrate")

MIGRATIONS_DIR = Path(__file__).resolve().parents[1] / "migrations"
LOCK_KEY = 72_420_011  # arbitrary, constant advisory-lock id for migrations


def migration_files(directory: Path = MIGRATIONS_DIR) -> list[Path]:
    return sorted(p for p in directory.glob("*.sql") if p.name[:3].isdigit())


async def apply_migrations(conn: asyncpg.Connection, directory: Path = MIGRATIONS_DIR) -> list[str]:
    files = migration_files(directory)
    if not files:
        raise RuntimeError(f"No migration files found in {directory}")
    await conn.execute("SELECT pg_advisory_lock($1)", LOCK_KEY)
    try:
        await conn.execute(
            """CREATE TABLE IF NOT EXISTS schema_migrations (
                 version TEXT PRIMARY KEY,
                 applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"""
        )
        applied = {r["version"] for r in await conn.fetch("SELECT version FROM schema_migrations")}
        if not applied and await conn.fetchval("SELECT to_regclass('public.users')") is not None:
            await conn.execute(
                "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING",
                files[0].name,
            )
            applied.add(files[0].name)
            log.info("existing schema found; baselined %s and re-checking later migrations", files[0].name)

        done = []
        for path in files:
            if path.name in applied:
                continue
            log.info("applying migration %s", path.name)
            try:
                async with conn.transaction():
                    await conn.execute(path.read_text())
                    await conn.execute(
                        "INSERT INTO schema_migrations (version) VALUES ($1)", path.name
                    )
            except Exception as exc:
                raise RuntimeError(f"Migration {path.name} failed: {exc}") from exc
            done.append(path.name)
        return done
    finally:
        await conn.execute("SELECT pg_advisory_unlock($1)", LOCK_KEY)


async def connect_with_retry(database_url: str, attempts: int = 10, delay: float = 2.0):
    """The database may still be starting (docker) or waking up (free hosting)."""
    for attempt in range(1, attempts + 1):
        try:
            return await asyncpg.connect(database_url, timeout=10)
        except (OSError, asyncpg.PostgresError, asyncio.TimeoutError) as exc:
            if attempt == attempts:
                raise RuntimeError(
                    f"Could not connect to the database after {attempts} attempts "
                    f"({type(exc).__name__}). Check DATABASE_URL and that PostgreSQL is running."
                ) from exc
            log.warning("database not reachable yet (attempt %s/%s, %s); retrying",
                        attempt, attempts, type(exc).__name__)
            await asyncio.sleep(delay)


async def main() -> int:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        log.error("DATABASE_URL is not set")
        return 2
    conn = await connect_with_retry(database_url, int(os.environ.get("DB_CONNECT_ATTEMPTS", "30")))
    try:
        done = await apply_migrations(conn)
    finally:
        await conn.close()
    log.info("migrations applied: %s", ", ".join(done) if done else "none (up to date)")
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    try:
        sys.exit(asyncio.run(main()))
    except RuntimeError as exc:
        log.error("%s", exc)
        sys.exit(1)
