import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAdminAuth } from "../context/AdminAuthContext";

export function AdminRouteGuard() {
  const location = useLocation();
  const { status } = useAdminAuth();

  if (status === "checking") {
    return (
      <div className="screen-state">
        <div className="screen-state-card">
          <p className="eyebrow">管理端底座</p>
          <h1>正在检查管理员登录态</h1>
          <p>
            当前会先读取浏览器中的管理员 token，再决定是否进入后台治理界面。
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
