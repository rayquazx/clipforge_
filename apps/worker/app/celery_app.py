"""
ClipForge — Celery application configuration.

Creates and configures the Celery app instance used by all worker processes.
Broker and result backend are both backed by Redis.
"""

import os
from celery import Celery

# ---------------------------------------------------------------------------
# Redis connection
# ---------------------------------------------------------------------------
REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# ---------------------------------------------------------------------------
# Celery app instance
# ---------------------------------------------------------------------------
celery_app = Celery("clipforge", broker=REDIS_URL, backend=REDIS_URL)

celery_app.conf.update(
    # Serialisation ---------------------------------------------------------
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],

    # Time limits (seconds) ------------------------------------------------
    task_soft_time_limit=3600,   # 1 hour  — raises SoftTimeLimitExceeded
    task_time_limit=7200,        # 2 hours — hard kill

    # Queue routing ---------------------------------------------------------
    task_routes={
        "download.*":   {"queue": "download"},
        "transcribe.*": {"queue": "transcribe"},
        "analyze.*":    {"queue": "default"},
        "render.*":     {"queue": "render"},
    },

    # Misc ------------------------------------------------------------------
    timezone="UTC",
    enable_utc=True,
    result_expires=86400,  # results kept for 24 h
)

# ---------------------------------------------------------------------------
# Auto-discover task modules inside app.tasks
# ---------------------------------------------------------------------------
celery_app.autodiscover_tasks(["app.tasks"])

# Eagerly import the tasks package so every task module is registered at
# worker boot time (the package __init__ re-exports them).
import app.tasks  # noqa: F401, E402
