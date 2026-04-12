import { Link } from "react-router-dom";

import { useAdminAuth } from "../context/AdminAuthContext";

export function AdminHomePage() {
  const { status } = useAdminAuth();

  return (
    <div className="public-page">
      <section className="hero-card">
        <h1>商业对象智能深度调研分析平台——管理端</h1>
        {/* <p>
          当前管理端已经完成真实管理员登录校验，以及概览、模型、用户、任务、日志等后台查询页面。
        </p> */}

        <div className="button-row">
          <Link className="button-primary" to="/login">
            进入管理员登录页
          </Link>
          {status === "authenticated" ? (
            <Link className="button-secondary" to="/overview">
              进入后台概览
            </Link>
          ) : null}
        </div>
      </section>

      {/* <section className="section-grid">
        <article className="section-card">
          <h2>这一步已经完成什么</h2>
          <ul className="placeholder-list">
            <li>完成真实管理员登录、权限校验与会话恢复</li>
            <li>完成概览、模型、用户、任务和日志查询骨架</li>
            <li>完成后台加载态、空状态、错误反馈和快捷入口收口</li>
            <li>完成第 7 步统一构建验收</li>
          </ul>
        </article>

        <article className="section-card">
          <h2>下一步接什么</h2>
          <ul className="placeholder-list">
            <li>第 8 步：继续补更完整的治理流程与操作位</li>
            <li>继续补后台更细的交互体验和展示增强</li>
            <li>再往后衔接更完整的 AI、报告和数据源能力</li>
          </ul>
        </article>
      </section> */}
    </div>
  );
}
