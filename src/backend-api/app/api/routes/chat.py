from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps.auth import CurrentUserContext, get_current_user
from app.core.config import get_settings
from app.db.session import get_db
from app.schemas.chat import (
    ChatCitationResponse,
    ChatCompletionRequest,
    ChatCompletionResponse,
    ChatModeOptionResponse,
    ChatModelOptionResponse,
    ChatObjectType,
    ChatOptionsResponse,
    ChatSourceOptionResponse,
)
from app.services.chat_catalog import (
    CHAT_MODE_AUTO,
    build_chat_mode_options,
    list_chat_models,
    list_chat_sources,
)
from app.services.chat_orchestrator import orchestrate_chat_completion

router = APIRouter(prefix="/chat", tags=["chat"])

DEFAULT_SYSTEM_PROMPT = (
    "你是商业对象智能深度调研分析平台中的基础聊天助手。"
    "默认使用中文回答，表达清晰、简洁、可靠。"
    "如果用户问到股票，请在没有实时数据时明确说明，不要编造实时行情。"
)


def is_placeholder_key(value: str | None) -> bool:
    if not value:
        return True
    normalized = value.strip()
    return normalized in {
        "",
        "replace-with-your-gemini-api-key",
    }


@router.get("/options", response_model=ChatOptionsResponse)
def get_chat_options(
    object_type: ChatObjectType | None = Query(default="STOCK"),
    _: CurrentUserContext = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChatOptionsResponse:
    settings = get_settings()
    normalized_object_type = object_type or "STOCK"
    models = list_chat_models(db, object_type=normalized_object_type)
    sources = list_chat_sources(db, object_type=normalized_object_type)
    web_fallback_ready = (
        settings.gemini_google_search_enabled
        and not is_placeholder_key(settings.gemini_api_key)
    )
    modes = build_chat_mode_options(
        object_type=normalized_object_type,
        web_fallback_ready=web_fallback_ready,
    )

    return ChatOptionsResponse(
        models=[
            ChatModelOptionResponse(
                value=item.value,
                provider_code=item.provider_code,
                model_name=item.model_name,
                display_name=item.display_name,
                scene_type=item.scene_type,
                is_default=item.is_default,
            )
            for item in models
        ],
        modes=[
            ChatModeOptionResponse(
                code=item.code,
                label=item.label,
                description=item.description,
                is_available=item.is_available,
                availability_note=item.availability_note,
            )
            for item in modes
        ],
        sources=[
            ChatSourceOptionResponse(
                source_code=item.source_code,
                source_name=item.source_name,
                object_type=item.object_type,
                source_type=item.source_type,
                authority_level=item.authority_level,
                priority_weight=item.priority_weight,
                base_url=item.base_url,
            )
            for item in sources
        ],
        default_model=models[0].value if models else None,
        default_mode=CHAT_MODE_AUTO,
        web_fallback_ready=web_fallback_ready,
    )


@router.post("/completions", response_model=ChatCompletionResponse)
def create_chat_completion(
    payload: ChatCompletionRequest,
    _: CurrentUserContext = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChatCompletionResponse:
    settings = get_settings()
    if is_placeholder_key(settings.gemini_api_key):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Gemini API key is not configured correctly. "
                "Please set a real GEMINI_API_KEY in src/.env and restart backend-api."
            ),
        )

    try:
        result = orchestrate_chat_completion(
            settings=settings,
            db=db,
            model_value=payload.model or settings.gemini_model_name,
            messages=payload.messages,
            answer_mode=payload.answer_mode,
            object_type=payload.object_type,
            system_prompt=(payload.system_prompt or DEFAULT_SYSTEM_PROMPT).strip(),
            include_citations=payload.include_citations,
            allow_web_fallback=payload.allow_web_fallback,
        )
    except RuntimeError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(error),
        ) from error

    return ChatCompletionResponse(
        reply=result.reply,
        model=result.model,
        provider=result.provider,
        answer_mode=result.answer_mode,
        grounding_status=result.grounding_status,
        citations=[
            ChatCitationResponse(
                source_id=item.source_id,
                title=item.title,
                source_name=item.source_name,
                source_url=item.source_url,
                published_at=item.published_at,
                authority_level=item.authority_level,
            )
            for item in result.citations
        ],
        used_source_codes=result.used_source_codes,
        note=result.note,
    )
