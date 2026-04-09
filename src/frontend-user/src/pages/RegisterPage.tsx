import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { register } from "../lib/auth";

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
          <p className="eyebrow">用户注册</p>
          <h1>正在检查当前会话</h1>
          <p>如果浏览器里已经有有效 token，会直接进入用户端工作台。</p>
        </div>
      </div>
    );
  }

  if (status === "authenticated") {
    return <Navigate to="/workspace" replace />;
  }

  return (
    <div className="public-page">
      <section className="auth-card">
        <p className="eyebrow">用户注册</p>
        <h1>用户端已经接上真实注册接口</h1>
        <p>
          当前页面会直接调用 <code>/auth/register</code>。注册成功后会立即保存
          token，并进入用户端工作台。
        </p>

        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="field">
            <span>用户名</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="如：analyst01"
              autoComplete="username"
            />
          </label>

          <label className="field">
            <span>展示名</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="如：市场分析师（可选）"
            />
          </label>

          <label className="field">
            <span>邮箱</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="如：user@example.com"
              autoComplete="email"
            />
          </label>

          <label className="field">
            <span>密码</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 8 位"
              autoComplete="new-password"
            />
          </label>

          <label className="field">
            <span>确认密码</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="请再次输入密码"
              autoComplete="new-password"
            />
          </label>

          <p className="field-hint">
            注册接口会自动分配普通用户角色，并返回可直接使用的访问 token。
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
              {isSubmitting ? "正在注册..." : "注册并进入用户端"}
            </button>
            <Link className="button-secondary" to="/login">
              返回登录页
            </Link>
          </div>
        </form>
      </section>
    </div>
  );
}
