"""Bring a hosted database up to date before the API starts.

Applies any pending migrations through the tracked migrator (app/migrate.py),
so an existing demo database also receives new migrations instead of only an
empty one being initialised. Existing data is preserved.
"""
import asyncio
import logging
import sys

from app.migrate import main

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    try:
        sys.exit(asyncio.run(main()))
    except RuntimeError as exc:
        logging.getLogger("bootstrap").error("%s", exc)
        sys.exit(1)
