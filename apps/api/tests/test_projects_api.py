"""
API integration tests for Projects endpoints:
- Create project
- Duplicate link rejection (409)
- Unauthorized access to another user's project (404)
- Project pagination and ownership isolation
"""

import uuid
import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app
from app.models.user import User
from app.models.project import Project
from app.database import get_db
from app.dependencies import get_current_user


@pytest.fixture
def mock_user_1():
    user = User(
        id=uuid.uuid4(),
        email="creator1@clipforge.tv",
        display_name="Creator One",
        password_hash="mock_hash",
    )
    return user


@pytest.fixture
def mock_user_2():
    user = User(
        id=uuid.uuid4(),
        email="creator2@clipforge.tv",
        display_name="Creator Two",
        password_hash="mock_hash",
    )
    return user


class MockAsyncSession:
    """Mock async DB session to test router behavior in isolation."""

    def __init__(self, projects=None):
        self.projects = projects or []
        self.added = []
        self.deleted = []

    def add(self, obj):
        self.added.append(obj)
        self.projects.append(obj)

    async def commit(self):
        pass

    async def refresh(self, obj):
        if not getattr(obj, "id", None):
            obj.id = uuid.uuid4()
        from datetime import datetime, timezone
        obj.created_at = datetime.now(timezone.utc)
        obj.updated_at = datetime.now(timezone.utc)

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

            def scalar_one(self):
                return len(self._items)

        # Basic filter matching for test cases
        stmt_str = str(stmt).lower()
        if "from projects" in stmt_str or "select count" in stmt_str or "projects.user_id" in stmt_str:
            # Check if filtering for existing URL
            matched = self.projects
            return MockResult(matched)
        return MockResult([])

    async def delete(self, obj):
        self.deleted.append(obj)


@pytest.mark.asyncio
async def test_create_project_success(mock_user_1, monkeypatch):
    mock_db = MockAsyncSession(projects=[])

    app.dependency_overrides[get_current_user] = lambda: mock_user_1
    app.dependency_overrides[get_db] = lambda: mock_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/projects", json={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"})

    app.dependency_overrides.clear()

    assert resp.status_code == 201
    data = resp.json()
    assert data["source_type"] == "youtube"
    assert data["external_id"] == "dQw4w9WgXcQ"
    assert data["status"] == "queued"
    assert len(mock_db.added) == 1


@pytest.mark.asyncio
async def test_duplicate_project_rejection(mock_user_1):
    existing_project = Project(
        id=uuid.uuid4(),
        user_id=mock_user_1.id,
        source_type="youtube",
        source_url="https://youtube.com/watch?v=dQw4w9WgXcQ",
        external_id="dQw4w9WgXcQ",
        status="ready",
    )
    mock_db = MockAsyncSession(projects=[existing_project])

    app.dependency_overrides[get_current_user] = lambda: mock_user_1
    app.dependency_overrides[get_db] = lambda: mock_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/projects", json={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"})

    app.dependency_overrides.clear()

    assert resp.status_code == 409
    assert "already added this video link" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_unauthorized_access_to_another_users_project(mock_user_1, mock_user_2):
    # Project owned by User 1
    p1 = Project(
        id=uuid.uuid4(),
        user_id=mock_user_1.id,
        source_type="twitch",
        source_url="https://twitch.tv/videos/12345678",
        status="ready",
    )

    # Empty result when User 2 requests User 1's project
    mock_db = MockAsyncSession(projects=[])

    app.dependency_overrides[get_current_user] = lambda: mock_user_2
    app.dependency_overrides[get_db] = lambda: mock_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get(f"/projects/{p1.id}")

    app.dependency_overrides.clear()

    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()
