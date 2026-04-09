from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps.auth import CurrentUserContext, require_roles
from app.db.session import get_db
from app.models import AuditLog, ModelConfig, ResearchTask, Role, SourceConfig, User, UserRole
from app.models.enums import TaskStatus, UserStatus
from app.schemas.admin import (
    AdminAuditActorResponse,
    AdminAuditLogListResponse,
    AdminAuditLogResponse,
    AdminModelConfigListResponse,
    AdminModelConfigResponse,
    AdminOverviewMetricsResponse,
    AdminOverviewResponse,
    AdminRecentTaskResponse,
    AdminUserListResponse,
    AdminUserSummaryResponse,
)

router = APIRouter(prefix="/admin", tags=["admin"])


def serialize_model_config(model: ModelConfig) -> AdminModelConfigResponse:
    return AdminModelConfigResponse(
        id=model.id,
        provider_code=model.provider_code,
        model_name=model.model_name,
        display_name=model.display_name,
        scene_type=model.scene_type,
        api_base_url=model.api_base_url,
        api_key_masked=model.api_key_masked,
        is_enabled=model.is_enabled,
        is_default=model.is_default,
        config_json=model.config_json,
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


def serialize_user(user: User, *, research_task_count: int) -> AdminUserSummaryResponse:
    role_codes = [user_role.role.role_code for user_role in user.user_roles if user_role.role is not None]
    return AdminUserSummaryResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        status=user.status,
        roles=role_codes,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
        updated_at=user.updated_at,
        research_task_count=research_task_count,
    )


def serialize_audit_log(log: AuditLog) -> AdminAuditLogResponse:
    actor = None
    if log.user is not None:
        actor = AdminAuditActorResponse(
            id=log.user.id,
            username=log.user.username,
            display_name=log.user.display_name,
        )

    return AdminAuditLogResponse(
        id=log.id,
        action_type=log.action_type,
        target_type=log.target_type,
        target_id=log.target_id,
        action_detail=log.action_detail,
        ip_address=log.ip_address,
        created_at=log.created_at,
        user=actor,
    )


def serialize_recent_task(task: ResearchTask) -> AdminRecentTaskResponse:
    return AdminRecentTaskResponse(
        id=task.id,
        task_no=task.task_no,
        object_type=task.object_type,
        object_name=task.object_name,
        task_title=task.task_title,
        status=task.status,
        current_stage=task.current_stage,
        progress_percent=task.progress_percent,
        created_at=task.created_at,
        selected_model_name=task.selected_model.display_name if task.selected_model is not None else None,
    )


@router.get("/overview", response_model=AdminOverviewResponse)
def get_admin_overview(
    _: CurrentUserContext = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> AdminOverviewResponse:
    running_statuses = [
        TaskStatus.COLLECTING.value,
        TaskStatus.PROCESSING.value,
        TaskStatus.ANALYZING.value,
        TaskStatus.REPORTING.value,
    ]

    total_users = db.scalar(select(func.count()).select_from(User)) or 0
    active_users = (
        db.scalar(
            select(func.count())
            .select_from(User)
            .where(User.status == UserStatus.ACTIVE.value)
        )
        or 0
    )
    admin_users = (
        db.scalar(
            select(func.count(func.distinct(UserRole.user_id)))
            .select_from(UserRole)
            .join(Role, Role.id == UserRole.role_id)
            .where(Role.role_code == "admin")
        )
        or 0
    )
    total_tasks = db.scalar(select(func.count()).select_from(ResearchTask)) or 0
    queued_tasks = (
        db.scalar(
            select(func.count())
            .select_from(ResearchTask)
            .where(ResearchTask.status == TaskStatus.QUEUED.value)
        )
        or 0
    )
    running_tasks = (
        db.scalar(
            select(func.count())
            .select_from(ResearchTask)
            .where(ResearchTask.status.in_(running_statuses))
        )
        or 0
    )
    completed_tasks = (
        db.scalar(
            select(func.count())
            .select_from(ResearchTask)
            .where(ResearchTask.status == TaskStatus.COMPLETED.value)
        )
        or 0
    )
    failed_tasks = (
        db.scalar(
            select(func.count())
            .select_from(ResearchTask)
            .where(ResearchTask.status == TaskStatus.FAILED.value)
        )
        or 0
    )
    enabled_models = (
        db.scalar(
            select(func.count())
            .select_from(ModelConfig)
            .where(ModelConfig.is_enabled.is_(True))
        )
        or 0
    )
    enabled_sources = (
        db.scalar(
            select(func.count())
            .select_from(SourceConfig)
            .where(SourceConfig.is_enabled.is_(True))
        )
        or 0
    )
    total_audit_logs = db.scalar(select(func.count()).select_from(AuditLog)) or 0

    recent_tasks = db.scalars(
        select(ResearchTask)
        .options(selectinload(ResearchTask.selected_model))
        .order_by(ResearchTask.created_at.desc(), ResearchTask.id.desc())
        .limit(6)
    ).all()
    recent_logs = db.scalars(
        select(AuditLog)
        .options(selectinload(AuditLog.user))
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(8)
    ).all()

    return AdminOverviewResponse(
        metrics=AdminOverviewMetricsResponse(
            total_users=total_users,
            active_users=active_users,
            admin_users=admin_users,
            total_tasks=total_tasks,
            queued_tasks=queued_tasks,
            running_tasks=running_tasks,
            completed_tasks=completed_tasks,
            failed_tasks=failed_tasks,
            enabled_models=enabled_models,
            enabled_sources=enabled_sources,
            total_audit_logs=total_audit_logs,
        ),
        recent_tasks=[serialize_recent_task(task) for task in recent_tasks],
        recent_audit_logs=[serialize_audit_log(log) for log in recent_logs],
    )


@router.get("/models", response_model=AdminModelConfigListResponse)
def list_admin_models(
    keyword: str | None = Query(default=None, min_length=1, max_length=120),
    enabled_only: bool = Query(default=False),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    _: CurrentUserContext = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> AdminModelConfigListResponse:
    conditions = []
    if enabled_only:
        conditions.append(ModelConfig.is_enabled.is_(True))
    if keyword is not None:
        like_keyword = f"%{keyword.strip()}%"
        conditions.append(
            or_(
                ModelConfig.display_name.ilike(like_keyword),
                ModelConfig.model_name.ilike(like_keyword),
                ModelConfig.provider_code.ilike(like_keyword),
            )
        )

    total = db.scalar(select(func.count()).select_from(ModelConfig).where(*conditions)) or 0
    items = db.scalars(
        select(ModelConfig)
        .where(*conditions)
        .order_by(ModelConfig.updated_at.desc(), ModelConfig.id.desc())
        .offset(offset)
        .limit(limit)
    ).all()

    return AdminModelConfigListResponse(
        items=[serialize_model_config(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/users", response_model=AdminUserListResponse)
def list_admin_users(
    keyword: str | None = Query(default=None, min_length=1, max_length=255),
    status_filter: UserStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    _: CurrentUserContext = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> AdminUserListResponse:
    conditions = []
    if keyword is not None:
        like_keyword = f"%{keyword.strip()}%"
        conditions.append(
            or_(
                User.username.ilike(like_keyword),
                User.email.ilike(like_keyword),
                User.display_name.ilike(like_keyword),
            )
        )
    if status_filter is not None:
        conditions.append(User.status == status_filter.value)

    total = db.scalar(select(func.count()).select_from(User).where(*conditions)) or 0
    users = db.scalars(
        select(User)
        .options(selectinload(User.user_roles).selectinload(UserRole.role))
        .where(*conditions)
        .order_by(User.created_at.desc(), User.id.desc())
        .offset(offset)
        .limit(limit)
    ).all()

    task_count_map: dict[int, int] = {}
    if users:
        task_count_rows = db.execute(
            select(ResearchTask.user_id, func.count(ResearchTask.id))
            .where(ResearchTask.user_id.in_([user.id for user in users]))
            .group_by(ResearchTask.user_id)
        ).all()
        task_count_map = {user_id: count for user_id, count in task_count_rows}

    return AdminUserListResponse(
        items=[
            serialize_user(
                user,
                research_task_count=task_count_map.get(user.id, 0),
            )
            for user in users
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/audit-logs", response_model=AdminAuditLogListResponse)
def list_admin_audit_logs(
    keyword: str | None = Query(default=None, min_length=1, max_length=255),
    action_type: str | None = Query(default=None, min_length=1, max_length=100),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    _: CurrentUserContext = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> AdminAuditLogListResponse:
    conditions = []
    if keyword is not None:
        like_keyword = f"%{keyword.strip()}%"
        conditions.append(
            or_(
                AuditLog.action_detail.ilike(like_keyword),
                AuditLog.target_id.ilike(like_keyword),
                AuditLog.target_type.ilike(like_keyword),
            )
        )
    if action_type is not None:
        conditions.append(AuditLog.action_type == action_type)

    total = db.scalar(select(func.count()).select_from(AuditLog).where(*conditions)) or 0
    items = db.scalars(
        select(AuditLog)
        .options(selectinload(AuditLog.user))
        .where(*conditions)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .offset(offset)
        .limit(limit)
    ).all()

    return AdminAuditLogListResponse(
        items=[serialize_audit_log(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )
