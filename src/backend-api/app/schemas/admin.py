from datetime import datetime

from pydantic import BaseModel


class AdminAuditActorResponse(BaseModel):
    id: int
    username: str
    display_name: str | None


class AdminAuditLogResponse(BaseModel):
    id: int
    action_type: str
    target_type: str
    target_id: str | None
    action_detail: str | None
    ip_address: str | None
    created_at: datetime
    user: AdminAuditActorResponse | None


class AdminAuditLogListResponse(BaseModel):
    items: list[AdminAuditLogResponse]
    total: int
    limit: int
    offset: int


class AdminModelConfigResponse(BaseModel):
    id: int
    provider_code: str
    model_name: str
    display_name: str
    scene_type: str
    api_base_url: str | None
    api_key_masked: str | None
    is_enabled: bool
    is_default: bool
    config_json: dict
    created_at: datetime
    updated_at: datetime


class AdminModelConfigListResponse(BaseModel):
    items: list[AdminModelConfigResponse]
    total: int
    limit: int
    offset: int


class AdminUserSummaryResponse(BaseModel):
    id: int
    username: str
    email: str
    display_name: str | None
    status: str
    roles: list[str]
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime
    research_task_count: int


class AdminUserListResponse(BaseModel):
    items: list[AdminUserSummaryResponse]
    total: int
    limit: int
    offset: int


class AdminRecentTaskResponse(BaseModel):
    id: int
    task_no: str
    object_type: str
    object_name: str
    task_title: str
    status: str
    current_stage: str
    progress_percent: int
    created_at: datetime
    selected_model_name: str | None


class AdminOverviewMetricsResponse(BaseModel):
    total_users: int
    active_users: int
    admin_users: int
    total_tasks: int
    queued_tasks: int
    running_tasks: int
    completed_tasks: int
    failed_tasks: int
    enabled_models: int
    enabled_sources: int
    total_audit_logs: int


class AdminOverviewResponse(BaseModel):
    metrics: AdminOverviewMetricsResponse
    recent_tasks: list[AdminRecentTaskResponse]
    recent_audit_logs: list[AdminAuditLogResponse]
