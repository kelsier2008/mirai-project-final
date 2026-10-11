"""In-process equivalents of the Celery queues used by the local demo mode.

Only one process runs the scheduler: each API process tries to take a
PostgreSQL advisory lock and the holder becomes the scheduler leader. Running
uvicorn with several workers (or several instances on one database) therefore
never runs the same scheduled job twice; if the leader stops, another process
takes the lock on its next attempt.
"""
import asyncio
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

import asyncpg

from app.config import settings

log = logging.getLogger(__name__)
SCHEDULER_LOCK_KEY = 72_420_012  # constant advisory-lock id for the scheduler leader
_certificate_queue: asyncio.Queue[str] | None = None
_tasks: list[asyncio.Task] = []


async def enqueue_certificate(certificate_id: str):
    if _certificate_queue is None:
        raise RuntimeError("Local background workers are not running")
    await _certificate_queue.put(certificate_id)


async def _certificate_worker():
    from workers.tasks_certificates import _generate_one, _with_conn

    while True:
        certificate_id = await _certificate_queue.get()
        try:
            result = await _with_conn(_generate_one, certificate_id)
            log.info("certificate %s: %s", certificate_id, result)
        except Exception:
            log.exception("local certificate task failed for %s", certificate_id)
        finally:
            _certificate_queue.task_done()


def _scheduled_jobs(now: datetime):
    minute = now.strftime("%Y-%m-%d %H:%M")
    jobs = []
    if now.second < 30:
        jobs.extend([
            ("send-pending-notifications", minute, "workers.tasks_schedule", "send_pending_notifications"),
            ("generate-pending-certificates", minute, "workers.tasks_certificates", "sweep_pending_certificates"),
        ])
        if now.minute == 0:
            jobs.append(("announce-upcoming-club-days", minute, "workers.tasks_schedule", "announce_upcoming_club_days"))
        if now.minute == 15:
            jobs.append(("reminder-48h", minute, "workers.tasks_schedule", "remind_48h"))
        if now.minute == 20:
            jobs.append(("event-reminder-24h", minute, "workers.tasks_schedule", "remind_events_24h"))
        if now.hour == 9 and now.minute == 0:
            jobs.append(("plan-reminder-7d", minute, "workers.tasks_schedule", "remind_plan_7d"))
        if now.hour == 9 and now.minute == 30:
            jobs.append(("deadline-reminder-5d", minute, "workers.tasks_schedule", "remind_deadline_5d"))
        if now.day in (28, 29, 30, 31) and now.hour == 23 and now.minute == 55:
            jobs.append(("monthly-report", minute, "workers.tasks_schedule", "monthly_report"))
    return jobs


async def _run_job(name: str, module_name: str, task_name: str):
    try:
        module = __import__(module_name, fromlist=[task_name])
        running = asyncio.create_task(asyncio.to_thread(getattr(module, task_name)))
        try:
            await asyncio.shield(running)
        except asyncio.CancelledError:
            await running
            raise
    except asyncio.CancelledError:
        raise
    except Exception:
        log.exception("local scheduled job %s failed", name)


async def _scheduler():
    tz = ZoneInfo(settings.app_timezone)
    lock_conn: asyncpg.Connection | None = None
    last_run: dict[str, str] = {}
    try:
        while True:
            if lock_conn is None or lock_conn.is_closed():
                try:
                    lock_conn = await asyncpg.connect(settings.database_url, timeout=10)
                    leader = await lock_conn.fetchval("SELECT pg_try_advisory_lock($1)", SCHEDULER_LOCK_KEY)
                except (OSError, asyncpg.PostgresError, asyncio.TimeoutError):
                    log.warning("scheduler could not reach the database; retrying")
                    lock_conn = None
                    await asyncio.sleep(30)
                    continue
                if not leader:
                    # Another process is the scheduler; check again later in case it stops.
                    await lock_conn.close()
                    lock_conn = None
                    await asyncio.sleep(60)
                    continue
                log.info("this process is the scheduled-job leader")
            else:
                try:  # a dropped connection silently releases the lock
                    await lock_conn.fetchval("SELECT 1")
                except (OSError, asyncpg.PostgresError, asyncpg.InterfaceError):
                    lock_conn = None
                    continue
            now = datetime.now(tz)
            for name, slot, module_name, task_name in _scheduled_jobs(now):
                if last_run.get(name) == slot:
                    continue
                last_run[name] = slot
                await _run_job(name, module_name, task_name)
            await asyncio.sleep(15)
    finally:
        if lock_conn is not None and not lock_conn.is_closed():
            await lock_conn.close()  # releases the advisory lock


async def start_local_workers():
    global _certificate_queue, _tasks
    _certificate_queue = asyncio.Queue()
    _tasks = [
        asyncio.create_task(_certificate_worker(), name="local-certificate-worker"),
        asyncio.create_task(_scheduler(), name="local-scheduler"),
    ]


async def stop_local_workers():
    global _certificate_queue, _tasks
    for task in _tasks:
        task.cancel()
    if _tasks:
        await asyncio.gather(*_tasks, return_exceptions=True)
    _tasks = []
    _certificate_queue = None
