from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from research_worker.bootstrap import bootstrap_backend_api_path

bootstrap_backend_api_path()

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.session import SessionLocal
from app.models import AnalysisResult, Material, Report, ResearchTask, SourceConfig
from app.models.enums import (
    ObjectType,
    OperatorType,
    ReportStatus,
    ReportType,
    StageLogStatus,
    TaskStatus,
)
from app.services.ai_research import generate_stock_analysis
from app.services.research_tasks import append_stage_log
from app.services.stock_market import (
    build_stock_material_payloads,
    collect_stock_research_bundle,
    parse_lookback_days,
)

logger = logging.getLogger(__name__)
settings = get_settings()

COLLECTING_PROGRESS = 30
ANALYZING_PROGRESS = 70
REPORTING_PROGRESS = 90
COMPLETED_PROGRESS = 100


@dataclass
class WorkerRunSummary:
    claimed_tasks: int = 0
    completed_tasks: int = 0
    failed_tasks: int = 0


def claim_next_queued_task(worker_name: str) -> int | None:
    db = SessionLocal()
    try:
        task = db.scalars(
            select(ResearchTask)
            .where(ResearchTask.status == TaskStatus.QUEUED.value)
            .order_by(ResearchTask.created_at.asc(), ResearchTask.id.asc())
            .limit(1)
            .with_for_update(skip_locked=True)
        ).first()
        if task is None:
            db.rollback()
            return None

        now = datetime.now(timezone.utc)
        task.status = TaskStatus.COLLECTING.value
        task.current_stage = TaskStatus.COLLECTING.value
        task.progress_percent = COLLECTING_PROGRESS
        task.started_at = task.started_at or now
        task.completed_at = None
        task.error_message = None

        append_stage_log(
            task,
            stage_code=TaskStatus.COLLECTING.value,
            log_status=StageLogStatus.RUNNING.value,
            message=f"Worker {worker_name} started stock material collection.",
            operator_type=OperatorType.WORKER.value,
            detail_data={
                "worker_name": worker_name,
                "from_status": TaskStatus.QUEUED.value,
                "progress_percent": COLLECTING_PROGRESS,
            },
        )

        task_id = task.id
        task_no = task.task_no
        db.commit()
        logger.info("Claimed queued task %s (id=%s).", task_no, task_id)
        return task_id
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def collect_task_materials(task_id: int, worker_name: str) -> None:
    db = SessionLocal()
    try:
        task = db.scalars(
            select(ResearchTask)
            .options(selectinload(ResearchTask.materials))
            .where(ResearchTask.id == task_id)
            .limit(1)
        ).first()
        if task is None:
            raise RuntimeError(f"Research task {task_id} was not found.")
        if task.object_type != ObjectType.STOCK.value:
            raise RuntimeError("Step 8 minimal implementation currently supports STOCK only.")

        lookback_days = parse_lookback_days(task.time_range, settings.stock_lookback_days)
        original_query = task.object_name
        bundle = collect_stock_research_bundle(original_query, lookback_days=lookback_days)

        source_config = db.scalar(
            select(SourceConfig).where(
                SourceConfig.source_code == "stock_eastmoney_public_api",
                SourceConfig.is_enabled.is_(True),
            )
        )

        task.materials.clear()
        for payload in build_stock_material_payloads(bundle):
            task.materials.append(
                Material(
                    task_id=task.id,
                    source_config_id=source_config.id if source_config else None,
                    title=payload["title"],
                    summary=payload["summary"],
                    content_text=payload["content_text"],
                    source_name=payload["source_name"],
                    source_url=payload["source_url"],
                    source_type=payload["source_type"],
                    authority_level=payload["authority_level"],
                    published_at=payload["published_at"],
                    topic_tag=payload["topic_tag"],
                    relevance_score=payload["relevance_score"],
                    dedup_key=payload["dedup_key"],
                    is_selected=payload["is_selected"],
                )
            )

        task.object_name = bundle.stock.name
        task.status = TaskStatus.ANALYZING.value
        task.current_stage = TaskStatus.ANALYZING.value
        task.progress_percent = ANALYZING_PROGRESS
        task.result_summary = (
            f"Collected {len(task.materials)} stock materials for "
            f"{bundle.stock.name} ({bundle.stock.symbol})."
        )
        task.task_params = {
            **(task.task_params or {}),
            "original_object_query": original_query,
            "resolved_stock_name": bundle.stock.name,
            "resolved_stock_symbol": bundle.stock.symbol,
            "resolved_stock_code": bundle.stock.code,
            "lookback_days": lookback_days,
            "quote_page_url": bundle.stock.quote_page_url,
        }

        append_stage_log(
            task,
            stage_code=TaskStatus.COLLECTING.value,
            log_status=StageLogStatus.COMPLETED.value,
            message=(
                f"Collected {len(task.materials)} market materials for "
                f"{bundle.stock.name} ({bundle.stock.symbol})."
            ),
            operator_type=OperatorType.WORKER.value,
            detail_data={
                "worker_name": worker_name,
                "lookback_days": lookback_days,
                "resolved_stock_symbol": bundle.stock.symbol,
                "material_count": len(task.materials),
            },
        )
        append_stage_log(
            task,
            stage_code=TaskStatus.ANALYZING.value,
            log_status=StageLogStatus.RUNNING.value,
            message="Stock materials collected. AI analysis is starting.",
            operator_type=OperatorType.WORKER.value,
            detail_data={
                "worker_name": worker_name,
                "progress_percent": ANALYZING_PROGRESS,
            },
        )

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def analyze_task(task_id: int, worker_name: str) -> None:
    db = SessionLocal()
    try:
        task = db.scalars(
            select(ResearchTask)
            .options(
                selectinload(ResearchTask.materials),
                selectinload(ResearchTask.selected_model),
                selectinload(ResearchTask.analysis_results),
            )
            .where(ResearchTask.id == task_id)
            .limit(1)
        ).first()
        if task is None:
            raise RuntimeError(f"Research task {task_id} was not found.")
        if task.selected_model_id is None:
            raise RuntimeError("The research task does not have a selected model.")

        requested_model_name = (
            task.selected_model.model_name
            if task.selected_model and task.selected_model.provider_code == "openai"
            else settings.openai_model_name
        )

        analysis = generate_stock_analysis(
            settings=settings,
            model_name=requested_model_name,
            stock_name=str(task.task_params.get("resolved_stock_name") or task.object_name),
            stock_symbol=str(task.task_params.get("resolved_stock_symbol") or task.object_name),
            research_goal=task.research_goal,
            materials=task.materials,
            lookback_days=int(task.task_params.get("lookback_days") or settings.stock_lookback_days),
        )

        task.analysis_results.append(
            AnalysisResult(
                task_id=task.id,
                model_config_id=task.selected_model_id,
                summary=analysis.summary,
                key_findings="\n".join(analysis.key_findings),
                risks="\n".join(analysis.risks),
                opportunities="\n".join(analysis.opportunities),
                conclusion=analysis.conclusion,
                structured_payload={
                    "report_markdown": analysis.report_markdown,
                    "model_name": analysis.model_name,
                    "provider_code": analysis.provider_code,
                    "used_fallback": analysis.used_fallback,
                    "raw_response_text": analysis.raw_response_text,
                    "key_findings": analysis.key_findings,
                    "risks": analysis.risks,
                    "opportunities": analysis.opportunities,
                },
            )
        )

        task.status = TaskStatus.REPORTING.value
        task.current_stage = TaskStatus.REPORTING.value
        task.progress_percent = REPORTING_PROGRESS
        task.result_summary = analysis.summary

        append_stage_log(
            task,
            stage_code=TaskStatus.ANALYZING.value,
            log_status=StageLogStatus.COMPLETED.value,
            message="AI analysis finished and structured conclusions were saved.",
            operator_type=OperatorType.WORKER.value,
            detail_data={
                "worker_name": worker_name,
                "model_name": analysis.model_name,
                "used_fallback": analysis.used_fallback,
            },
        )
        append_stage_log(
            task,
            stage_code=TaskStatus.REPORTING.value,
            log_status=StageLogStatus.RUNNING.value,
            message="Structured report generation is starting.",
            operator_type=OperatorType.WORKER.value,
            detail_data={
                "worker_name": worker_name,
                "progress_percent": REPORTING_PROGRESS,
            },
        )

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def generate_task_report(task_id: int, worker_name: str) -> None:
    db = SessionLocal()
    try:
        task = db.scalars(
            select(ResearchTask)
            .options(
                selectinload(ResearchTask.analysis_results),
                selectinload(ResearchTask.reports),
            )
            .where(ResearchTask.id == task_id)
            .limit(1)
        ).first()
        if task is None:
            raise RuntimeError(f"Research task {task_id} was not found.")
        if not task.analysis_results:
            raise RuntimeError("No analysis result was available for report generation.")

        latest_analysis = max(
            task.analysis_results,
            key=lambda item: (item.created_at or datetime.min.replace(tzinfo=timezone.utc), item.id),
        )
        report_version = max((report.report_version for report in task.reports), default=0) + 1
        requested_report_type = str(task.task_params.get("report_type") or "").upper()
        report_type = (
            ReportType.FULL.value if requested_report_type == ReportType.FULL.value else ReportType.BRIEF.value
        )

        report_title = f"{task.object_name} 股票调研报告"
        markdown_content = (
            (latest_analysis.structured_payload or {}).get("report_markdown")
            or latest_analysis.summary
            or "No report content was generated."
        )

        task.reports.append(
            Report(
                task_id=task.id,
                report_type=report_type,
                report_version=report_version,
                title=report_title,
                markdown_content=markdown_content,
                status=ReportStatus.READY.value,
            )
        )

        task.status = TaskStatus.COMPLETED.value
        task.current_stage = TaskStatus.COMPLETED.value
        task.progress_percent = COMPLETED_PROGRESS
        task.completed_at = datetime.now(timezone.utc)
        task.error_message = None
        task.result_summary = latest_analysis.summary

        append_stage_log(
            task,
            stage_code=TaskStatus.REPORTING.value,
            log_status=StageLogStatus.COMPLETED.value,
            message="Report content was generated and saved.",
            operator_type=OperatorType.WORKER.value,
            detail_data={
                "worker_name": worker_name,
                "report_version": report_version,
                "report_type": report_type,
            },
        )
        append_stage_log(
            task,
            stage_code=TaskStatus.COMPLETED.value,
            log_status=StageLogStatus.COMPLETED.value,
            message="Stock research pipeline completed successfully.",
            operator_type=OperatorType.WORKER.value,
            detail_data={
                "worker_name": worker_name,
                "progress_percent": COMPLETED_PROGRESS,
            },
        )

        db.commit()
        logger.info("Completed stock research task id=%s.", task_id)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def mark_task_failed(task_id: int, worker_name: str, error: Exception) -> None:
    db = SessionLocal()
    try:
        task = db.get(ResearchTask, task_id)
        if task is None:
            logger.warning("Cannot mark missing task id=%s as failed.", task_id)
            return

        error_message = str(error).strip() or error.__class__.__name__
        task.status = TaskStatus.FAILED.value
        task.current_stage = TaskStatus.FAILED.value
        task.completed_at = datetime.now(timezone.utc)
        task.error_message = error_message

        append_stage_log(
            task,
            stage_code=TaskStatus.FAILED.value,
            log_status=StageLogStatus.FAILED.value,
            message="Worker failed while executing the stock research pipeline.",
            operator_type=OperatorType.WORKER.value,
            detail_data={
                "worker_name": worker_name,
                "error_message": error_message,
            },
        )

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def process_task(task_id: int, worker_name: str, stage_delay: float) -> None:
    collect_task_materials(task_id, worker_name)

    if stage_delay > 0:
        time.sleep(stage_delay)

    analyze_task(task_id, worker_name)

    if stage_delay > 0:
        time.sleep(stage_delay)

    generate_task_report(task_id, worker_name)


def run_worker(
    *,
    worker_name: str,
    once: bool,
    max_tasks: int | None,
    poll_interval: float,
    stage_delay: float,
) -> WorkerRunSummary:
    configure_logging()
    summary = WorkerRunSummary()

    while True:
        if max_tasks is not None and summary.claimed_tasks >= max_tasks:
            break

        task_id = claim_next_queued_task(worker_name)
        if task_id is None:
            if once:
                break
            logger.info("No queued tasks found. Sleeping for %.1f seconds.", poll_interval)
            time.sleep(poll_interval)
            continue

        summary.claimed_tasks += 1

        try:
            process_task(task_id, worker_name, stage_delay)
            summary.completed_tasks += 1
        except Exception as error:
            logger.exception("Worker failed while processing task id=%s.", task_id)
            mark_task_failed(task_id, worker_name, error)
            summary.failed_tasks += 1

    return summary
