import { Link, NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

const navigationItems = [
  {
    to: "/workspace",
    label: "研究工作台",
    description: "统一发起股票、公司、商品研究任务。",
  },
  {
    to: "/tasks",
    label: "任务中心",
    description: "查看任务进度、报告资产与交付结果。",
  },
  {
    to: "/chat",
    label: "AI 助理",
    description: "自由对话、数据问答与后续追问入口。",
  },
  {
    to: "/profile",
    label: "个人空间",
    description: "偏好设置、账户信息与未来收藏资产。",
  },
];

const capabilityItems = [
  { label: "股票链路", state: "已接通" },
  { label: "公司研究", state: "筹备中" },
  { label: "商品研究", state: "筹备中" },
];

export function UserShell() {
  const { session, clearSession } = useAuth();
  const roleText = session?.user.roles.join(" / ") || "访客";

  return (
    <div className="shell-layout">
      <aside className="shell-sidebar">
        <div className="shell-brand">
          <p className="eyebrow">商业对象研究平台</p>
          <h1>智能深度研究台</h1>
          <p className="shell-brand-note">
            围绕股票、公司、商品建立统一的研究入口、报告资产与 AI 协作体验。
          </p>

          <div className="shell-capability-grid">
            {capabilityItems.map((item) => (
              <div key={item.label} className="shell-capability-card">
                <strong>{item.label}</strong>
                <span>{item.state}</span>
              </div>
            ))}
          </div>
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
          <p className="eyebrow">当前会话</p>
          <h2>{session?.user.displayName || session?.user.username || "未登录"}</h2>
          <p>
            {session
              ? `已登录，当前角色为 ${roleText}。`
              : "当前还没有会话，请先登录后进入研究台。"}
          </p>

          <div className="shell-session-meta">
            <span>研究入口统一</span>
            <span>结果资产沉淀</span>
            <span>AI 协作扩展</span>
          </div>

          <button
            type="button"
            className="button-secondary"
            onClick={clearSession}
          >
            退出当前会话
          </button>
        </section>
      </aside>

      <main className="shell-main">
        <header className="shell-toolbar">
          <div className="shell-toolbar-copy">
            <p className="eyebrow">用户工作区</p>
            <h2>面向最终产品形态的研究体验</h2>
            <p>
              当前股票链路可运行，其他对象与导出、收藏、提醒等能力按最终界面预留。
            </p>
          </div>

          <div className="shell-toolbar-actions">
            <Link className="button-ghost" to="/">
              返回首页
            </Link>
            <Link className="button-secondary" to="/workspace">
              进入工作台
            </Link>
            <Link className="button-secondary" to="/tasks">
              查看任务
            </Link>
            <Link className="button-ghost" to="/chat">
              打开 AI 助理
            </Link>
          </div>
        </header>

        <Outlet />
      </main>
    </div>
  );
}
