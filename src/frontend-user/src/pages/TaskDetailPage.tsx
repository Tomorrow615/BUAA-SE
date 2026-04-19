import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { StatePanel } from "../components/StatePanel";
import { useAuth } from "../context/AuthContext";
import {
  fetchResearchTaskDetail,
  fetchResearchTaskStatus,
  formatAuthorityLevel,
  formatDateTime,
  formatObjectType,
  formatOperatorType,
  formatReportStatus,
  formatReportType,
  formatSourceStrategy,
  formatSourceType,
  formatTaskParamLabel,
  formatTaskParamValue,
  formatTaskStatus,
  isTerminalTaskStatus,
  toStatusClassName,
  type ResearchAnalysisResult,
  type ResearchMaterial,
  type ResearchReport,
  type ResearchTaskDetail,
  type ResearchTaskStatusResponse,
  type TaskStageLog,
} from "../lib/research";

function splitTextLines(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.replace(/^[-*]\s*/, ""));
}

function renderTextList(
  title: string,
  value: string | null | undefined,
  emptyText: string,
) {
  const items = splitTextLines(value);

  return (
    <div className="result-block">
      <h3>{title}</h3>
      {items.length > 0 ? (
        <ul className="line-list">
          {items.map((item, index) => (
            <li key={`${title}-${index}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>{emptyText}</p>
      )}
    </div>
  );
}

function resolveReportSourcePresentation(
  task: ResearchTaskDetail,
  materials: ResearchMaterial[],
): { badge: string; description: string } {
  const materialCollectionMode = String(
    task.task_params?.material_collection_mode || "",
  ).toUpperCase();

  if (materialCollectionMode === "GEMINI_GOOGLE_SEARCH") {
    return {
      badge: "Gemini 联网补充",
      description:
        "当前报告是在内置数据源不可用时，改由 Gemini 联网检索公开来源后整理生成的。",
    };
  }

  if (materials.some((item) => item.source_type === "API")) {
    return {
      badge: "内置数据源",
      description: "当前报告主要基于已接入的数据接口与模型分析结果整理生成。",
    };
  }

  if (materials.some((item) => item.source_type === "WEB")) {
    return {
      badge: "网页资料整理",
      description: "当前报告主要基于网页资料与模型分析结果整理生成。",
    };
  }

  return {
    badge: "研究结果整理",
    description: "当前报告基于本次任务沉淀的研究材料与模型分析结果生成。",
  };
}

export function TaskDetailPage() {
  const { taskId } = useParams();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? null;

  const numericTaskId = Number(taskId);
  const isInvalidTaskId = !taskId || Number.isNaN(numericTaskId);

  const [taskDetail, setTaskDetail] = useState<ResearchTaskDetail | null>(null);
  const [liveStatus, setLiveStatus] = useState<ResearchTaskStatusResponse | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    const token = accessToken;
    if (isInvalidTaskId || !token) {
      return;
    }
    const resolvedAccessToken: string = token;

    let cancelled = false;
    let intervalId: number | null = null;

    async function refreshStatus() {
      try {
        const statusPayload = await fetchResearchTaskStatus(
          resolvedAccessToken,
          numericTaskId,
        );

        if (cancelled) {
          return;
        }

        setLiveStatus(statusPayload);
        setLastUpdatedAt(new Date().toISOString());

        if (isTerminalTaskStatus(statusPayload.status) && intervalId !== null) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : "任务状态刷新失败，请稍后重试。",
        );
      }
    }

    async function loadTaskDetail() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const detailPayload = await fetchResearchTaskDetail(
          resolvedAccessToken,
          numericTaskId,
        );

        if (cancelled) {
          return;
        }

        setTaskDetail(detailPayload);
        setLiveStatus(null);
        setLastUpdatedAt(new Date().toISOString());

        if (!isTerminalTaskStatus(detailPayload.status) && intervalId === null) {
          intervalId = window.setInterval(() => {
            void refreshStatus();
          }, 4000);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : "任务详情加载失败，请稍后重试。",
        );
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadTaskDetail();

    return () => {
      cancelled = true;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [accessToken, isInvalidTaskId, numericTaskId]);

  async function handleManualRefresh() {
    if (isInvalidTaskId || !accessToken) {
      return;
    }

    setIsRefreshing(true);
    setErrorMessage("");

    try {
      const [detailPayload, statusPayload] = await Promise.all([
        fetchResearchTaskDetail(accessToken, numericTaskId),
        fetchResearchTaskStatus(accessToken, numericTaskId),
      ]);
      setTaskDetail(detailPayload);
      setLiveStatus(statusPayload);
      setLastUpdatedAt(new Date().toISOString());
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "任务刷新失败，请稍后重试。",
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  if (isInvalidTaskId) {
    return (
      <div className="page-section">
        <StatePanel
          eyebrow="任务状态"
          title="任务编号无效"
          description="当前路由中没有有效任务编号，请返回任务中心重新选择任务。"
          tone="warning"
          actions={
            <Link className="button-primary" to="/tasks">
              返回任务中心
            </Link>
          }
        />
      </div>
    );
  }

  const activeTask = taskDetail;
  const activeStatus = liveStatus ?? taskDetail;
  const stageLogs: TaskStageLog[] =
    activeStatus?.stage_logs ?? taskDetail?.stage_logs ?? [];
  const materials: ResearchMaterial[] =
    liveStatus?.materials ?? taskDetail?.materials ?? [];
  const latestAnalysis: ResearchAnalysisResult | null =
    liveStatus?.latest_analysis_result ??
    taskDetail?.latest_analysis_result ??
    null;
  const latestReport: ResearchReport | null =
    liveStatus?.latest_report ?? taskDetail?.latest_report ?? null;
  const reportSourcePresentation = activeTask
    ? resolveReportSourcePresentation(activeTask, materials)
    : null;

  return (
    <div className="page-section task-detail-page">
      <header className="page-title detail-hero">
        <div>
          <p className="eyebrow">研究交付</p>
          <h1>研究任务详情</h1>
          <p>
            当前页面围绕研究总览、成果资产、材料引用与过程日志组织。导出、收藏、追问等入口已按最终形态预留。
          </p>
        </div>

        <div className="detail-hero-actions">
          <p className="field-hint">最近刷新：{formatDateTime(lastUpdatedAt)}</p>
          <div className="button-row button-row-tight">
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                void handleManualRefresh();
              }}
              disabled={isRefreshing}
            >
              {isRefreshing ? "正在刷新..." : "刷新状态"}
            </button>
            <button type="button" className="button-secondary" disabled>
              导出 PDF
            </button>
            <button type="button" className="button-ghost" disabled>
              收藏任务
            </button>
            <Link className="button-ghost" to="/tasks">
              返回任务中心
            </Link>
          </div>
        </div>
      </header>

      {errorMessage ? (
        <p className="form-message form-message-error">{errorMessage}</p>
      ) : null}

      {isLoading && !activeTask ? (
        <StatePanel
          eyebrow="任务状态"
          title="正在加载任务详情"
          description="当前正在同步任务详情与状态信息，请稍候。"
        />
      ) : null}

      {!isLoading && !activeTask ? (
        <StatePanel
          eyebrow="任务状态"
          title="暂时没有拿到任务详情"
          description="你可以返回任务中心重新进入，或者稍后再刷新一次。"
          tone={errorMessage ? "danger" : "warning"}
          actions={
            <>
              <button
                type="button"
                className="button-primary"
                onClick={() => {
                  void handleManualRefresh();
                }}
              >
                立即重试
              </button>
              <Link className="button-ghost" to="/tasks">
                返回任务中心
              </Link>
            </>
          }
        />
      ) : null}

      {activeTask && activeStatus ? (
        <>
          <section className="overview-metric-grid detail-metric-grid">
            <article className="overview-metric-card">
              <strong>{formatTaskStatus(activeStatus.status)}</strong>
              <span>当前状态</span>
            </article>
            <article className="overview-metric-card">
              <strong>{activeStatus.progress_percent}%</strong>
              <span>任务进度</span>
            </article>
            <article className="overview-metric-card">
              <strong>{materials.length}</strong>
              <span>研究材料</span>
            </article>
            <article className="overview-metric-card">
              <strong>{latestReport ? latestReport.report_version : "-"}</strong>
              <span>报告版本</span>
            </article>
          </section>

          <section className="section-grid section-grid-wide detail-overview-grid">
            <article className="section-card">
              <div className="task-card-header">
                <div>
                  <p className="eyebrow">任务编号 {activeTask.task_no}</p>
                  <h2>{activeTask.task_title}</h2>
                </div>
                <span className={toStatusClassName(activeStatus.status)}>
                  {formatTaskStatus(activeStatus.status)}
                </span>
              </div>

              <p className="task-summary">
                {activeTask.research_goal || "当前未填写额外研究目标。"}
              </p>

              <dl className="meta-grid">
                <div>
                  <dt>研究对象</dt>
                  <dd>{formatObjectType(activeTask.object_type)}</dd>
                </div>
                <div>
                  <dt>对象名称</dt>
                  <dd>{activeTask.object_name}</dd>
                </div>
                <div>
                  <dt>当前阶段</dt>
                  <dd>{formatTaskStatus(activeStatus.current_stage)}</dd>
                </div>
                <div>
                  <dt>研究模型</dt>
                  <dd>{activeTask.selected_model?.display_name || "默认模型"}</dd>
                </div>
                <div>
                  <dt>时间范围</dt>
                  <dd>{activeTask.time_range || "未指定"}</dd>
                </div>
                <div>
                  <dt>信息源策略</dt>
                  <dd>{formatSourceStrategy(activeTask.source_strategy)}</dd>
                </div>
                <div>
                  <dt>创建时间</dt>
                  <dd>{formatDateTime(activeTask.created_at)}</dd>
                </div>
                <div>
                  <dt>完成时间</dt>
                  <dd>
                    {formatDateTime(
                      activeStatus.completed_at ?? activeTask.completed_at,
                    )}
                  </dd>
                </div>
              </dl>

              <div className="progress-bar progress-bar-large">
                <span
                  style={{
                    width: `${Math.min(
                      Math.max(activeStatus.progress_percent, 4),
                      100,
                    )}%`,
                  }}
                />
              </div>

              {activeStatus.result_summary ? (
                <div className="info-panel">
                  <strong>结果摘要</strong>
                  <p>{activeStatus.result_summary}</p>
                </div>
              ) : null}
            </article>

            <article className="section-card">
              <h2>交付与协作</h2>
              <div className="delivery-grid">
                <div className="delivery-card">
                  <strong>Markdown 报告</strong>
                  <span>{latestReport ? "已生成" : "待生成"}</span>
                </div>
                <div className="delivery-card">
                  <strong>PDF 导出</strong>
                  <span>即将开放</span>
                </div>
                <div className="delivery-card">
                  <strong>Word 导出</strong>
                  <span>即将开放</span>
                </div>
                <div className="delivery-card">
                  <strong>追问报告</strong>
                  <span>即将开放</span>
                </div>
              </div>

              <div className="button-row">
                <button type="button" className="button-secondary" disabled>
                  导出 Word
                </button>
                <button type="button" className="button-secondary" disabled>
                  追问报告
                </button>
                <button type="button" className="button-ghost" disabled>
                  设置提醒
                </button>
              </div>

              <h2 className="section-subtitle">研究配置</h2>
              <dl className="kv-list">
                {Object.keys(activeTask.task_params).length > 0 ? (
                  Object.entries(activeTask.task_params).map(([key, value]) => (
                    <div key={key}>
                      <dt>{formatTaskParamLabel(key)}</dt>
                      <dd>{formatTaskParamValue(key, value)}</dd>
                    </div>
                  ))
                ) : (
                  <div>
                    <dt>研究配置</dt>
                    <dd>暂无额外配置</dd>
                  </div>
                )}
              </dl>
            </article>
          </section>

          <section className="section-card detail-report-card">
            <div className="detail-report-head">
              <div>
                <h2>研究报告正文</h2>
                <p className="detail-section-copy">
                  这里展示当前任务最新生成的一版完整报告，适合直接通读结论、发现和风险。
                </p>
              </div>

              {latestReport ? (
                <div className="detail-report-version">
                  <strong>第 {latestReport.report_version} 版</strong>
                  <span>{formatReportType(latestReport.report_type)}</span>
                </div>
              ) : null}
            </div>

            {latestReport ? (
              <div className="detail-report-stack">
                <div className="report-stage-card">
                  <div className="report-stage-card-head">
                    <div>
                      <h3>{latestReport.title}</h3>
                      <p className="detail-section-copy">
                        {reportSourcePresentation?.description ||
                          "当前报告已经生成，可直接阅读正文。"}
                      </p>
                    </div>

                    <div className="report-stage-badges">
                      <span className="soft-badge soft-badge-cool">
                        {formatReportStatus(latestReport.status)}
                      </span>
                      {reportSourcePresentation ? (
                        <span className="soft-badge soft-badge-warm">
                          {reportSourcePresentation.badge}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="report-stage-meta">
                    <span>更新时间：{formatDateTime(latestReport.updated_at)}</span>
                    <span>版本说明：最新可查看正文</span>
                  </div>
                </div>

                {latestReport.markdown_content ? (
                  <div className="report-markdown-surface">
                    <MarkdownRenderer content={latestReport.markdown_content} />
                  </div>
                ) : (
                  <p className="detail-empty-copy">当前还没有可展示的报告正文。</p>
                )}
              </div>
            ) : (
              <p className="detail-empty-copy">报告阶段尚未生成内容。</p>
            )}
          </section>

          <section className="section-card detail-analysis-card">
            <div className="toolbar-inline">
              <div>
                <h2>分析结果概览</h2>
                <p className="detail-section-copy">
                  这里展示模型整理出的摘要、关键发现、风险和机会，适合快速扫读。
                </p>
              </div>
              {latestAnalysis?.model_config_detail?.display_name ? (
                <span className="field-hint">
                  由 {latestAnalysis.model_config_detail.display_name} 生成
                </span>
              ) : null}
            </div>

            {latestAnalysis ? (
              <div className="result-stack">
                <div className="result-block">
                  <h3>核心摘要</h3>
                  <p>{latestAnalysis.summary || "暂无摘要。"}</p>
                </div>
                {renderTextList(
                  "关键发现",
                  latestAnalysis.key_findings,
                  "当前还没有关键发现。",
                )}
                {renderTextList("风险提示", latestAnalysis.risks, "当前还没有风险项。")}
                {renderTextList(
                  "机会与观察",
                  latestAnalysis.opportunities,
                  "当前还没有机会项。",
                )}
                <div className="result-block">
                  <h3>结论</h3>
                  <p>{latestAnalysis.conclusion || "暂无结论。"}</p>
                </div>
              </div>
            ) : (
              <p className="detail-empty-copy">分析阶段尚未产出结果。</p>
            )}
          </section>

          <section className="section-card">
            <div className="toolbar-inline">
              <h2>研究材料</h2>
              <span className="field-hint">共 {materials.length} 条</span>
            </div>

            {materials.length === 0 ? (
              <p>当前还没有采集到材料。</p>
            ) : (
              <div className="material-list">
                {materials.map((material) => (
                  <article key={material.id} className="material-card">
                    <div className="material-card-head">
                      <div>
                        <div className="chip-row">
                          {material.topic_tag ? (
                            <span className="reference-chip">{material.topic_tag}</span>
                          ) : null}
                          <span className="status-chip">
                            {formatAuthorityLevel(material.authority_level)}
                          </span>
                        </div>
                        <h3>{material.title}</h3>
                      </div>
                      <small>
                        发布时间：{formatDateTime(material.published_at)}
                      </small>
                    </div>

                    <p>{material.summary || "暂无摘要。"}</p>

                    <dl className="meta-inline">
                      <div>
                        <dt>来源</dt>
                        <dd>{material.source_name}</dd>
                      </div>
                      <div>
                        <dt>类型</dt>
                        <dd>{formatSourceType(material.source_type)}</dd>
                      </div>
                      <div>
                        <dt>相关度</dt>
                        <dd>{material.relevance_score.toFixed(2)}</dd>
                      </div>
                    </dl>

                    {material.source_url ? (
                      <a
                        className="source-link"
                        href={material.source_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        打开原始来源
                      </a>
                    ) : null}

                    {material.content_text ? (
                      <pre className="text-preformatted">{material.content_text}</pre>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="section-card">
            <div className="toolbar-inline">
              <h2>过程日志</h2>
              <button type="button" className="button-ghost" disabled>
                导出日志
              </button>
            </div>

            {stageLogs.length === 0 ? (
              <p>当前还没有阶段日志。</p>
            ) : (
              <div className="timeline">
                {stageLogs.map((log) => (
                  <div key={log.id} className="timeline-item timeline-item-rich">
                    <div className="timeline-item-head">
                      <strong>
                        {log.stage_name || formatTaskStatus(log.stage_code)}
                      </strong>
                      <span className={toStatusClassName(log.status)}>
                        {formatTaskStatus(log.status)}
                      </span>
                    </div>
                    <p>{log.message}</p>
                    <small>
                      {formatDateTime(log.created_at)} · {formatOperatorType(log.operator_type)}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
