"""
ClipForge API — Route handlers registry.
"""

from app.routers.auth import router as auth_router  # noqa: F401
from app.routers.projects import router as projects_router  # noqa: F401
from app.routers.analyses import router as analyses_router  # noqa: F401
from app.routers.clips import router as clips_router  # noqa: F401
from app.routers.renders import router as renders_router  # noqa: F401
from app.routers.events import router as events_router  # noqa: F401
from app.routers.config import router as config_router  # noqa: F401
