"""
ClipForge Worker — Task package entrypoint.

Imports all task modules so that Celery's task registry is populated
when the worker boots.
"""

from app.tasks.analyze import *      # noqa: F401, F403
from app.tasks.chat_fetch import *   # noqa: F401, F403
from app.tasks.download import *     # noqa: F401, F403
from app.tasks.metadata import *     # noqa: F401, F403
from app.tasks.render import *       # noqa: F401, F403
from app.tasks.transcribe import *   # noqa: F401, F403
