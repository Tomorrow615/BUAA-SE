import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="screen-state">
      <div className="screen-state-card">
        <p className="eyebrow">管理端路由</p>
        <h1>这个后台页面还没有被规划到当前骨架里</h1>
        <p>
          当前 7-1 只先搭概览、模型、用户、任务、日志和管理员登录承接页。
        </p>
        <div className="button-row">
          <Link className="button-primary" to="/">
            返回后台首页
          </Link>
          <Link className="button-secondary" to="/overview">
            进入后台骨架
          </Link>
        </div>
      </div>
    </div>
  );
}
