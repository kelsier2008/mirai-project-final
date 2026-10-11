from fastapi import APIRouter

from app import db, redis_client
from app.config import settings

router = APIRouter(tags=["health"])


@router.get("/health/live")
async def live():
    """Process is up. No dependencies, so it answers even while the database wakes."""
    return {"status": "ok"}


@router.get("/health")
async def health():
    async with db.pool.acquire() as conn:
        await conn.fetchval("SELECT 1")
        migrations = await conn.fetchval(
            "SELECT max(version) FROM schema_migrations"
        ) if await conn.fetchval("SELECT to_regclass('public.schema_migrations')") else None
    await redis_client.redis.ping()
    return {
        "status": "ok",
        "mode": settings.app_mode,
        "cache": "memory" if settings.app_mode == "local" else "redis",
        "background_jobs": "in_process" if settings.app_mode == "local" else "celery",
        "schema": migrations,
        "email": "configured" if settings.email_enabled else "disabled",
    }


@router.get("/config/public")
async def public_config():
    """Non-secret branding and labels the static frontend needs before login."""
    return {
        "app_name": settings.app_name,
        "app_short_name": settings.app_short_name,
        "institution_name": settings.institution_name,
        "timezone": settings.app_timezone,
        "role_labels": {
            "student": "Student",
            "coordinator": "Club coordinator",
            "advisor": "Faculty advisor",
            "campus_admin": "Campus manager",
            "super_admin": "Super admin",
        },
    }
