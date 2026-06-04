from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    app_name: str = "Reservalo API"
    environment: str = "development"
    debug: bool = True

    # Database
    database_url: str = "postgresql+psycopg2://reservalo:reservalo@localhost:5432/reservalo"

    # JWT
    secret_key: str = "change-me-in-production-please-use-a-long-random-string"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    reset_token_expire_minutes: int = 30

    # CORS
    cors_origins: list[str] = ["http://localhost:3000"]

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
