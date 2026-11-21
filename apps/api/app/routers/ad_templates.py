"""
ClipForge API — Ad Templates Router (Phase 6).

Endpoints for creating, managing, and applying reusable ad placement templates.
"""

from __future__ import annotations

import logging
from typing import Any, List
import uuid

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.ad_asset import AdAsset
from app.models.ad_template import AdTemplate
from app.models.clip import Clip
from app.models.user import User
from app.schemas.ad import (
    AdPlacement,
    AdTemplateCreateRequest,
    AdTemplateResponse,
    AdTemplateUpdateRequest,
    ApplyTemplateRequest,
)
from app.schemas.clip import ClipResponse
from app.utils.errors import NotFoundError, ValidationError

logger = logging.getLogger(__name__)

router = APIRouter(tags=["ad-templates"])


async def _validate_assets_exist_and_owned(
    asset_ids: List[uuid.UUID], user_id: uuid.UUID, db: AsyncSession
) -> None:
    """Verify that all referenced asset IDs exist and belong to the user."""
    if not asset_ids:
        return

    unique_ids = list(set(asset_ids))
    query = select(AdAsset).where(AdAsset.id.in_(unique_ids), AdAsset.user_id == user_id)
    existing = (await db.execute(query)).scalars().all()
    found_ids = {a.id for a in existing}

    missing = [str(aid) for aid in unique_ids if aid not in found_ids]
    if missing:
        raise ValidationError(
            f"Referenced ad asset(s) not found or not owned by user: {', '.join(missing)}"
        )


@router.get("/ad-templates", response_model=List[AdTemplateResponse])
async def list_ad_templates(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[AdTemplateResponse]:
    """List all ad templates owned by the current user."""
    query = select(AdTemplate).where(AdTemplate.user_id == current_user.id).order_by(AdTemplate.created_at)
    templates = (await db.execute(query)).scalars().all()
    return [AdTemplateResponse.model_validate(t) for t in templates]


@router.post("/ad-templates", response_model=AdTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_ad_template(
    payload: AdTemplateCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AdTemplateResponse:
    """Create a new reusable ad placement template."""
    asset_ids = [p.ad_asset_id for p in payload.placements]
    await _validate_assets_exist_and_owned(asset_ids, current_user.id, db)

    placements_data = [p.model_dump(mode="json") for p in payload.placements]
    template = AdTemplate(
        id=uuid.uuid4(),
        user_id=current_user.id,
        name=payload.name,
        placements=placements_data,
        usage_count=0,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return AdTemplateResponse.model_validate(template)


@router.patch("/ad-templates/{id}", response_model=AdTemplateResponse)
async def update_ad_template(
    id: uuid.UUID,
    payload: AdTemplateUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AdTemplateResponse:
    """Update name or placements for an existing ad template."""
    query = select(AdTemplate).where(AdTemplate.id == id, AdTemplate.user_id == current_user.id)
    template = (await db.execute(query)).scalar_one_or_none()

    if not template:
        raise NotFoundError("Ad template not found.")

    if payload.name is not None:
        template.name = payload.name

    if payload.placements is not None:
        asset_ids = [p.ad_asset_id for p in payload.placements]
        await _validate_assets_exist_and_owned(asset_ids, current_user.id, db)
        template.placements = [p.model_dump(mode="json") for p in payload.placements]

    await db.commit()
    await db.refresh(template)
    return AdTemplateResponse.model_validate(template)


@router.delete("/ad-templates/{id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def delete_ad_template(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Delete an ad template."""
    query = select(AdTemplate).where(AdTemplate.id == id, AdTemplate.user_id == current_user.id)
    template = (await db.execute(query)).scalar_one_or_none()

    if not template:
        raise NotFoundError("Ad template not found.")

    await db.delete(template)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/clips/{id}/ads/apply-template", response_model=ClipResponse)
async def apply_ad_template_to_clip(
    id: uuid.UUID,
    payload: ApplyTemplateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ClipResponse:
    """
    Apply an ad template to a clip's edit_state.
    Generates unique placement IDs, validates asset ownership, and bumps clip version.
    """
    clip_query = select(Clip).where(Clip.id == id, Clip.user_id == current_user.id)
    clip = (await db.execute(clip_query)).scalar_one_or_none()
    if not clip:
        raise NotFoundError("Clip not found.")

    template_query = select(AdTemplate).where(
        AdTemplate.id == payload.template_id, AdTemplate.user_id == current_user.id
    )
    template = (await db.execute(template_query)).scalar_one_or_none()
    if not template:
        raise NotFoundError("Ad template not found.")

    # Validate that assets in the template exist
    template_placements = template.placements or []
    asset_ids = [uuid.UUID(str(p["ad_asset_id"])) for p in template_placements if "ad_asset_id" in p]
    await _validate_assets_exist_and_owned(asset_ids, current_user.id, db)

    # Instantiate placements with new unique IDs
    new_placements = []
    for item in template_placements:
        p_dict = dict(item)
        p_dict["id"] = str(uuid.uuid4())
        # Validate through AdPlacement schema
        placement = AdPlacement.model_validate(p_dict)
        new_placements.append(placement.model_dump(mode="json"))

    edit_state = dict(clip.edit_state or {})
    if payload.mode == "replace":
        edit_state["ads"] = new_placements
    else:  # append
        existing = edit_state.get("ads", [])
        edit_state["ads"] = existing + new_placements

    clip.edit_state = edit_state
    clip.version += 1
    template.usage_count += 1

    # Increment usage counts on the assets
    for aid in set(asset_ids):
        asset = (await db.execute(select(AdAsset).where(AdAsset.id == aid))).scalar_one_or_none()
        if asset:
            asset.usage_count += 1

    await db.commit()
    await db.refresh(clip)
    return ClipResponse.model_validate(clip)
