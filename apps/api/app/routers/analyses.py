"""
ClipForge API — Analyses, Moments, and Signals Router.

Endpoints for triggering AI moment detection, retrieving ranked clips,
streaming SSE progress, fetching timeline signals for Recharts, and cancelling.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from typing import AsyncGenerator, List, Optional

import redis.asyncio as aioredis
from celery import Celery
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.analysis import Analysis, Moment, SignalWindow
from app.models.project import Project
from app.models.user import User
from app.schemas.analysis import (
    AnalysisCreateRequest,
    AnalysisResponse,
    MomentResponse,
    SignalWindowResponse,
)

router = APIRouter(tags=["analyses"])
settings = get_settings()

celery_client = Celery("clipforge", broker=settings.REDIS_URL)


async def _get_project_with_ownership_check(
    project_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession
) -> Project:
    res = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user_id)
    )
    project = res.scalars().first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found or access denied.",
        )
    return project


async def _get_analysis_with_ownership_check(
    analysis_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession
) -> Analysis:
    res = await db.execute(
        select(Analysis)
        .join(Project, Analysis.project_id == Project.id)
        .where(Analysis.id == analysis_id, Project.user_id == user_id)
    )
    analysis = res.scalars().first()
    if not analysis:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Analysis not found or access denied.",
        )
    return analysis


# ---------------------------------------------------------------------------
# Project-scoped Analysis Endpoints
# ---------------------------------------------------------------------------
@router.post(
    "/projects/{project_id}/analyses",
    response_model=AnalysisResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Start a new moment detection analysis run",
)
async def create_analysis(
    project_id: uuid.UUID,
    payload: AnalysisCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AnalysisResponse:
    project = await _get_project_with_ownership_check(project_id, current_user.id, db)

    analysis = Analysis(
        project_id=project.id,
        mode=payload.mode.lower(),
        min_clip_seconds=payload.min_clip_seconds,
        max_clip_seconds=payload.max_clip_seconds,
        max_clips=payload.max_clips,
        language=payload.language or "auto",
        status="queued",
        stage="queued",
        progress=0,
    )
    db.add(analysis)
    await db.commit()
    await db.refresh(analysis)

    # Enqueue Celery task
    try:
        celery_client.send_task("analyze.pipeline", args=[str(analysis.id)])
    except Exception:
        pass

    return AnalysisResponse.model_validate(analysis)


@router.get(
    "/projects/{project_id}/analyses",
    response_model=List[AnalysisResponse],
    summary="List all analysis runs for a project",
)
async def list_project_analyses(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[AnalysisResponse]:
    await _get_project_with_ownership_check(project_id, current_user.id, db)

    res = await db.execute(
        select(Analysis)
        .where(Analysis.project_id == project_id)
        .order_by(desc(Analysis.created_at))
    )
    analyses = res.scalars().all()
    out = []
    for a in analyses:
        item = AnalysisResponse.model_validate(a)
        item.moments_count = len(a.moments)
        out.append(item)
    return out


# ---------------------------------------------------------------------------
# Individual Analysis Endpoints
# ---------------------------------------------------------------------------
@router.get(
    "/analyses/{analysis_id}",
    response_model=AnalysisResponse,
    summary="Get status and details of an analysis run",
)
async def get_analysis(
    analysis_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AnalysisResponse:
    analysis = await _get_analysis_with_ownership_check(analysis_id, current_user.id, db)
    resp = AnalysisResponse.model_validate(analysis)
    resp.moments_count = len(analysis.moments)
    return resp


@router.get(
    "/analyses/{analysis_id}/moments",
    response_model=List[MomentResponse],
    summary="Get ranked clips/moments for an analysis",
)
async def get_analysis_moments(
    analysis_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[MomentResponse]:
    await _get_analysis_with_ownership_check(analysis_id, current_user.id, db)

    res = await db.execute(
        select(Moment)
        .where(Moment.analysis_id == analysis_id)
        .order_by(desc(Moment.score))
    )
    moments = res.scalars().all()
    return [MomentResponse.model_validate(m) for m in moments]


@router.get(
    "/analyses/{analysis_id}/signals",
    response_model=List[SignalWindowResponse],
    summary="Get signal timeline windows for charts",
)
async def get_analysis_signals(
    analysis_id: uuid.UUID,
    downsample: int = Query(1, ge=1, le=10, description="Downsample step factor"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[SignalWindowResponse]:
    await _get_analysis_with_ownership_check(analysis_id, current_user.id, db)

    res = await db.execute(
        select(SignalWindow)
        .where(SignalWindow.analysis_id == analysis_id)
        .order_by(SignalWindow.start_sec.asc())
    )
    windows = res.scalars().all()

    if downsample > 1 and len(windows) > 100:
        windows = windows[::downsample]

    return [SignalWindowResponse.model_validate(w) for w in windows]


@router.post(
    "/analyses/{analysis_id}/cancel",
    response_model=AnalysisResponse,
    summary="Cancel a running analysis",
)
async def cancel_analysis(
    analysis_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AnalysisResponse:
    analysis = await _get_analysis_with_ownership_check(analysis_id, current_user.id, db)

    if analysis.status in ("ready", "failed", "cancelled"):
        return AnalysisResponse.model_validate(analysis)

    # Set cancellation signal in Redis
    r = aioredis.from_url(settings.REDIS_URL)
    await r.set(f"analysis_cancel:{analysis_id}", "1", ex=3600)
    await r.close()

    analysis.status = "cancelled"
    analysis.stage = "cancelled"
    analysis.error_message = "Analysis cancelled by user."
    await db.commit()
    await db.refresh(analysis)

    return AnalysisResponse.model_validate(analysis)


@router.delete(
    "/analyses/{analysis_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete an analysis run and its generated moments",
)
async def delete_analysis(
    analysis_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    analysis = await _get_analysis_with_ownership_check(analysis_id, current_user.id, db)
    await db.delete(analysis)
    await db.commit()
    return {"deleted": True, "id": str(analysis_id)}


@router.get(
    "/analyses/{analysis_id}/events",
    summary="Server-Sent Events (SSE) for analysis progress",
)
async def analysis_events(
    analysis_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    analysis = await _get_analysis_with_ownership_check(analysis_id, current_user.id, db)

    async def event_generator() -> AsyncGenerator[str, None]:
        # Send initial state
        initial = {
            "type": "initial_state",
            "analysis_id": str(analysis.id),
            "status": analysis.status,
            "stage": analysis.stage,
            "progress": analysis.progress,
            "error_message": analysis.error_message,
        }
        yield f"data: {json.dumps(initial)}\n\n"

        if analysis.status in ("ready", "failed", "cancelled"):
            return

        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        pubsub = r.pubsub()
        channel = f"analysis_events:{analysis_id}"
        await pubsub.subscribe(channel)

        try:
            while True:
                msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if msg and msg.get("type") == "message":
                    data = msg.get("data")
                    yield f"data: {data}\n\n"

                    try:
                        parsed = json.loads(data)
                        if parsed.get("status") in ("ready", "failed", "cancelled"):
                            break
                    except Exception:
                        pass
                await asyncio.sleep(0.5)
        except asyncio.CancelledError:
            pass
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.close()
            await r.close()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
