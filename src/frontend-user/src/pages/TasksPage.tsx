import { useEffect, useState, type FormEvent } from "react";
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

function truncateText(value: string | null, maxLength = 110): string {
  if (!value) {
    return "暂无结果摘要";
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
        error instanceof Error
          ? error.message
          : "任务列表加载失败，请稍后重试。",
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
          error instanceof Error
            ? error.message
            : "任务列表加载失败，请稍后重试。",
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

  return (
    <div className="page-section">
      <header className="page-title">
        <p className="eyebrow">任务中心</p>
        <h1>用户端已经可以查看自己创建的真实调研任务列表</h1>
        <p>
          当前页面已经接入 <code>GET /research/tasks</code>，支持基础筛选、手动刷新
          和跳转详情页查看阶段日志与处理状态。
        </p>
        <div className="page-meta-line">
          <p className="field-hint">
            最近刷新：{formatDateTime(lastUpdatedAt)}
          </p>
          <div className="button-row button-row-tight">
            <Link className="button-secondary" to="/workspace">
              发起新调研
            </Link>
            <Link className="button-ghost" to="/profile">
              打开个人中心
            </Link>
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
                placeholder="对象名称或任务标题"
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
              <Link className="button-secondary" to="/workspace">
                发起新调研
              </Link>
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
          description="你可以先去调研工作台创建一条任务，或者调整筛选条件后再刷新。"
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
          <article key={task.id} className="task-card">
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

            <div className="button-row button-row-tight">
              <Link className="button-primary" to={`/tasks/${task.id}`}>
                查看详情
              </Link>
              <Link className="button-ghost" to="/workspace">
                再发起一条
              </Link>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
