from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import re
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.models.enums import AuthorityLevel, ObjectType, SourceType
from app.services.gemini_api import (
    build_google_search_tool,
    build_text_content,
    call_gemini_generate_content_raw,
    extract_grounding_sources,
    extract_text_from_response,
)
from app.services.stock_market import (
    build_stock_material_payloads,
    collect_stock_research_bundle,
    parse_lookback_days,
)


ALPHA_VANTAGE_URL = "https://www.alphavantage.co/query"
FRED_URL = "https://api.stlouisfed.org/fred/series/observations"
EIA_WTI_URL = "https://api.eia.gov/v2/petroleum/pri/spt/data/"
SEC_COMPANY_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
SEC_COMPANY_FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
SEC_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"
GLEIF_SEARCH_URL = "https://api.gleif.org/api/v1/lei-records"
TUSHARE_URL = "https://api.tushare.pro"

DEFAULT_USER_AGENT = "BUAA-SE business research demo"


COMMODITY_ALPHA_FUNCTIONS = {
    "原油": "WTI",
    "oil": "WTI",
    "wti": "WTI",
    "布伦特": "BRENT",
    "brent": "BRENT",
    "天然气": "NATURAL_GAS",
    "natural gas": "NATURAL_GAS",
    "铜": "COPPER",
    "copper": "COPPER",
    "铝": "ALUMINUM",
    "aluminum": "ALUMINUM",
    "小麦": "WHEAT",
    "wheat": "WHEAT",
    "玉米": "CORN",
    "corn": "CORN",
    "棉花": "COTTON",
    "cotton": "COTTON",
    "糖": "SUGAR",
    "sugar": "SUGAR",
    "咖啡": "COFFEE",
    "coffee": "COFFEE",
}

COMMODITY_FRED_SERIES = {
    "黄金": ("GOLDAMGBD228NLBM", "伦敦金银市场协会黄金定盘价"),
    "gold": ("GOLDAMGBD228NLBM", "LBMA gold fixing price"),
    "原油": ("DCOILWTICO", "WTI 原油现货价格"),
    "oil": ("DCOILWTICO", "WTI crude oil spot price"),
    "wti": ("DCOILWTICO", "WTI crude oil spot price"),
    "天然气": ("DHHNGSP", "Henry Hub 天然气现货价格"),
    "natural gas": ("DHHNGSP", "Henry Hub natural gas spot price"),
    "铜": ("PCOPPUSDM", "全球铜价月度序列"),
    "copper": ("PCOPPUSDM", "Global copper price series"),
}


@dataclass(frozen=True)
class CollectedResearchMaterials:
    object_type: str
    object_name: str
    display_name: str
    symbol: str | None
    lookback_days: int
    materials: list[dict[str, Any]]
    collection_mode: str
    warnings: list[str]


def collect_research_materials(
    settings: Any,
    *,
    object_type: str,
    object_name: str,
    research_goal: str | None,
    time_range: str | None,
    source_strategy: str | None,
) -> CollectedResearchMaterials:
    normalized_type = object_type.upper()
    lookback_days = parse_lookback_days(time_range, settings.stock_lookback_days)
    warnings: list[str] = []
    materials: list[dict[str, Any]] = []
    display_name = object_name.strip()
    symbol: str | None = None

    if normalized_type == ObjectType.STOCK.value:
        try:
            bundle = collect_stock_research_bundle(display_name, lookback_days=lookback_days)
            display_name = bundle.stock.name
            symbol = bundle.stock.symbol
            materials.extend(build_stock_material_payloads(bundle))
        except Exception as error:
            warnings.append(f"东方财富股票数据采集失败：{error}")

        alpha_symbol = detect_symbol(display_name) or symbol
        materials.extend(
            safe_collect(
                "Alpha Vantage 股票资料",
                warnings,
                lambda: collect_alpha_stock_materials(settings, alpha_symbol or display_name),
            )
        )
        materials.extend(
            safe_collect(
                "Tushare 股票基础资料",
                warnings,
                lambda: collect_tushare_stock_basic(settings, symbol or display_name),
            )
        )
        materials.extend(
            safe_collect(
                "SEC 股票公司披露",
                warnings,
                lambda: collect_sec_company_materials(settings, display_name),
            )
        )

    elif normalized_type == ObjectType.COMPANY.value:
        materials.extend(
            safe_collect(
                "SEC 公司披露",
                warnings,
                lambda: collect_sec_company_materials(settings, display_name),
            )
        )
        alpha_symbol = detect_symbol(display_name) or resolve_sec_ticker(settings, display_name)
        if alpha_symbol:
            symbol = alpha_symbol
            materials.extend(
                safe_collect(
                    "Alpha Vantage 公司资料",
                    warnings,
                    lambda: collect_alpha_stock_materials(settings, alpha_symbol),
                )
            )
        materials.extend(
            safe_collect(
                "GLEIF 法人主体资料",
                warnings,
                lambda: collect_gleif_company_materials(settings, display_name),
            )
        )

    elif normalized_type == ObjectType.COMMODITY.value:
        materials.extend(
            safe_collect(
                "Alpha Vantage 商品价格",
                warnings,
                lambda: collect_alpha_commodity_materials(settings, display_name),
            )
        )
        materials.extend(
            safe_collect(
                "FRED 商品/宏观序列",
                warnings,
                lambda: collect_fred_commodity_materials(settings, display_name),
            )
        )
        materials.extend(
            safe_collect(
                "EIA 能源价格",
                warnings,
                lambda: collect_eia_energy_materials(settings, display_name),
            )
        )

    if settings.gemini_api_key and settings.gemini_google_search_enabled:
        materials.extend(
            safe_collect(
                "Gemini 联网来源",
                warnings,
                lambda: collect_gemini_web_materials(
                    settings,
                    object_type=normalized_type,
                    object_name=display_name,
                    research_goal=research_goal,
                    source_strategy=source_strategy,
                ),
            )
        )

    materials = reindex_materials(deduplicate_materials(materials))
    mode = "MULTI_SOURCE" if materials else "NO_SOURCE"
    if materials and any(item.get("source_type") == SourceType.WEB.value for item in materials):
        mode = "MULTI_SOURCE_WITH_WEB"

    return CollectedResearchMaterials(
        object_type=normalized_type,
        object_name=object_name,
        display_name=display_name,
        symbol=symbol,
        lookback_days=lookback_days,
        materials=materials,
        collection_mode=mode,
        warnings=warnings,
    )


def safe_collect(
    source_name: str,
    warnings: list[str],
    collector: Any,
) -> list[dict[str, Any]]:
    try:
        return collector()
    except Exception as error:
        warnings.append(f"{source_name}采集失败：{error}")
        return []


def collect_alpha_stock_materials(settings: Any, symbol: str) -> list[dict[str, Any]]:
    api_key = clean_optional(settings.alpha_vantage_api_key)
    normalized_symbol = normalize_stock_symbol(symbol)
    if not api_key or not normalized_symbol:
        return []

    materials: list[dict[str, Any]] = []
    overview = request_json(
        ALPHA_VANTAGE_URL,
        params={
            "function": "OVERVIEW",
            "symbol": normalized_symbol,
            "apikey": api_key,
        },
    )
    if overview and "Symbol" in overview:
        materials.append(
            build_material_payload(
                title=f"{overview.get('Name') or normalized_symbol} 公司概览",
                summary=(
                    f"行业：{overview.get('Industry') or '未知'}；"
                    f"市值：{overview.get('MarketCapitalization') or '未知'}；"
                    f"PE：{overview.get('PERatio') or '未知'}。"
                ),
                content_text=json.dumps(select_nonempty_fields(overview), ensure_ascii=False, indent=2),
                source_name="Alpha Vantage Company Overview",
                source_url="https://www.alphavantage.co/documentation/",
                source_type=SourceType.API.value,
                authority_level=AuthorityLevel.MEDIUM.value,
                published_at=None,
                relevance_score=8.6,
                dedup_key=f"alpha_overview:{normalized_symbol}",
            )
        )

    daily = request_json(
        ALPHA_VANTAGE_URL,
        params={
            "function": "TIME_SERIES_DAILY",
            "symbol": normalized_symbol,
            "outputsize": "compact",
            "apikey": api_key,
        },
    )
    time_series = daily.get("Time Series (Daily)") if isinstance(daily, dict) else None
    if isinstance(time_series, dict) and time_series:
        latest_dates = sorted(time_series.keys(), reverse=True)[:8]
        latest = time_series[latest_dates[0]]
        materials.append(
            build_material_payload(
                title=f"{normalized_symbol} Alpha Vantage 日线行情",
                summary=(
                    f"最近交易日 {latest_dates[0]} 收盘价 "
                    f"{latest.get('4. close') or '未知'}。"
                ),
                content_text=json.dumps(
                    {date: time_series[date] for date in latest_dates},
                    ensure_ascii=False,
                    indent=2,
                ),
                source_name="Alpha Vantage Daily Time Series",
                source_url="https://www.alphavantage.co/documentation/",
                source_type=SourceType.API.value,
                authority_level=AuthorityLevel.MEDIUM.value,
                published_at=parse_date(latest_dates[0]),
                relevance_score=8.2,
                dedup_key=f"alpha_daily:{normalized_symbol}:{latest_dates[0]}",
            )
        )

    news = request_json(
        ALPHA_VANTAGE_URL,
        params={
            "function": "NEWS_SENTIMENT",
            "tickers": normalized_symbol,
            "limit": "5",
            "apikey": api_key,
        },
    )
    feed = news.get("feed") if isinstance(news, dict) else None
    if isinstance(feed, list) and feed:
        lines = []
        for item in feed[:5]:
            lines.append(
                "；".join(
                    [
                        f"标题：{item.get('title') or '未知'}",
                        f"来源：{item.get('source') or '未知'}",
                        f"时间：{item.get('time_published') or '未知'}",
                        f"摘要：{item.get('summary') or '无'}",
                        f"链接：{item.get('url') or '无'}",
                    ]
                )
            )
        materials.append(
            build_material_payload(
                title=f"{normalized_symbol} 新闻与市场情绪",
                summary=f"Alpha Vantage 返回 {len(feed[:5])} 条相关新闻/情绪材料。",
                content_text="\n".join(lines),
                source_name="Alpha Vantage News Sentiment",
                source_url="https://www.alphavantage.co/documentation/",
                source_type=SourceType.API.value,
                authority_level=AuthorityLevel.MEDIUM.value,
                published_at=None,
                relevance_score=7.4,
                dedup_key=f"alpha_news:{normalized_symbol}",
            )
        )

    return materials


def collect_alpha_commodity_materials(settings: Any, commodity_name: str) -> list[dict[str, Any]]:
    api_key = clean_optional(settings.alpha_vantage_api_key)
    if not api_key:
        return []
    function = resolve_commodity_key(COMMODITY_ALPHA_FUNCTIONS, commodity_name)
    if not function:
        return []

    payload = request_json(
        ALPHA_VANTAGE_URL,
        params={
            "function": function,
            "interval": "monthly",
            "apikey": api_key,
        },
    )
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, list) or not data:
        return []

    recent = data[:12]
    latest = recent[0]
    return [
        build_material_payload(
            title=f"{commodity_name} Alpha Vantage 商品价格序列",
            summary=(
                f"{payload.get('name') or function} 最近一期 "
                f"{latest.get('date') or '未知日期'} 数值为 {latest.get('value') or '未知'}，"
                f"单位：{payload.get('unit') or '未知'}。"
            ),
            content_text=json.dumps(
                {
                    "name": payload.get("name"),
                    "interval": payload.get("interval"),
                    "unit": payload.get("unit"),
                    "recent": recent,
                },
                ensure_ascii=False,
                indent=2,
            ),
            source_name="Alpha Vantage Commodities",
            source_url="https://www.alphavantage.co/documentation/",
            source_type=SourceType.API.value,
            authority_level=AuthorityLevel.MEDIUM.value,
            published_at=parse_date(str(latest.get("date") or "")),
            relevance_score=8.5,
            dedup_key=f"alpha_commodity:{function}:{latest.get('date')}",
        )
    ]


def collect_fred_commodity_materials(settings: Any, commodity_name: str) -> list[dict[str, Any]]:
    api_key = clean_optional(settings.fred_api_key)
    if not api_key:
        return []
    series = resolve_commodity_key(COMMODITY_FRED_SERIES, commodity_name)
    if not series:
        return []
    series_id, series_name = series
    payload = request_json(
        FRED_URL,
        params={
            "series_id": series_id,
            "api_key": api_key,
            "file_type": "json",
            "sort_order": "desc",
            "limit": "12",
        },
    )
    observations = payload.get("observations") if isinstance(payload, dict) else None
    if not isinstance(observations, list) or not observations:
        return []
    latest = observations[0]
    return [
        build_material_payload(
            title=f"{commodity_name} FRED 时间序列",
            summary=(
                f"{series_name} 最近一期 {latest.get('date') or '未知日期'} "
                f"数值为 {latest.get('value') or '未知'}。"
            ),
            content_text=json.dumps(
                {"series_id": series_id, "series_name": series_name, "observations": observations},
                ensure_ascii=False,
                indent=2,
            ),
            source_name="Federal Reserve Economic Data (FRED)",
            source_url=f"https://fred.stlouisfed.org/series/{series_id}",
            source_type=SourceType.API.value,
            authority_level=AuthorityLevel.HIGH.value,
            published_at=parse_date(str(latest.get("date") or "")),
            relevance_score=8.8,
            dedup_key=f"fred:{series_id}:{latest.get('date')}",
        )
    ]


def collect_eia_energy_materials(settings: Any, commodity_name: str) -> list[dict[str, Any]]:
    api_key = clean_optional(settings.eia_api_key)
    if not api_key:
        return []
    normalized = commodity_name.casefold()
    if not any(keyword in normalized for keyword in ["原油", "oil", "wti", "crude"]):
        return []

    payload = request_json(
        EIA_WTI_URL,
        params={
            "api_key": api_key,
            "frequency": "daily",
            "data[0]": "value",
            "facets[series][]": "RWTC",
            "sort[0][column]": "period",
            "sort[0][direction]": "desc",
            "offset": "0",
            "length": "10",
        },
    )
    response = payload.get("response") if isinstance(payload, dict) else None
    data = response.get("data") if isinstance(response, dict) else None
    if not isinstance(data, list) or not data:
        return []
    latest = data[0]
    return [
        build_material_payload(
            title="EIA WTI 原油现货价格",
            summary=(
                f"EIA WTI 最近一期 {latest.get('period') or '未知日期'} "
                f"价格为 {latest.get('value') or '未知'}。"
            ),
            content_text=json.dumps(data, ensure_ascii=False, indent=2),
            source_name="U.S. Energy Information Administration",
            source_url="https://www.eia.gov/opendata/",
            source_type=SourceType.API.value,
            authority_level=AuthorityLevel.HIGH.value,
            published_at=parse_date(str(latest.get("period") or "")),
            relevance_score=9.1,
            dedup_key=f"eia:wti:{latest.get('period')}",
        )
    ]


def collect_sec_company_materials(settings: Any, company_query: str) -> list[dict[str, Any]]:
    match = find_sec_company(settings, company_query)
    if match is None:
        return []

    cik_int = int(match["cik_str"])
    cik = f"{cik_int:010d}"
    ticker = str(match.get("ticker") or "").upper()
    title = str(match.get("title") or company_query)
    materials: list[dict[str, Any]] = []

    facts = request_json(
        SEC_COMPANY_FACTS_URL.format(cik=cik),
        headers=sec_headers(settings),
    )
    fact_summary = summarize_sec_facts(facts)
    if fact_summary:
        materials.append(
            build_material_payload(
                title=f"{title} SEC XBRL 财务事实",
                summary=f"{title} ({ticker}) 的 SEC companyfacts 返回了关键财务指标。",
                content_text=json.dumps(fact_summary, ensure_ascii=False, indent=2),
                source_name="SEC EDGAR Company Facts",
                source_url=f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json",
                source_type=SourceType.API.value,
                authority_level=AuthorityLevel.HIGH.value,
                published_at=None,
                relevance_score=9.4,
                dedup_key=f"sec_facts:{cik}",
            )
        )

    submissions = request_json(
        SEC_SUBMISSIONS_URL.format(cik=cik),
        headers=sec_headers(settings),
    )
    filings = summarize_sec_filings(cik_int, submissions)
    if filings:
        latest = filings[0]
        materials.append(
            build_material_payload(
                title=f"{title} SEC 近期披露文件",
                summary=(
                    f"SEC EDGAR 最近披露：{latest.get('form')}，"
                    f"披露日期 {latest.get('filing_date')}。"
                ),
                content_text=json.dumps(filings, ensure_ascii=False, indent=2),
                source_name="SEC EDGAR Submissions",
                source_url=f"https://data.sec.gov/submissions/CIK{cik}.json",
                source_type=SourceType.API.value,
                authority_level=AuthorityLevel.HIGH.value,
                published_at=parse_date(str(latest.get("filing_date") or "")),
                relevance_score=9.2,
                dedup_key=f"sec_filings:{cik}:{latest.get('filing_date')}",
            )
        )

    return materials


def collect_gleif_company_materials(settings: Any, company_query: str) -> list[dict[str, Any]]:
    payload = request_json(
        GLEIF_SEARCH_URL,
        params={
            "filter[entity.legalName]": company_query,
            "page[size]": "3",
        },
        headers={"User-Agent": settings.sec_user_agent or DEFAULT_USER_AGENT},
    )
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, list) or not data:
        return []

    rows = []
    for item in data:
        attrs = item.get("attributes") or {}
        entity = attrs.get("entity") or {}
        registration = attrs.get("registration") or {}
        rows.append(
            {
                "lei": item.get("id"),
                "legal_name": (entity.get("legalName") or {}).get("name"),
                "jurisdiction": entity.get("jurisdiction"),
                "legal_form": entity.get("legalForm"),
                "registration_status": registration.get("status"),
                "last_update": registration.get("lastUpdateDate"),
            }
        )

    return [
        build_material_payload(
            title=f"{company_query} GLEIF LEI 主体检索",
            summary=f"GLEIF 返回 {len(rows)} 条法人主体候选记录。",
            content_text=json.dumps(rows, ensure_ascii=False, indent=2),
            source_name="GLEIF LEI Look-up API",
            source_url="https://www.gleif.org/lei-data/gleif-lei-look-up-api/access-the-api",
            source_type=SourceType.API.value,
            authority_level=AuthorityLevel.HIGH.value,
            published_at=None,
            relevance_score=8.0,
            dedup_key=f"gleif:{company_query.casefold()}",
        )
    ]


def collect_tushare_stock_basic(settings: Any, symbol: str) -> list[dict[str, Any]]:
    token = clean_optional(settings.tushare_token)
    ts_code = normalize_tushare_symbol(symbol)
    if not token or not ts_code:
        return []

    payload = request_json(
        TUSHARE_URL,
        method="POST",
        json_body={
            "api_name": "stock_basic",
            "token": token,
            "params": {"ts_code": ts_code},
            "fields": "ts_code,symbol,name,area,industry,market,list_date",
        },
    )
    data = payload.get("data") if isinstance(payload, dict) else None
    fields = data.get("fields") if isinstance(data, dict) else None
    items = data.get("items") if isinstance(data, dict) else None
    if not isinstance(fields, list) or not isinstance(items, list) or not items:
        return []
    rows = [dict(zip(fields, row, strict=False)) for row in items]
    row = rows[0]
    return [
        build_material_payload(
            title=f"{row.get('name') or ts_code} Tushare 股票基础资料",
            summary=(
                f"{row.get('name') or ts_code} 所属行业：{row.get('industry') or '未知'}；"
                f"上市市场：{row.get('market') or '未知'}。"
            ),
            content_text=json.dumps(rows, ensure_ascii=False, indent=2),
            source_name="Tushare Pro stock_basic",
            source_url="https://tushare.pro/document/2?doc_id=25",
            source_type=SourceType.API.value,
            authority_level=AuthorityLevel.MEDIUM.value,
            published_at=parse_date(str(row.get("list_date") or "")),
            relevance_score=8.3,
            dedup_key=f"tushare_stock_basic:{ts_code}",
        )
    ]


def collect_gemini_web_materials(
    settings: Any,
    *,
    object_type: str,
    object_name: str,
    research_goal: str | None,
    source_strategy: str | None,
) -> list[dict[str, Any]]:
    prompt = (
        "请围绕一个商业调研对象做公开资料检索，并只总结可追溯来源里的内容。\n"
        f"对象类型：{object_type}\n"
        f"对象名称：{object_name}\n"
        f"研究目标：{research_goal or '未指定'}\n"
        f"信息源策略：{source_strategy or 'DEFAULT'}\n\n"
        "要求：优先官方、监管、交易所、政府、公司官网、主流财经媒体。"
        "区分硬事实、媒体报道、市场观点。输出中文要点，避免投资建议。"
    )
    payload = call_gemini_generate_content_raw(
        settings=settings,
        model_name=settings.gemini_model_name,
        contents=[build_text_content("user", prompt)],
        system_instruction=(
            "You are a source discovery assistant. Use Google Search grounding. "
            "Return concise Chinese research notes grounded in public sources."
        ),
        temperature=0.2,
        max_output_tokens=2048,
        tools=[build_google_search_tool()],
    )
    text = extract_text_from_response(payload)
    sources = extract_grounding_sources(payload)

    materials = [
        build_material_payload(
            title=f"{object_name} Gemini 联网资料摘要",
            summary="Gemini Google Search grounding 对公开资料进行的摘要整理。",
            content_text=text,
            source_name="Gemini Google Search grounding",
            source_url=None,
            source_type=SourceType.WEB.value,
            authority_level=AuthorityLevel.MEDIUM.value,
            published_at=None,
            relevance_score=7.5,
            dedup_key=f"gemini_summary:{object_type}:{object_name.casefold()}",
        )
    ]
    for item in sources:
        materials.append(
            build_material_payload(
                title=item.title,
                summary=f"Gemini grounding 返回的公开来源，域名：{item.domain or '未知'}。",
                content_text="\n".join(
                    [
                        f"来源标题：{item.title}",
                        f"来源域名：{item.domain or '未知'}",
                        f"来源链接：{item.uri or '未提供'}",
                    ]
                ),
                source_name=item.title or item.domain or "Gemini Google Search",
                source_url=item.uri if item.uri and len(item.uri) <= 500 else None,
                source_type=SourceType.WEB.value,
                authority_level=AuthorityLevel.MEDIUM.value,
                published_at=None,
                relevance_score=7.2,
                dedup_key=f"gemini_source:{item.uri or item.title}",
            )
        )
    return materials


def build_material_payload(
    *,
    title: str,
    summary: str,
    content_text: str,
    source_name: str,
    source_url: str | None,
    source_type: str,
    authority_level: str,
    published_at: datetime | None,
    relevance_score: float,
    dedup_key: str,
) -> dict[str, Any]:
    return {
        "topic_tag": None,
        "title": title[:255],
        "summary": summary,
        "content_text": content_text,
        "source_name": source_name[:255],
        "source_url": source_url if source_url and len(source_url) <= 500 else None,
        "source_type": source_type,
        "authority_level": authority_level,
        "published_at": published_at,
        "relevance_score": relevance_score,
        "is_selected": True,
        "dedup_key": dedup_key[:255],
    }


def request_json(
    url: str,
    *,
    params: dict[str, str] | None = None,
    headers: dict[str, str] | None = None,
    method: str = "GET",
    json_body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    final_url = f"{url}?{urlencode(params)}" if params else url
    request_headers = {
        "User-Agent": DEFAULT_USER_AGENT,
        "Accept": "application/json,text/plain,*/*",
        **(headers or {}),
    }
    data = None
    if json_body is not None:
        data = json.dumps(json_body).encode("utf-8")
        request_headers["Content-Type"] = "application/json"

    last_error: Exception | None = None
    for attempt in range(2):
        try:
            request = Request(
                final_url,
                method=method,
                headers=request_headers,
                data=data,
            )
            with urlopen(request, timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
            last_error = error
            if attempt == 1:
                break
            time.sleep(1)
    raise RuntimeError(str(last_error))


def sec_headers(settings: Any) -> dict[str, str]:
    return {"User-Agent": settings.sec_user_agent or DEFAULT_USER_AGENT}


def find_sec_company(settings: Any, query: str) -> dict[str, Any] | None:
    normalized = query.strip().casefold()
    if not normalized:
        return None

    tickers = request_json(SEC_COMPANY_TICKERS_URL, headers=sec_headers(settings))
    entries = [item for item in tickers.values() if isinstance(item, dict)]

    for item in entries:
        if str(item.get("ticker") or "").casefold() == normalized:
            return item
    for item in entries:
        title = str(item.get("title") or "").casefold()
        if normalized in title or title in normalized:
            return item
    return None


def resolve_sec_ticker(settings: Any, query: str) -> str | None:
    try:
        match = find_sec_company(settings, query)
    except Exception:
        return None
    if match is None:
        return None
    ticker = str(match.get("ticker") or "").strip().upper()
    return ticker or None


def summarize_sec_facts(payload: dict[str, Any]) -> dict[str, Any]:
    facts = ((payload.get("facts") or {}).get("us-gaap") or {})
    concept_map = {
        "Revenue": ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax"],
        "NetIncomeLoss": ["NetIncomeLoss"],
        "Assets": ["Assets"],
        "Liabilities": ["Liabilities"],
        "OperatingIncomeLoss": ["OperatingIncomeLoss"],
    }
    summary: dict[str, Any] = {
        "entity_name": payload.get("entityName"),
        "cik": payload.get("cik"),
        "facts": {},
    }
    for label, candidates in concept_map.items():
        for concept in candidates:
            units = (facts.get(concept) or {}).get("units") or {}
            usd_rows = units.get("USD") or units.get("shares") or []
            if not isinstance(usd_rows, list) or not usd_rows:
                continue
            clean_rows = [
                {
                    "fy": row.get("fy"),
                    "fp": row.get("fp"),
                    "form": row.get("form"),
                    "filed": row.get("filed"),
                    "end": row.get("end"),
                    "val": row.get("val"),
                }
                for row in usd_rows
                if row.get("val") is not None
            ]
            clean_rows.sort(key=lambda row: str(row.get("filed") or ""), reverse=True)
            if clean_rows:
                summary["facts"][label] = clean_rows[:3]
                break
    return summary if summary["facts"] else {}


def summarize_sec_filings(cik: int, payload: dict[str, Any]) -> list[dict[str, Any]]:
    recent = (payload.get("filings") or {}).get("recent") or {}
    forms = recent.get("form") or []
    filing_dates = recent.get("filingDate") or []
    accession_numbers = recent.get("accessionNumber") or []
    primary_docs = recent.get("primaryDocument") or []
    rows: list[dict[str, Any]] = []
    for form, filing_date, accession, doc in zip(
        forms,
        filing_dates,
        accession_numbers,
        primary_docs,
        strict=False,
    ):
        if form not in {"10-K", "10-Q", "8-K", "20-F", "6-K"}:
            continue
        accession_clean = str(accession).replace("-", "")
        rows.append(
            {
                "form": form,
                "filing_date": filing_date,
                "accession_number": accession,
                "document_url": (
                    f"https://www.sec.gov/Archives/edgar/data/"
                    f"{cik}/{accession_clean}/{doc}"
                ),
            }
        )
        if len(rows) >= 6:
            break
    return rows


def select_nonempty_fields(payload: dict[str, Any]) -> dict[str, Any]:
    selected_keys = [
        "Symbol",
        "Name",
        "Description",
        "Exchange",
        "Currency",
        "Country",
        "Sector",
        "Industry",
        "MarketCapitalization",
        "PERatio",
        "PEGRatio",
        "BookValue",
        "DividendYield",
        "EPS",
        "RevenueTTM",
        "GrossProfitTTM",
        "ProfitMargin",
        "QuarterlyEarningsGrowthYOY",
        "QuarterlyRevenueGrowthYOY",
        "AnalystTargetPrice",
        "52WeekHigh",
        "52WeekLow",
    ]
    return {key: payload.get(key) for key in selected_keys if payload.get(key) not in (None, "")}


def deduplicate_materials(materials: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    result: list[dict[str, Any]] = []
    for item in sorted(materials, key=lambda value: float(value.get("relevance_score") or 0), reverse=True):
        key = str(item.get("dedup_key") or item.get("source_url") or item.get("title"))
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result[:18]


def reindex_materials(materials: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for index, item in enumerate(materials, start=1):
        item["topic_tag"] = f"SRC_{index:03d}"
    return materials


def resolve_commodity_key(mapping: dict[str, Any], commodity_name: str) -> Any | None:
    normalized = commodity_name.strip().casefold()
    if not normalized:
        return None
    for key, value in mapping.items():
        if key.casefold() in normalized or normalized in key.casefold():
            return value
    return None


def parse_date(value: str) -> datetime | None:
    normalized = value.strip()
    if not normalized:
        return None
    for fmt in ("%Y-%m-%d", "%Y%m%d", "%Y-%m", "%Y"):
        try:
            return datetime.strptime(normalized, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def detect_symbol(value: str) -> str | None:
    normalized = value.strip()
    if re.fullmatch(r"[A-Za-z]{1,5}(?:\.[A-Za-z]{1,3})?", normalized):
        return normalized.upper()
    return None


def normalize_stock_symbol(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().upper()
    if not normalized:
        return None
    if re.fullmatch(r"\d{6}\.(SH|SZ|BJ)", normalized):
        return None
    if re.fullmatch(r"\d{6}", normalized):
        return None
    return normalized


def normalize_tushare_symbol(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().upper()
    match = re.fullmatch(r"(\d{6})(?:\.(SH|SZ|BJ))?", normalized)
    if not match:
        return None
    code = match.group(1)
    exchange = match.group(2)
    if exchange:
        return f"{code}.{exchange}"
    if code.startswith(("5", "6", "9")):
        return f"{code}.SH"
    return f"{code}.SZ"


def clean_optional(value: Any) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None
