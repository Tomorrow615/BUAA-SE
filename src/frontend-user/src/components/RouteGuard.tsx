import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

export function RouteGuard() {
  const location = useLocation();
  const { status } = useAuth();

  if (status === "checking") {
    return (
      <div className="screen-state">
        <div className="screen-state-card">
          <p className="eyebrow">用户端底座</p>
          <h1>正在检查本地登录态</h1>
          <p>
            当前会先读取浏览器里已有的会话，再决定是否进入用户端骨架。
          </p>
        </div>
      </div>
    );
  }

  if (status === "anonymous") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
