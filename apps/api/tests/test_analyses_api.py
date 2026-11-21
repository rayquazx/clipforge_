"""
API integration tests for Analyses router:
- Ownership checks
- Start analysis (POST /projects/{id}/analyses)
- Cancel running analysis (POST /analyses/{id}/cancel)
- Fetch moments and signals timeline
- Re-run support
"""

import uuid
import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app
from app.models.user import User
from app.models.project import Project
from app.models.analysis import Analysis, Moment, SignalWindow
from app.database import get_db
from app.dependencies import get_current_user


@pytest.fixture
def test_user():
    return User(
        id=uuid.uuid4(),
        email="streamer@clipforge.tv",
        display_name="TestStreamer",
        password_hash="mock_hash",
    )


@pytest.fixture
def test_other_user():
    return User(
        id=uuid.uuid4(),
        email="other@clipforge.tv",
        display_name="OtherStreamer",
        password_hash="mock_hash",
    )


class MockAnalysisDB:
    def __init__(self, projects=None, analyses=None, moments=None, signals=None):
        self.projects = projects or []
        self.analyses = analyses or []
        self.moments = moments or []
        self.signals = signals or []
        self.added = []

    def add(self, obj):
        self.added.append(obj)
        if isinstance(obj, Analysis):
            self.analyses.append(obj)

    async def commit(self):
        pass

    async def refresh(self, obj):
        if not getattr(obj, "id", None):
            obj.id = uuid.uuid4()
        from datetime import datetime, timezone
        obj.created_at = datetime.now(timezone.utc)
        obj.updated_at = datetime.now(timezone.utc)

    async def delete(self, obj):
        if obj in self.analyses:
            self.analyses.remove(obj)

    async def execute(self, stmt):
        class MockResult:
            def __init__(self, items):
                self._items = items

            def scalars(self):
                return self

            def all(self):
                return self._items

            def first(self):
                return self._items[0] if self._items else None

        stmt_str = str(stmt).lower()
        if "from analyses" in stmt_str:
            return MockResult(self.analyses)
        elif "from moments" in stmt_str:
            return MockResult(self.moments)
        elif "from signal_windows" in stmt_str:
            return MockResult(self.signals)
        elif "from projects" in stmt_str:
            return MockResult(self.projects)
        return MockResult([])


@pytest.mark.asyncio
async def test_create_analysis_success(test_user, monkeypatch):
    proj = Project(
        id=uuid.uuid4(),
        user_id=test_user.id,
        source_type="youtube",
        source_url="https://youtube.com/watch?v=dQw4w9WgXcQ",
        status="ready",
    )
    mock_db = MockAnalysisDB(projects=[proj])

    app.dependency_overrides[get_current_user] = lambda: test_user
    app.dependency_overrides[get_db] = lambda: mock_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(
            f"/projects/{proj.id}/analyses",
            json={
                "mode": "both",
                "min_clip_seconds": 15,
                "max_clip_seconds": 60,
                "max_clips": 10,
                "language": "auto",
            },
        )

    app.dependency_overrides.clear()

    assert resp.status_code == 201
    data = resp.json()
    assert data["mode"] == "both"
    assert data["status"] == "queued"
    assert len(mock_db.added) == 1


@pytest.mark.asyncio
async def test_access_analysis_of_other_user_forbidden(test_user, test_other_user):
    proj = Project(
        id=uuid.uuid4(),
        user_id=test_user.id,
        source_type="youtube",
        status="ready",
    )
    analysis = Analysis(
        id=uuid.uuid4(),
        project_id=proj.id,
        mode="funny",
        status="ready",
    )

    # Empty result when other user requests User 1's project/analysis
    mock_db = MockAnalysisDB(projects=[], analyses=[])

    app.dependency_overrides[get_current_user] = lambda: test_other_user
    app.dependency_overrides[get_db] = lambda: mock_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get(f"/analyses/{analysis.id}")

    app.dependency_overrides.clear()

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_cancel_running_analysis(test_user, monkeypatch):
    proj = Project(id=uuid.uuid4(), user_id=test_user.id, source_type="youtube", status="ready")
    analysis = Analysis(
        id=uuid.uuid4(),
        project_id=proj.id,
        mode="both",
        status="transcribing",
    )
    mock_db = MockAnalysisDB(projects=[proj], analyses=[analysis])

    app.dependency_overrides[get_current_user] = lambda: test_user
    app.dependency_overrides[get_db] = lambda: mock_db

    # Mock redis cancel set
    class MockRedis:
        async def set(self, key, val, ex=None):
            pass
        async def close(self):
            pass

    import redis.asyncio as aioredis
    monkeypatch.setattr(aioredis, "from_url", lambda url: MockRedis())

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(f"/analyses/{analysis.id}/cancel")

    app.dependency_overrides.clear()

    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"
    assert analysis.status == "cancelled"
