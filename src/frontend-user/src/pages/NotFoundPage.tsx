import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="screen-state">
      <div className="screen-state-card">
        <p className="eyebrow">用户端路由</p>
        <h1>这个页面还没有被规划到当前骨架里</h1>
        <p>
          当前用户端已经接通真实登录与注册，并先搭好了工作台、任务中心、
          个人中心和登录注册页。
        </p>
        <div className="button-row">
          <Link className="button-primary" to="/">
            返回首页
          </Link>
          <Link className="button-secondary" to="/workspace">
            进入用户端骨架
          </Link>
        </div>
      </div>
    </div>
  );
}
