import { Link, NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { API_BASE_URL, USER_STAGE_LABEL } from "../lib/config";

const navigationItems = [
  {
    to: "/workspace",
    label: "调研工作台",
    description: "承接调研入口、参数配置和模型选择。",
  },
  {
    to: "/tasks",
    label: "任务中心",
    description: "承接任务列表、筛选和状态概览。",
  },
  {
    to: "/profile",
    label: "个人中心",
    description: "承接登录态、个人资料和常用项入口。",
  },
];

export function UserShell() {
  const { session, clearSession } = useAuth();

  return (
    <div className="shell-layout">
      <aside className="shell-sidebar">
        <div className="shell-brand">
          <p className="eyebrow">商业对象智能深度调研分析平台</p>
          <h1>用户端骨架</h1>
          <p>{USER_STAGE_LABEL}</p>
        </div>

        <nav className="shell-nav" aria-label="用户端导航">
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
          <p className="eyebrow">真实登录态</p>
          <h2>{session?.user.displayName || session?.user.username || "未登录"}</h2>
          <p>{session ? "当前已承接后端认证会话。" : "当前还没有会话。"}</p>
          <dl className="kv-list">
            <div>
              <dt>角色</dt>
              <dd>{session?.user.roles.join(", ") || "user"}</dd>
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
            清空本地会话
          </button>
        </section>
      </aside>

      <main className="shell-main">
        <header className="shell-toolbar">
          <div>
            <p className="eyebrow">当前阶段</p>
            <h2>用户端主链路、页面骨架和基础体验收口已经完成</h2>
            <div className="shell-toolbar-actions">
              <Link className="button-ghost" to="/">
                返回首页
              </Link>
              <Link className="button-secondary" to="/workspace">
                调研工作台
              </Link>
              <Link className="button-secondary" to="/tasks">
                任务中心
              </Link>
              <Link className="button-ghost" to="/profile">
                个人中心
              </Link>
            </div>
          </div>
          <div className="status-chip-group">
            <span className="status-chip">真实登录</span>
            <span className="status-chip">任务创建</span>
            <span className="status-chip">状态跟踪</span>
          </div>
        </header>

        <section className="info-banner">
          <strong>第 7 步已完成：</strong>
          用户端已经完成真实认证、调研任务创建、任务列表、任务详情、状态轮询和统一体验收口。
          当前可以进入第 8 步，继续补 AI、真实数据源和展示增强能力。
        </section>

        <Outlet />
      </main>
    </div>
  );
}
