import re
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    redis_url: str | None = None
    app_mode: Literal["local", "production"] = "production"
    jwt_secret: str
    jwt_expire_minutes: int = 480
    # Stage 3: file storage
    upload_dir: str = "/data/uploads"
    max_upload_mb: int = 25
    # Stage 4: certificates (defaults mean no .env change is needed)
    cert_secret: str = ""  # HMAC key; falls back to a key derived from jwt_secret
    public_base_url: str = "http://localhost:8000"  # what the certificate QR points to

    # Deployment
    cors_origins: str = "*"  # comma-separated origins, or "*" for any
    # Optional pattern for more browser origins, e.g. Cloudflare Pages preview deployments:
    # ^https://[a-z0-9-]+\.mirai-student\.pages\.dev$ (blank: exact CORS_ORIGINS only)
    cors_origin_regex: str = ""
    app_timezone: str = "Asia/Kolkata"  # "today", reminder windows and the scheduler
    auto_migrate: bool = True  # apply pending SQL migrations on startup
    db_connect_attempts: int = 10  # startup retries while the database wakes up

    # Institution branding (served to the frontend by GET /config/public)
    app_name: str = "Mirai Club Activities Tracker"
    app_short_name: str = "Mirai Clubs"
    institution_name: str = "Mirai"

    # Email notifications: disabled while smtp_host is blank
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_security: Literal["starttls", "ssl", "none"] = "starttls"

    model_config = {"env_file": ".env", "extra": "ignore"}

    @field_validator("cors_origin_regex")
    @classmethod
    def _valid_origin_regex(cls, value: str) -> str:
        value = value.strip()
        try:
            re.compile(value)  # fail at startup, not on the first cross-origin request
        except re.error as exc:
            raise ValueError(f"CORS_ORIGIN_REGEX is not a valid regular expression: {exc}") from exc
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        origins = [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]
        return origins or ["*"]

    @property
    def email_enabled(self) -> bool:
        return bool(self.smtp_host.strip() and self.smtp_from.strip())


settings = Settings()
