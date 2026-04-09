from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from http.client import RemoteDisconnected
import json
import math
import re
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


EASTMONEY_QUOTE_URL = "https://push2.eastmoney.com/api/qt/stock/get"
EASTMONEY_KLINE_URL = "https://push2his.eastmoney.com/api/qt/stock/kline/get"
EASTMONEY_LIST_URL = "https://push2.eastmoney.com/api/qt/clist/get"
EASTMONEY_REFERER = "https://quote.eastmoney.com/"
EASTMONEY_SOURCE_NAME = "东方财富公开行情接口"
DIRECTORY_PAGE_SIZE = 200
RECENT_TIMELINE_LIMIT = 5


@dataclass(frozen=True)
class StockIdentity:
    code: str
    name: str
    market_code: int
    exchange: str
    quote_id: str
    symbol: str
    quote_page_url: str


@dataclass(frozen=True)
class QuoteSnapshot:
    security_name: str
    latest_price: float
    change_amount: float
    change_percent: float
    open_price: float
    high_price: float
    low_price: float
    previous_close: float
    volume: float
    turnover_amount: float
    turnover_rate: float | None
    pe_ratio: float | None
    pb_ratio: float | None
    total_market_cap: float | None
    circulating_market_cap: float | None
    captured_at: datetime


@dataclass(frozen=True)
class KlinePoint:
    trade_date: datetime
    open_price: float
    close_price: float
    high_price: float
    low_price: float
    volume: float
    turnover_amount: float
    amplitude: float
    change_percent: float
    change_amount: float
    turnover_rate: float | None


@dataclass(frozen=True)
class StockResearchBundle:
    stock: StockIdentity
    quote: QuoteSnapshot
    recent_klines: list[KlinePoint]
    lookback_days: int
    generated_at: datetime
    stats: dict[str, Any]


def parse_lookback_days(time_range: str | None, default_days: int) -> int:
    if not time_range:
        return default_days

    match = re.search(r"(\d{1,3})", time_range)
    if match is None:
        return default_days

    parsed = int(match.group(1))
    return max(5, min(parsed, 180))


def collect_stock_research_bundle(
    stock_query: str,
    *,
    lookback_days: int,
) -> StockResearchBundle:
    stock = resolve_stock_identity(stock_query)
    quote = fetch_quote_snapshot(stock)
    if stock.name == stock.code and quote.security_name:
        stock = build_stock_identity(
            code=stock.code,
            name=quote.security_name,
            market_code=stock.market_code,
        )
    recent_klines = fetch_recent_klines(stock, lookback_days=lookback_days)
    stats = build_stock_statistics(quote, recent_klines)

    return StockResearchBundle(
        stock=stock,
        quote=quote,
        recent_klines=recent_klines,
        lookback_days=lookback_days,
        generated_at=datetime.now(timezone.utc),
        stats=stats,
    )


def build_stock_material_payloads(bundle: StockResearchBundle) -> list[dict[str, Any]]:
    materials: list[dict[str, Any]] = []

    materials.append(
        build_material_payload(
            source_id="SRC_001",
            title=f"{bundle.stock.name} 实时行情快照",
            summary=(
                f"最新价 {bundle.quote.latest_price:.2f}，"
                f"涨跌幅 {bundle.quote.change_percent:.2f}%，"
                f"日内区间 {bundle.quote.low_price:.2f} - {bundle.quote.high_price:.2f}。"
            ),
            content_text="\n".join(
                [
                    f"股票代码：{bundle.stock.symbol}",
                    f"股票名称：{bundle.stock.name}",
                    f"最新价：{bundle.quote.latest_price:.2f}",
                    f"涨跌额：{bundle.quote.change_amount:.2f}",
                    f"涨跌幅：{bundle.quote.change_percent:.2f}%",
                    f"开盘价：{bundle.quote.open_price:.2f}",
                    f"最高价：{bundle.quote.high_price:.2f}",
                    f"最低价：{bundle.quote.low_price:.2f}",
                    f"昨收价：{bundle.quote.previous_close:.2f}",
                    f"成交量：{format_number(bundle.quote.volume)}",
                    f"成交额：{format_number(bundle.quote.turnover_amount)}",
                    f"换手率：{format_optional_percent(bundle.quote.turnover_rate)}",
                    f"市盈率：{format_optional_number(bundle.quote.pe_ratio)}",
                    f"市净率：{format_optional_number(bundle.quote.pb_ratio)}",
                    f"总市值：{format_optional_number(bundle.quote.total_market_cap)}",
                    f"流通市值：{format_optional_number(bundle.quote.circulating_market_cap)}",
                    f"采集时间：{bundle.quote.captured_at.isoformat()}",
                ]
            ),
            published_at=bundle.quote.captured_at,
            source_url=bundle.stock.quote_page_url,
            authority_level="MEDIUM",
            relevance_score=9.8,
        )
    )

    materials.append(
        build_material_payload(
            source_id="SRC_002",
            title=f"{bundle.stock.name} 近 {bundle.lookback_days} 日走势统计",
            summary=(
                f"区间涨跌幅 {bundle.stats['period_return_pct']:.2f}%，"
                f"最高价 {bundle.stats['period_high']:.2f}，"
                f"最低价 {bundle.stats['period_low']:.2f}，"
                f"最大回撤 {bundle.stats['max_drawdown_pct']:.2f}%。"
            ),
            content_text="\n".join(
                [
                    f"统计区间交易日数：{bundle.stats['trading_days']}",
                    f"区间起始收盘价：{bundle.stats['first_close']:.2f}",
                    f"区间结束收盘价：{bundle.stats['last_close']:.2f}",
                    f"区间涨跌幅：{bundle.stats['period_return_pct']:.2f}%",
                    f"近5日涨跌幅：{bundle.stats['five_day_return_pct']:.2f}%",
                    f"区间最高价：{bundle.stats['period_high']:.2f}",
                    f"区间最低价：{bundle.stats['period_low']:.2f}",
                    f"区间振幅：{bundle.stats['range_amplitude_pct']:.2f}%",
                    f"最大回撤：{bundle.stats['max_drawdown_pct']:.2f}%",
                    f"上涨天数：{bundle.stats['positive_days']}",
                    f"下跌天数：{bundle.stats['negative_days']}",
                    f"平均成交量：{format_number(bundle.stats['avg_volume'])}",
                    f"平均成交额：{format_number(bundle.stats['avg_turnover_amount'])}",
                    f"平均换手率：{format_optional_percent(bundle.stats['avg_turnover_rate'])}",
                ]
            ),
            published_at=bundle.recent_klines[-1].trade_date,
            source_url=bundle.stock.quote_page_url,
            authority_level="MEDIUM",
            relevance_score=9.6,
        )
    )

    for index, point in enumerate(bundle.recent_klines[-RECENT_TIMELINE_LIMIT:], start=3):
        materials.append(
            build_material_payload(
                source_id=f"SRC_{index:03d}",
                title=f"{bundle.stock.name} {point.trade_date.strftime('%Y-%m-%d')} 日线记录",
                summary=(
                    f"收盘 {point.close_price:.2f}，"
                    f"涨跌幅 {point.change_percent:.2f}%，"
                    f"日内高低 {point.low_price:.2f} - {point.high_price:.2f}。"
                ),
                content_text="\n".join(
                    [
                        f"交易日：{point.trade_date.strftime('%Y-%m-%d')}",
                        f"开盘价：{point.open_price:.2f}",
                        f"收盘价：{point.close_price:.2f}",
                        f"最高价：{point.high_price:.2f}",
                        f"最低价：{point.low_price:.2f}",
                        f"涨跌额：{point.change_amount:.2f}",
                        f"涨跌幅：{point.change_percent:.2f}%",
                        f"振幅：{point.amplitude:.2f}%",
                        f"成交量：{format_number(point.volume)}",
                        f"成交额：{format_number(point.turnover_amount)}",
                        f"换手率：{format_optional_percent(point.turnover_rate)}",
                    ]
                ),
                published_at=point.trade_date,
                source_url=bundle.stock.quote_page_url,
                authority_level="MEDIUM",
                relevance_score=8.5,
            )
        )

    return materials


def build_material_payload(
    *,
    source_id: str,
    title: str,
    summary: str,
    content_text: str,
    published_at: datetime,
    source_url: str,
    authority_level: str,
    relevance_score: float,
) -> dict[str, Any]:
    return {
        "topic_tag": source_id,
        "title": title,
        "summary": summary,
        "content_text": content_text,
        "source_name": EASTMONEY_SOURCE_NAME,
        "source_url": source_url,
        "source_type": "API",
        "authority_level": authority_level,
        "published_at": published_at,
        "relevance_score": relevance_score,
        "is_selected": True,
        "dedup_key": f"{source_id}:{published_at.isoformat()}:{title}",
    }


def resolve_stock_identity(stock_query: str) -> StockIdentity:
    normalized = stock_query.strip()
    if not normalized:
        raise RuntimeError("Stock query is empty.")

    direct_match = re.fullmatch(r"(?i)(\d{6})(?:\.(SH|SZ|BJ))?", normalized)
    if direct_match is not None:
        code = direct_match.group(1)
        exchange = (direct_match.group(2) or infer_exchange_from_code(code)).upper()
        market_code = exchange_to_market_code(exchange)
        return build_stock_identity(code=code, name=code, market_code=market_code)

    lowered_query = normalized.casefold()
    for entry in load_stock_directory():
        if entry.name.casefold() == lowered_query:
            return entry

    for entry in load_stock_directory():
        if lowered_query in entry.name.casefold():
            return entry

    raise RuntimeError(
        "Unable to resolve the stock name. Please retry with a 6-digit stock code."
    )


def fetch_quote_snapshot(stock: StockIdentity) -> QuoteSnapshot:
    payload = request_json(
        EASTMONEY_QUOTE_URL,
        params={
            "secid": stock.quote_id,
            "fields": (
                "f57,f58,f43,f44,f45,f46,f47,f48,f60,f116,f117,"
                "f162,f167,f168,f169,f170,f171"
            ),
            "fltt": "2",
            "invt": "2",
            "ut": "fa5fd1943c7b386f172d6893dbfba10b",
        },
    )
    data = payload.get("data") or {}
    return QuoteSnapshot(
        security_name=str(data.get("f58") or stock.name),
        latest_price=to_float(data.get("f43")),
        change_amount=to_float(data.get("f169")),
        change_percent=to_float(data.get("f170")),
        open_price=to_float(data.get("f46")),
        high_price=to_float(data.get("f44")),
        low_price=to_float(data.get("f45")),
        previous_close=to_float(data.get("f60")),
        volume=to_float(data.get("f47")),
        turnover_amount=to_float(data.get("f48")),
        turnover_rate=to_optional_float(data.get("f168")),
        pe_ratio=to_optional_float(data.get("f162")),
        pb_ratio=to_optional_float(data.get("f167")),
        total_market_cap=to_optional_float(data.get("f116")),
        circulating_market_cap=to_optional_float(data.get("f117")),
        captured_at=datetime.now(timezone.utc),
    )


def fetch_recent_klines(stock: StockIdentity, *, lookback_days: int) -> list[KlinePoint]:
    start_date = (
        datetime.now(timezone.utc) - timedelta(days=max(lookback_days * 3, 45))
    ).strftime("%Y%m%d")
    payload = request_json(
        EASTMONEY_KLINE_URL,
        params={
            "secid": stock.quote_id,
            "fields1": "f1,f2,f3,f4,f5,f6",
            "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
            "klt": "101",
            "fqt": "1",
            "beg": start_date,
            "end": "20500101",
        },
    )
    raw_klines = (payload.get("data") or {}).get("klines") or []
    if not raw_klines:
        raise RuntimeError(f"No kline data was returned for {stock.symbol}.")

    points: list[KlinePoint] = []
    for item in raw_klines:
        (
            trade_date,
            open_price,
            close_price,
            high_price,
            low_price,
            volume,
            turnover_amount,
            amplitude,
            change_percent,
            change_amount,
            turnover_rate,
        ) = item.split(",")
        points.append(
            KlinePoint(
                trade_date=datetime.strptime(trade_date, "%Y-%m-%d").replace(
                    tzinfo=timezone.utc
                ),
                open_price=float(open_price),
                close_price=float(close_price),
                high_price=float(high_price),
                low_price=float(low_price),
                volume=float(volume),
                turnover_amount=float(turnover_amount),
                amplitude=float(amplitude),
                change_percent=float(change_percent),
                change_amount=float(change_amount),
                turnover_rate=to_optional_float(turnover_rate),
            )
        )

    return points[-lookback_days:] if len(points) > lookback_days else points


def build_stock_statistics(quote: QuoteSnapshot, points: list[KlinePoint]) -> dict[str, Any]:
    closes = [item.close_price for item in points]
    highs = [item.high_price for item in points]
    lows = [item.low_price for item in points]
    volumes = [item.volume for item in points]
    amounts = [item.turnover_amount for item in points]
    turnover_rates = [item.turnover_rate for item in points if item.turnover_rate is not None]

    first_close = closes[0]
    last_close = closes[-1]
    five_day_base = closes[-5] if len(closes) >= 5 else first_close

    return {
        "trading_days": len(points),
        "first_close": first_close,
        "last_close": last_close,
        "period_return_pct": round(compute_percent_change(last_close, first_close), 2),
        "five_day_return_pct": round(compute_percent_change(last_close, five_day_base), 2),
        "period_high": max(highs),
        "period_low": min(lows),
        "range_amplitude_pct": round(compute_percent_change(max(highs), min(lows)), 2),
        "max_drawdown_pct": round(compute_max_drawdown_pct(closes), 2),
        "positive_days": sum(1 for item in points if item.change_percent > 0),
        "negative_days": sum(1 for item in points if item.change_percent < 0),
        "avg_volume": sum(volumes) / len(volumes),
        "avg_turnover_amount": sum(amounts) / len(amounts),
        "avg_turnover_rate": (
            round(sum(turnover_rates) / len(turnover_rates), 2)
            if turnover_rates
            else None
        ),
        "latest_price": quote.latest_price,
        "latest_change_percent": quote.change_percent,
    }


@lru_cache(maxsize=1)
def load_stock_directory() -> tuple[StockIdentity, ...]:
    first_page = fetch_stock_directory_page(1)
    entries = list(first_page["items"])
    total_pages = math.ceil(first_page["total"] / DIRECTORY_PAGE_SIZE)
    for page in range(2, total_pages + 1):
        entries.extend(fetch_stock_directory_page(page)["items"])
    return tuple(entries)


def fetch_stock_directory_page(page_number: int) -> dict[str, Any]:
    payload = request_json(
        EASTMONEY_LIST_URL,
        params={
            "pn": str(page_number),
            "pz": str(DIRECTORY_PAGE_SIZE),
            "po": "1",
            "np": "1",
            "fltt": "2",
            "invt": "2",
            "fid": "f12",
            "fs": "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23",
            "fields": "f12,f13,f14",
        },
    )
    data = payload.get("data") or {}
    raw_items = data.get("diff") or []
    return {
        "total": int(data.get("total") or len(raw_items)),
        "items": [
            build_stock_identity(
                code=str(item["f12"]),
                name=str(item["f14"]),
                market_code=int(item["f13"]),
            )
            for item in raw_items
            if item.get("f12") and item.get("f14") and item.get("f13") is not None
        ],
    }


def resolve_stock_name_by_code(code: str) -> str | None:
    for entry in load_stock_directory():
        if entry.code == code:
            return entry.name
    return None


def build_stock_identity(*, code: str, name: str, market_code: int) -> StockIdentity:
    exchange = market_code_to_exchange(market_code)
    exchange_prefix = exchange.lower()
    return StockIdentity(
        code=code,
        name=name,
        market_code=market_code,
        exchange=exchange,
        quote_id=f"{market_code}.{code}",
        symbol=f"{code}.{exchange}",
        quote_page_url=f"https://quote.eastmoney.com/{exchange_prefix}{code}.html",
    )


def infer_exchange_from_code(code: str) -> str:
    if code.startswith(("8", "4")):
        return "BJ"
    if code.startswith(("5", "6", "9")):
        return "SH"
    return "SZ"


def exchange_to_market_code(exchange: str) -> int:
    if exchange == "SH":
        return 1
    return 0


def market_code_to_exchange(market_code: int) -> str:
    return "SH" if market_code == 1 else "SZ"


def request_json(url: str, *, params: dict[str, str]) -> dict[str, Any]:
    last_error: Exception | None = None
    for attempt in range(3):
        request = Request(
            f"{url}?{urlencode(params)}",
            headers={
                "User-Agent": "Mozilla/5.0",
                "Referer": EASTMONEY_REFERER,
                "Accept": "application/json,text/plain,*/*",
            },
        )
        try:
            with urlopen(request, timeout=20) as response:
                payload = json.loads(response.read().decode("utf-8"))
            rc = payload.get("rc", 0)
            if rc not in (0, None):
                raise RuntimeError(f"Stock data request failed with rc={rc}.")
            return payload
        except (HTTPError, URLError, RemoteDisconnected, TimeoutError, RuntimeError) as error:
            last_error = error
            if attempt == 2:
                break
            time.sleep(1 + attempt)

    raise RuntimeError(f"Stock data request failed after retries: {last_error}")


def compute_percent_change(current_value: float, base_value: float) -> float:
    if base_value == 0:
        return 0.0
    return ((current_value - base_value) / base_value) * 100


def compute_max_drawdown_pct(closes: list[float]) -> float:
    peak = closes[0]
    max_drawdown = 0.0
    for close in closes:
        peak = max(peak, close)
        drawdown = compute_percent_change(close, peak)
        max_drawdown = min(max_drawdown, drawdown)
    return abs(max_drawdown)


def to_float(value: Any) -> float:
    if value in (None, "", "-"):
        return 0.0
    return float(value)


def to_optional_float(value: Any) -> float | None:
    if value in (None, "", "-", "--"):
        return None
    return float(value)


def format_number(value: float | None) -> str:
    if value is None:
        return "暂无"
    return f"{value:,.2f}"


def format_optional_number(value: float | None) -> str:
    if value is None:
        return "暂无"
    return f"{value:.2f}"


def format_optional_percent(value: float | None) -> str:
    if value is None:
        return "暂无"
    return f"{value:.2f}%"
