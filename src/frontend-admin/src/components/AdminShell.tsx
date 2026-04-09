import { Link, NavLink, Outlet } from "react-router-dom";

import { useAdminAuth } from "../context/AdminAuthContext";
import { ADMIN_STAGE_LABEL, API_BASE_URL } from "../lib/config";

const navigationItems = [
  {
    to: "/overview",
    label: "概览面板",
    description: "承接统计概览、最近任务和最近日志。",
  },
  {
    to: "/models",
    label: "模型配置",
    description: "承接模型配置和启停入口。",
  },
  {
    to: "/users",
    label: "用户管理",
    description: "承接用户、角色和账号状态列表。",
  },
  {
    to: "/tasks",
    label: "任务治理",
    description: "承接全局任务查看与干预入口。",
  },
  {
    to: "/logs",
    label: "审计日志",
    description: "承接后台日志检索与追踪。",
  },
];

export function AdminShell() {
  const { session, clearSession } = useAdminAuth();

  return (
    <div className="shell-layout">
      <aside className="shell-sidebar">
        <div className="shell-brand">
          <p className="eyebrow">商业对象智能深度调研分析平台</p>
          <h1>管理端骨架</h1>
          <p>{ADMIN_STAGE_LABEL}</p>
        </div>

        <nav className="shell-nav" aria-label="管理端导航">
          {navigationItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                isActive ? "nav-link nav-link-active" : "nav-link"
              }
            >
              <span>{item.label}</span>
              <small>{item.description}</small>
            </NavLink>
          ))}
        </nav>

        <section className="shell-session-card">
          <p className="eyebrow">真实管理员会话</p>
          <h2>{session?.user.displayName || session?.user.username || "未登录"}</h2>
          <p>{session ? "当前已承接后端管理员会话。" : "当前还没有会话。"}</p>
          <dl className="kv-list">
            <div>
              <dt>角色</dt>
              <dd>{session?.user.roles.join(", ") || "admin"}</dd>
            </div>
            <div>
              <dt>来源</dt>
              <dd>{session?.source || "无"}</dd>
            </div>
            <div>
              <dt>API</dt>
              <dd>{API_BASE_URL}</dd>
            </div>
          </dl>
          <button
            type="button"
            className="button-secondary"
            onClick={clearSession}
          >
            退出管理员会话
          </button>
        </section>
      </aside>

      <main className="shell-main">
        <header className="shell-toolbar">
          <div>
            <p className="eyebrow">当前阶段</p>
            <h2>管理端真实认证、后台查询和基础体验收口已经完成</h2>
            <div className="shell-toolbar-actions">
              <Link className="button-ghost" to="/">
                返回首页
              </Link>
              <Link className="button-secondary" to="/overview">
                概览面板
              </Link>
              <Link className="button-secondary" to="/tasks">
                任务治理
              </Link>
              <Link className="button-ghost" to="/logs">
                审计日志
              </Link>
            </div>
          </div>
          <div className="status-chip-group">
            <span className="status-chip">管理员登录</span>
            <span className="status-chip">权限校验</span>
            <span className="status-chip">后台查询</span>
          </div>
        </header>

        <section className="info-banner">
          <strong>第 7 步已完成：</strong>
          管理端已经完成管理员认证、概览、模型、用户、任务和日志查询骨架，并完成统一体验收口。
          当前可以进入第 8 步，继续补更深的治理动作与展示增强能力。
        </section>

        <Outlet />
      </main>
    </div>
  );
}
