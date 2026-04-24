import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { useAdminAuth } from "../context/AdminAuthContext";
import { ApiError } from "../lib/api";
import { checkAdminPermission, login } from "../lib/auth";

const consoleCards = [
  { title: "Models", caption: "模型配置管理" },
  { title: "Users", caption: "用户与权限" },
  { title: "Tasks", caption: "任务与日志治理" },
];

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
  const { authenticate, status } = useAdminAuth();

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
        setErrorMessage("当前账号没有管理员权限。");
      } else {
        setErrorMessage(
          error instanceof Error ? error.message : "登录失败，请稍后重试。",
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
          <h1>正在进入控制台</h1>
        </div>
      </div>
    );
  }

  if (status === "authenticated") {
    return <Navigate to={redirectTarget} replace />;
  }

  return (
    <div className="public-page auth-page-shell auth-page-hero">
      <div className="auth-hero-layout auth-hero-layout-admin">
        <section className="auth-stage auth-stage-admin">
          <p className="eyebrow">DeepSearch Console</p>
          <h1>管理控制台</h1>
          <p className="auth-stage-copy">统一管理模型、用户、任务与日志。</p>

          <div className="auth-stage-card-row">
            {consoleCards.map((item) => (
              <article key={item.title} className="auth-stage-card auth-stage-card-dark">
                <strong>{item.title}</strong>
                <span>{item.caption}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="auth-card auth-card-hero auth-card-hero-dark">
          <div className="auth-card-head">
            <p className="eyebrow">Admin Sign In</p>
            <h2>登录</h2>
          </div>

          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="field">
              <span>账号</span>
              <input
                value={account}
                onChange={(event) => setAccount(event.target.value)}
                placeholder="管理员账号或邮箱"
                autoComplete="username"
              />
            </label>

            <label className="field">
              <span>密码</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="密码"
                autoComplete="current-password"
              />
            </label>

            {errorMessage ? (
              <p className="form-message form-message-error">{errorMessage}</p>
            ) : null}

            <div className="button-row auth-button-row">
              <button
                type="submit"
                className="button-primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? "登录中..." : "登录"}
              </button>
              <Link className="button-ghost" to="/">
                返回
              </Link>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
