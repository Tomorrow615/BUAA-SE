import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="screen-state">
      <div className="screen-state-card">
        <p className="eyebrow">页面状态</p>
        <h1>这个页面暂时还没有开放</h1>
        <p>
          当前用户端已经具备首页、工作台、任务中心、AI 助理、个人空间与登录注册等主要页面。
        </p>
        <div className="button-row">
          <Link className="button-primary" to="/">
            返回首页
          </Link>
          <Link className="button-secondary" to="/workspace">
            进入研究工作台
          </Link>
        </div>
      </div>
    </div>
  );
}
