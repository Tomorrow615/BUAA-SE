import { useEffect, useState, type FormEvent } from "react";

import { StatePanel } from "../components/StatePanel";
import { useAdminAuth } from "../context/AdminAuthContext";
import {
  formatDateTime,
  formatUserStatus,
  listAdminUsers,
  toUserStatusClassName,
  USER_STATUS_OPTIONS,
  type AdminUserSummary,
  type UserStatus,
} from "../lib/admin";

export function UsersPage() {
  const { session } = useAdminAuth();
  const accessToken = session?.accessToken ?? null;

  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<UserStatus | "">("");

  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  async function loadUsers(nextKeyword = keyword, nextStatus = statusFilter) {
    if (!accessToken) {
      setErrorMessage("当前管理员会话不可用，请重新登录。");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const response = await listAdminUsers(accessToken, {
        keyword: nextKeyword,
        status: nextStatus,
        limit: 50,
        offset: 0,
      });
      setUsers(response.items);
      setTotal(response.total);
      setLastUpdatedAt(new Date().toISOString());
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "用户列表加载失败，请稍后重试。",
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
        const response = await listAdminUsers(resolvedAccessToken, {
          limit: 50,
          offset: 0,
        });
        if (cancelled) {
          return;
        }

        setUsers(response.items);
        setTotal(response.total);
        setLastUpdatedAt(new Date().toISOString());
      } catch (error) {
        if (cancelled) {
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : "用户列表加载失败，请稍后重试。",
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
    await loadUsers(keyword, statusFilter);
  }

  async function handleReset() {
    setKeyword("");
    setStatusFilter("");
    await loadUsers("", "");
  }

  return (
    <div className="page-section">
      <header className="page-title">
        <p className="eyebrow">用户管理</p>
        <h1>用户治理页已经接入真实用户列表和状态查询</h1>
        <p>
          当前页面调用 <code>/admin/users</code>，可按关键字和账号状态过滤，
          用于管理员查看用户规模、角色分布和任务活跃度。
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
                void loadUsers();
              }}
              disabled={isLoading}
            >
              刷新用户
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
                placeholder="用户名、邮箱或展示名"
              />
            </label>

            <label className="field">
              <span>账号状态</span>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as UserStatus | "")
                }
              >
                <option value="">全部</option>
                {USER_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {errorMessage ? (
            <p className="form-message form-message-error">{errorMessage}</p>
          ) : null}

          <div className="toolbar-inline">
            <p className="field-hint">
              当前共返回 <strong>{total}</strong> 条用户记录。
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
                  void loadUsers();
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

      {isLoading && users.length === 0 ? (
        <StatePanel
          eyebrow="用户状态"
          title="正在加载用户列表"
          description="当前正在同步用户记录与筛选结果，请稍候。"
        />
      ) : null}

      {users.length === 0 && !isLoading ? (
        <StatePanel
          eyebrow="用户状态"
          title="当前没有匹配的用户"
          description="你可以调整关键字或账号状态后重新查询。"
          tone={errorMessage ? "danger" : "warning"}
          actions={
            <button
              type="button"
              className="button-primary"
              onClick={() => {
                void loadUsers();
              }}
            >
              再刷新一次
            </button>
          }
        />
      ) : null}

      <section className="data-grid">
        {users.map((user) => (
          <article key={user.id} className="data-card">
            <div className="data-card-header">
              <div>
                <p className="eyebrow">用户 #{user.id}</p>
                <h2>{user.display_name || user.username}</h2>
              </div>
              <span className={toUserStatusClassName(user.status)}>
                {formatUserStatus(user.status)}
              </span>
            </div>

            <dl className="meta-grid meta-grid-compact">
              <div>
                <dt>用户名</dt>
                <dd>{user.username}</dd>
              </div>
              <div>
                <dt>邮箱</dt>
                <dd>{user.email}</dd>
              </div>
              <div>
                <dt>角色</dt>
                <dd>{user.roles.join(", ") || "user"}</dd>
              </div>
              <div>
                <dt>任务数</dt>
                <dd>{user.research_task_count}</dd>
              </div>
              <div>
                <dt>最近登录</dt>
                <dd>{formatDateTime(user.last_login_at)}</dd>
              </div>
              <div>
                <dt>创建时间</dt>
                <dd>{formatDateTime(user.created_at)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </section>
    </div>
  );
}
