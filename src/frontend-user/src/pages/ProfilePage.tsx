import { Link } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { formatDateTime } from "../lib/research";

export function ProfilePage() {
  const { session } = useAuth();

  return (
    <div className="page-section">
      <header className="page-title">
        <p className="eyebrow">个人中心</p>
        <h1>当前用户信息已经可以通过真实认证链路恢复</h1>
        <p>
          当前页已经承接真实登录后的用户资料展示，后续再补资料维护、
          历史报告、收藏和常用模型功能。
        </p>
        <div className="page-meta-line">
          <p className="field-hint">
            当前会话创建于：{formatDateTime(session?.createdAt || null)}
            ，过期时间：{formatDateTime(session?.expiresAt || null)}
          </p>
          <div className="button-row button-row-tight">
            <Link className="button-secondary" to="/workspace">
              前往工作台
            </Link>
            <Link className="button-ghost" to="/tasks">
              查看任务中心
            </Link>
          </div>
        </div>
      </header>

      <section className="section-grid">
        <article className="section-card">
          <h2>当前会话信息</h2>
          <dl className="kv-list">
            <div>
              <dt>用户名</dt>
              <dd>{session?.user.username || "未登录"}</dd>
            </div>
            <div>
              <dt>展示名</dt>
              <dd>{session?.user.displayName || "未设置"}</dd>
            </div>
            <div>
              <dt>角色</dt>
              <dd>{session?.user.roles.join(", ") || "无"}</dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>{session?.user.status || "无"}</dd>
            </div>
          </dl>
        </article>

        <article className="section-card">
          <h2>后续继续承接的内容</h2>
          <ul className="placeholder-list">
            <li>当前用户资料维护</li>
            <li>历史调研任务与历史报告入口</li>
            <li>收藏、偏好设置和常用模型</li>
          </ul>
        </article>
      </section>
    </div>
  );
}
