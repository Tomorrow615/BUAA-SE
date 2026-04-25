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

function stripJsonFence(value: string): string {
  const trimmed = value.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function markdownValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => markdownValue(item))
      .filter(Boolean)
      .map((item) => (item.startsWith("- ") ? item : `- ${item}`))
      .join("\n");
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}

function buildMarkdownFromReportObject(payload: Record<string, unknown>): string {
  const parts: string[] = [];
  const title = markdownValue(payload.title);

  if (title) {
    parts.push(`# ${title.replace(/^#+\s*/, "")}`);
  }

  const sectionEntries: Array<[string, unknown]> = [
    ["核心摘要", payload.summary ?? payload.overview],
    ["关键发现", payload.key_findings ?? payload.keyFindings],
    ["风险提示", payload.risks ?? payload.risk_factors ?? payload.riskFactors],
    ["机会与观察", payload.opportunities ?? payload.chances],
    ["结论", payload.conclusion ?? payload.final_view],
  ];

  sectionEntries.forEach(([heading, value]) => {
    const body = markdownValue(value);
    if (body) {
      parts.push(`## ${heading}\n\n${body}`);
    }
  });

  return parts.join("\n\n");
}

function extractMarkdownFromPayload(payload: unknown): string | null {
  if (typeof payload === "string") {
    return payload.trim() || null;
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const reportObject = payload as Record<string, unknown>;
  const markdownKeys = [
    "report_markdown",
    "markdown_content",
    "markdown",
    "reportMarkdown",
    "report",
    "content",
  ];

  for (const key of markdownKeys) {
    const value = reportObject[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    const nestedMarkdown = extractMarkdownFromPayload(value);
    if (nestedMarkdown) {
      return nestedMarkdown;
    }
  }

  const rebuiltMarkdown = buildMarkdownFromReportObject(reportObject);
  return rebuiltMarkdown || null;
}

function normalizeReportMarkdown(
  content: string | null | undefined,
  fallbackTitle: string,
): string {
  if (!content) {
    return "";
  }

  const candidate = stripJsonFence(content);

  try {
    const parsed = JSON.parse(candidate) as unknown;
    const extractedMarkdown = extractMarkdownFromPayload(parsed);
    if (extractedMarkdown) {
      return ensureReportTitle(extractedMarkdown, fallbackTitle);
    }
  } catch {
    // Non-JSON Markdown reports fall through to the original content.
  }

  const reportMarkdownMatch = candidate.match(
    /"report_markdown"\s*:\s*"([\s\S]*?)"\s*(?:,\s*"|})/,
  );
  if (reportMarkdownMatch) {
    try {
      return ensureReportTitle(
        JSON.parse(`"${reportMarkdownMatch[1]}"`) as string,
        fallbackTitle,
      );
    } catch {
      return ensureReportTitle(reportMarkdownMatch[1], fallbackTitle);
    }
  }

  return ensureReportTitle(content.trim(), fallbackTitle);
}

function ensureReportTitle(markdown: string, fallbackTitle: string): string {
  const trimmed = markdown.trim();
  if (!trimmed) {
    return "";
  }

  if (/^#\s+/m.test(trimmed)) {
    return trimmed;
  }

  return `# ${fallbackTitle || "研究报告"}\n\n${trimmed}`;
}

function extractCitationIds(markdown: string): string[] {
  const ids = new Set<string>();
  const citationPattern = /\[((?:SRC|WEB)_\d+)\]/g;
  let match = citationPattern.exec(markdown);

  while (match) {
    ids.add(match[1]);
    match = citationPattern.exec(markdown);
  }

  return Array.from(ids);
}

function getMaterialSourceId(material: ResearchMaterial, index: number): string {
  const topicTag = material.topic_tag?.trim().replace(/^\[|\]$/g, "");
  return topicTag || `SRC_${String(index + 1).padStart(3, "0")}`;
}

function createExportFileName(baseName: string, extension: string): string {
  const safeName =
    baseName
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "-")
      .slice(0, 90) || "research-report";

  return `${safeName}.${extension}`;
}

function downloadTextFile(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildReportExportMarkdown(
  task: ResearchTaskDetail,
  report: ResearchReport,
  reportMarkdown: string,
  materials: ResearchMaterial[],
): string {
  const metadata = [
    `> 任务编号：${task.task_no}`,
    `> 研究对象：${formatObjectType(task.object_type)} / ${task.object_name}`,
    `> 报告版本：第 ${report.report_version} 版`,
    `> 更新时间：${formatDateTime(report.updated_at)}`,
  ].join("\n");

  const sourceIndex =
    materials.length > 0
      ? [
          "## 引用来源索引",
          ...materials.map((material, index) => {
            const sourceId = getMaterialSourceId(material, index);
            const sourceUrl = material.source_url
              ? ` - ${material.source_url}`
              : "";
            return `- [${sourceId}] ${material.title}（${material.source_name}，${formatAuthorityLevel(
              material.authority_level,
            )}）${sourceUrl}`;
          }),
        ].join("\n")
      : "";

  return [metadata, reportMarkdown, sourceIndex].filter(Boolean).join("\n\n");
}

interface MaterialRow {
  material: ResearchMaterial;
  sourceId: string;
  isCited: boolean;
}

interface SourceDetailPanelProps {
  citationIds: string[];
  rows: MaterialRow[];
  selectedSourceId: string | null;
  selectedMaterial: ResearchMaterial | null;
  onSelectSource: (sourceId: string) => void;
}

function SourceDetailPanel({
  citationIds,
  rows,
  selectedSourceId,
  selectedMaterial,
  onSelectSource,
}: SourceDetailPanelProps) {
  return (
    <aside className="citation-sidebar no-print">
      <div className="citation-sidebar-head">
        <div>
          <p className="eyebrow">Sources</p>
          <h3>引用出处</h3>
        </div>
        <span>{citationIds.length || rows.length} 个索引</span>
      </div>

      {selectedSourceId ? (
        <div className="source-detail-card">
          {selectedMaterial ? (
            <>
              <div className="source-detail-title">
                <span className="reference-chip">{selectedSourceId}</span>
                <strong>{selectedMaterial.title}</strong>
              </div>
              <p>{selectedMaterial.summary || "当前来源暂无摘要。"}</p>

              <dl className="source-detail-meta">
                <div>
                  <dt>来源</dt>
                  <dd>{selectedMaterial.source_name}</dd>
                </div>
                <div>
                  <dt>类型</dt>
                  <dd>{formatSourceType(selectedMaterial.source_type)}</dd>
                </div>
                <div>
                  <dt>可信度</dt>
                  <dd>{formatAuthorityLevel(selectedMaterial.authority_level)}</dd>
                </div>
                <div>
                  <dt>发布时间</dt>
                  <dd>{formatDateTime(selectedMaterial.published_at)}</dd>
                </div>
                <div>
                  <dt>相关度</dt>
                  <dd>{selectedMaterial.relevance_score.toFixed(2)}</dd>
                </div>
              </dl>

              {selectedMaterial.source_url ? (
                <a
                  className="source-link"
                  href={selectedMaterial.source_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  打开原始来源
                </a>
              ) : null}

              {selectedMaterial.content_text ? (
                <div className="source-content-preview">
                  {selectedMaterial.content_text}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="source-detail-title">
                <span className="reference-chip">{selectedSourceId}</span>
                <strong>未匹配到材料</strong>
              </div>
              <p>
                报告正文引用了这个编号，但当前任务返回的材料列表里没有对应条目。
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="source-empty-card">
          <strong>点击正文中的引用编号</strong>
          <p>例如 [SRC_001]，右侧会展开来源、可信度、链接和原文摘录。</p>
        </div>
      )}

      <div className="citation-chip-panel">
        <strong>正文引用</strong>
        {citationIds.length > 0 ? (
          <div className="citation-chip-list">
            {citationIds.map((sourceId) => (
              <button
                key={sourceId}
                type="button"
                className={
                  sourceId === selectedSourceId
                    ? "citation-chip citation-chip-active"
                    : "citation-chip"
                }
                onClick={() => onSelectSource(sourceId)}
              >
                {sourceId}
              </button>
            ))}
          </div>
        ) : (
          <p>当前报告正文还没有显式引用编号。</p>
        )}
      </div>

      <div className="citation-chip-panel">
        <strong>全部材料</strong>
        <div className="citation-chip-list">
          {rows.map((row) => (
            <button
              key={`${row.sourceId}-${row.material.id}`}
              type="button"
              className={
                row.sourceId === selectedSourceId
                  ? "citation-chip citation-chip-active"
                  : "citation-chip"
              }
              onClick={() => onSelectSource(row.sourceId)}
            >
              {row.sourceId}
            </button>
          ))}
        </div>
      </div>
    </aside>
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
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState("");

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

  useEffect(() => {
    setSelectedSourceId(null);
    setCopyMessage("");
  }, [numericTaskId]);

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
  const reportMarkdown = latestReport
    ? normalizeReportMarkdown(
        latestReport.markdown_content,
        latestReport.title || activeTask?.task_title || "研究报告",
      )
    : "";
  const citationIds = extractCitationIds(reportMarkdown);
  const citationIdSet = new Set(citationIds);
  const materialRows: MaterialRow[] = materials.map((material, index) => {
    const sourceId = getMaterialSourceId(material, index);
    return {
      material,
      sourceId,
      isCited: citationIdSet.has(sourceId),
    };
  });
  const selectedSourceRow =
    selectedSourceId === null
      ? null
      : materialRows.find((row) => row.sourceId === selectedSourceId) ?? null;
  const selectedMaterial = selectedSourceRow?.material ?? null;
  const canExportReport = Boolean(activeTask && latestReport && reportMarkdown);

  function handleSelectSource(sourceId: string) {
    setSelectedSourceId(sourceId);
  }

  function handleDownloadMarkdown() {
    if (!activeTask || !latestReport || !reportMarkdown) {
      return;
    }

    downloadTextFile(
      createExportFileName(latestReport.title || activeTask.task_title, "md"),
      buildReportExportMarkdown(
        activeTask,
        latestReport,
        reportMarkdown,
        materials,
      ),
    );
  }

  function handlePrintReport() {
    if (!canExportReport) {
      return;
    }

    const originalTitle = document.title;
    document.title = createExportFileName(
      latestReport?.title || activeTask?.task_title || "研究报告",
      "pdf",
    ).replace(/\.pdf$/, "");
    window.print();
    window.setTimeout(() => {
      document.title = originalTitle;
    }, 500);
  }

  async function handleCopyMarkdown() {
    if (!activeTask || !latestReport || !reportMarkdown) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        buildReportExportMarkdown(
          activeTask,
          latestReport,
          reportMarkdown,
          materials,
        ),
      );
      setCopyMessage("已复制 Markdown");
    } catch {
      setCopyMessage("复制失败，请使用下载 Markdown");
    }
  }

  return (
    <div className="page-section task-detail-page">
      <header className="page-title detail-hero">
        <div>
          <p className="eyebrow">Report</p>
          <h1>研究任务详情</h1>
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
            <button
              type="button"
              className="button-secondary"
              onClick={handleDownloadMarkdown}
              disabled={!canExportReport}
            >
              下载 Markdown
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={handlePrintReport}
              disabled={!canExportReport}
            >
              导出 PDF
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
              <h2>操作</h2>
              <div className="delivery-grid">
                <div className="delivery-card">
                  <strong>报告</strong>
                  <span>{latestReport ? "已生成" : "处理中"}</span>
                </div>
                <div className="delivery-card">
                  <strong>Markdown</strong>
                  <span>{canExportReport ? "可下载" : "待生成"}</span>
                </div>
                <div className="delivery-card">
                  <strong>PDF</strong>
                  <span>{canExportReport ? "可打印导出" : "待生成"}</span>
                </div>
                <div className="delivery-card">
                  <strong>引用</strong>
                  <span>{citationIds.length} 个正文索引</span>
                </div>
              </div>

              <div className="button-row report-action-row">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={handleDownloadMarkdown}
                  disabled={!canExportReport}
                >
                  下载 Markdown
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={handlePrintReport}
                  disabled={!canExportReport}
                >
                  导出 PDF
                </button>
                <button
                  type="button"
                  className="button-ghost"
                  onClick={() => {
                    void handleCopyMarkdown();
                  }}
                  disabled={!canExportReport}
                >
                  复制 Markdown
                </button>
              </div>
              {copyMessage ? (
                <p className="field-hint report-copy-status">{copyMessage}</p>
              ) : null}

              <h2 className="section-subtitle">配置</h2>
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

          <section className="section-card detail-report-card printable-report">
            <div className="detail-report-head">
              <div>
                <h2>研究报告正文</h2>
                <p className="detail-section-copy">
                  正文中的引用编号可点击查看来源，PDF 可通过浏览器打印保存。
                </p>
              </div>

              {latestReport ? (
                <div className="detail-report-tools no-print">
                  <div className="detail-report-version">
                    <strong>第 {latestReport.report_version} 版</strong>
                    <span>{formatReportType(latestReport.report_type)}</span>
                  </div>
                  <div className="button-row button-row-tight report-action-row">
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={handleDownloadMarkdown}
                      disabled={!canExportReport}
                    >
                      下载 Markdown
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={handlePrintReport}
                      disabled={!canExportReport}
                    >
                      导出 PDF
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            {latestReport ? (
              <div className="detail-report-stack">
                <div className="report-stage-card">
                  <div className="report-stage-card-head">
                    <div>
                      <h3>{latestReport.title}</h3>
                    </div>

                    <div className="report-stage-badges">
                      <span className="soft-badge soft-badge-cool">
                        {formatReportStatus(latestReport.status)}
                      </span>
                    </div>
                  </div>

                  <div className="report-stage-meta">
                    <span>更新时间：{formatDateTime(latestReport.updated_at)}</span>
                    <span>版本说明：最新可查看正文</span>
                  </div>
                </div>

                {reportMarkdown ? (
                  <div className="report-reading-layout">
                    <div className="report-markdown-surface report-document">
                      <MarkdownRenderer
                        content={reportMarkdown}
                        onCitationClick={handleSelectSource}
                      />
                    </div>
                    <SourceDetailPanel
                      citationIds={citationIds}
                      rows={materialRows}
                      selectedSourceId={selectedSourceId}
                      selectedMaterial={selectedMaterial}
                      onSelectSource={handleSelectSource}
                    />
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

          <section className="section-card source-library-section no-print">
            <div className="toolbar-inline">
              <div>
                <h2>研究材料库</h2>
                <p className="detail-section-copy">
                  材料按引用编号收纳，点击卡片可在报告右侧查看原文摘录。
                </p>
              </div>
              <span className="field-hint">
                共 {materials.length} 条 · 正文引用 {citationIds.length} 个
              </span>
            </div>

            {materials.length === 0 ? (
              <p>当前还没有采集到材料。</p>
            ) : (
              <div className="source-library-grid">
                {materialRows.map(({ material, sourceId, isCited }) => (
                  <article
                    key={`${sourceId}-${material.id}`}
                    className={
                      sourceId === selectedSourceId
                        ? "source-compact-card source-compact-card-active"
                        : "source-compact-card"
                    }
                  >
                    <button
                      type="button"
                      className="source-compact-main"
                      onClick={() => handleSelectSource(sourceId)}
                    >
                      <div>
                        <div className="chip-row">
                          <span className="reference-chip">{sourceId}</span>
                          <span className="status-chip">
                            {formatAuthorityLevel(material.authority_level)}
                          </span>
                          {isCited ? (
                            <span className="soft-badge soft-badge-cool">
                              正文已引用
                            </span>
                          ) : null}
                        </div>
                        <h3>{material.title}</h3>
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
                        <div>
                          <dt>发布时间</dt>
                          <dd>{formatDateTime(material.published_at)}</dd>
                        </div>
                      </dl>
                    </button>

                    <div className="source-compact-actions">
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => handleSelectSource(sourceId)}
                      >
                        查看详情
                      </button>
                      {material.source_url ? (
                        <a
                          className="button-ghost"
                          href={material.source_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          原始来源
                        </a>
                      ) : null}
                    </div>
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
