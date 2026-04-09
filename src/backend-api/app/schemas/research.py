from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import ObjectType


class ResearchTaskCreateRequest(BaseModel):
    object_type: ObjectType
    object_name: str = Field(min_length=1, max_length=255)
    task_title: str | None = Field(default=None, min_length=1, max_length=255)
    research_goal: str | None = Field(default=None, max_length=5000)
    time_range: str | None = Field(default=None, max_length=100)
    selected_model_id: int | None = Field(default=None, ge=1)
    source_strategy: str | None = Field(default=None, max_length=100)
    task_params: dict = Field(default_factory=dict)


class ModelConfigSummaryResponse(BaseModel):
    id: int
    provider_code: str
    model_name: str
    display_name: str


class ResearchModelOptionResponse(ModelConfigSummaryResponse):
    scene_type: str
    is_default: bool


class ResearchModelOptionListResponse(BaseModel):
    items: list[ResearchModelOptionResponse]
    total: int


class TaskStageLogResponse(BaseModel):
    id: int
    stage_code: str
    stage_name: str | None
    status: str
    message: str
    detail_data: dict
    operator_type: str
    created_at: datetime


class ResearchMaterialResponse(BaseModel):
    id: int
    title: str
    summary: str | None
    content_text: str | None
    source_name: str
    source_url: str | None
    source_type: str
    authority_level: str
    published_at: datetime | None
    captured_at: datetime
    topic_tag: str | None
    relevance_score: float
    is_selected: bool


class ResearchAnalysisResultResponse(BaseModel):
    id: int
    summary: str | None
    key_findings: str | None
    risks: str | None
    opportunities: str | None
    conclusion: str | None
    structured_payload: dict
    model_config_detail: ModelConfigSummaryResponse | None
    created_at: datetime
    updated_at: datetime


class ResearchReportResponse(BaseModel):
    id: int
    report_type: str
    report_version: int
    title: str
    markdown_content: str | None
    status: str
    created_at: datetime
    updated_at: datetime


class ResearchTaskSummaryResponse(BaseModel):
    id: int
    task_no: str
    object_type: str
    object_name: str
    task_title: str
    research_goal: str | None
    status: str
    current_stage: str
    progress_percent: int
    result_summary: str | None
    error_message: str | None
    selected_model: ModelConfigSummaryResponse | None
    created_at: datetime
    updated_at: datetime


class ResearchTaskDetailResponse(ResearchTaskSummaryResponse):
    user_id: int
    time_range: str | None
    source_strategy: str | None
    task_params: dict
    started_at: datetime | None
    completed_at: datetime | None
    stage_logs: list[TaskStageLogResponse]
    materials: list[ResearchMaterialResponse]
    latest_analysis_result: ResearchAnalysisResultResponse | None
    latest_report: ResearchReportResponse | None


class ResearchTaskStatusResponse(BaseModel):
    id: int
    task_no: str
    status: str
    current_stage: str
    progress_percent: int
    result_summary: str | None
    error_message: str | None
    started_at: datetime | None
    completed_at: datetime | None
    stage_logs: list[TaskStageLogResponse]
    materials: list[ResearchMaterialResponse]
    latest_analysis_result: ResearchAnalysisResultResponse | None
    latest_report: ResearchReportResponse | None


class ResearchTaskListResponse(BaseModel):
    items: list[ResearchTaskSummaryResponse]
    total: int
    limit: int
    offset: int
