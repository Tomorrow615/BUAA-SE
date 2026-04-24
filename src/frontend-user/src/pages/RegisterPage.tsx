import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { register } from "../lib/auth";

const registrationCards = [
  { title: "Workspace", caption: "创建研究任务" },
  { title: "Reports", caption: "沉淀分析结果" },
  { title: "Follow-up", caption: "继续追问与协作" },
];

export function RegisterPage() {
  const navigate = useNavigate();
  const { authenticate, status } = useAuth();

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedUsername = username.trim();
    const normalizedEmail = email.trim();
    const normalizedDisplayName = displayName.trim();

    if (normalizedUsername.length < 3) {
      setErrorMessage("用户名至少需要 3 个字符。");
      return;
    }

    if (normalizedEmail.length < 5) {
      setErrorMessage("请输入有效邮箱。");
      return;
    }

    if (password.length < 8) {
      setErrorMessage("密码至少需要 8 位。");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("两次输入的密码不一致。");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const payload = await register({
        username: normalizedUsername,
        email: normalizedEmail,
        password,
        displayName: normalizedDisplayName || undefined,
      });
      authenticate(payload);
      navigate("/workspace", { replace: true });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "注册失败，请稍后重试。",
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
    return <Navigate to="/workspace" replace />;
  }

  return (
    <div className="public-page auth-page-shell auth-page-hero">
      <div className="auth-hero-layout">
        <section className="auth-stage auth-stage-user">
          <p className="eyebrow">DeepSearch Platform</p>
          <h1>创建研究账号</h1>
          <p className="auth-stage-copy">进入统一研究工作台，开始新的分析任务。</p>

          <div className="auth-stage-card-row">
            {registrationCards.map((item) => (
              <article key={item.title} className="auth-stage-card">
                <strong>{item.title}</strong>
                <span>{item.caption}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="auth-card auth-card-hero">
          <div className="auth-card-head">
            <p className="eyebrow">Create Account</p>
            <h2>注册</h2>
          </div>

          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="field">
              <span>用户名</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="用户名"
                autoComplete="username"
              />
            </label>

            <label className="field">
              <span>显示名称</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="显示名称"
              />
            </label>

            <label className="field">
              <span>邮箱</span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="邮箱"
                autoComplete="email"
              />
            </label>

            <label className="field">
              <span>密码</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="密码"
                autoComplete="new-password"
              />
            </label>

            <label className="field">
              <span>确认密码</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="确认密码"
                autoComplete="new-password"
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
                {isSubmitting ? "注册中..." : "注册"}
              </button>
              <Link className="button-ghost" to="/login">
                登录
              </Link>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
