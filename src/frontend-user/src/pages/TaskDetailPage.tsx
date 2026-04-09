import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { StatePanel } from "../components/StatePanel";
import { useAuth } from "../context/AuthContext";
import {
  fetchResearchTaskDetail,
  fetchResearchTaskStatus,
  formatDateTime,
  formatObjectType,
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

function formatTaskParamValue(value: unknown): string {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  if (value === null || value === undefined) {
    return "暂无";
  }

  return JSON.stringify(value, null, 2);
}

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
          error instanceof Error
            ? error.message
            : "任务状态刷新失败，请稍后重试。",
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
          error instanceof Error
            ? error.message
            : "任务详情加载失败，请稍后重试。",
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

  return (
    <div className="page-section">
      <header className="page-title">
        <p className="eyebrow">任务详情</p>
        <h1>股票调研任务详情</h1>
        <p>
          当前页面会先请求 <code>GET /research/tasks/{"{task_id}"}</code>{" "}
          获取完整详情，任务未结束时再轮询{" "}
          <code>GET /research/tasks/{"{task_id}"}/status</code>{" "}
          同步最新进度、材料和报告结果。
        </p>
        <div className="page-meta-line">
          <p className="field-hint">最近刷新：{formatDateTime(lastUpdatedAt)}</p>
          <div className="button-row button-row-tight">
            <Link className="button-secondary" to="/tasks">
              返回任务中心
            </Link>
            <Link className="button-ghost" to="/workspace">
              再发起一条
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
          description="当前正在请求任务详情与状态信息，请稍候。"
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
          <section className="section-grid section-grid-wide">
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
                {activeTask.research_goal || "当前未填写额外调研目标。"}
              </p>

              <dl className="meta-grid">
                <div>
                  <dt>对象类型</dt>
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
                  <dt>当前进度</dt>
                  <dd>{activeStatus.progress_percent}%</dd>
                </div>
                <div>
                  <dt>创建时间</dt>
                  <dd>{formatDateTime(activeTask.created_at)}</dd>
                </div>
                <div>
                  <dt>更新时间</dt>
                  <dd>{formatDateTime(activeTask.updated_at)}</dd>
                </div>
                <div>
                  <dt>开始时间</dt>
                  <dd>{formatDateTime(activeStatus.started_at ?? activeTask.started_at)}</dd>
                </div>
                <div>
                  <dt>完成时间</dt>
                  <dd>
                    {formatDateTime(
                      activeStatus.completed_at ?? activeTask.completed_at,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>模型</dt>
                  <dd>{activeTask.selected_model?.display_name || "默认模型"}</dd>
                </div>
                <div>
                  <dt>时间范围</dt>
                  <dd>{activeTask.time_range || "未指定"}</dd>
                </div>
                <div>
                  <dt>信息源策略</dt>
                  <dd>{activeTask.source_strategy || "DEFAULT"}</dd>
                </div>
                <div>
                  <dt>材料数量</dt>
                  <dd>{materials.length}</dd>
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

              {activeStatus.error_message ? (
                <p className="form-message form-message-error">
                  {activeStatus.error_message}
                </p>
              ) : null}

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
                <Link className="button-ghost" to="/tasks">
                  返回任务中心
                </Link>
              </div>
            </article>

            <article className="section-card">
              <h2>任务参数</h2>
              <dl className="kv-list">
                {Object.keys(activeTask.task_params).length > 0 ? (
                  Object.entries(activeTask.task_params).map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{formatTaskParamValue(value)}</dd>
                    </div>
                  ))
                ) : (
                  <div>
                    <dt>task_params</dt>
                    <dd>暂无额外参数</dd>
                  </div>
                )}
              </dl>

              <div className="info-panel">
                <strong>当前联调说明</strong>
                <p>
                  第 8 步最小闭环已经接入真实股票行情采集、AI 分析与报告写库，
                  当前任务详情页会持续展示最新材料、分析结果和 Markdown 报告。
                </p>
              </div>
            </article>
          </section>

          <section className="section-card">
            <div className="toolbar-inline">
              <h2>调研材料</h2>
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
                            {material.authority_level}
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
                        <dd>{material.source_type}</dd>
                      </div>
                      <div>
                        <dt>相关性</dt>
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

          <section className="section-grid section-grid-wide">
            <article className="section-card">
              <div className="toolbar-inline">
                <h2>分析结果</h2>
                {latestAnalysis?.model_config_detail?.display_name ? (
                  <span className="field-hint">
                    模型：{latestAnalysis.model_config_detail.display_name}
                  </span>
                ) : null}
              </div>

              {latestAnalysis ? (
                <div className="result-stack">
                  <div className="result-block">
                    <h3>摘要</h3>
                    <p>{latestAnalysis.summary || "暂无摘要。"}</p>
                  </div>
                  {renderTextList(
                    "核心发现",
                    latestAnalysis.key_findings,
                    "当前还没有核心发现。",
                  )}
                  {renderTextList("风险", latestAnalysis.risks, "当前还没有风险项。")}
                  {renderTextList(
                    "机会",
                    latestAnalysis.opportunities,
                    "当前还没有机会项。",
                  )}
                  <div className="result-block">
                    <h3>结论</h3>
                    <p>{latestAnalysis.conclusion || "暂无结论。"}</p>
                  </div>
                </div>
              ) : (
                <p>分析阶段尚未产出结果。</p>
              )}
            </article>

            <article className="section-card">
              <div className="toolbar-inline">
                <h2>最新报告</h2>
                {latestReport ? (
                  <span className="field-hint">
                    版本 {latestReport.report_version} / {latestReport.report_type}
                  </span>
                ) : null}
              </div>

              {latestReport ? (
                <div className="result-stack">
                  <div className="result-block">
                    <h3>{latestReport.title}</h3>
                    <p>
                      状态：{latestReport.status}，更新时间：
                      {formatDateTime(latestReport.updated_at)}
                    </p>
                  </div>
                  <pre className="text-preformatted report-markdown">
                    {latestReport.markdown_content || "暂无报告正文。"}
                  </pre>
                </div>
              ) : (
                <p>报告阶段尚未生成内容。</p>
              )}
            </article>
          </section>

          <section className="section-card">
            <h2>阶段日志</h2>
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
                      {formatDateTime(log.created_at)} / {log.operator_type}
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
