import { Link, NavLink, Outlet } from "react-router-dom";

import { useAdminAuth } from "../context/AdminAuthContext";

const navigationItems = [
  { to: "/overview", label: "概览" },
  { to: "/models", label: "模型" },
  { to: "/users", label: "用户" },
  { to: "/tasks", label: "任务" },
  { to: "/logs", label: "日志" },
];

export function AdminShell() {
  const { session, clearSession } = useAdminAuth();

  return (
    <div className="shell-layout shell-layout-minimal">
      <aside className="shell-sidebar shell-sidebar-minimal">
        <div className="shell-brand shell-brand-minimal">
          <p className="eyebrow">Admin</p>
          <h1>Console</h1>
        </div>

        <nav className="shell-nav shell-nav-minimal" aria-label="管理端导航">
          {navigationItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                isActive ? "nav-link nav-link-active nav-link-minimal" : "nav-link nav-link-minimal"
              }
            >
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <section className="shell-session-card shell-session-card-minimal">
          <h2>{session?.user.displayName || session?.user.username || "Admin"}</h2>
          <div className="button-row button-row-tight">
            <button
              type="button"
              className="button-secondary"
              onClick={clearSession}
            >
              退出
            </button>
          </div>
        </section>
      </aside>

      <main className="shell-main shell-main-minimal">
        <header className="shell-toolbar shell-toolbar-minimal">
          <div className="shell-toolbar-copy shell-toolbar-copy-minimal">
            <p className="eyebrow">Admin Console</p>
          </div>

          <div className="shell-toolbar-actions shell-toolbar-actions-minimal">
            <Link className="button-ghost" to="/">
              首页
            </Link>
            <Link className="button-secondary" to="/overview">
              刷新视图
            </Link>
            <button type="button" className="button-ghost" disabled>
              导出
            </button>
          </div>
        </header>

        <Outlet />
      </main>
    </div>
  );
}
