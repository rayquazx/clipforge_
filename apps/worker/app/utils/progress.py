"""
ClipForge Worker — task progress reporter.

Stores real-time progress data in a Redis hash and mirrors the state via
Celery's ``update_state`` mechanism so both polling and pub/sub consumers
can track task execution.
"""

from __future__ import annotations

from typing import Any

import redis


class ProgressReporter:
    """Reports task progress to Redis and Celery state.

    Parameters
    ----------
    task:
        A *bound* Celery task instance (``self`` inside a ``bind=True`` task).
    redis_conn:
        An active ``redis.Redis`` connection.

    Usage
    -----
    >>> reporter = ProgressReporter(self, redis_conn)
    >>> reporter.update("downloading", 25, "Fetching segment 3/12")
    """

    # Redis key prefix for progress hashes.
    _KEY_PREFIX: str = "task_progress"

    def __init__(self, task: Any, redis_conn: redis.Redis) -> None:
        self._task = task
        self._redis = redis_conn
        self._task_id: str = task.request.id or "unknown"

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def update(self, stage: str, percent: int, message: str) -> None:
        """Push a progress update.

        Parameters
        ----------
        stage:
            Logical stage name (e.g. ``"downloading"``, ``"transcribing"``).
        percent:
            Completion percentage (0-100).
        message:
            Human-readable status message.
        """
        key = f"{self._KEY_PREFIX}:{self._task_id}"

        # Store in Redis hash for direct lookup / pub-sub consumers.
        self._redis.hset(
            key,
            mapping={
                "stage": stage,
                "percent": str(percent),
                "message": message,
                "task_id": self._task_id,
            },
        )
        # Keep the hash around for 24 hours after last update.
        self._redis.expire(key, 86400)

        # Mirror into Celery's built-in task state so callers of
        # ``AsyncResult.info`` can read the same data.
        self._task.update_state(
            state="PROGRESS",
            meta={
                "stage": stage,
                "percent": percent,
                "message": message,
            },
        )
