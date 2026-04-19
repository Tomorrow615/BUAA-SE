from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


ChatAnswerMode = Literal["CHAT", "AUTO", "SOURCE_FIRST", "WEB_FALLBACK"]
ChatObjectType = Literal["STOCK", "COMPANY", "COMMODITY"]


class ChatMessageRequest(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=8000)


class ChatCompletionRequest(BaseModel):
    messages: list[ChatMessageRequest] = Field(min_length=1, max_length=40)
    model: str | None = Field(default=None, min_length=3, max_length=160)
    system_prompt: str | None = Field(default=None, max_length=4000)
    answer_mode: ChatAnswerMode = "AUTO"
    object_type: ChatObjectType | None = None
    include_citations: bool = True
    allow_web_fallback: bool = False


class ChatCitationResponse(BaseModel):
    source_id: str
    title: str
    source_name: str
    source_url: str | None
    published_at: datetime | None
    authority_level: str


class ChatCompletionResponse(BaseModel):
    reply: str
    model: str
    provider: str = "gemini"
    answer_mode: str
    grounding_status: str
    citations: list[ChatCitationResponse] = Field(default_factory=list)
    used_source_codes: list[str] = Field(default_factory=list)
    note: str | None = None


class ChatModelOptionResponse(BaseModel):
    value: str
    provider_code: str
    model_name: str
    display_name: str
    scene_type: str
    is_default: bool


class ChatSourceOptionResponse(BaseModel):
    source_code: str
    source_name: str
    object_type: str
    source_type: str
    authority_level: str
    priority_weight: float
    base_url: str | None


class ChatModeOptionResponse(BaseModel):
    code: str
    label: str
    description: str
    is_available: bool
    availability_note: str | None = None


class ChatOptionsResponse(BaseModel):
    models: list[ChatModelOptionResponse]
    modes: list[ChatModeOptionResponse]
    sources: list[ChatSourceOptionResponse]
    default_model: str | None
    default_mode: str
    web_fallback_ready: bool
