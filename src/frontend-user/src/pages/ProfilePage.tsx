import { Link } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { formatDateTime } from "../lib/research";

const preferenceCards = [
  {
    title: "默认研究对象",
    value: "股票",
    note: "当前可运行链路优先聚焦股票研究。",
  },
  {
    title: "默认交付格式",
    value: "Markdown 报告",
    note: "PDF、Word 导出会在后续版本接入。",
  },
  {
    title: "结果提醒",
    value: "即将开放",
    note: "邮件、站内提醒和后续订阅能力已预留界面位置。",
  },
];

export function ProfilePage() {
  const { session } = useAuth();

  return (
    <div className="page-section">
      <header className="page-title profile-page-header">
        <div>
          <p className="eyebrow">个人空间</p>
          <h1>个人空间</h1>
          <p>
            这里承接账户信息、研究偏好、未来收藏资产与提醒配置。当前账户信息可用，更多个人化能力先按最终界面预留。
          </p>
        </div>

        <div className="button-row button-row-tight">
          <Link className="button-primary" to="/workspace">
            返回工作台
          </Link>
          <Link className="button-secondary" to="/tasks">
            查看任务中心
          </Link>
        </div>
      </header>

      <section className="section-grid section-grid-wide">
        <article className="section-card">
          <h2>账户信息</h2>
          <dl className="kv-list">
            <div>
              <dt>用户名</dt>
              <dd>{session?.user.username || "未登录"}</dd>
            </div>
            <div>
              <dt>显示名称</dt>
              <dd>{session?.user.displayName || "未设置"}</dd>
            </div>
            <div>
              <dt>角色</dt>
              <dd>{session?.user.roles.join(" / ") || "无"}</dd>
            </div>
            <div>
              <dt>账户状态</dt>
              <dd>{session?.user.status || "未知"}</dd>
            </div>
            <div>
              <dt>会话创建时间</dt>
              <dd>{formatDateTime(session?.createdAt || null)}</dd>
            </div>
            <div>
              <dt>会话过期时间</dt>
              <dd>{formatDateTime(session?.expiresAt || null)}</dd>
            </div>
          </dl>
        </article>

        <article className="section-card">
          <h2>研究偏好</h2>
          <div className="delivery-grid">
            {preferenceCards.map((item) => (
              <div key={item.title} className="delivery-card">
                <strong>{item.title}</strong>
                <span>{item.value}</span>
                <small>{item.note}</small>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="section-grid">
        <article className="section-card">
          <h2>个人资产</h2>
          <ul className="placeholder-list">
            <li>收藏报告与常用模板</li>
            <li>历史导出文件归档</li>
            <li>追问记录与共享视图</li>
          </ul>
        </article>

        <article className="section-card">
          <h2>提醒与协作</h2>
          <ul className="placeholder-list">
            <li>任务完成提醒</li>
            <li>价格或事件订阅</li>
            <li>与协作成员共享研究结果</li>
          </ul>
        </article>
      </section>
    </div>
  );
}
