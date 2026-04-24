import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="screen-state">
      <div className="screen-state-card screen-state-card-rich">
        <p className="eyebrow">Admin Route</p>
        <h1>这个后台页面暂时还没有开放</h1>
        <p>
          当前管理端已经包含概览、模型、用户、任务、日志和管理员登录承接页，其余治理能力会继续沿着统一中台风格补齐。
        </p>
        <div className="button-row">
          <Link className="button-primary" to="/">
            返回后台首页
          </Link>
          <Link className="button-secondary" to="/overview">
            进入后台概览
          </Link>
          <Link className="button-ghost" to="/tasks">
            打开任务治理
          </Link>
        </div>
      </div>
    </div>
  );
}
