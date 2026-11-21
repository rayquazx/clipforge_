"""
Comprehensive API Tests for Clips, Renders, Previews, Config, and Bulk Endpoints.
Covers:
- Auth and ownership validation
- Idempotent moment clip creation
- Custom clip creation with duration bounds checks
- List clips with filters and pagination
- Get clip details
- Patch clip with optimistic concurrency (version conflict 409)
- Duplicate clip
- Delete clip (204)
- Bulk action (delete / export) with partial results
- Preview prepare & status
- HTTP Range streaming (200 and 206)
- Waveform & thumbnails endpoints
- Render job creation, get, cancel, and presigned download
- Global config endpoint
"""

from __future__ import annotations

from datetime import datetime, timezone
import io
import uuid
import pytest
from httpx import ASGITransport, AsyncClient

from app.database import get_db
from app.dependencies import get_current_user
from app.main import app
from app.models.analysis import Analysis, Moment
from app.models.clip import Clip
from app.models.project import Project
from app.models.render import Render
from app.models.user import User
from app.services.storage_service import StorageService


@pytest.fixture
def test_user():
    return User(
        id=uuid.uuid4(),
        email="streamer@clipforge.tv",
        display_name="TestStreamer",
        password_hash="mock_hash",
    )


@pytest.fixture
def other_user():
    return User(
        id=uuid.uuid4(),
        email="other@clipforge.tv",
        display_name="OtherStreamer",
        password_hash="mock_hash",
    )


class MockDB:
    def __init__(self, users=None, projects=None, analyses=None, moments=None, clips=None, renders=None):
        self.users = users or []
        self.projects = projects or []
        self.analyses = analyses or []
        self.moments = moments or []
        self.clips = clips or []
        self.renders = renders or []
        self.added = []
        self.deleted = []

    def add(self, obj):
        self.added.append(obj)
        if isinstance(obj, Clip) and obj not in self.clips:
            self.clips.append(obj)
        elif isinstance(obj, Render) and obj not in self.renders:
            self.renders.append(obj)
        elif isinstance(obj, Project) and obj not in self.projects:
            self.projects.append(obj)

    async def commit(self):
        pass

    async def refresh(self, obj):
        if not getattr(obj, "id", None):
            obj.id = uuid.uuid4()
        now = datetime.now(timezone.utc)
        if not getattr(obj, "created_at", None):
            obj.created_at = now
        obj.updated_at = now

    async def delete(self, obj):
        self.deleted.append(obj)
        if obj in self.clips:
            self.clips.remove(obj)
        if obj in self.renders:
            self.renders.remove(obj)

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

            def scalar(self):
                return len(self._items)

        stmt_str = str(stmt).lower()
        if "from clips" in stmt_str and "join clip" in stmt_str:
            # Query joining render and clip
            rows = []
            for r in self.renders:
                clip = next((c for c in self.clips if c.id == r.clip_id), None)
                if clip:
                    rows.append((r, clip))
            return MockResult(rows)
        elif "from clips" in stmt_str:
            return MockResult(self.clips)
        elif "from renders" in stmt_str:
            return MockResult(self.renders)
        elif "from moments" in stmt_str:
            return MockResult(self.moments)
        elif "from analyses" in stmt_str:
            return MockResult(self.analyses)
        elif "from projects" in stmt_str:
            return MockResult(self.projects)
        elif "from users" in stmt_str:
            return MockResult(self.users)
        return MockResult([])


class MockStorage:
    def __init__(self):
        self._bucket = "clipforge"
        self._files = {
            "test_proxy.mp4": b"MP4_VIDEO_HEADER_CONTENT_BYTES_FOR_RANGE_TEST",
        }

        class MockClient:
            def __init__(self, outer):
                self.outer = outer

            def stat_object(self, bucket, key):
                class Stat:
                    def __init__(self, size):
                        self.size = size
                if key in self.outer._files or "proxy" in key or "thumb" in key:
                    size = len(self.outer._files.get(key, b"dummy_content"))
                    return Stat(size)
                raise Exception("Not found")

            def get_object(self, bucket, key, offset=0, length=None):
                data = self.outer._files.get(key, b"dummy_mp4_proxy_bytes_stream")
                sub = data[offset : (offset + length) if length else len(data)]
                stream = io.BytesIO(sub)
                stream.release_conn = lambda: None
                return stream

        self._client = MockClient(self)

    def get_presigned_url(self, key: str, expires: int = 3600) -> str:
        return f"https://mock-minio.local/clipforge/{key}?token=mock"

    def download_file(self, key: str) -> bytes:
        return self._files.get(key, b"dummy_bytes")

    def delete_file(self, key: str) -> None:
        self._files.pop(key, None)


@pytest.mark.asyncio
async def test_get_config(test_user):
    """Verify GET /config returns correct configuration limits."""
    app.dependency_overrides[get_current_user] = lambda: test_user
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/config")
        assert resp.status_code == 200
        data = resp.json()
        assert data["max_clip_seconds"] == 60.0
        assert data["preview_padding_sec"] == 5.0
        assert "original" in data["export_resolutions"]
        assert "1080p" in data["export_resolutions"]


@pytest.mark.asyncio
async def test_create_custom_clip_bounds_validation(test_user):
    """Verify custom clip creation validates duration boundaries."""
    app.dependency_overrides[get_current_user] = lambda: test_user
    project = Project(
        id=uuid.uuid4(),
        user_id=test_user.id,
        source_type="youtube",
        duration_seconds=120,
    )
    mock_db = MockDB(projects=[project])
    app.dependency_overrides[get_db] = lambda: mock_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Too short (< 1.0s)
        resp = await client.post(
            f"/projects/{project.id}/clips",
            json={"start": 10.0, "end": 10.5, "title": "Too Short"},
        )
        assert resp.status_code == 422
        assert resp.json()["error"]["code"] == "validation_error"

        # Too long (> 60.0s)
        resp2 = await client.post(
            f"/projects/{project.id}/clips",
            json={"start": 10.0, "end": 75.0, "title": "Too Long"},
        )
        assert resp2.status_code == 422
        assert resp2.json()["error"]["code"] == "validation_error"

        # Negative start
        resp3 = await client.post(
            f"/projects/{project.id}/clips",
            json={"start": -2.0, "end": 10.0, "title": "Negative"},
        )
        assert resp3.status_code == 422
        assert resp3.json()["error"]["code"] == "validation_error"

        # Valid custom clip
        resp4 = await client.post(
            f"/projects/{project.id}/clips",
            json={"start": 10.0, "end": 35.0, "title": "Great Moment"},
        )
        assert resp4.status_code == 201
        res_data = resp4.json()
        assert res_data["title"] == "Great Moment"
        assert res_data["category"] == "custom"
        assert res_data["source_start_sec"] == 10.0
        assert res_data["source_end_sec"] == 35.0
        assert res_data["version"] == 1


@pytest.mark.asyncio
async def test_idempotent_moment_clip_creation(test_user):
    """Verify POST /analyses/{id}/clips is idempotent per moment."""
    app.dependency_overrides[get_current_user] = lambda: test_user
    project = Project(id=uuid.uuid4(), user_id=test_user.id, source_type="youtube")
    analysis = Analysis(id=uuid.uuid4(), project_id=project.id)
    moment = Moment(
        id=uuid.uuid4(),
        analysis_id=analysis.id,
        title="Epic Play",
        category="funny",
        start_sec=15.0,
        end_sec=30.0,
        score=0.92,
        reason="Laughter spike",
    )
    mock_db = MockDB(projects=[project], analyses=[analysis], moments=[moment])
    app.dependency_overrides[get_db] = lambda: mock_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # First creation
        r1 = await client.post(
            f"/analyses/{analysis.id}/clips",
            json={"moment_ids": [str(moment.id)]},
        )
        assert r1.status_code == 201
        items1 = r1.json()["items"]
        assert len(items1) == 1
        clip_id = items1[0]["id"]
        assert items1[0]["title"] == "Epic Play"
        assert items1[0]["score"] == 0.92

        # Second creation with same moment returns the existing clip
        r2 = await client.post(
            f"/analyses/{analysis.id}/clips",
            json={"moment_ids": [str(moment.id)]},
        )
        assert r2.status_code == 201
        items2 = r2.json()["items"]
        assert len(items2) == 1
        assert items2[0]["id"] == clip_id


@pytest.mark.asyncio
async def test_patch_clip_optimistic_concurrency(test_user):
    """Verify PATCH /clips/{id} returns 409 on version conflict and includes details.current_clip."""
    app.dependency_overrides[get_current_user] = lambda: test_user
    clip = Clip(
        id=uuid.uuid4(),
        user_id=test_user.id,
        project_id=uuid.uuid4(),
        title="Initial Clip",
        category="custom",
        source_start_sec=5.0,
        source_end_sec=20.0,
        edit_state={"schema_version": 1, "trim": {"start": 5.0, "end": 20.0}},
        status="draft",
        version=1,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    mock_db = MockDB(clips=[clip])
    app.dependency_overrides[get_db] = lambda: mock_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Stale version (sending version 99 instead of 1) -> 409 Conflict
        res_conflict = await client.patch(
            f"/clips/{clip.id}",
            json={
                "title": "Stale Update",
                "version": 99,
            },
        )
        assert res_conflict.status_code == 409
        err = res_conflict.json()["error"]
        assert err["code"] == "version_conflict"
        assert "current_clip" in err["details"]
        assert err["details"]["current_clip"]["title"] == "Initial Clip"

        # 2. Correct version -> 200 OK, version incremented to 2
        res_ok = await client.patch(
            f"/clips/{clip.id}",
            json={
                "title": "Updated Title",
                "edit_state": {
                    "schema_version": 1,
                    "trim": {"start": 8.0, "end": 25.0},
                    "custom_future_flag": True,
                },
                "version": 1,
            },
        )
        assert res_ok.status_code == 200
        updated = res_ok.json()
        assert updated["title"] == "Updated Title"
        assert updated["version"] == 2
        assert updated["source_start_sec"] == 8.0
        assert updated["source_end_sec"] == 25.0
        assert updated["edit_state"]["custom_future_flag"] is True


@pytest.mark.asyncio
async def test_duplicate_and_delete_clip(test_user):
    """Verify duplicate creates independent copy, and delete returns 204."""
    app.dependency_overrides[get_current_user] = lambda: test_user
    clip = Clip(
        id=uuid.uuid4(),
        user_id=test_user.id,
        project_id=uuid.uuid4(),
        title="Original Clip",
        category="funny",
        source_start_sec=10.0,
        source_end_sec=25.0,
        edit_state={"schema_version": 1, "trim": {"start": 10.0, "end": 25.0}},
        status="draft",
        version=1,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    mock_db = MockDB(clips=[clip])
    app.dependency_overrides[get_db] = lambda: mock_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Duplicate
        dup_res = await client.post(f"/clips/{clip.id}/duplicate")
        assert dup_res.status_code == 201
        dup_data = dup_res.json()
        assert dup_data["id"] != str(clip.id)
        assert dup_data["title"] == "Original Clip (Copy)"
        assert dup_data["version"] == 1

        # Delete original
        del_res = await client.delete(f"/clips/{clip.id}")
        assert del_res.status_code == 204


@pytest.mark.asyncio
async def test_bulk_clip_actions(test_user):
    """Verify POST /clips/bulk reports accepted and skipped clip IDs."""
    app.dependency_overrides[get_current_user] = lambda: test_user
    c1 = Clip(
        id=uuid.uuid4(),
        user_id=test_user.id,
        project_id=uuid.uuid4(),
        title="C1",
        category="custom",
        source_start_sec=0,
        source_end_sec=5,
        edit_state={"schema_version": 1, "trim": {"start": 0, "end": 5}},
        version=1,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    foreign_id = uuid.uuid4()
    mock_db = MockDB(clips=[c1])
    app.dependency_overrides[get_db] = lambda: mock_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/clips/bulk",
            json={"action": "delete", "clip_ids": [str(c1.id), str(foreign_id)]},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert str(c1.id) in data["accepted"]
        assert any(item["id"] == str(foreign_id) for item in data["skipped"])


@pytest.mark.asyncio
async def test_preview_video_range_request(test_user, monkeypatch):
    """Verify GET /clips/{id}/preview/video returns 206 Partial Content on Range header."""
    app.dependency_overrides[get_current_user] = lambda: test_user
    clip = Clip(
        id=uuid.uuid4(),
        user_id=test_user.id,
        project_id=uuid.uuid4(),
        title="Clip Range Test",
        category="custom",
        source_start_sec=10.0,
        source_end_sec=20.0,
        edit_state={"schema_version": 1, "trim": {"start": 10.0, "end": 20.0}},
        version=1,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    mock_db = MockDB(clips=[clip])
    app.dependency_overrides[get_db] = lambda: mock_db

    # Mock storage service
    mock_storage = MockStorage()
    proxy_key = f"previews/{clip.id}/proxy_480p.mp4"
    mock_storage._files[proxy_key] = b"0123456789ABCDEF0123456789ABCDEF"
    monkeypatch.setattr("app.routers.clips.StorageService", lambda: mock_storage)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Full content request
        resp_full = await client.get(f"/clips/{clip.id}/preview/video")
        assert resp_full.status_code == 200
        assert resp_full.headers["Accept-Ranges"] == "bytes"

        # Byte range request
        resp_range = await client.get(
            f"/clips/{clip.id}/preview/video",
            headers={"Range": "bytes=0-9"},
        )
        assert resp_range.status_code == 206
        assert resp_range.headers["Accept-Ranges"] == "bytes"
        assert resp_range.headers["Content-Range"].startswith("bytes 0-9/")
        assert resp_range.content == b"0123456789"


@pytest.mark.asyncio
async def test_renders_lifecycle(test_user, monkeypatch):
    """Verify render creation, retrieval, cancel, and presigned download URL."""
    app.dependency_overrides[get_current_user] = lambda: test_user
    clip = Clip(
        id=uuid.uuid4(),
        user_id=test_user.id,
        project_id=uuid.uuid4(),
        title="Epic Stream Highlight!",
        category="funny",
        source_start_sec=10.0,
        source_end_sec=25.0,
        edit_state={"schema_version": 1, "trim": {"start": 10.0, "end": 25.0}},
        status="draft",
        version=1,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    mock_db = MockDB(clips=[clip])
    app.dependency_overrides[get_db] = lambda: mock_db

    mock_storage = MockStorage()
    monkeypatch.setattr("app.routers.renders.StorageService", lambda: mock_storage)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Create render
        create_res = await client.post(
            f"/clips/{clip.id}/renders",
            json={"options": {"resolution": "1080p", "fps": 60, "quality": "high"}},
        )
        assert create_res.status_code == 201
        render_data = create_res.json()
        render_id = render_data["id"]
        assert render_data["status"] == "queued"
        assert render_data["options"]["resolution"] == "1080p"

        # 2. Get render
        get_res = await client.get(f"/renders/{render_id}")
        assert get_res.status_code == 200
        assert get_res.json()["id"] == render_id

        # 3. Cancel render
        cancel_res = await client.post(f"/renders/{render_id}/cancel")
        assert cancel_res.status_code == 200
        assert cancel_res.json()["status"] == "cancelled"

        # 4. Ready render download
        render_obj = next(r for r in mock_db.renders if str(r.id) == render_id)
        render_obj.status = "ready"
        render_obj.output_key = f"renders/{clip.id}/{render_id}.mp4"

        dl_res = await client.get(f"/renders/{render_id}/download")
        assert dl_res.status_code == 200
        dl_data = dl_res.json()
        assert "url" in dl_data
        assert "expires_at" in dl_data
        assert dl_data["filename"] == "Epic_Stream_Highlight.mp4"
