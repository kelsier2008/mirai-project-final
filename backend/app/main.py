import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app import db, redis_client
from app.config import settings
from app.core.cors import add_cors, allows_any_origin
from app.core.state_machines import InvalidTransition
from app.routers import (
    admin, auth, certificates, checkin, club_days, clubs, health, memberships,
    dashboards, events, extras, notifications, submissions, verify,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("app.startup")


async def _run_migrations():
    from app.migrate import apply_migrations

    async with db.pool.acquire() as conn:
        done = await apply_migrations(conn)
    log.info("database migrations: %s", ", ".join(done) if done else "up to date")


@asynccontextmanager
async def lifespan(app: FastAPI):
    started = time.monotonic()
    log.info("starting %s (mode=%s)", settings.app_name, settings.app_mode)
    if len(settings.jwt_secret) < 32:
        log.warning("JWT_SECRET is shorter than 32 characters; use a long random value")
    if allows_any_origin(settings):
        log.warning("CORS_ORIGINS is '*': any website can call this API from a browser. "
                    "List the portal origins for a real deployment (docs/CLOUDFLARE_DEPLOYMENT.md)")
    try:
        await db.init_pool()
    except Exception:
        log.exception("startup failed: database connection")
        raise
    workers_started = False
    try:
        if settings.auto_migrate:
            try:
                await _run_migrations()
            except Exception:
                log.exception("startup failed: database migrations")
                raise
        await redis_client.init_redis()
        if settings.app_mode == "local":
            from app.local_workers import start_local_workers
            await start_local_workers()
            workers_started = True
        log.info("ready in %.1fs", time.monotonic() - started)
        yield
    finally:
        if workers_started:
            from app.local_workers import stop_local_workers
            await stop_local_workers()
        await redis_client.close_redis()
        await db.close_pool()


app = FastAPI(title=settings.app_name, lifespan=lifespan)
add_cors(app, settings)


@app.exception_handler(InvalidTransition)
async def invalid_transition_handler(request: Request, exc: InvalidTransition):
    return JSONResponse(status_code=409, content={"detail": str(exc)})


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(clubs.router)
app.include_router(memberships.router)
app.include_router(club_days.router)
app.include_router(checkin.router)
app.include_router(submissions.router)
app.include_router(certificates.router)
app.include_router(verify.router)  # PUBLIC: no login
app.include_router(notifications.router)
app.include_router(events.router)
app.include_router(dashboards.router)
app.include_router(extras.router)
