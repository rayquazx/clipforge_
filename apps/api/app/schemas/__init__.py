"""
ClipForge API — Pydantic schemas registry.
"""

from app.schemas.auth import (  # noqa: F401
    TokenData,
    TokenRefreshRequest,
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
)
from app.schemas.project import (  # noqa: F401
    PaginatedProjectsResponse,
    ProjectCreateRequest,
    ProjectResponse,
)
from app.schemas.analysis import (  # noqa: F401
    AnalysisCreateRequest,
    AnalysisResponse,
    MomentResponse,
    SignalWindowResponse,
)
from app.schemas.clip import (  # noqa: F401
    BulkActionRequest,
    BulkActionResponse,
    ClipListResponse,
    ClipResponse,
    ConfigResponse,
    CreateClipsFromMomentsRequest,
    CreateClipsFromMomentsResponse,
    CreateCustomClipRequest,
    EditState,
    PatchClipRequest,
    PreviewStatusResponse,
    ThumbnailsResponse,
    Trim,
    WaveformResponse,
)
from app.schemas.render import (  # noqa: F401
    CreateRenderRequest,
    DownloadResponse,
    RenderListResponse,
    RenderOptions,
    RenderResponse,
)
