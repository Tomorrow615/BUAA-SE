from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps.auth import CurrentUserContext, get_current_user
from app.core.config import get_settings
from app.db.session import get_db
from app.models import (
    AnalysisResult,
    AuditLog,
    Material,
    ModelConfig,
    Report,
    ResearchTask,
    TaskStageLog,
)
from app.models.enums import ObjectType, OperatorType, StageLogStatus, TaskStatus
from app.schemas.research import (
    ModelConfigSummaryResponse,
    ResearchAnalysisResultResponse,
    ResearchMaterialResponse,
    ResearchReportResponse,
    ResearchTaskCreateRequest,
    ResearchTaskDetailResponse,
    ResearchTaskListResponse,
    ResearchTaskStatusResponse,
    ResearchTaskSummaryResponse,
    TaskStageLogResponse,
)
from app.services.research_tasks import append_stage_log

router = APIRouter(prefix="/research/tasks", tags=["research-tasks"])


def is_admin(current_user: CurrentUserContext) -> bool:
    return "admin" in current_user.role_codes


def resolve_operator_type(current_user: CurrentUserContext) -> str:
    if is_admin(current_user):
        return OperatorType.ADMIN.value
    return OperatorType.USER.value


def generate_task_no() -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    return f"RT{timestamp}{uuid4().hex[:6].upper()}"


def serialize_model_config(model: ModelConfig | None) -> ModelConfigSummaryResponse | None:
    if model is None:
        return None
    return ModelConfigSummaryResponse(
        id=model.id,
        provider_code=model.provider_code,
        model_name=model.model_name,
        display_name=model.display_name,
    )


def serialize_stage_log(log: TaskStageLog) -> TaskStageLogResponse:
    return TaskStageLogResponse(
        id=log.id,
        stage_code=log.stage_code,
        stage_name=log.stage_name,
        status=log.status,
        message=log.message,
        detail_data=log.detail_data,
        operator_type=log.operator_type,
        created_at=log.created_at,
    )


def serialize_material(material: Material) -> ResearchMaterialResponse:
    return ResearchMaterialResponse(
        id=material.id,
        title=material.title,
        summary=material.summary,
        content_text=material.content_text,
        source_name=material.source_name,
        source_url=material.source_url,
        source_type=material.source_type,
        authority_level=material.authority_level,
        published_at=material.published_at,
        captured_at=material.captured_at,
        topic_tag=material.topic_tag,
        relevance_score=float(material.relevance_score),
        is_selected=material.is_selected,
    )


def serialize_analysis_result(
    result: AnalysisResult | None,
) -> ResearchAnalysisResultResponse | None:
    if result is None:
        return None

    return ResearchAnalysisResultResponse(
        id=result.id,
        summary=result.summary,
        key_findings=result.key_findings,
        risks=result.risks,
        opportunities=result.opportunities,
        conclusion=result.conclusion,
        structured_payload=result.structured_payload,
        model_config_detail=serialize_model_config(result.model_config),
        created_at=result.created_at,
        updated_at=result.updated_at,
    )


def serialize_report(report: Report | None) -> ResearchReportResponse | None:
    if report is None:
        return None

    return ResearchReportResponse(
        id=report.id,
        report_type=report.report_type,
        report_version=report.report_version,
        title=report.title,
        markdown_content=report.markdown_content,
        status=report.status,
        created_at=report.created_at,
        updated_at=report.updated_at,
    )


def sort_stage_logs(logs: list[TaskStageLog]) -> list[TaskStageLog]:
    fallback_time = datetime.min.replace(tzinfo=timezone.utc)
    return sorted(logs, key=lambda item: ((item.created_at or fallback_time), item.id or 0))


def sort_materials(materials: list[Material]) -> list[Material]:
    fallback_time = datetime.min.replace(tzinfo=timezone.utc)
    return sorted(
        materials,
        key=lambda item: (
            -int((item.published_at or item.captured_at or fallback_time).timestamp()),
            item.id or 0,
        ),
    )


def resolve_latest_analysis_result(
    results: list[AnalysisResult],
) -> AnalysisResult | None:
    if not results:
        return None
    fallback_time = datetime.min.replace(tzinfo=timezone.utc)
    return max(
        results,
        key=lambda item: ((item.updated_at or item.created_at or fallback_time), item.id or 0),
    )


def resolve_latest_report(reports: list[Report]) -> Report | None:
    if not reports:
        return None
    fallback_time = datetime.min.replace(tzinfo=timezone.utc)
    return max(
        reports,
        key=lambda item: (item.report_version, item.updated_at or fallback_time, item.id or 0),
    )


def serialize_task_summary(task: ResearchTask) -> ResearchTaskSummaryResponse:
    return ResearchTaskSummaryResponse(
        id=task.id,
        task_no=task.task_no,
        object_type=task.object_type,
        object_name=task.object_name,
        task_title=task.task_title,
        research_goal=task.research_goal,
        status=task.status,
        current_stage=task.current_stage,
        progress_percent=task.progress_percent,
        result_summary=task.result_summary,
        error_message=task.error_message,
        selected_model=serialize_model_config(task.selected_model),
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


def serialize_task_detail(task: ResearchTask) -> ResearchTaskDetailResponse:
    stage_logs = [serialize_stage_log(log) for log in sort_stage_logs(task.task_stage_logs)]
    materials = [serialize_material(item) for item in sort_materials(task.materials)]
    latest_analysis_result = serialize_analysis_result(
        resolve_latest_analysis_result(task.analysis_results)
    )
    latest_report = serialize_report(resolve_latest_report(task.reports))

    return ResearchTaskDetailResponse(
        **serialize_task_summary(task).model_dump(),
        user_id=task.user_id,
        time_range=task.time_range,
        source_strategy=task.source_strategy,
        task_params=task.task_params,
        started_at=task.started_at,
        completed_at=task.completed_at,
        stage_logs=stage_logs,
        materials=materials,
        latest_analysis_result=latest_analysis_result,
        latest_report=latest_report,
    )


def serialize_task_status(task: ResearchTask) -> ResearchTaskStatusResponse:
    stage_logs = [serialize_stage_log(log) for log in sort_stage_logs(task.task_stage_logs)]
    materials = [serialize_material(item) for item in sort_materials(task.materials)]
    latest_analysis_result = serialize_analysis_result(
        resolve_latest_analysis_result(task.analysis_results)
    )
    latest_report = serialize_report(resolve_latest_report(task.reports))

    return ResearchTaskStatusResponse(
        id=task.id,
        task_no=task.task_no,
        status=task.status,
        current_stage=task.current_stage,
        progress_percent=task.progress_percent,
        result_summary=task.result_summary,
        error_message=task.error_message,
        started_at=task.started_at,
        completed_at=task.completed_at,
        stage_logs=stage_logs,
        materials=materials,
        latest_analysis_result=latest_analysis_result,
        latest_report=latest_report,
    )


def resolve_model_config(db: Session, selected_model_id: int | None) -> ModelConfig:
    settings = get_settings()
    if selected_model_id is not None:
        model = db.scalar(
            select(ModelConfig).where(
                ModelConfig.id == selected_model_id,
                ModelConfig.is_enabled.is_(True),
                ModelConfig.provider_code == settings.default_model_provider,
            )
        )
        if model is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Selected model is not available.",
            )
        return model

    model = db.scalar(
        select(ModelConfig)
        .where(
            ModelConfig.is_enabled.is_(True),
            ModelConfig.is_default.is_(True),
            ModelConfig.provider_code == settings.default_model_provider,
        )
        .order_by(ModelConfig.id.asc())
    )
    if model is not None:
        return model

    model = db.scalar(
        select(ModelConfig)
        .where(
            ModelConfig.is_enabled.is_(True),
            ModelConfig.provider_code == settings.default_model_provider,
        )
        .order_by(ModelConfig.id.asc())
    )
    if model is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No enabled model configuration is available.",
        )
    return model


def write_audit_log(
    db: Session,
    *,
    current_user: CurrentUserContext,
    target_id: str,
    action_type: str,
    action_detail: str,
    request: Request,
) -> None:
    ip_address = request.client.host if request.client is not None else None
    db.add(
        AuditLog(
            user_id=current_user.user.id,
            action_type=action_type,
            target_type="RESEARCH_TASK",
            target_id=target_id,
            action_detail=action_detail,
            ip_address=ip_address,
        )
    )


def load_task(
    db: Session,
    *,
    task_id: int,
    current_user: CurrentUserContext,
) -> ResearchTask:
    statement = (
        select(ResearchTask)
        .options(
            selectinload(ResearchTask.selected_model),
            selectinload(ResearchTask.task_stage_logs),
            selectinload(ResearchTask.materials),
            selectinload(ResearchTask.analysis_results).selectinload(AnalysisResult.model_config),
            selectinload(ResearchTask.reports),
        )
        .where(ResearchTask.id == task_id)
    )
    if not is_admin(current_user):
        statement = statement.where(ResearchTask.user_id == current_user.user.id)

    task = db.scalar(statement)
    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research task not found.",
        )
    return task


@router.post("", response_model=ResearchTaskDetailResponse, status_code=status.HTTP_201_CREATED)
def create_research_task(
    payload: ResearchTaskCreateRequest,
    request: Request,
    current_user: CurrentUserContext = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResearchTaskDetailResponse:
    if payload.object_type != ObjectType.STOCK:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Step 8 minimal implementation currently supports STOCK only.",
        )

    model = resolve_model_config(db, payload.selected_model_id)
    task_title = payload.task_title or f"{payload.object_name} 股票调研任务"
    source_strategy = payload.source_strategy or "DEFAULT"
    task_no = generate_task_no()

    task = ResearchTask(
        task_no=task_no,
        user_id=current_user.user.id,
        object_type=payload.object_type.value,
        object_name=payload.object_name,
        task_title=task_title,
        research_goal=payload.research_goal,
        time_range=payload.time_range,
        selected_model_id=model.id,
        source_strategy=source_strategy,
        task_params=payload.task_params,
        status=TaskStatus.QUEUED.value,
        current_stage=TaskStatus.QUEUED.value,
        progress_percent=5,
    )

    append_stage_log(
        task,
        stage_code=TaskStatus.CREATED.value,
        log_status=StageLogStatus.COMPLETED.value,
        message="Research task created successfully.",
        operator_type=resolve_operator_type(current_user),
        detail_data={
            "task_no": task_no,
            "object_type": payload.object_type.value,
            "object_name": payload.object_name,
        },
    )
    append_stage_log(
        task,
        stage_code=TaskStatus.QUEUED.value,
        log_status=StageLogStatus.COMPLETED.value,
        message="Research task entered the worker queue.",
        operator_type=OperatorType.SYSTEM.value,
        detail_data={
            "task_no": task_no,
            "selected_model_id": model.id,
            "progress_percent": 5,
            "source_strategy": source_strategy,
        },
    )

    db.add(task)
    db.flush()

    write_audit_log(
        db,
        current_user=current_user,
        target_id=str(task.id),
        action_type="CREATE_RESEARCH_TASK",
        action_detail=(
            f"Created research task {task.task_no} for "
            f"{payload.object_type.value}:{payload.object_name} and queued it."
        ),
        request=request,
    )

    db.commit()
    task = load_task(db, task_id=task.id, current_user=current_user)
    return serialize_task_detail(task)


@router.get("", response_model=ResearchTaskListResponse)
def list_research_tasks(
    object_type: ObjectType | None = Query(default=None),
    status_filter: TaskStatus | None = Query(default=None, alias="status"),
    selected_model_id: int | None = Query(default=None, ge=1),
    keyword: str | None = Query(default=None, min_length=1, max_length=255),
    created_from: datetime | None = Query(default=None),
    created_to: datetime | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUserContext = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResearchTaskListResponse:
    conditions = []
    if not is_admin(current_user):
        conditions.append(ResearchTask.user_id == current_user.user.id)
    if object_type is not None:
        conditions.append(ResearchTask.object_type == object_type.value)
    if status_filter is not None:
        conditions.append(ResearchTask.status == status_filter.value)
    if selected_model_id is not None:
        conditions.append(ResearchTask.selected_model_id == selected_model_id)
    if keyword is not None:
        like_keyword = f"%{keyword.strip()}%"
        conditions.append(
            (ResearchTask.object_name.ilike(like_keyword))
            | (ResearchTask.task_title.ilike(like_keyword))
        )
    if created_from is not None:
        conditions.append(ResearchTask.created_at >= created_from)
    if created_to is not None:
        conditions.append(ResearchTask.created_at <= created_to)

    total = db.scalar(select(func.count()).select_from(ResearchTask).where(*conditions)) or 0
    tasks = db.scalars(
        select(ResearchTask)
        .options(selectinload(ResearchTask.selected_model))
        .where(*conditions)
        .order_by(ResearchTask.created_at.desc(), ResearchTask.id.desc())
        .offset(offset)
        .limit(limit)
    ).all()

    return ResearchTaskListResponse(
        items=[serialize_task_summary(task) for task in tasks],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{task_id}/status", response_model=ResearchTaskStatusResponse)
def get_research_task_status(
    task_id: int,
    current_user: CurrentUserContext = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResearchTaskStatusResponse:
    task = load_task(db, task_id=task_id, current_user=current_user)
    return serialize_task_status(task)


@router.get("/{task_id}", response_model=ResearchTaskDetailResponse)
def get_research_task_detail(
    task_id: int,
    current_user: CurrentUserContext = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResearchTaskDetailResponse:
    task = load_task(db, task_id=task_id, current_user=current_user)
    return serialize_task_detail(task)
