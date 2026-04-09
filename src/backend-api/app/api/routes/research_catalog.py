from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps.auth import CurrentUserContext, get_current_user
from app.db.session import get_db
from app.models import ModelConfig
from app.models.enums import ObjectType, SceneType
from app.schemas.research import (
    ResearchModelOptionListResponse,
    ResearchModelOptionResponse,
)

router = APIRouter(prefix="/research", tags=["research"])


OBJECT_TYPE_TO_SCENE = {
    ObjectType.COMPANY: SceneType.COMPANY_RESEARCH.value,
    ObjectType.STOCK: SceneType.STOCK_RESEARCH.value,
    ObjectType.COMMODITY: SceneType.COMMODITY_RESEARCH.value,
}


def serialize_model_option(model: ModelConfig) -> ResearchModelOptionResponse:
    return ResearchModelOptionResponse(
        id=model.id,
        provider_code=model.provider_code,
        model_name=model.model_name,
        display_name=model.display_name,
        scene_type=model.scene_type,
        is_default=model.is_default,
    )


@router.get("/models", response_model=ResearchModelOptionListResponse)
def list_research_models(
    object_type: ObjectType | None = Query(default=None),
    _: CurrentUserContext = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResearchModelOptionListResponse:
    statement = select(ModelConfig).where(ModelConfig.is_enabled.is_(True))

    if object_type is not None:
        scene_type = OBJECT_TYPE_TO_SCENE[object_type]
        statement = statement.where(
            ModelConfig.scene_type.in_([SceneType.GENERAL.value, scene_type])
        )

    items = db.scalars(
        statement.order_by(
            ModelConfig.is_default.desc(),
            ModelConfig.updated_at.desc(),
            ModelConfig.id.desc(),
        )
    ).all()

    return ResearchModelOptionListResponse(
        items=[serialize_model_option(item) for item in items],
        total=len(items),
    )
