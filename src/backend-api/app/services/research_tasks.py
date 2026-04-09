from app.models import ResearchTask, TaskStageLog
from app.models.enums import StageLogStatus, TaskStatus

TASK_STAGE_NAMES = {
    TaskStatus.CREATED.value: "Task Created",
    TaskStatus.QUEUED.value: "Queued",
    TaskStatus.COLLECTING.value: "Collecting",
    TaskStatus.PROCESSING.value: "Processing",
    TaskStatus.ANALYZING.value: "Analyzing",
    TaskStatus.REPORTING.value: "Reporting",
    TaskStatus.COMPLETED.value: "Completed",
    TaskStatus.FAILED.value: "Failed",
    TaskStatus.CANCELLED.value: "Cancelled",
}


def resolve_stage_name(stage_code: str) -> str:
    return TASK_STAGE_NAMES.get(stage_code, stage_code.replace("_", " ").title())


def append_stage_log(
    task: ResearchTask,
    *,
    stage_code: str,
    message: str,
    operator_type: str,
    log_status: str = StageLogStatus.COMPLETED.value,
    stage_name: str | None = None,
    detail_data: dict | None = None,
) -> TaskStageLog:
    log = TaskStageLog(
        stage_code=stage_code,
        stage_name=stage_name or resolve_stage_name(stage_code),
        status=log_status,
        message=message,
        operator_type=operator_type,
        detail_data=detail_data or {},
    )
    task.task_stage_logs.append(log)
    return log

