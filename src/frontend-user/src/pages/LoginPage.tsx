import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { login } from "../lib/auth";

const showcaseCards = [
  { title: "Research", caption: "统一研究工作台" },
  { title: "Tasks", caption: "任务与报告沉淀" },
  { title: "Agent", caption: "问答与继续追问" },
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
  const { authenticate, status } = useAuth();

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
          <h1>正在进入平台</h1>
        </div>
      </div>
    );
  }

  if (status === "authenticated") {
    return <Navigate to={redirectTarget} replace />;
  }

  return (
    <div className="public-page auth-page-shell auth-page-hero">
      <div className="auth-hero-layout">
        <section className="auth-stage auth-stage-user">
          <p className="eyebrow">DeepSearch Platform</p>
          <h1>商业对象深度研究平台</h1>
          <p className="auth-stage-copy">
            面向公司、股票与商品的一体化研究体验。
          </p>

          <div className="auth-stage-card-row">
            {showcaseCards.map((item) => (
              <article key={item.title} className="auth-stage-card">
                <strong>{item.title}</strong>
                <span>{item.caption}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="auth-card auth-card-hero">
          <div className="auth-card-head">
            <p className="eyebrow">Sign In</p>
            <h2>登录</h2>
          </div>

          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="field">
              <span>账号</span>
              <input
                value={account}
                onChange={(event) => setAccount(event.target.value)}
                placeholder="用户名或邮箱"
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
              <Link className="button-ghost" to="/register">
                注册
              </Link>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
