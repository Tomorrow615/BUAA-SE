"""
扩展数据源服务 - 提供更丰富的股票、公司和商品数据
包含: Yahoo Finance, AkShare, World Bank, News API, 东方财富资讯
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import json
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.models.enums import AuthorityLevel, ObjectType, SourceType


DEFAULT_USER_AGENT = "BUAA-SE business research demo"


# ============================================================
# Yahoo Finance 接口
# ============================================================
YAHOO_FINANCE_BASE_URL = "https://query1.finance.yahoo.com/v8/finance"
YAHOO_FINANCE_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart"
YAHOO_FINANCE_QUOTE_URL = "https://query1.finance.yahoo.com/v7/finance/quote"

YAHOO_STOCK_KEYWORDS = ("stock", "equity", "shares", "美股", "纳斯达克", "纽交所")


def is_yahoo_stock_query(object_type: str, object_name: str) -> bool:
    normalized_type = object_type.upper()
    if normalized_type == ObjectType.STOCK.value:
        normalized_name = object_name.lower()
        return any(kw in normalized_name for kw in YAHOO_STOCK_KEYWORDS) or \
               not any(c in object_name for c in "沪深港")
    return False


def collect_yahoo_stock_materials(
    settings: Any,
    symbol: str,
    lookback_days: int = 30,
) -> list[dict[str, Any]]:
    """收集 Yahoo Finance 美股数据"""
    materials: list[dict[str, Any]] = []

    chart_data = request_yahoo_json(
        YAHOO_FINANCE_CHART_URL,
        params={
            "symbol": symbol,
            "interval": "1d",
            "range": f"{lookback_days}d",
        },
    )
    if not chart_data:
        return materials

    result = chart_data.get("chart", {}).get("result", [])
    if not result:
        return materials

    quote = result[0]
    timestamps = quote.get("timestamp", [])
    indicators = quote.get("indicators", {})
    quote_indicators = indicators.get("quote", [{}])[0]
    closes = quote_indicators.get("close", [])
    volumes = quote_indicators.get("volume", [])
    highs = quote_indicators.get("high", [])
    lows = quote_indicators.get("low", [])

    if not closes or not timestamps:
        return materials

    valid_points = [
        {"date": ts, "close": c, "volume": v, "high": h, "low": l}
        for ts, c, v, h, l in zip(timestamps, closes, volumes, highs, lows)
        if c is not None
    ]

    if not valid_points:
        return materials

    summary_data = summarize_yahoo_data(valid_points, symbol)
    latest = valid_points[-1]
    latest_date = datetime.fromtimestamp(latest["date"], tz=timezone.utc)

    materials.append(
        build_material_payload(
            title=f"{symbol} Yahoo Finance 历史行情",
            summary=(
                f"{symbol} 近 {len(valid_points)} 个交易日，"
                f"最新收盘 {latest['close']:.2f}，"
                f"区间涨跌 {summary_data['period_change_pct']:.2f}%。"
            ),
            content_text=json.dumps({
                "symbol": symbol,
                "data_source": "Yahoo Finance",
                "trading_days": len(valid_points),
                "stats": summary_data,
                "recent_closes": [p["close"] for p in valid_points[-10:]],
            }, ensure_ascii=False, indent=2),
            source_name="Yahoo Finance",
            source_url=f"https://finance.yahoo.com/quote/{symbol}",
            source_type=SourceType.API.value,
            authority_level=AuthorityLevel.MEDIUM.value,
            published_at=latest_date,
            relevance_score=8.5,
            dedup_key=f"yahoo:{symbol}:{lookback_days}d",
        )
    )

    return materials


def summarize_yahoo_data(points: list[dict], symbol: str) -> dict[str, Any]:
    """计算 Yahoo Finance 数据统计"""
    closes = [p["close"] for p in points]
    volumes = [p["volume"] for p in points if p["volume"]]

    first_close = closes[0]
    last_close = closes[-1]
    period_change_pct = ((last_close - first_close) / first_close * 100) if first_close else 0

    return {
        "symbol": symbol,
        "period_change_pct": round(period_change_pct, 2),
        "period_high": round(max(closes), 2),
        "period_low": round(min(closes), 2),
        "latest_close": round(last_close, 2),
        "avg_volume": round(sum(volumes) / len(volumes), 0) if volumes else 0,
        "total_volume": sum(volumes),
    }


# ============================================================
# AkShare 接口 (A股、港股、宏观数据)
# ============================================================
AKSHARE_API_URL = "https://api.akassets.cn/api"  # 公共数据镜像
AKSHARE_KEYWORDS = ("a股", "沪深", "沪指", "深指", "创业板", "科创板", "港股", "恒生", "A股")


def is_akshare_query(object_name: str) -> bool:
    normalized = object_name.lower()
    return any(kw in normalized for kw in AKSHARE_KEYWORDS)


def collect_akshare_stock_materials(
    settings: Any,
    stock_code: str,
    lookback_days: int = 30,
) -> list[dict[str, Any]]:
    """收集 AkShare A股/港股数据"""
    materials: list[dict[str, Any]] = []

    daily_data = fetch_akshare_daily_kline(stock_code, days=lookback_days)
    if daily_data:
        materials.append(daily_data)

    return materials


def fetch_akshare_daily_kline(stock_code: str, days: int = 30) -> dict[str, Any] | None:
    """获取 AkShare 日线数据"""
    try:
        import akshare as ak
        period_days = max(days * 3, 60)
        end_date = datetime.now().strftime("%Y%m%d")
        start_date = (datetime.now() - timedelta(days=period_days)).strftime("%Y%m%d")

        if stock_code.startswith(("6", "5", "9")):
            symbol = f"sh{stock_code}"
        elif stock_code.startswith(("0", "1", "3")):
            symbol = f"sz{stock_code}"
        elif stock_code.startswith(("8", "4")):
            symbol = f"bj{stock_code}"
        elif stock_code.startswith(("hk", "港")):
            symbol = f"hks{stock_code}"
        else:
            symbol = stock_code

        df = ak.stock_zh_a_hist(symbol=symbol, period="daily",
                                start_date=start_date, end_date=end_date, adjust="qfq")

        if df is None or df.empty:
            return None

        df = df.tail(days)

        closes = df["收盘"].tolist()
        if not closes:
            return None

        latest_date_str = df.iloc[-1]["日期"]
        latest_date = datetime.strptime(latest_date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)

        first_close = closes[0]
        last_close = closes[-1]
        period_change = ((last_close - first_close) / first_close * 100) if first_close else 0

        return build_material_payload(
            title=f"{stock_code} AkShare A股日线数据",
            summary=(
                f"{stock_code} 近 {len(closes)} 个交易日，"
                f"最新收盘 {last_close:.2f}，"
                f"区间涨跌 {period_change:.2f}%。"
            ),
            content_text=json.dumps({
                "stock_code": stock_code,
                "data_source": "AkShare",
                "trading_days": len(closes),
                "period_change_pct": round(period_change, 2),
                "period_high": round(max(df["最高"].tolist()), 2),
                "period_low": round(min(df["最低"].tolist()), 2),
                "latest_close": round(last_close, 2),
                "avg_volume": round(df["成交量"].mean(), 0),
            }, ensure_ascii=False, indent=2),
            source_name="AkShare",
            source_url="https://www.akshare.akfamily.xyz/",
            source_type=SourceType.API.value,
            authority_level=AuthorityLevel.MEDIUM.value,
            published_at=latest_date,
            relevance_score=8.0,
            dedup_key=f"akshare:{stock_code}:{days}d",
        )
    except Exception:
        return None


# ============================================================
# World Bank API (全球经济数据)
# ============================================================
WORLD_BANK_API_URL = "https://api.worldbank.org/v2"
WORLD_BANK_KEYWORDS = ("gdp", "经济", "人口", "gdp增长", "人均gdp", "inflation", "economic")


def is_world_bank_query(object_name: str) -> bool:
    normalized = object_name.lower()
    return any(kw in normalized for kw in WORLD_BANK_KEYWORDS)


def collect_world_bank_materials(
    settings: Any,
    country: str = "CHN",
    indicators: list[str] | None = None,
) -> list[dict[str, Any]]:
    """收集 World Bank 经济数据"""
    if indicators is None:
        indicators = ["NY.GDP.MKTP.CD", "NY.GDP.PCAP.CD", "SP.POP.TOTL"]

    materials: list[dict[str, Any]] = []

    for indicator in indicators:
        data = fetch_world_bank_indicator(country, indicator)
        if data:
            materials.append(data)

    if materials:
        materials.append(collect_world_bank_overview(country))

    return materials


def fetch_world_bank_indicator(country: str, indicator: str) -> dict[str, Any] | None:
    """获取单个经济指标数据"""
    try:
        end_date = datetime.now().year
        start_date = end_date - 5

        url = f"{WORLD_BANK_API_URL}/country/{country}/indicator/{indicator}"
        params = {
            "format": "json",
            "date": f"{start_date}:{end_date}",
            "per_page": 50,
        }

        response = request_json(url, params=params)
        if not isinstance(response, list) or len(response) < 2:
            return None

        data = response[1]
        if not data:
            return None

        indicator_name = data[0].get("indicator", {}).get("value", indicator) if data else indicator

        cleaned_data = [
            {"year": int(item["date"]), "value": item["value"]}
            for item in data
            if item.get("value") is not None
        ]

        if not cleaned_data:
            return None

        latest = cleaned_data[0]

        return build_material_payload(
            title=f"{country} {indicator_name} 宏观数据",
            summary=(
                f"{country} {indicator_name} 最新数据 "
                f"{latest['year']}年: {format_world_bank_value(latest['value'], indicator)}。"
            ),
            content_text=json.dumps({
                "country": country,
                "indicator": indicator,
                "indicator_name": indicator_name,
                "data_points": cleaned_data,
            }, ensure_ascii=False, indent=2),
            source_name="World Bank Open Data",
            source_url=f"https://data.worldbank.org/indicator/{indicator}",
            source_type=SourceType.API.value,
            authority_level=AuthorityLevel.HIGH.value,
            published_at=datetime.now(timezone.utc),
            relevance_score=7.5,
            dedup_key=f"worldbank:{country}:{indicator}",
        )
    except Exception:
        return None


def collect_world_bank_overview(country: str) -> dict[str, Any]:
    """收集 World Bank 国家概览"""
    try:
        response = request_json(
            f"{WORLD_BANK_API_URL}/country/{country}",
            params={"format": "json", "per_page": 1},
        )
        if isinstance(response, list) and len(response) > 1 and response[1]:
            country_info = response[1][0]
            return build_material_payload(
                title=f"{country} 国家基本信息",
                summary=f"世界银行 {country} 国家基础信息概览。",
                content_text=json.dumps(country_info, ensure_ascii=False, indent=2),
                source_name="World Bank Open Data",
                source_url=f"https://data.worldbank.org/country/{country}",
                source_type=SourceType.API.value,
                authority_level=AuthorityLevel.HIGH.value,
                published_at=datetime.now(timezone.utc),
                relevance_score=7.0,
                dedup_key=f"worldbank:overview:{country}",
            )
    except Exception:
        pass

    return {}


def format_world_bank_value(value: float | None, indicator: str) -> str:
    """格式化 World Bank 数值"""
    if value is None:
        return "暂无数据"

    if "GDP" in indicator and "PCAP" not in indicator:
        return f"${value / 1e9:.2f}B (美元)"
    elif "PCAP" in indicator:
        return f"${value:.2f} (人均美元)"
    elif "POP" in indicator:
        return f"{value:,.0f} 人"

    return f"{value:,.2f}"


# ============================================================
# News API (财经新闻)
# ============================================================
NEWS_API_URL = "https://newsapi.org/v2"
NEWS_API_KEYWORDS = ("新闻", "news", "公告", "财报", "季报", "年报", "业绩")


def is_news_query(object_name: str) -> bool:
    normalized = object_name.lower()
    return any(kw in normalized for kw in NEWS_API_KEYWORDS)


def collect_news_api_materials(
    settings: Any,
    query: str,
    api_key: str | None = None,
    max_results: int = 10,
) -> list[dict[str, Any]]:
    """收集 News API 财经新闻"""
    if not api_key:
        return []

    materials: list[dict[str, Any]] = []

    try:
        url = f"{NEWS_API_URL}/everything"
        params = {
            "q": query,
            "apiKey": api_key,
            "language": "zh",
            "sortBy": "publishedAt",
            "pageSize": min(max_results, 20),
        }

        response = request_json(url, params=params)
        articles = response.get("articles", []) if isinstance(response, dict) else []

        if not articles:
            return materials

        news_items = []
        for article in articles[:max_results]:
            published_at_str = article.get("publishedAt")
            published_at = None
            if published_at_str:
                try:
                    published_at = datetime.fromisoformat(
                        published_at_str.replace("Z", "+00:00")
                    )
                except ValueError:
                    pass

            news_items.append({
                "title": article.get("title"),
                "description": article.get("description"),
                "source": article.get("source", {}).get("name"),
                "url": article.get("url"),
                "published_at": published_at_str,
            })

        materials.append(
            build_material_payload(
                title=f"'{query}' 最新财经新闻",
                summary=f"News API 返回 {len(news_items)} 条相关新闻。",
                content_text=json.dumps(news_items, ensure_ascii=False, indent=2),
                source_name="News API",
                source_url="https://newsapi.org/",
                source_type=SourceType.WEB.value,
                authority_level=AuthorityLevel.MEDIUM.value,
                published_at=datetime.now(timezone.utc),
                relevance_score=7.0,
                dedup_key=f"newsapi:{query}",
            )
        )

    except Exception:
        pass

    return materials


# ============================================================
# 东方财富资讯接口
# ============================================================
EASTMONEY_NEWS_URL = "https://np-listapi.eastmoney.com/comm/web/getVariableList"
EASTMONEY_ANNOUNCEMENT_URL = "https://np-anotice-stock.eastmoney.com/api/security/ann"

EASTMONEY_NEWS_KEYWORDS = ("a股", "沪深", "大盘", "指数", "市场", "板块", "概念")


def is_eastmoney_news_query(object_name: str) -> bool:
    normalized = object_name.lower()
    return any(kw in normalized for kw in EASTMONEY_NEWS_KEYWORDS)


def collect_eastmoney_news_materials(
    settings: Any,
    stock_code: str | None = None,
    lookback_days: int = 7,
) -> list[dict[str, Any]]:
    """收集东方财富资讯新闻"""
    materials: list[dict[str, Any]] = []

    news_data = fetch_eastmoney_stock_news(stock_code, lookback_days)
    if news_data:
        materials.append(news_data)

    if stock_code and len(stock_code) == 6:
        announcement_data = fetch_eastmoney_announcements(stock_code)
        if announcement_data:
            materials.append(announcement_data)

    return materials


def fetch_eastmoney_stock_news(
    stock_code: str | None = None,
    days: int = 7,
) -> dict[str, Any] | None:
    """获取东方财富个股新闻"""
    try:
        start_time = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")

        params = {
            "client": "web",
            "keyword": stock_code or "A股",
            "start_time": start_time,
            "end_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "page_index": 1,
            "page_size": 20,
            "order": 0,
        }

        response = request_json(EASTMONEY_NEWS_URL, params=params)
        if not isinstance(response, dict):
            return None

        data = response.get("data", {})
        if not data:
            return None

        items = data.get("variableList", [])
        if not items:
            return None

        news_items = []
        for item in items[:10]:
            news_items.append({
                "title": item.get("title"),
                "source": item.get("source"),
                "time": item.get("show_time"),
                "url": item.get("mid_url"),
            })

        return build_material_payload(
            title=f"{stock_code or 'A股市场'} 东方财富资讯",
            summary=f"东方财富返回 {len(news_items)} 条市场资讯。",
            content_text=json.dumps(news_items, ensure_ascii=False, indent=2),
            source_name="东方财富资讯",
            source_url="https://www.eastmoney.com/",
            source_type=SourceType.WEB.value,
            authority_level=AuthorityLevel.MEDIUM.value,
            published_at=datetime.now(timezone.utc),
            relevance_score=7.5,
            dedup_key=f"eastmoney:news:{stock_code}",
        )
    except Exception:
        return None


def fetch_eastmoney_announcements(stock_code: str) -> dict[str, Any] | None:
    """获取东方财富公司公告"""
    try:
        params = {
            "sr": -1,
            "page_size": 10,
            "page_index": 1,
            "ann_type": "A股",
            "stock_list": stock_code,
        }

        response = request_json(EASTMONEY_ANNOUNCEMENT_URL, params=params)
        if not isinstance(response, dict):
            return None

        data = response.get("data", {})
        if not data:
            return None

        notices = data.get("list", [])
        if not notices:
            return None

        announcement_items = []
        for notice in notices[:10]:
            announcement_items.append({
                "title": notice.get("title"),
                "announcement_date": notice.get("notice_date"),
                "category": notice.get("art_cat"),
                "url": f"https://np-cnotice-stock.eastmoney.com/notices/detail?noticeId={notice.get('notice_id')}",
            })

        return build_material_payload(
            title=f"{stock_code} 东方财富公司公告",
            summary=f"东方财富返回 {len(announcement_items)} 条公司公告。",
            content_text=json.dumps(announcement_items, ensure_ascii=False, indent=2),
            source_name="东方财富公告",
            source_url="https://www.eastmoney.com/",
            source_type=SourceType.WEB.value,
            authority_level=AuthorityLevel.MEDIUM.value,
            published_at=datetime.now(timezone.utc),
            relevance_score=8.0,
            dedup_key=f"eastmoney:ann:{stock_code}",
        )
    except Exception:
        return None


# ============================================================
# 公共工具函数
# ============================================================

def request_json(
    url: str,
    params: dict[str, str] | None = None,
    headers: dict[str, str] | None = None,
    method: str = "GET",
) -> dict[str, Any]:
    """通用 JSON 请求函数"""
    final_url = f"{url}?{urlencode(params)}" if params else url
    request_headers = {
        "User-Agent": DEFAULT_USER_AGENT,
        "Accept": "application/json,text/plain,*/*",
        **(headers or {}),
    }

    last_error: Exception | None = None
    for attempt in range(2):
        try:
            request = Request(final_url, headers=request_headers, method=method)
            with urlopen(request, timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
            last_error = error
            if attempt == 1:
                break
            time.sleep(1)

    raise RuntimeError(str(last_error))


def request_yahoo_json(url: str, params: dict[str, str]) -> dict[str, Any]:
    """Yahoo Finance 专用请求"""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
    }
    return request_json(url, params=params, headers=headers)


def build_material_payload(
    *,
    title: str,
    summary: str,
    content_text: str,
    source_name: str,
    source_url: str,
    source_type: str,
    authority_level: str,
    published_at: datetime | None,
    relevance_score: float,
    dedup_key: str,
) -> dict[str, Any]:
    """构建素材负载"""
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
