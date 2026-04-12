import { Link } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

export function HomePage() {
  const { status } = useAuth();

  return (
    <div className="public-page">
      <section className="hero-card">
        {/* <p className="eyebrow">第 7 步 · 用户端页面骨架已完成</p> */}
        {/* <h1>用户端已经完成主链路接通与阶段验收</h1> */}
        {/* <p>
          当前用户端已经完成真实登录注册、任务创建、任务列表、任务详情、状态轮询和体验收口。
          这一阶段的目标是把可演示、可联调、可继续扩展的页面骨架正式搭稳。
        </p> */}
        <h1>商业对象智能深度调研分析平台——用户端</h1>

        <div className="button-row">
          {status === "authenticated" ? (
            <Link className="button-primary" to="/workspace">
              进入调研工作台
            </Link>
          ) : (
            <Link className="button-primary" to="/login">
              去登录
            </Link>
          )}
          <Link className="button-secondary" to="/tasks">
            查看任务中心
          </Link>
          {status === "authenticated" ? (
            <Link className="button-ghost" to="/profile">
              查看个人中心
            </Link>
          ) : (
            <Link className="button-ghost" to="/register">
              去注册
            </Link>
          )}
        </div>
      </section>

      {/* <section className="section-grid">
        <article className="section-card">
          <h2>这一步已经完成什么</h2>
          <ul className="placeholder-list">
            <li>完成真实登录、注册与当前用户恢复</li>
            <li>完成调研工作台、任务中心和任务详情主链路</li>
            <li>完成加载态、空状态、错误反馈和快捷入口收口</li>
            <li>完成第 7 步统一构建验收</li>
          </ul>
        </article>

        <article className="section-card">
          <h2>下一步接什么</h2>
          <ul className="placeholder-list">
            <li>第 8 步：继续补 AI、真实数据源和展示增强能力</li>
            <li>继续补前后台更细的交互体验和视觉强化</li>
            <li>再往后衔接更完整的分析、报告和治理能力</li>
          </ul>
        </article>
      </section> */}
    </div>
  );
}
