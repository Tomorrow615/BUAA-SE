import { useEffect, useState, type FormEvent } from "react";

import { StatePanel } from "../components/StatePanel";
import { useAdminAuth } from "../context/AdminAuthContext";
import {
  formatDateTime,
  formatObjectType,
  formatTaskStatus,
  listAdminModels,
  listAdminTasks,
  OBJECT_TYPE_OPTIONS,
  TASK_STATUS_OPTIONS,
  toTaskStatusClassName,
  type AdminModelConfig,
  type ObjectType,
  type ResearchTaskSummary,
  type TaskStatus,
} from "../lib/admin";

function truncateText(value: string | null, maxLength = 108): string {
  if (!value) {
    return "暂无额外摘要";
  }

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

export function TasksPage() {
  const { session } = useAdminAuth();
  const accessToken = session?.accessToken ?? null;

  const [objectType, setObjectType] = useState<ObjectType | "">("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "">("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [keyword, setKeyword] = useState("");

  const [models, setModels] = useState<AdminModelConfig[]>([]);
  const [tasks, setTasks] = useState<ResearchTaskSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  async function loadTasks(
    nextObjectType = objectType,
    nextStatus = statusFilter,
    nextSelectedModelId = selectedModelId,
    nextKeyword = keyword,
  ) {
    if (!accessToken) {
      setErrorMessage("当前管理员会话不可用，请重新登录。");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const response = await listAdminTasks(accessToken, {
        objectType: nextObjectType,
        status: nextStatus,
        selectedModelId: nextSelectedModelId ? Number(nextSelectedModelId) : "",
        keyword: nextKeyword,
        limit: 50,
        offset: 0,
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
        const [modelResponse, taskResponse] = await Promise.all([
          listAdminModels(resolvedAccessToken, {
            limit: 100,
            offset: 0,
          }),
          listAdminTasks(resolvedAccessToken, {
            limit: 50,
            offset: 0,
          }),
        ]);

        if (cancelled) {
          return;
        }

        setModels(modelResponse.items);
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
    await loadTasks(objectType, statusFilter, selectedModelId, keyword);
  }

  async function handleReset() {
    setObjectType("");
    setStatusFilter("");
    setSelectedModelId("");
    setKeyword("");
    await loadTasks("", "", "", "");
  }

  return (
    <div className="page-section">
      <header className="page-title">
        <p className="eyebrow">任务治理</p>
        <h1>后台任务治理页已经接入管理员可见的全局任务列表</h1>
        <p>
          当前页面通过管理员身份调用 <code>/research/tasks</code>，可查看全局任务的状态、阶段、
          模型和进度，用于后台排障和队列观察。
        </p>
        <div className="page-meta-line">
          <p className="field-hint">
            最近刷新：{formatDateTime(lastUpdatedAt)}
          </p>
          <div className="button-row button-row-tight">
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                void loadTasks();
              }}
              disabled={isLoading}
            >
              刷新任务
            </button>
          </div>
        </div>
      </header>

      <section className="section-card">
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
                <option value="">全部</option>
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
                <option value="">全部</option>
                {TASK_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>模型</span>
              <select
                value={selectedModelId}
                onChange={(event) => setSelectedModelId(event.target.value)}
              >
                <option value="">全部模型</option>
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.display_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>关键字</span>
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="对象名称或任务标题"
              />
            </label>
          </div>

          {errorMessage ? (
            <p className="form-message form-message-error">{errorMessage}</p>
          ) : null}

          <div className="toolbar-inline">
            <p className="field-hint">
              当前共返回 <strong>{total}</strong> 条全局任务记录。
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
                  void loadTasks();
                }}
                disabled={isLoading}
              >
                刷新
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
          title="正在加载全局任务"
          description="当前正在同步管理员可见的任务记录与筛选结果，请稍候。"
        />
      ) : null}

      {tasks.length === 0 && !isLoading ? (
        <StatePanel
          eyebrow="任务状态"
          title="当前没有匹配的任务"
          description="你可以调整筛选条件后重新查询全局任务。"
          tone={errorMessage ? "danger" : "warning"}
          actions={
            <button
              type="button"
              className="button-primary"
              onClick={() => {
                void loadTasks();
              }}
            >
              再刷新一次
            </button>
          }
        />
      ) : null}

      <section className="data-grid">
        {tasks.map((task) => (
          <article key={task.id} className="data-card">
            <div className="data-card-header">
              <div>
                <p className="eyebrow">任务编号 {task.task_no}</p>
                <h2>{task.task_title}</h2>
              </div>
              <span className={toTaskStatusClassName(task.status)}>
                {formatTaskStatus(task.status)}
              </span>
            </div>

            <p className="card-summary">
              {truncateText(task.result_summary || task.research_goal)}
            </p>

            <dl className="meta-grid meta-grid-compact">
              <div>
                <dt>对象类型</dt>
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
                <dt>模型</dt>
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

            {task.error_message ? (
              <p className="form-message form-message-error">{task.error_message}</p>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  );
}
