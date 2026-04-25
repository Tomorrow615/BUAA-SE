from __future__ import annotations

from dataclasses import dataclass
import json
import logging
import re
from typing import Any

from app.services.gemini_api import (
    GeminiGroundingSource,
    build_google_search_tool,
    build_text_content,
    call_gemini_generate_content,
    call_gemini_generate_content_raw,
    extract_grounding_sources,
    extract_text_from_response,
)


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
    grounded_sources: list[GeminiGroundingSource]


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
    allow_google_search: bool = False,
) -> AnalysisOutput:
    resolved_model_name = model_name or settings.gemini_model_name
    raw_response_text: str | None = None

    if settings.gemini_api_key:
        try:
            grounded_sources: list[GeminiGroundingSource] = []
            if allow_google_search and settings.gemini_google_search_enabled:
                prompt = build_stock_web_prompt(
                    stock_name=stock_name,
                    stock_symbol=stock_symbol,
                    research_goal=research_goal,
                    lookback_days=lookback_days,
                )
                response_payload = call_gemini_generate_content_raw(
                    settings=settings,
                    model_name=resolved_model_name,
                    contents=[build_text_content("user", prompt)],
                    system_instruction=(
                        "You are a financial research assistant. "
                        "Use Google Search grounding when needed. "
                        "Rely on public, recent, and authoritative sources where possible. "
                        "Return a single JSON object and nothing else."
                    ),
                    temperature=0.2,
                    max_output_tokens=4096,
                    tools=[build_google_search_tool()],
                )
                raw_response_text = extract_text_from_response(response_payload)
                grounded_sources = extract_grounding_sources(response_payload)
            else:
                prompt = build_stock_prompt(
                    stock_name=stock_name,
                    stock_symbol=stock_symbol,
                    research_goal=research_goal,
                    materials=materials,
                    lookback_days=lookback_days,
                )
                raw_response_text = call_gemini_generate_content(
                    settings=settings,
                    model_name=resolved_model_name,
                    contents=[build_text_content("user", prompt)],
                    system_instruction=(
                        "You are a financial research assistant. "
                        "You must only use the provided materials. "
                        "Return a single JSON object and nothing else."
                    ),
                    temperature=0.2,
                    max_output_tokens=8192,
                )

            payload = parse_or_wrap_payload(raw_response_text)
            return build_analysis_output(
                payload=payload,
                model_name=resolved_model_name,
                provider_code="gemini",
                raw_response_text=raw_response_text,
                grounded_sources=grounded_sources,
                report_title="股票调研报告",
            )
        except Exception as error:  # pragma: no cover - network path
            logger.warning("Gemini analysis failed, using fallback summary: %s", error)

    return build_fallback_analysis(
        stock_name=stock_name,
        stock_symbol=stock_symbol,
        materials=materials,
        lookback_days=lookback_days,
        model_name=resolved_model_name,
        raw_response_text=raw_response_text,
    )


def generate_business_analysis(
    settings: Any,
    *,
    model_name: str | None,
    object_type: str,
    object_name: str,
    research_goal: str | None,
    materials: list[Any],
    lookback_days: int,
    allow_google_search: bool = False,
) -> AnalysisOutput:
    resolved_model_name = model_name or settings.gemini_model_name
    raw_response_text: str | None = None
    object_label = format_object_type_label(object_type)
    report_title = f"{object_label}调研报告"

    if settings.gemini_api_key:
        try:
            grounded_sources: list[GeminiGroundingSource] = []
            if allow_google_search and settings.gemini_google_search_enabled:
                prompt = build_business_web_prompt(
                    object_label=object_label,
                    object_name=object_name,
                    research_goal=research_goal,
                    lookback_days=lookback_days,
                )
                response_payload = call_gemini_generate_content_raw(
                    settings=settings,
                    model_name=resolved_model_name,
                    contents=[build_text_content("user", prompt)],
                    system_instruction=(
                        "You are a commercial research assistant. "
                        "Use Google Search grounding and return a single JSON object. "
                        "Do not provide investment advice."
                    ),
                    temperature=0.2,
                    max_output_tokens=4096,
                    tools=[build_google_search_tool()],
                )
                raw_response_text = extract_text_from_response(response_payload)
                grounded_sources = extract_grounding_sources(response_payload)
            else:
                prompt = build_business_prompt(
                    object_label=object_label,
                    object_name=object_name,
                    research_goal=research_goal,
                    materials=materials,
                    lookback_days=lookback_days,
                )
                raw_response_text = call_gemini_generate_content(
                    settings=settings,
                    model_name=resolved_model_name,
                    contents=[build_text_content("user", prompt)],
                    system_instruction=(
                        "You are a commercial research assistant. "
                        "You must only use the provided materials. "
                        "Return a single JSON object and nothing else. "
                        "Do not provide investment advice."
                    ),
                    temperature=0.2,
                    max_output_tokens=8192,
                )

            payload = parse_or_wrap_payload(raw_response_text)
            return build_analysis_output(
                payload=payload,
                model_name=resolved_model_name,
                provider_code="gemini",
                raw_response_text=raw_response_text,
                grounded_sources=grounded_sources,
                report_title=report_title,
            )
        except Exception as error:  # pragma: no cover - network path
            logger.warning("Gemini business analysis failed, using fallback: %s", error)

    return build_generic_fallback_analysis(
        object_label=object_label,
        object_name=object_name,
        materials=materials,
        lookback_days=lookback_days,
        model_name=resolved_model_name,
        raw_response_text=raw_response_text,
        report_title=report_title,
    )


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


def build_business_prompt(
    *,
    object_label: str,
    object_name: str,
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
        authority_level = clean_text(get_material_field(item, "authority_level"), fallback="MEDIUM")
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

    materials_text = "\n\n".join(material_blocks) or "暂无材料。"
    research_goal_text = research_goal.strip() if research_goal and research_goal.strip() else "未额外指定研究目标"
    focus_instruction = build_business_focus_instruction(
        object_label=object_label,
        object_name=object_name,
        research_goal=research_goal_text,
    )

    return f"""
请基于以下{object_label}调研材料生成结构化 DeepResearch 报告，只能使用已提供材料，不得补充外部事实。

目标对象：{object_name}
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
3. 报告要区分硬事实、数据、媒体报道、市场观点和模型推断。
4. 所有事实判断、数字、趋势判断都必须来源于材料，并在句尾添加 [SRC_xxx]。
5. 结论必须谨慎，不能写成买入、卖出、保证收益等投资建议。
6. 如果材料不足，请明确写出“信息不足”，不要编造。
7. 模型推断也必须说明依据哪些材料，不允许用 [模型推断] 或 [信息不足] 替代来源编号。
8. {focus_instruction}

材料如下：
{materials_text}
""".strip()


def build_stock_web_prompt(
    *,
    stock_name: str,
    stock_symbol: str,
    research_goal: str | None,
    lookback_days: int,
) -> str:
    research_goal_text = research_goal.strip() if research_goal and research_goal.strip() else "未额外指定研究目标"

    return f"""
请围绕以下股票生成结构化分析。你可以使用 Google Search grounding 检索公开资料，但不得编造来源。

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
3. 允许使用联网检索得到的公开资料，但不能虚构具体来源或精确数据。
4. 对于时间敏感信息，要尽量明确写出“截至目前”“近期”“最近交易日”等表述。
 5. 结论保持谨慎，不构成投资建议。
""".strip()


def build_business_web_prompt(
    *,
    object_label: str,
    object_name: str,
    research_goal: str | None,
    lookback_days: int,
) -> str:
    research_goal_text = research_goal.strip() if research_goal and research_goal.strip() else "未额外指定研究目标"
    focus_instruction = build_business_focus_instruction(
        object_label=object_label,
        object_name=object_name,
        research_goal=research_goal_text,
    )
    return f"""
请围绕以下{object_label}对象生成结构化调研分析。你可以使用 Google Search grounding 检索公开资料，但不得编造来源。

目标对象：{object_name}
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
3. 优先引用官方、监管、交易所、政府、公司官网和主流财经媒体来源。
4. 区分事实、数据、媒体报道、市场观点，不要把新闻观点写成确定事实。
5. 结论保持谨慎，不构成投资建议。
6. 模型推断也必须说明依据哪些来源，不允许用 [模型推断] 或 [信息不足] 替代可追溯来源。
7. {focus_instruction}
""".strip()


def build_business_focus_instruction(
    *,
    object_label: str,
    object_name: str,
    research_goal: str,
) -> str:
    normalized_goal = research_goal.casefold()
    normalized_name = object_name.casefold()
    asks_price = any(
        keyword in normalized_goal
        for keyword in [
            "价格",
            "波动",
            "走势",
            "涨跌",
            "行情",
            "原因",
            "驱动",
            "price",
            "volatility",
            "trend",
            "driver",
        ]
    )
    is_gold = any(keyword in normalized_name for keyword in ["黄金", "gold", "xau"])

    if object_label == "商品" and asks_price:
        gold_clause = (
            "黄金场景下，央行购金/储备只能作为需求侧影响因素之一，不能替代价格走势分析；"
            if is_gold
            else ""
        )
        return (
            "商品价格波动类报告必须把“价格怎么动”放在首位：摘要和正文前半部分必须说明"
            "观察区间内的最新价格、起止变化、涨跌幅、区间高点/低点和波动幅度；随后再拆解"
            "供需、库存/储备、利率、美元、政策、地缘事件和市场预期等驱动因素。"
            f"{gold_clause}"
            "如果材料中没有价格序列或价格数据，必须在摘要第一句写明“价格序列材料不足”，"
            "不得用储备、新闻标题或泛泛观点冒充价格波动分析。"
            "report_markdown 建议包含“摘要”“价格走势与波动”“驱动因素拆解”“数据表”“风险与不确定性”“结论”“引用材料”。"
        )

    if object_label == "商品":
        return (
            "商品报告应优先覆盖价格、供需、库存/储备、宏观变量、政策和事件冲击；"
            "不要只罗列单一来源材料。"
        )

    return "报告必须围绕用户研究目标组织，不要被无关材料带偏主题。"


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


def parse_or_wrap_payload(raw_text: str) -> dict[str, Any]:
    try:
        return parse_json_payload(raw_text)
    except Exception:
        cleaned = strip_code_fence(raw_text).strip()
        if not cleaned:
            raise
        summary = (
            extract_json_string_field(cleaned, "summary")
            or first_nonempty_line(cleaned)
            or "模型已返回文本报告。"
        )
        if summary in {"{", "[", "```json", "```"}:
            summary = "模型返回了非标准 JSON 文本，系统已将原文作为报告内容保存。"
        report_markdown = extract_json_string_field(cleaned, "report_markdown") or cleaned
        conclusion = (
            extract_json_string_field(cleaned, "conclusion")
            or "模型返回了非 JSON 文本，系统已将原文作为报告内容保存。"
        )
        return {
            "summary": summary[:500],
            "key_findings": [],
            "risks": [],
            "opportunities": [],
            "conclusion": conclusion,
            "report_markdown": report_markdown,
        }


def build_analysis_output(
    *,
    payload: dict[str, Any],
    model_name: str,
    provider_code: str,
    raw_response_text: str | None,
    grounded_sources: list[GeminiGroundingSource] | None = None,
    report_title: str = "股票调研报告",
) -> AnalysisOutput:
    key_findings = coerce_string_list(payload.get("key_findings"))
    risks = coerce_string_list(payload.get("risks"))
    opportunities = coerce_string_list(payload.get("opportunities"))
    grounded_sources = grounded_sources or []

    report_markdown = clean_text(payload.get("report_markdown"))
    if not report_markdown:
        reference_lines = build_reference_lines(grounded_sources)
        report_markdown = build_markdown_from_payload(
            summary=clean_text(payload.get("summary"), fallback="信息不足。"),
            key_findings=key_findings,
            risks=risks,
            opportunities=opportunities,
            conclusion=clean_text(payload.get("conclusion"), fallback="信息不足。"),
            reference_lines=reference_lines,
            title=report_title,
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
        grounded_sources=grounded_sources,
    )


def build_generic_fallback_analysis(
    *,
    object_label: str,
    object_name: str,
    materials: list[Any],
    lookback_days: int,
    model_name: str,
    raw_response_text: str | None,
    report_title: str,
) -> AnalysisOutput:
    source_ids = [get_material_field(item, "topic_tag") or "SRC_UNKNOWN" for item in materials]
    citations = "".join(f"[{source_id}]" for source_id in source_ids[:3]) or "[SRC_001]"
    summary = (
        f"{object_name} 的{object_label}调研最小链路已经跑通，"
        f"当前采集到 {len(materials)} 条材料，观察窗口为近 {lookback_days} 天。{citations}"
    )
    key_findings = []
    for item in materials[:5]:
        summary_line = clean_text(get_material_field(item, "summary"))
        source_id = get_material_field(item, "topic_tag") or "SRC_UNKNOWN"
        if summary_line:
            key_findings.append(f"{summary_line}[{source_id}]")
    if not key_findings:
        key_findings.append("当前材料不足，无法形成可靠事实判断。[SRC_001]")

    risks = [
        f"当前仍是{object_label}最小研究链路，材料覆盖还不完整，需要继续补充更高权威度来源。{citations}",
        "新闻、研报和市场观点不能直接等同于事实，后续需要与公告、监管或官方数据交叉验证。[SRC_001]",
    ]
    opportunities = [
        f"系统已经能把{object_label}材料统一沉淀为可引用材料，后续可以扩展更多来源并提升权威度。{citations}",
    ]
    conclusion = (
        f"当前报告说明 {object_name} 的{object_label}研究链路已具备最小可运行能力，"
        f"但不构成投资建议，正式判断仍需更多权威来源交叉验证。{citations}"
    )
    report_markdown = build_markdown_from_payload(
        summary=summary,
        key_findings=key_findings,
        risks=risks,
        opportunities=opportunities,
        conclusion=conclusion,
        title=report_title,
    )
    return AnalysisOutput(
        summary=summary,
        key_findings=key_findings,
        risks=risks,
        opportunities=opportunities,
        conclusion=conclusion,
        report_markdown=report_markdown,
        model_name=model_name,
        provider_code="gemini",
        used_fallback=True,
        raw_response_text=raw_response_text,
        grounded_sources=[],
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
        provider_code="gemini",
        used_fallback=True,
        raw_response_text=raw_response_text,
        grounded_sources=[],
    )


def build_markdown_from_payload(
    *,
    summary: str,
    key_findings: list[str],
    risks: list[str],
    opportunities: list[str],
    conclusion: str,
    reference_lines: list[str] | None = None,
    title: str = "股票调研报告",
) -> str:
    def render_lines(items: list[str]) -> str:
        if not items:
            return "- 信息不足。"
        return "\n".join(f"- {item}" for item in items)

    return "\n\n".join(
        [
            f"# {title}",
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
                reference_lines
                or [
                    "报告正文中的 [SRC_xxx] 对应下方材料区中的来源编号。",
                ]
            ),
        ]
    )


def build_reference_lines(
    grounded_sources: list[GeminiGroundingSource],
) -> list[str]:
    if not grounded_sources:
        return ["报告正文中的引用请结合材料区查看。"]

    lines: list[str] = []
    for item in grounded_sources:
        if item.uri:
            lines.append(f"[{item.source_id}] {item.title} - {item.uri}")
        else:
            lines.append(f"[{item.source_id}] {item.title}")
    return lines


def strip_code_fence(value: str) -> str:
    lines = value.strip().splitlines()
    if lines and lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].startswith("```"):
        lines = lines[:-1]
    return "\n".join(lines).strip()


def first_nonempty_line(value: str) -> str:
    for line in value.splitlines():
        stripped = line.strip()
        if stripped:
            return stripped
    return ""


def extract_json_string_field(value: str, field_name: str) -> str:
    pattern = rf'"{re.escape(field_name)}"\s*:\s*"((?:\\.|[^"\\])*)"'
    match = re.search(pattern, value, re.DOTALL)
    if match is None:
        return ""
    try:
        return json.loads(f'"{match.group(1)}"')
    except json.JSONDecodeError:
        return match.group(1).replace("\\n", "\n").strip()


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


def format_object_type_label(object_type: str) -> str:
    normalized = object_type.upper()
    if normalized == "COMPANY":
        return "公司"
    if normalized == "COMMODITY":
        return "商品"
    if normalized == "STOCK":
        return "股票"
    return "商业对象"
