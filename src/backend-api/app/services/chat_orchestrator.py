from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import re
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.enums import ObjectType
from app.services.chat_catalog import (
    CHAT_MODE_AUTO,
    CHAT_MODE_CHAT,
    CHAT_MODE_SOURCE_FIRST,
    CHAT_MODE_WEB_FALLBACK,
    resolve_chat_model,
)
from app.services.gemini_api import (
    build_google_search_tool,
    build_text_content,
    call_gemini_generate_content,
    call_gemini_generate_content_raw,
    extract_grounding_sources,
    extract_text_from_response,
)
from app.services.stock_market import (
    build_stock_material_payloads,
    collect_stock_research_bundle,
    load_stock_directory,
    parse_lookback_days,
)

DEFAULT_CHAT_SYSTEM_PROMPT = (
    "你是商业对象智能深度调研分析平台中的基础聊天助手。"
    "默认使用中文回答，表达清晰、简洁、可靠。"
)

DEFAULT_GROUNDED_SYSTEM_PROMPT = (
    "你是商业对象智能深度调研分析平台中的数据问答助手。"
    "当回答涉及事实、数据、近期走势时，必须优先使用提供的材料，不能编造实时数据。"
    "默认使用中文 Markdown 回答。"
)

DEFAULT_WEB_GROUNDED_SYSTEM_PROMPT = (
    "你是商业对象智能深度调研分析平台中的联网问答助手。"
    "请优先引用 Google Search grounding 返回的公开来源。"
    "默认使用中文 Markdown 回答，避免编造实时信息。"
)

STOCK_CODE_PATTERN = re.compile(r"(?<!\d)(\d{6})(?:\.(?:SH|SZ|BJ))?(?!\d)", re.IGNORECASE)


@dataclass(frozen=True)
class ChatCitation:
    source_id: str
    title: str
    source_name: str
    source_url: str | None
    published_at: datetime | None
    authority_level: str


@dataclass(frozen=True)
class OrchestratedChatResult:
    reply: str
    model: str
    provider: str
    answer_mode: str
    grounding_status: str
    citations: list[ChatCitation]
    used_source_codes: list[str]
    note: str | None


def to_gemini_role(role: str) -> str:
    if role == "assistant":
        return "model"
    return "user"


def build_plain_contents(messages: list[Any]) -> list[dict[str, Any]]:
    return [
        build_text_content(to_gemini_role(message.role), message.content.strip())
        for message in messages
        if message.content.strip()
    ]


def build_web_grounded_prompt(question: str) -> str:
    return (
        "请直接回答下面的用户问题，并在需要时使用 Google Search grounding 联网检索。\n"
        "要求：\n"
        "1. 默认使用中文 Markdown。\n"
        "2. 不要解释自己是否调用了工具，不要输出无关前言。\n"
        "3. 如果信息具有时效性，请明确写出具体日期或“最近一个交易日”等时间表述。\n"
        "4. 如果使用了公开来源，请在回答末尾增加 `## 引用` 小节。\n\n"
        f"用户问题：{question}"
    )


def find_last_user_message(messages: list[Any]) -> str:
    for message in reversed(messages):
        if message.role == "user" and message.content.strip():
            return message.content.strip()
    return ""


def detect_stock_query_from_text(question: str) -> str | None:
    normalized = question.strip()
    if not normalized:
        return None

    match = STOCK_CODE_PATTERN.search(normalized)
    if match is not None:
        return match.group(1)

    lowered = normalized.casefold()
    for entry in load_stock_directory():
        stock_name = entry.name.strip()
        if stock_name and stock_name.casefold() in lowered:
            return stock_name

    return None


def build_grounded_prompt(
    *,
    question: str,
    stock_name: str,
    stock_symbol: str,
    lookback_days: int,
    materials: list[dict[str, Any]],
    include_citations: bool,
) -> str:
    material_blocks = []
    for item in materials:
        source_id = str(item.get("topic_tag") or "SRC_UNKNOWN")
        material_blocks.append(
            "\n".join(
                [
                    f"[{source_id}] {item.get('title') or 'Untitled'}",
                    f"source_name: {item.get('source_name') or 'Unknown'}",
                    f"published_at: {item.get('published_at') or 'unknown'}",
                    f"source_url: {item.get('source_url') or 'unknown'}",
                    f"summary: {item.get('summary') or 'N/A'}",
                    f"content: {item.get('content_text') or 'N/A'}",
                ]
            )
        )

    citation_rule = ""
    if include_citations:
        citation_rule = (
            "3. 每个涉及事实、数字、走势判断的句子后，都尽量补上来源编号，例如 [SRC_001]。\n"
            "4. 最后单独追加一个 `## 引用` 小节，列出本次实际引用到的来源编号与标题。\n"
        )

    materials_text = "\n\n".join(material_blocks)
    return (
        f"用户问题：{question}\n"
        f"目标对象：{stock_name} ({stock_symbol})\n"
        f"观察区间：近 {lookback_days} 天\n\n"
        "请基于下面给出的材料直接回答用户问题，并遵守以下规则：\n"
        "1. 默认使用中文 Markdown 回答，先直接回答问题，再给出必要分析。\n"
        "2. 只能把下面材料里的事实当作近期/实时依据，不能编造未提供的数据。\n"
        f"{citation_rule}"
        "5. 如果材料不够支撑问题里的某一部分，要明确写出“信息不足”。\n"
        "6. 回答风格保持简洁，不要输出 JSON。\n\n"
        f"材料如下：\n{materials_text}"
    )


def build_citations(materials: list[dict[str, Any]]) -> list[ChatCitation]:
    citations: list[ChatCitation] = []
    for item in materials:
        citations.append(
            ChatCitation(
                source_id=str(item.get("topic_tag") or "SRC_UNKNOWN"),
                title=str(item.get("title") or "Untitled"),
                source_name=str(item.get("source_name") or "Unknown"),
                source_url=item.get("source_url"),
                published_at=item.get("published_at"),
                authority_level=str(item.get("authority_level") or "MEDIUM"),
            )
        )
    return citations


def run_plain_chat(
    *,
    settings: Settings,
    db: Session,
    model_value: str | None,
    object_type: str | None,
    messages: list[Any],
    system_prompt: str | None,
    answer_mode: str,
    note: str | None,
    grounding_status: str,
) -> OrchestratedChatResult:
    model = resolve_chat_model(db, model_value=model_value, object_type=object_type)
    reply = call_gemini_generate_content(
        settings=settings,
        model_name=model.model_name,
        contents=build_plain_contents(messages),
        system_instruction=(system_prompt or DEFAULT_CHAT_SYSTEM_PROMPT).strip(),
        temperature=0.7,
        max_output_tokens=2048,
    )
    if note:
        reply = f"> {note}\n\n{reply}"

    return OrchestratedChatResult(
        reply=reply,
        model=model.model_name,
        provider=model.provider_code,
        answer_mode=answer_mode,
        grounding_status=grounding_status,
        citations=[],
        used_source_codes=[],
        note=note,
    )


def run_stock_grounded_chat(
    *,
    settings: Settings,
    db: Session,
    model_value: str | None,
    question: str,
    include_citations: bool,
    system_prompt: str | None,
    answer_mode: str = CHAT_MODE_SOURCE_FIRST,
) -> OrchestratedChatResult:
    stock_query = detect_stock_query_from_text(question)
    if not stock_query:
        raise RuntimeError("No stock symbol or stock name was detected in the question.")

    lookback_days = parse_lookback_days(question, settings.stock_lookback_days)
    bundle = collect_stock_research_bundle(stock_query, lookback_days=lookback_days)
    materials = build_stock_material_payloads(bundle)
    model = resolve_chat_model(
        db,
        model_value=model_value,
        object_type=ObjectType.STOCK.value,
    )

    reply = call_gemini_generate_content(
        settings=settings,
        model_name=model.model_name,
        contents=[
            build_text_content(
                "user",
                build_grounded_prompt(
                    question=question,
                    stock_name=bundle.stock.name,
                    stock_symbol=bundle.stock.symbol,
                    lookback_days=lookback_days,
                    materials=materials,
                    include_citations=include_citations,
                ),
            )
        ],
        system_instruction=(system_prompt or DEFAULT_GROUNDED_SYSTEM_PROMPT).strip(),
        temperature=0.4,
        max_output_tokens=4096,
    )

    citations = build_citations(materials) if include_citations else []
    used_source_codes = sorted({item.source_id for item in citations})
    return OrchestratedChatResult(
        reply=reply,
        model=model.model_name,
        provider=model.provider_code,
        answer_mode=answer_mode,
        grounding_status="GROUNDED",
        citations=citations,
        used_source_codes=used_source_codes,
        note=None,
    )


def run_web_grounded_chat(
    *,
    settings: Settings,
    db: Session,
    model_value: str | None,
    object_type: str | None,
    messages: list[Any],
    system_prompt: str | None,
    answer_mode: str,
    note: str | None,
) -> OrchestratedChatResult:
    question = find_last_user_message(messages)
    model = resolve_chat_model(db, model_value=model_value, object_type=object_type)
    response_payload = call_gemini_generate_content_raw(
        settings=settings,
        model_name=model.model_name,
        contents=[build_text_content("user", build_web_grounded_prompt(question))],
        system_instruction=(
            system_prompt or DEFAULT_WEB_GROUNDED_SYSTEM_PROMPT
        ).strip(),
        temperature=0.2,
        max_output_tokens=3072,
        tools=[build_google_search_tool()],
    )
    reply = extract_text_from_response(response_payload)
    grounding_sources = extract_grounding_sources(response_payload)
    citations = [
        ChatCitation(
            source_id=item.source_id,
            title=item.title,
            source_name=item.title or "Gemini Google Search",
            source_url=item.uri,
            published_at=None,
            authority_level="MEDIUM",
        )
        for item in grounding_sources
    ]
    if note:
        reply = f"> {note}\n\n{reply}"

    return OrchestratedChatResult(
        reply=reply,
        model=model.model_name,
        provider=model.provider_code,
        answer_mode=answer_mode,
        grounding_status=(
            "WEB_GROUNDED" if citations else "WEB_GROUNDED_NO_SOURCES"
        ),
        citations=citations,
        used_source_codes=[item.source_id for item in citations],
        note=note,
    )


def orchestrate_chat_completion(
    *,
    settings: Settings,
    db: Session,
    model_value: str | None,
    messages: list[Any],
    answer_mode: str,
    object_type: str | None,
    system_prompt: str | None,
    include_citations: bool,
    allow_web_fallback: bool,
) -> OrchestratedChatResult:
    question = find_last_user_message(messages)
    if not question:
        raise RuntimeError("At least one non-empty user message is required.")

    if answer_mode == CHAT_MODE_CHAT:
        return run_plain_chat(
            settings=settings,
            db=db,
            model_value=model_value,
            object_type=object_type,
            messages=messages,
            system_prompt=system_prompt,
            answer_mode=CHAT_MODE_CHAT,
            note=None,
            grounding_status="CHAT_ONLY",
        )

    if (
        answer_mode == CHAT_MODE_WEB_FALLBACK
        and allow_web_fallback
        and settings.gemini_google_search_enabled
    ):
        try:
            if object_type in (None, ObjectType.STOCK.value):
                return run_stock_grounded_chat(
                    settings=settings,
                    db=db,
                    model_value=model_value,
                    question=question,
                    include_citations=include_citations,
                    system_prompt=system_prompt,
                    answer_mode=CHAT_MODE_WEB_FALLBACK,
                )
            return run_web_grounded_chat(
                settings=settings,
                db=db,
                model_value=model_value,
                object_type=object_type,
                messages=messages,
                system_prompt=system_prompt,
                answer_mode=CHAT_MODE_WEB_FALLBACK,
                note=None,
            )
        except Exception as error:
            return run_web_grounded_chat(
                settings=settings,
                db=db,
                model_value=model_value,
                object_type=object_type,
                messages=messages,
                system_prompt=system_prompt,
                answer_mode=CHAT_MODE_WEB_FALLBACK,
                note=f"本地数据源不可用，已切换 Gemini 联网回答。原因：{error}",
            )

    try:
        if object_type in (None, ObjectType.STOCK.value):
            return run_stock_grounded_chat(
                settings=settings,
                db=db,
                model_value=model_value,
                question=question,
                include_citations=include_citations,
                system_prompt=system_prompt,
                answer_mode=(
                    CHAT_MODE_AUTO
                    if answer_mode == CHAT_MODE_AUTO
                    else CHAT_MODE_SOURCE_FIRST
                ),
            )
    except Exception as error:
        if answer_mode == CHAT_MODE_SOURCE_FIRST:
            note = f"未命中已接入的数据源，已退回普通模型回答。原因：{error}"
            return run_plain_chat(
                settings=settings,
                db=db,
                model_value=model_value,
                object_type=object_type,
                messages=messages,
                system_prompt=system_prompt,
                answer_mode=CHAT_MODE_SOURCE_FIRST,
                note=note,
                grounding_status="MODEL_FALLBACK",
            )

        if answer_mode == CHAT_MODE_WEB_FALLBACK:
            if allow_web_fallback and settings.gemini_google_search_enabled:
                return run_web_grounded_chat(
                    settings=settings,
                    db=db,
                    model_value=model_value,
                    object_type=object_type,
                    messages=messages,
                    system_prompt=system_prompt,
                    answer_mode=CHAT_MODE_WEB_FALLBACK,
                    note=f"未命中本地数据源，已切换 Gemini 联网回答。原因：{error}",
                )

            note = (
                "联网兜底未启用，当前先退回普通模型回答，"
                "答案不代表实时信息。"
            )
            return run_plain_chat(
                settings=settings,
                db=db,
                model_value=model_value,
                object_type=object_type,
                messages=messages,
                system_prompt=system_prompt,
                answer_mode=CHAT_MODE_WEB_FALLBACK,
                note=note,
                grounding_status=(
                    "MODEL_FALLBACK" if allow_web_fallback else "WEB_FALLBACK_NOT_READY"
                ),
            )

    return run_plain_chat(
        settings=settings,
        db=db,
        model_value=model_value,
        object_type=object_type,
        messages=messages,
        system_prompt=system_prompt,
        answer_mode=CHAT_MODE_AUTO,
        note=None,
        grounding_status="CHAT_ONLY",
    )
