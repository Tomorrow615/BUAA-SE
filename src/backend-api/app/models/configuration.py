from sqlalchemy import Boolean, JSON, Numeric, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, BigIntIdMixin, TimestampMixin
from app.models.enums import AuthorityLevel, SceneType


class ModelConfig(BigIntIdMixin, TimestampMixin, Base):
    __tablename__ = "model_configs"
    __table_args__ = (UniqueConstraint("provider_code", "model_name"),)

    provider_code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    api_base_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    api_key_masked: Mapped[str | None] = mapped_column(String(255), nullable=True)
    scene_type: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
        default=SceneType.GENERAL.value,
        server_default=text("'GENERAL'"),
    )
    is_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    is_default: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    config_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    research_tasks: Mapped[list["ResearchTask"]] = relationship(back_populates="selected_model")
    analysis_results: Mapped[list["AnalysisResult"]] = relationship(back_populates="model_config")


class SourceConfig(BigIntIdMixin, TimestampMixin, Base):
    __tablename__ = "source_configs"

    source_code: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    source_name: Mapped[str] = mapped_column(String(120), nullable=False)
    object_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(20), nullable=False)
    base_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    authority_level: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=AuthorityLevel.MEDIUM.value,
        server_default=text("'MEDIUM'"),
    )
    priority_weight: Mapped[float] = mapped_column(
        Numeric(6, 2),
        nullable=False,
        default=1.00,
        server_default=text("1.00"),
    )
    is_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    strategy_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    materials: Mapped[list["Material"]] = relationship(back_populates="source_config")
