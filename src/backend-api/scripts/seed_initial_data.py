from __future__ import annotations

import sys
from pathlib import Path

from sqlalchemy import func, select, update

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.core.config import get_settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import ModelConfig, Role, SourceConfig, User, UserRole
from app.models.enums import AuthorityLevel, ObjectType, SceneType, SourceType
from app.services.ai_research import mask_secret


def disable_legacy_openai_configs() -> None:
    legacy_models = db.scalars(
        select(ModelConfig).where(
            ModelConfig.provider_code.in_(["openai", "placeholder"])
        )
    ).all()
    for model in legacy_models:
        model.is_enabled = False
        model.is_default = False
        model.api_base_url = None
        model.api_key_masked = None

    legacy_sources = db.scalars(
        select(SourceConfig).where(SourceConfig.source_code == "stock_openai_report")
    ).all()
    for source in legacy_sources:
        source.is_enabled = False
        source.base_url = None


def upsert_role(role_code: str, role_name: str, description: str) -> None:
    existing = db.scalar(select(Role).where(Role.role_code == role_code))
    if existing is None:
        db.add(
            Role(
                role_code=role_code,
                role_name=role_name,
                description=description,
            )
        )
        return

    existing.role_name = role_name
    existing.description = description


def upsert_model_config() -> None:
    db.execute(update(ModelConfig).values(is_default=False))

    for model_name in settings.gemini_available_models:
        existing = db.scalar(
            select(ModelConfig).where(
                ModelConfig.provider_code == settings.default_model_provider,
                ModelConfig.model_name == model_name,
            )
        )

        is_default = model_name == settings.default_model_name
        payload = {
            "temperature": 0.7,
            "max_output_tokens": 2048,
            "note": "Gemini 聊天与数据问答模型配置",
        }
        display_name = f"Gemini {model_name}"

        if existing is None:
            db.add(
                ModelConfig(
                    provider_code=settings.default_model_provider,
                    model_name=model_name,
                    display_name=display_name,
                    api_base_url=settings.gemini_base_url,
                    api_key_masked=mask_secret(settings.gemini_api_key),
                    scene_type=SceneType.GENERAL.value,
                    is_enabled=True,
                    is_default=is_default,
                    config_json=payload,
                )
            )
            continue

        existing.display_name = display_name
        existing.api_base_url = settings.gemini_base_url
        existing.api_key_masked = mask_secret(settings.gemini_api_key)
        existing.scene_type = SceneType.GENERAL.value
        existing.is_enabled = True
        existing.is_default = is_default
        existing.config_json = payload


def upsert_admin_user() -> None:
    admin_user = db.scalar(
        select(User).where(
            (User.username == settings.default_admin_username)
            | (User.email == settings.default_admin_email)
        )
    )

    if admin_user is None:
        admin_user = User(
            username=settings.default_admin_username,
            email=settings.default_admin_email,
            password_hash=hash_password(settings.default_admin_password),
            display_name=settings.default_admin_display_name,
        )
        db.add(admin_user)
        db.flush()
    else:
        admin_user.display_name = settings.default_admin_display_name
        admin_user.password_hash = hash_password(settings.default_admin_password)

    admin_role = db.scalar(select(Role).where(Role.role_code == "admin"))
    if admin_role is None:
        raise RuntimeError("Admin role is not initialized.")

    existing_assignment = db.scalar(
        select(UserRole).where(
            UserRole.user_id == admin_user.id,
            UserRole.role_id == admin_role.id,
        )
    )
    if existing_assignment is None:
        db.add(UserRole(user_id=admin_user.id, role_id=admin_role.id))


def upsert_source_config(
    source_code: str,
    source_name: str,
    object_type: str,
    source_type: str,
    base_url: str | None,
    authority_level: str,
    priority_weight: float,
    strategy_json: dict,
) -> None:
    existing = db.scalar(select(SourceConfig).where(SourceConfig.source_code == source_code))
    if existing is None:
        db.add(
            SourceConfig(
                source_code=source_code,
                source_name=source_name,
                object_type=object_type,
                source_type=source_type,
                base_url=base_url,
                authority_level=authority_level,
                priority_weight=priority_weight,
                is_enabled=True,
                strategy_json=strategy_json,
            )
        )
        return

    existing.source_name = source_name
    existing.object_type = object_type
    existing.source_type = source_type
    existing.base_url = base_url
    existing.authority_level = authority_level
    existing.priority_weight = priority_weight
    existing.is_enabled = True
    existing.strategy_json = strategy_json


settings = get_settings()
db = SessionLocal()

try:
    disable_legacy_openai_configs()

    upsert_role(
        "admin",
        "管理员",
        "平台管理员，负责模型、用户、日志和异常任务治理。",
    )
    upsert_role(
        "user",
        "普通用户",
        "普通调研用户，负责发起股票调研任务并查看结果。",
    )

    upsert_model_config()
    upsert_admin_user()

    upsert_source_config(
        source_code="stock_eastmoney_public_api",
        source_name="东方财富公开行情接口",
        object_type=ObjectType.STOCK.value,
        source_type=SourceType.API.value,
        base_url="https://quote.eastmoney.com/",
        authority_level=AuthorityLevel.MEDIUM.value,
        priority_weight=9.5,
        strategy_json={
            "keywords": ["实时行情", "日线走势", "公开股票列表"],
            "time_sensitive": True,
            "stock_only": True,
        },
    )
    upsert_source_config(
        source_code="gemini_chat_generation",
        source_name="Gemini 基础聊天生成",
        object_type=ObjectType.STOCK.value,
        source_type=SourceType.API.value,
        base_url=settings.gemini_base_url,
        authority_level=AuthorityLevel.HIGH.value,
        priority_weight=10.0,
        strategy_json={
            "keywords": ["基础聊天", "对话生成", "Gemini"],
            "requires_model": True,
            "chat_generation": True,
        },
    )
    upsert_source_config(
        source_code="alpha_vantage_market_data",
        source_name="Alpha Vantage 市场与商品数据",
        object_type=ObjectType.STOCK.value,
        source_type=SourceType.API.value,
        base_url="https://www.alphavantage.co/documentation/",
        authority_level=AuthorityLevel.MEDIUM.value,
        priority_weight=8.5,
        strategy_json={
            "keywords": ["股票概览", "全球行情", "商品价格", "新闻情绪"],
            "requires_key": True,
        },
    )
    upsert_source_config(
        source_code="sec_edgar_company_data",
        source_name="SEC EDGAR 公司披露数据",
        object_type=ObjectType.COMPANY.value,
        source_type=SourceType.API.value,
        base_url="https://www.sec.gov/search-filings/edgar-application-programming-interfaces",
        authority_level=AuthorityLevel.HIGH.value,
        priority_weight=9.6,
        strategy_json={
            "keywords": ["公司公告", "10-K", "10-Q", "XBRL", "美股上市公司"],
            "requires_user_agent": True,
        },
    )
    upsert_source_config(
        source_code="fred_macro_series",
        source_name="FRED 宏观与商品序列",
        object_type=ObjectType.COMMODITY.value,
        source_type=SourceType.API.value,
        base_url="https://fred.stlouisfed.org/docs/api/",
        authority_level=AuthorityLevel.HIGH.value,
        priority_weight=9.0,
        strategy_json={
            "keywords": ["宏观数据", "商品时间序列", "利率", "能源价格"],
            "requires_key": True,
        },
    )
    upsert_source_config(
        source_code="eia_energy_data",
        source_name="EIA 能源公开数据",
        object_type=ObjectType.COMMODITY.value,
        source_type=SourceType.API.value,
        base_url="https://www.eia.gov/opendata/",
        authority_level=AuthorityLevel.HIGH.value,
        priority_weight=9.2,
        strategy_json={
            "keywords": ["原油", "天然气", "能源库存", "能源价格"],
            "requires_key": True,
        },
    )
    upsert_source_config(
        source_code="gleif_lei_lookup",
        source_name="GLEIF LEI 法人主体数据",
        object_type=ObjectType.COMPANY.value,
        source_type=SourceType.API.value,
        base_url="https://www.gleif.org/lei-data/gleif-lei-look-up-api/access-the-api",
        authority_level=AuthorityLevel.HIGH.value,
        priority_weight=8.4,
        strategy_json={
            "keywords": ["LEI", "法人主体", "公司识别"],
            "requires_key": False,
        },
    )
    upsert_source_config(
        source_code="gemini_google_search_grounding",
        source_name="Gemini Google Search Grounding",
        object_type=ObjectType.COMPANY.value,
        source_type=SourceType.WEB.value,
        base_url=settings.gemini_base_url,
        authority_level=AuthorityLevel.MEDIUM.value,
        priority_weight=7.8,
        strategy_json={
            "keywords": ["联网检索", "新闻", "公开网页", "舆情"],
            "requires_model": True,
        },
    )

    db.commit()

    role_count = db.scalar(select(func.count()).select_from(Role))
    user_count = db.scalar(select(func.count()).select_from(User))
    model_count = db.scalar(select(func.count()).select_from(ModelConfig))
    source_count = db.scalar(select(func.count()).select_from(SourceConfig))

    print(
        "seed "
        f"roles={role_count} users={user_count} "
        f"model_configs={model_count} source_configs={source_count}"
    )
except Exception:
    db.rollback()
    raise
finally:
    db.close()
