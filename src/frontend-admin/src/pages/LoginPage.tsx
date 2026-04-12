import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { ApiError } from "../lib/api";
import { checkAdminPermission, login } from "../lib/auth";
import { useAdminAuth } from "../context/AdminAuthContext";

function resolveRedirectTarget(value: unknown, fallback: string): string {
  if (
    value &&
    typeof value === "object" &&
    "from" in value &&
    typeof (value as { from?: unknown }).from === "string"
  ) {
    return (value as { from: string }).from;
  }

  return fallback;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { authenticate, session, status } = useAdminAuth();

  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const redirectTarget = resolveRedirectTarget(location.state, "/overview");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedAccount = account.trim();

    if (!normalizedAccount) {
      setErrorMessage("请输入管理员账号或邮箱。");
      return;
    }

    if (!password.trim()) {
      setErrorMessage("请输入密码。");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const payload = await login({
        account: normalizedAccount,
        password,
      });

      await checkAdminPermission(payload.access_token);
      authenticate(payload);
      navigate(redirectTarget, { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setErrorMessage("当前账号已登录成功，但没有管理员权限。");
      } else {
        setErrorMessage(
          error instanceof Error ? error.message : "管理员登录失败，请稍后重试。",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (status === "checking") {
    return (
      <div className="screen-state">
        <div className="screen-state-card">
          <p className="eyebrow">管理员登录</p>
          <h1>正在恢复管理员会话</h1>
          <p>当前会先检查浏览器里已有的 token，再决定是否进入管理端。</p>
        </div>
      </div>
    );
  }

  if (status === "authenticated") {
    return <Navigate to={redirectTarget} replace />;
  }

  return (
    <div className="public-page">
      <section className="auth-card">
        {/* <p className="eyebrow">管理员登录</p> */}
        {/* <h1>管理端已经接上真实管理员认证校验</h1> */}
        <h1>管理员登录</h1>
        {/* <p>
          当前页面会先调用 <code>/auth/login</code> 获取 token，再通过
          <code>/auth/admin-check</code> 校验管理员权限。通过后会写入本地会话，
          刷新时再由 <code>/auth/me</code> 恢复当前管理员信息。
        </p> */}

        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="field">
            <span>管理员账号或邮箱</span>
            <input
              value={account}
              onChange={(event) => setAccount(event.target.value)}
              placeholder="如：admin 或 admin@example.com"
              autoComplete="username"
            />
          </label>

          <label className="field">
            <span>密码</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入管理员密码"
              autoComplete="current-password"
            />
          </label>

          {/* <p className="field-hint">
            请使用 `src/.env` 与初始化脚本中创建的默认管理员账号登录。
          </p> */}

          {errorMessage ? (
            <p className="form-message form-message-error">{errorMessage}</p>
          ) : null}

          <div className="button-row">
            <button
              type="submit"
              className="button-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? "正在登录..." : "登录并进入管理端"}
            </button>
            <Link className="button-secondary" to="/">
              返回后台首页
            </Link>
          </div>
        </form>
      </section>

      <section className="section-grid">
        {/* <article className="section-card">
          <h2>当前已接通的内容</h2>
          <ul className="placeholder-list">
            <li>真实 `POST /auth/login` 管理员登录</li>
            <li>真实 `GET /auth/admin-check` 管理员权限校验</li>
            <li>刷新后通过 `GET /auth/me` 恢复当前管理员信息</li>
          </ul>
        </article> */}

        <article className="section-card">
          <h2>当前本地状态</h2>
          <p>
            {session
              ? `已存在管理员会话：${session.user.displayName || session.user.username}`
              : "当前还没有已保存的管理员会话。"}
          </p>
        </article>
      </section>
    </div>
  );
}
