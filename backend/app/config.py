import json
from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    app_name: str = "Reservalo API"
    environment: str = "development"
    debug: bool = True

    # Database
    database_url: str = "postgresql+psycopg2://reservalo:reservalo@localhost:5432/reservalo"

    @field_validator("database_url", mode="before")
    @classmethod
    def _normalize_db_url(cls, v: str) -> str:
        """Accept the bare ``postgres://`` / ``postgresql://`` URLs that hosts like
        Railway/Render/Heroku provide and force the psycopg2 driver SQLAlchemy expects."""
        if isinstance(v, str):
            if v.startswith("postgres://"):
                v = "postgresql://" + v[len("postgres://") :]
            if v.startswith("postgresql://"):
                v = "postgresql+psycopg2://" + v[len("postgresql://") :]
        return v

    # JWT
    secret_key: str = "change-me-in-production-please-use-a-long-random-string"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    reset_token_expire_minutes: int = 30

    # CORS. NoDecode keeps pydantic-settings from JSON-parsing the env var, so the
    # validator below can accept any format and the app never crashes on a bad value.
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors(cls, v: object) -> list[str]:
        """Accept a JSON array (``["https://a","https://b"]``), a comma-separated list
        (``https://a,https://b``) or a single URL (``https://a``)."""
        if v is None:
            return ["http://localhost:3000"]
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            s = v.strip()
            if not s:
                return ["http://localhost:3000"]
            if s.startswith("["):
                try:
                    return json.loads(s)
                except json.JSONDecodeError:
                    pass
            return [o.strip() for o in s.split(",") if o.strip()]
        return v  # type: ignore[return-value]

    # Public site base URL (used to build client-facing links in emails)
    public_base_url: str = "http://localhost:3000"

    # Email / SMTP. If smtp_host is empty, emails are logged to stdout instead of sent
    # (lets the whole notification flow work in development without a provider).
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "Reservalo <no-reply@reservalo.app>"
    smtp_tls: bool = True

    # Automatic reminders (email "X hours before" the booking)
    reminder_enabled: bool = True
    reminder_hours_before: int = 24
    reminder_interval_minutes: int = 15

    # Login rate limiting (per client IP)
    login_max_attempts: int = 10
    login_window_seconds: int = 60

    # Uploads (transfer receipts)
    upload_dir: str = "/app/uploads"
    upload_max_bytes: int = 5 * 1024 * 1024  # 5 MB


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
