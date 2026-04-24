from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.exc import OperationalError
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
    SourceType,
    TaskStatus,
)
from app.services.ai_research import format_object_type_label, generate_business_analysis
from app.services.business_sources import collect_research_materials
from app.services.research_tasks import append_stage_log

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


def build_web_material_payloads_from_analysis(analysis: Any) -> list[dict[str, object]]:
    payloads: list[dict[str, object]] = []
    for item in getattr(analysis, "grounded_sources", []):
        source_url = item.uri
        stored_source_url = source_url if source_url and len(source_url) <= 500 else None
        domain = item.domain or (urlparse(source_url).netloc if source_url else None)
        dedup_key = f"{item.source_id}:{(item.title or 'Gemini Google Search')[:180]}"
        payloads.append(
            {
                "topic_tag": item.source_id,
                "title": item.title,
                "summary": "Gemini 联网检索在分析阶段使用的公开来源。",
                "content_text": "\n".join(
                    line
                    for line in [
                        f"来源编号：{item.source_id}",
                        f"来源标题：{item.title}",
                        f"来源域名：{domain or '未知'}",
                        f"来源链接：{source_url or '未提供'}",
                    ]
                    if line
                ),
                "source_name": item.title or domain or "Gemini Google Search",
                "source_url": stored_source_url,
                "source_type": SourceType.WEB.value,
                "authority_level": "MEDIUM",
                "published_at": None,
                "relevance_score": 7.8,
                "is_selected": True,
                "dedup_key": dedup_key,
            }
        )
    return payloads


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
            message=(
                f"Worker {worker_name} started "
                f"{task.object_type.lower()} material collection."
            ),
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

        original_query = task.object_name
        collected = collect_research_materials(
            settings,
            object_type=task.object_type,
            object_name=original_query,
            research_goal=task.research_goal,
            time_range=task.time_range,
            source_strategy=task.source_strategy,
        )

        task.materials.clear()
        source_configs = {
            source.source_name: source
            for source in db.scalars(
                select(SourceConfig).where(SourceConfig.is_enabled.is_(True))
            ).all()
        }
        for payload in collected.materials:
            source_config = source_configs.get(str(payload["source_name"]))
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

        task.object_name = collected.display_name
        task.status = TaskStatus.ANALYZING.value
        task.current_stage = TaskStatus.ANALYZING.value
        task.progress_percent = ANALYZING_PROGRESS
        task.result_summary = (
            f"Collected {len(task.materials)} {task.object_type.lower()} materials for "
            f"{collected.display_name}."
        )
        task.task_params = {
            **(task.task_params or {}),
            "original_object_query": original_query,
            "resolved_object_name": collected.display_name,
            "resolved_symbol": collected.symbol,
            "lookback_days": collected.lookback_days,
            "material_collection_mode": collected.collection_mode,
            "material_collection_warnings": collected.warnings,
        }

        append_stage_log(
            task,
            stage_code=TaskStatus.COLLECTING.value,
            log_status=StageLogStatus.COMPLETED.value,
            message=(
                f"Collected {len(task.materials)} research materials for "
                f"{collected.display_name}."
            ),
            operator_type=OperatorType.WORKER.value,
            detail_data={
                "worker_name": worker_name,
                "lookback_days": collected.lookback_days,
                "resolved_symbol": collected.symbol,
                "material_count": len(task.materials),
                "collection_mode": collected.collection_mode,
                "warnings": collected.warnings,
            },
        )
        append_stage_log(
            task,
            stage_code=TaskStatus.ANALYZING.value,
            log_status=StageLogStatus.RUNNING.value,
            message="Research materials collected. AI analysis is starting.",
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
            if task.selected_model and task.selected_model.provider_code == "gemini"
            else settings.gemini_model_name
        )
        use_google_search = (
            str(task.task_params.get("material_collection_mode") or "").upper()
            == "NO_SOURCE"
        )

        analysis = generate_business_analysis(
            settings=settings,
            model_name=requested_model_name,
            object_type=task.object_type,
            object_name=str(task.task_params.get("resolved_object_name") or task.object_name),
            research_goal=task.research_goal,
            materials=task.materials,
            lookback_days=int(task.task_params.get("lookback_days") or settings.stock_lookback_days),
            allow_google_search=use_google_search,
        )

        if use_google_search and not task.materials and analysis.grounded_sources:
            for payload in build_web_material_payloads_from_analysis(analysis):
                task.materials.append(
                    Material(
                        task_id=task.id,
                        source_config_id=None,
                        title=str(payload["title"]),
                        summary=str(payload["summary"]) if payload["summary"] else None,
                        content_text=str(payload["content_text"]) if payload["content_text"] else None,
                        source_name=str(payload["source_name"]),
                        source_url=str(payload["source_url"]) if payload["source_url"] else None,
                        source_type=str(payload["source_type"]),
                        authority_level=str(payload["authority_level"]),
                        published_at=payload["published_at"],
                        topic_tag=str(payload["topic_tag"]) if payload["topic_tag"] else None,
                        relevance_score=float(payload["relevance_score"]),
                        dedup_key=str(payload["dedup_key"]) if payload["dedup_key"] else None,
                        is_selected=bool(payload["is_selected"]),
                    )
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
                    "grounded_sources": [
                        {
                            "source_id": item.source_id,
                            "title": item.title,
                            "uri": item.uri,
                            "domain": item.domain,
                        }
                        for item in analysis.grounded_sources
                    ],
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
                "used_google_search": use_google_search,
                "grounded_source_count": len(analysis.grounded_sources),
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

        report_title = f"{task.object_name} {format_object_type_label(task.object_type)}调研报告"
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
            message="Research pipeline completed successfully.",
            operator_type=OperatorType.WORKER.value,
            detail_data={
                "worker_name": worker_name,
                "progress_percent": COMPLETED_PROGRESS,
            },
        )

        db.commit()
        logger.info("Completed research task id=%s.", task_id)
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
            message="Worker failed while executing the research pipeline.",
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

        try:
            task_id = claim_next_queued_task(worker_name)
        except OperationalError as error:
            logger.warning(
                "Worker could not reach PostgreSQL while polling queued tasks: %s",
                error,
            )
            if once:
                break
            time.sleep(poll_interval)
            continue

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
