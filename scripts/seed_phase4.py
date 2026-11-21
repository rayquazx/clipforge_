"""
ClipForge Phase 4 Database & Storage Seeder.

Creates a complete end-to-end dataset:
- Demo user (demo@clipforge.tv / password123)
- Ready Project with metadata
- Analysis with Funny & Sad moments
- Ready Clip with full preview assets (proxy video, waveform, thumbnails)
- Finished 1080p Render ready for download
"""

from __future__ import annotations

import asyncio
import io
import json
import math
import os
import sys
import uuid
from datetime import datetime, timezone

from minio import Minio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

# Add apps/api to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "apps", "api")))

from app.config import get_settings
from app.models.analysis import Analysis, Moment
from app.models.base import Base
from app.models.clip import Clip
from app.models.project import Project
from app.models.render import Render
from app.models.source_media import SourceMedia
from app.models.user import User
from app.utils.security import get_password_hash


DEMO_USER_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")
DEMO_PROJECT_ID = uuid.UUID("22222222-2222-2222-2222-222222222222")
DEMO_ANALYSIS_ID = uuid.UUID("33333333-3333-3333-3333-333333333333")
DEMO_MOMENT_1_ID = uuid.UUID("44444444-4444-4444-4444-444444444441")
DEMO_MOMENT_2_ID = uuid.UUID("44444444-4444-4444-4444-444444444442")
DEMO_CLIP_ID = uuid.UUID("55555555-5555-5555-5555-555555555555")
DEMO_RENDER_ID = uuid.UUID("66666666-6666-6666-6666-666666666666")


def ensure_minio_assets(settings) -> None:
    """Upload fixture assets to MinIO if client is reachable."""
    try:
        client = Minio(
            endpoint=settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_USE_SSL,
        )
        if not client.bucket_exists(settings.MINIO_BUCKET):
            client.make_bucket(settings.MINIO_BUCKET)

        # 1. Preview Proxy Video (synthetic MP4 container bytes)
        proxy_key = f"previews/{DEMO_CLIP_ID}/proxy_480p.mp4"
        dummy_mp4 = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom\x00\x00\x00\x08free" + (b"\x00" * 1024)
        client.put_object(
            settings.MINIO_BUCKET,
            proxy_key,
            io.BytesIO(dummy_mp4),
            length=len(dummy_mp4),
            content_type="video/mp4",
        )

        # 2. Waveform peaks JSON
        waveform_key = f"previews/{DEMO_CLIP_ID}/waveform.json"
        duration = 35.0
        num_peaks = int(duration * 50)
        peaks = [round(0.2 + 0.6 * abs(math.sin(i * 0.1)), 3) for i in range(num_peaks)]
        waveform_data = {
            "peaks": peaks,
            "peaks_per_second": 50.0,
            "offset_sec": 25.0,
            "duration_sec": duration,
        }
        wf_bytes = json.dumps(waveform_data).encode("utf-8")
        client.put_object(
            settings.MINIO_BUCKET,
            waveform_key,
            io.BytesIO(wf_bytes),
            length=len(wf_bytes),
            content_type="application/json",
        )

        # 3. Thumbnails Sprite (minimal JPEG)
        thumb_sprite_key = f"previews/{DEMO_CLIP_ID}/thumbnails.jpg"
        dummy_jpg = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xff\xdb\x00C\x00\xff\xd9"
        client.put_object(
            settings.MINIO_BUCKET,
            thumb_sprite_key,
            io.BytesIO(dummy_jpg),
            length=len(dummy_jpg),
            content_type="image/jpeg",
        )

        # 4. Clip Thumbnail
        clip_thumb_key = f"thumbnails/{DEMO_CLIP_ID}/thumb.jpg"
        client.put_object(
            settings.MINIO_BUCKET,
            clip_thumb_key,
            io.BytesIO(dummy_jpg),
            length=len(dummy_jpg),
            content_type="image/jpeg",
        )

        # 5. Rendered Output Video
        render_key = f"renders/{DEMO_CLIP_ID}/{DEMO_RENDER_ID}.mp4"
        client.put_object(
            settings.MINIO_BUCKET,
            render_key,
            io.BytesIO(dummy_mp4),
            length=len(dummy_mp4),
            content_type="video/mp4",
        )

        print("[Seed] Successfully populated MinIO storage assets.")
    except Exception as exc:
        print(f"[Seed] Note: MinIO upload skipped ({exc}).")


async def seed_database() -> None:
    """Seed relational database with demo accounts, projects, clips, and renders."""
    settings = get_settings()
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with engine.begin() as conn:
        # Create tables if not present
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        # 1. Demo User
        user_res = await session.execute(select(User).where(User.email == "demo@clipforge.tv"))
        user = user_res.scalars().first()
        if not user:
            user = User(
                id=DEMO_USER_ID,
                email="demo@clipforge.tv",
                password_hash=get_password_hash("password123"),
                display_name="Demo Streamer",
            )
            session.add(user)
            await session.commit()
            print("[Seed] Created User: demo@clipforge.tv / password123")
        else:
            print("[Seed] Existing User found: demo@clipforge.tv")

        # 2. Demo Project
        proj_res = await session.execute(select(Project).where(Project.id == DEMO_PROJECT_ID))
        project = proj_res.scalars().first()
        if not project:
            project = Project(
                id=DEMO_PROJECT_ID,
                user_id=user.id,
                source_type="youtube",
                source_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                external_id="dQw4w9WgXcQ",
                title="Championship Finals Stream Highlight",
                channel_name="ProStreamer",
                duration_seconds=213,
                thumbnail_url="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
                status="ready",
                progress=100,
                mode="both",
            )
            session.add(project)
            await session.commit()
            print(f"[Seed] Created Project: {project.title}")

        # 3. Source Media
        sm_res = await session.execute(select(SourceMedia).where(SourceMedia.project_id == project.id))
        if not sm_res.scalars().first():
            source_media = SourceMedia(
                id=uuid.uuid4(),
                project_id=project.id,
                kind="video",
                storage_key=f"source_media/{project.id}/source.mp4",
                status="ready",
                width=1920,
                height=1080,
                duration_sec=213.0,
                format="mp4",
                last_used_at=datetime.now(timezone.utc),
            )
            session.add(source_media)
            await session.commit()

        # 4. Analysis & Moments
        ana_res = await session.execute(select(Analysis).where(Analysis.id == DEMO_ANALYSIS_ID))
        analysis = ana_res.scalars().first()
        if not analysis:
            analysis = Analysis(
                id=DEMO_ANALYSIS_ID,
                project_id=project.id,
                mode="both",
                min_clip_seconds=15,
                max_clip_seconds=60,
                status="completed",
                stage="finished",
                progress=100,
                finished_at=datetime.now(timezone.utc),
            )
            session.add(analysis)

            moment1 = Moment(
                id=DEMO_MOMENT_1_ID,
                analysis_id=analysis.id,
                start_sec=30.0,
                end_sec=55.0,
                category="funny",
                score=0.94,
                title="Insane 1v5 Clutch",
                reason="Sudden laughter and chat emote storm",
                transcript_excerpt="Oh my god look at this! No way, hahahaha!",
            )
            moment2 = Moment(
                id=DEMO_MOMENT_2_ID,
                analysis_id=analysis.id,
                start_sec=110.0,
                end_sec=140.0,
                category="sad",
                score=0.88,
                title="Heartbreaking Defeat",
                reason="Sudden silence and chat sadge emote spike",
                transcript_excerpt="I can't believe we lost like that...",
            )
            session.add_all([moment1, moment2])
            await session.commit()
            print("[Seed] Created Analysis with 2 moments.")

        # 5. Ready Clip
        clip_res = await session.execute(select(Clip).where(Clip.id == DEMO_CLIP_ID))
        clip = clip_res.scalars().first()
        if not clip:
            clip = Clip(
                id=DEMO_CLIP_ID,
                user_id=user.id,
                project_id=project.id,
                analysis_id=analysis.id,
                moment_id=DEMO_MOMENT_1_ID,
                title="Insane 1v5 Clutch",
                category="funny",
                source_start_sec=30.0,
                source_end_sec=55.0,
                edit_state={
                    "schema_version": 1,
                    "trim": {"start": 30.0, "end": 55.0},
                },
                status="ready",
                thumbnail_key=f"thumbnails/{DEMO_CLIP_ID}/thumb.jpg",
                score=0.94,
                reason="Sudden laughter and chat emote storm",
                version=1,
            )
            session.add(clip)
            await session.commit()
            print(f"[Seed] Created Ready Clip: {clip.title}")

        # 6. Finished Render
        render_res = await session.execute(select(Render).where(Render.id == DEMO_RENDER_ID))
        render = render_res.scalars().first()
        if not render:
            render = Render(
                id=DEMO_RENDER_ID,
                clip_id=clip.id,
                status="ready",
                progress=100,
                options={
                    "resolution": "1080p",
                    "fps": 60,
                    "quality": "high",
                    "filename": "insane_clutch.mp4",
                },
                output_key=f"renders/{clip.id}/{DEMO_RENDER_ID}.mp4",
                file_size=15485760,
                duration_sec=25.0,
                width=1920,
                height=1080,
                finished_at=datetime.now(timezone.utc),
            )
            session.add(render)
            await session.commit()
            print(f"[Seed] Created Finished Render: {render.id}")

    await engine.dispose()
    ensure_minio_assets(settings)
    print("\n==================================================================")
    print(" ClipForge Phase 4 Seed Complete!")
    print(" Credentials: demo@clipforge.tv / password123")
    print(f" Demo Project ID: {DEMO_PROJECT_ID}")
    print(f" Demo Clip ID:    {DEMO_CLIP_ID}")
    print(f" Demo Render ID:  {DEMO_RENDER_ID}")
    print("==================================================================\n")


if __name__ == "__main__":
    asyncio.run(seed_database())
