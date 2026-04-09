from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Integer, JSON, Numeric, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, BigIntIdMixin, CreatedAtMixin, TimestampMixin
from app.models.enums import (
    AuthorityLevel,
    OperatorType,
    ReportStatus,
    ReportType,
    StageLogStatus,
    TaskStatus,
)


class ResearchTask(BigIntIdMixin, TimestampMixin, Base):
    __tablename__ = "research_tasks"

    task_no: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    object_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    object_name: Mapped[str] = mapped_column(String(255), nullable=False)
    task_title: Mapped[str] = mapped_column(String(255), nullable=False)
    research_goal: Mapped[str | None] = mapped_column(Text, nullable=True)
    time_range: Mapped[str | None] = mapped_column(String(100), nullable=True)
    selected_model_id: Mapped[int | None] = mapped_column(
        ForeignKey("model_configs.id"),
        nullable=True,
        index=True,
    )
    source_strategy: Mapped[str | None] = mapped_column(String(100), nullable=True)
    task_params: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=TaskStatus.CREATED.value,
        server_default=text("'CREATED'"),
        index=True,
    )
    current_stage: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default=TaskStatus.CREATED.value,
        server_default=text("'CREATED'"),
    )
    progress_percent: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
    )
    result_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(nullable=True)

    user: Mapped["User"] = relationship(back_populates="research_tasks")
    selected_model: Mapped["ModelConfig | None"] = relationship(back_populates="research_tasks")
    task_stage_logs: Mapped[list["TaskStageLog"]] = relationship(
        back_populates="task",
        cascade="all, delete-orphan",
    )
    materials: Mapped[list["Material"]] = relationship(
        back_populates="task",
        cascade="all, delete-orphan",
    )
    analysis_results: Mapped[list["AnalysisResult"]] = relationship(
        back_populates="task",
        cascade="all, delete-orphan",
    )
    reports: Mapped[list["Report"]] = relationship(
        back_populates="task",
        cascade="all, delete-orphan",
    )


class TaskStageLog(BigIntIdMixin, CreatedAtMixin, Base):
    __tablename__ = "task_stage_logs"

    task_id: Mapped[int] = mapped_column(ForeignKey("research_tasks.id"), nullable=False, index=True)
    stage_code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    stage_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=StageLogStatus.STARTED.value,
        server_default=text("'STARTED'"),
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    detail_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    operator_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=OperatorType.SYSTEM.value,
        server_default=text("'SYSTEM'"),
    )

    task: Mapped["ResearchTask"] = relationship(back_populates="task_stage_logs")


class Material(BigIntIdMixin, CreatedAtMixin, Base):
    __tablename__ = "materials"

    task_id: Mapped[int] = mapped_column(ForeignKey("research_tasks.id"), nullable=False, index=True)
    source_config_id: Mapped[int | None] = mapped_column(
        ForeignKey("source_configs.id"),
        nullable=True,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source_type: Mapped[str] = mapped_column(String(20), nullable=False)
    authority_level: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=AuthorityLevel.MEDIUM.value,
        server_default=text("'MEDIUM'"),
    )
    published_at: Mapped[datetime | None] = mapped_column(nullable=True)
    captured_at: Mapped[datetime] = mapped_column(
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    topic_tag: Mapped[str | None] = mapped_column(String(100), nullable=True)
    relevance_score: Mapped[float] = mapped_column(
        Numeric(5, 2),
        nullable=False,
        default=0.00,
        server_default=text("0.00"),
    )
    dedup_key: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    is_selected: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )

    task: Mapped["ResearchTask"] = relationship(back_populates="materials")
    source_config: Mapped["SourceConfig | None"] = relationship(back_populates="materials")


class AnalysisResult(BigIntIdMixin, TimestampMixin, Base):
    __tablename__ = "analysis_results"

    task_id: Mapped[int] = mapped_column(ForeignKey("research_tasks.id"), nullable=False, index=True)
    model_config_id: Mapped[int] = mapped_column(ForeignKey("model_configs.id"), nullable=False, index=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    key_findings: Mapped[str | None] = mapped_column(Text, nullable=True)
    risks: Mapped[str | None] = mapped_column(Text, nullable=True)
    opportunities: Mapped[str | None] = mapped_column(Text, nullable=True)
    conclusion: Mapped[str | None] = mapped_column(Text, nullable=True)
    structured_payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    task: Mapped["ResearchTask"] = relationship(back_populates="analysis_results")
    model_config: Mapped["ModelConfig"] = relationship(back_populates="analysis_results")


class Report(BigIntIdMixin, TimestampMixin, Base):
    __tablename__ = "reports"

    task_id: Mapped[int] = mapped_column(ForeignKey("research_tasks.id"), nullable=False, index=True)
    report_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=ReportType.BRIEF.value,
        server_default=text("'BRIEF'"),
    )
    report_version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default=text("1"),
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    markdown_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    html_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    pdf_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    word_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=ReportStatus.DRAFT.value,
        server_default=text("'DRAFT'"),
    )

    task: Mapped["ResearchTask"] = relationship(back_populates="reports")
