"""Pytest fixtures.

Tests run against a dedicated ``*_test`` Postgres database (same server as the app)
so that timezone-aware ``timestamptz`` semantics match production exactly — SQLite
would silently drop timezone information and hide bugs. Each test gets a clean set of
tables (rows are deleted between tests).
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.database import Base, get_db
from app.main import app
from app.models import Booking, Resource, Schedule, Service, Tenant, User

_base, _name = settings.database_url.rsplit("/", 1)
TEST_DB = f"{_name}_test"
TEST_URL = f"{_base}/{TEST_DB}"


def _ensure_test_database() -> None:
    admin = create_engine(settings.database_url, isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": TEST_DB}
        ).first()
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{TEST_DB}"'))
    admin.dispose()


@pytest.fixture(scope="session")
def engine():
    _ensure_test_database()
    eng = create_engine(TEST_URL, future=True)
    # Rebuild the schema from the current models so it always matches (create_all
    # alone would not add columns introduced after the table first existed).
    Base.metadata.drop_all(eng)
    Base.metadata.create_all(eng)
    # Seed the plan/feature catalog (migration seeds it in real DBs).
    from app.seed_plans import seed_plans

    with Session(eng) as s:
        seed_plans(s)
    yield eng
    eng.dispose()


@pytest.fixture
def db(engine) -> Session:
    TestSession = sessionmaker(bind=engine, autoflush=False, future=True)
    session = TestSession()
    try:
        yield session
    finally:
        session.rollback()
        # Clean all tables in FK-safe order for the next test.
        for model in (Booking, Schedule, Resource, Service, User, Tenant):
            session.execute(delete(model))
        session.commit()
        session.close()


@pytest.fixture
def client(db) -> TestClient:
    from app.routers.auth import login_limiter

    login_limiter.reset()  # isolate rate-limit state between tests
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
