#!/usr/bin/env bash
set -e

echo "Running database migrations..."
alembic upgrade head

echo "Starting Reservalo API..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
