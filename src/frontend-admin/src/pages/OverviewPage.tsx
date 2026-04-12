import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { StatePanel } from "../components/StatePanel";
import { useAdminAuth } from "../context/AdminAuthContext";
import {
  fetchAdminOverview,
  formatDateTime,
  formatObjectType,
  formatTaskStatus,
  toTaskStatusClassName,
  type AdminOverviewResponse,
} from "../lib/admin";

export function OverviewPage() {
  const { session } = useAdminAuth();
  const accessToken = session?.accessToken ?? null;

  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  async function loadOverview() {
    if (!accessToken) {
      setErrorMessage("当前管理员会话不可用，请重新登录。");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const response = await fetchAdminOverview(accessToken);
      setOverview(response);
      setLastUpdatedAt(new Date().toISOString());
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "概览数据加载失败，请稍后重试。",
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
        const response = await fetchAdminOverview(resolvedAccessToken);
        if (cancelled) {
          return;
        }

        setOverview(response);
        setLastUpdatedAt(new Date().toISOString());
      } catch (error) {
        if (cancelled) {
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : "概览数据加载失败，请稍后重试。",
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

  const metrics = overview?.metrics;

  return (
    <div className="page-section">
      <header className="page-title">
        {/* <p className="eyebrow">概览面板</p> */}
        {/* <h1>后台概览已经接入真实汇总指标和最近活动</h1> */}
        <h1>查看各项汇总指标和最近活动</h1>
        {/* <p>
          当前页面直接调用 <code>/admin/overview</code>，展示平台指标、最近任务和最近审计日志，
          用于管理员快速判断当前平台运行情况。
        </p> */}
        <div className="page-meta-line">
          <p className="field-hint">
            最近刷新：{formatDateTime(lastUpdatedAt)}
          </p>
          <div className="button-row button-row-tight">
            <Link className="button-secondary" to="/tasks">
              查看任务治理
            </Link>
            <Link className="button-ghost" to="/users">
              查看用户管理
            </Link>
          </div>
        </div>
      </header>

      {errorMessage ? (
        <p className="form-message form-message-error">{errorMessage}</p>
      ) : null}

      <div className="toolbar-inline">
        <p className="field-hint">概览页适合先看平台健康度，再进入具体治理模块。</p>
        <div className="button-row button-row-tight">
          <button
            type="button"
            className="button-primary"
            onClick={() => {
              void loadOverview();
            }}
            disabled={isLoading}
          >
            {isLoading ? "正在刷新..." : "刷新概览"}
          </button>
          <Link className="button-secondary" to="/tasks">
            查看任务治理
          </Link>
          <Link className="button-ghost" to="/logs">
            查看审计日志
          </Link>
        </div>
      </div>

      {metrics ? (
        <section className="metric-grid">
          <article className="metric-card">
            <strong>总用户数</strong>
            <span>{metrics.total_users}</span>
            <small>其中启用用户 {metrics.active_users}</small>
          </article>
          <article className="metric-card">
            <strong>管理员数</strong>
            <span>{metrics.admin_users}</span>
            <small>当前可访问后台的管理员账号数</small>
          </article>
          <article className="metric-card">
            <strong>总任务数</strong>
            <span>{metrics.total_tasks}</span>
            <small>累计已创建的调研任务</small>
          </article>
          <article className="metric-card">
            <strong>排队任务</strong>
            <span>{metrics.queued_tasks}</span>
            <small>等待 Worker 领取</small>
          </article>
          <article className="metric-card">
            <strong>运行中任务</strong>
            <span>{metrics.running_tasks}</span>
            <small>采集、处理、分析或报告阶段</small>
          </article>
          <article className="metric-card">
            <strong>已完成任务</strong>
            <span>{metrics.completed_tasks}</span>
            <small>已完成最小闭环的任务数</small>
          </article>
          <article className="metric-card">
            <strong>失败任务</strong>
            <span>{metrics.failed_tasks}</span>
            <small>需要重点关注的异常任务</small>
          </article>
          <article className="metric-card">
            <strong>启用模型</strong>
            <span>{metrics.enabled_models}</span>
            <small>当前可被前台选择的模型数量</small>
          </article>
          <article className="metric-card">
            <strong>启用信息源</strong>
            <span>{metrics.enabled_sources}</span>
            <small>当前可参与任务的数据源数量</small>
          </article>
          <article className="metric-card">
            <strong>审计日志数</strong>
            <span>{metrics.total_audit_logs}</span>
            <small>用于追踪关键后台动作</small>
          </article>
        </section>
      ) : null}

      {!metrics && isLoading ? (
        <StatePanel
          eyebrow="概览状态"
          title="正在加载概览数据"
          description="当前正在请求后台指标与最近活动，请稍候。"
        />
      ) : null}

      {!metrics && !isLoading ? (
        <StatePanel
          eyebrow="概览状态"
          title="当前还没有概览数据"
          description="你可以稍后再刷新，或者先去任务治理、用户管理和日志页确认后台是否已有数据。"
          tone={errorMessage ? "danger" : "warning"}
          actions={
            <>
              <button
                type="button"
                className="button-primary"
                onClick={() => {
                  void loadOverview();
                }}
              >
                再刷新一次
              </button>
              <Link className="button-ghost" to="/tasks">
                打开任务治理
              </Link>
            </>
          }
        />
      ) : null}

      <section className="section-grid section-grid-wide">
        <article className="section-card">
          <div className="section-head">
            <div>
              <h2>最近任务</h2>
              <p>最近创建的任务，可快速判断队列与执行状态。</p>
            </div>
            <Link className="button-ghost" to="/tasks">
              打开任务治理
            </Link>
          </div>

          {overview?.recent_tasks.length ? (
            <div className="list-block">
              {overview.recent_tasks.map((task) => (
                <div key={task.id} className="list-item">
                  <div className="list-item-head">
                    <div>
                      <strong>{task.task_title}</strong>
                      <small>
                        {task.task_no} · {formatObjectType(task.object_type)} ·{" "}
                        {task.object_name}
                      </small>
                    </div>
                    <span className={toTaskStatusClassName(task.status)}>
                      {formatTaskStatus(task.status)}
                    </span>
                  </div>
                  <div className="meta-grid meta-grid-compact">
                    <div>
                      <dt>当前阶段</dt>
                      <dd>{formatTaskStatus(task.current_stage)}</dd>
                    </div>
                    <div>
                      <dt>进度</dt>
                      <dd>{task.progress_percent}%</dd>
                    </div>
                    <div>
                      <dt>模型</dt>
                      <dd>{task.selected_model_name || "默认模型"}</dd>
                    </div>
                    <div>
                      <dt>创建时间</dt>
                      <dd>{formatDateTime(task.created_at)}</dd>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h2>最近没有任务数据</h2>
              <p>当前平台还没有可展示的最近任务。</p>
            </div>
          )}
        </article>

        <article className="section-card">
          <div className="section-head">
            <div>
              <h2>最近审计日志</h2>
              <p>用于查看最近关键操作和任务创建记录。</p>
            </div>
            <Link className="button-ghost" to="/logs">
              打开日志页
            </Link>
          </div>

          {overview?.recent_audit_logs.length ? (
            <div className="list-block">
              {overview.recent_audit_logs.map((log) => (
                <div key={log.id} className="list-item">
                  <div className="list-item-head">
                    <div>
                      <strong>{log.action_type}</strong>
                      <small>
                        {log.target_type}
                        {log.target_id ? ` · ${log.target_id}` : ""}
                      </small>
                    </div>
                    <span className="tag-chip">
                      {log.user?.display_name || log.user?.username || "系统"}
                    </span>
                  </div>
                  <p>{log.action_detail || "当前日志没有额外描述。"}</p>
                  <small>
                    {formatDateTime(log.created_at)}
                    {log.ip_address ? ` · ${log.ip_address}` : ""}
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h2>最近没有审计日志</h2>
              <p>当前平台还没有可展示的后台操作记录。</p>
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
