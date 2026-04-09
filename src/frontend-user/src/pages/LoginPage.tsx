import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { login } from "../lib/auth";

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
  const { authenticate, session, status } = useAuth();

  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const redirectTarget = resolveRedirectTarget(location.state, "/workspace");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedAccount = account.trim();

    if (!normalizedAccount) {
      setErrorMessage("请输入用户名或邮箱。");
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
      authenticate(payload);
      navigate(redirectTarget, { replace: true });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "登录失败，请稍后重试。",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (status === "checking") {
    return (
      <div className="screen-state">
        <div className="screen-state-card">
          <p className="eyebrow">用户登录</p>
          <h1>正在恢复用户会话</h1>
          <p>当前会先检查浏览器里已有的 token，再决定是否跳转到用户端。</p>
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
        <p className="eyebrow">用户登录</p>
        <h1>用户端已经接上真实登录接口</h1>
        <p>
          当前页面会直接调用 <code>/auth/login</code>，拿到 token 后写入本地会话，
          并在刷新时通过 <code>/auth/me</code> 恢复当前用户信息。
        </p>

        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="field">
            <span>账号或邮箱</span>
            <input
              value={account}
              onChange={(event) => setAccount(event.target.value)}
              placeholder="如：analyst01 或 user@example.com"
              autoComplete="username"
            />
          </label>

          <label className="field">
            <span>密码</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入密码"
              autoComplete="current-password"
            />
          </label>

          <p className="field-hint">
            后端允许使用用户名或邮箱登录，密码长度至少 8 位。
          </p>

          {errorMessage ? (
            <p className="form-message form-message-error">{errorMessage}</p>
          ) : null}

          <div className="button-row">
            <button
              type="submit"
              className="button-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? "正在登录..." : "登录并进入用户端"}
            </button>
            <Link className="button-secondary" to="/register">
              去注册账号
            </Link>
          </div>
        </form>
      </section>

      <section className="section-grid">
        <article className="section-card">
          <h2>当前已接通的内容</h2>
          <ul className="placeholder-list">
            <li>提交登录表单后调用真实 `/auth/login`</li>
            <li>token 会写入本地存储并进入受保护路由</li>
            <li>刷新后会通过 `/auth/me` 恢复用户信息</li>
          </ul>
        </article>

        <article className="section-card">
          <h2>当前本地状态</h2>
          <p>
            {session
              ? `已存在会话：${session.user.displayName || session.user.username}`
              : "当前还没有已保存的本地会话。"}
          </p>
        </article>
      </section>
    </div>
  );
}
