from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import json
import re
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.models.enums import AuthorityLevel, ObjectType, SourceType
from app.services.extended_sources import (
    collect_eastmoney_news_materials,
    collect_news_api_materials,
    collect_world_bank_materials,
    collect_yahoo_stock_materials,
)
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
    "黄金": ("NASDAQQGLDI", "Credit Suisse NASDAQ Gold FLOWS103 价格指数"),
    "gold": ("NASDAQQGLDI", "Credit Suisse NASDAQ Gold FLOWS103 price index"),
    "原油": ("DCOILWTICO", "WTI 原油现货价格"),
    "oil": ("DCOILWTICO", "WTI crude oil spot price"),
    "wti": ("DCOILWTICO", "WTI crude oil spot price"),
    "天然气": ("DHHNGSP", "Henry Hub 天然气现货价格"),
    "natural gas": ("DHHNGSP", "Henry Hub natural gas spot price"),
    "铜": ("PCOPPUSDM", "全球铜价月度序列"),
    "copper": ("PCOPPUSDM", "Global copper price series"),
}

FRED_DAILY_COMMODITY_SERIES = {
    "NASDAQQGLDI",
    "DCOILWTICO",
    "DHHNGSP",
}

FRED_GOLD_DRIVER_SERIES = {
    "DGS10": "美国10年期国债收益率",
    "DFII10": "美国10年期TIPS实际收益率",
    "DTWEXBGS": "美元广义名义指数",
}

GOLD_COMMODITY_KEYWORDS = ("黄金", "gold", "xau")
PRICE_RESEARCH_KEYWORDS = (
    "价格",
    "波动",
    "走势",
    "涨跌",
    "行情",
    "驱动",
    "原因",
    "price",
    "volatility",
    "trend",
    "driver",
)


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
        # 新增: Yahoo Finance 美股数据
        if alpha_symbol:
            materials.extend(
                safe_collect(
                    "Yahoo Finance 美股行情",
                    warnings,
                    lambda: collect_yahoo_stock_materials(settings, alpha_symbol, lookback_days=lookback_days),
                )
            )
        # 新增: 东方财富资讯
        stock_code = extract_chinese_stock_code(symbol or display_name)
        if stock_code:
            materials.extend(
                safe_collect(
                    "东方财富资讯新闻",
                    warnings,
                    lambda: collect_eastmoney_news_materials(settings, stock_code=stock_code, lookback_days=lookback_days),
                )
            )
        # 新增: News API 财经新闻
        news_api_key = clean_optional(settings.news_api_key)
        if news_api_key:
            materials.extend(
                safe_collect(
                    "News API 财经新闻",
                    warnings,
                    lambda: collect_news_api_materials(settings, display_name, api_key=news_api_key),
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
            # 新增: Yahoo Finance 美股数据
            materials.extend(
                safe_collect(
                    "Yahoo Finance 美股行情",
                    warnings,
                    lambda: collect_yahoo_stock_materials(settings, alpha_symbol, lookback_days=lookback_days),
                )
            )
        materials.extend(
            safe_collect(
                "GLEIF 法人主体资料",
                warnings,
                lambda: collect_gleif_company_materials(settings, display_name),
            )
        )
        # 新增: News API 财经新闻
        news_api_key = clean_optional(settings.news_api_key)
        if news_api_key:
            materials.extend(
                safe_collect(
                    "News API 财经新闻",
                    warnings,
                    lambda: collect_news_api_materials(settings, display_name, api_key=news_api_key),
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
                lambda: collect_fred_commodity_materials(
                    settings,
                    display_name,
                    lookback_days=lookback_days,
                ),
            )
        )
        if is_gold_commodity(display_name):
            materials.extend(
                safe_collect(
                    "FRED 黄金宏观驱动",
                    warnings,
                    lambda: collect_fred_gold_driver_materials(
                        settings,
                        lookback_days=lookback_days,
                    ),
                )
            )
        materials.extend(
            safe_collect(
                "EIA 能源价格",
                warnings,
                lambda: collect_eia_energy_materials(settings, display_name),
            )
        )
        # 新增: Yahoo Finance 商品数据
        if is_commodity_with_yahoo(display_name):
            yahoo_commodity = map_to_yahoo_commodity(display_name)
            if yahoo_commodity:
                materials.extend(
                    safe_collect(
                        "Yahoo Finance 商品行情",
                        warnings,
                        lambda: collect_yahoo_stock_materials(settings, yahoo_commodity, lookback_days=lookback_days),
                    )
                )
        # 新增: World Bank 宏观经济数据
        if is_macro_economic_query(display_name):
            materials.extend(
                safe_collect(
                    "World Bank 宏观经济数据",
                    warnings,
                    lambda: collect_world_bank_materials(settings),
                )
            )
        # 新增: News API 财经新闻
        news_api_key = clean_optional(settings.news_api_key)
        if news_api_key:
            materials.extend(
                safe_collect(
                    "News API 财经新闻",
                    warnings,
                    lambda: collect_news_api_materials(settings, display_name, api_key=news_api_key),
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
                    lookback_days=lookback_days,
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


def collect_fred_commodity_materials(
    settings: Any,
    commodity_name: str,
    *,
    lookback_days: int,
) -> list[dict[str, Any]]:
    api_key = clean_optional(settings.fred_api_key)
    if not api_key:
        return []
    series = resolve_commodity_key(COMMODITY_FRED_SERIES, commodity_name)
    if not series:
        return []
    series_id, series_name = series
    limit = fred_observation_limit(series_id, lookback_days)
    payload = request_json(
        FRED_URL,
        params={
            "series_id": series_id,
            "api_key": api_key,
            "file_type": "json",
            "observation_start": fred_observation_start(lookback_days),
            "sort_order": "desc",
            "limit": str(limit),
        },
    )
    observations = payload.get("observations") if isinstance(payload, dict) else None
    if not isinstance(observations, list) or not observations:
        return []
    rows = clean_numeric_observations(observations)
    if not rows:
        return []
    latest = rows[0]
    stats = summarize_numeric_observations(rows)
    stats_summary = format_series_stats_summary(series_name, stats)
    return [
        build_material_payload(
            title=f"{commodity_name} FRED 价格波动序列",
            summary=stats_summary,
            content_text=json.dumps(
                {
                    "series_id": series_id,
                    "series_name": series_name,
                    "lookback_days": lookback_days,
                    "stats": stats,
                    "observations_desc": rows[: min(len(rows), 90)],
                },
                ensure_ascii=False,
                indent=2,
            ),
            source_name="Federal Reserve Economic Data (FRED)",
            source_url=f"https://fred.stlouisfed.org/series/{series_id}",
            source_type=SourceType.API.value,
            authority_level=AuthorityLevel.HIGH.value,
            published_at=parse_date(str(latest.get("date") or "")),
            relevance_score=9.6 if is_gold_commodity(commodity_name) else 8.8,
            dedup_key=f"fred:{series_id}:{latest.get('date')}",
        )
    ]


def collect_fred_gold_driver_materials(settings: Any, *, lookback_days: int) -> list[dict[str, Any]]:
    api_key = clean_optional(settings.fred_api_key)
    if not api_key:
        return []

    series_payload: dict[str, Any] = {}
    summary_lines: list[str] = []
    latest_dates: list[str] = []

    for series_id, series_name in FRED_GOLD_DRIVER_SERIES.items():
        payload = request_json(
            FRED_URL,
            params={
                "series_id": series_id,
                "api_key": api_key,
                "file_type": "json",
                "observation_start": fred_observation_start(lookback_days),
                "sort_order": "desc",
                "limit": str(fred_observation_limit(series_id, lookback_days)),
            },
        )
        observations = payload.get("observations") if isinstance(payload, dict) else None
        if not isinstance(observations, list) or not observations:
            continue

        rows = clean_numeric_observations(observations)
        if not rows:
            continue

        stats = summarize_numeric_observations(rows)
        series_payload[series_id] = {
            "series_name": series_name,
            "stats": stats,
            "observations_desc": rows[: min(len(rows), 90)],
        }
        summary_lines.append(format_series_stats_summary(series_name, stats))
        latest_dates.append(str(stats.get("latest_date") or ""))

    if not series_payload:
        return []

    latest_date = max((item for item in latest_dates if item), default="")
    return [
        build_material_payload(
            title="黄金价格宏观驱动 FRED 序列",
            summary=(
                "；".join(summary_lines[:3])
                + "。这些序列可用于解释黄金价格与利率、实际利率、美元指数之间的同向或反向压力。"
            ),
            content_text=json.dumps(series_payload, ensure_ascii=False, indent=2),
            source_name="Federal Reserve Economic Data (FRED)",
            source_url="https://fred.stlouisfed.org/",
            source_type=SourceType.API.value,
            authority_level=AuthorityLevel.HIGH.value,
            published_at=parse_date(latest_date),
            relevance_score=9.2,
            dedup_key=f"fred:gold_drivers:{latest_date}",
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
    lookback_days: int,
) -> list[dict[str, Any]]:
    prompt = build_web_source_prompt(
        object_type=object_type,
        object_name=object_name,
        research_goal=research_goal,
        source_strategy=source_strategy,
        lookback_days=lookback_days,
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


def build_web_source_prompt(
    *,
    object_type: str,
    object_name: str,
    research_goal: str | None,
    source_strategy: str | None,
    lookback_days: int,
) -> str:
    research_goal_text = research_goal or "未指定"
    base_prompt = (
        "请围绕一个商业调研对象做公开资料检索，并只总结可追溯来源里的内容。\n"
        f"对象类型：{object_type}\n"
        f"对象名称：{object_name}\n"
        f"观察区间：近 {lookback_days} 天\n"
        f"研究目标：{research_goal_text}\n"
        f"信息源策略：{source_strategy or 'DEFAULT'}\n\n"
        "通用要求：优先官方、监管、交易所、政府、公司官网、主流财经媒体。"
        "区分硬事实、媒体报道、市场观点。输出中文要点，避免投资建议。"
    )

    if object_type.upper() == ObjectType.COMMODITY.value:
        commodity_focus = (
            "\n\n商品研究额外要求：必须围绕价格走势、供需、库存/储备、政策、宏观变量、"
            "地缘事件和市场预期组织材料。若用户目标涉及价格、波动或走势，"
            "请优先检索价格水平、近阶段涨跌幅、区间高低点和驱动因素。"
        )
        if is_gold_commodity(object_name):
            commodity_focus += (
                "这是黄金价格波动研究，请重点检索 spot gold / XAU/USD / COMEX gold / LBMA gold "
                "以及黄金价格上涨或下跌原因；必须覆盖美元、名义利率、实际利率、"
                "美联储预期、央行购金、ETF/投资需求、地缘政治和避险需求。"
                "不要把央行黄金储备变化当成价格波动本身；它只能作为需求侧因素之一。"
            )
        if is_price_research(research_goal_text):
            commodity_focus += (
                "最终摘要必须先回答“价格怎么动”，再解释“为什么动”。"
            )
        return base_prompt + commodity_focus

    return base_prompt


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


def is_gold_commodity(commodity_name: str) -> bool:
    normalized = commodity_name.strip().casefold()
    return any(keyword.casefold() in normalized for keyword in GOLD_COMMODITY_KEYWORDS)


def is_price_research(research_goal: str | None) -> bool:
    normalized = (research_goal or "").casefold()
    return any(keyword.casefold() in normalized for keyword in PRICE_RESEARCH_KEYWORDS)


def fred_observation_limit(series_id: str, lookback_days: int) -> int:
    if series_id in FRED_DAILY_COMMODITY_SERIES or series_id in FRED_GOLD_DRIVER_SERIES:
        return min(max(lookback_days + 45, 90), 420)
    return 36


def fred_observation_start(lookback_days: int) -> str:
    start_date = datetime.now(timezone.utc).date() - timedelta(days=max(lookback_days, 1) + 7)
    return start_date.isoformat()


def clean_numeric_observations(observations: list[Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in observations:
        if not isinstance(item, dict):
            continue
        value = parse_float(item.get("value"))
        date_value = str(item.get("date") or "").strip()
        if value is None or not date_value:
            continue
        rows.append({"date": date_value, "value": value})
    return rows


def summarize_numeric_observations(rows: list[dict[str, Any]]) -> dict[str, Any]:
    latest = rows[0]
    earliest = rows[-1]
    values = [float(row["value"]) for row in rows]
    high_row = max(rows, key=lambda row: float(row["value"]))
    low_row = min(rows, key=lambda row: float(row["value"]))
    latest_value = float(latest["value"])
    earliest_value = float(earliest["value"])
    absolute_change = latest_value - earliest_value
    percent_change = (
        absolute_change / earliest_value * 100 if earliest_value not in (0, 0.0) else None
    )
    high_value = float(high_row["value"])
    low_value = float(low_row["value"])
    range_percent = (high_value - low_value) / low_value * 100 if low_value not in (0, 0.0) else None
    average_value = sum(values) / len(values)

    return {
        "sample_count": len(rows),
        "earliest_date": earliest["date"],
        "earliest_value": round(earliest_value, 4),
        "latest_date": latest["date"],
        "latest_value": round(latest_value, 4),
        "absolute_change": round(absolute_change, 4),
        "percent_change": round(percent_change, 4) if percent_change is not None else None,
        "high_date": high_row["date"],
        "high_value": round(high_value, 4),
        "low_date": low_row["date"],
        "low_value": round(low_value, 4),
        "range_percent": round(range_percent, 4) if range_percent is not None else None,
        "average_value": round(average_value, 4),
    }


def format_series_stats_summary(series_name: str, stats: dict[str, Any]) -> str:
    percent_change = stats.get("percent_change")
    range_percent = stats.get("range_percent")
    percent_text = "未知"
    if isinstance(percent_change, (int, float)):
        percent_text = f"{percent_change:+.2f}%"
    range_text = "未知"
    if isinstance(range_percent, (int, float)):
        range_text = f"{range_percent:.2f}%"
    return (
        f"{series_name}在 {stats.get('earliest_date')} 至 {stats.get('latest_date')} "
        f"从 {stats.get('earliest_value')} 变至 {stats.get('latest_value')}，"
        f"区间涨跌幅 {percent_text}；样本内最高 {stats.get('high_value')} "
        f"({stats.get('high_date')})，最低 {stats.get('low_value')} "
        f"({stats.get('low_date')})，高低区间幅度 {range_text}"
    )


def parse_float(value: Any) -> float | None:
    if value is None:
        return None
    normalized = str(value).strip()
    if not normalized or normalized == ".":
        return None
    try:
        return float(normalized)
    except ValueError:
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


# 公司名称到股票代码的映射
COMPANY_NAME_TO_SYMBOL = {
    "苹果公司": "AAPL",
    "苹果": "AAPL",
    "apple": "AAPL",
    "微软": "MSFT",
    "microsoft": "MSFT",
    "谷歌": "GOOGL",
    "google": "GOOGL",
    "Alphabet": "GOOGL",
    "亚马逊": "AMZN",
    "amazon": "AMZN",
    "特斯拉": "TSLA",
    "tesla": "TSLA",
    "英伟达": "NVDA",
    "nvidia": "NVDA",
    "台积电": "TSM",
    "tsmc": "TSM",
    "腾讯": "TCEHY",
    "tencent": "TCEHY",
    "阿里巴巴": "BABA",
    "alibaba": "BABA",
    "京东": "JD",
    "jd.com": "JD",
    "百度": "BIDU",
    "baidu": "BIDU",
    "比亚迪": "BYDDY",
    "索尼": "SONY",
    "sony": "SONY",
    "三星": "SSNLF",
    "samsung": "SSNLF",
    "Meta": "META",
    "facebook": "META",
    "奈飞": "NFLX",
    "netflix": "NFLX",
    "迪士尼": "DIS",
    "disney": "DIS",
    "耐克": "NKE",
    "nike": "NKE",
}


def detect_symbol(value: str) -> str | None:
    """从输入中检测股票代码"""
    normalized = value.strip()
    # 检查是否已经是股票代码格式
    if re.fullmatch(r"[A-Za-z]{1,5}(?:\.[A-Za-z]{1,3})?", normalized):
        return normalized.upper()
    # 检查公司名称映射
    for name, symbol in COMPANY_NAME_TO_SYMBOL.items():
        if name.lower() in normalized.lower():
            return symbol
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


def extract_chinese_stock_code(value: str | None) -> str | None:
    """从股票名称或代码中提取A股6位股票代码"""
    if not value:
        return None
    normalized = str(value).strip()
    match = re.fullmatch(r"\d{6}(?:\.(SH|SZ|BJ))?", normalized)
    if match:
        return match.group(0)[:6]
    match = re.search(r"(\d{6})", normalized)
    if match:
        return match.group(1)
    return None


MACRO_ECONOMIC_KEYWORDS = (
    "经济", "gdp", "宏观", "人口", "通胀", "economic", "inflation",
    "增长", "gdp增长", "人民币", "美元", "汇率", "外汇",
)


def is_macro_economic_query(object_name: str) -> bool:
    """判断是否是宏观经济相关查询"""
    normalized = object_name.lower()
    return any(kw in normalized for kw in MACRO_ECONOMIC_KEYWORDS)


COMMODITY_TO_YAHOO = {
    "原油": "CL=F",
    "oil": "CL=F",
    "wti": "CL=F",
    "布伦特": "BZ=F",
    "brent": "BZ=F",
    "天然气": "NG=F",
    "natural gas": "NG=F",
    "黄金": "GC=F",
    "gold": "GC=F",
    "xau": "GC=F",
    "白银": "SI=F",
    "silver": "SI=F",
    "铜": "HG=F",
    "copper": "HG=F",
    "玉米": "ZC=F",
    "corn": "ZC=F",
    "小麦": "ZW=F",
    "wheat": "ZW=F",
    "大豆": "ZS=F",
    "soybean": "ZS=F",
}


def is_commodity_with_yahoo(object_name: str) -> bool:
    """判断是否为可在 Yahoo Finance 查询的商品"""
    normalized = object_name.lower()
    return any(kw in normalized for kw in COMMODITY_TO_YAHOO.keys())


def map_to_yahoo_commodity(object_name: str) -> str | None:
    """将商品名称映射到 Yahoo Finance 交易代码"""
    normalized = object_name.lower()
    for kw, yahoo_code in COMMODITY_TO_YAHOO.items():
        if kw in normalized:
            return yahoo_code
    return None
