from __future__ import annotations

from dataclasses import dataclass
import json
import logging
import re
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


logger = logging.getLogger(__name__)

JSON_OBJECT_PATTERN = re.compile(r"\{.*\}", re.DOTALL)


@dataclass(frozen=True)
class AnalysisOutput:
    summary: str
    key_findings: list[str]
    risks: list[str]
    opportunities: list[str]
    conclusion: str
    report_markdown: str
    model_name: str
    provider_code: str
    used_fallback: bool
    raw_response_text: str | None


def mask_secret(secret: str | None) -> str | None:
    if not secret:
        return None
    if len(secret) <= 8:
        return "*" * len(secret)
    return f"{secret[:4]}{'*' * max(len(secret) - 8, 8)}{secret[-4:]}"


def generate_stock_analysis(
    settings: Any,
    *,
    model_name: str | None,
    stock_name: str,
    stock_symbol: str,
    research_goal: str | None,
    materials: list[Any],
    lookback_days: int,
) -> AnalysisOutput:
    resolved_model_name = model_name or settings.openai_model_name
    raw_response_text: str | None = None

    if settings.openai_api_key:
        try:
            prompt = build_stock_prompt(
                stock_name=stock_name,
                stock_symbol=stock_symbol,
                research_goal=research_goal,
                materials=materials,
                lookback_days=lookback_days,
            )
            raw_response_text = call_openai_chat_completion(
                settings=settings,
                model_name=resolved_model_name,
                prompt=prompt,
            )
            payload = parse_json_payload(raw_response_text)
            return build_analysis_output(
                payload=payload,
                model_name=resolved_model_name,
                provider_code="openai",
                raw_response_text=raw_response_text,
            )
        except Exception as error:  # pragma: no cover - network path
            logger.warning("OpenAI analysis failed, using fallback summary: %s", error)

    return build_fallback_analysis(
        stock_name=stock_name,
        stock_symbol=stock_symbol,
        materials=materials,
        lookback_days=lookback_days,
        model_name=resolved_model_name,
        raw_response_text=raw_response_text,
    )


def call_openai_chat_completion(settings: Any, *, model_name: str, prompt: str) -> str:
    endpoint = f"{settings.openai_base_url.rstrip('/')}/chat/completions"
    payload = {
        "model": model_name,
        "temperature": 0.2,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a financial research assistant. "
                    "You must only use the provided materials. "
                    "Return a single JSON object and nothing else."
                ),
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
    }

    request = Request(
        endpoint,
        method="POST",
        headers={
            "Authorization": f"Bearer {settings.openai_api_key}",
            "Content-Type": "application/json",
        },
        data=json.dumps(payload).encode("utf-8"),
    )

    try:
        with urlopen(request, timeout=settings.openai_timeout_seconds) as response:
            response_payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:  # pragma: no cover - network path
        error_body = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(
            f"OpenAI request failed with status {error.code}: {error_body}"
        ) from error
    except URLError as error:  # pragma: no cover - network path
        raise RuntimeError(f"OpenAI request failed: {error.reason}") from error

    choices = response_payload.get("choices") or []
    if not choices:
        raise RuntimeError("OpenAI response did not include any choices.")

    message = choices[0].get("message") or {}
    content = message.get("content")
    if isinstance(content, list):
        text_parts = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                text_parts.append(str(item.get("text", "")))
        content = "\n".join(part for part in text_parts if part)

    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("OpenAI response content was empty.")

    return content.strip()


def build_stock_prompt(
    *,
    stock_name: str,
    stock_symbol: str,
    research_goal: str | None,
    materials: list[Any],
    lookback_days: int,
) -> str:
    material_blocks = []
    for item in materials:
        source_id = get_material_field(item, "topic_tag") or "SRC_UNKNOWN"
        title = clean_text(get_material_field(item, "title"), fallback="Untitled material")
        summary = clean_text(get_material_field(item, "summary"))
        content_text = clean_text(get_material_field(item, "content_text"))
        source_name = clean_text(get_material_field(item, "source_name"), fallback="Unknown source")
        authority_level = clean_text(
            get_material_field(item, "authority_level"),
            fallback="MEDIUM",
        )
        published_at = clean_text(get_material_field(item, "published_at"))
        source_url = clean_text(get_material_field(item, "source_url"))

        material_blocks.append(
            "\n".join(
                [
                    f"[{source_id}] {title}",
                    f"source_name: {source_name}",
                    f"authority_level: {authority_level}",
                    f"published_at: {published_at or 'unknown'}",
                    f"source_url: {source_url or 'unknown'}",
                    f"summary: {summary or 'N/A'}",
                    f"content: {content_text or 'N/A'}",
                ]
            )
        )

    materials_text = "\n\n".join(material_blocks)
    research_goal_text = research_goal.strip() if research_goal and research_goal.strip() else "未额外指定研究目标"

    return f"""
请基于以下股票调研材料生成结构化分析，只能使用已提供材料，不得补充外部事实。

目标股票：{stock_name} ({stock_symbol})
观察区间：近 {lookback_days} 天
用户研究目标：{research_goal_text}

输出要求：
1. 只输出一个 JSON 对象，不要输出 Markdown 代码块，不要补充说明文字。
2. JSON 必须包含以下字段：
{{
  "summary": "字符串",
  "key_findings": ["字符串"],
  "risks": ["字符串"],
  "opportunities": ["字符串"],
  "conclusion": "字符串",
  "report_markdown": "字符串"
}}
3. 所有事实判断、数字、结论都必须来源于材料。
4. report_markdown 必须是中文 Markdown，至少包含“摘要”“核心发现”“风险”“机会”“结论”“引用材料”六个部分。
5. report_markdown 中每一句事实陈述后面都要带来源标记，例如 [SRC_001]。
6. 如果材料不足，请明确写出“信息不足”，但不要编造。

材料如下：
{materials_text}
""".strip()


def parse_json_payload(raw_text: str) -> dict[str, Any]:
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = strip_code_fence(cleaned)

    try:
        payload = json.loads(cleaned)
    except json.JSONDecodeError:
        match = JSON_OBJECT_PATTERN.search(cleaned)
        if match is None:
            raise RuntimeError("Model output did not contain a JSON object.")
        payload = json.loads(match.group(0))

    if not isinstance(payload, dict):
        raise RuntimeError("Model output JSON must be an object.")
    return payload


def build_analysis_output(
    *,
    payload: dict[str, Any],
    model_name: str,
    provider_code: str,
    raw_response_text: str | None,
) -> AnalysisOutput:
    key_findings = coerce_string_list(payload.get("key_findings"))
    risks = coerce_string_list(payload.get("risks"))
    opportunities = coerce_string_list(payload.get("opportunities"))

    report_markdown = clean_text(payload.get("report_markdown"))
    if not report_markdown:
        report_markdown = build_markdown_from_payload(
            summary=clean_text(payload.get("summary"), fallback="信息不足。"),
            key_findings=key_findings,
            risks=risks,
            opportunities=opportunities,
            conclusion=clean_text(payload.get("conclusion"), fallback="信息不足。"),
        )

    return AnalysisOutput(
        summary=clean_text(payload.get("summary"), fallback="信息不足。"),
        key_findings=key_findings,
        risks=risks,
        opportunities=opportunities,
        conclusion=clean_text(payload.get("conclusion"), fallback="信息不足。"),
        report_markdown=report_markdown,
        model_name=model_name,
        provider_code=provider_code,
        used_fallback=False,
        raw_response_text=raw_response_text,
    )


def build_fallback_analysis(
    *,
    stock_name: str,
    stock_symbol: str,
    materials: list[Any],
    lookback_days: int,
    model_name: str,
    raw_response_text: str | None,
) -> AnalysisOutput:
    source_ids = [get_material_field(item, "topic_tag") or "SRC_UNKNOWN" for item in materials]
    citations = "".join(f"[{source_id}]" for source_id in source_ids[:2]) or "[SRC_001]"

    summary = (
        f"{stock_name} ({stock_symbol}) 的近 {lookback_days} 天股票调研链路已经跑通，"
        f"并完成了行情快照与阶段走势采集，可作为首版研究摘要的依据。{citations}"
    )

    selected_findings = []
    for item in materials[:3]:
        summary_line = clean_text(get_material_field(item, "summary"))
        source_id = get_material_field(item, "topic_tag") or "SRC_UNKNOWN"
        if summary_line:
            selected_findings.append(f"{summary_line}[{source_id}]")

    if not selected_findings:
        selected_findings.append(f"当前仅采集到有限材料，建议补充更多行情与公告数据。[SRC_001]")

    risks = [
        "当前最小版主要基于公开行情数据，尚未接入财报、公告和新闻舆情，基本面覆盖仍有限。[SRC_001][SRC_002]",
        "若后续市场波动明显，仅靠近阶段价格数据可能不足以支撑更深层投资判断。[SRC_002]",
    ]
    opportunities = [
        "当前系统已经拿到真实股票行情材料，后续补入公告和新闻后可以直接扩展分析深度。[SRC_001][SRC_002]",
        "材料已经带有来源编号，可继续扩展为句句引用和更强的可追溯报告。[SRC_001]",
    ]
    conclusion = (
        f"当前最小闭环已经能够围绕 {stock_name} 输出带引用的股票研究报告，"
        "适合作为第 8 步的可运行基线，后续再补充更高权威度信息源即可。[SRC_001][SRC_002]"
    )

    report_markdown = build_markdown_from_payload(
        summary=summary,
        key_findings=selected_findings,
        risks=risks,
        opportunities=opportunities,
        conclusion=conclusion,
    )

    return AnalysisOutput(
        summary=summary,
        key_findings=selected_findings,
        risks=risks,
        opportunities=opportunities,
        conclusion=conclusion,
        report_markdown=report_markdown,
        model_name=model_name,
        provider_code="openai",
        used_fallback=True,
        raw_response_text=raw_response_text,
    )


def build_markdown_from_payload(
    *,
    summary: str,
    key_findings: list[str],
    risks: list[str],
    opportunities: list[str],
    conclusion: str,
) -> str:
    def render_lines(items: list[str]) -> str:
        if not items:
            return "- 信息不足。"
        return "\n".join(f"- {item}" for item in items)

    return "\n\n".join(
        [
            "# 股票调研报告",
            "## 摘要",
            summary,
            "## 核心发现",
            render_lines(key_findings),
            "## 风险",
            render_lines(risks),
            "## 机会",
            render_lines(opportunities),
            "## 结论",
            conclusion,
            "## 引用材料",
            render_lines(
                [
                    "报告正文中的 [SRC_xxx] 对应下方材料区中的来源编号。",
                ]
            ),
        ]
    )


def strip_code_fence(value: str) -> str:
    lines = value.strip().splitlines()
    if lines and lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].startswith("```"):
        lines = lines[:-1]
    return "\n".join(lines).strip()


def clean_text(value: Any, *, fallback: str = "") -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    return text or fallback


def coerce_string_list(value: Any) -> list[str]:
    if isinstance(value, list):
        items = [clean_text(item) for item in value]
        return [item for item in items if item]
    if isinstance(value, str) and value.strip():
        lines = [line.strip("- ").strip() for line in value.splitlines()]
        return [line for line in lines if line]
    return []


def get_material_field(item: Any, field_name: str) -> Any:
    if isinstance(item, dict):
        return item.get(field_name)
    return getattr(item, field_name, None)
