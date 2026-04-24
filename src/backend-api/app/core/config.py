from functools import lru_cache
from pathlib import Path

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


SRC_DIR = Path(__file__).resolve().parents[3]
ENV_FILE = SRC_DIR / ".env"
LOCAL_ENV_FILE = SRC_DIR / ".env.local"


class Settings(BaseSettings):
    app_name: str = "business-research-platform"
    app_env: str = "development"
    api_port: int = 8000
    cors_allowed_origins_raw: str = (
        "http://127.0.0.1:5173,"
        "http://localhost:5173,"
        "http://127.0.0.1:5174,"
        "http://localhost:5174"
    )

    postgres_db: str = "research_platform"
    postgres_user: str = "postgres"
    postgres_password: str = "postgres"
    postgres_port: int = 5432
    postgres_host: str = "127.0.0.1"

    jwt_secret: str = "change-this-secret-in-real-env"
    jwt_expire_minutes: int = 120
    jwt_algorithm: str = "HS256"

    default_model_provider: str = "gemini"
    default_model_name: str = "gemini-2.5-flash"
    default_admin_username: str = "admin"
    default_admin_email: str = "admin@example.com"
    default_admin_password: str = "change-this-admin-password"
    default_admin_display_name: str = "系统管理员"

    gemini_api_key: str | None = None
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta"
    gemini_model_name: str = "gemini-2.5-flash"
    gemini_available_models_raw: str = ""
    gemini_timeout_seconds: int = 90
    gemini_google_search_enabled: bool = True
    stock_lookback_days: int = 30
    alpha_vantage_api_key: str | None = None
    fred_api_key: str | None = None
    eia_api_key: str | None = None
    sec_user_agent: str = "BUAA-SE business research demo wangmt615@gmail.com"
    tushare_token: str | None = None

    model_config = SettingsConfigDict(
        env_file=(ENV_FILE, LOCAL_ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def is_debug(self) -> bool:
        return self.app_env.lower() == "development"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def database_url(self) -> str:
        return (
            "postgresql+psycopg://"
            f"{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def cors_allowed_origins(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.cors_allowed_origins_raw.split(",")
            if origin.strip()
        ]

    @property
    def gemini_available_models(self) -> list[str]:
        models: list[str] = []
        for candidate in [
            self.default_model_name,
            self.gemini_model_name,
            *self.gemini_available_models_raw.split(","),
        ]:
            normalized = candidate.strip()
            if normalized and normalized not in models:
                models.append(normalized)
        return models


@lru_cache
def get_settings() -> Settings:
    return Settings()
