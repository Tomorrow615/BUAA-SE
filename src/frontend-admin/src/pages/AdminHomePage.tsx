import { Link } from "react-router-dom";

import { useAdminAuth } from "../context/AdminAuthContext";

const modules = ["概览", "模型", "用户", "任务", "日志"];

export function AdminHomePage() {
  const { status } = useAdminAuth();

  return (
    <div className="public-page admin-home-shell">
      <section className="hero-card admin-hero-card admin-hero-card-minimal">
        <div className="admin-hero-grid admin-hero-grid-minimal">
          <div className="admin-hero-copy">
            <p className="eyebrow">DeepSearch Admin</p>
            <h1>管理控制台</h1>
            <p>统一管理模型、用户、任务与日志。</p>

            <div className="button-row">
              <Link className="button-primary" to="/login">
                登录
              </Link>
              {status === "authenticated" ? (
                <Link className="button-secondary" to="/overview">
                  进入控制台
                </Link>
              ) : null}
            </div>
          </div>

          <div className="admin-home-module-grid">
            {modules.map((item) => (
              <article key={item} className="section-card admin-home-module-card">
                <h2>{item}</h2>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
