from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.config import settings


def app_tz() -> ZoneInfo:
    return ZoneInfo(settings.app_timezone)


def today() -> date:
    """Today's date on the institution's clock (not the server's)."""
    return datetime.now(app_tz()).date()
