import { useEffect, useState, type FormEvent } from "react";

import { StatePanel } from "../components/StatePanel";
import { useAdminAuth } from "../context/AdminAuthContext";
import {
  formatDateTime,
  listAdminAuditLogs,
  type AdminAuditLog,
} from "../lib/admin";

export function AuditLogsPage() {
  const { session } = useAdminAuth();
  const accessToken = session?.accessToken ?? null;

  const [keyword, setKeyword] = useState("");
  const [actionType, setActionType] = useState("");

  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  async function loadLogs(nextKeyword = keyword, nextActionType = actionType) {
    if (!accessToken) {
      setErrorMessage("当前管理员会话不可用，请重新登录。");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const response = await listAdminAuditLogs(accessToken, {
        keyword: nextKeyword,
        actionType: nextActionType,
        limit: 50,
        offset: 0,
      });
      setLogs(response.items);
      setTotal(response.total);
      setLastUpdatedAt(new Date().toISOString());
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "审计日志加载失败，请稍后重试。",
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
        const response = await listAdminAuditLogs(resolvedAccessToken, {
          limit: 50,
          offset: 0,
        });
        if (cancelled) {
          return;
        }

        setLogs(response.items);
        setTotal(response.total);
        setLastUpdatedAt(new Date().toISOString());
      } catch (error) {
        if (cancelled) {
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : "审计日志加载失败，请稍后重试。",
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
    await loadLogs(keyword, actionType);
  }

  async function handleReset() {
    setKeyword("");
    setActionType("");
    await loadLogs("", "");
  }

  return (
    <div className="page-section">
      <header className="page-title">
        <p className="eyebrow">审计日志</p>
        <h1>日志检索页已经接入真实审计日志查询</h1>
        <p>
          当前页面调用 <code>/admin/audit-logs</code>，支持关键字与动作类型过滤，
          用于后台追踪任务创建和后续治理动作。
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
                void loadLogs();
              }}
              disabled={isLoading}
            >
              刷新日志
            </button>
          </div>
        </div>
      </header>

      <section className="section-card">
        <form className="form-grid" onSubmit={handleSubmit}>
          <div className="field-row">
            <label className="field">
              <span>关键字</span>
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="目标编号、目标类型或动作详情"
              />
            </label>

            <label className="field">
              <span>动作类型</span>
              <input
                value={actionType}
                onChange={(event) => setActionType(event.target.value)}
                placeholder="如：CREATE_RESEARCH_TASK"
              />
            </label>
          </div>

          <p className="field-hint">
            `动作类型` 为空时表示查询全部；如果填写，则按精确动作类型过滤。
          </p>

          {errorMessage ? (
            <p className="form-message form-message-error">{errorMessage}</p>
          ) : null}

          <div className="toolbar-inline">
            <p className="field-hint">
              当前共返回 <strong>{total}</strong> 条审计日志。
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
                  void loadLogs();
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

      {isLoading && logs.length === 0 ? (
        <StatePanel
          eyebrow="日志状态"
          title="正在加载审计日志"
          description="当前正在同步后台审计日志与筛选结果，请稍候。"
        />
      ) : null}

      {logs.length === 0 && !isLoading ? (
        <StatePanel
          eyebrow="日志状态"
          title="当前没有匹配的日志"
          description="你可以调整关键字或动作类型后重新查询。"
          tone={errorMessage ? "danger" : "warning"}
          actions={
            <button
              type="button"
              className="button-primary"
              onClick={() => {
                void loadLogs();
              }}
            >
              再刷新一次
            </button>
          }
        />
      ) : null}

      <section className="list-block list-block-spaced">
        {logs.map((log) => (
          <article key={log.id} className="data-card">
            <div className="data-card-header">
              <div>
                <p className="eyebrow">日志 #{log.id}</p>
                <h2>{log.action_type}</h2>
              </div>
              <span className="tag-chip">{log.target_type}</span>
            </div>

            <dl className="meta-grid meta-grid-compact">
              <div>
                <dt>目标编号</dt>
                <dd>{log.target_id || "暂无"}</dd>
              </div>
              <div>
                <dt>操作者</dt>
                <dd>{log.user?.display_name || log.user?.username || "系统"}</dd>
              </div>
              <div>
                <dt>IP</dt>
                <dd>{log.ip_address || "暂无"}</dd>
              </div>
              <div>
                <dt>创建时间</dt>
                <dd>{formatDateTime(log.created_at)}</dd>
              </div>
            </dl>

            <p className="card-summary">
              {log.action_detail || "当前日志没有额外描述。"}
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}
