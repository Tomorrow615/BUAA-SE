import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { StatePanel } from "../components/StatePanel";
import { useAuth } from "../context/AuthContext";
import {
  fetchResearchModels,
  formatDateTime,
  formatObjectType,
  formatTaskStatus,
  listResearchTasks,
  OBJECT_TYPE_OPTIONS,
  TASK_STATUS_OPTIONS,
  toStatusClassName,
  type ObjectType,
  type ResearchModelOption,
  type ResearchTaskListFilters,
  type ResearchTaskSummary,
  type TaskStatus,
} from "../lib/research";

function truncateText(value: string | null, maxLength = 120): string {
  if (!value) {
    return "该任务已创建，等待更多结果摘要沉淀。";
  }

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

export function TasksPage() {
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? null;

  const [objectType, setObjectType] = useState<ObjectType | "">("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "">("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [keyword, setKeyword] = useState("");

  const [models, setModels] = useState<ResearchModelOption[]>([]);
  const [tasks, setTasks] = useState<ResearchTaskSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  async function loadTasks(filters: ResearchTaskListFilters = {}) {
    if (!accessToken) {
      setErrorMessage("当前会话不可用，请重新登录。");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const response = await listResearchTasks(accessToken, {
        limit: 20,
        offset: 0,
        ...filters,
      });
      setTasks(response.items);
      setTotal(response.total);
      setLastUpdatedAt(new Date().toISOString());
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "任务列表加载失败，请稍后重试。",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const token = accessToken;
    if (!token) {
      return;
    }
    const resolvedAccessToken: string = token;

    let cancelled = false;

    async function bootstrap() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const [modelItems, taskResponse] = await Promise.all([
          fetchResearchModels(resolvedAccessToken),
          listResearchTasks(resolvedAccessToken, {
            limit: 20,
            offset: 0,
          }),
        ]);

        if (cancelled) {
          return;
        }

        setModels(modelItems);
        setTasks(taskResponse.items);
        setTotal(taskResponse.total);
        setLastUpdatedAt(new Date().toISOString());
      } catch (error) {
        if (cancelled) {
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : "任务列表加载失败，请稍后重试。",
        );
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await loadTasks({
      objectType,
      status: statusFilter,
      selectedModelId: selectedModelId ? Number(selectedModelId) : "",
      keyword,
    });
  }

  async function handleReset() {
    setObjectType("");
    setStatusFilter("");
    setSelectedModelId("");
    setKeyword("");

    await loadTasks();
  }

  const dashboardMetrics = useMemo(() => {
    const completed = tasks.filter((task) => task.status === "COMPLETED").length;
    const running = tasks.filter((task) =>
      ["QUEUED", "COLLECTING", "PROCESSING", "ANALYZING", "REPORTING"].includes(
        task.status,
      ),
    ).length;
    const failed = tasks.filter((task) => task.status === "FAILED").length;
    const stockTasks = tasks.filter((task) => task.object_type === "STOCK").length;

    return [
      { label: "当前列表任务数", value: String(total) },
      { label: "进行中", value: String(running) },
      { label: "已完成", value: String(completed) },
      { label: "股票任务", value: String(stockTasks) },
      { label: "失败任务", value: String(failed) },
    ];
  }, [tasks, total]);

  return (
    <div className="page-section">
      <header className="page-title tasks-page-header">
        <div>
          <p className="eyebrow">Tasks</p>
          <h1>任务中心</h1>
        </div>

        <div className="button-row button-row-tight">
          <Link className="button-primary" to="/workspace">
            新建研究
          </Link>
          <button type="button" className="button-secondary" disabled>
            导出
          </button>
          <button type="button" className="button-ghost" disabled>
            分享
          </button>
        </div>
      </header>

      <section className="overview-metric-grid">
        {dashboardMetrics.map((item) => (
          <article key={item.label} className="overview-metric-card">
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </article>
        ))}
      </section>

      <section className="section-card filter-card">
        <div className="workspace-card-head">
          <div>
            <h2>筛选</h2>
          </div>
          <p className="field-hint">最近刷新：{formatDateTime(lastUpdatedAt)}</p>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          <div className="field-row field-row-four">
            <label className="field">
              <span>对象类型</span>
              <select
                value={objectType}
                onChange={(event) =>
                  setObjectType(event.target.value as ObjectType | "")
                }
              >
                <option value="">全部对象</option>
                {OBJECT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>任务状态</span>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as TaskStatus | "")
                }
              >
                <option value="">全部状态</option>
                {TASK_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>研究模型</span>
              <select
                value={selectedModelId}
                onChange={(event) => setSelectedModelId(event.target.value)}
              >
                <option value="">全部模型</option>
                {models.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.display_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>关键词</span>
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="研究对象或任务标题"
              />
            </label>
          </div>

          {errorMessage ? (
            <p className="form-message form-message-error">{errorMessage}</p>
          ) : null}

          <div className="toolbar-inline">
            <p className="field-hint">
              当前共返回 <strong>{total}</strong> 条任务记录。
            </p>

            <div className="button-row button-row-tight">
              <button
                type="submit"
                className="button-primary"
                disabled={isLoading}
              >
                {isLoading ? "正在加载..." : "应用筛选"}
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  void loadTasks({
                    objectType,
                    status: statusFilter,
                    selectedModelId: selectedModelId
                      ? Number(selectedModelId)
                      : "",
                    keyword,
                  });
                }}
                disabled={isLoading}
              >
                刷新列表
              </button>
              <button
                type="button"
                className="button-ghost"
                onClick={() => {
                  void handleReset();
                }}
                disabled={isLoading}
              >
                清空筛选
              </button>
            </div>
          </div>
        </form>
      </section>

      {isLoading && tasks.length === 0 ? (
        <StatePanel
          eyebrow="任务状态"
          title="正在加载任务列表"
          description="当前正在同步你的任务记录与筛选结果，请稍候。"
        />
      ) : null}

      {!isLoading && tasks.length === 0 ? (
        <StatePanel
          eyebrow="任务状态"
          title="当前还没有匹配的任务"
          description="你可以先去工作台发起一条研究任务，或者调整筛选条件后重新查看。"
          tone={errorMessage ? "danger" : "warning"}
          actions={
            <>
              <Link className="button-primary" to="/workspace">
                去创建任务
              </Link>
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  void loadTasks();
                }}
              >
                再刷新一次
              </button>
            </>
          }
        />
      ) : null}

      <section className="task-list">
        {tasks.map((task) => (
          <article key={task.id} className="task-card task-card-rich">
            <div className="task-card-header">
              <div>
                <p className="eyebrow">任务编号 {task.task_no}</p>
                <h2>{task.task_title}</h2>
              </div>
              <span className={toStatusClassName(task.status)}>
                {formatTaskStatus(task.status)}
              </span>
            </div>

            <p className="task-summary">
              {truncateText(task.result_summary || task.research_goal)}
            </p>

            <dl className="meta-grid">
              <div>
                <dt>研究对象</dt>
                <dd>{formatObjectType(task.object_type)}</dd>
              </div>
              <div>
                <dt>对象名称</dt>
                <dd>{task.object_name}</dd>
              </div>
              <div>
                <dt>当前阶段</dt>
                <dd>{formatTaskStatus(task.current_stage)}</dd>
              </div>
              <div>
                <dt>研究模型</dt>
                <dd>{task.selected_model?.display_name || "默认模型"}</dd>
              </div>
              <div>
                <dt>进度</dt>
                <dd>{task.progress_percent}%</dd>
              </div>
              <div>
                <dt>创建时间</dt>
                <dd>{formatDateTime(task.created_at)}</dd>
              </div>
            </dl>

            <div className="progress-bar">
              <span
                style={{ width: `${Math.min(Math.max(task.progress_percent, 4), 100)}%` }}
              />
            </div>

            <div className="task-card-footer">
              <div className="task-card-actions">
                <Link className="button-primary" to={`/tasks/${task.id}`}>
                  打开
                </Link>
                <button type="button" className="button-secondary" disabled>
                  PDF
                </button>
                <button type="button" className="button-ghost" disabled>
                  分享
                </button>
              </div>

              <div className="task-card-assets">
                <span>{task.selected_model?.display_name || "Default"}</span>
                <strong>{formatTaskStatus(task.status)}</strong>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
