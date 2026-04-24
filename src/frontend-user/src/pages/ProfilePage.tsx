import { Link } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { formatDateTime } from "../lib/research";

export function ProfilePage() {
  const { session } = useAuth();

  return (
    <div className="page-section">
      <header className="page-title page-title-minimal">
        <div>
          <p className="eyebrow">Profile</p>
          <h1>我的</h1>
        </div>

        <div className="button-row button-row-tight">
          <Link className="button-secondary" to="/workspace">
            工作台
          </Link>
          <Link className="button-ghost" to="/tasks">
            任务
          </Link>
        </div>
      </header>

      <section className="section-grid section-grid-wide">
        <article className="section-card">
          <h2>账户</h2>
          <dl className="kv-list">
            <div>
              <dt>用户名</dt>
              <dd>{session?.user.username || "-"}</dd>
            </div>
            <div>
              <dt>显示名称</dt>
              <dd>{session?.user.displayName || "-"}</dd>
            </div>
            <div>
              <dt>角色</dt>
              <dd>{session?.user.roles.join(" / ") || "-"}</dd>
            </div>
            <div>
              <dt>创建时间</dt>
              <dd>{formatDateTime(session?.createdAt || null)}</dd>
            </div>
          </dl>
        </article>

        <article className="section-card">
          <h2>常用</h2>
          <div className="button-row button-row-column">
            <button type="button" className="button-secondary" disabled>
              收藏
            </button>
            <button type="button" className="button-secondary" disabled>
              导出
            </button>
            <button type="button" className="button-ghost" disabled>
              提醒
            </button>
          </div>
        </article>
      </section>
    </div>
  );
}
