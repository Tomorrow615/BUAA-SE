import { Link, NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

const navigationItems = [
  { to: "/workspace", label: "工作台" },
  { to: "/tasks", label: "任务" },
  { to: "/chat", label: "助理" },
  { to: "/profile", label: "我的" },
];

export function UserShell() {
  const { session, clearSession } = useAuth();

  return (
    <div className="shell-layout shell-layout-minimal">
      <aside className="shell-sidebar shell-sidebar-minimal">
        <div className="shell-brand shell-brand-minimal">
          <p className="eyebrow">DeepSearch</p>
          <h1>Research</h1>
        </div>

        <nav className="shell-nav shell-nav-minimal" aria-label="用户端导航">
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
          <h2>{session?.user.displayName || session?.user.username || "Guest"}</h2>
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
            <p className="eyebrow">Workspace</p>
          </div>

          <div className="shell-toolbar-actions shell-toolbar-actions-minimal">
            <Link className="button-ghost" to="/">
              首页
            </Link>
            <Link className="button-secondary" to="/workspace">
              新建研究
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
