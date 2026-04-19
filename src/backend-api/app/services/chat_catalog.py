from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ModelConfig, SourceConfig
from app.models.enums import ObjectType, SceneType, SourceType

CHAT_MODE_CHAT = "CHAT"
CHAT_MODE_AUTO = "AUTO"
CHAT_MODE_SOURCE_FIRST = "SOURCE_FIRST"
CHAT_MODE_WEB_FALLBACK = "WEB_FALLBACK"
SUPPORTED_CHAT_PROVIDERS = {"gemini"}

OBJECT_TYPE_TO_SCENE = {
    ObjectType.COMPANY.value: SceneType.COMPANY_RESEARCH.value,
    ObjectType.STOCK.value: SceneType.STOCK_RESEARCH.value,
    ObjectType.COMMODITY.value: SceneType.COMMODITY_RESEARCH.value,
}


@dataclass(frozen=True)
class ChatModelOption:
    value: str
    provider_code: str
    model_name: str
    display_name: str
    scene_type: str
    is_default: bool


@dataclass(frozen=True)
class ChatSourceOption:
    source_code: str
    source_name: str
    object_type: str
    source_type: str
    authority_level: str
    priority_weight: float
    base_url: str | None


@dataclass(frozen=True)
class ChatModeOption:
    code: str
    label: str
    description: str
    is_available: bool
    availability_note: str | None = None


def build_model_value(provider_code: str, model_name: str) -> str:
    return f"{provider_code}:{model_name}"


def split_model_value(model_value: str | None) -> tuple[str | None, str | None]:
    if not model_value:
        return None, None

    normalized = model_value.strip()
    if not normalized:
        return None, None

    if ":" not in normalized:
        return None, normalized

    provider_code, model_name = normalized.split(":", 1)
    return provider_code.strip() or None, model_name.strip() or None


def list_chat_models(
    db: Session,
    *,
    object_type: str | None,
) -> list[ChatModelOption]:
    statement = select(ModelConfig).where(
        ModelConfig.is_enabled.is_(True),
        ModelConfig.provider_code.in_(SUPPORTED_CHAT_PROVIDERS),
    )

    if object_type:
        scene_type = OBJECT_TYPE_TO_SCENE.get(object_type)
        if scene_type:
            statement = statement.where(
                ModelConfig.scene_type.in_([SceneType.GENERAL.value, scene_type])
            )
        else:
            statement = statement.where(ModelConfig.scene_type == SceneType.GENERAL.value)
    else:
        statement = statement.where(ModelConfig.scene_type == SceneType.GENERAL.value)

    models = db.scalars(
        statement.order_by(
            ModelConfig.is_default.desc(),
            ModelConfig.updated_at.desc(),
            ModelConfig.id.desc(),
        )
    ).all()

    return [
        ChatModelOption(
            value=build_model_value(model.provider_code, model.model_name),
            provider_code=model.provider_code,
            model_name=model.model_name,
            display_name=model.display_name,
            scene_type=model.scene_type,
            is_default=model.is_default,
        )
        for model in models
    ]


def list_chat_sources(
    db: Session,
    *,
    object_type: str | None,
) -> list[ChatSourceOption]:
    statement = select(SourceConfig).where(SourceConfig.is_enabled.is_(True))
    if object_type:
        statement = statement.where(SourceConfig.object_type == object_type)

    sources = db.scalars(
        statement.order_by(
            SourceConfig.priority_weight.desc(),
            SourceConfig.updated_at.desc(),
            SourceConfig.id.desc(),
        )
    ).all()

    return [
        ChatSourceOption(
            source_code=source.source_code,
            source_name=source.source_name,
            object_type=source.object_type,
            source_type=source.source_type,
            authority_level=source.authority_level,
            priority_weight=float(source.priority_weight),
            base_url=source.base_url,
        )
        for source in sources
    ]


def has_web_fallback_source(
    db: Session,
    *,
    object_type: str | None,
) -> bool:
    statement = select(SourceConfig).where(
        SourceConfig.is_enabled.is_(True),
        SourceConfig.source_type == SourceType.WEB.value,
    )
    if object_type:
        statement = statement.where(SourceConfig.object_type == object_type)
    return db.scalars(statement.limit(1)).first() is not None


def build_chat_mode_options(
    *,
    object_type: str | None,
    web_fallback_ready: bool,
) -> list[ChatModeOption]:
    source_first_label = "数据源优先"
    source_first_description = "优先查已接入的数据源，再让 AI 组织答案。"
    if object_type == ObjectType.STOCK.value:
        source_first_label = "股票数据优先"
        source_first_description = "优先查询已接入的股票数据源，再由 AI 生成回答。"

    modes = [
        ChatModeOption(
            code=CHAT_MODE_CHAT,
            label="纯聊天",
            description="直接调用模型回答，不使用本地数据源。",
            is_available=True,
        ),
        ChatModeOption(
            code=CHAT_MODE_AUTO,
            label="自动模式",
            description="能命中本地数据源时优先使用数据源，否则退回普通聊天。",
            is_available=True,
        ),
        ChatModeOption(
            code=CHAT_MODE_SOURCE_FIRST,
            label=source_first_label,
            description=source_first_description,
            is_available=True,
        ),
        ChatModeOption(
            code=CHAT_MODE_WEB_FALLBACK,
            label="联网兜底",
            description="数据源不足时再接入联网检索后回答。",
            is_available=web_fallback_ready,
            availability_note=(
                None if web_fallback_ready else "当前还没有接入可用的联网检索源。"
            ),
        ),
    ]
    return modes


def resolve_chat_model(
    db: Session,
    *,
    model_value: str | None,
    object_type: str | None,
) -> ModelConfig:
    provider_code, model_name = split_model_value(model_value)

    if model_name:
        statement = select(ModelConfig).where(
            ModelConfig.is_enabled.is_(True),
            ModelConfig.model_name == model_name,
            ModelConfig.provider_code.in_(SUPPORTED_CHAT_PROVIDERS),
        )
        if provider_code:
            statement = statement.where(ModelConfig.provider_code == provider_code)

        scene_type = OBJECT_TYPE_TO_SCENE.get(object_type or "")
        if scene_type:
            statement = statement.where(
                ModelConfig.scene_type.in_([SceneType.GENERAL.value, scene_type])
            )

        model = db.scalars(
            statement.order_by(
                ModelConfig.is_default.desc(),
                ModelConfig.updated_at.desc(),
                ModelConfig.id.desc(),
            )
        ).first()
        if model is not None:
            return model

    default_statement = select(ModelConfig).where(
        ModelConfig.is_enabled.is_(True),
        ModelConfig.is_default.is_(True),
        ModelConfig.provider_code.in_(SUPPORTED_CHAT_PROVIDERS),
    )
    scene_type = OBJECT_TYPE_TO_SCENE.get(object_type or "")
    if scene_type:
        default_statement = default_statement.where(
            ModelConfig.scene_type.in_([SceneType.GENERAL.value, scene_type])
        )

    default_model = db.scalars(
        default_statement.order_by(ModelConfig.updated_at.desc(), ModelConfig.id.desc())
    ).first()
    if default_model is not None:
        return default_model

    fallback_statement = select(ModelConfig).where(
        ModelConfig.is_enabled.is_(True),
        ModelConfig.provider_code.in_(SUPPORTED_CHAT_PROVIDERS),
    )
    if scene_type:
        fallback_statement = fallback_statement.where(
            ModelConfig.scene_type.in_([SceneType.GENERAL.value, scene_type])
        )

    fallback_model = db.scalars(
        fallback_statement.order_by(
            ModelConfig.updated_at.desc(),
            ModelConfig.id.desc(),
        )
    ).first()
    if fallback_model is None:
        raise RuntimeError("No enabled chat model is available.")

    return fallback_model
